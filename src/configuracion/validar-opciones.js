const { ErrorDeConfiguracion } = require('../comun/errores');

const METODOS_DEL_ALMACENAMIENTO = ['reservar', 'guardar', 'liberar'];
const OPCIONES_QUE_SON_FUNCIONES = ['alcance', 'huella', 'guardarSi', 'alFallar'];

function validarOpciones(opciones) {
  validarAlmacenamiento(opciones.almacenamiento);
  validarCabecera(opciones.cabecera);
  validarMetodos(opciones.metodos);
  validarMilisegundos('duracion', opciones.duracion);
  validarMilisegundos('tiempoBloqueo', opciones.tiempoBloqueo);

  for (const nombre of OPCIONES_QUE_SON_FUNCIONES) {
    if (typeof opciones[nombre] !== 'function') {
      throw new ErrorDeConfiguracion('La opcion ' + nombre + ' tiene que ser una funcion');
    }
  }
}

function validarAlmacenamiento(almacenamiento) {
  const faltante = METODOS_DEL_ALMACENAMIENTO.find(metodo => typeof almacenamiento[metodo] !== 'function');
  if (faltante) {
    throw new ErrorDeConfiguracion('El almacenamiento no tiene el metodo ' + faltante);
  }
}

function validarCabecera(cabecera) {
  if (typeof cabecera !== 'string' || cabecera.trim() === '') {
    throw new ErrorDeConfiguracion('La opcion cabecera tiene que ser el nombre de una cabecera');
  }
}

function validarMetodos(metodos) {
  if (!Array.isArray(metodos) || metodos.length === 0) {
    throw new ErrorDeConfiguracion('La opcion metodos tiene que ser una lista con por lo menos un metodo');
  }
  if (metodos.some(metodo => typeof metodo !== 'string')) {
    throw new ErrorDeConfiguracion('Los metodos tienen que ser textos como POST o PATCH');
  }
}

function validarMilisegundos(nombre, valor) {
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new ErrorDeConfiguracion('La opcion ' + nombre + ' tiene que ser un numero de milisegundos mayor que 0');
  }
}

module.exports = validarOpciones;
