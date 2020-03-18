const crearOpciones = require('../configuracion/crear-opciones');
const capturarRespuesta = require('../respuesta/capturar-respuesta');
const { crearRespuestaGuardada, repetirRespuesta, responderError } = require('../respuesta/respuestas');
const { leerLlave, esLlaveValida, llaveDeAlmacenamiento, LARGO_MAXIMO } = require('../peticion/llave');
const { crearRegistroEnProceso, crearRegistroCompletado, estaEnProceso } = require('../comun/registro');
const { ErrorDeAlmacenamiento } = require('../comun/errores');

const SEGUNDOS_PARA_REINTENTAR = 1;

function idempotencia(opcionesDelUsuario) {
  const opciones = crearOpciones(opcionesDelUsuario);

  return function middlewareDeIdempotencia(req, res, next) {
    procesar(req, res, next, opciones).catch(next);
  };
}

async function procesar(req, res, next, opciones) {
  if (!opciones.metodos.includes(req.method)) {
    return next();
  }

  const llave = leerLlave(req, opciones.cabecera);
  if (llave === null) {
    if (opciones.obligatoria) {
      return responderError(res, 400, 'Falta la cabecera ' + opciones.cabecera);
    }
    return next();
  }
  if (!esLlaveValida(llave)) {
    return responderError(res, 400, 'La cabecera ' + opciones.cabecera + ' tiene que tener entre 1 y ' + LARGO_MAXIMO + ' caracteres');
  }

  const alcance = await opciones.alcance(req);
  const llaveGuardada = llaveDeAlmacenamiento(alcance === undefined || alcance === null ? '' : String(alcance), llave);
  const registro = crearRegistroEnProceso(await opciones.huella(req));

  const existente = await opciones.almacenamiento.reservar(llaveGuardada, registro, opciones.tiempoBloqueo);
  if (existente) {
    return responderConElRegistroExistente(res, existente, registro.huella);
  }

  capturarRespuesta(res, cuerpo => terminar(res, cuerpo, llaveGuardada, registro, opciones));
  next();
}

function responderConElRegistroExistente(res, existente, huella) {
  if (existente.huella !== huella) {
    return responderError(res, 422, 'La llave ya se uso con otra peticion');
  }
  if (estaEnProceso(existente)) {
    res.setHeader('Retry-After', String(SEGUNDOS_PARA_REINTENTAR));
    return responderError(res, 409, 'Hay otra peticion con la misma llave en proceso');
  }
  repetirRespuesta(res, existente.respuesta);
}

// se llama cuando el handler ya respondio, antes de que la respuesta salga.
// si la respuesta no se puede repetir se libera la llave para que el cliente reintente
async function terminar(res, cuerpo, llave, registro, opciones) {
  try {
    if (!opciones.guardarSi(res.statusCode)) {
      await opciones.almacenamiento.liberar(llave, registro.token);
      return;
    }

    const completado = crearRegistroCompletado(registro, crearRespuestaGuardada(res, cuerpo));
    const guardado = await opciones.almacenamiento.guardar(llave, completado, opciones.duracion);
    if (!guardado) {
      opciones.alFallar(new ErrorDeAlmacenamiento('La llave ' + llave + ' vencio antes de que la peticion terminara, hay que subir tiempoBloqueo'));
    }
  } catch (error) {
    // la respuesta ya esta hecha y no se puede cambiar por esto, solo se avisa
    opciones.alFallar(error);
  }
}

module.exports = idempotencia;
