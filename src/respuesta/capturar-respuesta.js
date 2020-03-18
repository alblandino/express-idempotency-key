// envuelve res.write y res.end para quedarse con una copia del cuerpo.
// cuando el handler termina se llama a alTerminar y la respuesta no sale hasta que alTerminar acaba,
// asi un reintento que llegue justo despues ya encuentra la respuesta guardada
function capturarRespuesta(res, alTerminar) {
  const partes = [];
  const escribirOriginal = res.write;
  const terminarOriginal = res.end;
  let terminada = false;

  res.write = function (...argumentos) {
    agregarParte(partes, argumentos[0], argumentos[1]);
    return escribirOriginal.apply(res, argumentos);
  };

  res.end = function (...argumentos) {
    if (terminada) {
      return terminarOriginal.apply(res, argumentos);
    }
    terminada = true;
    agregarParte(partes, argumentos[0], argumentos[1]);

    alTerminar(Buffer.concat(partes)).finally(() => terminarOriginal.apply(res, argumentos));
    return res;
  };
}

// res.end(callback) y res.end() no traen cuerpo
function agregarParte(partes, parte, codificacion) {
  if (parte === undefined || parte === null || typeof parte === 'function') {
    return;
  }
  if (parte instanceof Uint8Array) {
    partes.push(Buffer.from(parte));
    return;
  }
  partes.push(Buffer.from(String(parte), typeof codificacion === 'string' ? codificacion : 'utf8'));
}

module.exports = capturarRespuesta;
