from __future__ import annotations

"""Compila el mapa declarativo de San Pablo en texturas, chunks e informes.

API esperada de ``map-layout.js`` (coordenadas en pixeles logicos):

    window.CITY_MAP_LAYOUT = {
      width: 2508,
      height: 2508,
      roads: [
        {
          id: "jerusalen",
          points: [[290, 505], [2410, 505]],
          width: 126,                  // calzada, no incluye aceras
          surface: "road",
          sidewalkWidth: 14,
          curbWidth: 4,
          walkable: true,
        },
      ],
      paths: [
        {id: "clinic", points: [[592, 700], [592, 790]], width: 24,
         surface: "dirt", walkable: true},
      ],
      surfaceRects: [
        {id: "plaza", x: 1200, y: 900, w: 300, h: 180,
         surface: "sidewalk", walkable: true},
      ],
      surfacePolygons: [
        {id: "garden-path", points: [[10, 10], [80, 10], [50, 70]],
         surface: "dirt", walkable: true},
      ],
      blockedRects: [{id: "gate", x: 100, y: 100, w: 40, h: 12}],
      blockedPolygons: [{id: "pond", points: [[...], ...]}],
      blockers: [{id: "thorns", x: 0, y: 0, w: 64, h: 32}],
      openExceptSolids: false,       // true abre todo antes de restar solidos
      buildingFootprints: [
        {id: "block-a", points: [[...], ...], solid: true,
         levels: 4, kind: "apartments", refcat: "...", name: "..."},
      ],
      barrierSegments: [
        {id: "wall-a", points: [[...], ...], width: 4, kind: "wall"},
      ],
      waterAreas: [{id: "pond", points: [[...], ...]}],
      sportsAreas: [{id: "pitch", points: [[...], ...], kind: "soccer"}],
      streetCenterlines: [{id: "ada", points: [[...], ...], width: 40}],
      crossings: [{id: "crossing-a", points: [[x1, y1], [x2, y2]]}],
      sections: [{id: "north", name: "Distrito Norte", x: 0, y: 0,
                  w: 2508, h: 1254}],
      includeMapDataWalkability: false,
    };

Tambien se acepta ``module.exports``/``exports.CITY_MAP_LAYOUT``. Las lineas
pueden usar ``segment: [x1, y1, x2, y2]`` y los rectangulos pueden escribirse
como ``[x, y, w, h]``. ``road/asphalt``, ``sidewalk/pavement/plaza``,
``dirt/sand/brown`` y ``grass/lawn`` son aliases de superficie. Gris y marron
son transitables por defecto; ``walkable: false`` lo desactiva. Los arrays
``walkableRects``, ``walkableSegments`` y ``walkablePolygons`` permiten sumar
geometria solo colisionable. En ``map-data.js`` los walkableRects se interpretan
como casillas, igual que en el runtime actual.

El layout es la fuente principal. La transitabilidad antigua de map-data solo
se usa si el layout no declara ninguna superficie transitable o si
``includeMapDataWalkability`` vale ``true``. ``openExceptSolids`` inicia la
mascara completamente abierta. Bloqueos, edificios y barreras solidos siempre
se restan; los colliders de ``worldAssets`` con ``solid:false`` se ignoran.
"""

import argparse
import hashlib
import json
import math
import os
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORLD_SIZE = 2508
DEFAULT_DENSITY = 2
DEFAULT_GRID_SIZE = 4
DEFAULT_CELL_INSET = 12

LAYOUT_CONTRACT = """map-layout.js debe exportar window.CITY_MAP_LAYOUT (o module.exports).
Campos principales:
  roads[]: {id, points:[[x,y],...], width, surface:'road', sidewalkWidth?, curbWidth?, walkable?,render?}
  paths[]: {id, points:[[x,y],...], width, surface:'dirt'|'sidewalk'|'road', walkable?,render?}
  surfaceRects[]: {id,x,y,w,h,surface,walkable?}
  surfacePolygons[]: {id,points:[[x,y],...],surface,walkable?}
  blockedRects[] / blockedPolygons[] / blockers[]: geometria que se resta.
  openExceptSolids: true para abrir todo el mapa antes de restar solidos.
  buildingFootprints[]: {id,points,solid?,levels?,kind?,refcat?,name?}.
  barrierSegments[]: {id,points,width,kind:'wall'|'fence'|'gate',solid?}.
  waterAreas[] / sportsAreas[]: poligonos visuales estaticos opcionales.
  streetSurfaces[] / sidewalks[] / greens[] / municipalSurfaces[]: terreno GIS.
  streetCenterlines[] / crossings[]: marcas y detalles viales opcionales.
  doors[]: {col,row,approach?,label,action}; se hornean como umbrales visuales.
  sections[]: {id,name,x,y,w,h}; worldAssets[] es opcional.
Los poligonos aceptan holes:[[[x,y],...],...]. Todas las coordenadas estan en
pixeles logicos salvo units:'tiles'. map-geography.js se precarga si existe.
"""

SURFACE_ALIASES = {
    "road": "road",
    "asphalt": "road",
    "street": "road",
    "gray": "road",
    "grey": "road",
    "gray_road": "road",
    "grey_road": "road",
    "asphalt_gray": "road",
    "sidewalk": "sidewalk",
    "pavement": "sidewalk",
    "paving": "sidewalk",
    "plaza": "sidewalk",
    "stone": "sidewalk",
    "concrete": "sidewalk",
    "gray_path": "sidewalk",
    "grey_path": "sidewalk",
    "stone_path": "sidewalk",
    "dirt": "dirt",
    "sand": "dirt",
    "brown": "dirt",
    "earth": "dirt",
    "path": "dirt",
    "dirt_path": "dirt",
    "brown_path": "dirt",
    "grass": "grass",
    "lawn": "grass",
}
DEFAULT_WALKABLE_SURFACES = frozenset({"road", "sidewalk", "dirt"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compila map-layout.js en un mapa HD, preview, chunks y auditoria transitable.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--layout", type=Path, default=Path("map-layout.js"))
    parser.add_argument(
        "--geography",
        type=Path,
        default=Path("map-geography.js"),
        help="Datos GIS que se precargan antes del layout cuando el fichero existe.",
    )
    parser.add_argument("--map-data", type=Path, default=Path("map-data.js"))
    parser.add_argument(
        "--road-sheet",
        type=Path,
        default=Path("assets/generated/san-pablo-derived/tileset-road-sidewalk.png"),
    )
    parser.add_argument(
        "--terrain-sheet",
        type=Path,
        default=Path("assets/generated/san-pablo-derived/tileset-grass-dirt.png"),
    )
    parser.add_argument(
        "--output-base", type=Path, default=Path("assets/maps/san-pablo-rebuilt-base-hd.webp"),
    )
    parser.add_argument(
        "--output-preview", type=Path, default=Path("assets/maps/san-pablo-rebuilt-preview.webp"),
    )
    parser.add_argument(
        "--output-overlay", type=Path, default=Path("assets/maps/san-pablo-rebuilt-walkability-v2.png"),
    )
    parser.add_argument(
        "--output-navigation", type=Path, default=Path("assets/maps/san-pablo-rebuilt-navigation-v2.png"),
        help="Mascara binaria compacta que consume el runtime.",
    )
    parser.add_argument(
        "--output-sectors", type=Path, default=Path("assets/maps/san-pablo-rebuilt-sectors-v2.png"),
    )
    parser.add_argument(
        "--output-report", type=Path, default=Path("assets/maps/san-pablo-rebuilt-report-v2.json"),
    )
    parser.add_argument(
        "--reference",
        type=Path,
        default=Path("assets/maps/san-pablo-reference-rectified.png"),
        help="Referencia rectificada; si existe se alinea al render para la hoja comparativa.",
    )
    parser.add_argument(
        "--output-comparison",
        type=Path,
        default=Path("assets/maps/san-pablo-rebuilt-comparison-v6.png"),
        help="Hoja referencia / render / mezcla al 50 por ciento.",
    )
    parser.add_argument(
        "--chunks", type=Path, default=Path("assets/maps/san-pablo-rebuilt-chunks-2x"),
    )
    parser.add_argument("--chunk-prefix", default="san-pablo")
    parser.add_argument("--world-size", type=int, help="Fuerza width=height; por defecto usa el layout.")
    parser.add_argument("--density", type=int, default=DEFAULT_DENSITY)
    parser.add_argument("--chunk-size", type=int, default=512)
    parser.add_argument("--gutter", type=int, default=2)
    parser.add_argument("--quality", type=int, default=100)
    parser.add_argument("--lossless", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--sheet-grid", type=int, default=DEFAULT_GRID_SIZE)
    parser.add_argument("--cell-inset", type=int, default=DEFAULT_CELL_INSET)
    parser.add_argument("--road-cell", default="0,0", help="Columna,fila del asfalto puro.")
    parser.add_argument("--sidewalk-cell", default="1,0", help="Columna,fila de la acera pura.")
    parser.add_argument("--grass-cell", default="0,0", help="Columna,fila del cesped puro.")
    parser.add_argument("--dirt-cell", default="1,0", help="Columna,fila de la tierra pura.")
    parser.add_argument("--seed", type=int, default=1978, help="Desfase determinista de los patrones.")
    parser.add_argument("--no-chunks", action="store_true")
    parser.add_argument("--no-sectors", action="store_true")
    parser.add_argument(
        "--describe-layout", action="store_true", help="Muestra la API declarativa y termina sin compilar.",
    )
    return parser.parse_args()


def resolve(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def relative_name(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_javascript_object(
    path: Path,
    global_names: Sequence[str],
    preload_paths: Sequence[Path] = (),
) -> dict[str, Any]:
    """Carga un objeto serializable sin analizar JavaScript con expresiones regulares."""
    script = r"""
const path = require("path");
global.window = {};
console.log = (...args) => process.stderr.write(`${args.join(" ")}\n`);
const target = path.resolve(process.argv[1]);
const names = process.argv[2].split(",");
const preloads = JSON.parse(process.argv[3] || "[]");
for (const preload of preloads) require(path.resolve(preload));
const loaded = require(target);
let value = null;
for (const name of names) {
  if (loaded && loaded[name] != null) { value = loaded[name]; break; }
  if (global.window && global.window[name] != null) { value = global.window[name]; break; }
  if (global[name] != null) { value = global[name]; break; }
}
if (value == null && loaded && loaded.default != null) value = loaded.default;
if (value == null && loaded && typeof loaded === "object" && Object.keys(loaded).length) value = loaded;
if (value == null) {
  process.stderr.write(`No se encontro ${names.join("/")} en ${target}.\n`);
  process.exit(3);
}
process.stdout.write(JSON.stringify(value));
"""
    try:
        result = subprocess.run(
            [
                "node",
                "-e",
                script,
                str(path.resolve()),
                ",".join(global_names),
                json.dumps([str(preload.resolve()) for preload in preload_paths]),
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Se necesita Node.js para leer map-layout.js y map-data.js.") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or f"codigo {exc.returncode}"
        raise RuntimeError(f"Node.js no pudo cargar {relative_name(path)}: {detail}") from exc
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"La salida de {relative_name(path)} no es JSON valido: {exc}") from exc
    if not isinstance(value, dict):
        raise TypeError(f"{relative_name(path)} debe exportar un objeto; exporta {type(value).__name__}.")
    return value


def parse_cell(value: str, grid_size: int) -> tuple[int, int]:
    try:
        column, row = (int(part.strip()) for part in value.split(",", 1))
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError(f"Celda invalida: {value!r}; usa columna,fila.") from exc
    if not (0 <= column < grid_size and 0 <= row < grid_size):
        raise ValueError(f"La celda {value!r} queda fuera de la rejilla {grid_size}x{grid_size}.")
    return column, row


def extract_swatch(
    sheet: Image.Image, cell: tuple[int, int], grid_size: int, inset: int,
) -> Image.Image:
    column, row = cell
    left = round(column * sheet.width / grid_size)
    top = round(row * sheet.height / grid_size)
    right = round((column + 1) * sheet.width / grid_size)
    bottom = round((row + 1) * sheet.height / grid_size)
    if right - left <= inset * 2 or bottom - top <= inset * 2:
        raise ValueError("cell-inset elimina toda la celda; reduce el recorte interior.")
    # El inset elimina las lineas oscuras de la hoja/contact sheet.
    return sheet.crop((left + inset, top + inset, right - inset, bottom - inset)).convert("RGB")


def mirrored_pattern(swatch: Image.Image) -> Image.Image:
    """Une copias espejadas para que los bordes del patron sean continuos."""
    pattern = Image.new("RGB", (swatch.width * 2, swatch.height * 2))
    pattern.paste(swatch, (0, 0))
    pattern.paste(ImageOps.mirror(swatch), (swatch.width, 0))
    pattern.paste(ImageOps.flip(swatch), (0, swatch.height))
    pattern.paste(ImageOps.flip(ImageOps.mirror(swatch)), (swatch.width, swatch.height))
    return pattern


def stable_offset(key: str, seed: int, width: int, height: int) -> tuple[int, int]:
    payload = hashlib.sha256(f"{seed}:{key}".encode("utf-8")).digest()
    return int.from_bytes(payload[:4], "big") % width, int.from_bytes(payload[4:8], "big") % height


def tile_pattern(
    target: Image.Image,
    pattern: Image.Image,
    *,
    mask: Image.Image | None = None,
    key: str,
    seed: int,
) -> None:
    offset_x, offset_y = stable_offset(key, seed, pattern.width, pattern.height)
    for top in range(-offset_y, target.height, pattern.height):
        for left in range(-offset_x, target.width, pattern.width):
            dest_left = max(0, left)
            dest_top = max(0, top)
            dest_right = min(target.width, left + pattern.width)
            dest_bottom = min(target.height, top + pattern.height)
            if dest_right <= dest_left or dest_bottom <= dest_top:
                continue
            source_box = (
                dest_left - left,
                dest_top - top,
                dest_right - left,
                dest_bottom - top,
            )
            tile = pattern.crop(source_box)
            region_mask = mask.crop((dest_left, dest_top, dest_right, dest_bottom)) if mask else None
            target.paste(tile, (dest_left, dest_top), region_mask)


def canonical_surface(value: Any, default: str) -> str:
    name = str(value or default).strip().lower().replace("-", "_")
    return SURFACE_ALIASES.get(name, name)


def logical_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise TypeError(f"{label} debe ser un numero finito; recibido {value!r}.")
    return float(value)


def scaled(value: Any, density: int, label: str) -> int:
    return round(logical_number(value, label) * density)


def item_units(item: Mapping[str, Any], default: str = "world") -> str:
    units = str(item.get("units", default)).lower()
    if units not in {"world", "pixels", "tiles"}:
        raise ValueError(f"units debe ser world, pixels o tiles; recibido {units!r}.")
    return units


def unit_factor(item: Mapping[str, Any], tile_size: int, default: str = "world") -> float:
    return float(tile_size if item_units(item, default) == "tiles" else 1)


def normalize_item(raw: Any, *, kind: str, index: int) -> dict[str, Any]:
    if isinstance(raw, Mapping):
        return dict(raw)
    if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)):
        raise TypeError(f"{kind}[{index}] debe ser objeto o array.")
    values = list(raw)
    if (kind.endswith("Rects") or kind in {"surfaceRects", "blockers"}) and len(values) >= 4:
        return {"x": values[0], "y": values[1], "w": values[2], "h": values[3]}
    if (kind.endswith("Segments") or kind in {"roads", "paths"}) and len(values) >= 5:
        return {"segment": values[:4], "width": values[4]}
    if (
        kind.endswith("Polygons")
        or kind.endswith("Areas")
        or kind in {"buildingFootprints", "streetSurfaces", "sidewalks", "greens"}
    ) and len(values) >= 3:
        return {"points": values}
    raise ValueError(f"Formato no reconocido para {kind}[{index}]: {values!r}")


def extract_points(item: Mapping[str, Any], factor: float, density: int, label: str) -> list[tuple[int, int]]:
    raw_points = item.get("points")
    if raw_points is None and "segment" in item:
        segment = item["segment"]
        if not isinstance(segment, Sequence) or len(segment) < 4:
            raise ValueError(f"{label}.segment debe contener x1,y1,x2,y2.")
        raw_points = [[segment[0], segment[1]], [segment[2], segment[3]]]
    if raw_points is None and all(key in item for key in ("x1", "y1", "x2", "y2")):
        raw_points = [[item["x1"], item["y1"]], [item["x2"], item["y2"]]]
    if not isinstance(raw_points, Sequence) or len(raw_points) < 2:
        raise ValueError(f"{label} necesita al menos dos puntos.")
    points: list[tuple[int, int]] = []
    for point_index, point in enumerate(raw_points):
        if not isinstance(point, Sequence) or len(point) < 2:
            raise ValueError(f"{label}.points[{point_index}] debe ser [x,y].")
        points.append(
            (
                scaled(logical_number(point[0], f"{label}.x") * factor, density, f"{label}.x"),
                scaled(logical_number(point[1], f"{label}.y") * factor, density, f"{label}.y"),
            )
        )
    return points


def extract_holes(
    item: Mapping[str, Any], factor: float, density: int, label: str,
) -> list[list[tuple[int, int]]]:
    raw_holes = item.get("holes", [])
    if raw_holes is None:
        return []
    if not isinstance(raw_holes, Sequence) or isinstance(raw_holes, (str, bytes)):
        raise TypeError(f"{label}.holes debe ser un array de anillos.")
    holes: list[list[tuple[int, int]]] = []
    for ring_index, ring in enumerate(raw_holes):
        if not isinstance(ring, Sequence) or isinstance(ring, (str, bytes)):
            raise TypeError(f"{label}.holes[{ring_index}] debe ser un array de puntos.")
        if len(ring) < 3:
            continue
        holes.append(
            extract_points(
                {"points": ring},
                factor,
                density,
                f"{label}.holes[{ring_index}]",
            )
        )
    return holes


def draw_polyline(mask: Image.Image, points: Sequence[tuple[int, int]], width: int, round_caps: bool) -> None:
    width = max(1, width)
    draw = ImageDraw.Draw(mask)
    draw.line(points, fill=255, width=width, joint="curve")
    if round_caps:
        radius = width // 2
        for x, y in (points[0], points[-1]):
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=255)


def merge_mask(target: Image.Image, addition: Image.Image) -> None:
    target.paste(ImageChops.lighter(target, addition))


def shape_mask(
    item: Mapping[str, Any],
    kind: str,
    canvas_size: tuple[int, int],
    density: int,
    tile_size: int,
    label: str,
    *,
    default_units: str = "world",
) -> Image.Image:
    mask = Image.new("L", canvas_size, 0)
    factor = unit_factor(item, tile_size, default_units)
    draw = ImageDraw.Draw(mask)
    if kind == "rect":
        missing = [key for key in ("x", "y", "w", "h") if key not in item]
        if missing:
            raise ValueError(f"{label} carece de {', '.join(missing)}.")
        x = scaled(logical_number(item["x"], f"{label}.x") * factor, density, f"{label}.x")
        y = scaled(logical_number(item["y"], f"{label}.y") * factor, density, f"{label}.y")
        w = scaled(logical_number(item["w"], f"{label}.w") * factor, density, f"{label}.w")
        h = scaled(logical_number(item["h"], f"{label}.h") * factor, density, f"{label}.h")
        if w <= 0 or h <= 0:
            raise ValueError(f"{label} debe tener w/h positivos.")
        draw.rectangle((x, y, x + w - 1, y + h - 1), fill=255)
    elif kind == "polygon":
        points = extract_points(item, factor, density, label)
        if len(points) < 3:
            raise ValueError(f"{label} necesita tres puntos para ser poligono.")
        draw.polygon(points, fill=255)
        for hole in extract_holes(item, factor, density, label):
            draw.polygon(hole, fill=0)
    elif kind == "segment":
        points = extract_points(item, factor, density, label)
        width = scaled(item.get("width", 32) * factor, density, f"{label}.width")
        draw_polyline(mask, points, width, bool(item.get("roundCaps", True)))
    else:
        raise ValueError(f"Tipo de geometria desconocido: {kind}")
    return mask


def local_shape_mask(
    item: Mapping[str, Any],
    kind: str,
    density: int,
    tile_size: int,
    label: str,
    *,
    default_units: str = "world",
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Version acotada de shape_mask para no reservar un lienzo por feature GIS."""
    factor = unit_factor(item, tile_size, default_units)
    if kind == "rect":
        missing = [key for key in ("x", "y", "w", "h") if key not in item]
        if missing:
            raise ValueError(f"{label} carece de {', '.join(missing)}.")
        x = scaled(logical_number(item["x"], f"{label}.x") * factor, density, f"{label}.x")
        y = scaled(logical_number(item["y"], f"{label}.y") * factor, density, f"{label}.y")
        width = scaled(logical_number(item["w"], f"{label}.w") * factor, density, f"{label}.w")
        height = scaled(logical_number(item["h"], f"{label}.h") * factor, density, f"{label}.h")
        if width <= 0 or height <= 0:
            raise ValueError(f"{label} debe tener w/h positivos.")
        return Image.new("L", (width, height), 255), (x, y, x + width, y + height)
    if kind == "polygon":
        exterior = extract_points(item, factor, density, label)
        if len(exterior) < 3:
            raise ValueError(f"{label} necesita tres puntos para ser poligono.")
        mask, box, _, _ = local_polygon_mask(
            exterior,
            extract_holes(item, factor, density, label),
        )
        return mask, box
    if kind == "segment":
        points = extract_points(item, factor, density, label)
        width = scaled(item.get("width", 32) * factor, density, f"{label}.width")
        return local_polyline_mask(points, width, bool(item.get("roundCaps", True)))
    raise ValueError(f"Tipo de geometria desconocido: {kind}")


def iter_collection(layout: Mapping[str, Any], key: str) -> Iterable[tuple[int, dict[str, Any]]]:
    values = layout.get(key, [])
    if values is None:
        return
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
        raise TypeError(f"{key} debe ser un array.")
    for index, raw in enumerate(values):
        yield index, normalize_item(raw, kind=key, index=index)


def is_walkable(item: Mapping[str, Any], surface: str) -> bool:
    if "walkable" in item:
        return bool(item["walkable"])
    return surface in DEFAULT_WALKABLE_SURFACES


def feature_value(item: Mapping[str, Any], *keys: str, default: Any = None) -> Any:
    """Lee metadatos tanto a nivel superior como dentro de properties."""
    properties = item.get("properties", {})
    for key in keys:
        if key in item and item[key] not in (None, ""):
            return item[key]
        if isinstance(properties, Mapping) and key in properties and properties[key] not in (None, ""):
            return properties[key]
    return default


def build_geometry(
    layout: Mapping[str, Any],
    map_config: Mapping[str, Any],
    canvas_size: tuple[int, int],
    density: int,
    tile_size: int,
) -> tuple[dict[str, Image.Image], Image.Image, Image.Image, dict[str, Any]]:
    surface_masks = {name: Image.new("L", canvas_size, 0) for name in ("grass", "dirt", "sidewalk", "road")}
    road_sidewalk = Image.new("L", canvas_size, 0)
    road_curb = Image.new("L", canvas_size, 0)
    open_except_solids = bool(layout.get("openExceptSolids", False))
    walk_mask = Image.new("L", canvas_size, 255 if open_except_solids else 0)
    blocked_mask = Image.new("L", canvas_size, 0)
    counts: Counter[str] = Counter()
    blocked_pixels: Counter[str] = Counter()
    ids: dict[str, list[str]] = {
        key: []
        for key in (
            "roads",
            "paths",
            "surfaceRects",
            "surfacePolygons",
            "streetSurfaces",
            "sidewalks",
            "greens",
            "municipalSurfaces",
            "buildingFootprints",
            "barrierSegments",
            "blockers",
        )
    }
    features: list[dict[str, Any]] = []
    semantic_walkables = 0

    for collection, kind, default_surface in (
        ("surfaceRects", "rect", "grass"),
        ("surfacePolygons", "polygon", "grass"),
        ("paths", "segment", "dirt"),
        ("streetSurfaces", "polygon", "road"),
        ("sidewalks", "polygon", "sidewalk"),
        ("greens", "polygon", "grass"),
    ):
        for index, item in iter_collection(layout, collection):
            label = f"{collection}[{index}]"
            surface = canonical_surface(item.get("surface"), default_surface)
            if surface not in surface_masks:
                raise ValueError(f"{label}.surface={surface!r} no esta soportada.")
            mask, box = local_shape_mask(item, kind, density, tile_size, label)
            render_feature = bool(item.get("render", True))
            if render_feature:
                merge_local_mask(surface_masks[surface], mask, box)
            else:
                counts[f"renderSuppressed:{collection}"] += 1
            counts[f"surface:{surface}"] += 1
            ids[collection].append(str(item.get("id", f"{collection}-{index}")))
            feature_walkable = is_walkable(item, surface)
            features.append(
                {
                    "id": str(item.get("id", f"{collection}-{index}")),
                    "collection": collection,
                    "surface": surface,
                    "walkable": feature_walkable,
                    "render": render_feature,
                }
            )
            if feature_walkable:
                merge_local_mask(walk_mask, mask, box)
                semantic_walkables += 1

    # Patios y suelos libres municipales forman terreno; edificios, agua y
    # deporte tienen capas especializadas para evitar pintarlos dos veces.
    for index, item in iter_collection(layout, "municipalSurfaces"):
        label = f"municipalSurfaces[{index}]"
        layer = str(feature_value(item, "layer", default="")).lower()
        if any(token in layer for token in ("edificio", "deportivo", "estanque", "piscina", "fuente")):
            counts["municipalSurfacesSpecialized"] += 1
            continue
        mask, box = local_shape_mask(item, "polygon", density, tile_size, label)
        merge_local_mask(surface_masks["sidewalk"], mask, box)
        municipal_id = str(item.get("id", f"municipal-{index}"))
        ids["municipalSurfaces"].append(municipal_id)
        counts["surface:sidewalk"] += 1
        feature_walkable = is_walkable(item, "sidewalk")
        features.append(
            {
                "id": municipal_id,
                "collection": "municipalSurfaces",
                "surface": "sidewalk",
                "walkable": feature_walkable,
            }
        )
        if feature_walkable:
            merge_local_mask(walk_mask, mask, box)
            semantic_walkables += 1

    for index, item in iter_collection(layout, "roads"):
        label = f"roads[{index}]"
        surface = canonical_surface(item.get("surface"), "road")
        factor = unit_factor(item, tile_size)
        points = extract_points(item, factor, density, label)
        width = scaled(item.get("width", 64) * factor, density, f"{label}.width")
        if width <= 0:
            raise ValueError(f"{label}.width debe ser positivo.")
        render_feature = bool(item.get("render", True))
        feature_walkable = is_walkable(item, surface)
        if surface != "road" and surface not in surface_masks:
            raise ValueError(f"{label}.surface={surface!r} no esta soportada.")
        if not render_feature and open_except_solids:
            counts[f"surface:{surface}"] += 1
            counts["renderSuppressed:roads"] += 1
            ids["roads"].append(str(item.get("id", f"road-{index}")))
            features.append(
                {
                    "id": str(item.get("id", f"road-{index}")),
                    "collection": "roads",
                    "surface": surface,
                    "walkable": feature_walkable,
                    "render": False,
                }
            )
            if feature_walkable:
                semantic_walkables += 1
            continue
        center = Image.new("L", canvas_size, 0)
        draw_polyline(center, points, width, bool(item.get("roundCaps", True)))
        if surface == "road":
            curb_width = max(0, scaled(item.get("curbWidth", 4) * factor, density, f"{label}.curbWidth"))
            sidewalk_width = max(
                0, scaled(item.get("sidewalkWidth", 14) * factor, density, f"{label}.sidewalkWidth"),
            )
            curb = Image.new("L", canvas_size, 0)
            sidewalk = Image.new("L", canvas_size, 0)
            draw_polyline(curb, points, width + curb_width * 2, bool(item.get("roundCaps", True)))
            draw_polyline(
                sidewalk,
                points,
                width + (curb_width + sidewalk_width) * 2,
                bool(item.get("roundCaps", True)),
            )
            if render_feature:
                merge_mask(road_curb, curb)
                merge_mask(road_sidewalk, sidewalk)
                merge_mask(surface_masks["road"], center)
            visual_walk = sidewalk
        else:
            if render_feature:
                merge_mask(surface_masks[surface], center)
            visual_walk = center
        if not render_feature:
            counts["renderSuppressed:roads"] += 1
        counts[f"surface:{surface}"] += 1
        ids["roads"].append(str(item.get("id", f"road-{index}")))
        features.append(
            {
                "id": str(item.get("id", f"road-{index}")),
                "collection": "roads",
                "surface": surface,
                "walkable": feature_walkable,
                "render": render_feature,
            }
        )
        if feature_walkable:
            merge_mask(walk_mask, visual_walk)
            semantic_walkables += 1

    # Geometria explicitamente transitable que no necesita pintarse.
    for collection, kind in (
        ("walkableRects", "rect"),
        ("walkableSegments", "segment"),
        ("walkablePolygons", "polygon"),
    ):
        for index, item in iter_collection(layout, collection):
            mask, box = local_shape_mask(
                item,
                kind,
                density,
                tile_size,
                f"{collection}[{index}]",
            )
            merge_local_mask(walk_mask, mask, box)
            semantic_walkables += 1
            counts[collection] += 1

    include_legacy = bool(layout.get("includeMapDataWalkability", False)) or (
        semantic_walkables == 0 and not open_except_solids
    )
    if include_legacy:
        for collection, kind in (("walkableRects", "rect"), ("walkableSegments", "segment")):
            for index, item in iter_collection(map_config, collection):
                default_units = "tiles" if collection == "walkableRects" else "world"
                if collection == "walkableRects" and not isinstance(map_config.get(collection, [])[index], Mapping):
                    # map-data usa [colInicial,filaInicial,colFinal,filaFinal], no [x,y,w,h].
                    raw = list(map_config[collection][index])
                    item = {
                        "x": raw[0],
                        "y": raw[1],
                        "w": raw[2] - raw[0] + 1,
                        "h": raw[3] - raw[1] + 1,
                        "units": "tiles",
                    }
                mask, box = local_shape_mask(
                    item,
                    kind,
                    density,
                    tile_size,
                    f"map-data.{collection}[{index}]",
                    default_units=default_units,
                )
                merge_local_mask(walk_mask, mask, box)
                counts[f"legacy:{collection}"] += 1

    for collection, kind in (
        ("blockedRects", "rect"),
        ("blockedSegments", "segment"),
        ("blockedPolygons", "polygon"),
    ):
        for index, item in iter_collection(layout, collection):
            mask, box = local_shape_mask(
                item,
                kind,
                density,
                tile_size,
                f"{collection}[{index}]",
            )
            merge_local_mask(blocked_mask, mask, box)
            counts[collection] += 1
            ids["blockers"].append(str(item.get("id", f"{collection}-{index}")))

    for index, item in iter_collection(layout, "blockers"):
        label = f"blockers[{index}]"
        if "points" in item or "segment" in item:
            kind = "segment" if len(item.get("points", [])) < 3 else "polygon"
        else:
            kind = "rect"
        mask, box = local_shape_mask(item, kind, density, tile_size, label)
        merge_local_mask(blocked_mask, mask, box)
        counts["blockers"] += 1
        ids["blockers"].append(str(item.get("id", f"blocker-{index}")))

    # Las huellas GIS son el bloqueo semantico principal del layout abierto.
    for index, item in iter_collection(layout, "buildingFootprints"):
        label = f"buildingFootprints[{index}]"
        building_id = str(item.get("id", f"building-{index}"))
        ids["buildingFootprints"].append(building_id)
        solid = bool(item.get("solid", True))
        if solid:
            exterior, holes = feature_rings(item, density, tile_size, label)
            local_mask, box, _, _ = local_polygon_mask(exterior, holes)
            merge_local_mask(blocked_mask, local_mask, box)
            blocked_pixels["building"] += local_mask.histogram()[255]
            counts["solidBuildingFootprints"] += 1
        else:
            counts["nonSolidBuildingFootprints"] += 1
        features.append(
            {
                "id": building_id,
                "collection": "buildingFootprints",
                "surface": "building",
                "walkable": not solid,
                "solid": solid,
                "levels": building_levels(item),
                "kind": str(feature_value(item, "kind", "building", "construction", default="building")),
                "refcat": str(feature_value(item, "refcat", "ref:catastro", default="")),
                "name": str(feature_value(item, "name", default="")),
            }
        )

    for index, item in iter_collection(layout, "barrierSegments"):
        label = f"barrierSegments[{index}]"
        barrier_id = str(item.get("id", f"barrier-{index}"))
        ids["barrierSegments"].append(barrier_id)
        kind = str(feature_value(item, "kind", "barrier", default="fence"))
        solid = bool(item.get("solid", True))
        if solid:
            default_width = 4 if kind.lower() in {"wall", "muro", "retaining_wall"} else 2
            semantic_item = dict(item)
            semantic_item.setdefault("width", default_width)
            factor = unit_factor(semantic_item, tile_size)
            points = extract_points(semantic_item, factor, density, label)
            width = scaled(semantic_item["width"] * factor, density, f"{label}.width")
            local_mask, box = local_polyline_mask(
                points,
                width,
                bool(semantic_item.get("roundCaps", True)),
            )
            merge_local_mask(blocked_mask, local_mask, box)
            blocked_pixels["barrier"] += local_mask.histogram()[255]
            counts["solidBarrierSegments"] += 1
            if kind.lower() in {"gate", "verja", "entrance"}:
                counts["solidGateBarrierSegments"] += 1
        else:
            counts["nonSolidBarrierSegments"] += 1
        features.append(
            {
                "id": barrier_id,
                "collection": "barrierSegments",
                "surface": "barrier",
                "walkable": not solid,
                "solid": solid,
                "kind": kind,
            }
        )

    # Resta las huellas solidas de los sprites dinamicos del layout o de map-data.
    assets = layout.get("worldAssets")
    if assets is None:
        assets = map_config.get("worldAssets", [])
    if not isinstance(assets, Sequence) or isinstance(assets, (str, bytes)):
        raise TypeError("worldAssets debe ser un array.")
    draw_blocked = ImageDraw.Draw(blocked_mask)
    collider_count = 0
    ignored_collider_count = 0
    for asset_index, asset in enumerate(assets):
        if not isinstance(asset, Mapping):
            raise TypeError(f"worldAssets[{asset_index}] debe ser un objeto.")
        if asset.get("solid", True) is False:
            ignored_collider_count += len(asset.get("colliders", []))
            continue
        anchor_x = logical_number(asset.get("x", 0), f"worldAssets[{asset_index}].x")
        anchor_y = logical_number(asset.get("y", 0), f"worldAssets[{asset_index}].y")
        for collider_index, collider in enumerate(asset.get("colliders", [])):
            if not isinstance(collider, Sequence) or len(collider) < 4:
                raise ValueError(f"worldAssets[{asset_index}].colliders[{collider_index}] es invalido.")
            x = scaled(anchor_x + logical_number(collider[0], "collider.x"), density, "collider.x")
            y = scaled(anchor_y + logical_number(collider[1], "collider.y"), density, "collider.y")
            w = scaled(collider[2], density, "collider.w")
            h = scaled(collider[3], density, "collider.h")
            if w > 0 and h > 0:
                draw_blocked.rectangle((x, y, x + w - 1, y + h - 1), fill=255)
                collider_count += 1
    counts["assetColliders"] = collider_count
    counts["ignoredNonSolidAssetColliders"] = ignored_collider_count

    # Diferencia binaria: ningun collider puede quedar verde en el informe.
    walk_mask = ImageChops.subtract(walk_mask, blocked_mask)
    surface_masks["roadSidewalk"] = road_sidewalk
    surface_masks["roadCurb"] = road_curb
    audit = {
        "counts": dict(sorted(counts.items())),
        "ids": ids,
        "features": features,
        "walkableFeatureIds": [feature["id"] for feature in features if feature["walkable"]],
        "nonWalkableGroundFeatureIds": [
            feature["id"]
            for feature in features
            if feature["surface"] in DEFAULT_WALKABLE_SURFACES and not feature["walkable"]
        ],
        "semanticWalkableShapes": semantic_walkables,
        "legacyWalkabilityIncluded": include_legacy,
        "openExceptSolids": open_except_solids,
        "blockedPixelsByClassApprox": {
            key: round(value / (density * density))
            for key, value in sorted(blocked_pixels.items())
        },
        "barrierGatePolicy": "solid",
    }
    return surface_masks, walk_mask, blocked_mask, audit


def render_base(
    canvas_size: tuple[int, int],
    masks: Mapping[str, Image.Image],
    patterns: Mapping[str, Image.Image],
    seed: int,
) -> Image.Image:
    base = Image.new("RGB", canvas_size)
    tile_pattern(base, patterns["grass"], key="background:grass", seed=seed)
    tile_pattern(base, patterns["grass"], mask=masks["grass"], key="surface:grass", seed=seed)
    for surface in ("dirt", "sidewalk"):
        tile_pattern(base, patterns[surface], mask=masks[surface], key=f"surface:{surface}", seed=seed)
    tile_pattern(
        base,
        patterns["sidewalk"],
        mask=masks["roadSidewalk"],
        key="roads:sidewalk",
        seed=seed,
    )
    tile_pattern(base, patterns["curb"], mask=masks["roadCurb"], key="roads:curb", seed=seed)
    tile_pattern(base, patterns["road"], mask=masks["road"], key="surface:road", seed=seed)
    return base


def stable_number(key: str, seed: int = 0) -> int:
    return int.from_bytes(hashlib.sha256(f"{seed}:{key}".encode("utf-8")).digest()[:8], "big")


def shade_color(color: tuple[int, int, int], delta: int) -> tuple[int, int, int]:
    return tuple(max(0, min(255, channel + delta)) for channel in color)


def feature_rings(
    item: Mapping[str, Any], density: int, tile_size: int, label: str,
) -> tuple[list[tuple[int, int]], list[list[tuple[int, int]]]]:
    factor = unit_factor(item, tile_size)
    exterior = extract_points(item, factor, density, label)
    if len(exterior) < 3:
        raise ValueError(f"{label} necesita tres puntos para ser poligono.")
    return exterior, extract_holes(item, factor, density, label)


def local_polygon_mask(
    exterior: Sequence[tuple[int, int]],
    holes: Sequence[Sequence[tuple[int, int]]],
) -> tuple[Image.Image, tuple[int, int, int, int], list[tuple[int, int]], list[list[tuple[int, int]]]]:
    all_points = list(exterior) + [point for ring in holes for point in ring]
    left = min(point[0] for point in all_points)
    top = min(point[1] for point in all_points)
    right = max(point[0] for point in all_points) + 1
    bottom = max(point[1] for point in all_points) + 1
    shifted_exterior = [(x - left, y - top) for x, y in exterior]
    shifted_holes = [[(x - left, y - top) for x, y in ring] for ring in holes]
    mask = Image.new("L", (max(1, right - left), max(1, bottom - top)), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(shifted_exterior, fill=255)
    for ring in shifted_holes:
        draw.polygon(ring, fill=0)
    return mask, (left, top, right, bottom), shifted_exterior, shifted_holes


def local_polyline_mask(
    points: Sequence[tuple[int, int]], width: int, round_caps: bool,
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    margin = max(2, math.ceil(max(1, width) / 2) + 1)
    left = min(x for x, _ in points) - margin
    top = min(y for _, y in points) - margin
    right = max(x for x, _ in points) + margin + 1
    bottom = max(y for _, y in points) + margin + 1
    mask = Image.new("L", (max(1, right - left), max(1, bottom - top)), 0)
    draw_polyline(mask, [(x - left, y - top) for x, y in points], width, round_caps)
    return mask, (left, top, right, bottom)


def merge_local_mask(
    target: Image.Image,
    addition: Image.Image,
    box: tuple[int, int, int, int],
) -> None:
    left, top, right, bottom = box
    clipped = (
        max(0, left),
        max(0, top),
        min(target.width, right),
        min(target.height, bottom),
    )
    if clipped[0] >= clipped[2] or clipped[1] >= clipped[3]:
        return
    source_box = (
        clipped[0] - left,
        clipped[1] - top,
        clipped[2] - left,
        clipped[3] - top,
    )
    target_crop = target.crop(clipped)
    addition_crop = addition.crop(source_box)
    target.paste(ImageChops.lighter(target_crop, addition_crop), clipped[:2])


def draw_polygon_areas(
    base: Image.Image,
    layout: Mapping[str, Any],
    density: int,
    tile_size: int,
    seed: int,
) -> Image.Image:
    """Pinta agua y pistas municipales sin depender de sprites externos."""
    result = base.copy()
    for collection, default_kind in (("waterAreas", "water"), ("sportsAreas", "sports")):
        for index, item in iter_collection(layout, collection):
            label = f"{collection}[{index}]"
            exterior, holes = feature_rings(item, density, tile_size, label)
            mask, box, local_exterior, local_holes = local_polygon_mask(exterior, holes)
            kind = str(feature_value(item, "kind", "sport", "leisure", default=default_kind)).lower()
            is_track = any(token in kind for token in ("track", "athletic", "running"))
            if collection == "waterAreas":
                base_color = (49, 132, 174)
                edge_color = (24, 83, 123)
                detail_color = (111, 194, 212)
            elif any(token in kind for token in ("tennis", "basket", "padel", "court")):
                base_color = (164, 101, 63)
                edge_color = (90, 65, 52)
                detail_color = (236, 224, 194)
            elif is_track:
                # En San Pablo la pista principal se lee gris clara en PNOA.
                # La convertimos en un ovalo limpio, muy de mapa Pokemon DS.
                base_color = (174, 181, 178)
                edge_color = (91, 105, 104)
                detail_color = (239, 240, 220)
            else:
                base_color = (48, 127, 62)
                edge_color = (29, 75, 43)
                detail_color = (220, 235, 201)

            patch = result.crop(box)
            color_layer = Image.new("RGB", patch.size, base_color)
            patch.paste(color_layer, (0, 0), mask)
            details = Image.new("RGB", patch.size, (0, 0, 0))
            detail_mask = Image.new("L", patch.size, 0)
            detail_draw = ImageDraw.Draw(details)
            alpha_draw = ImageDraw.Draw(detail_mask)
            width = max(1, 2 * density)
            if collection == "waterAreas":
                spacing = max(8, 14 * density)
                phase = stable_number(str(item.get("id", index)), seed) % spacing
                for y in range(-phase, patch.height + spacing, spacing):
                    for x in range(0, patch.width, 28 * density):
                        end_x = min(patch.width - 1, x + 12 * density)
                        detail_draw.line((x, y, end_x, y), fill=detail_color, width=width)
                        alpha_draw.line((x, y, end_x, y), fill=112, width=width)
            elif is_track:
                center_x = sum(x for x, _ in local_exterior) / len(local_exterior)
                center_y = sum(y for _, y in local_exterior) / len(local_exterior)
                for scale in (0.96, 0.91, 0.86, 0.81):
                    lane = [
                        (
                            round(center_x + (x - center_x) * scale),
                            round(center_y + (y - center_y) * scale),
                        )
                        for x, y in local_exterior
                    ]
                    detail_draw.line(lane + [lane[0]], fill=detail_color, width=width, joint="curve")
                    alpha_draw.line(lane + [lane[0]], fill=235, width=width, joint="curve")
            else:
                inset = max(4, 8 * density)
                field_box = (inset, inset, max(inset, patch.width - inset - 1), max(inset, patch.height - inset - 1))
                detail_draw.rectangle(field_box, outline=detail_color, width=width)
                alpha_draw.rectangle(field_box, outline=255, width=width)
                center_x = patch.width // 2
                center_y = patch.height // 2
                if patch.width >= patch.height:
                    detail_draw.line((center_x, inset, center_x, patch.height - inset), fill=detail_color, width=width)
                    alpha_draw.line((center_x, inset, center_x, patch.height - inset), fill=255, width=width)
                else:
                    detail_draw.line((inset, center_y, patch.width - inset, center_y), fill=detail_color, width=width)
                    alpha_draw.line((inset, center_y, patch.width - inset, center_y), fill=255, width=width)
                radius = max(3 * density, min(patch.width, patch.height) // 9)
                circle = (center_x - radius, center_y - radius, center_x + radius, center_y + radius)
                detail_draw.ellipse(circle, outline=detail_color, width=width)
                alpha_draw.ellipse(circle, outline=255, width=width)
            clipped_details = ImageChops.multiply(mask, detail_mask)
            patch.paste(details, (0, 0), clipped_details)
            result.paste(patch, box[:2])
            outline = ImageDraw.Draw(result)
            outline.line(list(exterior) + [exterior[0]], fill=edge_color, width=max(1, 2 * density), joint="curve")
            for ring in holes:
                outline.line(list(ring) + [ring[0]], fill=edge_color, width=max(1, density), joint="curve")
    return result


def draw_dashed_polyline(
    draw: ImageDraw.ImageDraw,
    points: Sequence[tuple[int, int]],
    *,
    fill: tuple[int, int, int],
    width: int,
    dash: int,
    gap: int,
    phase: int = 0,
) -> None:
    if len(points) < 2:
        return
    period = max(1, dash + gap)
    travelled = 0.0
    for start, end in zip(points, points[1:]):
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        if length <= 0:
            continue
        cursor = 0.0
        while cursor < length:
            pattern_pos = (travelled + cursor + phase) % period
            if pattern_pos < dash:
                run = min(length - cursor, dash - pattern_pos)
                from_x = round(start[0] + dx * cursor / length)
                from_y = round(start[1] + dy * cursor / length)
                to_x = round(start[0] + dx * (cursor + run) / length)
                to_y = round(start[1] + dy * (cursor + run) / length)
                draw.line((from_x, from_y, to_x, to_y), fill=fill, width=max(1, width))
            else:
                run = min(length - cursor, period - pattern_pos)
            cursor += max(run, 0.5)
        travelled += length


def polyline_samples(
    points: Sequence[tuple[int, int]], spacing: float,
) -> Iterable[tuple[float, float, float, float]]:
    if len(points) < 2 or spacing <= 0:
        return
    remaining = 0.0
    for start, end in zip(points, points[1:]):
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        if length <= 0:
            continue
        ux, uy = dx / length, dy / length
        cursor = remaining
        while cursor <= length:
            yield start[0] + ux * cursor, start[1] + uy * cursor, ux, uy
            cursor += spacing
        remaining = cursor - length


def road_nominal_width(centerline: Mapping[str, Any]) -> float:
    explicit = feature_value(centerline, "width", "est_width")
    if explicit not in (None, ""):
        try:
            return max(8.0, float(explicit))
        except (TypeError, ValueError):
            pass
    highway = str(feature_value(centerline, "highway", default="residential")).lower()
    if highway in {"primary", "trunk"}:
        return 36.0
    if highway in {"secondary", "tertiary"}:
        return 30.0
    if highway in {"service", "living_street"}:
        return 16.0
    return 22.0


def nearest_centerline_direction(
    x: float,
    y: float,
    centerlines: Sequence[Mapping[str, Any]],
) -> tuple[float, float, float]:
    best: tuple[float, float, float, float] | None = None
    for centerline in centerlines:
        raw_points = centerline.get("points", [])
        if not isinstance(raw_points, Sequence):
            continue
        for start, end in zip(raw_points, raw_points[1:]):
            if not isinstance(start, Sequence) or not isinstance(end, Sequence) or len(start) < 2 or len(end) < 2:
                continue
            x1, y1 = float(start[0]), float(start[1])
            x2, y2 = float(end[0]), float(end[1])
            dx, dy = x2 - x1, y2 - y1
            length_sq = dx * dx + dy * dy
            if length_sq <= 0:
                continue
            projection = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length_sq))
            near_x, near_y = x1 + projection * dx, y1 + projection * dy
            distance_sq = (x - near_x) ** 2 + (y - near_y) ** 2
            if best is None or distance_sq < best[0]:
                length = math.sqrt(length_sq)
                best = (distance_sq, dx / length, dy / length, road_nominal_width(centerline))
    return (best[1], best[2], best[3]) if best is not None else (1.0, 0.0, 22.0)


def draw_street_details(
    base: Image.Image,
    layout: Mapping[str, Any],
    density: int,
    tile_size: int,
    seed: int,
) -> Image.Image:
    result = base.copy()
    draw = ImageDraw.Draw(result)
    centerlines = [item for _, item in iter_collection(layout, "streetCenterlines")]
    for index, centerline in enumerate(centerlines):
        label = f"streetCenterlines[{index}]"
        factor = unit_factor(centerline, tile_size)
        points = extract_points(centerline, factor, density, label)
        highway = str(feature_value(centerline, "highway", default="residential")).lower()
        if highway in {"footway", "pedestrian", "path", "cycleway", "steps"}:
            continue
        key = str(centerline.get("id", index))
        marking_width = max(1, density)
        draw.line(points, fill=(78, 79, 75), width=max(1, 2 * density), joint="curve")
        if highway in {"service", "living_street", "residential", "unclassified"}:
            color = (206, 207, 194)
            dash, gap = 7 * density, 10 * density
        else:
            color = (231, 230, 211)
            dash, gap = 12 * density, 8 * density
            marking_width = max(2, density)
        draw_dashed_polyline(
            draw,
            points,
            fill=color,
            width=marking_width,
            dash=dash,
            gap=gap,
            phase=stable_number(key, seed) % max(1, dash + gap),
        )

    for index, crossing in iter_collection(layout, "crossings"):
        label = f"crossings[{index}]"
        raw_points = crossing.get("points")
        if isinstance(raw_points, Sequence) and len(raw_points) >= 2:
            factor = unit_factor(crossing, tile_size)
            crossing_points = extract_points(crossing, factor, density, label)
            start, end = crossing_points[0], crossing_points[-1]
            axis_x, axis_y = end[0] - start[0], end[1] - start[1]
            span = math.hypot(axis_x, axis_y)
            if span <= 0:
                continue
            axis_x, axis_y = axis_x / span, axis_y / span
            center_x, center_y = (start[0] + end[0]) / 2, (start[1] + end[1]) / 2
            road_x, road_y = -axis_y, axis_x
        else:
            logical_x = logical_number(crossing.get("x"), f"{label}.x")
            logical_y = logical_number(crossing.get("y"), f"{label}.y")
            road_x, road_y, nominal_width = nearest_centerline_direction(logical_x, logical_y, centerlines)
            axis_x, axis_y = -road_y, road_x
            span = float(feature_value(crossing, "width", "length", default=nominal_width)) * density
            center_x, center_y = logical_x * density, logical_y * density
        stripe_step = max(4, 4 * density)
        stripe_width = max(2, 2 * density)
        stripe_length = max(5, 7 * density)
        count = max(3, int(span // stripe_step))
        for stripe in range(count):
            offset = (stripe - (count - 1) / 2) * stripe_step
            stripe_x = center_x + axis_x * offset
            stripe_y = center_y + axis_y * offset
            half_axis = stripe_width / 2
            half_road = stripe_length / 2
            polygon = [
                (round(stripe_x - axis_x * half_axis - road_x * half_road), round(stripe_y - axis_y * half_axis - road_y * half_road)),
                (round(stripe_x + axis_x * half_axis - road_x * half_road), round(stripe_y + axis_y * half_axis - road_y * half_road)),
                (round(stripe_x + axis_x * half_axis + road_x * half_road), round(stripe_y + axis_y * half_axis + road_y * half_road)),
                (round(stripe_x - axis_x * half_axis + road_x * half_road), round(stripe_y - axis_y * half_axis + road_y * half_road)),
            ]
            draw.polygon(polygon, fill=(238, 237, 218))
    return result


def roman_number(value: str) -> int | None:
    numerals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    token = value.strip().upper()
    if not token or any(character not in numerals for character in token):
        return None
    total = 0
    previous = 0
    for character in reversed(token):
        current = numerals[character]
        total += -current if current < previous else current
        previous = max(previous, current)
    return total if total > 0 else None


def building_levels(item: Mapping[str, Any]) -> int:
    raw = feature_value(item, "levels", "building:levels", default=None)
    if raw not in (None, ""):
        try:
            return max(1, min(12, round(float(str(raw).replace(",", ".")))))
        except (TypeError, ValueError):
            pass
    construction = str(feature_value(item, "construction", "constru", default=""))
    above_ground = [
        level
        for part in construction.replace(" ", "").split("+")
        if part and not part.startswith("-")
        for level in [roman_number(part)]
        if level is not None
    ]
    return max(1, min(12, max(above_ground, default=1)))


def building_descriptor(item: Mapping[str, Any]) -> str:
    return " ".join(
        str(feature_value(item, name, default=""))
        for name in ("name", "kind", "building", "construction", "amenity", "landuse")
    ).lower()


def building_palette(
    item: Mapping[str, Any], levels: int, key: str, seed: int,
) -> tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]:
    descriptor = building_descriptor(item)
    if any(token in descriptor for token in ("construction_site", "construction site", "skeleton", "obra de calle", "solar")):
        roof, wall = (151, 145, 129), (181, 164, 132)
    elif any(token in descriptor for token in ("stadium", "arena", "palacio de deportes")):
        roof, wall = (207, 211, 202), (174, 184, 178)
    elif any(token in descriptor for token in ("industrial", "warehouse", "hangar")):
        roof, wall = (128, 137, 137), (151, 154, 145)
    elif any(token in descriptor for token in ("school", "college", "kindergarten", "civic")):
        roof, wall = (170, 112, 69), (207, 176, 123)
    elif any(token in descriptor for token in ("church", "religious", "chapel")):
        roof, wall = (127, 91, 73), (207, 190, 157)
    elif any(token in descriptor for token in ("commercial", "retail", "supermarket", "office")):
        roof, wall = (91, 125, 127), (164, 174, 160)
    elif any(token in descriptor for token in ("garage", "shed", "roof")):
        roof, wall = (116, 112, 103), (153, 146, 128)
    else:
        roof, wall = (154, 91, 72), (193, 151, 111)
    variant = (stable_number(key, seed) % 17) - 8
    height_tone = min(12, (levels - 1) * 2)
    roof = shade_color(roof, variant - height_tone // 2)
    wall = shade_color(wall, variant // 2 - height_tone)
    return roof, wall, shade_color(wall, -28)


def draw_building_footprints(
    base: Image.Image,
    layout: Mapping[str, Any],
    density: int,
    tile_size: int,
    seed: int,
) -> Image.Image:
    result = base.copy()
    prepared: list[tuple[int, int, dict[str, Any], list[tuple[int, int]], list[list[tuple[int, int]]]]] = []
    for index, item in iter_collection(layout, "buildingFootprints"):
        exterior, holes = feature_rings(item, density, tile_size, f"buildingFootprints[{index}]")
        descriptor = building_descriptor(item)
        is_construction_shell = holes and any(
            token in descriptor
            for token in ("construction_site", "construction site", "skeleton", "obra de calle", "solar")
        )
        # En la obra de Jerusalén dibujamos primero el anillo exterior y luego
        # el volumen interior; así el hueco no borra la trama de estructura.
        depth = min(y for _, y in exterior) if is_construction_shell else max(y for _, y in exterior)
        prepared.append((depth, index, item, exterior, holes))

    for _, index, item, exterior, holes in sorted(prepared, key=lambda entry: (entry[0], entry[1])):
        draw = ImageDraw.Draw(result)
        key = str(item.get("id", f"building-{index}"))
        levels = building_levels(item)
        solid = bool(item.get("solid", True))
        descriptor = building_descriptor(item)
        is_construction = any(
            token in descriptor
            for token in ("construction_site", "construction site", "skeleton", "obra de calle", "solar")
        )
        is_major_sports = any(token in descriptor for token in ("stadium", "arena", "palacio de deportes"))
        height = (
            max(5 * density, min(24 * density, round((4 + levels * 2.5) * density)))
            if solid
            else max(2, 3 * density)
        )
        if is_construction:
            height = max(2 * density, 4 * density)
        elif is_major_sports:
            height = max(height, 10 * density)
        roof, wall, dark_wall = building_palette(item, levels, key, seed)
        if not solid:
            roof = shade_color(roof, 24)
            wall = shade_color(wall, 18)
            dark_wall = shade_color(dark_wall, 18)
        outline = shade_color(dark_wall, -30)
        ground = [(x, y + height) for x, y in exterior]
        shadow_offset = max(3 * density, height // 3)
        shadow = [(x + shadow_offset, y + height + shadow_offset // 2) for x, y in exterior]
        draw.polygon(shadow, fill=(58, 65, 58))

        for edge_index, (start, end) in enumerate(zip(exterior, exterior[1:] + exterior[:1])):
            face = [start, end, (end[0], end[1] + height), (start[0], start[1] + height)]
            edge_tone = 10 if end[0] < start[0] else -5
            face_color = shade_color(wall if edge_index % 2 == 0 else dark_wall, edge_tone)
            draw.polygon(face, fill=face_color, outline=outline)
            if levels > 1 and math.hypot(end[0] - start[0], end[1] - start[1]) >= 10 * density:
                for floor in range(1, levels):
                    offset = round(height * floor / levels)
                    draw.line(
                        (start[0], start[1] + offset, end[0], end[1] + offset),
                        fill=shade_color(face_color, -13),
                        width=max(1, density),
                    )

        for ring in holes:
            for start, end in zip(ring, ring[1:] + ring[:1]):
                draw.polygon(
                    [start, end, (end[0], end[1] + height), (start[0], start[1] + height)],
                    fill=dark_wall,
                    outline=outline,
                )

        draw.polygon(exterior, fill=roof, outline=outline)
        for ring in holes:
            draw.polygon(ring, fill=(67, 78, 69), outline=outline)

        left = min(x for x, _ in exterior)
        right = max(x for x, _ in exterior)
        top = min(y for _, y in exterior)
        bottom = max(y for _, y in exterior)
        span_x, span_y = right - left, bottom - top
        ridge_color = shade_color(roof, 26)
        ridge_shadow = shade_color(roof, -25)
        if is_major_sports and min(span_x, span_y) >= 8 * density:
            center_x = sum(x for x, _ in exterior) / len(exterior)
            center_y = sum(y for _, y in exterior) / len(exterior)
            for scale, color in ((0.94, ridge_shadow), (0.88, ridge_color)):
                inset_ring = [
                    (
                        round(center_x + (x - center_x) * scale),
                        round(center_y + (y - center_y) * scale),
                    )
                    for x, y in exterior
                ]
                draw.line(inset_ring + [inset_ring[0]], fill=color, width=max(1, density), joint="curve")
        elif not is_construction and min(span_x, span_y) >= 8 * density:
            if span_x >= span_y:
                ridge_y = (top + bottom) // 2
                ridge = (left + span_x // 6, ridge_y, right - span_x // 6, ridge_y)
            else:
                ridge_x = (left + right) // 2
                ridge = (ridge_x, top + span_y // 6, ridge_x, bottom - span_y // 6)
            draw.line(ridge, fill=ridge_shadow, width=max(2, 2 * density))
            draw.line(ridge, fill=ridge_color, width=max(1, density))

        if is_construction:
            local_mask, box, _, _ = local_polygon_mask(exterior, holes)
            patch = result.crop(box)
            hatch = Image.new("RGB", patch.size, roof)
            hatch_alpha = Image.new("L", patch.size, 0)
            hatch_draw = ImageDraw.Draw(hatch)
            hatch_alpha_draw = ImageDraw.Draw(hatch_alpha)
            step = max(8, 12 * density)
            for offset in range(-patch.height, patch.width + patch.height, step):
                line = (offset, 0, offset - patch.height, patch.height)
                hatch_draw.line(line, fill=shade_color(roof, -36), width=max(1, density))
                hatch_alpha_draw.line(line, fill=185, width=max(1, density))
            clipped_hatch = ImageChops.multiply(local_mask, hatch_alpha)
            patch.paste(hatch, (0, 0), clipped_hatch)
            result.paste(patch, box[:2])
            ImageDraw.Draw(result).line(exterior + [exterior[0]], fill=outline, width=max(1, density), joint="curve")

        area = max(1, span_x * span_y)
        detail_count = min(6, max(1, area // max(1, (150 * density) ** 2)))
        digest = stable_number(f"{key}:roof-details", seed)
        for detail_index in range(0 if is_construction or is_major_sports else detail_count):
            fraction_x = 0.2 + (((digest >> (detail_index * 7)) & 63) / 105)
            fraction_y = 0.2 + (((digest >> (detail_index * 7 + 3)) & 63) / 105)
            vent_x = round(left + span_x * min(0.8, fraction_x))
            vent_y = round(top + span_y * min(0.8, fraction_y))
            logical_exterior = [(x / density, y / density) for x, y in exterior]
            logical_holes = [[(x / density, y / density) for x, y in ring] for ring in holes]
            if not point_in_polygon(vent_x / density, vent_y / density, logical_exterior):
                continue
            if any(point_in_polygon(vent_x / density, vent_y / density, ring) for ring in logical_holes):
                continue
            size = max(2, 2 * density)
            draw.rectangle(
                (vent_x - size, vent_y - size, vent_x + size, vent_y + size),
                fill=shade_color(roof, -35),
                outline=ridge_color,
                width=max(1, density),
            )
    return result


def draw_barrier_segments(
    base: Image.Image,
    layout: Mapping[str, Any],
    density: int,
    tile_size: int,
    seed: int,
) -> Image.Image:
    result = base.copy()
    draw = ImageDraw.Draw(result)
    for index, barrier in iter_collection(layout, "barrierSegments"):
        label = f"barrierSegments[{index}]"
        factor = unit_factor(barrier, tile_size)
        points = extract_points(barrier, factor, density, label)
        kind = str(feature_value(barrier, "kind", "barrier", default="fence")).lower().replace("_", "")
        key = str(barrier.get("id", index))
        requested_width = feature_value(barrier, "width", default=None)
        if requested_width is None:
            logical_width = 4 if kind in {"wall", "muro", "retainingwall"} else 2
        else:
            logical_width = float(requested_width) * factor
        width = max(1, round(logical_width * density))
        if kind in {"wall", "muro", "retainingwall"}:
            draw.line(points, fill=(59, 59, 55), width=max(width + 2 * density, 3), joint="curve")
            draw.line(points, fill=(139, 132, 111), width=max(width, 2), joint="curve")
            for x, y, ux, uy in polyline_samples(points, 12 * density):
                nx, ny = -uy * density * 2, ux * density * 2
                draw.line((round(x - nx), round(y - ny), round(x + nx), round(y + ny)), fill=(86, 82, 71), width=max(1, density))
        elif kind in {"gate", "verja", "entrance"}:
            draw.line(points, fill=(38, 47, 45), width=max(3, width + density), joint="curve")
            draw_dashed_polyline(
                draw,
                points,
                fill=(172, 159, 105),
                width=max(1, density),
                dash=5 * density,
                gap=3 * density,
                phase=stable_number(key, seed) % max(1, 8 * density),
            )
            for x, y, _, _ in polyline_samples(points, 10 * density):
                radius = max(1, 2 * density)
                draw.rectangle((round(x - radius), round(y - radius), round(x + radius), round(y + radius)), fill=(47, 53, 48))
        else:
            wire = kind in {"wirefence", "chainlink", "metal", "mesh"}
            draw.line(points, fill=(42, 57, 51), width=max(2, width), joint="curve")
            draw_dashed_polyline(
                draw,
                points,
                fill=(124, 143, 128) if wire else (99, 122, 86),
                width=max(1, density),
                dash=3 * density,
                gap=3 * density,
                phase=stable_number(key, seed) % max(1, 6 * density),
            )
            spacing = 9 * density if wire else 12 * density
            for x, y, _, _ in polyline_samples(points, spacing):
                radius = max(1, density)
                draw.rectangle((round(x - radius), round(y - radius), round(x + radius), round(y + radius)), fill=(28, 45, 38))
    return result


def render_static_gis_features(
    base: Image.Image,
    layout: Mapping[str, Any],
    density: int,
    tile_size: int,
    seed: int,
) -> Image.Image:
    result = draw_polygon_areas(base, layout, density, tile_size, seed)
    result = draw_street_details(result, layout, density, tile_size, seed)
    result = draw_building_footprints(result, layout, density, tile_size, seed)
    return draw_barrier_segments(result, layout, density, tile_size, seed)


def draw_door_markers(
    base: Image.Image,
    layout: Mapping[str, Any],
    map_config: Mapping[str, Any],
    density: int,
    tile_size: int,
) -> tuple[Image.Image, dict[str, int]]:
    """Hornea umbrales GIS; son señal visual, nunca una nueva colisión."""
    config_doors = map_config.get("doors")
    dimensions_match = (
        map_config.get("width") in (None, layout.get("width"))
        and map_config.get("height") in (None, layout.get("height"))
    )
    raw_doors = config_doors if config_doors and dimensions_match else layout.get("doors", [])
    if not isinstance(raw_doors, Sequence) or isinstance(raw_doors, (str, bytes)):
        raise TypeError("doors debe ser un array.")
    if not raw_doors:
        return base, {"total": 0, "usable": 0, "closed": 0, "prism": 0, "outOfBounds": 0}
    result = base.copy()
    draw = ImageDraw.Draw(result)
    counts: Counter[str] = Counter(total=len(raw_doors))
    for index, door in enumerate(raw_doors):
        if not isinstance(door, Mapping):
            raise TypeError(f"doors[{index}] debe ser un objeto.")
        col = logical_number(door.get("col"), f"doors[{index}].col")
        row = logical_number(door.get("row"), f"doors[{index}].row")
        center_x = round((col + 0.5) * tile_size * density)
        center_y = round((row + 0.5) * tile_size * density)
        if not (0 <= center_x < result.width and 0 <= center_y < result.height):
            counts["outOfBounds"] += 1
            continue
        approach = door.get("approach", [])
        direction = (
            str(approach[2]).lower()
            if isinstance(approach, Sequence) and not isinstance(approach, (str, bytes)) and len(approach) >= 3
            else str(door.get("direction", "up")).lower()
        )
        horizontal = direction in {"up", "down"}
        action = str(door.get("action", "closed")).lower()
        if action == "prism":
            counts["prism"] += 1
            radius_x = max(5, 8 * density)
            radius_y = max(4, 6 * density)
            diamond = [
                (center_x, center_y - radius_y),
                (center_x + radius_x, center_y),
                (center_x, center_y + radius_y),
                (center_x - radius_x, center_y),
            ]
            draw.polygon(diamond, fill=(55, 31, 83), outline=(25, 18, 42))
            inner = [
                (center_x, center_y - radius_y // 2),
                (center_x + radius_x // 2, center_y),
                (center_x, center_y + radius_y // 2),
                (center_x - radius_x // 2, center_y),
            ]
            draw.polygon(inner, fill=(125, 76, 181), outline=(89, 205, 214))
            draw.point((center_x, center_y), fill=(222, 252, 241))
            continue

        closed = action == "closed"
        counts["closed" if closed else "usable"] += 1
        long_radius = max(6, 9 * density)
        short_radius = max(2, 3 * density)
        if horizontal:
            box = (
                center_x - long_radius,
                center_y - short_radius,
                center_x + long_radius,
                center_y + short_radius,
            )
        else:
            box = (
                center_x - short_radius,
                center_y - long_radius,
                center_x + short_radius,
                center_y + long_radius,
            )
        fill = (92, 62, 52) if closed else (169, 132, 65)
        edge = (48, 39, 36) if closed else (72, 71, 45)
        status = (171, 64, 55) if closed else (91, 157, 86)
        draw.rectangle(box, fill=edge)
        inset = max(1, density)
        inner_box = (box[0] + inset, box[1] + inset, box[2] - inset, box[3] - inset)
        draw.rectangle(inner_box, fill=fill)
        marker = max(1, 2 * density)
        draw.rectangle(
            (center_x - marker, center_y - marker, center_x + marker, center_y + marker),
            fill=status,
            outline=shade_color(status, -45),
        )
        if closed:
            draw.line(
                (center_x - marker, center_y - marker, center_x + marker, center_y + marker),
                fill=(231, 183, 145),
                width=max(1, density),
            )
    return result, {
        "total": int(counts["total"]),
        "usable": int(counts["usable"]),
        "closed": int(counts["closed"]),
        "prism": int(counts["prism"]),
        "outOfBounds": int(counts["outOfBounds"]),
    }


def draw_sports_fields(base: Image.Image, layout: Mapping[str, Any], density: int) -> Image.Image:
    fields = layout.get("sportsFields", [])
    if not isinstance(fields, Sequence) or not fields:
        return base
    result = base.convert("RGBA")
    overlay = Image.new("RGBA", result.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    def point(x: float, y: float) -> tuple[int, int]:
        return round(x * density), round(y * density)

    for index, field in enumerate(fields):
        if not isinstance(field, Mapping):
            raise TypeError(f"sportsFields[{index}] debe ser un objeto.")
        x = logical_number(field.get("x"), f"sportsFields[{index}].x")
        y = logical_number(field.get("y"), f"sportsFields[{index}].y")
        w = logical_number(field.get("w"), f"sportsFields[{index}].w")
        h = logical_number(field.get("h"), f"sportsFields[{index}].h")
        left, top = point(x, y)
        right, bottom = point(x + w, y + h)
        draw.rectangle((left, top, right, bottom), fill=(17, 115, 46, 82))
        stripe_width = max(1, round(w * density / 8))
        for stripe in range(8):
            if stripe % 2:
                stripe_left = left + stripe * stripe_width
                draw.rectangle(
                    (stripe_left, top, min(right, stripe_left + stripe_width), bottom),
                    fill=(132, 226, 104, 24),
                )

        inset = 14 * density
        line_width = max(2, 2 * density)
        line_color = (238, 246, 217, 225)
        pitch = (left + inset, top + inset, right - inset, bottom - inset)
        draw.rectangle(pitch, outline=line_color, width=line_width)
        middle_y = (top + bottom) // 2
        draw.line((left + inset, middle_y, right - inset, middle_y), fill=line_color, width=line_width)
        center_x = (left + right) // 2
        radius = 28 * density
        draw.ellipse(
            (center_x - radius, middle_y - radius, center_x + radius, middle_y + radius),
            outline=line_color,
            width=line_width,
        )
        box_width = 88 * density
        box_depth = 40 * density
        draw.rectangle(
            (center_x - box_width // 2, top + inset, center_x + box_width // 2, top + inset + box_depth),
            outline=line_color,
            width=line_width,
        )
        draw.rectangle(
            (center_x - box_width // 2, bottom - inset - box_depth, center_x + box_width // 2, bottom - inset),
            outline=line_color,
            width=line_width,
        )

        fence_color = (34, 72, 54, 245)
        fence_width = max(2, 3 * density)
        gate = field.get("gate", {}) if isinstance(field.get("gate"), Mapping) else {}
        gate_from = x + float(gate.get("from", w * 0.42))
        gate_to = x + float(gate.get("to", w * 0.58))
        draw.line((left, top, right, top), fill=fence_color, width=fence_width)
        draw.line((left, top, left, bottom), fill=fence_color, width=fence_width)
        draw.line((right, top, right, bottom), fill=fence_color, width=fence_width)
        draw.line((left, bottom, round(gate_from * density), bottom), fill=fence_color, width=fence_width)
        draw.line((round(gate_to * density), bottom, right, bottom), fill=fence_color, width=fence_width)
        post_radius = max(2, 2 * density)
        for post_x in range(left, right + 1, 24 * density):
            for post_y in (top, bottom):
                if post_y == bottom and round(gate_from * density) <= post_x <= round(gate_to * density):
                    continue
                draw.ellipse(
                    (post_x - post_radius, post_y - post_radius, post_x + post_radius, post_y + post_radius),
                    fill=(20, 49, 36, 255),
                )
        for post_y in range(top, bottom + 1, 24 * density):
            for post_x in (left, right):
                draw.ellipse(
                    (post_x - post_radius, post_y - post_radius, post_x + post_radius, post_y + post_radius),
                    fill=(20, 49, 36, 255),
                )

    result.alpha_composite(overlay)
    return result.convert("RGB")


def save_image_atomic(
    image: Image.Image, path: Path, *, quality: int, lossless: bool, png_optimize: bool = True,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.stem}.tmp{path.suffix}")
    suffix = path.suffix.lower()
    if suffix == ".webp":
        image.save(temporary, "WEBP", quality=quality, lossless=lossless, method=6, exact=True)
    elif suffix == ".png":
        image.save(temporary, "PNG", optimize=png_optimize)
    elif suffix in {".jpg", ".jpeg"}:
        image.convert("RGB").save(temporary, "JPEG", quality=quality, optimize=True, subsampling=0)
    else:
        raise ValueError(f"Extension de imagen no soportada: {path.suffix}")
    os.replace(temporary, path)


def composite_world_assets(preview: Image.Image, layout: Mapping[str, Any]) -> Image.Image:
    """Compone la vista de auditoria; los chunks conservan solo el terreno."""
    catalog = layout.get("assetCatalog", {})
    placements = layout.get("worldAssets", [])
    if not isinstance(catalog, Mapping) or not isinstance(placements, Sequence):
        return preview
    result = preview.convert("RGBA")
    cache: dict[tuple[str, int, int, float, bool], Image.Image] = {}
    for placement in sorted(
        (item for item in placements if isinstance(item, Mapping)),
        key=lambda item: float(item.get("depthY", item.get("y", 0))),
    ):
        sprite_id = str(placement.get("sprite", ""))
        prototype = catalog.get(sprite_id, {})
        source_name = placement.get("src") or (prototype.get("src") if isinstance(prototype, Mapping) else None)
        if not source_name:
            continue
        source_path = resolve(Path(str(source_name)))
        if not source_path.exists():
            raise FileNotFoundError(f"Falta el sprite {sprite_id}: {relative_name(source_path)}")
        width = max(1, round(float(placement.get("w", prototype.get("w", 1)))))
        height = max(1, round(float(placement.get("h", prototype.get("h", 1)))))
        rotation = float(placement.get("rotation", 0))
        flip_x = bool(placement.get("flipX", False))
        cache_key = (str(source_path), width, height, rotation, flip_x)
        sprite = cache.get(cache_key)
        if sprite is None:
            with Image.open(source_path) as source:
                sprite = source.convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
            if flip_x:
                sprite = ImageOps.mirror(sprite)
            if rotation:
                sprite = sprite.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)
            cache[cache_key] = sprite
        anchor_x = round(float(placement.get("x", 0)))
        anchor_y = round(float(placement.get("y", 0)))
        if rotation:
            center_y = anchor_y - height / 2
            left = round(anchor_x - sprite.width / 2)
            top = round(center_y - sprite.height / 2)
        else:
            left = round(anchor_x - width / 2)
            top = anchor_y - height
        result.alpha_composite(sprite, (left, top))
    return result.convert("RGB")


def point_in_polygon(x: float, y: float, points: Sequence[Sequence[float]]) -> bool:
    inside = False
    previous = len(points) - 1
    for index, point in enumerate(points):
        x1, y1 = float(point[0]), float(point[1])
        x2, y2 = float(points[previous][0]), float(points[previous][1])
        if ((y1 > y) != (y2 > y)) and x < ((x2 - x1) * (y - y1)) / ((y2 - y1) or 1e-9) + x1:
            inside = not inside
        previous = index
    return inside


def composite_encounter_grass(
    preview: Image.Image,
    layout: Mapping[str, Any],
    map_config: Mapping[str, Any],
    tile_size: int,
) -> tuple[Image.Image, int]:
    """Compone la hierba alta en previews; el runtime anima las mismas celdas."""
    areas = layout.get("encounterAreas", [])
    grass = map_config.get("encounterGrass", {})
    source_name = grass.get("image") if isinstance(grass, Mapping) else None
    if not source_name or not isinstance(areas, Sequence):
        return preview, 0
    source_path = resolve(Path(str(source_name)))
    if not source_path.exists():
        raise FileNotFoundError(f"Falta el spritesheet de hierba alta: {relative_name(source_path)}")
    frame_size = max(1, int(grass.get("frameSize", 64)))
    frame_count = max(1, int(grass.get("frames", 1)))
    draw_width = max(1, int(grass.get("drawWidth", 44)))
    draw_height = max(1, int(grass.get("drawHeight", 48)))
    with Image.open(source_path) as source:
        atlas = source.convert("RGBA")
    frames = [
        atlas.crop((index * frame_size, 0, (index + 1) * frame_size, frame_size))
        .resize((draw_width, draw_height), Image.Resampling.NEAREST)
        for index in range(frame_count)
    ]
    result = preview.convert("RGBA")
    drawn: set[tuple[int, int]] = set()
    for area in (item for item in areas if isinstance(item, Mapping)):
        polygon = area.get("points", []) if area.get("shape") == "polygon" else []
        if polygon:
            xs = [float(point[0]) for point in polygon]
            ys = [float(point[1]) for point in polygon]
        else:
            xs = [float(area.get("x", 0)), float(area.get("x", 0)) + float(area.get("w", 0))]
            ys = [float(area.get("y", 0)), float(area.get("y", 0)) + float(area.get("h", 0))]
        if not xs or not ys:
            continue
        min_col = max(0, math.floor(min(xs) / tile_size))
        max_col = min(math.ceil(preview.width / tile_size) - 1, math.floor(max(xs) / tile_size))
        min_row = max(0, math.floor(min(ys) / tile_size))
        max_row = min(math.ceil(preview.height / tile_size) - 1, math.floor(max(ys) / tile_size))
        for row in range(min_row, max_row + 1):
            for column in range(min_col, max_col + 1):
                center_x = (column + .5) * tile_size
                center_y = (row + .5) * tile_size
                contains = point_in_polygon(center_x, center_y, polygon) if polygon else (
                    xs[0] <= center_x <= xs[1] and ys[0] <= center_y <= ys[1]
                )
                if not contains or (column, row) in drawn:
                    continue
                drawn.add((column, row))
                frame_index = ((column * 73856093) ^ (row * 19349663)) & 0xFFFFFFFF
                frame = frames[frame_index % frame_count]
                anchor_x = round(center_x)
                anchor_y = round((row + 1) * tile_size + 2)
                result.alpha_composite(frame, (anchor_x - draw_width // 2, anchor_y - draw_height))
    return result.convert("RGB"), len(drawn)


def compact_navigation_mask(
    walk_mask: Image.Image, width: int, height: int, density: int, cell_size: int,
) -> Image.Image:
    if cell_size <= 0:
        raise ValueError("navigationCellSize debe ser positivo.")
    columns = math.ceil(width / cell_size)
    rows = math.ceil(height / cell_size)
    reduced = walk_mask.resize((columns, rows), Image.Resampling.BOX)
    # Exige mayoria de superficie abierta; el muestreo circular del runtime
    # aporta el margen fino del jugador sin ensanchar senderos.
    return reduced.point(lambda value: 255 if value >= 160 else 0, mode="L")


def make_overlay(
    preview: Image.Image,
    walk_mask: Image.Image,
    blocked_mask: Image.Image,
    logical_size: tuple[int, int],
) -> Image.Image:
    walk = walk_mask.resize(logical_size, Image.Resampling.NEAREST)
    blocked = blocked_mask.resize(logical_size, Image.Resampling.NEAREST)
    overlay = preview.convert("RGBA")
    green = Image.new("RGBA", logical_size, (29, 235, 116, 112))
    red = Image.new("RGBA", logical_size, (244, 63, 94, 150))
    overlay.alpha_composite(Image.composite(green, Image.new("RGBA", logical_size), walk))
    overlay.alpha_composite(Image.composite(red, Image.new("RGBA", logical_size), blocked))
    draw = ImageDraw.Draw(overlay, "RGBA")
    font = ImageFont.load_default()
    label = "VERDE: transitable  |  ROJO: bloqueo/collider"
    box = draw.textbbox((0, 0), label, font=font)
    label_width = box[2] - box[0]
    label_height = box[3] - box[1]
    draw.rounded_rectangle((12, 12, 28 + label_width, 24 + label_height), radius=5, fill=(20, 25, 30, 210))
    draw.text((20, 17), label, font=font, fill=(255, 255, 255, 255))
    return overlay


def mask_pixel_count(mask: Image.Image) -> int:
    histogram = mask.histogram()
    return histogram[255]


def point_is_walkable(mask: Image.Image, x: float, y: float, density: int) -> bool:
    px = round(x * density)
    py = round(y * density)
    if px < 0 or py < 0 or px >= mask.width or py >= mask.height:
        return False
    return mask.getpixel((px, py)) >= 128


def normalize_sections(
    layout: Mapping[str, Any], map_config: Mapping[str, Any], width: int, height: int,
) -> list[dict[str, Any]]:
    raw_sections = layout.get("sections") or map_config.get("sections")
    if not raw_sections:
        half_width = width // 2
        half_height = height // 2
        raw_sections = [
            {"id": "north-west", "name": "Noroeste", "x": 0, "y": 0, "w": half_width, "h": half_height},
            {"id": "north-east", "name": "Noreste", "x": half_width, "y": 0, "w": width - half_width, "h": half_height},
            {"id": "south-west", "name": "Suroeste", "x": 0, "y": half_height, "w": half_width, "h": height - half_height},
            {"id": "south-east", "name": "Sureste", "x": half_width, "y": half_height, "w": width - half_width, "h": height - half_height},
        ]
    sections: list[dict[str, Any]] = []
    for index, section in enumerate(raw_sections):
        if not isinstance(section, Mapping):
            raise TypeError(f"sections[{index}] debe ser un objeto.")
        normalized = {
            "id": str(section.get("id", f"section-{index}")),
            "name": str(section.get("name", section.get("id", f"Seccion {index + 1}"))),
            "x": round(logical_number(section.get("x", 0), f"sections[{index}].x")),
            "y": round(logical_number(section.get("y", 0), f"sections[{index}].y")),
            "w": round(logical_number(section.get("w", width), f"sections[{index}].w")),
            "h": round(logical_number(section.get("h", height), f"sections[{index}].h")),
        }
        if normalized["w"] <= 0 or normalized["h"] <= 0:
            raise ValueError(f"sections[{index}] debe tener w/h positivos.")
        normalized["x"] = min(width, max(0, normalized["x"]))
        normalized["y"] = min(height, max(0, normalized["y"]))
        normalized["w"] = min(normalized["w"], width - normalized["x"])
        normalized["h"] = min(normalized["h"], height - normalized["y"])
        if normalized["w"] <= 0 or normalized["h"] <= 0:
            raise ValueError(f"sections[{index}] queda fuera de los limites del mapa.")
        sections.append(normalized)
    return sections


def build_sector_sheet(
    preview: Image.Image,
    overlay: Image.Image,
    sections: Sequence[Mapping[str, Any]],
    card_width: int = 580,
    card_height: int = 330,
) -> Image.Image:
    margin = 24
    title_height = 36
    sheet = Image.new(
        "RGB",
        (margin * 3 + card_width * 2, margin * (len(sections) + 1) + (card_height + title_height) * len(sections)),
        (25, 31, 36),
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for row, section in enumerate(sections):
        crop_box = (
            int(section["x"]),
            int(section["y"]),
            int(section["x"] + section["w"]),
            int(section["y"] + section["h"]),
        )
        y = margin + row * (card_height + title_height + margin)
        title = f"{section['name']}  ({section['id']})"
        draw.text((margin, y), title, font=font, fill=(245, 247, 250))
        for column, source in enumerate((preview, overlay.convert("RGB"))):
            crop = source.crop(crop_box)
            crop.thumbnail((card_width, card_height), Image.Resampling.LANCZOS)
            card = Image.new("RGB", (card_width, card_height), (12, 16, 19))
            card.paste(crop, ((card_width - crop.width) // 2, (card_height - crop.height) // 2))
            x = margin + column * (card_width + margin)
            sheet.paste(card, (x, y + title_height))
            draw.rectangle((x, y + title_height, x + card_width - 1, y + title_height + card_height - 1), outline=(75, 86, 94), width=1)
    return sheet


def build_comparison_sheet(
    reference_path: Path, render: Image.Image,
) -> tuple[Image.Image, dict[str, Any]]:
    """Alinea la referencia y crea referencia / render / mezcla exacta 50:50."""
    with Image.open(reference_path) as source:
        original_size = source.size
        reference = source.convert("RGB")
    render_rgb = render.convert("RGB")
    resized = reference.size != render_rgb.size
    if resized:
        reference = reference.resize(render_rgb.size, Image.Resampling.LANCZOS)
    blended = Image.blend(reference, render_rgb, 0.5)
    sheet = Image.new("RGB", (render_rgb.width * 3, render_rgb.height), (18, 20, 22))
    sheet.paste(reference, (0, 0))
    sheet.paste(render_rgb, (render_rgb.width, 0))
    sheet.paste(blended, (render_rgb.width * 2, 0))
    return sheet, {
        "panels": ["reference", "render", "overlay50"],
        "panelWidth": render_rgb.width,
        "panelHeight": render_rgb.height,
        "referenceOriginalWidth": original_size[0],
        "referenceOriginalHeight": original_size[1],
        "referenceResized": resized,
        "blend": 0.5,
    }


def generate_chunks(
    source: Image.Image,
    output: Path,
    *,
    world_width: int,
    world_height: int,
    density: int,
    chunk_size: int,
    gutter: int,
    prefix: str,
    quality: int,
    lossless: bool,
) -> list[dict[str, Any]]:
    columns = math.ceil(world_width / chunk_size)
    rows = math.ceil(world_height / chunk_size)
    output.mkdir(parents=True, exist_ok=True)
    expected_names: set[str] = set()
    chunks: list[dict[str, Any]] = []
    for row in range(rows):
        for column in range(columns):
            logical_x = column * chunk_size
            logical_y = row * chunk_size
            logical_width = min(chunk_size, world_width - logical_x)
            logical_height = min(chunk_size, world_height - logical_y)
            crop_left = max(0, logical_x - gutter)
            crop_top = max(0, logical_y - gutter)
            crop_right = min(world_width, logical_x + logical_width + gutter)
            crop_bottom = min(world_height, logical_y + logical_height + gutter)
            crop = source.crop(
                (
                    crop_left * density,
                    crop_top * density,
                    crop_right * density,
                    crop_bottom * density,
                )
            )
            name = f"{prefix}-r{row}-c{column}.webp"
            expected_names.add(name)
            target = output / name
            save_image_atomic(crop, target, quality=quality, lossless=lossless)
            chunks.append(
                {
                    "id": f"r{row}-c{column}",
                    "file": relative_name(target),
                    "x": logical_x,
                    "y": logical_y,
                    "w": logical_width,
                    "h": logical_height,
                    "pixelWidth": crop.width,
                    "pixelHeight": crop.height,
                }
            )
    # Limpia solo chunks obsoletos del mismo prefijo, sin tocar otros ficheros.
    for stale in output.glob(f"{prefix}-r*-c*.webp"):
        if stale.name not in expected_names:
            stale.unlink()
    return chunks


def write_json_atomic(data: Mapping[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.stem}.tmp{path.suffix}")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> None:
    args = parse_args()
    if args.describe_layout:
        print(LAYOUT_CONTRACT.rstrip())
        return
    if args.density <= 0 or args.chunk_size <= 0 or args.gutter < 0:
        raise ValueError("density y chunk-size deben ser positivos; gutter no puede ser negativo.")
    if args.sheet_grid <= 0 or args.cell_inset < 0:
        raise ValueError("sheet-grid debe ser positivo y cell-inset no puede ser negativo.")
    if not 0 <= args.quality <= 100:
        raise ValueError("quality debe estar entre 0 y 100.")

    layout_path = resolve(args.layout)
    if not layout_path.exists():
        raise FileNotFoundError(
            f"Falta {relative_name(layout_path)}. Crea el layout declarativo antes de ejecutar el compilador.\n"
            f"Usa --describe-layout para consultar el contrato esperado."
        )
    map_data_path = resolve(args.map_data)
    geography_path = resolve(args.geography)
    road_sheet_path = resolve(args.road_sheet)
    terrain_sheet_path = resolve(args.terrain_sheet)
    for required in (road_sheet_path, terrain_sheet_path):
        if not required.exists():
            raise FileNotFoundError(f"Falta el tileset requerido: {relative_name(required)}")

    geography_preloads = [geography_path] if geography_path.exists() else []
    editor_data_path = layout_path.with_name("map-editor-data.js")
    layout_preloads = [*geography_preloads, *([editor_data_path] if editor_data_path.exists() else [])]
    layout = load_javascript_object(
        layout_path,
        ("CITY_MAP_LAYOUT", "MAP_LAYOUT"),
        layout_preloads,
    )
    map_config: dict[str, Any] = {}
    if map_data_path.exists():
        map_config = load_javascript_object(
            map_data_path,
            ("CITY_MAP_CONFIG", "MAP_CONFIG"),
            [*layout_preloads, layout_path],
        )

    width = int(args.world_size or layout.get("width") or map_config.get("width") or DEFAULT_WORLD_SIZE)
    height = int(args.world_size or layout.get("height") or map_config.get("height") or DEFAULT_WORLD_SIZE)
    if width <= 0 or height <= 0:
        raise ValueError("width y height deben ser positivos.")
    density = args.density
    canvas_size = (width * density, height * density)
    tile_size = int(layout.get("tileSize") or map_config.get("tileSize") or 32)
    if tile_size <= 0:
        raise ValueError("tileSize debe ser positivo.")

    cells = {
        "road": parse_cell(args.road_cell, args.sheet_grid),
        "sidewalk": parse_cell(args.sidewalk_cell, args.sheet_grid),
        "grass": parse_cell(args.grass_cell, args.sheet_grid),
        "dirt": parse_cell(args.dirt_cell, args.sheet_grid),
    }
    with Image.open(road_sheet_path) as sheet:
        road_swatch = extract_swatch(sheet.convert("RGB"), cells["road"], args.sheet_grid, args.cell_inset)
        sidewalk_swatch = extract_swatch(
            sheet.convert("RGB"), cells["sidewalk"], args.sheet_grid, args.cell_inset,
        )
    with Image.open(terrain_sheet_path) as sheet:
        grass_swatch = extract_swatch(sheet.convert("RGB"), cells["grass"], args.sheet_grid, args.cell_inset)
        dirt_swatch = extract_swatch(sheet.convert("RGB"), cells["dirt"], args.sheet_grid, args.cell_inset)

    # La textura original era demasiado neon a escala de barrio. La mantenemos
    # reconocible, pero mas calmada y cercana a la paleta exterior de HG/SS.
    grass_swatch = ImageEnhance.Color(grass_swatch).enhance(0.72)
    grass_swatch = ImageEnhance.Brightness(grass_swatch).enhance(0.90)
    grass_swatch = Image.blend(
        grass_swatch,
        Image.new("RGB", grass_swatch.size, (108, 139, 86)),
        0.16,
    )

    # La cenefa se deriva de la propia acera: misma textura, mas luminosa y calida.
    curb_swatch = ImageEnhance.Brightness(sidewalk_swatch).enhance(1.12)
    warm = Image.new("RGB", curb_swatch.size, (226, 210, 177))
    curb_swatch = Image.blend(curb_swatch, warm, 0.18)
    patterns = {
        "road": mirrored_pattern(road_swatch),
        "sidewalk": mirrored_pattern(sidewalk_swatch),
        "grass": mirrored_pattern(grass_swatch),
        "dirt": mirrored_pattern(dirt_swatch),
        "curb": mirrored_pattern(curb_swatch),
    }

    masks, walk_mask, blocked_mask, geometry_audit = build_geometry(
        layout, map_config, canvas_size, density, tile_size,
    )
    base = render_base(canvas_size, masks, patterns, args.seed)
    base = draw_sports_fields(base, layout, density)
    base = render_static_gis_features(base, layout, density, tile_size, args.seed)
    base, door_marker_audit = draw_door_markers(base, layout, map_config, density, tile_size)
    terrain_preview = base.resize((width, height), Image.Resampling.LANCZOS)
    terrain_with_grass, encounter_grass_tiles = composite_encounter_grass(
        terrain_preview, layout, map_config, tile_size,
    )
    preview = composite_world_assets(terrain_with_grass, layout)
    overlay = make_overlay(preview, walk_mask, blocked_mask, (width, height))
    navigation_cell_size = int(layout.get("navigationCellSize") or 8)
    navigation_mask = compact_navigation_mask(
        walk_mask, width, height, density, navigation_cell_size,
    )
    sections = normalize_sections(layout, map_config, width, height)

    output_base = resolve(args.output_base)
    output_preview = resolve(args.output_preview)
    output_overlay = resolve(args.output_overlay)
    output_navigation = resolve(args.output_navigation)
    output_sectors = resolve(args.output_sectors)
    output_report = resolve(args.output_report)
    reference_path = resolve(args.reference)
    output_comparison = resolve(args.output_comparison)
    chunks_path = resolve(args.chunks)
    save_image_atomic(base, output_base, quality=args.quality, lossless=args.lossless)
    save_image_atomic(preview, output_preview, quality=args.quality, lossless=args.lossless)
    save_image_atomic(overlay, output_overlay, quality=args.quality, lossless=args.lossless)
    save_image_atomic(navigation_mask, output_navigation, quality=args.quality, lossless=args.lossless)

    if not args.no_sectors:
        sector_sheet = build_sector_sheet(preview, overlay, sections)
        save_image_atomic(sector_sheet, output_sectors, quality=args.quality, lossless=args.lossless)

    comparison_info: dict[str, Any] | None = None
    if reference_path.exists():
        comparison_sheet, comparison_info = build_comparison_sheet(reference_path, preview)
        save_image_atomic(
            comparison_sheet,
            output_comparison,
            quality=args.quality,
            lossless=args.lossless,
        )
        del comparison_sheet

    chunks: list[dict[str, Any]] = []
    if not args.no_chunks:
        chunks = generate_chunks(
            base,
            chunks_path,
            world_width=width,
            world_height=height,
            density=density,
            chunk_size=args.chunk_size,
            gutter=args.gutter,
            prefix=args.chunk_prefix,
            quality=args.quality,
            lossless=args.lossless,
        )

    total_pixels = width * height
    walkable_pixels = mask_pixel_count(walk_mask) / (density * density)
    section_report: list[dict[str, Any]] = []
    for section in sections:
        box = (
            int(section["x"] * density),
            int(section["y"] * density),
            int((section["x"] + section["w"]) * density),
            int((section["y"] + section["h"]) * density),
        )
        section_walkable = mask_pixel_count(walk_mask.crop(box)) / (density * density)
        section_area = int(section["w"]) * int(section["h"])
        section_report.append(
            {
                **section,
                "walkablePixelsApprox": round(section_walkable),
                "walkablePercent": round(section_walkable * 100 / section_area, 3) if section_area else 0,
            }
        )

    blocked_probes = []
    for probe in map_config.get("blockedProbes", []):
        if isinstance(probe, Sequence) and len(probe) >= 2:
            x = logical_number(probe[0], "blockedProbe.x")
            y = logical_number(probe[1], "blockedProbe.y")
            walkable = point_is_walkable(walk_mask, x, y, density)
            blocked_probes.append(
                {
                    "x": x,
                    "y": y,
                    "label": str(probe[2]) if len(probe) >= 3 else "",
                    "walkable": walkable,
                    "passes": not walkable,
                }
            )

    doors = []
    for door in map_config.get("doors", []):
        if isinstance(door, Mapping) and "col" in door and "row" in door:
            x = (logical_number(door["col"], "door.col") + 0.5) * tile_size
            y = (logical_number(door["row"], "door.row") + 0.5) * tile_size
            adjacent_points = (
                (x - tile_size, y),
                (x + tile_size, y),
                (x, y - tile_size),
                (x, y + tile_size),
            )
            doors.append(
                {
                    "col": door["col"],
                    "row": door["row"],
                    "label": str(door.get("label", "Puerta")),
                    "walkableAtCenter": point_is_walkable(walk_mask, x, y, density),
                    "approachableFromAdjacentTile": any(
                        point_is_walkable(walk_mask, sample_x, sample_y, density)
                        for sample_x, sample_y in adjacent_points
                    ),
                }
            )

    inputs = [layout_path, road_sheet_path, terrain_sheet_path]
    if geography_path.exists():
        inputs.append(geography_path)
    if map_data_path.exists():
        inputs.append(map_data_path)
    if reference_path.exists():
        inputs.append(reference_path)
    encounter_grass_source = map_config.get("encounterGrass", {}).get("image")
    if encounter_grass_source:
        encounter_grass_path = resolve(Path(str(encounter_grass_source)))
        if encounter_grass_path.exists():
            inputs.append(encounter_grass_path)
    report = {
        "schemaVersion": 1,
        "compiler": relative_name(Path(__file__)),
        "dimensions": {
            "logicalWidth": width,
            "logicalHeight": height,
            "pixelWidth": canvas_size[0],
            "pixelHeight": canvas_size[1],
            "density": density,
            "tileSize": tile_size,
        },
        "inputs": {relative_name(path): sha256_file(path) for path in inputs},
        "swatches": {
            name: {"cell": list(cells.get(name, (-1, -1))), "width": swatch.width, "height": swatch.height}
            for name, swatch in {
                "road": road_swatch,
                "sidewalk": sidewalk_swatch,
                "grass": grass_swatch,
                "dirt": dirt_swatch,
            }.items()
        },
        "geometry": geometry_audit,
        "encounters": {
            "areaCount": len(layout.get("encounterAreas", [])),
            "grassTilesComposited": encounter_grass_tiles,
            "areaIds": [
                str(area.get("id", ""))
                for area in layout.get("encounterAreas", [])
                if isinstance(area, Mapping)
            ],
        },
        "doorMarkers": door_marker_audit,
        "walkability": {
            "walkablePixelsApprox": round(walkable_pixels),
            "totalPixels": total_pixels,
            "walkablePercent": round(walkable_pixels * 100 / total_pixels, 3),
            "blockedProbes": blocked_probes,
            "blockedProbeFailures": sum(not probe["passes"] for probe in blocked_probes),
            "doors": doors,
            "doorCentersBlockedByGeometry": sum(not door["walkableAtCenter"] for door in doors),
            "doorCentersOpenInMask": sum(door["walkableAtCenter"] for door in doors),
            "doorApproachFailures": sum(not door["approachableFromAdjacentTile"] for door in doors),
            "navigationMask": {
                "cellSize": navigation_cell_size,
                "columns": navigation_mask.width,
                "rows": navigation_mask.height,
            },
        },
        "sections": section_report,
        "comparison": {
            "reference": relative_name(reference_path),
            "referenceExists": reference_path.exists(),
            "generated": comparison_info is not None,
            **(comparison_info or {}),
        },
        "chunks": {
            "enabled": not args.no_chunks,
            "count": len(chunks),
            "columns": math.ceil(width / args.chunk_size),
            "rows": math.ceil(height / args.chunk_size),
            "chunkSize": args.chunk_size,
            "gutter": args.gutter,
            "items": chunks,
        },
        "outputs": {
            "base": relative_name(output_base),
            "preview": relative_name(output_preview),
            "walkabilityOverlay": relative_name(output_overlay),
            "navigationMask": relative_name(output_navigation),
            "sectorSheet": None if args.no_sectors else relative_name(output_sectors),
            "comparisonSheet": relative_name(output_comparison) if comparison_info is not None else None,
            "chunks": None if args.no_chunks else relative_name(chunks_path),
            "report": relative_name(output_report),
        },
        "determinism": {"seed": args.seed, "losslessWebp": args.lossless},
    }
    write_json_atomic(report, output_report)

    expected_default_chunks = 25 if width == 2508 and height == 2508 and args.chunk_size == 512 else None
    if expected_default_chunks is not None and not args.no_chunks and len(chunks) != expected_default_chunks:
        raise RuntimeError(f"Se esperaban 25 chunks para 2508/512; se generaron {len(chunks)}.")

    print(f"Base: {relative_name(output_base)} ({canvas_size[0]}x{canvas_size[1]})")
    print(f"Preview: {relative_name(output_preview)} ({width}x{height})")
    print(f"Transitabilidad: {relative_name(output_overlay)} ({report['walkability']['walkablePercent']} %)")
    if not args.no_chunks:
        print(f"Chunks: {len(chunks)} en {relative_name(chunks_path)}")
    if comparison_info is not None:
        print(f"Comparativa: {relative_name(output_comparison)}")
    print(f"Informe: {relative_name(output_report)}")


if __name__ == "__main__":
    main()
