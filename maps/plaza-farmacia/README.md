# Plaza de la Farmacia

Mapa exterior independiente de 40×56 casillas (1280×1792 px).

## Referencia maestra

La revisión 14 usa como arte definitivo la imagen aprobada por el usuario:

`assets/references/plaza-farmacia-final-authoritative.png`

El script `tools/remove-plaza-pharmacy-side-door-v14.ps1` elimina el antiguo
saliente lateral de la farmacia mediante una continuación exacta de la acera.
Después, `tools/build-plaza-farmacia-v14.ps1` amplía la referencia de 1060×1484 a
1280×1792 mediante vecino más próximo, sin recortar ni cambiar su proporción
5:7. El resultado se guarda en `base-v14.png`.

La referencia ya contiene edificios, fachadas, mobiliario, rampa, carretera y
ruinas. Por eso el mapa no añade `worldAssets` encima: hacerlo duplicaría el
arte y volvería a producir el efecto de fachadas pegadas.

## Distribución

- Los comercios forman un único edificio blanco de una planta en U invertida,
  abierto hacia la carretera.
- Tramo norte, de oeste a este: **KEBAB**, **LOCAL CERRADO** y **BAR**.
- Ala oeste, de norte a sur: **CHINO**, **LOCAL CERRADO** y
  **MAR DE GAMBAS**; sus fachadas miran al este, hacia la plaza.
- Ala este, de norte a sur: **FRUTERÍA**, **LOCAL CERRADO** y
  **FARMACIA**; sus fachadas miran al oeste, hacia la plaza.
- La farmacia conserva la cristalera sur; su lateral este queda limpio y
  alineado con la acera, sin el antiguo saliente azul y beige.
- El hueco circular queda en el centro y la rampa de dos carriles continúa
  hasta la carretera.
- El paso de peatones está alineado con la rampa.
- Al sur hay dos grandes alas del centro comercial derruido, separadas por un
  eje central y unas puertas de cristal rotas.

## Juego y colisiones

La arquitectura y los obstáculos del dibujo se reproducen con
`buildingFootprints` y `blockedRects` invisibles. La rampa conecta con
`parking-plaza-farmacia`, cuyo regreso desemboca en `(640, 944)`. Las aceras
laterales siguen conectando con Calle Jerusalén.

El parking mantiene su propia imagen, sus telarañas y su trazado laberíntico.
Los cambios del editor se guardan por separado en los archivos
`editor-data.js` de ambos mapas.
