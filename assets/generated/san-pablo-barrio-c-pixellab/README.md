# San Pablo, Barrio C — paquete PixelLab

Paquete reutilizable para la cuadrícula lógica de 32 px del juego. Todo el contenido artístico procede de PixelLab MCP; el recorte de alfa, la separación de hojas, la composición 4×4 y la hoja de contacto son operaciones mecánicas.

## Contenido integrado

- Cinco familias principales de edificios del Barrio C: bloque residencial mixto, banco, farmacia, tienda de barrio y café-bar.
- Una fila baja de bares como familia adicional.
- Cada una de las seis familias aporta tres vistas listas para runtime: frontal, lateral oeste y lateral este. Son 18 sprites de edificios en total.
- Siete sprites de parque y mobiliario: naranjo, caducifolio mediterráneo, banco, farola curva, bolardo, alcorque-jardinera y mesa con sillas.
- Dos tilesets Wang terminados de 16 piezas a 32×32 px: asfalto–acera y acera–césped.
- Una hoja 4×4 de detalles urbanos a 32×32 px. Los índices 0–9 cubren los detalles pedidos y 10–15 conservan variaciones adicionales de PixelLab.

El catálogo de objetos contiene 25 assets colocables: 18 vistas de edificios y 7 props. Los terrenos y la hoja de detalles se publican por separado en el catálogo de tiles.

Los Wang adoquín/plaza–césped y tierra seca–césped siguen en `waiting` dentro de PixelLab. No se publican en el catálogo ni se sustituyen con arte alternativo.

## Perspectiva de los edificios

Los edificios usan perspectiva **frontal-superior ortogonal tipo Pokémon DS**: se ven simultáneamente el tejado y la fachada frontal, como en los mapas de *Pokémon Diamante/Perla* y *HeartGold/SoulSilver*. Las líneas horizontales y verticales permanecen alineadas con la cuadrícula; no hay proyección isométrica ni diagonales con punto de fuga.

PixelLab produce ocho rotaciones para cada edificio aceptado. El runtime selecciona `south` para la vista frontal-superior y `west`/`east` para los dos laterales ortogonales. Las ocho imágenes originales se conservan para futuras ampliaciones.

Un intento de café-bar produjo un personaje humano y fue rechazado por incompatibilidad semántica. Tres intentos con `create_map_object` también fueron rechazados porque su perspectiva era isométrica. Ninguno de esos resultados descartados entra en el catálogo.

## Trabajos PixelLab

| Recurso | ID | Semilla | Estado |
| --- | --- | ---: | --- |
| Asfalto ↔ acera | `75bed0c2-e9a9-4945-8c08-147b129eb23e` | — | `completed` |
| Acera ↔ césped | `3fa15803-32df-4e96-afd1-2f1f51f36fcc` | — | `completed` |
| Plaza ↔ césped | `4b6a4b40-fe71-48ff-9074-8edd52f0123a` | — | `waiting` |
| Tierra ↔ césped | `73a0b933-20ca-48b1-b7b7-777842806e69` | — | `waiting` |
| Detalles urbanos | `b93a56d1-2c23-4409-8c2a-78169ef67be3` | `348127` | `completed` |
| Bloque mixto, intento agotado | `da9d5d6f-3252-42f8-bb21-55a6305297ea` | — | `failed` |
| Bloque mixto, ocho direcciones | `0dc73709-6f3e-4308-9ea8-3c816b24e552` | — | `completed` |
| Mobiliario, hoja de selección | `3c259b6e-8ce5-499a-b9bb-f814cb6439c8` | — | `review_selected` |
| Farmacia, ocho direcciones | `39a2f43e-241e-43e1-a7bb-9df35d664916` | — | `completed` |
| Banco, ocho direcciones | `bd4f6b10-53b4-4e73-ad10-2fe19a34a5ca` | — | `completed` |
| Café-bar, resultado de personaje | `d85b0675-e73f-4586-96d6-fa5d1c466e9e` | — | `rejected` |
| Tienda, ocho direcciones | `9247e736-8388-4bf5-a7ee-34a1e53918a1` | — | `completed` |
| Fila de bares, ocho direcciones | `f531bd95-b1e3-4caa-9fdc-69a0fb1f1168` | — | `completed` |
| Bar frontal, prueba isométrica | `6512f355-ffb2-479f-8d20-2818d2b79994` | — | `rejected` |
| Bar lateral oeste, prueba isométrica | `ef58be6e-bca0-4b44-9b33-0c14bda02b8a` | — | `rejected` |
| Bar lateral este, prueba isométrica | `38dadfd6-78c2-4283-bc0b-f5f0c479e1e4` | — | `rejected` |
| Café-bar final, ocho direcciones | `e4a6fe06-0aeb-48de-b3e8-1c8c7af3821c` | — | `completed` |

`pixellab-downloads.json` registra las 17 llamadas y las URLs de almacenamiento o descarga comunicadas por PixelLab. Incluye las ocho rotaciones de cada trabajo de ocho direcciones, incluso el resultado de personaje rechazado, y las descargas de las tres pruebas isométricas descartadas. El saldo consultado pasó de 897 a 561 generaciones: 336 consumidas.

## Estructura

- `originals/buildings/`: ocho rotaciones originales por cada familia de edificio aceptada, sin recorte.
- `sources/terrain/`: las dos hojas Wang originales terminadas.
- `sources/urban-details/`: los 16 PNG originales de 32×32 px.
- `sources/props/`: hojas originales seleccionadas de mobiliario.
- `runtime/terrain/`: los dos Wang disponibles para la cuadrícula de 32 px.
- `runtime/details/urban-details.png`: hoja 4×4 compuesta en orden numérico.
- `runtime/buildings/`: las 18 vistas frontal y laterales, recortadas y ancladas abajo al centro.
- `runtime/props/`: siete sprites RGBA recortados y anclados abajo al centro.
- `manifest.json`: inventario canónico, dimensiones, perspectiva, prompts, IDs, estados y procedencia.
- `catalog.js`: catálogo runtime; no contiene rutas a los dos Wang aún inexistentes ni resultados rechazados.
- `contact-sheet.png`: revisión visual completa y estado explícito de los dos trabajos en espera.

## Integración

`index.html` carga `catalog.js` antes de `map-layout.js`, que fusiona `CITY_BARRIO_C_ASSET_CATALOG` con el catálogo del editor. `CITY_BARRIO_C_TILE_CATALOG` expone los dos Wang disponibles y la hoja de detalles.

El paquete no cambia `worldAssets`, superficies, colisiones del mapa ni datos guardados. Los 25 objetos quedan registrados como prototipos reutilizables, sin colocaciones nuevas.

## Convenciones visuales

- Terrenos y props: ortográfico `high top-down`; edificios: ortográfico `low top-down front-superior`.
- Paleta guía: asfalto `#4b5356`, acera `#b8b3a8`, plaza `#c9bea7`, ladrillo ocre, revoco crema y acentos verdes/azul oscuro.
- Sin isometría, punto de fuga, personas, vehículos fusionados, texto legible, marcas ni fotorrealismo.
- Sprites runtime RGBA, recortados hasta el alfa visible sin cortar sombras y con píxeles opacos en la fila inferior.

## Reconstrucción y pruebas

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-barrio-c-pixellab-pack.ps1
node --test tests/barrio-c-pixellab-pack.test.mjs tests/map-editor-layout.test.mjs
```

La prueba focal valida las 17 llamadas e IDs, los dos Wang terminados, los dos estados `waiting`, la hoja de detalles, los 25 sprites, RGBA, dimensiones, alfa, ancla inferior, registro del catálogo y ausencia de colocaciones nuevas.
