const idempotencia = require('./middleware/idempotencia');
const AlmacenamientoMemoria = require('./almacenamiento/almacenamiento-memoria');
const { ErrorDeConfiguracion, ErrorDeAlmacenamiento } = require('./comun/errores');

module.exports = {
  idempotencia,
  AlmacenamientoMemoria,
  ErrorDeConfiguracion,
  ErrorDeAlmacenamiento
};
