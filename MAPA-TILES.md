# Guía de casillas del mapa

El mapa usa una cuadrícula de **100 columnas × 58 filas**, con casillas de **32 × 32 px**.
Las coordenadas empiezan en cero: `C0, F0` es la esquina superior izquierda.

Abre el juego, pulsa el botón `#` y selecciona una casilla. El editor muestra su coordenada y permite asignarle uno de estos comportamientos:

- `transitable`: el jugador puede pasar.
- `bloqueada`: detiene al jugador (árbol, agua, pared, tejado, etc.).
- `puerta`: permite interactuar con `E`.
- `hierba / encuentro`: puede iniciar un combate salvaje.
- `evento`: reserva la casilla para diálogo, objeto, teletransporte u otra acción.

Puedes enviarme cambios en cualquier lista sencilla, por ejemplo:

```text
C65, F33 = puerta del Centro Pokémon; cura al equipo
C14–C36, F9–F18 = agua, bloqueado
C37–C44, F10–F16 = hierba con encuentros
C52, F27 = evento; diálogo con el profesor
```

Los valores iniciales están en `map-data.js`. Los cambios hechos dentro del editor se guardan localmente en el navegador y se pueden eliminar con **Restaurar mapa**.
