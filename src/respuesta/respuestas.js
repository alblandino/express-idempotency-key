// dependen de la conexion o del momento en que se respondio, no tiene sentido repetirlas
const CABECERAS_QUE_NO_SE_GUARDAN = ['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'date'];

// el cuerpo se guarda en base64 para que cualquier tipo de respuesta quede igual
function crearRespuestaGuardada(res, cuerpo) {
  const cabeceras = {};
  for (const [nombre, valor] of Object.entries(res.getHeaders())) {
    if (!CABECERAS_QUE_NO_SE_GUARDAN.includes(nombre)) {
      cabeceras[nombre] = valor;
    }
  }
  return { estado: res.statusCode, cabeceras, cuerpo: cuerpo.toString('base64') };
}

function repetirRespuesta(res, respuesta) {
  res.statusCode = respuesta.estado;
  for (const [nombre, valor] of Object.entries(respuesta.cabeceras)) {
    res.setHeader(nombre, valor);
  }
  res.setHeader('Idempotent-Replayed', 'true');
  res.end(Buffer.from(respuesta.cuerpo, 'base64'));
}

function responderError(res, estado, mensaje) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: mensaje }));
}

module.exports = { crearRespuestaGuardada, repetirRespuesta, responderError };
