# Kit PixelLab · Plaza de la Farmacia

Recursos originales generados mediante el MCP oficial de PixelLab. Las
fachadas usan cámara ortográfica `low top-down`; el mobiliario usa una vista
cenital más alta. Los PNG se descargan antes de su caducidad automática y se
limpian localmente para conservar fondo alfa real.

## Recursos iniciales

| Archivo | ID de PixelLab | Lienzo | Uso |
| --- | --- | ---: | --- |
| `building-pharmacy-san-pablo.png` | `49e2c2a6-57d0-46ca-a77d-52b6e204acf7` | 283×132 | Farmacia inspirada en la fachada real |
| `building-bank-neighborhood.png` | `b112c757-87c-4684-bf58-12ad71cc1b9f` | 230×140 | Sucursal bancaria de barrio |
| `building-shop-neighborhood.png` | `0f5c454a-4f30-4ba9-bba2-fda780ef44e7` | 202×156 | Tienda de alimentación |
| `building-bars-strip.png` | `712b6dbb-b2f1-4386-838f-1f82c4ba1621` | 358×109 | Tres bares unidos |
| `prop-cafe-terrace.png` | `b4bb59cc-fe69-4693-abd7-1a5daceefa28` | 161×107 | Mesas y sillas |

## Primera ampliación

| Archivo | ID de PixelLab | Lienzo actual | Uso |
| --- | --- | ---: | --- |
| `building-pharmacy-white-glass.png` | `3c0b3e6c-0409-4c0b-b858-4d50002aac73` | 300×160 | Farmacia blanca acristalada anterior |
| `building-wing-east-pharmacy-fruit-bar.png` | `b548d389-6a4c-406e-ae63-821a3e231fe4` | 192×384 | Ala lateral anterior |
| `building-wing-west-mar-closed-chinese.png` | `44390fd0-62b2-4591-9314-850bb0aa3abe` | 192×384 | Ala lateral anterior |
| `prop-parking-ramp.png` | `cb0ec2ad-cdda-4a6d-9430-1b0574c897ab` | 84×172 | Rampa estrecha anterior, recortada al alfa |
| `prop-parking-lightwell.png` | `ffbf30cb-de7c-403a-a5f4-9d5ac89e4a47` | 176×176 | Hueco circular de luz |
| `building-abandoned-mall.png` | `d8982dbe-1b60-441a-8395-63d5d923c6c4` | 400×224 | Estructura abandonada anterior |
| `prop-gray-metal-fence.png` | `fe240faf-253d-4b99-a870-454e203c53bc` | 320×96 | Valla metálica gris |
| `prop-parking-clutter.png` | `f0d0b85e-973d-4be8-8fac-56c927234138` | 224×176 | Pilar, carro, conos, cajas y telarañas |

## Reconstrucción exacta de la U · 21-07-2026

| Archivo | ID de PixelLab | Lienzo alfa recortado | Uso |
| --- | --- | ---: | --- |
| `building-u-north-kebab-closed-bar.png` | `6c39cc2b-d7c3-404f-a5ab-f00ecae2b308` | 352×94 | Kebab, local cerrado y bar |
| `building-u-west-chino-closed-mar.png` | `d12ae30d-3473-4a2b-b4d7-1f4a7f9c5a56` | 85×352 | Chino, cerrado y Mar de Gambas |
| `building-u-east-fruit-pharmacy.png` | `677f9fbc-ef21-46ff-9349-158abec57d09` | 126×305 | Frutería y farmacia acristalada |
| `prop-parking-ramp-roadwide.png` | `b3b2b3ac-09ec-44b9-960c-8fb5ab78eabd` | 200×249 | Rampa ancha de dos carriles |
| `building-abandoned-megamall-ruin.png` | `7d41114a-e57e-4abd-b4ba-7cd5ad3a0a63` | 392×181 | Centro comercial gigante derruido |

Las tres fachadas nuevas se apoyan sobre una única masa blanca continua de
`base.svg`. Así se preserva el detalle de PixelLab y se garantizan uniones
exactas al píxel en las dos esquinas de la U.

## Reconstrucción modular v8 · 22-07-2026

La versión anterior se retiró del mapa porque sus tres collages se estiraban
con escalas diferentes y aparentaban ser edificios separados. La v8 se genera
con dos trabajos oficiales de PixelLab:

| Recurso | ID de PixelLab | Resultado |
| --- | --- | --- |
| Kit arquitectónico blanco | `e95ba896-4054-4c9a-bc81-8be4f13b69f4` | 56 piezas lógicas de 32 px |
| Kit de escaparates | `f352b2ac-03dd-4be2-a02a-f6ac46e0a8cd` | 16 módulos nativos de 64×64 px |

Los originales y sus ZIP se conservan en `originals/` y `archives/`. El script
`tools/build-plaza-pharmacy-u.ps1` ensambla a resolución nativa una única pieza
de 1088×672 px en `runtime/buildings/building-u-continuous-v8.png`.

La distribución aplica el espejo horizontal solicitado: arriba quedan
**Kebab → cerrado → bar**; al oeste, **chino → cerrado → Mar de Gambas**;
y al este, **frutería → tramo neutro → farmacia**. Todas las puertas miran a la
plaza salvo la farmacia: su cristalera mira a la carretera y la puerta abre al
borde este del mapa.
