import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";

import { transform } from "esbuild";

const SCRIPT_NAME = "tools/build-production.mjs";
const DEFAULT_MANIFEST = "tools/assets/runtime-files-v0.json";
const DEFAULT_STANDARD_GATE = "tools/assets/standard-compliance-v0.json";
const ENTRYPOINT = "index.html";
const LEGACY_EDITOR_BUNDLE = "map-editor-standalone.js";
const VALID_PROFILES = new Set(["legacy", "legacy-dev", "standard"]);
const PRECOMPRESS_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg"]);
const STANDARD_EDITOR_NODE_IDS = [
  "buildingEditorButton",
  "mapEditorGlobalStatus",
  "mapEditorCursorLayer",
  "editorScrim",
];

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertSafeRelativePath(relativePath, label = "ruta") {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`${label}: se esperaba una ruta relativa no vacia.`);
  }
  if (
    relativePath.includes("\\")
    || relativePath.includes("\0")
    || path.posix.isAbsolute(relativePath)
    || path.posix.normalize(relativePath) !== relativePath
    || relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} no segura (path traversal): ${relativePath}`);
  }
  return relativePath;
}

async function assertRegularProjectFile(projectRoot, absolutePath, label) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedFile = path.resolve(absolutePath);
  if (!isWithin(resolvedRoot, resolvedFile) || resolvedFile === resolvedRoot) {
    throw new Error(`${label} debe estar dentro del proyecto.`);
  }

  const relative = path.relative(resolvedRoot, resolvedFile);
  let cursor = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`${label} no existe: ${toPosix(relative)}`);
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`${label} no segura: no se admiten enlaces simbolicos (${toPosix(relative)}).`);
    }
  }

  const info = await lstat(resolvedFile);
  if (!info.isFile()) throw new Error(`${label} no es un archivo regular: ${toPosix(relative)}`);

  const canonicalRoot = await realpath(resolvedRoot);
  const canonicalFile = await realpath(resolvedFile);
  if (!isWithin(canonicalRoot, canonicalFile)) {
    throw new Error(`${label} no segura: el destino sale del proyecto.`);
  }
  return { absolutePath: resolvedFile, relativePath: toPosix(relative), info };
}

async function readProjectFile(projectRoot, relativePath, label = "Archivo") {
  assertSafeRelativePath(relativePath, label);
  const target = path.join(projectRoot, ...relativePath.split("/"));
  await assertRegularProjectFile(projectRoot, target, label);
  return readFile(target);
}

function validateManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
    throw new Error("El inventario runtime debe ser un objeto JSON.");
  }
  if (!Array.isArray(rawManifest.entrypoints) || !rawManifest.entrypoints.includes(ENTRYPOINT)) {
    throw new Error(`El inventario runtime debe declarar ${ENTRYPOINT} como entrypoint.`);
  }
  if (!Array.isArray(rawManifest.scannedSources) || !rawManifest.scannedSources.includes(ENTRYPOINT)) {
    throw new Error(`El inventario runtime debe declarar ${ENTRYPOINT} en scannedSources.`);
  }
  if (!Array.isArray(rawManifest.files)) {
    throw new Error("El inventario runtime debe contener un array files.");
  }

  const sourceKeys = new Set();
  const scannedSources = rawManifest.scannedSources.map((sourcePath) => {
    assertSafeRelativePath(sourcePath, "Ruta scannedSources");
    const key = sourcePath.toLowerCase();
    if (sourceKeys.has(key)) throw new Error(`Ruta scannedSources duplicada: ${sourcePath}`);
    sourceKeys.add(key);
    return sourcePath;
  });

  const fileKeys = new Set();
  const files = rawManifest.files.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`files[${index}] debe ser un objeto.`);
    }
    assertSafeRelativePath(record.path, `Ruta runtime files[${index}]`);
    const key = record.path.toLowerCase();
    if (fileKeys.has(key)) throw new Error(`Ruta runtime duplicada: ${record.path}`);
    fileKeys.add(key);
    if (!/^[a-f0-9]{64}$/.test(record.sha256 || "")) {
      throw new Error(`SHA-256 invalido para ${record.path}.`);
    }
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) {
      throw new Error(`Tamano invalido para ${record.path}.`);
    }
    return { path: record.path, bytes: record.bytes, sha256: record.sha256 };
  });

  return {
    schemaVersion: rawManifest.schemaVersion,
    scannedSources,
    files,
  };
}

async function loadManifest(projectRoot, manifestPath) {
  const manifestInfo = await assertRegularProjectFile(projectRoot, manifestPath, "Inventario runtime");
  let parsed;
  const content = await readFile(manifestInfo.absolutePath);
  try {
    parsed = JSON.parse(content.toString("utf8"));
  } catch (error) {
    throw new Error(`El inventario runtime no contiene JSON valido: ${error.message}`);
  }
  return {
    ...validateManifest(parsed),
    manifestPath: manifestInfo.relativePath,
    manifestSha256: sha256(content),
  };
}

async function validateStandardGate(projectRoot, compliancePath) {
  let gateInfo;
  try {
    gateInfo = await assertRegularProjectFile(projectRoot, compliancePath, "Gate standard-compliance-v0.json");
  } catch (error) {
    throw new Error(
      `No se puede compilar standard: tools/assets/standard-compliance-v0.json debe existir y contener {"valid":true}. ${error.message}`,
    );
  }

  let gate;
  try {
    gate = JSON.parse((await readFile(gateInfo.absolutePath)).toString("utf8"));
  } catch (error) {
    throw new Error(
      `No se puede compilar standard: tools/assets/standard-compliance-v0.json debe contener JSON valido con {"valid":true}. ${error.message}`,
    );
  }
  if (!gate || gate.valid !== true) {
    throw new Error(
      'No se puede compilar standard: tools/assets/standard-compliance-v0.json debe declarar {"valid":true}.',
    );
  }
  return gateInfo.relativePath;
}

async function verifyRuntimeFiles(projectRoot, records) {
  for (const record of [...records].sort((left, right) => left.path.localeCompare(right.path))) {
    const content = await readProjectFile(projectRoot, record.path, "Archivo runtime");
    const actualHash = sha256(content);
    if (content.byteLength !== record.bytes || actualHash !== record.sha256) {
      throw new Error(
        `SHA-256 o tamano no coincide para ${record.path}: ejecuta de nuevo la auditoria de assets.`,
      );
    }
  }
}

async function verifyScannedSources(projectRoot, sources) {
  for (const sourcePath of [...sources].sort()) {
    await assertRegularProjectFile(
      projectRoot,
      path.join(projectRoot, ...sourcePath.split("/")),
      "Codigo runtime scannedSources",
    );
  }
}

function readAttribute(attributes, name) {
  const expression = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`,
    "i",
  );
  const match = attributes.match(expression);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function localReferencePath(reference, label) {
  if (typeof reference !== "string" || reference.trim() === "") {
    throw new Error(`${label} no contiene una referencia local valida.`);
  }
  const cleanReference = reference.trim().split("#", 1)[0].split("?", 1)[0];
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(cleanReference)) {
    throw new Error(`${label} debe ser una ruta local relativa: ${reference}`);
  }
  let decoded;
  try {
    decoded = decodeURIComponent(cleanReference);
  } catch {
    throw new Error(`${label} contiene una ruta codificada invalida: ${reference}`);
  }
  while (decoded.startsWith("./")) decoded = decoded.slice(2);
  return assertSafeRelativePath(decoded, label);
}

function collectExternalScripts(html) {
  const matches = [];
  const expression = /<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi;
  let match;
  while ((match = expression.exec(html)) !== null) {
    const source = readAttribute(match[1], "src");
    if (source === null) continue;
    const type = readAttribute(match[1], "type");
    if (type && !/^(?:application|text)\/javascript$/i.test(type)) {
      throw new Error(`No se puede combinar el script de tipo ${type}: ${source}`);
    }
    matches.push({ start: match.index, end: expression.lastIndex, path: localReferencePath(source, "Script externo") });
  }
  if (matches.length === 0) throw new Error("index.html no contiene scripts externos para empaquetar.");
  return matches;
}

function collectStylesheets(html) {
  const matches = [];
  const expression = /<link\b([^>]*)>/gi;
  let match;
  while ((match = expression.exec(html)) !== null) {
    const relation = readAttribute(match[1], "rel");
    if (!relation || !relation.toLowerCase().split(/\s+/).includes("stylesheet")) continue;
    const href = readAttribute(match[1], "href");
    if (href === null) throw new Error("Una hoja de estilos de index.html no tiene href.");
    const media = readAttribute(match[1], "media");
    if (media && media.toLowerCase() !== "all") {
      throw new Error(`No se puede combinar una hoja con media=\"${media}\" sin cambiar su semantica.`);
    }
    matches.push({ start: match.index, end: expression.lastIndex, path: localReferencePath(href, "Hoja de estilos") });
  }
  if (matches.length === 0) throw new Error("index.html no contiene hojas de estilos para empaquetar.");
  return matches;
}

function replaceMatches(source, matches, replacement) {
  let output = "";
  let cursor = 0;
  matches.forEach((match, index) => {
    output += source.slice(cursor, match.start);
    if (index === 0) output += replacement;
    cursor = match.end;
  });
  return output + source.slice(cursor);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removePairedElementById(html, id) {
  const expression = new RegExp(
    `<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\bid\\s*=\\s*["']${escapeRegExp(id)}["'])[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
    "gi",
  );
  return html.replace(expression, "");
}

function removeStandardEditorMarkup(html) {
  let output = html.replace(
    /<aside\b(?=[^>]*\bid\s*=\s*["']buildingEditor["'])[^>]*>[\s\S]*?<\/aside\s*>/gi,
    "",
  );
  for (const id of STANDARD_EDITOR_NODE_IDS) output = removePairedElementById(output, id);
  output = output.replace(
    /<script\b(?=[^>]*\bdata-role\s*=\s*["']map-editor-loader["'])[^>]*>[\s\S]*?<\/script\s*>/gi,
    "",
  );
  return output;
}

async function compileJavascript(projectRoot, scriptPaths) {
  const parts = [];
  for (const sourcePath of scriptPaths) {
    const content = await readProjectFile(projectRoot, sourcePath, "Script scannedSources");
    parts.push(content.toString("utf8"));
  }
  const result = await transform(parts.join("\n;\n"), {
    charset: "utf8",
    format: "iife",
    legalComments: "none",
    loader: "js",
    minify: true,
    target: "es2019",
  });
  return Buffer.from(result.code);
}

async function compileStylesheet(projectRoot, stylesheetPaths) {
  const parts = [];
  for (const sourcePath of stylesheetPaths) {
    const content = await readProjectFile(projectRoot, sourcePath, "CSS scannedSources");
    parts.push(content.toString("utf8"));
  }
  const result = await transform(parts.join("\n"), {
    charset: "utf8",
    legalComments: "none",
    loader: "css",
    minify: true,
    target: "es2019",
  });
  return Buffer.from(result.code);
}

async function assertOutputDirectory(projectRoot, outputDirectory) {
  const distRoot = path.resolve(projectRoot, "dist");
  const resolvedOutput = path.resolve(outputDirectory);
  if (resolvedOutput === distRoot || !isWithin(distRoot, resolvedOutput)) {
    throw new Error(`El directorio de salida debe ser un subdirectorio concreto de dist: ${resolvedOutput}`);
  }

  const relative = path.relative(path.resolve(projectRoot), resolvedOutput);
  let cursor = path.resolve(projectRoot);
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) {
        throw new Error(`No se limpiara un directorio dist que contenga enlaces simbolicos: ${cursor}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  return resolvedOutput;
}

async function writeOutputFile(outputRoot, relativePath, content) {
  assertSafeRelativePath(relativePath, "Ruta de salida");
  const target = path.join(outputRoot, ...relativePath.split("/"));
  const resolvedTarget = path.resolve(target);
  if (!isWithin(outputRoot, resolvedTarget) || resolvedTarget === outputRoot) {
    throw new Error(`Ruta de salida no segura: ${relativePath}`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function copyVerifiedFile(projectRoot, outputRoot, record) {
  const content = await readProjectFile(projectRoot, record.path, "Archivo runtime");
  if (content.byteLength !== record.bytes || sha256(content) !== record.sha256) {
    throw new Error(`SHA-256 no coincide durante la copia de ${record.path}; el build se ha cancelado.`);
  }
  await writeOutputFile(outputRoot, record.path, content);
  return { path: record.path, bytes: content.byteLength, sha256: record.sha256 };
}

async function copyScannedSource(projectRoot, outputRoot, sourcePath) {
  const content = await readProjectFile(projectRoot, sourcePath, "Codigo runtime scannedSources");
  await writeOutputFile(outputRoot, sourcePath, content);
  return { path: sourcePath, bytes: content.byteLength, sha256: sha256(content) };
}

async function precompress(outputRoot, outputRecords) {
  const eligible = outputRecords
    .filter((record) => record.bytes > 1024 && PRECOMPRESS_EXTENSIONS.has(path.posix.extname(record.path).toLowerCase()))
    .sort((left, right) => left.path.localeCompare(right.path));

  for (const record of eligible) {
    const content = await readFile(path.join(outputRoot, ...record.path.split("/")));
    const brotli = brotliCompressSync(content, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      },
    });
    const gzip = gzipSync(content, { level: 9, mtime: 0 });
    await writeOutputFile(outputRoot, `${record.path}.br`, brotli);
    await writeOutputFile(outputRoot, `${record.path}.gz`, gzip);
  }
  return eligible.map((record) => record.path);
}

/**
 * Build a deterministic browser release from the audited runtime allowlist.
 */
export async function buildProduction({
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  profile = "legacy",
  outDir,
  manifestPath,
  compliancePath,
} = {}) {
  if (!VALID_PROFILES.has(profile)) {
    throw new Error(`Perfil no valido: ${profile}. Usa legacy, legacy-dev o standard.`);
  }
  const root = path.resolve(projectRoot);
  const outputRoot = await assertOutputDirectory(
    root,
    outDir ? path.resolve(root, outDir) : path.join(root, "dist", profile),
  );
  const resolvedManifestPath = manifestPath
    ? path.resolve(root, manifestPath)
    : path.join(root, ...DEFAULT_MANIFEST.split("/"));
  const resolvedCompliancePath = compliancePath
    ? path.resolve(root, compliancePath)
    : path.join(root, ...DEFAULT_STANDARD_GATE.split("/"));

  if (profile === "standard") await validateStandardGate(root, resolvedCompliancePath);
  const manifest = await loadManifest(root, resolvedManifestPath);
  await verifyRuntimeFiles(root, manifest.files);
  await verifyScannedSources(root, manifest.scannedSources);

  const scannedSet = new Set(manifest.scannedSources);
  const originalHtml = (await readProjectFile(root, ENTRYPOINT, "Entrypoint")).toString("utf8");
  const scriptMatches = collectExternalScripts(originalHtml);
  const stylesheetMatches = collectStylesheets(originalHtml);
  const scriptPaths = scriptMatches.map((match) => match.path);
  const stylesheetPaths = stylesheetMatches.map((match) => match.path);
  for (const sourcePath of [...scriptPaths, ...stylesheetPaths]) {
    if (!scannedSet.has(sourcePath)) {
      throw new Error(`${sourcePath} aparece en index.html pero no esta autorizado por scannedSources.`);
    }
  }

  const javascript = await compileJavascript(root, scriptPaths);
  const stylesheet = await compileStylesheet(root, stylesheetPaths);
  const javascriptFile = `app.${sha256(javascript).slice(0, 12)}.js`;
  const stylesheetFile = `app.${sha256(stylesheet).slice(0, 12)}.css`;

  let outputHtml = profile === "legacy-dev" ? originalHtml : removeStandardEditorMarkup(originalHtml);
  const outputScriptMatches = collectExternalScripts(outputHtml);
  const outputStylesheetMatches = collectStylesheets(outputHtml);
  outputHtml = replaceMatches(outputHtml, outputScriptMatches, `<script src="${javascriptFile}"></script>`);
  outputHtml = replaceMatches(outputHtml, outputStylesheetMatches, `<link rel="stylesheet" href="${stylesheetFile}">`);
  const html = Buffer.from(outputHtml);

  if (profile === "legacy-dev") {
    await assertRegularProjectFile(root, path.join(root, LEGACY_EDITOR_BUNDLE), "Bundle dinamico del editor");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const bundledSources = new Set([ENTRYPOINT, ...scriptPaths, ...stylesheetPaths]);
  const outputRecords = [];
  for (const record of [...manifest.files].sort((left, right) => left.path.localeCompare(right.path))) {
    if (bundledSources.has(record.path)) continue;
    outputRecords.push(await copyVerifiedFile(root, outputRoot, record));
  }

  for (const sourcePath of [...manifest.scannedSources].sort()) {
    if (bundledSources.has(sourcePath)) continue;
    if (manifest.files.some((record) => record.path === sourcePath)) continue;
    outputRecords.push(await copyScannedSource(root, outputRoot, sourcePath));
  }

  if (profile === "legacy-dev") {
    const editor = await readProjectFile(root, LEGACY_EDITOR_BUNDLE, "Bundle dinamico del editor");
    await writeOutputFile(outputRoot, LEGACY_EDITOR_BUNDLE, editor);
    outputRecords.push({ path: LEGACY_EDITOR_BUNDLE, bytes: editor.byteLength, sha256: sha256(editor) });
  }

  await writeOutputFile(outputRoot, javascriptFile, javascript);
  await writeOutputFile(outputRoot, stylesheetFile, stylesheet);
  await writeOutputFile(outputRoot, ENTRYPOINT, html);
  outputRecords.push(
    { path: javascriptFile, bytes: javascript.byteLength, sha256: sha256(javascript) },
    { path: stylesheetFile, bytes: stylesheet.byteLength, sha256: sha256(stylesheet) },
    { path: ENTRYPOINT, bytes: html.byteLength, sha256: sha256(html) },
  );
  outputRecords.sort((left, right) => left.path.localeCompare(right.path));

  const metadata = {
    schemaVersion: 1,
    builder: SCRIPT_NAME,
    profile,
    manifest: {
      path: manifest.manifestPath,
      sha256: manifest.manifestSha256,
      schemaVersion: manifest.schemaVersion,
    },
    bundles: {
      javascript: { file: javascriptFile, bytes: javascript.byteLength, sha256: sha256(javascript) },
      stylesheet: { file: stylesheetFile, bytes: stylesheet.byteLength, sha256: sha256(stylesheet) },
    },
    runtime: {
      files: outputRecords.length,
      bytes: outputRecords.reduce((total, record) => total + record.bytes, 0),
      paths: outputRecords.map((record) => record.path),
    },
  };
  const metadataContent = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
  await writeOutputFile(outputRoot, "build-meta.json", metadataContent);
  outputRecords.push({ path: "build-meta.json", bytes: metadataContent.byteLength, sha256: sha256(metadataContent) });

  const precompressed = await precompress(outputRoot, outputRecords);
  return {
    profile,
    outputDirectory: outputRoot,
    javascript: metadata.bundles.javascript,
    stylesheet: metadata.bundles.stylesheet,
    runtime: metadata.runtime,
    precompressed,
  };
}

function usage() {
  return `Uso: node ${SCRIPT_NAME} [opciones]\n\n`
    + "  --profile legacy|legacy-dev|standard  Perfil de salida (legacy por defecto)\n"
    + "  --out-dir <ruta>               Salida; debe estar dentro de dist/\n"
    + "  --manifest <ruta>              Inventario runtime alternativo\n"
    + "  --compliance <ruta>            Gate alternativo del perfil standard\n";
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    const [name, inlineValue] = argument.split("=", 2);
    if (!["--profile", "--out-dir", "--manifest", "--compliance"].includes(name)) {
      throw new Error(`Opcion desconocida: ${argument}`);
    }
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${name}.`);
    if (name === "--profile") options.profile = value;
    if (name === "--out-dir") options.outDir = value;
    if (name === "--manifest") options.manifestPath = value;
    if (name === "--compliance") options.compliancePath = value;
  }
  return options;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  try {
    const options = parseCli(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
    } else {
      const result = await buildProduction(options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`Error de build: ${error.message}\n`);
    process.exitCode = 1;
  }
}
