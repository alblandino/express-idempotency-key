const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fetch = require('node-fetch');
const { AlmacenamientoMongo } = require('../src');
const crearAppDePagos = require('./app-pagos');

function iniciar(app) {
  return new Promise(resolver => {
    const servidor = app.listen(0, () => resolver(servidor));
  });
}

function direccion(servidor) {
  return 'http://127.0.0.1:' + servidor.address().port;
}

async function pagar(url, llave, monto) {
  const respuesta = await fetch(url + '/pagos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': llave, 'x-cliente': 'ana' },
    body: JSON.stringify({ monto })
  });
  const cuerpo = await respuesta.json();
  const repetida = respuesta.headers.get('idempotent-replayed') ? ' (repetida)' : '';
  return respuesta.status + ' ' + JSON.stringify(cuerpo) + repetida;
}

async function main() {
  const servidorMongo = await MongoMemoryServer.create();
  const cliente = await MongoClient.connect(servidorMongo.getUri());

  // las dos instancias usan la misma coleccion, como si estuvieran detras de un balanceador
  const almacenamiento = new AlmacenamientoMongo(cliente.db('pagos').collection('idempotencia'));
  await almacenamiento.crearIndices();

  const cobros = [];
  const instancia1 = await iniciar(crearAppDePagos('instancia-1', almacenamiento, cobros));
  const instancia2 = await iniciar(crearAppDePagos('instancia-2', almacenamiento, cobros));
  const url1 = direccion(instancia1);
  const url2 = direccion(instancia2);

  console.log('1. primer intento en instancia-1');
  console.log('   ', await pagar(url1, 'pago-001', 500));

  console.log('2. el cliente no recibio la respuesta y reintenta, el balanceador lo manda a instancia-2');
  console.log('   ', await pagar(url2, 'pago-001', 500));

  console.log('3. misma llave con otro monto');
  console.log('   ', await pagar(url1, 'pago-001', 900));

  console.log('4. cinco peticiones al mismo tiempo con una llave nueva, repartidas entre las dos instancias');
  const resultados = await Promise.all([url1, url2, url1, url2, url1].map(url => pagar(url, 'pago-002', 300)));
  for (const resultado of resultados) {
    console.log('   ', resultado);
  }

  console.log('5. los que recibieron 409 esperan el Retry-After y reintentan');
  await new Promise(resolver => setTimeout(resolver, 1000));
  console.log('   ', await pagar(url2, 'pago-002', 300));

  console.log('\ncobros hechos:', cobros.length);
  for (const cobro of cobros) {
    console.log('   ', cobro);
  }

  instancia1.close();
  instancia2.close();
  await cliente.close();
  await servidorMongo.stop();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
