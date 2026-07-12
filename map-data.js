/*
 * Cuadrícula lógica del mapa (32 px por casilla).
 * Las coordenadas que muestra el editor son columna/fila, empezando en 0.
 * Los rectángulos usan: [columnaInicial, filaInicial, columnaFinal, filaFinal].
 */
window.CITY_MAP_CONFIG = Object.freeze({
  image: "assets/maps/pokemon-city.png",
  width: 3200,
  height: 1834,
  tileSize: 32,
  spawn: { x: 2528, y: 1664, direction: "up" },

  blockedRects: [
    [0, 0, 51, 7], [60, 0, 99, 7],
    [0, 8, 13, 27], [86, 8, 99, 26],
    [14, 8, 22, 14], [14, 19, 23, 27],
    [23, 8, 36, 18], /* lago grande */
    [37, 8, 51, 10], [60, 8, 85, 10],

    /* Edificios de la franja norte. */
    [25, 19, 29, 24], [30, 20, 34, 24], [35, 20, 39, 24],
    [58, 19, 63, 24], [64, 19, 68, 24], [69, 21, 72, 24],
    [73, 20, 77, 24], [79, 19, 83, 24],

    /* Edificios del centro. */
    [37, 28, 41, 33], [42, 29, 45, 33], [46, 27, 53, 33],
    [58, 28, 61, 33], [62, 28, 68, 32], [69, 28, 79, 33],
    [87, 28, 96, 34],
    [25, 35, 42, 42], [43, 35, 53, 42], [58, 35, 68, 42],
    [69, 35, 79, 42], [87, 35, 96, 43],
    [58, 43, 67, 49], [68, 43, 81, 50],

    /* Bosque y límites inferiores; queda abierto el acceso sur. */
    [0, 32, 23, 57], [24, 48, 52, 57], [53, 54, 76, 57],
    [82, 48, 99, 57], [0, 28, 5, 31], [94, 27, 99, 47],
    [0, 57, 76, 57], [82, 57, 99, 57],
  ],

  encounterRects: [
    [37, 10, 44, 16],
    [71, 20, 78, 23],
    [43, 36, 48, 39],
    [85, 38, 91, 44],
  ],

  doors: [
    { col: 65, row: 33, label: "Centro Pokémon", action: "heal" },
    { col: 55, row: 7, label: "Edificio del norte", action: "closed" },
    { col: 44, row: 34, label: "Casa", action: "closed" },
    { col: 89, row: 35, label: "Casa", action: "closed" },
  ],
});
