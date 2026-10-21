![Status](https://img.shields.io/badge/Estado-Archivado-red?style=for-the-badge&logo=git&logoColor=white) ![Mantenimiento](https://img.shields.io/badge/Mantenimiento-Descontinuado-critical?style=for-the-badge)

# express-idempotency-key

Middleware de Express para que una peticion repetida con la misma `Idempotency-Key` no se ejecute dos veces.

## Que es

Un cliente manda un pago. El servidor lo cobra, pero la respuesta se pierde en el camino: se cayo el wifi, el celular cambio de antena o se vencio el timeout. El cliente no sabe si se cobro o no, y lo normal es que reintente. Sin nada que lo evite, el pago se cobra dos veces.

La solucion es que el cliente mande una llave unica por cada operacion en la cabecera `Idempotency-Key`. El servidor guarda la respuesta de esa llave, y si la misma llave llega otra vez devuelve la respuesta guardada sin ejecutar nada.

Este middleware hace esa parte. La ruta se escribe normal y el middleware se encarga de reservar la llave, guardar la respuesta y repetirla cuando haga falta.

No tiene dependencias. Las llaves se pueden guardar en memoria o en MongoDB, o en cualquier otro lugar si escribes tu propio almacenamiento.

## Para que sirve

- Pagos, transferencias, pedidos y cualquier operacion que no se puede hacer dos veces.
- APIs que usan clientes moviles o redes malas, donde los reintentos son normales.
- Aplicaciones con varias instancias detras de un balanceador: con MongoDB todas ven las mismas llaves, asi que no importa a cual instancia llegue el reintento.

## Como funciona

1. Llega un `POST` con `Idempotency-Key: 8f14e45f-...`.
2. El middleware reserva la llave en el almacenamiento en una sola operacion. Si llegan dos peticiones con la misma llave al mismo tiempo, solo una gana.
3. La que gana ejecuta la ruta. Cuando la ruta responde, el estado, las cabeceras y el cuerpo se guardan **antes** de enviar la respuesta, asi un reintento que llegue justo despues ya la encuentra.
4. Si llega otra peticion con la misma llave:
   - si la primera sigue en proceso, responde `409` con `Retry-After: 1`;
   - si ya termino, responde lo mismo que la primera y agrega `Idempotent-Replayed: true`;
   - si la llave se uso con otra peticion (otro metodo, otra url u otro cuerpo), responde `422`.
5. Si la ruta responde con un error del servidor (5xx) o con un "intenta mas tarde" (408, 409, 425, 429), la llave se libera para que el reintento se ejecute de nuevo.

Para saber si dos peticiones son la misma se calcula una huella: un sha256 del metodo, la url y el cuerpo. El cuerpo se ordena antes, asi `{ monto, moneda }` y `{ moneda, monto }` dan la misma huella.

## Instalacion

```
npm install github:alblandino/express-idempotency-key
```

Funciona con Node.js 12 o mas nuevo. Las pruebas pasan con Express 4 y con Express 5 (Express 5 necesita Node.js 18 o mas nuevo).

## Como usarlo

### 1. Agregar el middleware

```js
const express = require('express');
const { idempotencia } = require('express-idempotency-key');

const app = express();
app.use(express.json());
app.use(idempotencia());

app.post('/pagos', async (req, res) => {
  const pago = await cobrar(req.body);
  res.status(201).json(pago);
});
```

Tiene que ir **despues** de `express.json()`, porque la huella usa el cuerpo ya leido.

Por defecto solo revisa `POST` y `PATCH`. Las peticiones que no traen la cabecera pasan sin cambios, a menos que se use `obligatoria: true`.

Tambien se puede poner solo en algunas rutas:

```js
const conIdempotencia = idempotencia();

app.post('/pagos', conIdempotencia, crearPago);
app.post('/transferencias', conIdempotencia, crearTransferencia);
```

Cada llamada a `idempotencia()` crea su propio almacenamiento en memoria, por eso en el ejemplo se crea una vez y se usa en las dos rutas.

### 2. Separar las llaves por cliente

Por defecto todas las llaves estan en el mismo lugar. Si dos usuarios mandan la misma llave con el mismo cuerpo, el segundo recibiria la respuesta del primero. Para evitarlo hay que usar `alcance` con el usuario autenticado:

```js
app.use(autenticar);
app.use(idempotencia({
  alcance: req => req.usuario.id
}));
```

### 3. Del lado del cliente

La llave se genera una vez por operacion, no una vez por intento:

```js
const llave = crypto.randomUUID();

async function pagar() {
  return fetch('/pagos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': llave },
    body: JSON.stringify({ monto: 500, moneda: 'DOP' })
  });
}

// si falla la red se llama a pagar() otra vez y se usa la misma llave
```

## Varias instancias: MongoDB

La memoria solo sirve si la aplicacion corre en un solo proceso. Con varias instancias se usa una coleccion de MongoDB que todas comparten:

```js
const { MongoClient } = require('mongodb');
const { idempotencia, AlmacenamientoMongo } = require('express-idempotency-key');

const cliente = await MongoClient.connect(process.env.MONGO_URI);
const almacenamiento = new AlmacenamientoMongo(cliente.db('api').collection('idempotencia'));
await almacenamiento.crearIndices();

app.use(idempotencia({ almacenamiento, alcance: req => req.usuario.id }));
```

La libreria no instala el driver de MongoDB, usa la coleccion que le pases. Con Node.js 12 hay que usar la version 4 del driver (`npm install mongodb@4`), las versiones nuevas necesitan un Node.js mas nuevo. `crearIndices()` crea un indice TTL para que MongoDB borre solo las llaves vencidas.

La reserva es un solo `replaceOne` con `upsert`: el filtro solo encuentra la llave si ya vencio, y si existe y no ha vencido, MongoDB rechaza el upsert por `_id` repetido. Asi dos instancias no pueden reservar la misma llave.

## Opciones

| Opcion | Por defecto | Para que es |
|---|---|---|
| `almacenamiento` | `new AlmacenamientoMemoria()` | Donde se guardan las llaves. |
| `cabecera` | `'Idempotency-Key'` | Nombre de la cabecera con la llave. |
| `metodos` | `['POST', 'PATCH']` | Metodos que se revisan. Los demas pasan sin cambios. |
| `obligatoria` | `false` | Con `true`, una peticion sin llave recibe `400`. |
| `alcance` | `req => ''` | Separa las llaves de cada cliente. Puede ser `async`. |
| `duracion` | 24 horas | Milisegundos que se guarda una respuesta. |
| `tiempoBloqueo` | 1 minuto | Milisegundos que una llave puede estar en proceso. Si el proceso se cae a mitad de una peticion, la llave se libera sola despues de este tiempo. Tiene que ser mas largo que lo que tarda la ruta mas lenta. |
| `huella` | sha256 de metodo, url y cuerpo | Funcion `req => texto` para decidir que se compara. Con `() => ''` no se compara nada. |
| `guardarSi` | todo menos 5xx, 408, 409, 425 y 429 | Funcion `estado => boolean` que decide que respuestas se guardan. Las que no se guardan liberan la llave. |
| `alFallar` | `console.error` | Se llama con los errores que pasan despues de responder, por ejemplo si MongoDB falla al guardar. |

## Respuestas del middleware

| Estado | Cuando |
|---|---|
| `400` | Falta la llave y es obligatoria, o la llave tiene mas de 255 caracteres. |
| `409` | Hay otra peticion con la misma llave en proceso. Trae `Retry-After: 1`. |
| `422` | La llave ya se uso con otra peticion. |
| la guardada | La llave ya se uso con la misma peticion. Trae `Idempotent-Replayed: true`. |

Los errores vienen como `{ "error": "mensaje" }`.

Si el almacenamiento falla antes de ejecutar la ruta (por ejemplo, no hay conexion con MongoDB), el error se pasa a `next(error)` y la ruta no se ejecuta.

## Almacenamiento propio

Un almacenamiento es cualquier objeto con estos tres metodos:

| Metodo | Que hace |
|---|---|
| `reservar(llave, registro, duracion)` | Si la llave no existe o ya vencio, guarda el registro por `duracion` milisegundos y devuelve `null`. Si existe, devuelve el registro que tiene. Tiene que ser atomico: dos llamadas al mismo tiempo no pueden devolver `null` las dos. |
| `guardar(llave, registro, duracion)` | Reemplaza el registro solo si la llave todavia tiene el mismo `registro.token`. Devuelve `true` si lo guardo. |
| `liberar(llave, token)` | Borra la llave solo si todavia tiene ese token. |

El token es lo que evita que una peticion que se paso del `tiempoBloqueo` pise a la que reservo la llave despues que ella.

## Ejemplo

```
npm run ejemplo
```

Levanta un MongoDB en memoria y dos instancias de la misma API de pagos que comparten la coleccion, como si estuvieran detras de un balanceador:

```
1. primer intento en instancia-1
    201 {"id":1,"monto":500,"cobradoPor":"instancia-1"}
2. el cliente no recibio la respuesta y reintenta, el balanceador lo manda a instancia-2
    201 {"id":1,"monto":500,"cobradoPor":"instancia-1"} (repetida)
3. misma llave con otro monto
    422 {"error":"La llave ya se uso con otra peticion"}
4. cinco peticiones al mismo tiempo con una llave nueva, repartidas entre las dos instancias
    409 {"error":"Hay otra peticion con la misma llave en proceso"}
    201 {"id":2,"monto":300,"cobradoPor":"instancia-2"}
    409 {"error":"Hay otra peticion con la misma llave en proceso"}
    409 {"error":"Hay otra peticion con la misma llave en proceso"}
    409 {"error":"Hay otra peticion con la misma llave en proceso"}
5. los que recibieron 409 esperan el Retry-After y reintentan
    201 {"id":2,"monto":300,"cobradoPor":"instancia-2"} (repetida)

cobros hechos: 2
```

El codigo de la API esta en `ejemplos/app-pagos.js`.

## Limitaciones

- No es una transaccion. Si el proceso se cae despues de cobrar y antes de guardar la respuesta, el reintento se ejecuta otra vez cuando vence el `tiempoBloqueo`. Si eso no puede pasar nunca, la operacion tambien tiene que detectar el duplicado, por ejemplo con un indice unico por llave en la tabla de pagos.
- Lo mismo pasa con los 5xx: si la ruta cobro y despues fallo, el reintento cobra otra vez. Si prefieres guardar tambien los errores, usa `guardarSi: () => true`.
- Las respuestas se guardan completas. No sirve para rutas que devuelven archivos grandes, y en MongoDB cada respuesta tiene el limite de 16 MB de un documento.
- No espera a que termine la peticion que esta en proceso. Responde `409` y el cliente tiene que reintentar.

## Pruebas

```
npm test
```

Son 25 pruebas que levantan una API de Express de verdad y prueban todo con el almacenamiento en memoria y con MongoDB en memoria. La primera vez descarga MongoDB y tarda un poco.

Tambien hay un script que simula una red que pierde el 30% de las respuestas, con 1,000 pagos:

```
npm run reintentos
```

```
pagos enviados: 1000

                    cobros   reintentos   duplicados
sin idempotencia      1436          436          436
con idempotencia      1000          405            0
```

Las respuestas que se pierden son al azar, asi que los numeros cambian un poco en cada corrida. Lo que no cambia es que sin el middleware cada reintento es un cobro duplicado, y con el middleware los cobros son siempre 1000.

## Derechos

Copyright (c) 2020 Joel Jaime ([@alblandino](https://github.com/alblandino)). Todos los derechos reservados.
