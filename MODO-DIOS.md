# Modo dios colaborativo

El editor modifica `map-editor-data.js`, que forma parte de los datos del juego. La interfaz y las rutas de escritura solo se habilitan en desarrollo.

## Uso local

```powershell
npm start
```

Abre la URL mostrada, inicia una partida y pulsa `G` o el botón `✦`.

## Editar con otra persona

```powershell
npm run start:collab
```

El servidor escucha en la red privada y muestra un enlace con un token temporal. Comparte ese enlace únicamente con tu colaborador; ambos debéis estar en la misma red local o VPN privada. Windows puede pedir permiso de firewall la primera vez.

Los dos navegadores reciben al instante cambios de terreno, objetos, NPC, entradas y eventos. El ordenador que ejecuta el servidor es el anfitrión y conserva el único archivo canónico `map-editor-data.js`; no hace falta copiarlo manualmente entre los dos mientras trabajáis en esa sesión.

Para fijar un token conocido en PowerShell:

```powershell
$env:GAME_EDITOR_TOKEN = "un-token-largo-y-privado"
npm run start:collab
```

## Herramientas

- **Objetos:** colocar, mover, escalar, voltear, renombrar, duplicar u ocultar edificios y decorado.
- **Terreno:** pintar casillas transitables, bloqueadas, puertas, hierba de encuentros y eventos, con pinceles de varios tamaños.
- **NPC:** colocar personajes, elegir sprite y dirección, editar diálogo y configurar patrullas.
- **Entradas:** enlazar una casilla con interiores o destinos. Las puertas base siguen a su edificio cuando este se mueve.
- **Eventos:** diálogo, pensamiento, vibración/sacudida, teletransporte y transición con activación al interactuar o pisar.

La plantilla **Nuevo mapa** conserva el identificador y las coordenadas del destino. `san-pablo`, `city` y `current` funcionan inmediatamente; otro identificador queda preparado para que un futuro mapa lo registre mediante el evento `pokemon-map-transition`.

## Seguridad y publicación

- En `NODE_ENV=production` las rutas del editor responden como inexistentes y el botón no aparece.
- También puede deshabilitarse expresamente con `GAME_EDITOR_ENABLED=0`.
- La colaboración remota solo acepta direcciones de red privada y exige el token de la sesión.
- No publiques ni reenvíes el enlace con token fuera del equipo de desarrollo.
