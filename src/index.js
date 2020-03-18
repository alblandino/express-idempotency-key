const idempotencia = require('./middleware/idempotencia');
const AlmacenamientoMemoria = require('./almacenamiento/almacenamiento-memoria');
const AlmacenamientoMongo = require('./almacenamiento/almacenamiento-mongo');
const { ErrorDeConfiguracion, ErrorDeAlmacenamiento } = require('./comun/errores');

module.exports = {
  idempotencia,
  AlmacenamientoMemoria,
  AlmacenamientoMongo,
  ErrorDeConfiguracion,
  ErrorDeAlmacenamiento
};
