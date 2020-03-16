const crypto = require('crypto');

const EN_PROCESO = 'en_proceso';
const COMPLETADA = 'completada';

// lo que se guarda por cada llave. el token identifica a la peticion que reservo la llave,
// asi una peticion vieja no puede pisar el registro de otra
function crearRegistroEnProceso(huella) {
  return {
    estado: EN_PROCESO,
    huella,
    token: crypto.randomBytes(16).toString('hex'),
    creadoEn: Date.now()
  };
}

function crearRegistroCompletado(registro, respuesta) {
  return { ...registro, estado: COMPLETADA, respuesta };
}

function estaEnProceso(registro) {
  return registro.estado === EN_PROCESO;
}

module.exports = { crearRegistroEnProceso, crearRegistroCompletado, estaEnProceso };
