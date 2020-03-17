const AlmacenamientoMemoria = require('../almacenamiento/almacenamiento-memoria');
const calcularHuella = require('../peticion/huella');
const validarOpciones = require('./validar-opciones');

const UN_MINUTO = 60 * 1000;
const UN_DIA = 24 * 60 * UN_MINUTO;

// estas respuestas significan "intenta mas tarde", si se guardaran el cliente nunca podria reintentar
const ESTADOS_QUE_NO_SE_GUARDAN = [408, 409, 425, 429];

const OPCIONES_POR_DEFECTO = {
  cabecera: 'Idempotency-Key',
  metodos: ['POST', 'PATCH'],
  obligatoria: false,
  duracion: UN_DIA,
  tiempoBloqueo: UN_MINUTO,
  alcance: () => '',
  huella: calcularHuella,
  guardarSi: esRespuestaDefinitiva,
  alFallar: mostrarError
};

function crearOpciones(opcionesDelUsuario = {}) {
  const opciones = { ...OPCIONES_POR_DEFECTO, ...sinIndefinidos(opcionesDelUsuario) };
  opciones.almacenamiento = opciones.almacenamiento || new AlmacenamientoMemoria();

  validarOpciones(opciones);

  opciones.metodos = opciones.metodos.map(metodo => metodo.toUpperCase());
  return opciones;
}

// los errores del servidor tampoco se guardan para que el cliente pueda reintentar
function esRespuestaDefinitiva(estado) {
  return estado < 500 && !ESTADOS_QUE_NO_SE_GUARDAN.includes(estado);
}

function mostrarError(error) {
  console.error('[idempotencia]', error);
}

// { duracion: undefined } no tiene que borrar el valor por defecto
function sinIndefinidos(objeto) {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined));
}

module.exports = crearOpciones;
