const express = require('express');
const fetch = require('node-fetch');
const { idempotencia, AlmacenamientoMemoria } = require('../src');

const TOTAL_PAGOS = 1000;
const PROBABILIDAD_DE_PERDER_LA_RESPUESTA = 0.3;
const MAXIMO_DE_INTENTOS = 5;
const PAGOS_EN_PARALELO = 50;

function crearServidor(conIdempotencia) {
  const app = express();
  const cobros = [];

  app.use(express.json());
  if (conIdempotencia) {
    app.use(idempotencia({ almacenamiento: new AlmacenamientoMemoria() }));
  }

  app.post('/pagos', (req, res) => {
    cobros.push(req.body.pagoId);
    res.status(201).json({ cobro: cobros.length });
  });

  return new Promise(resolver => {
    const servidor = app.listen(0, () => resolver({ servidor, cobros }));
  });
}

async function pagarConReintentos(url, pagoId) {
  let intentos = 0;
  let llegoLaRespuesta = false;

  while (!llegoLaRespuesta && intentos < MAXIMO_DE_INTENTOS) {
    await fetch(url + '/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'pago-' + pagoId },
      body: JSON.stringify({ pagoId, monto: 100 })
    });
    intentos++;
    llegoLaRespuesta = Math.random() > PROBABILIDAD_DE_PERDER_LA_RESPUESTA;
  }

  return intentos - 1;
}

async function correr(conIdempotencia) {
  const { servidor, cobros } = await crearServidor(conIdempotencia);
  const url = 'http://127.0.0.1:' + servidor.address().port;
  let reintentos = 0;

  for (let inicio = 0; inicio < TOTAL_PAGOS; inicio += PAGOS_EN_PARALELO) {
    const lote = [];
    for (let pagoId = inicio; pagoId < inicio + PAGOS_EN_PARALELO; pagoId++) {
      lote.push(pagarConReintentos(url, pagoId));
    }
    const reintentosDelLote = await Promise.all(lote);
    reintentos += reintentosDelLote.reduce((total, cantidad) => total + cantidad, 0);
  }

  servidor.close();
  return { cobros: cobros.length, reintentos, duplicados: cobros.length - TOTAL_PAGOS };
}

async function main() {
  const sin = await correr(false);
  const con = await correr(true);

  console.log('pagos enviados:', TOTAL_PAGOS);
  console.log('');
  console.log('                    cobros   reintentos   duplicados');
  console.log('sin idempotencia', String(sin.cobros).padStart(9), String(sin.reintentos).padStart(12), String(sin.duplicados).padStart(12));
  console.log('con idempotencia', String(con.cobros).padStart(9), String(con.reintentos).padStart(12), String(con.duplicados).padStart(12));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
