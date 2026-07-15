from __future__ import annotations

"""Construye la geografia GIS y la referencia PNOA rectificada de San Pablo C.

El generador trabaja exclusivamente con coordenadas WGS84 de las fuentes y usa
una proyeccion metrica local lineal. Esa eleccion mantiene una unica afinidad
reproducible para los vectores y para la ortofoto, algo importante para que la
comparacion visual no acumule transformaciones ligeramente distintas.
"""

import argparse
import json
import math
import re
import sys
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, Mapping, Sequence

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = Path("assets/maps/san-pablo-source")
DEFAULT_GEOGRAPHY_OUTPUT = Path("map-geography.js")
DEFAULT_REFERENCE_OUTPUT = Path("assets/maps/san-pablo-reference-rectified.png")
DEFAULT_AUDIT_OUTPUT = Path("assets/maps/san-pablo-geodata-audit.json")

WORLD_WIDTH = 2048
WORLD_HEIGHT = 4096
PIXELS_PER_METRE = 4.0
ROTATION_DEGREES = -40.85
RDP_TOLERANCE_PIXELS = 0.75

# Peticion WMS usada para la ortofoto PNOA entregada con las fuentes. Se usa
# unicamente cuando no hay --raster-bounds, metadata o world file.
PNOA_FALLBACK_BOUNDS = (-5.9663, 37.3904, -5.9573, 37.4001)

Point = tuple[float, float]
JsonObject = dict[str, Any]


class BuildError(RuntimeError):
    """Error de entrada o de contrato con un mensaje apto para CLI."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Genera map-geography.js, una referencia PNOA rectificada y una "
            "auditoria GIS para San Pablo C."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--boundary", type=Path, help="GeoJSON o JSON Esri del limite oficial.")
    parser.add_argument("--streets", type=Path, help="GeoJSON de superficies de calzada.")
    parser.add_argument("--sidewalks", type=Path, help="GeoJSON de aceras.")
    parser.add_argument("--surfaces", type=Path, help="GeoJSON de superficies municipales.")
    parser.add_argument("--greens", type=Path, help="GeoJSON de zonas verdes.")
    parser.add_argument("--buildings", type=Path, help="GeoJSON catastral de construcciones.")
    parser.add_argument(
        "--obstacles",
        type=Path,
        nargs="+",
        help="Uno o mas GeoJSON de muros, vallas, alambradas y cancelas.",
    )
    parser.add_argument(
        "--trees",
        type=Path,
        nargs="+",
        help="Uno o mas GeoJSON de arboles y palmeras.",
    )
    parser.add_argument("--osm", type=Path, help="Extracto OpenStreetMap .osm/.xml.")
    parser.add_argument("--pnoa", type=Path, help="JPEG/PNG PNOA norte arriba.")
    parser.add_argument(
        "--metadata",
        type=Path,
        help="JSON opcional con bbox/bounds y CRS de la ortofoto.",
    )
    parser.add_argument(
        "--raster-bounds",
        type=float,
        nargs=4,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        help="Cobertura WGS84 exacta de la ortofoto; prevalece sobre metadata.",
    )
    parser.add_argument("--geography-out", type=Path, default=DEFAULT_GEOGRAPHY_OUTPUT)
    parser.add_argument("--reference-out", type=Path, default=DEFAULT_REFERENCE_OUTPUT)
    parser.add_argument("--audit-out", type=Path, default=DEFAULT_AUDIT_OUTPUT)
    parser.add_argument("--world-width", type=int, default=WORLD_WIDTH)
    parser.add_argument("--world-height", type=int, default=WORLD_HEIGHT)
    parser.add_argument("--scale", type=float, default=PIXELS_PER_METRE)
    parser.add_argument("--rotation-deg", type=float, default=ROTATION_DEGREES)
    parser.add_argument("--rdp-tolerance", type=float, default=RDP_TOLERANCE_PIXELS)
    parser.add_argument(
        "--boundary-overlay-width",
        type=int,
        default=3,
        help="Grosor en px de la linea discreta sobre la referencia rectificada.",
    )
    return parser.parse_args()


def resolve(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def require_positive_configuration(args: argparse.Namespace) -> None:
    for label in ("world_width", "world_height"):
        if getattr(args, label) <= 0:
            raise BuildError(f"--{label.replace('_', '-')} debe ser mayor que cero.")
    if args.scale <= 0:
        raise BuildError("--scale debe ser mayor que cero.")
    if args.rdp_tolerance < 0:
        raise BuildError("--rdp-tolerance no puede ser negativo.")
    if args.boundary_overlay_width < 0:
        raise BuildError("--boundary-overlay-width no puede ser negativo.")


def first_matching_file(source_dir: Path, explicit: Path | None, patterns: Sequence[str], label: str) -> Path:
    if explicit is not None:
        path = resolve(explicit)
        if not path.is_file():
            raise BuildError(f"No existe {label}: {path}")
        return path

    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(path for path in source_dir.glob(pattern) if path.is_file())
    unique = sorted(set(matches), key=lambda path: path.name.casefold())
    if not unique:
        raise BuildError(
            f"No se encontro {label} en {source_dir}. Usa su opcion CLI para indicar la ruta."
        )
    if len(unique) > 1:
        names = ", ".join(path.name for path in unique)
        raise BuildError(f"Hay varios candidatos para {label}: {names}. Indica la ruta explicitamente.")
    return unique[0]


def matching_files(
    source_dir: Path,
    explicit: Sequence[Path] | None,
    patterns: Sequence[str],
    label: str,
) -> list[Path]:
    if explicit:
        paths = [resolve(path) for path in explicit]
    else:
        paths = sorted(
            {
                path
                for pattern in patterns
                for path in source_dir.glob(pattern)
                if path.is_file()
            },
            key=lambda path: path.name.casefold(),
        )
    missing = [path for path in paths if not path.is_file()]
    if missing:
        raise BuildError(f"No existe {label}: {missing[0]}")
    if not paths:
        raise BuildError(
            f"No se encontraron archivos de {label} en {source_dir}. Indica sus rutas por CLI."
        )
    return paths


@dataclass(frozen=True)
class Sources:
    source_dir: Path
    boundary: Path
    streets: Path
    sidewalks: Path
    surfaces: Path
    greens: Path
    buildings: Path
    obstacles: tuple[Path, ...]
    trees: tuple[Path, ...]
    osm: Path
    pnoa: Path
    metadata: Path | None


def discover_sources(args: argparse.Namespace) -> Sources:
    source_dir = resolve(args.source_dir)
    if not source_dir.is_dir() and not all(
        (
            args.boundary,
            args.streets,
            args.sidewalks,
            args.surfaces,
            args.greens,
            args.buildings,
            args.obstacles,
            args.trees,
            args.osm,
            args.pnoa,
        )
    ):
        raise BuildError(
            f"No existe el directorio de fuentes {source_dir}. "
            "Crealo o proporciona todas las rutas de entrada por CLI."
        )

    metadata: Path | None = resolve(args.metadata) if args.metadata else None
    if metadata is None and source_dir.is_dir():
        metadata_candidates = sorted(
            {
                *source_dir.glob("*metadata*.json"),
                *source_dir.glob("*pnoa*.metadata.json"),
            },
            key=lambda path: path.name.casefold(),
        )
        if len(metadata_candidates) == 1:
            metadata = metadata_candidates[0]
    if metadata is not None and not metadata.is_file():
        raise BuildError(f"No existe la metadata de raster: {metadata}")

    return Sources(
        source_dir=source_dir,
        boundary=first_matching_file(
            source_dir,
            args.boundary,
            ("*boundary*.geojson", "*boundary*.json", "*limite*.geojson", "*limite*.json"),
            "el limite oficial",
        ),
        streets=first_matching_file(
            source_dir,
            args.streets,
            ("*streets*.geojson", "*calles*.geojson", "*viario*.geojson"),
            "las calzadas",
        ),
        sidewalks=first_matching_file(
            source_dir,
            args.sidewalks,
            ("*sidewalks*.geojson", "*aceras*.geojson", "*acerado*.geojson"),
            "las aceras",
        ),
        surfaces=first_matching_file(
            source_dir,
            args.surfaces,
            ("*surfaces*.geojson", "*superficies*.geojson"),
            "las superficies municipales",
        ),
        greens=first_matching_file(
            source_dir,
            args.greens,
            ("*greens*.geojson", "*zonas-verdes*.geojson", "*verde*.geojson"),
            "las zonas verdes",
        ),
        buildings=first_matching_file(
            source_dir,
            args.buildings,
            ("*buildings*.geojson", "*edificios*.geojson", "*construcciones*.geojson"),
            "los edificios catastrales",
        ),
        obstacles=tuple(
            matching_files(
                source_dir,
                args.obstacles,
                ("*obstacle*.geojson", "*barrera*.geojson", "*muros*.geojson"),
                "obstaculos",
            )
        ),
        trees=tuple(
            matching_files(
                source_dir,
                args.trees,
                ("*trees*.geojson", "*arbol*.geojson", "*vegetation*.geojson"),
                "arboles/palmeras",
            )
        ),
        osm=first_matching_file(
            source_dir,
            args.osm,
            ("*.osm.xml", "*.osm", "*osm*.xml"),
            "el extracto OSM",
        ),
        pnoa=first_matching_file(
            source_dir,
            args.pnoa,
            ("*pnoa*.jpg", "*pnoa*.jpeg", "*pnoa*.png"),
            "la ortofoto PNOA",
        ),
        metadata=metadata,
    )


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def json_safe(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def normalise_geometry(raw: Mapping[str, Any] | None) -> JsonObject | None:
    if not raw:
        return None
    if isinstance(raw.get("type"), str):
        return {"type": raw["type"], "coordinates": raw.get("coordinates")}
    if "rings" in raw:
        return {"type": "Polygon", "coordinates": raw["rings"]}
    if "paths" in raw:
        paths = raw["paths"]
        geometry_type = "LineString" if len(paths) == 1 else "MultiLineString"
        return {"type": geometry_type, "coordinates": paths[0] if len(paths) == 1 else paths}
    if finite_number(raw.get("x")) and finite_number(raw.get("y")):
        return {"type": "Point", "coordinates": [raw["x"], raw["y"]]}
    return None


def load_features(path: Path) -> list[JsonObject]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BuildError(f"No se pudo leer {path}: {exc}") from exc

    if not isinstance(data, Mapping):
        raise BuildError(f"{path} no contiene un objeto JSON.")
    raw_features = data.get("features")
    if not isinstance(raw_features, list):
        if data.get("type") == "Feature":
            raw_features = [data]
        else:
            raise BuildError(f"{path} no contiene una coleccion de features.")

    features: list[JsonObject] = []
    for index, raw in enumerate(raw_features):
        if not isinstance(raw, Mapping):
            continue
        geometry = normalise_geometry(raw.get("geometry"))
        if geometry is None:
            continue
        properties = raw.get("properties")
        if not isinstance(properties, Mapping):
            properties = raw.get("attributes")
        if not isinstance(properties, Mapping):
            properties = {}
        features.append(
            {
                "id": raw.get("id"),
                "properties": json_safe(properties),
                "geometry": geometry,
                "sourceIndex": index,
            }
        )
    if not features:
        raise BuildError(f"{path} no contiene features geometricas utilizables.")
    return features


def iter_coordinate_pairs(value: Any) -> Iterator[Point]:
    if (
        isinstance(value, (list, tuple))
        and len(value) >= 2
        and finite_number(value[0])
        and finite_number(value[1])
    ):
        yield float(value[0]), float(value[1])
        return
    if isinstance(value, (list, tuple)):
        for item in value:
            yield from iter_coordinate_pairs(item)


def validate_wgs84_features(features: Sequence[JsonObject], label: str) -> None:
    points = [point for feature in features for point in iter_coordinate_pairs(feature["geometry"].get("coordinates"))]
    if not points:
        raise BuildError(f"{label} no contiene coordenadas.")
    invalid = [point for point in points if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90)]
    if invalid:
        raise BuildError(
            f"{label} no parece estar en WGS84 lon/lat; primera coordenada invalida: {invalid[0]}."
        )


def geometry_polygons(geometry: Mapping[str, Any]) -> list[list[list[Point]]]:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if kind == "Polygon" and isinstance(coordinates, list):
        return [[list(iter_coordinate_pairs(ring)) for ring in coordinates]]
    if kind == "MultiPolygon" and isinstance(coordinates, list):
        return [
            [list(iter_coordinate_pairs(ring)) for ring in polygon]
            for polygon in coordinates
            if isinstance(polygon, list)
        ]
    return []


def geometry_lines(geometry: Mapping[str, Any]) -> list[list[Point]]:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if kind == "LineString":
        return [list(iter_coordinate_pairs(coordinates))]
    if kind == "MultiLineString" and isinstance(coordinates, list):
        return [list(iter_coordinate_pairs(line)) for line in coordinates]
    if kind == "Polygon" and isinstance(coordinates, list):
        return [list(iter_coordinate_pairs(ring)) for ring in coordinates]
    return []


def signed_area(points: Sequence[Point]) -> float:
    if len(points) < 3:
        return 0.0
    return 0.5 * sum(
        a[0] * b[1] - b[0] * a[1]
        for a, b in zip(points, (*points[1:], points[0]))
    )


def select_boundary_feature(features: Sequence[JsonObject]) -> JsonObject:
    for feature in features:
        properties = feature["properties"]
        if str(properties.get("fid", "")) == "45":
            return feature
    for feature in features:
        name = normalise_text(str(feature["properties"].get("barrio", "")))
        if name == "SAN PABLO C":
            return feature

    def feature_area(feature: JsonObject) -> float:
        return max(
            (abs(signed_area(polygon[0])) for polygon in geometry_polygons(feature["geometry"]) if polygon),
            default=0.0,
        )

    return max(features, key=feature_area)


@dataclass(frozen=True)
class LocalTransform:
    world_width: int
    world_height: int
    pixels_per_metre: float
    rotation_degrees: float
    reference_lon: float
    reference_lat: float
    metres_per_degree_lon: float
    metres_per_degree_lat: float
    rotated_centre_x: float
    rotated_centre_y: float

    @classmethod
    def from_boundary(
        cls,
        boundary_points: Sequence[Point],
        *,
        world_width: int,
        world_height: int,
        pixels_per_metre: float,
        rotation_degrees: float,
    ) -> "LocalTransform":
        if not boundary_points:
            raise BuildError("El limite oficial no contiene puntos.")
        west = min(point[0] for point in boundary_points)
        east = max(point[0] for point in boundary_points)
        south = min(point[1] for point in boundary_points)
        north = max(point[1] for point in boundary_points)
        reference_lon = (west + east) / 2.0
        reference_lat = (south + north) / 2.0

        # Radios de curvatura WGS84 en la latitud de referencia.
        semi_major = 6_378_137.0
        eccentricity_squared = 6.694_379_990_141_316_5e-3
        latitude_radians = math.radians(reference_lat)
        sin_latitude = math.sin(latitude_radians)
        denominator = math.sqrt(1.0 - eccentricity_squared * sin_latitude * sin_latitude)
        prime_vertical_radius = semi_major / denominator
        meridian_radius = (
            semi_major
            * (1.0 - eccentricity_squared)
            / (denominator * denominator * denominator)
        )
        metres_per_degree_lon = (
            math.pi / 180.0 * prime_vertical_radius * math.cos(latitude_radians)
        )
        metres_per_degree_lat = math.pi / 180.0 * meridian_radius

        radians = math.radians(rotation_degrees)
        cosine = math.cos(radians)
        sine = math.sin(radians)
        rotated: list[Point] = []
        for lon, lat in boundary_points:
            local_x = (lon - reference_lon) * metres_per_degree_lon
            local_y = (lat - reference_lat) * metres_per_degree_lat
            rotated.append(
                (
                    cosine * local_x - sine * local_y,
                    sine * local_x + cosine * local_y,
                )
            )
        rotated_centre_x = (min(point[0] for point in rotated) + max(point[0] for point in rotated)) / 2.0
        rotated_centre_y = (min(point[1] for point in rotated) + max(point[1] for point in rotated)) / 2.0
        return cls(
            world_width=world_width,
            world_height=world_height,
            pixels_per_metre=pixels_per_metre,
            rotation_degrees=rotation_degrees,
            reference_lon=reference_lon,
            reference_lat=reference_lat,
            metres_per_degree_lon=metres_per_degree_lon,
            metres_per_degree_lat=metres_per_degree_lat,
            rotated_centre_x=rotated_centre_x,
            rotated_centre_y=rotated_centre_y,
        )

    @property
    def cosine(self) -> float:
        return math.cos(math.radians(self.rotation_degrees))

    @property
    def sine(self) -> float:
        return math.sin(math.radians(self.rotation_degrees))

    def project(self, lon: float, lat: float) -> Point:
        local_x = (lon - self.reference_lon) * self.metres_per_degree_lon
        local_y = (lat - self.reference_lat) * self.metres_per_degree_lat
        rotated_x = self.cosine * local_x - self.sine * local_y
        rotated_y = self.sine * local_x + self.cosine * local_y
        return (
            self.world_width / 2.0
            + (rotated_x - self.rotated_centre_x) * self.pixels_per_metre,
            self.world_height / 2.0
            - (rotated_y - self.rotated_centre_y) * self.pixels_per_metre,
        )

    def inverse(self, x: float, y: float) -> Point:
        rotated_x = self.rotated_centre_x + (x - self.world_width / 2.0) / self.pixels_per_metre
        rotated_y = self.rotated_centre_y - (y - self.world_height / 2.0) / self.pixels_per_metre
        local_x = self.cosine * rotated_x + self.sine * rotated_y
        local_y = -self.sine * rotated_x + self.cosine * rotated_y
        return (
            self.reference_lon + local_x / self.metres_per_degree_lon,
            self.reference_lat + local_y / self.metres_per_degree_lat,
        )

    def serialise(self) -> JsonObject:
        return {
            "kind": "WGS84 local tangent linear",
            "sourceCrs": "EPSG:4326",
            "referenceLonLat": [round(self.reference_lon, 9), round(self.reference_lat, 9)],
            "metresPerDegree": {
                "longitude": round(self.metres_per_degree_lon, 6),
                "latitude": round(self.metres_per_degree_lat, 6),
            },
            "rotationDegrees": self.rotation_degrees,
            "pixelsPerMetre": self.pixels_per_metre,
            "rotatedCentreMetres": [
                round(self.rotated_centre_x, 6),
                round(self.rotated_centre_y, 6),
            ],
            "screenYAxis": "down",
        }


def squared_distance_to_segment(point: Point, start: Point, end: Point) -> float:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if dx == 0 and dy == 0:
        return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2
    fraction = (
        (point[0] - start[0]) * dx + (point[1] - start[1]) * dy
    ) / (dx * dx + dy * dy)
    fraction = max(0.0, min(1.0, fraction))
    nearest = (start[0] + fraction * dx, start[1] + fraction * dy)
    return (point[0] - nearest[0]) ** 2 + (point[1] - nearest[1]) ** 2


def deduplicate_consecutive(points: Sequence[Point], tolerance: float = 1e-8) -> list[Point]:
    result: list[Point] = []
    tolerance_squared = tolerance * tolerance
    for point in points:
        if not result or (
            (point[0] - result[-1][0]) ** 2 + (point[1] - result[-1][1]) ** 2
            > tolerance_squared
        ):
            result.append(point)
    if len(result) > 1 and (
        (result[0][0] - result[-1][0]) ** 2 + (result[0][1] - result[-1][1]) ** 2
        <= tolerance_squared
    ):
        result.pop()
    return result


def rdp_open(points: Sequence[Point], tolerance: float) -> list[Point]:
    if len(points) <= 2 or tolerance <= 0:
        return list(points)
    tolerance_squared = tolerance * tolerance
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        start_index, end_index = stack.pop()
        farthest_index = -1
        farthest_distance = tolerance_squared
        for index in range(start_index + 1, end_index):
            distance = squared_distance_to_segment(
                points[index], points[start_index], points[end_index]
            )
            if distance > farthest_distance:
                farthest_distance = distance
                farthest_index = index
        if farthest_index >= 0:
            keep.add(farthest_index)
            stack.append((start_index, farthest_index))
            stack.append((farthest_index, end_index))
    return [point for index, point in enumerate(points) if index in keep]


def rdp_ring(points: Sequence[Point], tolerance: float) -> list[Point]:
    ring = deduplicate_consecutive(points)
    if len(ring) <= 3 or tolerance <= 0:
        return ring
    anchor = max(
        range(1, len(ring)),
        key=lambda index: (
            (ring[index][0] - ring[0][0]) ** 2 + (ring[index][1] - ring[0][1]) ** 2
        ),
    )
    first_arc = rdp_open(ring[: anchor + 1], tolerance)
    second_arc = rdp_open([*ring[anchor:], ring[0]], tolerance)
    simplified = deduplicate_consecutive([*first_arc[:-1], *second_arc[:-1]])
    if len(simplified) < 3 or abs(signed_area(simplified)) < 0.01:
        return ring
    return simplified


def clip_ring_to_rectangle(points: Sequence[Point], width: float, height: float) -> list[Point]:
    output = deduplicate_consecutive(points)
    if len(output) < 3:
        return []

    def clip_edge(
        subject: list[Point],
        inside: Callable[[Point], bool],
        intersection: Callable[[Point, Point], Point],
    ) -> list[Point]:
        if not subject:
            return []
        clipped: list[Point] = []
        previous = subject[-1]
        previous_inside = inside(previous)
        for current in subject:
            current_inside = inside(current)
            if current_inside:
                if not previous_inside:
                    clipped.append(intersection(previous, current))
                clipped.append(current)
            elif previous_inside:
                clipped.append(intersection(previous, current))
            previous = current
            previous_inside = current_inside
        return deduplicate_consecutive(clipped)

    def intersect_x(start: Point, end: Point, x_value: float) -> Point:
        if abs(end[0] - start[0]) < 1e-15:
            return x_value, start[1]
        ratio = (x_value - start[0]) / (end[0] - start[0])
        return x_value, start[1] + ratio * (end[1] - start[1])

    def intersect_y(start: Point, end: Point, y_value: float) -> Point:
        if abs(end[1] - start[1]) < 1e-15:
            return start[0], y_value
        ratio = (y_value - start[1]) / (end[1] - start[1])
        return start[0] + ratio * (end[0] - start[0]), y_value

    output = clip_edge(output, lambda point: point[0] >= 0, lambda a, b: intersect_x(a, b, 0))
    output = clip_edge(output, lambda point: point[0] <= width, lambda a, b: intersect_x(a, b, width))
    output = clip_edge(output, lambda point: point[1] >= 0, lambda a, b: intersect_y(a, b, 0))
    output = clip_edge(output, lambda point: point[1] <= height, lambda a, b: intersect_y(a, b, height))
    return deduplicate_consecutive(output)


def clip_segment(start: Point, end: Point, width: float, height: float) -> tuple[Point, Point] | None:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    lower = 0.0
    upper = 1.0
    for p_value, q_value in (
        (-dx, start[0]),
        (dx, width - start[0]),
        (-dy, start[1]),
        (dy, height - start[1]),
    ):
        if abs(p_value) < 1e-15:
            if q_value < 0:
                return None
            continue
        ratio = q_value / p_value
        if p_value < 0:
            if ratio > upper:
                return None
            lower = max(lower, ratio)
        else:
            if ratio < lower:
                return None
            upper = min(upper, ratio)
    return (
        (start[0] + lower * dx, start[1] + lower * dy),
        (start[0] + upper * dx, start[1] + upper * dy),
    )


def clip_polyline_to_rectangle(points: Sequence[Point], width: float, height: float) -> list[list[Point]]:
    parts: list[list[Point]] = []
    current: list[Point] = []
    for start, end in zip(points, points[1:]):
        clipped = clip_segment(start, end, width, height)
        if clipped is None:
            if len(current) >= 2:
                parts.append(deduplicate_consecutive(current))
            current = []
            continue
        clipped_start, clipped_end = clipped
        if current and math.dist(current[-1], clipped_start) <= 1e-6:
            current.append(clipped_end)
        else:
            if len(current) >= 2:
                parts.append(deduplicate_consecutive(current))
            current = [clipped_start, clipped_end]
    if len(current) >= 2:
        parts.append(deduplicate_consecutive(current))
    return [part for part in parts if len(part) >= 2]


def point_in_ring(point: Point, ring: Sequence[Point]) -> bool:
    inside = False
    x, y = point
    for start, end in zip(ring, (*ring[1:], ring[0])):
        if (start[1] > y) != (end[1] > y):
            crossing_x = (end[0] - start[0]) * (y - start[1]) / (end[1] - start[1]) + start[0]
            if x < crossing_x:
                inside = not inside
    return inside


def serialise_points(points: Sequence[Point], width: float, height: float) -> list[list[float]]:
    return [
        [round(max(0.0, min(width, point[0])), 2), round(max(0.0, min(height, point[1])), 2)]
        for point in points
    ]


def transform_polygon(
    polygon: Sequence[Sequence[Point]],
    transform: LocalTransform,
    tolerance: float,
) -> JsonObject | None:
    if not polygon or len(polygon[0]) < 3:
        return None
    projected_outer = [transform.project(*point) for point in polygon[0]]
    outer = clip_ring_to_rectangle(projected_outer, transform.world_width, transform.world_height)
    outer = rdp_ring(outer, tolerance)
    if len(outer) < 3 or abs(signed_area(outer)) < 0.01:
        return None

    holes: list[list[list[float]]] = []
    for source_hole in polygon[1:]:
        projected_hole = [transform.project(*point) for point in source_hole]
        hole = rdp_ring(
            clip_ring_to_rectangle(projected_hole, transform.world_width, transform.world_height),
            tolerance,
        )
        if (
            len(hole) >= 3
            and abs(signed_area(hole)) >= 0.01
            and point_in_ring(hole[0], outer)
        ):
            holes.append(serialise_points(hole, transform.world_width, transform.world_height))
    return {
        "points": serialise_points(outer, transform.world_width, transform.world_height),
        "holes": holes,
    }


def feature_base_id(feature: JsonObject, fallback_index: int) -> str:
    properties = feature["properties"]
    candidate = feature.get("id")
    if candidate is None:
        for key in ("objectid", "objectid_12", "fid", "refcat", "id"):
            if properties.get(key) not in (None, ""):
                candidate = properties[key]
                break
    return str(candidate if candidate is not None else fallback_index)


def polygon_records(
    features: Sequence[JsonObject],
    *,
    prefix: str,
    transform: LocalTransform,
    tolerance: float,
    enrich: Callable[[Mapping[str, Any]], Mapping[str, Any]],
) -> list[JsonObject]:
    records: list[JsonObject] = []
    for feature_index, feature in enumerate(features):
        properties = feature["properties"]
        polygons = geometry_polygons(feature["geometry"])
        base_id = feature_base_id(feature, feature_index)
        for part_index, polygon in enumerate(polygons):
            transformed = transform_polygon(polygon, transform, tolerance)
            if transformed is None:
                continue
            identifier = f"{prefix}:{base_id}"
            if len(polygons) > 1:
                identifier += f":{part_index + 1}"
            record: JsonObject = {
                "id": identifier,
                **json_safe(dict(enrich(properties))),
                **transformed,
                "properties": properties,
            }
            records.append(record)
    return records


def normalise_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return " ".join(
        "".join(character for character in decomposed if not unicodedata.combining(character))
        .upper()
        .split()
    )


ROMAN_TOKEN = re.compile(r"^[IVXLCDM]+$")


def is_solid_construction(value: Any) -> bool:
    tokens = [token.strip() for token in normalise_text(str(value or "")).split("+")]
    return any(token in {"TRF", "DEP"} or ROMAN_TOKEN.fullmatch(token) for token in tokens)


def barrier_kind(layer: Any) -> str:
    normalised = normalise_text(str(layer or ""))
    if "VERJA" in normalised or "CANCELA" in normalised:
        return "gate"
    if "ALAMBRADA" in normalised:
        return "wireFence"
    if "VALLA" in normalised:
        return "fence"
    return "wall"


def build_barrier_records(
    features: Sequence[JsonObject], transform: LocalTransform, tolerance: float
) -> list[JsonObject]:
    records: list[JsonObject] = []
    for feature_index, feature in enumerate(features):
        properties = feature["properties"]
        base_id = feature_base_id(feature, feature_index)
        source_layer = str(properties.get("layer") or "")
        for line_index, line in enumerate(geometry_lines(feature["geometry"])):
            projected = [transform.project(*point) for point in line]
            parts = clip_polyline_to_rectangle(projected, transform.world_width, transform.world_height)
            for part_index, part in enumerate(parts):
                simplified = rdp_open(deduplicate_consecutive(part), tolerance)
                if len(simplified) < 2:
                    continue
                suffix = ""
                if len(parts) > 1 or len(geometry_lines(feature["geometry"])) > 1:
                    suffix = f":{line_index + 1}:{part_index + 1}"
                records.append(
                    {
                        "id": f"barrier:{base_id}{suffix}",
                        "kind": barrier_kind(source_layer),
                        "sourceLayer": source_layer,
                        "points": serialise_points(
                            simplified, transform.world_width, transform.world_height
                        ),
                        "properties": properties,
                    }
                )
    return records


def build_vegetation_points(
    features: Sequence[JsonObject], transform: LocalTransform
) -> tuple[list[JsonObject], list[JsonObject]]:
    trees: list[JsonObject] = []
    palms: list[JsonObject] = []
    for feature_index, feature in enumerate(features):
        coordinates = list(iter_coordinate_pairs(feature["geometry"].get("coordinates")))
        if not coordinates:
            continue
        # Las capas municipales representan cada ejemplar mediante dos anillos.
        # El centro de su bbox es estable aunque cambie la densidad de vertices.
        lon = (min(point[0] for point in coordinates) + max(point[0] for point in coordinates)) / 2.0
        lat = (min(point[1] for point in coordinates) + max(point[1] for point in coordinates)) / 2.0
        x, y = transform.project(lon, lat)
        if not (0 <= x <= transform.world_width and 0 <= y <= transform.world_height):
            continue
        properties = feature["properties"]
        kind = "palm" if "PALMERA" in normalise_text(str(properties.get("layer") or "")) else "tree"
        record = {
            "id": f"{kind}:{feature_base_id(feature, feature_index)}",
            "x": round(x, 2),
            "y": round(y, 2),
            "kind": kind,
            "properties": properties,
        }
        (palms if kind == "palm" else trees).append(record)
    return trees, palms


@dataclass(frozen=True)
class OsmNode:
    identifier: str
    lon: float
    lat: float
    tags: JsonObject


@dataclass(frozen=True)
class OsmWay:
    identifier: str
    node_ids: tuple[str, ...]
    tags: JsonObject


def load_osm(path: Path) -> tuple[dict[str, OsmNode], list[OsmWay], int]:
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError) as exc:
        raise BuildError(f"No se pudo leer OSM {path}: {exc}") from exc
    nodes: dict[str, OsmNode] = {}
    for element in root.findall("node"):
        try:
            identifier = element.attrib["id"]
            lon = float(element.attrib["lon"])
            lat = float(element.attrib["lat"])
        except (KeyError, ValueError):
            continue
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag") if "k" in tag.attrib and "v" in tag.attrib}
        nodes[identifier] = OsmNode(identifier, lon, lat, tags)
    ways: list[OsmWay] = []
    for element in root.findall("way"):
        identifier = element.attrib.get("id")
        if identifier is None:
            continue
        node_ids = tuple(nd.attrib["ref"] for nd in element.findall("nd") if "ref" in nd.attrib)
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag") if "k" in tag.attrib and "v" in tag.attrib}
        ways.append(OsmWay(identifier, node_ids, tags))
    return nodes, ways, len(root.findall("relation"))


def osm_kind(tags: Mapping[str, Any]) -> tuple[str, str] | None:
    for category in ("amenity", "shop", "tourism", "leisure", "healthcare", "office", "historic"):
        value = tags.get(category)
        if value:
            return category, str(value)
    if tags.get("building") and tags.get("name"):
        return "building", str(tags["building"])
    return None


def polygon_centroid(points: Sequence[Point]) -> Point:
    area_twice = sum(
        start[0] * end[1] - end[0] * start[1]
        for start, end in zip(points, (*points[1:], points[0]))
    )
    if abs(area_twice) < 1e-9:
        return (
            sum(point[0] for point in points) / len(points),
            sum(point[1] for point in points) / len(points),
        )
    x = 0.0
    y = 0.0
    for start, end in zip(points, (*points[1:], points[0])):
        cross = start[0] * end[1] - end[0] * start[1]
        x += (start[0] + end[0]) * cross
        y += (start[1] + end[1]) * cross
    return x / (3.0 * area_twice), y / (3.0 * area_twice)


def build_osm_records(
    nodes: Mapping[str, OsmNode],
    ways: Sequence[OsmWay],
    transform: LocalTransform,
    tolerance: float,
) -> tuple[list[JsonObject], list[JsonObject], list[JsonObject], list[JsonObject], JsonObject]:
    centre_lines: list[JsonObject] = []
    landmarks: list[JsonObject] = []
    crossings: list[JsonObject] = []
    raw_bus_stops: list[tuple[int, JsonObject]] = []

    for way in ways:
        if not way.tags.get("highway"):
            continue
        source_points = [
            (nodes[node_id].lon, nodes[node_id].lat)
            for node_id in way.node_ids
            if node_id in nodes
        ]
        if len(source_points) < 2:
            continue
        projected = [transform.project(*point) for point in source_points]
        parts = clip_polyline_to_rectangle(projected, transform.world_width, transform.world_height)
        for part_index, part in enumerate(parts):
            simplified = rdp_open(deduplicate_consecutive(part), tolerance)
            if len(simplified) < 2:
                continue
            identifier = f"osm-way:{way.identifier}"
            if len(parts) > 1:
                identifier += f":{part_index + 1}"
            centre_lines.append(
                {
                    "id": identifier,
                    "name": way.tags.get("name"),
                    "highway": way.tags.get("highway"),
                    "service": way.tags.get("service"),
                    "oneway": way.tags.get("oneway"),
                    "points": serialise_points(
                        simplified, transform.world_width, transform.world_height
                    ),
                    "properties": way.tags,
                }
            )

    for node in nodes.values():
        x, y = transform.project(node.lon, node.lat)
        if not (0 <= x <= transform.world_width and 0 <= y <= transform.world_height):
            continue
        tags = node.tags
        if tags.get("highway") == "crossing" or tags.get("railway") in {"crossing", "level_crossing"}:
            crossing_value = str(tags.get("crossing") or tags.get("crossing:markings") or "uncontrolled")
            crossings.append(
                {
                    "id": f"osm-node:{node.identifier}",
                    "x": round(x, 2),
                    "y": round(y, 2),
                    "kind": crossing_value,
                    "signals": crossing_value == "traffic_signals" or tags.get("crossing:signals") == "yes",
                    "tactilePaving": tags.get("tactile_paving"),
                    "properties": tags,
                }
            )

        is_bus_stop = (
            tags.get("highway") == "bus_stop"
            or tags.get("public_transport") in {"platform", "stop_position"}
            and tags.get("bus") in {None, "yes", "designated"}
        )
        if is_bus_stop:
            priority = 3 if tags.get("highway") == "bus_stop" else 2 if tags.get("public_transport") == "platform" else 1
            raw_bus_stops.append(
                (
                    priority,
                    {
                        "id": f"osm-node:{node.identifier}",
                        "x": round(x, 2),
                        "y": round(y, 2),
                        "name": tags.get("name"),
                        "ref": tags.get("ref"),
                        "kind": tags.get("public_transport") or tags.get("highway"),
                        "properties": tags,
                    },
                )
            )

        landmark_type = osm_kind(tags)
        if landmark_type and not is_bus_stop:
            category, kind = landmark_type
            landmarks.append(
                {
                    "id": f"osm-node:{node.identifier}",
                    "name": tags.get("name"),
                    "kind": kind,
                    "category": category,
                    "centroid": [round(x, 2), round(y, 2)],
                    "x": round(x, 2),
                    "y": round(y, 2),
                    "properties": tags,
                }
            )

    for way in ways:
        landmark_type = osm_kind(way.tags)
        if landmark_type is None:
            continue
        source_points = [
            (nodes[node_id].lon, nodes[node_id].lat)
            for node_id in way.node_ids
            if node_id in nodes
        ]
        if len(source_points) < 2:
            continue
        category, kind = landmark_type
        record: JsonObject = {
            "id": f"osm-way:{way.identifier}",
            "name": way.tags.get("name"),
            "kind": kind,
            "category": category,
            "properties": way.tags,
        }
        if len(source_points) >= 4 and source_points[0] == source_points[-1]:
            geometry = transform_polygon([source_points], transform, tolerance)
            if geometry is None:
                continue
            geometry_points = [tuple(point) for point in geometry["points"]]
            centroid = polygon_centroid(geometry_points)
            record["geometry"] = geometry
        else:
            projected = [transform.project(*point) for point in source_points]
            visible = [
                point
                for point in projected
                if 0 <= point[0] <= transform.world_width and 0 <= point[1] <= transform.world_height
            ]
            if not visible:
                continue
            centroid = (
                sum(point[0] for point in visible) / len(visible),
                sum(point[1] for point in visible) / len(visible),
            )
        if not (0 <= centroid[0] <= transform.world_width and 0 <= centroid[1] <= transform.world_height):
            continue
        record["centroid"] = [round(centroid[0], 2), round(centroid[1], 2)]
        record["x"] = round(centroid[0], 2)
        record["y"] = round(centroid[1], 2)
        landmarks.append(record)

    # OSM suele duplicar una parada como plataforma y stop_position. El ref de
    # TUSSAM identifica la parada fisica; se conserva la plataforma/indicador.
    bus_by_key: dict[str, tuple[int, JsonObject]] = {}
    for priority, record in raw_bus_stops:
        key = str(record.get("ref") or record["id"])
        if key not in bus_by_key or priority > bus_by_key[key][0]:
            bus_by_key[key] = priority, record
    bus_stops = [value[1] for value in bus_by_key.values()]
    bus_stops.sort(key=lambda record: str(record["id"]))

    stats = {
        "sourceNodes": len(nodes),
        "sourceWays": len(ways),
        "rawBusStopNodesInWorld": len(raw_bus_stops),
    }
    return centre_lines, landmarks, crossings, bus_stops, stats


def parse_bbox(value: Any) -> tuple[float, float, float, float] | None:
    if isinstance(value, str):
        pieces = [piece.strip() for piece in value.replace(";", ",").split(",")]
        if len(pieces) == 4:
            try:
                value = [float(piece) for piece in pieces]
            except ValueError:
                return None
    if isinstance(value, (list, tuple)) and len(value) == 4 and all(finite_number(item) for item in value):
        bounds = tuple(float(item) for item in value)
    elif isinstance(value, Mapping):
        lowered = {str(key).casefold(): item for key, item in value.items()}
        key_sets = (
            ("west", "south", "east", "north"),
            ("minlon", "minlat", "maxlon", "maxlat"),
            ("xmin", "ymin", "xmax", "ymax"),
        )
        bounds = None
        for keys in key_sets:
            if all(key in lowered and finite_number(lowered[key]) for key in keys):
                bounds = tuple(float(lowered[key]) for key in keys)
                break
        if bounds is None:
            return None
    else:
        return None
    west, south, east, north = bounds
    if west >= east or south >= north:
        return None
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
        return None
    return west, south, east, north


def bounds_from_metadata(path: Path) -> tuple[tuple[float, float, float, float], str] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BuildError(f"No se pudo leer metadata {path}: {exc}") from exc

    candidates: list[Any] = []
    if isinstance(data, Mapping):
        for key in ("pnoa", "raster", "image", "orthophoto", "request"):
            if key in data:
                candidates.append(data[key])
        candidates.append(data)
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        for key in ("bbox", "bounds", "wgs84Bounds", "rasterBounds"):
            if key in candidate:
                parsed = parse_bbox(candidate[key])
                if parsed:
                    crs = str(candidate.get("crs") or data.get("crs") or "EPSG:4326")
                    return parsed, crs
        parsed = parse_bbox(candidate)
        if parsed:
            crs = str(candidate.get("crs") or data.get("crs") or "EPSG:4326")
            return parsed, crs
        for key in ("url", "requestUrl", "getMapUrl"):
            url = candidate.get(key)
            if not isinstance(url, str):
                continue
            query = {name.casefold(): values for name, values in urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).items()}
            if query.get("bbox"):
                parsed = parse_bbox(query["bbox"][0])
                if parsed:
                    crs = (query.get("crs") or query.get("srs") or ["EPSG:4326"])[0]
                    return parsed, str(crs)
    return None


def world_file_bounds(image_path: Path, image_size: tuple[int, int]) -> tuple[float, float, float, float] | None:
    extensions = {
        ".jpg": (".jgw", ".jpgw", ".wld"),
        ".jpeg": (".jgw", ".jpegw", ".wld"),
        ".png": (".pgw", ".pngw", ".wld"),
    }.get(image_path.suffix.casefold(), (".wld",))
    world_file = next((image_path.with_suffix(extension) for extension in extensions if image_path.with_suffix(extension).is_file()), None)
    if world_file is None:
        return None
    try:
        values = [float(line.strip()) for line in world_file.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    except (OSError, ValueError) as exc:
        raise BuildError(f"World file invalido {world_file}: {exc}") from exc
    if len(values) != 6:
        raise BuildError(f"{world_file} debe contener seis coeficientes.")
    pixel_x, rotation_y, rotation_x, pixel_y, centre_x, centre_y = values
    if abs(rotation_x) > 1e-12 or abs(rotation_y) > 1e-12:
        raise BuildError("La ortofoto usa un world file rotado; exportala norte arriba o proporciona --raster-bounds.")
    width, height = image_size
    x_edges = (centre_x - pixel_x / 2.0, centre_x + pixel_x * (width - 0.5))
    y_edges = (centre_y - pixel_y / 2.0, centre_y + pixel_y * (height - 0.5))
    return min(x_edges), min(y_edges), max(x_edges), max(y_edges)


@dataclass(frozen=True)
class RasterReference:
    bounds: tuple[float, float, float, float]
    crs: str
    provenance: str


def raster_reference(
    args: argparse.Namespace,
    sources: Sources,
    image_size: tuple[int, int],
) -> RasterReference:
    if args.raster_bounds:
        parsed = parse_bbox(args.raster_bounds)
        if parsed is None:
            raise BuildError("--raster-bounds no forma un bbox WGS84 valido.")
        return RasterReference(parsed, "EPSG:4326", "cli")
    if sources.metadata:
        metadata_result = bounds_from_metadata(sources.metadata)
        if metadata_result:
            bounds, crs = metadata_result
            if normalise_text(crs).replace(" ", "") not in {"EPSG:4326", "CRS:84", "OGC:CRS84"}:
                raise BuildError(f"La metadata PNOA declara {crs}; este generador requiere lon/lat WGS84.")
            return RasterReference(bounds, crs, f"metadata:{display_path(sources.metadata)}")
    from_world_file = world_file_bounds(sources.pnoa, image_size)
    if from_world_file:
        return RasterReference(from_world_file, "EPSG:4326", "world-file")
    return RasterReference(PNOA_FALLBACK_BOUNDS, "EPSG:4326", "documented-wms-fallback")


def output_to_source_pixel(
    x: float,
    y: float,
    *,
    transform: LocalTransform,
    source_size: tuple[int, int],
    bounds: tuple[float, float, float, float],
) -> Point:
    lon, lat = transform.inverse(x, y)
    west, south, east, north = bounds
    # -0.5 alinea centros de pixel con la cobertura WMS, no sus bordes.
    return (
        (lon - west) / (east - west) * source_size[0] - 0.5,
        (north - lat) / (north - south) * source_size[1] - 0.5,
    )


def inverse_affine_coefficients(
    transform: LocalTransform,
    source_size: tuple[int, int],
    bounds: tuple[float, float, float, float],
) -> tuple[float, float, float, float, float, float]:
    origin = output_to_source_pixel(0, 0, transform=transform, source_size=source_size, bounds=bounds)
    x_step = output_to_source_pixel(1, 0, transform=transform, source_size=source_size, bounds=bounds)
    y_step = output_to_source_pixel(0, 1, transform=transform, source_size=source_size, bounds=bounds)
    return (
        x_step[0] - origin[0],
        y_step[0] - origin[0],
        origin[0],
        x_step[1] - origin[1],
        y_step[1] - origin[1],
        origin[1],
    )


def save_reference_image(
    source_path: Path,
    output_path: Path,
    transform: LocalTransform,
    raster: RasterReference,
    boundary: JsonObject,
    overlay_width: int,
) -> tuple[tuple[int, int], tuple[float, float, float, float, float, float]]:
    try:
        with Image.open(source_path) as opened:
            source = opened.convert("RGB")
    except OSError as exc:
        raise BuildError(f"No se pudo abrir la ortofoto {source_path}: {exc}") from exc
    source_size = source.size
    coefficients = inverse_affine_coefficients(transform, source_size, raster.bounds)
    rectified = source.transform(
        (transform.world_width, transform.world_height),
        Image.Transform.AFFINE,
        coefficients,
        resample=Image.Resampling.BICUBIC,
        fillcolor=(20, 25, 28),
    ).convert("RGBA")
    if overlay_width:
        overlay = Image.new("RGBA", rectified.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        rings = [boundary["points"], *boundary.get("holes", [])]
        for ring in rings:
            if len(ring) >= 2:
                draw.line(
                    [*map(tuple, ring), tuple(ring[0])],
                    fill=(255, 218, 88, 150),
                    width=overlay_width,
                    joint="curve",
                )
        rectified = Image.alpha_composite(rectified, overlay)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(f".{output_path.name}.tmp")
    rectified.convert("RGB").save(temporary, format="PNG", optimize=True, compress_level=9)
    temporary.replace(output_path)
    return source_size, coefficients


def bounds_of_points(points: Iterable[Point]) -> JsonObject:
    values = list(points)
    if not values:
        return {"minX": None, "minY": None, "maxX": None, "maxY": None}
    return {
        "minX": round(min(point[0] for point in values), 3),
        "minY": round(min(point[1] for point in values), 3),
        "maxX": round(max(point[0] for point in values), 3),
        "maxY": round(max(point[1] for point in values), 3),
    }


def principal_orientation(records: Sequence[JsonObject], target_name: str, target: str) -> JsonObject:
    target_words = set(normalise_text(target_name).split())
    matching = [
        record
        for record in records
        if target_words <= set(normalise_text(str(record.get("name") or "")).split())
    ]
    points = [tuple(point) for record in matching for point in record["points"]]
    if len(points) < 2:
        return {
            "matchedFeatures": len(matching),
            "angleDegrees": None,
            "target": target,
            "deviationDegrees": None,
            "status": "missing",
        }
    mean_x = sum(point[0] for point in points) / len(points)
    mean_y = sum(point[1] for point in points) / len(points)
    xx = sum((point[0] - mean_x) ** 2 for point in points)
    yy = sum((point[1] - mean_y) ** 2 for point in points)
    xy_twice = 2.0 * sum((point[0] - mean_x) * (point[1] - mean_y) for point in points)
    angle = 0.5 * math.degrees(math.atan2(xy_twice, xx - yy))
    if angle >= 90:
        angle -= 180
    if angle < -90:
        angle += 180
    deviation = abs(angle) if target == "horizontal" else abs(90.0 - abs(angle))
    return {
        "matchedFeatures": len(matching),
        "sampledPoints": len(points),
        "angleDegrees": round(angle, 3),
        "target": target,
        "deviationDegrees": round(deviation, 3),
        "status": "ok" if deviation <= 5.0 else "warning",
    }


def validate_output_geometry(geography: Mapping[str, Any]) -> JsonObject:
    width = float(geography["width"])
    height = float(geography["height"])
    errors: list[str] = []
    checked_coordinates = 0

    def check_points(points: Any, minimum: int, label: str) -> None:
        nonlocal checked_coordinates
        if not isinstance(points, list) or len(points) < minimum:
            errors.append(f"{label}: se esperaban al menos {minimum} puntos")
            return
        for point in points:
            if not (
                isinstance(point, list)
                and len(point) == 2
                and finite_number(point[0])
                and finite_number(point[1])
            ):
                errors.append(f"{label}: coordenada invalida")
                continue
            checked_coordinates += 1
            if not (-0.01 <= point[0] <= width + 0.01 and -0.01 <= point[1] <= height + 0.01):
                errors.append(f"{label}: coordenada fuera del mundo {point}")

    check_points(geography["boundary"]["points"], 3, "boundary")
    polygon_collections = (
        "streetSurfaces",
        "sidewalks",
        "greens",
        "municipalSurfaces",
        "buildingFootprints",
    )
    for collection_name in polygon_collections:
        for record in geography[collection_name]:
            check_points(record.get("points"), 3, str(record.get("id")))
            for index, hole in enumerate(record.get("holes") or []):
                check_points(hole, 3, f"{record.get('id')}:hole:{index}")
    for collection_name in ("barrierSegments", "streetCenterlines"):
        for record in geography[collection_name]:
            check_points(record.get("points"), 2, str(record.get("id")))
    for collection_name in ("trees", "palms", "crossings", "busStops", "landmarks"):
        for record in geography[collection_name]:
            x, y = record.get("x"), record.get("y")
            if not (finite_number(x) and finite_number(y) and 0 <= x <= width and 0 <= y <= height):
                errors.append(f"{record.get('id')}: punto fuera del mundo")
            else:
                checked_coordinates += 1
    if errors:
        sample = "; ".join(errors[:8])
        raise BuildError(f"La validacion geometrica fallo ({len(errors)} errores): {sample}")
    return {"checkedCoordinates": checked_coordinates, "outOfBoundsCoordinates": 0, "status": "ok"}


def write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    temporary.replace(path)


def source_manifest(sources: Sources) -> JsonObject:
    return {
        "boundary": display_path(sources.boundary),
        "streets": display_path(sources.streets),
        "sidewalks": display_path(sources.sidewalks),
        "surfaces": display_path(sources.surfaces),
        "greens": display_path(sources.greens),
        "buildings": display_path(sources.buildings),
        "obstacles": [display_path(path) for path in sources.obstacles],
        "trees": [display_path(path) for path in sources.trees],
        "osm": display_path(sources.osm),
        "pnoa": display_path(sources.pnoa),
        "metadata": display_path(sources.metadata) if sources.metadata else None,
    }


def build(args: argparse.Namespace) -> tuple[JsonObject, JsonObject]:
    require_positive_configuration(args)
    sources = discover_sources(args)

    boundary_features = load_features(sources.boundary)
    streets_features = load_features(sources.streets)
    sidewalks_features = load_features(sources.sidewalks)
    surfaces_features = load_features(sources.surfaces)
    greens_features = load_features(sources.greens)
    building_features = load_features(sources.buildings)
    obstacle_features = [feature for path in sources.obstacles for feature in load_features(path)]
    tree_features = [feature for path in sources.trees for feature in load_features(path)]

    feature_groups = {
        "boundary": boundary_features,
        "streets": streets_features,
        "sidewalks": sidewalks_features,
        "surfaces": surfaces_features,
        "greens": greens_features,
        "buildings": building_features,
        "obstacles": obstacle_features,
        "vegetation": tree_features,
    }
    for label, features in feature_groups.items():
        validate_wgs84_features(features, label)

    selected_boundary = select_boundary_feature(boundary_features)
    boundary_polygons = geometry_polygons(selected_boundary["geometry"])
    if not boundary_polygons:
        raise BuildError("El feature oficial seleccionado no es un poligono.")
    boundary_polygon = max(boundary_polygons, key=lambda polygon: abs(signed_area(polygon[0])))
    transform = LocalTransform.from_boundary(
        [point for ring in boundary_polygon for point in ring],
        world_width=args.world_width,
        world_height=args.world_height,
        pixels_per_metre=args.scale,
        rotation_degrees=args.rotation_deg,
    )
    transformed_boundary = transform_polygon(boundary_polygon, transform, args.rdp_tolerance)
    if transformed_boundary is None:
        raise BuildError("El limite oficial desaparecio al transformarlo al mundo.")
    boundary_record: JsonObject = {
        "id": f"boundary:{feature_base_id(selected_boundary, 0)}",
        **transformed_boundary,
        "properties": selected_boundary["properties"],
    }

    street_surfaces = polygon_records(
        streets_features,
        prefix="street",
        transform=transform,
        tolerance=args.rdp_tolerance,
        enrich=lambda properties: {
            "name": str(properties.get("nombre") or "").strip() or None,
            "hierarchy": properties.get("jerarquia"),
            "streetCode": properties.get("cvia_num"),
        },
    )
    sidewalks = polygon_records(
        sidewalks_features,
        prefix="sidewalk",
        transform=transform,
        tolerance=args.rdp_tolerance,
        enrich=lambda properties: {"layer": properties.get("layer")},
    )
    greens = polygon_records(
        greens_features,
        prefix="green",
        transform=transform,
        tolerance=args.rdp_tolerance,
        enrich=lambda properties: {"layer": properties.get("layer")},
    )
    municipal_surfaces = polygon_records(
        surfaces_features,
        prefix="surface",
        transform=transform,
        tolerance=args.rdp_tolerance,
        enrich=lambda properties: {"layer": properties.get("layer")},
    )
    water_areas = [
        record
        for record in municipal_surfaces
        if any(word in normalise_text(str(record.get("layer") or "")) for word in ("FUENTE", "ESTANQUE", "PISCINA"))
    ]
    sports_areas = [
        record
        for record in municipal_surfaces
        if "DEPORTIVO" in normalise_text(str(record.get("layer") or ""))
    ]
    building_footprints = polygon_records(
        building_features,
        prefix="building",
        transform=transform,
        tolerance=args.rdp_tolerance,
        enrich=lambda properties: {
            "construction": properties.get("constru"),
            "solid": is_solid_construction(properties.get("constru")),
        },
    )
    barrier_segments = build_barrier_records(obstacle_features, transform, args.rdp_tolerance)
    trees, palms = build_vegetation_points(tree_features, transform)

    osm_nodes, osm_ways, osm_relation_count = load_osm(sources.osm)
    street_centre_lines, landmarks, crossings, bus_stops, osm_stats = build_osm_records(
        osm_nodes, osm_ways, transform, args.rdp_tolerance
    )
    osm_stats["sourceRelations"] = osm_relation_count

    geography: JsonObject = {
        "version": 1,
        "width": transform.world_width,
        "height": transform.world_height,
        "world": {
            "width": transform.world_width,
            "height": transform.world_height,
            "units": "logical pixels",
            "pixelsPerMetre": transform.pixels_per_metre,
            "portrait": transform.world_height > transform.world_width,
        },
        "transform": transform.serialise(),
        "layout": {
            "openExceptSolids": True,
            "blockedBy": ["solid buildingFootprints", "barrierSegments"],
        },
        "boundary": boundary_record,
        "streetSurfaces": street_surfaces,
        "sidewalks": sidewalks,
        "greens": greens,
        "municipalSurfaces": municipal_surfaces,
        "waterAreas": water_areas,
        "sportsAreas": sports_areas,
        "buildingFootprints": building_footprints,
        "barrierSegments": barrier_segments,
        "trees": trees,
        "palms": palms,
        "streetCenterlines": street_centre_lines,
        "landmarks": landmarks,
        "crossings": crossings,
        "busStops": bus_stops,
    }
    validation = validate_output_geometry(geography)

    reference_output = resolve(args.reference_out)
    with Image.open(sources.pnoa) as raster_image:
        raster_size = raster_image.size
    raster = raster_reference(args, sources, raster_size)
    source_size, affine = save_reference_image(
        sources.pnoa,
        reference_output,
        transform,
        raster,
        boundary_record,
        args.boundary_overlay_width,
    )

    geography_output = resolve(args.geography_out)
    audit_output = resolve(args.audit_out)
    serialised = json.dumps(geography, ensure_ascii=False, indent=2, allow_nan=False)
    geography_js = (
        '"use strict";\n\n'
        f"window.SAN_PABLO_GEOGRAPHY = {serialised};\n\n"
        "if (typeof module !== \"undefined\" && module.exports) {\n"
        "  module.exports = window.SAN_PABLO_GEOGRAPHY;\n"
        "}\n"
    )
    write_text_atomic(geography_output, geography_js)

    boundary_world_points = [tuple(point) for point in boundary_record["points"]]
    source_boundary_points = list(iter_coordinate_pairs(selected_boundary["geometry"].get("coordinates")))
    world_corners_lon_lat = [
        transform.inverse(x, y)
        for x, y in (
            (0, 0),
            (transform.world_width, 0),
            (transform.world_width, transform.world_height),
            (0, transform.world_height),
        )
    ]
    counts = {
        "inputFeatures": {label: len(features) for label, features in feature_groups.items()},
        "output": {
            "streetSurfaces": len(street_surfaces),
            "sidewalks": len(sidewalks),
            "greens": len(greens),
            "municipalSurfaces": len(municipal_surfaces),
            "waterAreas": len(water_areas),
            "sportsAreas": len(sports_areas),
            "buildingFootprints": len(building_footprints),
            "solidBuildingFootprints": sum(bool(record["solid"]) for record in building_footprints),
            "nonSolidBuildingFootprints": sum(not bool(record["solid"]) for record in building_footprints),
            "barrierSegments": len(barrier_segments),
            "trees": len(trees),
            "palms": len(palms),
            "streetCenterlines": len(street_centre_lines),
            "landmarks": len(landmarks),
            "crossings": len(crossings),
            "busStops": len(bus_stops),
        },
        "osm": osm_stats,
    }
    audit: JsonObject = {
        "version": 1,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "outputs": {
            "geography": display_path(geography_output),
            "reference": display_path(reference_output),
            "audit": display_path(audit_output),
        },
        "sources": source_manifest(sources),
        "world": geography["world"],
        "transform": geography["transform"],
        "simplification": {
            "algorithm": "Ramer-Douglas-Peucker",
            "tolerancePixels": args.rdp_tolerance,
            "polygonClip": "axis-aligned world rectangle",
        },
        "raster": {
            "sourceSize": list(source_size),
            "outputSize": [transform.world_width, transform.world_height],
            "crs": raster.crs,
            "boundsLonLat": list(raster.bounds),
            "boundsProvenance": raster.provenance,
            "inverseAffineOutputToSource": [round(value, 12) for value in affine],
            "boundaryOverlayWidth": args.boundary_overlay_width,
        },
        "bounds": {
            "boundaryLonLat": {
                "west": round(min(point[0] for point in source_boundary_points), 9),
                "south": round(min(point[1] for point in source_boundary_points), 9),
                "east": round(max(point[0] for point in source_boundary_points), 9),
                "north": round(max(point[1] for point in source_boundary_points), 9),
            },
            "boundaryWorldPixels": bounds_of_points(boundary_world_points),
            "worldCornersLonLat": [[round(lon, 9), round(lat, 9)] for lon, lat in world_corners_lon_lat],
        },
        "orientation": {
            "calleAda": principal_orientation(street_centre_lines, "Calle Ada", "vertical"),
            "calleJerusalen": principal_orientation(
                street_centre_lines, "Calle Jerusalen", "horizontal"
            ),
        },
        "counts": counts,
        "validation": validation,
    }
    write_text_atomic(
        audit_output,
        json.dumps(audit, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
    )
    return geography, audit


def main() -> None:
    args = parse_args()
    try:
        geography, audit = build(args)
    except BuildError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
    output_counts = audit["counts"]["output"]
    print(
        "Geodata generado: "
        f"{display_path(resolve(args.geography_out))} | "
        f"{output_counts['streetSurfaces']} calzadas, "
        f"{output_counts['buildingFootprints']} huellas, "
        f"{output_counts['barrierSegments']} barreras."
    )
    print(
        f"Referencia: {display_path(resolve(args.reference_out))} "
        f"({geography['width']}x{geography['height']})"
    )
    print(f"Auditoria: {display_path(resolve(args.audit_out))}")


if __name__ == "__main__":
    main()
