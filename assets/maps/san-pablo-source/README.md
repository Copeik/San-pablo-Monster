# Fuentes cartograficas de San Pablo C

Este directorio lo genera `tools/fetch-san-pablo-source-data.py`. Contiene una
captura trazable de las fuentes utilizadas para reconstruir el Barrio C de San
Pablo (Sevilla), sin mezclar los regimenes de licencia de sus proveedores.

## Contenido

- `boundary.geojson`: limite oficial **SAN PABLO C**, `Hosted/BarriosIDE`,
  entidad `fid=45`.
- `surfaces.geojson`: superficies de la Guia Urbana municipal, capa 27.
- `sidewalks.geojson`: acerados municipales, capa 50.
- `streets.geojson`: calles municipales, capa 51.
- `greens.geojson`: zonas verdes municipales, capa 53.
- `buildings.geojson`: construcciones de la capa catastral publicada por IDE
  Sevilla.
- `obstacles.geojson`: muros, vallas, alambradas y verjas de la capa fina 55.
- `trees.geojson`: arboles y palmeras de la capa fina 55.
- `openstreetmap.osm`: extracto OSM API 0.6 del rectangulo de trabajo.
- `pnoa.jpg`: ortofoto PNOA de maxima actualidad servida por WMS.
- `metadata.json`: URLs, parametros espaciales, fecha de captura, tamanos y
  hashes SHA-256.

Todos los GeoJSON usan WGS84 (`EPSG:4326`) y coordenadas longitud/latitud. Las
consultas de entidades usan interseccion con `boundary.geojson`; el servicio
puede devolver la geometria completa de una entidad que cruce el limite, no una
geometria recortada. El PNOA cubre exactamente
`-5.9663,37.3904,-5.9573,37.4001` a 1400 x 1800 pixeles.

## Reproduccion

Desde la raiz del repositorio:

```powershell
python tools/fetch-san-pablo-source-data.py
```

Para conservar ficheros ya descargados y completar solo los ausentes:

```powershell
python tools/fetch-san-pablo-source-data.py --skip-existing
```

Las fuentes remotas pueden actualizarse. Por eso dos ejecuciones en fechas
distintas no tienen por que producir el mismo hash; `metadata.json` registra la
fecha y el contenido exacto de cada captura.

## Atribucion y licencias

- **IDE Sevilla / Ayuntamiento de Sevilla**: limite, Guia Urbana y servicio
  catastral publicados por la Infraestructura de Datos Espaciales de la
  Gerencia de Urbanismo y Medio Ambiente. El portal los declara datos abiertos
  y remite al regimen de reutilizacion de la informacion del sector publico
  (Leyes 37/2007 y 18/2015). Debe conservarse la atribucion y comprobarse la
  condicion vigente antes de redistribuir derivados:
  <https://www.urbanismosevilla.org/areas/sostenibilidad-innovacion/ide/carta-de-servicios/informacion-urbana/datos-abiertos>.
- **PNOA / IGN**: ortoimagen PNOA de maxima actualidad, (c) Instituto
  Geografico Nacional de Espana. La politica de datos IGN/CNIG permite el uso
  libre y gratuito con reconocimiento de origen y propiedad mediante una
  licencia compatible con CC BY 4.0:
  <https://centrodedescargas.cnig.es/CentroDescargas/politica-datos>.
- **OpenStreetMap**: datos (c) colaboradores de OpenStreetMap, disponibles bajo
  Open Database License 1.0 (ODbL). La atribucion y el enlace a la licencia son
  obligatorios; una base de datos derivada que se publique puede activar las
  obligaciones de compartir-igual de la ODbL:
  <https://www.openstreetmap.org/copyright>.

Estas notas son de procedencia, no sustituyen los textos legales de cada
proveedor ni implican que IDE Sevilla, IGN o OpenStreetMap respalden el juego.
