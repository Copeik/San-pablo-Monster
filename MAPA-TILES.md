# Guía del mapa reconstruido de San Pablo

El exterior mide **2508 × 2508 px lógicos**. La cuadrícula del editor usa casillas de **32 × 32 px** y la navegación compilada usa celdas más precisas de **8 × 8 px**.

- `C0, F0` es la esquina superior izquierda.
- `C78, F78` contiene el borde inferior derecho.
- Las posiciones del layout se expresan en píxeles del mundo; las puertas y los NPC usan columna/fila.
- El HUD muestra la casilla `C/F` y las coordenadas exactas `X/Y`.
- `map-layout.js` divide el exterior en nueve sectores de 836 × 836 px para su análisis y rotulación.

## Arquitectura declarativa

`map-layout.js` es la fuente de verdad del aspecto y la geometría exterior. Declara:

- `assetCatalog`: los 16 prototipos reutilizables con sprite, tamaño lógico, tipo y colliders;
- `worldAssets`: edificios, árboles, farolas, bancos, setos y barreras colocados en el mundo;
- `roads` y `paths`: ejes, anchuras, material y transitabilidad de calles y senderos;
- `surfaceRects` y `surfacePolygons`: plazas, patios, jardines y superficies especiales;
- `blockedRects`, `blockedSegments` y `blockers`: límites que siempre se restan de la navegación;
- `sections`: los nueve sectores usados por el informe y los rótulos del juego.

`map-data.js` adapta ese layout al runtime y conserva la configuración de puertas, NPC, encuentros y editor. Su `walkableRects`/`walkableSegments` derivado es un fallback de 32 px; durante la partida se usa normalmente la máscara semántica de 8 px compilada desde la misma geometría.

Ejemplo mínimo de una calle:

```js
{
  id: "nueva-calle",
  name: "Calle Nueva",
  points: [[320, 640], [960, 640]],
  width: 96,
  surface: "road",
  sidewalkWidth: 14,
  curbWidth: 4,
  walkable: true,
}
```

## Contrato visual y transitable

El compilador pinta y calcula las colisiones a partir de las mismas formas:

- `road`, `sidewalk` y `dirt` son transitables por defecto cuando la forma está habilitada;
- una forma con `walkable: false` sigue siendo visible, pero no abre paso;
- el césped es bloqueado salvo que se marque explícitamente como transitable, como ocurre en el campo de fútbol;
- las huellas y colliders de edificios, árboles, mobiliario y barreras se restan después;
- los bordes del mundo y la valla del campo también se restan, dejando únicamente su puerta declarada.

Así, una calle gris, una acera o un sendero marrón visibles no dependen de una cuadrícula dibujada a mano. La auditoría `san-pablo-rebuilt-walkability-v2.png` superpone **verde** en lo transitable y **rojo** en bloqueos/colliders.

`streetPolish` permanece como capa visual auxiliar para pasos y pequeños detalles. No concede transitabilidad ni sustituye la geometría de `map-layout.js`.

## Hierba alta y zonas de captura

La hierba alta usa un spritesheet IA de cuatro variantes y coincide exactamente con las casillas que pueden iniciar encuentros. Hay **seis zonas accesibles y 98 casillas de captura**:

- pradera oeste de la UNED;
- dos claros separados en el Parque Norte, conservando libre su sendero central;
- dos claros en el Parque Sur, sin invadir los caminos de tierra;
- jardín de Tesalónica, entre los cerezos y fuera de la avenida diagonal.

Cada mata se dibuja en dos pasos. La base queda detrás del personaje y la franja frontal entra en la ordenación por profundidad, cubriendo solo sus piernas cuando la pisa. Además del movimiento ambiental, cada paso genera durante 360 ms una ondulación local más intensa. Las áreas son `walkable: true`, pero los árboles, bancos y demás colliders continúan bloqueando con normalidad.

La entrada del Parque Norte se mantiene abierta y alineada con su sendero; los setos no cierran el acceso a sus dos zonas de captura.

## Salidas cerradas y barreras

Las cinco prolongaciones que parecen camino pero todavía no deben recorrerse terminan en una barrera de espinos visible:

- salida norte;
- salida este de Jerusalén;
- prolongación suroeste;
- acceso al complejo sur;
- huerto comunitario del norte.

La barrera tiene collider propio. Al acercarse y pulsar `E`, muestra: **«Parece que necesito algo para avanzar»**. No debe ocultarse un límite jugable sobre asfalto o tierra sin una señal visual equivalente.

## Assets IA y reutilización

El mapa coloca los edificios y props como sprites dinámicos sobre chunks que contienen solo el terreno. Esto permite profundidad correcta, colliders precisos y reutilizar casas semejantes sin hornearlas repetidamente en el bitmap.

- Assets reutilizados: edificios institucional, clínica, casa azul, residencial y tradicional; árboles perenne y cerezo; farola, banco y seto.
- Assets nuevos: hilera de casas, campus cívico, banco, edificio moderno, árbol caducifolio, barrera de espinos y spritesheet animado de hierba alta.
- Las fuentes nuevas con croma magenta y sus versiones RGBA transparentes están documentadas en `assets/generated/san-pablo-rebuilt/README.md`.
- La revisión visual de los 16 prototipos está en `assets/generated/san-pablo-rebuilt/asset-contact-sheet.png`.

## Artefactos compilados

| Artefacto | Uso |
| --- | --- |
| `assets/maps/san-pablo-rebuilt-base-hd.webp` | terreno HD de 5016 × 5016 px, a densidad 2× |
| `assets/maps/san-pablo-rebuilt-chunks-2x/` | 25 chunks jugables, organizados en 5 × 5 |
| `assets/maps/san-pablo-rebuilt-preview.webp` | vista completa con los assets colocados |
| `assets/maps/san-pablo-rebuilt-navigation-v2.png` | máscara binaria de 314 × 314 celdas, 8 px por celda |
| `assets/maps/san-pablo-rebuilt-walkability-v2.png` | overlay verde/rojo de transitabilidad y colliders |
| `assets/maps/san-pablo-rebuilt-sectors-v2.png` | comparación visual de los nueve sectores |
| `assets/maps/san-pablo-rebuilt-report-v2.json` | geometría, hashes, porcentajes y pruebas de puertas/bloqueos |

Para regenerar y verificar todo después de cambiar el layout:

```powershell
python tools/compile-san-pablo-map.py
python tools/build-san-pablo-asset-sheet.py
node tools/validate-world-assets.mjs
```

El compilador es determinista: usa la semilla declarada, tilesets fijos y WebP sin pérdida. El informe registra hashes de entradas y rutas de todas las salidas.

## Microteselas HD y memoria

Cada chunk cubre normalmente **512 × 512 px lógicos**, con un pequeño gutter para evitar costuras. La carga sigue el rectángulo de la cámara:

- todo bloque visible es obligatorio;
- se precargan como máximo dos bloques en la dirección del movimiento;
- los bloques fuera de pantalla y de su margen de seguridad se liberan;
- la memoria decodificada tiene un presupuesto de 96 MiB;
- al expulsar un bloque se cancela su descarga y se cierra su `ImageBitmap`;
- al entrar en interiores, cambiar de dimensión u ocultar la pestaña se liberan todos.

La miniatura reconstruida se reserva para portada/minimapa; el mundo jugable usa los chunks 2×.

## Editar desde el juego

Pulsa `#`, elige un comportamiento y después selecciona una casilla. Los cambios son overrides locales guardados únicamente en ese navegador.

- `transitable`: permite pasar por la casilla editada;
- `bloqueada`: detiene al jugador;
- `puerta`: permite interactuar con `E`;
- `hierba / encuentro`: es transitable y puede iniciar un combate;
- `evento`: reserva la casilla para diálogo, objeto o teletransporte.

**Copiar coordenada** genera una referencia reutilizable y **Copiar NPC** genera un objeto listo para pegar. **Restaurar mapa** borra únicamente esos overrides locales y recupera los valores de fábrica.

Formato recomendado para solicitar cambios:

```text
C18, F21 = puerta del Centro de Salud; debe curar al equipo
C20–C30, F45–F48 = jardín transitable con encuentros
C45, F13 = puerta de la UNED; abrir laboratorio
C55, F65 → C70, F52 = nueva calle transitable de 3 casillas de ancho
Sección sur, C68, F56 = límite bloqueado con barrera visible
C25, F65 = NPC Guía de San Pablo, mirando a la izquierda
```

## Añadir un NPC exterior

Los NPC se declaran en `map-data.js` con casilla, dirección, nombre, sprite y diálogos:

```js
{
  id: "nuevo-npc",
  col: 25,
  row: 65,
  direction: "left", // down, left, right o up
  name: "Guía de San Pablo",
  sprite: "guide",
  lines: ["Primer diálogo.", "Segundo diálogo."],
}
```

La casilla debe ser transitable. El NPC bloquea el paso y se activa con `E` a corta distancia; en el editor aparece en azul con la etiqueta `NPC`.
