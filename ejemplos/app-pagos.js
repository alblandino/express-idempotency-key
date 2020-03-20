const express = require('express');
const { idempotencia } = require('../src');

// una api de pagos normal. lo unico de la libreria es el app.use(idempotencia(...))
function crearAppDePagos(nombreInstancia, almacenamiento, cobros) {
  const app = express();

  app.use(express.json());
  app.use(idempotencia({
    almacenamiento,
    obligatoria: true,
    // en una app real seria el usuario autenticado
    alcance: req => req.headers['x-cliente']
  }));

  app.post('/pagos', async (req, res) => {
    // simula lo que tarda el banco en confirmar
    await new Promise(resolver => setTimeout(resolver, 100));

    const pago = { id: cobros.length + 1, monto: req.body.monto, cobradoPor: nombreInstancia };
    cobros.push(pago);
    res.status(201).json(pago);
  });

  return app;
}

module.exports = crearAppDePagos;
