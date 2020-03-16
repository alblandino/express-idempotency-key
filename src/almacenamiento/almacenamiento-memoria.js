const UN_MINUTO = 60 * 1000;

// guarda los registros en un Map. sirve para una sola instancia de la aplicacion,
// si hay varias detras de un balanceador hay que usar un almacenamiento compartido como mongo
class AlmacenamientoMemoria {
  constructor({ intervaloLimpieza = UN_MINUTO } = {}) {
    this.registros = new Map();

    // los vencidos se borran cuando alguien los pide, esto es para los que nadie vuelve a pedir
    this.temporizador = setInterval(() => this.limpiarVencidos(), intervaloLimpieza);
    this.temporizador.unref();
  }

  // devuelve null si la llave quedo reservada o el registro que ya tenia.
  // entre leer y escribir no hay ningun await, asi que dos peticiones no pueden reservar la misma llave
  async reservar(llave, registro, duracion) {
    const existente = this.obtenerVigente(llave);
    if (existente) {
      return existente;
    }
    this.registros.set(llave, { registro, expiraEn: Date.now() + duracion });
    return null;
  }

  // solo guarda si la llave sigue siendo de la peticion que la reservo
  async guardar(llave, registro, duracion) {
    if (!this.tieneToken(llave, registro.token)) {
      return false;
    }
    this.registros.set(llave, { registro, expiraEn: Date.now() + duracion });
    return true;
  }

  async liberar(llave, token) {
    if (this.tieneToken(llave, token)) {
      this.registros.delete(llave);
    }
  }

  tieneToken(llave, token) {
    const entrada = this.registros.get(llave);
    return Boolean(entrada) && entrada.registro.token === token;
  }

  obtenerVigente(llave) {
    const entrada = this.registros.get(llave);
    if (!entrada) {
      return null;
    }
    if (entrada.expiraEn <= Date.now()) {
      this.registros.delete(llave);
      return null;
    }
    return entrada.registro;
  }

  limpiarVencidos() {
    const ahora = Date.now();
    for (const [llave, entrada] of this.registros) {
      if (entrada.expiraEn <= ahora) {
        this.registros.delete(llave);
      }
    }
  }

  cerrar() {
    clearInterval(this.temporizador);
  }
}

module.exports = AlmacenamientoMemoria;
