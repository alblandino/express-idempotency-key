class ErrorDeConfiguracion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeConfiguracion';
  }
}

class ErrorDeAlmacenamiento extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeAlmacenamiento';
  }
}

module.exports = { ErrorDeConfiguracion, ErrorDeAlmacenamiento };
