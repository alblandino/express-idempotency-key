const CODIGO_LLAVE_DUPLICADA = 11000;

// guarda los registros en una coleccion de mongo para que todas las instancias de la aplicacion
// vean las mismas llaves. recibe la coleccion del driver oficial, por ejemplo db.collection('idempotencia')
class AlmacenamientoMongo {
  constructor(coleccion) {
    this.coleccion = coleccion;
  }

  // con este indice mongo borra solo los registros vencidos (lo revisa mas o menos cada minuto).
  // mientras no los borra no molestan porque las consultas ya revisan expiraEn
  async crearIndices() {
    await this.coleccion.createIndex({ expiraEn: 1 }, { expireAfterSeconds: 0 });
  }

  async reservar(llave, registro, duracion) {
    if (await this.intentarReservar(llave, registro, duracion)) {
      return null;
    }

    const existente = await this.obtenerVigente(llave);
    // si lo liberaron justo entre los dos pasos se intenta de nuevo
    return existente || this.reservar(llave, registro, duracion);
  }

  // el filtro solo encuentra el registro si ya vencio, y en ese caso lo reemplaza.
  // si existe y no ha vencido, el upsert trata de insertar otro con el mismo _id y mongo lo rechaza.
  // asi la reserva es una sola operacion y dos instancias no pueden ganarla las dos
  async intentarReservar(llave, registro, duracion) {
    const ahora = new Date();
    try {
      await this.coleccion.replaceOne(
        { _id: llave, expiraEn: { $lte: ahora } },
        { ...registro, expiraEn: new Date(ahora.getTime() + duracion) },
        { upsert: true }
      );
      return true;
    } catch (error) {
      if (error.code === CODIGO_LLAVE_DUPLICADA) {
        return false;
      }
      throw error;
    }
  }

  // solo guarda si la llave sigue siendo de la peticion que la reservo
  async guardar(llave, registro, duracion) {
    const resultado = await this.coleccion.replaceOne(
      { _id: llave, token: registro.token },
      { ...registro, expiraEn: new Date(Date.now() + duracion) }
    );
    return resultado.matchedCount === 1;
  }

  async liberar(llave, token) {
    await this.coleccion.deleteOne({ _id: llave, token });
  }

  obtenerVigente(llave) {
    return this.coleccion.findOne(
      { _id: llave, expiraEn: { $gt: new Date() } },
      { projection: { _id: 0, expiraEn: 0 } }
    );
  }
}

module.exports = AlmacenamientoMongo;
