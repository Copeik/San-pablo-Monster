#!/usr/bin/env python3
from __future__ import annotations

"""Descarga las fuentes cartograficas reproducibles de San Pablo C (Sevilla).

El script usa exclusivamente la biblioteca estandar. Las consultas espaciales se
realizan contra el limite oficial del barrio (fid 45), en WGS84. Los lotes de la
capa municipal de detalle se fusionan en una unica coleccion por tema y todas
las colecciones se escriben con orden y formato deterministas.
"""

import argparse
import hashlib
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "assets" / "maps" / "san-pablo-source"

BBOX = (-5.9663, 37.3904, -5.9573, 37.4001)
CRS = "EPSG:4326"
GEOMETRY_PRECISION = 7
FINE_BATCH_SIZE = 500
PNOA_WIDTH = 1400
PNOA_HEIGHT = 1800

ARCGIS_ROOT = "https://cdu.urbanismosevilla.org/arcgis/rest/services"
BOUNDARY_QUERY_URL = (
    f"{ARCGIS_ROOT}/Hosted/BarriosIDE/FeatureServer/0/query"
)
MUNICIPAL_FEATURE_ROOT = (
    f"{ARCGIS_ROOT}/MapaBase/Guia_Urbana_2026/FeatureServer"
)
CATASTRO_QUERY_URL = (
    f"{ARCGIS_ROOT}/Hosted/Catastro_PARCELA_CONSTRU/FeatureServer/1/query"
)
FINE_QUERY_URL = f"{MUNICIPAL_FEATURE_ROOT}/55/query"
OSM_MAP_URL = "https://api.openstreetmap.org/api/0.6/map"
PNOA_WMS_URL = "https://www.ign.es/wms-inspire/pnoa-ma"

USER_AGENT = "pokemon-adventure-san-pablo-source-fetcher/1.0"
TIMEOUT_SECONDS = 120
MAX_ATTEMPTS = 3


@dataclass(frozen=True)
class LayerSpec:
    filename: str
    label: str
    query_url: str
    out_fields: str


LAYERS = (
    LayerSpec(
        "surfaces.geojson",
        "superficies municipales",
        f"{MUNICIPAL_FEATURE_ROOT}/27/query",
        "objectid,layer,Shape__Area,Shape__Length",
    ),
    LayerSpec(
        "sidewalks.geojson",
        "acerados municipales",
        f"{MUNICIPAL_FEATURE_ROOT}/50/query",
        "objectid,layer",
    ),
    LayerSpec(
        "streets.geojson",
        "calles municipales",
        f"{MUNICIPAL_FEATURE_ROOT}/51/query",
        "objectid_12,cvia_num,nombre,jerarquia,sup_total,long_calle,"
        "sup_tramo,modificada",
    ),
    LayerSpec(
        "greens.geojson",
        "zonas verdes municipales",
        f"{MUNICIPAL_FEATURE_ROOT}/53/query",
        "objectid_12,vision,revision,layer,Shape__Area,Shape__Length",
    ),
    LayerSpec(
        "buildings.geojson",
        "construcciones catastrales",
        CATASTRO_QUERY_URL,
        "fid,constru,refcat,area,fechaalta,fechabaja,masa,parcela",
    ),
)

OBSTACLE_WHERE = (
    "(layer LIKE '%MURO%' OR layer LIKE '%VALLA%' "
    "OR layer LIKE '%ALAMBRADA%' OR layer LIKE '%VERJA%')"
)
TREE_WHERE = "layer IN ('168153 - ARBOL','198177 - PALMERA')"

README_TEXT = """# Fuentes cartograficas de San Pablo C

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
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Descarga las fuentes GIS oficiales y de contraste de San Pablo C.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Directorio que recibira las fuentes y su manifiesto.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Valida y conserva cada fichero existente en vez de descargarlo otra vez.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def iso_mtime(path: Path) -> str:
    return (
        datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def url_with_query(url: str, params: Mapping[str, Any]) -> str:
    return f"{url}?{urlencode(params)}"


def request_bytes(
    url: str,
    *,
    form: Mapping[str, Any] | None = None,
    accept: str = "*/*",
) -> bytes:
    data = None if form is None else urlencode(form).encode("utf-8")
    headers = {"Accept": accept, "User-Agent": USER_AGENT}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"

    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            request = Request(url, data=data, headers=headers, method="POST" if data else "GET")
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                payload = response.read()
            if not payload:
                raise RuntimeError(f"Respuesta vacia de {url}")
            return payload
        except HTTPError as exc:
            detail = exc.read(500).decode("utf-8", errors="replace").strip()
            last_error = RuntimeError(
                f"HTTP {exc.code} al consultar {url}: {detail or exc.reason}"
            )
            if exc.code not in {408, 429, 500, 502, 503, 504}:
                break
        except (URLError, TimeoutError, OSError) as exc:
            last_error = RuntimeError(f"No se pudo consultar {url}: {exc}")

        if attempt + 1 < MAX_ATTEMPTS:
            time.sleep(2**attempt)

    assert last_error is not None
    raise last_error


def parse_json_payload(payload: bytes, label: str) -> Any:
    try:
        value = json.loads(payload.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        prefix = payload[:160].decode("utf-8", errors="replace")
        raise RuntimeError(f"{label} no devolvio JSON valido: {prefix!r}") from exc

    if isinstance(value, dict) and "error" in value:
        error = value["error"]
        if isinstance(error, dict):
            message = error.get("message", "error ArcGIS")
            details = error.get("details") or []
            detail_text = "; ".join(str(item) for item in details)
            raise RuntimeError(f"{label}: {message}{': ' + detail_text if detail_text else ''}")
        raise RuntimeError(f"{label}: {error}")
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def feature_identifier(feature: Mapping[str, Any]) -> Any:
    if feature.get("id") is not None:
        return feature["id"]
    properties = feature.get("properties")
    if not isinstance(properties, Mapping):
        return None
    lower = {str(key).lower(): value for key, value in properties.items()}
    for field in ("objectid", "objectid_12", "fid", "id"):
        if lower.get(field) is not None:
            return lower[field]
    return None


def identifier_sort_key(value: Any) -> tuple[int, Any]:
    if isinstance(value, bool):
        return (2, str(value))
    if isinstance(value, (int, float)):
        return (0, value)
    if isinstance(value, str):
        try:
            return (0, int(value))
        except ValueError:
            return (1, value)
    return (2, canonical_json(value))


def feature_sort_key(feature: Mapping[str, Any]) -> tuple[Any, ...]:
    identifier = feature_identifier(feature)
    if identifier is None:
        return (1, (2, ""), canonical_json(feature))
    return (0, identifier_sort_key(identifier), canonical_json(feature))


def normalize_feature_collection(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("type") != "FeatureCollection":
        raise RuntimeError(f"{label} no es una coleccion GeoJSON FeatureCollection.")
    if value.get("exceededTransferLimit") is True:
        raise RuntimeError(f"{label} excedio el limite de transferencia del servicio.")
    features = value.get("features")
    if not isinstance(features, list):
        raise RuntimeError(f"{label} no contiene una lista GeoJSON de entidades.")
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise RuntimeError(f"{label}: entidad {index} no es un GeoJSON Feature valido.")
    return {"type": "FeatureCollection", "features": sorted(features, key=feature_sort_key)}


def stable_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(
        "utf-8"
    )


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        with temporary.open("wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def read_json_file(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"No se pudo leer {label} existente ({path}): {exc}") from exc


def obtain_geojson(
    path: Path,
    label: str,
    skip_existing: bool,
    fetcher: Callable[[], dict[str, Any]],
) -> tuple[dict[str, Any], bool]:
    if skip_existing and path.is_file():
        value = normalize_feature_collection(read_json_file(path, label), label)
        print(f"conservado  {path.name} ({len(value['features'])} entidades)")
        return value, False

    value = normalize_feature_collection(fetcher(), label)
    atomic_write(path, stable_json_bytes(value))
    print(f"descargado {path.name} ({len(value['features'])} entidades)")
    return value, True


def signed_ring_area(ring: Sequence[Sequence[float]]) -> float:
    if len(ring) < 4:
        raise RuntimeError("El limite contiene un anillo con menos de cuatro vertices.")
    return sum(
        float(first[0]) * float(second[1]) - float(second[0]) * float(first[1])
        for first, second in zip(ring, ring[1:])
    ) / 2.0


def esri_ring(ring: Sequence[Sequence[float]], *, clockwise: bool) -> list[list[float]]:
    result = [list(coordinate) for coordinate in ring]
    if result[0] != result[-1]:
        result.append(result[0][:])
    area = signed_ring_area(result)
    if area == 0:
        raise RuntimeError("El limite contiene un anillo de area nula.")
    if (area < 0) != clockwise:
        result.reverse()
    return result


def boundary_as_esri_polygon(boundary: Mapping[str, Any]) -> dict[str, Any]:
    features = boundary.get("features")
    if not isinstance(features, list) or len(features) != 1:
        raise RuntimeError("La consulta fid=45 debe devolver exactamente un limite de barrio.")
    feature = features[0]
    properties = feature.get("properties")
    if not isinstance(properties, Mapping) or int(properties.get("fid", -1)) != 45:
        raise RuntimeError("La entidad de limite recibida no corresponde a fid=45.")
    geometry = feature.get("geometry")
    if not isinstance(geometry, Mapping):
        raise RuntimeError("El limite fid=45 no contiene geometria.")

    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    polygons: Iterable[Any]
    if geometry_type == "Polygon" and isinstance(coordinates, list):
        polygons = [coordinates]
    elif geometry_type == "MultiPolygon" and isinstance(coordinates, list):
        polygons = coordinates
    else:
        raise RuntimeError(f"Geometria de limite no soportada: {geometry_type!r}")

    rings: list[list[list[float]]] = []
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            raise RuntimeError("El limite contiene un poligono vacio.")
        for index, ring in enumerate(polygon):
            if not isinstance(ring, list):
                raise RuntimeError("El limite contiene un anillo no valido.")
            rings.append(esri_ring(ring, clockwise=index == 0))
    return {"rings": rings, "spatialReference": {"wkid": 4326}}


def spatial_query_parameters(esri_geometry: Mapping[str, Any]) -> dict[str, str]:
    return {
        "where": "1=1",
        "geometry": canonical_json(esri_geometry),
        "geometryType": "esriGeometryPolygon",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }


def arcgis_feature_count(
    query_url: str,
    esri_geometry: Mapping[str, Any],
    label: str,
) -> int:
    parameters = spatial_query_parameters(esri_geometry)
    parameters.update({"returnCountOnly": "true", "f": "json"})
    value = parse_json_payload(
        request_bytes(query_url, form=parameters, accept="application/json"),
        f"conteo de {label}",
    )
    if not isinstance(value, dict) or not isinstance(value.get("count"), int):
        raise RuntimeError(f"El servicio no devolvio un conteo valido para {label}.")
    return value["count"]


def fetch_arcgis_layer(
    spec: LayerSpec,
    esri_geometry: Mapping[str, Any],
) -> dict[str, Any]:
    expected_count = arcgis_feature_count(spec.query_url, esri_geometry, spec.label)
    parameters = spatial_query_parameters(esri_geometry)
    parameters.update(
        {
            "outFields": spec.out_fields,
            "returnGeometry": "true",
            "outSR": "4326",
            "geometryPrecision": str(GEOMETRY_PRECISION),
            "f": "geojson",
        }
    )
    value = parse_json_payload(
        request_bytes(spec.query_url, form=parameters, accept="application/geo+json"),
        spec.label,
    )
    collection = normalize_feature_collection(value, spec.label)
    actual_count = len(collection["features"])
    if actual_count != expected_count:
        raise RuntimeError(
            f"{spec.label}: se esperaban {expected_count} entidades y llegaron "
            f"{actual_count}; la respuesta podria estar truncada."
        )
    return collection


def fetch_object_ids(
    where: str,
    esri_geometry: Mapping[str, Any],
    label: str,
) -> list[int | str]:
    parameters = spatial_query_parameters(esri_geometry)
    parameters.update({"where": where, "returnIdsOnly": "true", "f": "json"})
    value = parse_json_payload(
        request_bytes(FINE_QUERY_URL, form=parameters, accept="application/json"),
        f"identificadores de {label}",
    )
    if not isinstance(value, dict) or not isinstance(value.get("objectIds"), list):
        raise RuntimeError(f"La capa fina no devolvio objectIds validos para {label}.")
    identifiers = value["objectIds"]
    if len({str(identifier) for identifier in identifiers}) != len(identifiers):
        raise RuntimeError(f"La capa fina devolvio objectIds duplicados para {label}.")
    return sorted(identifiers, key=identifier_sort_key)


def chunks(values: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def fetch_fine_layer(
    where: str,
    esri_geometry: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    identifiers = fetch_object_ids(where, esri_geometry, label)
    features: list[dict[str, Any]] = []
    for batch in chunks(identifiers, FINE_BATCH_SIZE):
        parameters = {
            "objectIds": ",".join(str(identifier) for identifier in batch),
            "outFields": "objectid,layer,id,Shape__Length",
            "returnGeometry": "true",
            "outSR": "4326",
            "geometryPrecision": str(GEOMETRY_PRECISION),
            "f": "geojson",
        }
        value = parse_json_payload(
            request_bytes(FINE_QUERY_URL, form=parameters, accept="application/geo+json"),
            f"lote de {label}",
        )
        collection = normalize_feature_collection(value, f"lote de {label}")
        features.extend(collection["features"])

    expected = {str(identifier) for identifier in identifiers}
    returned_ids = [feature_identifier(feature) for feature in features]
    if any(identifier is None for identifier in returned_ids):
        raise RuntimeError(f"Una entidad de {label} llego sin objectid.")
    returned = {str(identifier) for identifier in returned_ids}
    if returned != expected or len(returned_ids) != len(expected):
        missing = sorted(expected - returned)[:8]
        unexpected = sorted(returned - expected)[:8]
        raise RuntimeError(
            f"Lotes incompletos para {label}: faltan={missing}, inesperados={unexpected}, "
            f"recibidos={len(returned_ids)}, esperados={len(expected)}."
        )
    return normalize_feature_collection(
        {"type": "FeatureCollection", "features": features}, label
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def obtain_binary(
    path: Path,
    label: str,
    source_url: str,
    skip_existing: bool,
    validator: Callable[[bytes], Mapping[str, Any]],
) -> tuple[dict[str, Any], bool]:
    if skip_existing and path.is_file():
        payload = path.read_bytes()
        details = dict(validator(payload))
        print(f"conservado  {path.name} ({len(payload)} bytes)")
        return details, False

    payload = request_bytes(source_url)
    details = dict(validator(payload))
    atomic_write(path, payload)
    print(f"descargado {path.name} ({len(payload)} bytes)")
    return details, True


def validate_osm(payload: bytes) -> Mapping[str, Any]:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise RuntimeError("La API de OpenStreetMap no devolvio XML valido.") from exc
    if root.tag != "osm" or root.attrib.get("version") != "0.6":
        raise RuntimeError("La respuesta no es un extracto OSM API 0.6.")
    counts = {"nodes": 0, "ways": 0, "relations": 0}
    for child in root:
        if child.tag == "node":
            counts["nodes"] += 1
        elif child.tag == "way":
            counts["ways"] += 1
        elif child.tag == "relation":
            counts["relations"] += 1
    return counts


JPEG_SOF_MARKERS = {
    0xC0,
    0xC1,
    0xC2,
    0xC3,
    0xC5,
    0xC6,
    0xC7,
    0xC9,
    0xCA,
    0xCB,
    0xCD,
    0xCE,
    0xCF,
}


def jpeg_dimensions(payload: bytes) -> tuple[int, int]:
    if len(payload) < 4 or payload[:2] != b"\xff\xd8":
        prefix = payload[:120].decode("utf-8", errors="replace")
        raise RuntimeError(f"El WMS PNOA no devolvio un JPEG: {prefix!r}")
    offset = 2
    while offset + 4 <= len(payload):
        while offset < len(payload) and payload[offset] == 0xFF:
            offset += 1
        if offset >= len(payload):
            break
        marker = payload[offset]
        offset += 1
        if marker in {0x01, 0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(payload):
            break
        length = int.from_bytes(payload[offset : offset + 2], "big")
        if length < 2 or offset + length > len(payload):
            break
        if marker in JPEG_SOF_MARKERS:
            if length < 7:
                break
            height = int.from_bytes(payload[offset + 3 : offset + 5], "big")
            width = int.from_bytes(payload[offset + 5 : offset + 7], "big")
            return width, height
        offset += length
    raise RuntimeError("No se pudieron leer las dimensiones del JPEG PNOA.")


def validate_pnoa(payload: bytes) -> Mapping[str, Any]:
    width, height = jpeg_dimensions(payload)
    if (width, height) != (PNOA_WIDTH, PNOA_HEIGHT):
        raise RuntimeError(
            f"El WMS PNOA devolvio {width}x{height}; se esperaba "
            f"{PNOA_WIDTH}x{PNOA_HEIGHT}."
        )
    return {"width": width, "height": height, "format": "image/jpeg"}


def load_prior_metadata(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def retrieval_date(
    path: Path,
    filename: str,
    source_url: str,
    fetched: bool,
    prior_metadata: Mapping[str, Any],
) -> str:
    if fetched:
        return utc_now()
    prior_files = prior_metadata.get("files")
    if isinstance(prior_files, Mapping):
        previous = prior_files.get(filename)
        if (
            isinstance(previous, Mapping)
            and previous.get("source_url") == source_url
            and previous.get("sha256") == sha256_file(path)
            and isinstance(previous.get("retrieved_at_utc"), str)
        ):
            return previous["retrieved_at_utc"]
    return iso_mtime(path)


def file_record(
    path: Path,
    source_url: str,
    fetched: bool,
    prior_metadata: Mapping[str, Any],
    **details: Any,
) -> dict[str, Any]:
    record = {
        "bytes": path.stat().st_size,
        "retrieved_at_utc": retrieval_date(
            path, path.name, source_url, fetched, prior_metadata
        ),
        "sha256": sha256_file(path),
        "source_url": source_url,
    }
    record.update(details)
    return record


def boundary_request() -> tuple[str, dict[str, str]]:
    parameters = {
        "where": "fid=45",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "geometryPrecision": str(GEOMETRY_PRECISION),
        "f": "geojson",
    }
    return url_with_query(BOUNDARY_QUERY_URL, parameters), parameters


def osm_request_url() -> str:
    bbox = ",".join(str(value) for value in BBOX)
    return url_with_query(OSM_MAP_URL, {"bbox": bbox})


def pnoa_request_url() -> str:
    bbox = ",".join(str(value) for value in BBOX)
    parameters = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": "OI.OrthoimageCoverage",
        "STYLES": "",
        "SRS": CRS,
        "BBOX": bbox,
        "WIDTH": str(PNOA_WIDTH),
        "HEIGHT": str(PNOA_HEIGHT),
        "FORMAT": "image/jpeg",
        "TRANSPARENT": "false",
    }
    return url_with_query(PNOA_WMS_URL, parameters)


def main() -> int:
    args = parse_args()
    output = args.output.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)

    metadata_path = output / "metadata.json"
    prior_metadata = load_prior_metadata(metadata_path) if args.skip_existing else {}
    records: dict[str, Any] = {}

    boundary_url, boundary_parameters = boundary_request()
    boundary_path = output / "boundary.geojson"
    boundary, boundary_fetched = obtain_geojson(
        boundary_path,
        "limite oficial de San Pablo C",
        args.skip_existing,
        lambda: parse_json_payload(
            request_bytes(boundary_url, accept="application/geo+json"),
            "limite oficial de San Pablo C",
        ),
    )
    esri_geometry = boundary_as_esri_polygon(boundary)
    records[boundary_path.name] = file_record(
        boundary_path,
        boundary_url,
        boundary_fetched,
        prior_metadata,
        feature_count=len(boundary["features"]),
        format="GeoJSON",
        crs=CRS,
        query=boundary_parameters,
    )

    spatial_request_summary = {
        "where": "1=1",
        "geometry": "boundary.geojson",
        "geometryType": "esriGeometryPolygon",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outSR": "4326",
        "geometryPrecision": GEOMETRY_PRECISION,
    }
    for spec in LAYERS:
        path = output / spec.filename
        collection, fetched = obtain_geojson(
            path,
            spec.label,
            args.skip_existing,
            lambda spec=spec: fetch_arcgis_layer(spec, esri_geometry),
        )
        records[path.name] = file_record(
            path,
            spec.query_url,
            fetched,
            prior_metadata,
            feature_count=len(collection["features"]),
            format="GeoJSON",
            crs=CRS,
            query={**spatial_request_summary, "outFields": spec.out_fields},
        )

    fine_specs = (
        ("obstacles.geojson", "obstaculos lineales", OBSTACLE_WHERE),
        ("trees.geojson", "arboles y palmeras", TREE_WHERE),
    )
    for filename, label, where in fine_specs:
        path = output / filename
        collection, fetched = obtain_geojson(
            path,
            label,
            args.skip_existing,
            lambda where=where, label=label: fetch_fine_layer(where, esri_geometry, label),
        )
        records[path.name] = file_record(
            path,
            FINE_QUERY_URL,
            fetched,
            prior_metadata,
            feature_count=len(collection["features"]),
            format="GeoJSON",
            crs=CRS,
            query={
                **spatial_request_summary,
                "where": where,
                "id_discovery": "returnIdsOnly=true",
                "batch_size": FINE_BATCH_SIZE,
                "outFields": "objectid,layer,id,Shape__Length",
            },
        )

    osm_url = osm_request_url()
    osm_path = output / "openstreetmap.osm"
    osm_details, osm_fetched = obtain_binary(
        osm_path,
        "extracto OpenStreetMap",
        osm_url,
        args.skip_existing,
        validate_osm,
    )
    records[osm_path.name] = file_record(
        osm_path,
        osm_url,
        osm_fetched,
        prior_metadata,
        format="OSM XML 0.6",
        bbox_wgs84=list(BBOX),
        **osm_details,
    )

    pnoa_url = pnoa_request_url()
    pnoa_path = output / "pnoa.jpg"
    pnoa_details, pnoa_fetched = obtain_binary(
        pnoa_path,
        "ortofoto PNOA",
        pnoa_url,
        args.skip_existing,
        validate_pnoa,
    )
    records[pnoa_path.name] = file_record(
        pnoa_path,
        pnoa_url,
        pnoa_fetched,
        prior_metadata,
        bbox_wgs84=list(BBOX),
        crs=CRS,
        axis_order="longitude,latitude (WMS 1.1.1)",
        **pnoa_details,
    )

    readme_path = output / "README.md"
    readme_fetched = not (args.skip_existing and readme_path.is_file())
    if readme_fetched:
        atomic_write(readme_path, README_TEXT.encode("utf-8"))
        print(f"generado   {readme_path.name}")
    else:
        print(f"conservado  {readme_path.name}")
    records[readme_path.name] = file_record(
        readme_path,
        "tools/fetch-san-pablo-source-data.py (documentacion generada)",
        readme_fetched,
        prior_metadata,
        format="Markdown",
    )

    metadata = {
        "schema_version": 1,
        "generated_at_utc": utc_now(),
        "generator": "tools/fetch-san-pablo-source-data.py",
        "area": {
            "name": "San Pablo C, Sevilla, Espana",
            "boundary": "boundary.geojson (Hosted/BarriosIDE fid=45)",
            "bbox_wgs84": list(BBOX),
            "crs": CRS,
            "coordinate_order": "longitude,latitude",
        },
        "pnoa": {
            "file": pnoa_path.name,
            "bbox_wgs84": list(BBOX),
            "crs": CRS,
            "width": PNOA_WIDTH,
            "height": PNOA_HEIGHT,
            "format": "image/jpeg",
            "wms_version": "1.1.1",
            "axis_order": "longitude,latitude",
        },
        "fine_layer_batch_size": FINE_BATCH_SIZE,
        "geometry_precision_decimals": GEOMETRY_PRECISION,
        "hash_algorithm": "SHA-256",
        "files": records,
    }
    atomic_write(metadata_path, stable_json_bytes(metadata))
    print(f"generado   {metadata_path.name}")
    print(f"Fuentes guardadas en {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
