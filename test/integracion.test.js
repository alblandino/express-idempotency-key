const assert = require('assert');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  idempotencia,
  AlmacenamientoMemoria,
  AlmacenamientoMongo,
  ErrorDeConfiguracion,
  ErrorDeAlmacenamiento
} = require('../src');

function esperar(milisegundos) {
  return new Promise(resolver => setTimeout(resolver, milisegundos));
}

function llaveNueva() {
  return crypto.randomBytes(16).toString('hex');
}

// app de pagos que cuenta cuantas veces se ejecuto cada handler
function crearApp(almacenamiento, opciones = {}) {
  const app = express();
  const estado = { pagos: 0, consultas: 0, fallosPendientes: 0 };

  app.use(express.json());
  app.use(idempotencia({
    almacenamiento,
    alcance: req => req.headers['x-usuario'] || '',
    ...opciones
  }));

  app.post('/pagos', async (req, res) => {
    estado.pagos++;
    await esperar(req.body.demora || 0);

    if (estado.fallosPendientes > 0) {
      estado.fallosPendientes--;
      return res.status(500).json({ error: 'el banco no respondio' });
    }
    res.status(201).location('/pagos/' + estado.pagos).json({ id: estado.pagos, monto: req.body.monto });
  });

  app.get('/pagos', (req, res) => {
    estado.consultas++;
    res.json({ pagos: estado.pagos });
  });

  return { app, estado };
}

async function iniciar(app) {
  const servidor = app.listen(0);
  await new Promise(resolver => servidor.once('listening', resolver));
  return { url: 'http://127.0.0.1:' + servidor.address().port, servidor };
}

async function pagar(url, llave, cuerpo, cabeceras = {}) {
  if (llave) {
    cabeceras['Idempotency-Key'] = llave;
  }
  const respuesta = await fetch(url + '/pagos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo)
  });
  return { respuesta, cuerpo: await respuesta.json() };
}

function probarConAlmacenamiento(nombre, abrir, cerrar) {
  describe('con almacenamiento en ' + nombre, () => {
    let almacenamiento;
    const servidores = [];

    async function levantar(opciones) {
      const { app, estado } = crearApp(almacenamiento, opciones);
      const { url, servidor } = await iniciar(app);
      servidores.push(servidor);
      return { url, estado };
    }

    before(async () => {
      almacenamiento = await abrir();
    });

    after(async () => {
      for (const servidor of servidores) {
        servidor.close();
      }
      await cerrar(almacenamiento);
    });

    it('repite la misma respuesta cuando llega la misma llave', async () => {
      const { url, estado } = await levantar();
      const llave = llaveNueva();

      const primera = await pagar(url, llave, { monto: 500 });
      const segunda = await pagar(url, llave, { monto: 500 });

      assert.strictEqual(estado.pagos, 1);
      assert.strictEqual(primera.respuesta.status, 201);
      assert.strictEqual(segunda.respuesta.status, 201);
      assert.deepStrictEqual(segunda.cuerpo, primera.cuerpo);
      assert.strictEqual(segunda.respuesta.headers.get('location'), '/pagos/1');
      assert.strictEqual(primera.respuesta.headers.get('idempotent-replayed'), null);
      assert.strictEqual(segunda.respuesta.headers.get('idempotent-replayed'), 'true');
    });

    it('ejecuta una sola vez las peticiones que llegan al mismo tiempo', async () => {
      const { url, estado } = await levantar();
      const llave = llaveNueva();

      const resultados = await Promise.all(
        Array.from({ length: 10 }, () => pagar(url, llave, { monto: 500, demora: 200 }))
      );
      const estados = resultados.map(resultado => resultado.respuesta.status);

      assert.strictEqual(estado.pagos, 1);
      assert.strictEqual(estados.filter(codigo => codigo === 201).length, 1);
      assert.strictEqual(estados.filter(codigo => codigo === 409).length, 9);

      const rechazada = resultados.find(resultado => resultado.respuesta.status === 409);
      assert.strictEqual(rechazada.respuesta.headers.get('retry-after'), '1');
    });

    it('rechaza la misma llave con otro cuerpo', async () => {
      const { url, estado } = await levantar();
      const llave = llaveNueva();

      await pagar(url, llave, { monto: 500 });
      const otra = await pagar(url, llave, { monto: 900 });

      assert.strictEqual(otra.respuesta.status, 422);
      assert.strictEqual(estado.pagos, 1);
    });

    it('da la misma huella aunque las propiedades vengan en otro orden', async () => {
      const { url, estado } = await levantar();
      const llave = llaveNueva();

      await pagar(url, llave, { monto: 500, moneda: 'DOP' });
      const segunda = await pagar(url, llave, { moneda: 'DOP', monto: 500 });

      assert.strictEqual(segunda.respuesta.status, 201);
      assert.strictEqual(estado.pagos, 1);
    });

    it('libera la llave cuando el handler responde con error 500', async () => {
      const { url, estado } = await levantar();
      const llave = llaveNueva();
      estado.fallosPendientes = 1;

      const fallida = await pagar(url, llave, { monto: 500 });
      const reintento = await pagar(url, llave, { monto: 500 });

      assert.strictEqual(fallida.respuesta.status, 500);
      assert.strictEqual(reintento.respuesta.status, 201);
      assert.strictEqual(reintento.respuesta.headers.get('idempotent-replayed'), null);
      assert.strictEqual(estado.pagos, 2);
    });

    it('no toca las peticiones que no traen llave', async () => {
      const { url, estado } = await levantar();

      await pagar(url, null, { monto: 500 });
      await pagar(url, null, { monto: 500 });

      assert.strictEqual(estado.pagos, 2);
    });

    it('no toca los metodos que no estan configurados', async () => {
      const { url, estado } = await levantar();
      const llave = llaveNueva();

      await fetch(url + '/pagos', { headers: { 'Idempotency-Key': llave } });
      await fetch(url + '/pagos', { headers: { 'Idempotency-Key': llave } });

      assert.strictEqual(estado.consultas, 2);
    });

    it('separa las llaves de cada cliente con el alcance', async () => {
      const { url, estado } = await levantar();
      const llave = llaveNueva();

      const deAna = await pagar(url, llave, { monto: 500 }, { 'x-usuario': 'ana' });
      const deLuis = await pagar(url, llave, { monto: 500 }, { 'x-usuario': 'luis' });

      assert.strictEqual(estado.pagos, 2);
      assert.notStrictEqual(deAna.cuerpo.id, deLuis.cuerpo.id);
    });

    it('vuelve a ejecutar cuando la llave vence', async () => {
      const { url, estado } = await levantar({ duracion: 100 });
      const llave = llaveNueva();

      await pagar(url, llave, { monto: 500 });
      await esperar(150);
      const despues = await pagar(url, llave, { monto: 500 });

      assert.strictEqual(despues.respuesta.headers.get('idempotent-replayed'), null);
      assert.strictEqual(estado.pagos, 2);
    });

    it('una peticion que se paso del tiempo de bloqueo no pisa a la siguiente', async () => {
      const errores = [];
      const { url, estado } = await levantar({ tiempoBloqueo: 100, alFallar: error => errores.push(error) });
      const llave = llaveNueva();

      // la primera tarda mas que el bloqueo, asi que la segunda puede reservar la llave
      const lenta = pagar(url, llave, { monto: 500, demora: 300 });
      await esperar(150);
      const segunda = await pagar(url, llave, { monto: 500, demora: 300 });
      await lenta;

      const repetida = await pagar(url, llave, { monto: 500, demora: 300 });

      assert.strictEqual(estado.pagos, 2);
      assert.deepStrictEqual(repetida.cuerpo, segunda.cuerpo);
      assert.strictEqual(errores.length, 1);
      assert.ok(errores[0] instanceof ErrorDeAlmacenamiento);
    });

    it('exige la llave cuando es obligatoria', async () => {
      const { url, estado } = await levantar({ obligatoria: true });

      const sinLlave = await pagar(url, null, { monto: 500 });

      assert.strictEqual(sinLlave.respuesta.status, 400);
      assert.strictEqual(estado.pagos, 0);
    });

    it('rechaza llaves de mas de 255 caracteres', async () => {
      const { url, estado } = await levantar();

      const larga = await pagar(url, 'x'.repeat(256), { monto: 500 });

      assert.strictEqual(larga.respuesta.status, 400);
      assert.strictEqual(estado.pagos, 0);
    });
  });
}

probarConAlmacenamiento(
  'memoria',
  async () => new AlmacenamientoMemoria(),
  async almacenamiento => almacenamiento.cerrar()
);

let servidorMongo;
let clienteMongo;

probarConAlmacenamiento(
  'mongo',
  async () => {
    servidorMongo = await MongoMemoryServer.create();
    clienteMongo = await MongoClient.connect(servidorMongo.getUri());
    const almacenamiento = new AlmacenamientoMongo(clienteMongo.db('pruebas').collection('idempotencia'));
    await almacenamiento.crearIndices();
    return almacenamiento;
  },
  async () => {
    await clienteMongo.close();
    await servidorMongo.stop();
  }
);

describe('opciones', () => {
  it('valida las opciones al crear el middleware', () => {
    assert.throws(() => idempotencia({ duracion: -1 }), ErrorDeConfiguracion);
    assert.throws(() => idempotencia({ metodos: [] }), ErrorDeConfiguracion);
    assert.throws(() => idempotencia({ almacenamiento: { reservar() {} } }), /no tiene el metodo guardar/);
    assert.throws(() => idempotencia({ alcance: 'usuario' }), /alcance tiene que ser una funcion/);
  });
});
