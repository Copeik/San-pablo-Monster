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
``includeMapDataWalkability`` vale ``true``. Colliders de worldAssets y bloqueos
declarados siempre se restan de la mascara final.
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
  roads[]: {id, points:[[x,y],...], width, surface:'road', sidewalkWidth?, curbWidth?, walkable?}
  paths[]: {id, points:[[x,y],...], width, surface:'dirt'|'sidewalk'|'road', walkable?}
  surfaceRects[]: {id,x,y,w,h,surface,walkable?}
  surfacePolygons[]: {id,points:[[x,y],...],surface,walkable?}
  blockedRects[] / blockedPolygons[] / blockers[]: geometria que se resta.
  sections[]: {id,name,x,y,w,h}; worldAssets[] es opcional.
Todas las coordenadas estan en pixeles logicos salvo units:'tiles'.
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


def load_javascript_object(path: Path, global_names: Sequence[str]) -> dict[str, Any]:
    """Carga un objeto serializable sin analizar JavaScript con expresiones regulares."""
    script = r"""
const path = require("path");
global.window = {};
console.log = (...args) => process.stderr.write(`${args.join(" ")}\n`);
const target = path.resolve(process.argv[1]);
const names = process.argv[2].split(",");
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
            ["node", "-e", script, str(path.resolve()), ",".join(global_names)],
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
    if kind.endswith("Polygons") and len(values) >= 3:
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
    elif kind == "segment":
        points = extract_points(item, factor, density, label)
        width = scaled(item.get("width", 32) * factor, density, f"{label}.width")
        draw_polyline(mask, points, width, bool(item.get("roundCaps", True)))
    else:
        raise ValueError(f"Tipo de geometria desconocido: {kind}")
    return mask


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
    walk_mask = Image.new("L", canvas_size, 0)
    blocked_mask = Image.new("L", canvas_size, 0)
    counts: Counter[str] = Counter()
    ids: dict[str, list[str]] = {key: [] for key in ("roads", "paths", "surfaceRects", "surfacePolygons", "blockers")}
    features: list[dict[str, Any]] = []
    semantic_walkables = 0

    for collection, kind, default_surface in (
        ("surfaceRects", "rect", "grass"),
        ("surfacePolygons", "polygon", "grass"),
        ("paths", "segment", "dirt"),
    ):
        for index, item in iter_collection(layout, collection):
            label = f"{collection}[{index}]"
            surface = canonical_surface(item.get("surface"), default_surface)
            if surface not in surface_masks:
                raise ValueError(f"{label}.surface={surface!r} no esta soportada.")
            mask = shape_mask(item, kind, canvas_size, density, tile_size, label)
            merge_mask(surface_masks[surface], mask)
            counts[f"surface:{surface}"] += 1
            ids[collection].append(str(item.get("id", f"{collection}-{index}")))
            feature_walkable = is_walkable(item, surface)
            features.append(
                {
                    "id": str(item.get("id", f"{collection}-{index}")),
                    "collection": collection,
                    "surface": surface,
                    "walkable": feature_walkable,
                }
            )
            if feature_walkable:
                merge_mask(walk_mask, mask)
                semantic_walkables += 1

    for index, item in iter_collection(layout, "roads"):
        label = f"roads[{index}]"
        surface = canonical_surface(item.get("surface"), "road")
        factor = unit_factor(item, tile_size)
        points = extract_points(item, factor, density, label)
        width = scaled(item.get("width", 64) * factor, density, f"{label}.width")
        if width <= 0:
            raise ValueError(f"{label}.width debe ser positivo.")
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
            merge_mask(road_curb, curb)
            merge_mask(road_sidewalk, sidewalk)
            merge_mask(surface_masks["road"], center)
            visual_walk = sidewalk
        else:
            if surface not in surface_masks:
                raise ValueError(f"{label}.surface={surface!r} no esta soportada.")
            merge_mask(surface_masks[surface], center)
            visual_walk = center
        counts[f"surface:{surface}"] += 1
        ids["roads"].append(str(item.get("id", f"road-{index}")))
        feature_walkable = is_walkable(item, surface)
        features.append(
            {
                "id": str(item.get("id", f"road-{index}")),
                "collection": "roads",
                "surface": surface,
                "walkable": feature_walkable,
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
            mask = shape_mask(item, kind, canvas_size, density, tile_size, f"{collection}[{index}]")
            merge_mask(walk_mask, mask)
            semantic_walkables += 1
            counts[collection] += 1

    include_legacy = bool(layout.get("includeMapDataWalkability", False)) or semantic_walkables == 0
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
                mask = shape_mask(
                    item,
                    kind,
                    canvas_size,
                    density,
                    tile_size,
                    f"map-data.{collection}[{index}]",
                    default_units=default_units,
                )
                merge_mask(walk_mask, mask)
                counts[f"legacy:{collection}"] += 1

    for collection, kind in (
        ("blockedRects", "rect"),
        ("blockedSegments", "segment"),
        ("blockedPolygons", "polygon"),
    ):
        for index, item in iter_collection(layout, collection):
            mask = shape_mask(item, kind, canvas_size, density, tile_size, f"{collection}[{index}]")
            merge_mask(blocked_mask, mask)
            counts[collection] += 1
            ids["blockers"].append(str(item.get("id", f"{collection}-{index}")))

    for index, item in iter_collection(layout, "blockers"):
        label = f"blockers[{index}]"
        if "points" in item or "segment" in item:
            kind = "segment" if len(item.get("points", [])) < 3 else "polygon"
        else:
            kind = "rect"
        mask = shape_mask(item, kind, canvas_size, density, tile_size, label)
        merge_mask(blocked_mask, mask)
        counts["blockers"] += 1
        ids["blockers"].append(str(item.get("id", f"blocker-{index}")))

    # Resta las huellas solidas de los sprites dinamicos del layout o de map-data.
    assets = layout.get("worldAssets")
    if assets is None:
        assets = map_config.get("worldAssets", [])
    if not isinstance(assets, Sequence) or isinstance(assets, (str, bytes)):
        raise TypeError("worldAssets debe ser un array.")
    draw_blocked = ImageDraw.Draw(blocked_mask)
    collider_count = 0
    for asset_index, asset in enumerate(assets):
        if not isinstance(asset, Mapping):
            raise TypeError(f"worldAssets[{asset_index}] debe ser un objeto.")
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
    road_sheet_path = resolve(args.road_sheet)
    terrain_sheet_path = resolve(args.terrain_sheet)
    for required in (road_sheet_path, terrain_sheet_path):
        if not required.exists():
            raise FileNotFoundError(f"Falta el tileset requerido: {relative_name(required)}")

    layout = load_javascript_object(layout_path, ("CITY_MAP_LAYOUT", "MAP_LAYOUT"))
    map_config: dict[str, Any] = {}
    if map_data_path.exists():
        map_config = load_javascript_object(map_data_path, ("CITY_MAP_CONFIG", "MAP_CONFIG"))

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
    base = draw_sports_fields(render_base(canvas_size, masks, patterns, args.seed), layout, density)
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
    chunks_path = resolve(args.chunks)
    save_image_atomic(base, output_base, quality=args.quality, lossless=args.lossless)
    save_image_atomic(preview, output_preview, quality=args.quality, lossless=args.lossless)
    save_image_atomic(overlay, output_overlay, quality=args.quality, lossless=args.lossless)
    save_image_atomic(navigation_mask, output_navigation, quality=args.quality, lossless=args.lossless)

    if not args.no_sectors:
        sector_sheet = build_sector_sheet(preview, overlay, sections)
        save_image_atomic(sector_sheet, output_sectors, quality=args.quality, lossless=args.lossless)

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
    if map_data_path.exists():
        inputs.append(map_data_path)
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
    print(f"Informe: {relative_name(output_report)}")


if __name__ == "__main__":
    main()
