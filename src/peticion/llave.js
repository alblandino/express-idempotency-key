const LARGO_MAXIMO = 255;

// devuelve la llave que mando el cliente o null si no mando ninguna
function leerLlave(req, cabecera) {
  const valor = req.headers[cabecera.toLowerCase()];
  if (valor === undefined) {
    return null;
  }
  return String(valor).trim();
}

function esLlaveValida(llave) {
  return llave.length > 0 && llave.length <= LARGO_MAXIMO;
}

// el alcance separa las llaves de cada cliente para que dos clientes no choquen.
// se codifican las dos partes para que 'a' + 'b:c' no quede igual que 'a:b' + 'c'
function llaveDeAlmacenamiento(alcance, llave) {
  return encodeURIComponent(alcance) + ':' + encodeURIComponent(llave);
}

module.exports = { leerLlave, esLlaveValida, llaveDeAlmacenamiento, LARGO_MAXIMO };
