# Sistema de mapas

Cada exterior jugable vive en `maps/<map-id>/` y registra un paquete independiente antes de que arranque el runtime. El registro selecciona el mapa indicado por `?map=<map-id>` o por la partida guardada y publica su configuración como mapa activo.

## Crear un mapa

```powershell
npm run map:new -- ruta-azahar --name "Ruta del Azahar" --cols 24 --rows 20
```

El comando crea:

- `editor-data.js`: cambios persistentes exclusivos del mapa;
- `map.js`: manifiesto, colisiones, entidades, encuentros y registro;
- `base.svg`: terreno inicial reemplazable por chunks compilados;
- las etiquetas `<script>` necesarias en `index.html` para mantener la compatibilidad con apertura directa.

Arranca `npm start`, abre `?map=ruta-azahar` y pulsa `G` para editarlo. El selector **Mapa** del modo dios cambia entre paquetes sin mezclar archivos, revisiones ni bandejas locales.

## Contrato mínimo

Un paquete registra `id`, `name`, `config`, `layout`, `editorData` y `editorDataPath`. `config` contiene al menos tamaño, casilla, aparición, terreno transitable, entradas, NPC y eventos. Los destinos de entrada usan el ID registrado y coordenadas en píxeles del mapa de destino.

Las transiciones entre mapas guardan `state.mapId`, posición y revisión antes de navegar. Al cargar la página de destino, el juego reanuda la partida automáticamente. `current` conserva el mapa activo y `city` es un alias de `san-pablo`.

## Comprobación de un mapa nuevo

1. La aparición es transitable.
2. Toda salida tiene un destino registrado y una salida de regreso.
3. Guardar y recargar conserva mapa, posición y dirección.
4. NPC, eventos, encuentros y objetos solo pertenecen a su paquete.
5. El modo dios muestra el ID correcto y escribe únicamente su `editor-data.js`.
