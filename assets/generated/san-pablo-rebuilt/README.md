# Assets IA del mapa reconstruido de San Pablo

Este directorio conserva los assets creados específicamente para la reconstrucción, la lámina del catálogo completo y el spritesheet animado de hierba alta. La fuente de verdad de nombres, tamaños lógicos, tipos, colliders y zonas de captura es `map-layout.js`; no se mantiene una segunda lista ejecutable aquí.

## Catálogo actual

El mapa usa 16 prototipos. Diez se reutilizan desde `assets/generated/san-pablo-derived/runtime/` y seis se generaron para esta reconstrucción.

| Prototipo | Tipo | Origen | Sprite runtime |
| --- | --- | --- | --- |
| `institutional` | edificio | reutilizado | `../san-pablo-derived/runtime/building-institutional.png` |
| `clinic` | edificio | reutilizado | `../san-pablo-derived/runtime/building-clinic-red.png` |
| `blueHouse` | edificio | reutilizado | `../san-pablo-derived/runtime/building-house-blue.png` |
| `residential` | edificio | reutilizado | `../san-pablo-derived/runtime/building-residential-tan.png` |
| `traditional` | edificio | reutilizado | `../san-pablo-derived/runtime/building-traditional-red.png` |
| `rowhouse` | edificio | nuevo | `runtime/building-rowhouse-tan.png` |
| `campus` | edificio | nuevo | `runtime/building-campus-civic.png` |
| `bank` | edificio | nuevo | `runtime/building-bank-civic.png` |
| `modern` | edificio | nuevo | `runtime/building-modern-southeast.png` |
| `evergreen` | árbol | reutilizado | `../san-pablo-derived/runtime/tree-evergreen.png` |
| `deciduous` | árbol | nuevo | `runtime/tree-deciduous.png` |
| `cherry` | árbol | reutilizado | `../san-pablo-derived/runtime/tree-cherry.png` |
| `streetlamp` | mobiliario | reutilizado | `../san-pablo-derived/runtime/prop-streetlamp.png` |
| `bench` | mobiliario | reutilizado | `../san-pablo-derived/runtime/prop-park-bench.png` |
| `hedge` | mobiliario | reutilizado | `../san-pablo-derived/runtime/prop-hedge-flowerbed.png` |
| `thornBarrier` | barrera | nuevo | `runtime/prop-thorn-barrier.png` |

La lámina `asset-contact-sheet.png` se construye leyendo esos 16 prototipos directamente desde `map-layout.js`. El azul identifica reutilización y el verde, assets nuevos. La hierba alta es un efecto de terreno independiente, no un objeto con collider, por lo que no incrementa ese contador.

## Fuentes IA y transparencia

Las seis imágenes de objetos y el atlas de hierba se conservaron en etapas reproducibles:

| Fuente IA sobre croma magenta | Runtime RGBA transparente |
| --- | --- |
| `sources/ai-rowhouse-magenta.png` | `runtime/building-rowhouse-tan.png` |
| `sources/ai-campus-magenta.png` | `runtime/building-campus-civic.png` |
| `sources/ai-bank-magenta.png` | `runtime/building-bank-civic.png` |
| `sources/ai-modern-magenta.png` | `runtime/building-modern-southeast.png` |
| `sources/ai-deciduous-tree-magenta.png` | `runtime/tree-deciduous.png` |
| `sources/ai-thorn-barrier-magenta.png` | `runtime/prop-thorn-barrier.png` |
| `sources/grass-tall-atlas-magenta.png` | `runtime/grass-tall-atlas-alpha.png` → `runtime/grass-tall-spritesheet.png` |

- `sources/` conserva la salida IA original con fondo magenta para poder repetir o mejorar el recorte.
- `runtime/` contiene el resultado limpio con canal alfa; estos son los archivos que dibuja el juego.
- Los diez assets reutilizados no se duplican: sus fuentes, referencias y versiones runtime permanecen en `assets/generated/san-pablo-derived/`.
- Los tiles de suelo también se reutilizan desde `san-pablo-derived/tileset-road-sidewalk.png` y `san-pablo-derived/tileset-grass-dirt.png` al compilar el terreno.

El atlas de hierba se generó con IA como cuatro matas distintas de pixel art sobre croma magenta, con perspectiva cenital 3/4, luz uniforme y contorno nítido. Después se retiró el croma, se recortaron las cuatro variantes y se compactaron en una tira RGBA de **256 × 64 px**. En el juego cada mata tiene un vaivén suave y recibe un impulso adicional al pisarla; su franja inferior se ordena por profundidad para cubrir las piernas del personaje.

## Regeneración y comprobación

Generar de nuevo la lámina de assets:

```powershell
python tools/build-san-pablo-asset-sheet.py
```

Compactar otra vez el atlas transparente de hierba alta:

```powershell
python tools/build-tall-grass-sprite.py
```

Recompilar terreno, preview, máscara navegable, sectores, informe y chunks:

```powershell
python tools/compile-san-pablo-map.py
```

Validar sprites, colocaciones, colliders, corredores y accesos a puertas:

```powershell
node --test tests/map-editor-layout.test.mjs tests/map-registry.test.mjs
```

Al cambiar un sprite, su tamaño lógico, sus colliders o una zona de captura en `map-layout.js`, hay que volver a ejecutar los comandos correspondientes. La lámina es solo un artefacto de revisión visual; el runtime siempre consume las rutas declaradas en el layout.
