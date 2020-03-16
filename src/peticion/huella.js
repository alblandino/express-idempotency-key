const crypto = require('crypto');

// resume la peticion en un hash con el metodo, la url y el cuerpo.
// si llega la misma llave con otra huella es que el cliente reuso la llave para otra cosa
function calcularHuella(req) {
  const url = req.originalUrl || req.url;
  const contenido = req.method + ' ' + url + ' ' + textoOrdenado(req.body);
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

// el mismo objeto con las propiedades en otro orden tiene que dar el mismo texto
function textoOrdenado(valor) {
  if (valor === undefined) {
    return '';
  }
  return JSON.stringify(valor, (nombre, actual) => {
    if (actual && typeof actual === 'object' && !Array.isArray(actual)) {
      return ordenarPropiedades(actual);
    }
    return actual;
  });
}

function ordenarPropiedades(objeto) {
  const ordenado = {};
  for (const nombre of Object.keys(objeto).sort()) {
    ordenado[nombre] = objeto[nombre];
  }
  return ordenado;
}

module.exports = calcularHuella;
