import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const [html, css] = await Promise.all([
  readFile(path.join(ROOT, "index.html"), "utf8"),
  readFile(path.join(ROOT, "styles.css"), "utf8"),
]);

const editorStart = html.indexOf('<aside id="buildingEditor"');
const editorEnd = html.indexOf("</aside>", editorStart);
assert.ok(editorStart >= 0 && editorEnd > editorStart, "index.html debe conservar #buildingEditor");

const editorHtml = html.slice(editorStart, editorEnd + "</aside>".length);
const nodes = parseHtml(editorHtml);

const LEGACY_EDITOR_IDS = [
  "buildingEditor",
  "mapEditorSheetToggle",
  "mapEditorExpandSheetButton",
  "closeBuildingEditor",
  "mapEditorMapSelect",
  "mapEditorNameInput",
  "copyEditorInviteButton",
  "mapEditorConnectionStatus",
  "mapEditorPresenceList",
  "mapEditorSaveStatus",
  "mapEditorUndoButton",
  "mapEditorRedoButton",
  "mapEditorRevision",
  "mapEditorCenterButton",
  "mapEditorFitButton",
  "mapEditorZoomOutButton",
  "mapEditorZoomLevel",
  "mapEditorZoomInButton",
  "mapEditorZoomResetButton",
  "mapEditorJumpForm",
  "mapEditorJumpCol",
  "mapEditorJumpRow",
  "mapEditorConflictPanel",
  "mapEditorConflictTitle",
  "mapEditorConflictLocal",
  "mapEditorConflictServer",
  "mapEditorConflictKeepServer",
  "mapEditorConflictReapply",
  "mapEditorConflictCancel",
  "mapEditorActivity",
  "mapEditorActivityList",
  "mapEditorOutliner",
  "mapEditorOutlinerCount",
  "mapEditorSearchInput",
  "mapEditorFilterInput",
  "mapEditorOutlinerList",
  "mapEditorOverlayPanel",
  "mapEditorTabObjects",
  "mapEditorTabTerrain",
  "mapEditorTabGround",
  "mapEditorTabNpcs",
  "mapEditorTabEntrances",
  "mapEditorTabEvents",
  "objectEditorPanel",
  "assetCatalogSearch",
  "assetCatalogCategory",
  "assetCatalogFavorites",
  "assetCatalogGrid",
  "assetPrototypeSelect",
  "addAssetButton",
  "assetSnapSelect",
  "assetSelectionInfo",
  "assetMultiActions",
  "assetInspector",
  "assetLabelInput",
  "assetXInput",
  "assetYInput",
  "assetScaleInput",
  "assetDepthInput",
  "assetRotationInput",
  "assetSolidInput",
  "assetValidation",
  "duplicateAssetButton",
  "flipAssetButton",
  "deleteAssetButton",
  "groundEditorPanel",
  "groundPalette",
  "groundBrushSize",
  "resetGroundMap",
  "mapEditorSizeInfo",
  "mapExpandCols",
  "mapExpandRows",
  "expandMapButton",
  "terrainEditorPanel",
  "tileSelectionInfo",
  "tilePalette",
  "terrainBrushSize",
  "tileEditorHint",
  "copyTileButton",
  "copyNpcButton",
  "resetTileMap",
  "npcEditorPanel",
  "addNpcButton",
  "npcSelectionInfo",
  "npcInspector",
  "npcColInput",
  "npcRowInput",
  "npcNameInput",
  "npcSpriteInput",
  "npcSpriteOptions",
  "npcSpritePreview",
  "npcDirectionInput",
  "npcLinesInput",
  "npcPatrolEnabledInput",
  "npcPatrolFields",
  "npcPatrolColInput",
  "npcPatrolRowInput",
  "npcPatrolSpeedInput",
  "npcValidation",
  "testNpcButton",
  "duplicateNpcButton",
  "deleteNpcButton",
  "entranceEditorPanel",
  "addEntranceButton",
  "entranceSelectionInfo",
  "entranceInspector",
  "entranceColInput",
  "entranceRowInput",
  "entranceLabelInput",
  "entranceActionInput",
  "entranceTargetMapInput",
  "entranceTargetXInput",
  "entranceTargetYInput",
  "entranceTargetDirectionInput",
  "entranceEffectInput",
  "entranceLinkedAssetInput",
  "entranceValidation",
  "testEntranceButton",
  "duplicateEntranceButton",
  "deleteEntranceButton",
  "eventEditorPanel",
  "addEventButton",
  "eventSelectionInfo",
  "eventInspector",
  "eventColInput",
  "eventRowInput",
  "eventTypeInput",
  "eventTriggerInput",
  "eventMessageInput",
  "eventTargetMapInput",
  "eventTargetXInput",
  "eventTargetYInput",
  "eventTargetDirectionInput",
  "eventEffectInput",
  "eventDurationInput",
  "eventIntensityInput",
  "eventOnceInput",
  "eventEnabledInput",
  "eventValidation",
  "testEventButton",
  "duplicateEventButton",
  "deleteEventButton",
  "mapEditorMapOptions",
  "mapEditorBuildingOptions",
];

const EXPECTED_DATA_VALUES = {
  "data-editor-mode": ["objects", "terrain", "ground", "npcs", "entrances", "events"],
  "data-editor-overlay": ["grid", "coordinates", "collisions", "npcs", "entrances", "events", "routes"],
  "data-ground-tool": ["pencil", "path", "eraser", "eyedropper", "rectangle", "fill"],
  "data-ground-type": ["inherit", "grass", "dirt", "asphalt", "sidewalk", "plaza", "sand"],
  "data-terrain-tool": ["pencil", "eraser", "eyedropper", "rectangle", "fill"],
  "data-tile-type": ["inherit", "walkable", "blocked", "door", "encounter", "event"],
  "data-multi-action": ["align-x", "align-y", "distribute", "group", "lock"],
};

const TAB_PANEL_PAIRS = [
  ["objects", "mapEditorTabObjects", "objectEditorPanel"],
  ["terrain", "mapEditorTabTerrain", "terrainEditorPanel"],
  ["ground", "mapEditorTabGround", "groundEditorPanel"],
  ["npcs", "mapEditorTabNpcs", "npcEditorPanel"],
  ["entrances", "mapEditorTabEntrances", "entranceEditorPanel"],
  ["events", "mapEditorTabEvents", "eventEditorPanel"],
];

test("el workspace conserva todos los controles e identificadores publicos del editor", () => {
  const ids = nodes.map((node) => node.attrs.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "los IDs del editor deben seguir siendo unicos");

  for (const id of LEGACY_EDITOR_IDS) {
    assert.ok(ids.includes(id), `falta el control historico #${id}`);
  }

  for (const [attribute, expectedValues] of Object.entries(EXPECTED_DATA_VALUES)) {
    const actualValues = new Set(nodes.map((node) => node.attrs[attribute]).filter(Boolean));
    for (const value of expectedValues) {
      assert.ok(actualValues.has(value), `falta [${attribute}="${value}"]`);
    }
  }

  for (const id of ["editorScrim", "mapEditorGlobalStatus", "mapEditorCursorLayer"]) {
    assert.match(html, new RegExp(`\\bid="${id}"`), `falta el apoyo externo #${id}`);
  }
});

test("header, comandos, modos, herramienta activa y opciones secundarias forman una jerarquia clara", () => {
  const editor = byId("buildingEditor");
  const workspace = byId("mapEditorWorkspace");
  const commandbar = onlyByClass("map-editor-commandbar");
  const modebar = onlyByClass("map-editor-modebar");
  const tabs = onlyByClass("map-editor-tabs");
  const toolStage = onlyByClass("map-editor-tool-stage");
  const secondary = byId("mapEditorSecondaryPanel");
  const header = nodes.find((node) => node.tag === "header" && hasClass(node, "map-editor-topbar"));

  assert.ok(header, "#buildingEditor debe conservar un header .map-editor-topbar");
  assert.ok(hasClass(workspace, "map-editor-workspace"));
  assert.ok(hasClass(secondary, "map-editor-secondary"));
  assert.equal(secondary.tag, "details", "las opciones secundarias deben ser plegables de forma nativa");
  assert.ok(secondary.children.some((node) => node.tag === "summary"), "el panel secundario necesita un summary directo");

  for (const node of [header, commandbar, modebar, toolStage, secondary]) {
    assert.ok(isDescendantOf(node, workspace), `.${[...node.classes][0]} debe vivir dentro de #mapEditorWorkspace`);
  }
  assert.ok(isDescendantOf(workspace, editor), "#mapEditorWorkspace debe vivir dentro de #buildingEditor");
  assert.ok(isDescendantOf(tabs, modebar), ".map-editor-tabs debe quedar envuelto por .map-editor-modebar");

  for (const id of [
    "mapEditorSaveStatus",
    "mapEditorUndoButton",
    "mapEditorRedoButton",
    "mapEditorRevision",
    "mapEditorCenterButton",
    "mapEditorFitButton",
    "mapEditorZoomOutButton",
    "mapEditorZoomLevel",
    "mapEditorZoomInButton",
    "mapEditorZoomResetButton",
  ]) {
    assert.ok(isDescendantOf(byId(id), commandbar), `#${id} debe ser parte de la barra de comandos`);
  }

  for (const [, , panelId] of TAB_PANEL_PAIRS) {
    assert.ok(isDescendantOf(byId(panelId), toolStage), `#${panelId} debe vivir en el escenario de herramienta activa`);
  }

  for (const id of ["mapEditorActivity", "mapEditorOutliner", "mapEditorOverlayPanel"]) {
    assert.ok(isDescendantOf(byId(id), secondary), `#${id} debe quedar en las opciones secundarias`);
  }
  for (const className of ["map-editor-collaboration", "map-editor-shortcuts"]) {
    assert.ok(isDescendantOf(onlyByClass(className), secondary), `.${className} debe quedar en las opciones secundarias`);
  }

  assert.ok(header.start < commandbar.start, "el header debe preceder a la barra de comandos");
  assert.ok(commandbar.start < modebar.start, "la barra de comandos debe preceder a los modos");
  assert.ok(modebar.start < toolStage.start, "los modos deben preceder a la herramienta activa");
  assert.ok(toolStage.start < secondary.start, "la herramienta activa debe tener prioridad sobre las opciones secundarias");
});

test("las tabs preceden actividad, outliner y capas sin perder tablist ni tabpanel", () => {
  const tabs = onlyByClass("map-editor-tabs");
  assert.equal(tabs.attrs.role, "tablist");
  assert.ok(tabs.attrs["aria-label"], "el tablist necesita un nombre accesible");

  for (const id of ["mapEditorActivity", "mapEditorOutliner", "mapEditorOverlayPanel"]) {
    assert.ok(tabs.start < byId(id).start, `.map-editor-tabs debe aparecer antes de #${id} en el DOM`);
  }

  let selectedTabs = 0;
  let visiblePanels = 0;
  for (const [mode, tabId, panelId] of TAB_PANEL_PAIRS) {
    const tab = byId(tabId);
    const panel = byId(panelId);
    assert.ok(isDescendantOf(tab, tabs), `#${tabId} debe pertenecer al tablist`);
    assert.equal(tab.tag, "button");
    assert.equal(tab.attrs.role, "tab");
    assert.equal(tab.attrs["data-editor-mode"], mode);
    assert.equal(tab.attrs["aria-controls"], panelId);
    assert.ok(["true", "false"].includes(tab.attrs["aria-selected"]));

    assert.equal(panel.attrs.role, "tabpanel");
    assert.equal(panel.attrs["data-editor-panel"], mode);
    assert.equal(panel.attrs["aria-labelledby"], tabId);

    const selected = tab.attrs["aria-selected"] === "true";
    const hidden = Object.hasOwn(panel.attrs, "hidden") || hasClass(panel, "hidden");
    assert.equal(tab.attrs.tabindex, selected ? "0" : "-1");
    assert.equal(hidden, !selected, `#${panelId} debe reflejar el estado accesible de su tab`);
    selectedTabs += Number(selected);
    visiblePanels += Number(!hidden);
  }

  assert.equal(selectedTabs, 1, "debe haber exactamente una tab activa");
  assert.equal(visiblePanels, 1, "debe haber exactamente un panel de herramienta visible");
});

test("en escritorio el inspector puede plegarse y ampliarse con estado accesible", () => {
  const sheetToggle = byId("mapEditorSheetToggle");
  const expandToggle = byId("mapEditorExpandSheetButton");
  assert.equal(sheetToggle.tag, "button");
  assert.equal(sheetToggle.attrs["aria-expanded"], "true");
  assert.equal(expandToggle.tag, "button");
  assert.equal(expandToggle.attrs["aria-pressed"], "false");

  const desktopCss = extractMediaBodies(css, /@media\s*\(\s*min-width\s*:\s*681px\s*\)\s*$/i).join("\n");
  assert.ok(desktopCss, "debe existir un breakpoint exclusivo de escritorio");
  assertDeclaration(desktopCss, ".building-editor.fullscreen-inspector", "width", /^min\(720px,\s*72vw\)$/);
  assertDeclaration(desktopCss, ".building-editor.collapsed", "width", /^144px$/);
  assertDeclaration(desktopCss, ".building-editor.collapsed", "height", /^58px$/);
  for (const selector of [
    ".building-editor.collapsed .map-editor-commandbar",
    ".building-editor.collapsed .map-editor-modebar",
    ".building-editor.collapsed .map-editor-tool-stage",
    ".building-editor.collapsed .map-editor-secondary",
  ]) {
    assertDeclaration(desktopCss, selector, "display", /^none$/);
  }
  assertDeclaration(desktopCss, ".building-editor.collapsed .map-editor-topbar", "min-height", /^58px$/);
});

test("en movil los modos son sticky, la herramienta activa precede al secundario y los controles son tactiles", () => {
  const mobileCss = extractMediaBodies(css, /max-width\s*:\s*680px/i).join("\n");
  assert.ok(mobileCss, "debe existir el breakpoint movil de 680px");

  assertDeclaration(mobileCss, ".map-editor-workspace", "display", /^flex$/);
  assertDeclaration(mobileCss, ".map-editor-workspace", "flex-direction", /^column$/);
  assertDeclaration(mobileCss, ".map-editor-commandbar", "order", /^1$/);
  assertDeclaration(mobileCss, ".map-editor-modebar", "position", /^sticky$/);
  assertDeclaration(mobileCss, ".map-editor-modebar", "order", /^2$/);
  assertDeclaration(mobileCss, ".map-editor-tool-stage", "order", /^3$/);
  assertDeclaration(mobileCss, ".map-editor-secondary", "order", /^4$/);
  assertDeclaration(mobileCss, ".building-editor.collapsed .map-editor-secondary", "display", /^none$/);
  for (const selector of [
    ".building-editor.collapsed .map-editor-tool-stage",
    ".building-editor.collapsed .map-editor-panel",
  ]) {
    assert.ok(
      !propertyValues(mobileCss, selector, "display").includes("none"),
      `${selector} no debe ocultar la herramienta activa`,
    );
  }

  assertMinHeight(mobileCss, ".map-editor-tabs button", 40);
  for (const selector of [
    ".building-editor button",
    ".map-editor-identity input",
    ".map-editor-identity select",
    ".map-editor-jump input",
    ".map-editor-search-row input",
    ".map-editor-search-row select",
    ".map-editor-activity summary",
    ".map-editor-outliner summary",
    ".map-editor-overlays summary",
    ".map-editor-shortcuts summary",
    ".map-editor-secondary > summary",
  ]) {
    assertMinHeight(css, selector, 40);
  }
});

function parseHtml(source) {
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const parsed = [];
  const stack = [];
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>/gi;

  for (const match of source.matchAll(tokens)) {
    const raw = match[0];
    if (raw.startsWith("<!--") || raw.startsWith("<!")) continue;

    const closing = raw.match(/^<\/\s*([a-z][\w:-]*)/i);
    if (closing) {
      const tag = closing[1].toLowerCase();
      const openingIndex = stack.findLastIndex((node) => node.tag === tag);
      if (openingIndex >= 0) {
        for (const node of stack.splice(openingIndex)) node.end = match.index + raw.length;
      }
      continue;
    }

    const opening = raw.match(/^<\s*([a-z][\w:-]*)/i);
    if (!opening) continue;
    const tag = opening[1].toLowerCase();
    const parent = stack.at(-1) ?? null;
    const node = {
      tag,
      attrs: parseAttributes(raw.slice(opening[0].length, raw.length - 1)),
      classes: new Set(),
      parent,
      children: [],
      start: match.index,
      end: source.length,
    };
    node.classes = new Set((node.attrs.class ?? "").split(/\s+/).filter(Boolean));
    parent?.children.push(node);
    parsed.push(node);

    if (!voidTags.has(tag) && !raw.endsWith("/>")) stack.push(node);
  }

  return parsed;
}

function parseAttributes(source) {
  const attrs = Object.create(null);
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function byId(id) {
  const matches = nodes.filter((node) => node.attrs.id === id);
  assert.equal(matches.length, 1, `se esperaba exactamente un #${id}`);
  return matches[0];
}

function onlyByClass(className) {
  const matches = nodes.filter((node) => hasClass(node, className));
  assert.equal(matches.length, 1, `se esperaba exactamente un .${className}`);
  return matches[0];
}

function hasClass(node, className) {
  return node.classes.has(className);
}

function isDescendantOf(node, ancestor) {
  for (let current = node.parent; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function extractMediaBodies(source, headerPattern) {
  const bodies = [];
  let cursor = 0;
  while ((cursor = source.indexOf("@media", cursor)) >= 0) {
    const open = source.indexOf("{", cursor);
    if (open < 0) break;
    const header = source.slice(cursor, open);
    let depth = 1;
    let quote = "";
    let inComment = false;
    let index = open + 1;
    for (; index < source.length && depth > 0; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (inComment) {
        if (char === "*" && next === "/") {
          inComment = false;
          index += 1;
        }
        continue;
      }
      if (!quote && char === "/" && next === "*") {
        inComment = true;
        index += 1;
        continue;
      }
      if (quote) {
        if (char === "\\") index += 1;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
    }
    if (headerPattern.test(header)) bodies.push(source.slice(open + 1, index - 1));
    cursor = index;
  }
  return bodies;
}

function declarationsFor(source, selector) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const normalizedTarget = normalizeSelector(selector);
  const declarations = [];
  const rules = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of withoutComments.matchAll(rules)) {
    const selectors = match[1].split(",").map(normalizeSelector);
    if (selectors.includes(normalizedTarget)) declarations.push(match[2]);
  }
  return declarations.join("\n");
}

function normalizeSelector(selector) {
  return selector.replace(/\s+/g, " ").trim();
}

function propertyValues(source, selector, property) {
  const declarations = declarationsFor(source, selector);
  const pattern = new RegExp(`(?:^|;)\\s*${property.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*:\\s*([^;]+)`, "gi");
  return [...declarations.matchAll(pattern)].map((match) => match[1].trim());
}

function assertDeclaration(source, selector, property, expected) {
  const values = propertyValues(source, selector, property);
  assert.ok(values.length, `falta ${property} en ${selector}`);
  assert.match(values.at(-1), expected, `${selector} debe declarar ${property}: ${expected}`);
}

function assertMinHeight(source, selector, minimum) {
  const values = propertyValues(source, selector, "min-height");
  assert.ok(values.length, `falta min-height en ${selector}`);
  const value = values.at(-1);
  const pixels = value.match(/^(\d+(?:\.\d+)?)px$/i);
  assert.ok(pixels, `${selector} debe expresar min-height en px, no ${value}`);
  assert.ok(Number(pixels[1]) >= minimum, `${selector} debe medir al menos ${minimum}px de alto`);
}
