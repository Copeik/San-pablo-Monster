import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const CLASSIFICATIONS = Object.freeze(["runtime", "source", "derived", "archive", "candidate"]);
const CODE_EXTENSIONS = new Set([".css", ".htm", ".html", ".js", ".mjs"]);
const REFERENCE_EXTENSIONS = Object.freeze([
  "7z", "avif", "bin", "css", "csv", "flac", "geojson", "gif", "htm", "html", "jpeg", "jpg",
  "js", "json", "kra", "md", "mjs", "mp3", "mp4", "ogg", "osm", "png", "psd", "rar", "svg",
  "tar", "tgz", "txt", "wav", "webm", "webp", "woff", "woff2", "xcf", "xml", "zip",
]);
const ARCHIVE_EXTENSIONS = new Set([".7z", ".gz", ".rar", ".tar", ".tgz", ".zip"]);
const SOURCE_EXTENSIONS = new Set([".ase", ".aseprite", ".kra", ".md", ".osm", ".psd", ".txt", ".xcf"]);
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".flac", ".mp3", ".ogg", ".wav"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const FIXED_CLASSIFICATION_ORDER = Object.freeze(Object.fromEntries(CLASSIFICATIONS.map((name, index) => [name, index])));

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const slash = (value) => String(value).replaceAll("\\", "/");
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizeRepoPath(value) {
  let normalized = slash(value || "").trim().replace(/^\.\//, "").replace(/^\/+/, "");
  normalized = normalized.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/");
  try { normalized = decodeURIComponent(normalized); } catch { /* Se conserva para poder informar de ella. */ }
  const pieces = normalized.split("/");
  if (!normalized || pieces.some((piece) => piece === "..")) return "";
  return pieces.filter((piece) => piece && piece !== ".").join("/");
}

export function globToRegExp(glob) {
  let expression = "^";
  const normalized = normalizeRepoPath(glob);
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "*") {
      if (normalized[index + 1] === "*") {
        index += 1;
        expression += normalized[index + 1] === "/" ? "(?:.*/)?" : ".*";
        if (normalized[index + 1] === "/") index += 1;
      } else expression += "[^/]*";
    } else if (char === "?") expression += "[^/]";
    else expression += escapeRegExp(char);
  }
  return new RegExp(`${expression}$`);
}

function stripComments(text) {
  const source = String(text).replace(/<!--[\s\S]*?-->/g, (value) => " ".repeat(value.length));
  let result = "";
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "line") {
      if (char === "\n" || char === "\r") { state = "code"; result += char; }
      else result += " ";
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { result += "  "; index += 1; state = "code"; }
      else result += char === "\n" || char === "\r" ? char : " ";
      continue;
    }
    if (state === "code") {
      if (char === "/" && next === "/") { result += "  "; index += 1; state = "line"; continue; }
      if (char === "/" && next === "*") { result += "  "; index += 1; state = "block"; continue; }
      if (char === "'") state = "single";
      else if (char === "\"") state = "double";
      else if (char === "`") state = "template";
      result += char;
      continue;
    }
    result += char;
    if (char === "\\") {
      if (index + 1 < source.length) { result += source[index + 1]; index += 1; }
    } else if ((state === "single" && char === "'")
      || (state === "double" && char === "\"")
      || (state === "template" && char === "`")) state = "code";
  }
  return result;
}

function isInsideRoots(repoPath, assetRoots) {
  return assetRoots.some((root) => repoPath === root || repoPath.startsWith(`${root}/`));
}

function extractRootReferences(text, assetRoots) {
  const cleaned = stripComments(text);
  const extensionPattern = REFERENCE_EXTENSIONS.join("|");
  const references = [];
  for (const root of assetRoots) {
    const matcher = new RegExp(`(?<![A-Za-z0-9_.\\/-])(?:\\.\\/|\\/)?${escapeRegExp(root)}\\/[^\\"'\\x60\\r\\n]*?\\.(?:${extensionPattern})(?:\\?[^\\"'\\x60\\s<>)]*)?`, "gi");
    for (const match of cleaned.matchAll(matcher)) {
      const raw = match[0].replace(/^\.?\//, "");
      const templated = /\$\{[^}]+\}/.test(raw);
      const normalized = normalizeRepoPath(raw.replace(/\$\{[^}]+\}/g, "*"));
      if (!normalized || !isInsideRoots(normalized, assetRoots)) continue;
      references.push({ path: normalized, type: templated ? "template" : "literal" });
    }
  }
  return references;
}

function extractCodeDependencies(text, sourcePath, assetRoots) {
  const cleaned = stripComments(text);
  const candidates = [];
  const patterns = [
    /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) candidates.push(match[1]);
  }
  for (const reference of extractRootReferences(cleaned, assetRoots)) {
    if (reference.type === "literal" && CODE_EXTENSIONS.has(path.posix.extname(reference.path).toLowerCase())) {
      candidates.push(reference.path);
    }
  }
  const sourceDirectory = path.posix.dirname(sourcePath);
  return [...new Set(candidates.map((candidate) => {
    if (/^(?:[a-z]+:)?\/\//i.test(candidate) || candidate.startsWith("data:")) return "";
    const withoutQuery = normalizeRepoPath(candidate);
    if (!withoutQuery) return "";
    return candidate.startsWith("/") || isInsideRoots(withoutQuery, assetRoots)
      ? withoutQuery
      : normalizeRepoPath(path.posix.join(sourceDirectory, withoutQuery));
  }).filter((candidate) => CODE_EXTENSIONS.has(path.posix.extname(candidate).toLowerCase())))]
    .sort(compareText);
}

async function listFiles(repoRoot, roots) {
  const files = [];
  const ignoredSymlinks = [];
  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(repoRoot, ...relativeDirectory.split("/"));
    let entries;
    try { entries = await fs.readdir(absoluteDirectory, { withFileTypes: true }); }
    catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const relativePath = normalizeRepoPath(`${relativeDirectory}/${entry.name}`);
      if (entry.isSymbolicLink()) ignoredSymlinks.push(relativePath);
      else if (entry.isDirectory()) await visit(relativePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  }
  for (const root of [...new Set(roots.map(normalizeRepoPath).filter(Boolean))].sort(compareText)) await visit(root);
  return { files: files.sort(compareText), ignoredSymlinks: ignoredSymlinks.sort(compareText) };
}

async function discoverRuntimeSources(repoRoot, config) {
  const queue = config.entrypoints.map(normalizeRepoPath).filter(Boolean);
  const queued = new Set(queue);
  const sources = [];
  const sourceKinds = new Map(queue.map((entry) => [entry, new Set(["entrypoint"])]));
  const references = new Map();
  const templatePatterns = new Map();
  const missingSources = [];

  while (queue.length) {
    const sourcePath = queue.shift();
    const absolutePath = path.join(repoRoot, ...sourcePath.split("/"));
    let text;
    try { text = await fs.readFile(absolutePath, "utf8"); }
    catch (error) {
      missingSources.push({ path: sourcePath, requiredBy: [...(sourceKinds.get(sourcePath) || [])].sort(compareText) });
      continue;
    }
    sources.push(sourcePath);
    for (const reference of extractRootReferences(text, config.assetRoots)) {
      const target = reference.type === "template" ? templatePatterns : references;
      if (!target.has(reference.path)) target.set(reference.path, new Set());
      target.get(reference.path).add(sourcePath);
    }
    for (const dependency of extractCodeDependencies(text, sourcePath, config.assetRoots)) {
      if (!sourceKinds.has(dependency)) sourceKinds.set(dependency, new Set());
      sourceKinds.get(dependency).add(sourcePath);
      if (!queued.has(dependency)) { queued.add(dependency); queue.push(dependency); }
    }
  }
  return {
    sources: sources.sort(compareText),
    sourceKinds,
    references,
    templatePatterns,
    missingSources: missingSources.sort((a, b) => compareText(a.path, b.path)),
  };
}

function pngMetadata(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  let hasAlpha = colorType === 4 || colorType === 6;
  let frameCount = 1;
  let durationMs = 0;
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataOffset = offset + 8;
    if (dataOffset + length + 4 > buffer.length) break;
    if (type === "tRNS") hasAlpha = true;
    if (type === "acTL" && length >= 8) frameCount = buffer.readUInt32BE(dataOffset);
    if (type === "fcTL" && length >= 26) {
      const numerator = buffer.readUInt16BE(dataOffset + 20);
      const denominator = buffer.readUInt16BE(dataOffset + 22) || 100;
      durationMs += Math.round((numerator / denominator) * 1000);
    }
    offset = dataOffset + length + 4;
  }
  return { kind: "image", format: "png", width, height, hasAlpha, frameCount, animated: frameCount > 1, durationMs };
}

function webpMetadata(buffer) {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  let width = 0;
  let height = 0;
  let hasAlpha = false;
  let declaredAnimated = false;
  let frameCount = 0;
  let durationMs = 0;
  let loopCount = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + length > buffer.length) break;
    if (type === "VP8X" && length >= 10) {
      const flags = buffer[dataOffset];
      hasAlpha ||= Boolean(flags & 0x10);
      declaredAnimated ||= Boolean(flags & 0x02);
      width = buffer.readUIntLE(dataOffset + 4, 3) + 1;
      height = buffer.readUIntLE(dataOffset + 7, 3) + 1;
    } else if (type === "ANIM" && length >= 6) {
      declaredAnimated = true;
      loopCount = buffer.readUInt16LE(dataOffset + 4);
    } else if (type === "VP8 " && length >= 10 && !width) {
      width = buffer.readUInt16LE(dataOffset + 6) & 0x3fff;
      height = buffer.readUInt16LE(dataOffset + 8) & 0x3fff;
    } else if (type === "VP8L" && length >= 5 && !width && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      hasAlpha ||= Boolean((bits >>> 28) & 1);
    } else if (type === "ALPH") hasAlpha = true;
    else if (type === "ANMF" && length >= 16) {
      frameCount += 1;
      durationMs += buffer.readUIntLE(dataOffset + 12, 3);
    }
    offset = dataOffset + length + (length % 2);
  }
  return {
    kind: "image", format: "webp", width, height, hasAlpha,
    frameCount: frameCount || 1,
    animated: declaredAnimated || frameCount > 1,
    durationMs,
    ...(loopCount === null ? {} : { loopCount }),
  };
}

function gifMetadata(buffer) {
  if (buffer.length < 13 || !/^GIF8[79]a$/.test(buffer.toString("ascii", 0, 6))) return null;
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  let offset = 13;
  const packed = buffer[10];
  if (packed & 0x80) offset += 3 * (2 ** ((packed & 0x07) + 1));
  let frameCount = 0;
  let durationMs = 0;
  let hasAlpha = false;
  const skipSubBlocks = () => {
    while (offset < buffer.length) {
      const size = buffer[offset]; offset += 1;
      if (!size) break;
      offset += size;
    }
  };
  while (offset < buffer.length) {
    const marker = buffer[offset]; offset += 1;
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = buffer[offset]; offset += 1;
      if (label === 0xf9 && offset + 5 <= buffer.length) {
        const size = buffer[offset]; offset += 1;
        if (size >= 4) {
          hasAlpha ||= Boolean(buffer[offset] & 1);
          durationMs += buffer.readUInt16LE(offset + 1) * 10;
        }
        offset += size + 1;
      } else skipSubBlocks();
    } else if (marker === 0x2c && offset + 9 <= buffer.length) {
      frameCount += 1;
      const imagePacked = buffer[offset + 8];
      offset += 9;
      if (imagePacked & 0x80) offset += 3 * (2 ** ((imagePacked & 0x07) + 1));
      offset += 1;
      skipSubBlocks();
    } else break;
  }
  return { kind: "image", format: "gif", width, height, hasAlpha, frameCount: frameCount || 1, animated: frameCount > 1, durationMs };
}

function jpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { kind: "image", format: "jpeg", width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), hasAlpha: false, frameCount: 1, animated: false, durationMs: 0 };
    }
    offset += length;
  }
  return null;
}

function svgMetadata(buffer) {
  const text = buffer.subarray(0, Math.min(buffer.length, 32768)).toString("utf8");
  if (!/<svg\b/i.test(text)) return null;
  const widthMatch = text.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i);
  const heightMatch = text.match(/\bheight=["']([0-9.]+)(?:px)?["']/i);
  const viewBox = text.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
  return {
    kind: "image", format: "svg",
    width: Number(widthMatch?.[1] || viewBox?.[1] || 0),
    height: Number(heightMatch?.[1] || viewBox?.[2] || 0),
    hasAlpha: true, frameCount: 1, animated: /<(?:animate|animateTransform)\b/i.test(text), durationMs: 0,
  };
}

export function readMediaMetadata(repoPath, buffer) {
  const extension = path.posix.extname(repoPath).toLowerCase();
  let metadata = null;
  if (extension === ".png") metadata = pngMetadata(buffer);
  else if (extension === ".webp") metadata = webpMetadata(buffer);
  else if (extension === ".gif") metadata = gifMetadata(buffer);
  else if (extension === ".jpg" || extension === ".jpeg") metadata = jpegMetadata(buffer);
  else if (extension === ".svg") metadata = svgMetadata(buffer);
  if (metadata) return metadata;
  if (IMAGE_EXTENSIONS.has(extension)) return { kind: "image", format: extension.slice(1), parseError: "Cabecera de imagen no reconocida." };
  if (AUDIO_EXTENSIONS.has(extension)) return { kind: "audio", format: extension.slice(1) };
  if (VIDEO_EXTENSIONS.has(extension)) return { kind: "video", format: extension.slice(1) };
  if (ARCHIVE_EXTENSIONS.has(extension)) return { kind: "archive", format: extension.slice(1) };
  if (CODE_EXTENSIONS.has(extension)) return { kind: "code", format: extension.slice(1) };
  if ([".csv", ".geojson", ".json", ".osm", ".xml"].includes(extension)) return { kind: "data", format: extension.slice(1) };
  return null;
}

export function classifyAsset(repoPath, runtimePaths = new Set()) {
  const normalized = normalizeRepoPath(repoPath);
  const lower = normalized.toLowerCase();
  const extension = path.posix.extname(lower);
  const segments = lower.split("/");
  const base = path.posix.basename(lower, extension);
  if (runtimePaths.has(normalized)) return { classification: "runtime", reason: "runtime-reference" };
  if (ARCHIVE_EXTENSIONS.has(extension) || segments.some((segment) => /^(?:archive|archives|backup|backups)$/.test(segment))) {
    return { classification: "archive", reason: ARCHIVE_EXTENSIONS.has(extension) ? "archive-extension" : "archive-directory" };
  }
  if (segments.some((segment) => /^(?:source|sources|original|originals|raw|reference|references|workfile|workfiles)$/.test(segment))) {
    return { classification: "source", reason: "source-directory" };
  }
  if (SOURCE_EXTENSIONS.has(extension) || /^(?:credits?|license|readme)(?:[-_.]|$)/.test(path.posix.basename(lower))) {
    return { classification: "source", reason: SOURCE_EXTENSIONS.has(extension) ? "source-extension" : "supporting-metadata" };
  }
  if (segments.some((segment) => /^(?:debug|derived|preview|previews|reports?|audit|audits)$/.test(segment))
    || /(?:^|[-_.])(?:preview|comparison|report|debug|audit|mask|walkability|navigation|sectors?)(?:[-_.]|$)/.test(base)) {
    return { classification: "derived", reason: "derived-name" };
  }
  return { classification: "candidate", reason: "not-discovered-at-runtime" };
}

function summarize(records) {
  const byClassification = Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, { files: 0, bytes: 0 }]));
  for (const record of records) {
    byClassification[record.classification].files += 1;
    byClassification[record.classification].bytes += record.bytes;
  }
  return {
    files: records.length,
    bytes: records.reduce((total, record) => total + record.bytes, 0),
    byClassification,
  };
}

function findDuplicates(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.bytes}:${record.sha256}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups.values()].filter((group) => group.length > 1).map((group) => ({
    sha256: group[0].sha256,
    bytes: group[0].bytes,
    reclaimableBytes: group[0].bytes * (group.length - 1),
    paths: group.map((record) => record.path).sort(compareText),
    classifications: [...new Set(group.map((record) => record.classification))]
      .sort((a, b) => FIXED_CLASSIFICATION_ORDER[a] - FIXED_CLASSIFICATION_ORDER[b]),
  })).sort((a, b) => compareText(a.paths[0], b.paths[0]));
}

function addDiscovery(discovery, actualPath, method, source) {
  if (!discovery.has(actualPath)) discovery.set(actualPath, { methods: new Set(), sources: new Set() });
  discovery.get(actualPath).methods.add(method);
  if (source) discovery.get(actualPath).sources.add(source);
}

export async function runAssetAudit(repoRoot, rawConfig) {
  const config = {
    schemaVersion: Number(rawConfig.schemaVersion ?? 0),
    assetRoots: [...new Set((rawConfig.assetRoots || ["assets"]).map(normalizeRepoPath).filter(Boolean))].sort(compareText),
    entrypoints: [...new Set((rawConfig.entrypoints || ["index.html"]).map(normalizeRepoPath).filter(Boolean))].sort(compareText),
    dynamicIncludes: [...(rawConfig.dynamicIncludes || [])].map((rule) => ({
      pattern: normalizeRepoPath(rule.pattern),
      reason: String(rule.reason || "dynamic-runtime-reference"),
      referencedBy: normalizeRepoPath(rule.referencedBy || ""),
      allowEmpty: Boolean(rule.allowEmpty),
    })).sort((a, b) => compareText(a.pattern, b.pattern)),
  };
  const listed = await listFiles(repoRoot, config.assetRoots);
  const actualPaths = new Set(listed.files);
  const lowerPathMap = new Map();
  for (const file of listed.files) {
    const lower = file.toLowerCase();
    if (!lowerPathMap.has(lower)) lowerPathMap.set(lower, []);
    lowerPathMap.get(lower).push(file);
  }
  const discovered = await discoverRuntimeSources(repoRoot, config);
  const runtimeDiscovery = new Map();
  const missingReferences = [];
  const caseMismatches = [];
  const unmatchedPatterns = [];

  for (const sourcePath of discovered.sources) {
    if (actualPaths.has(sourcePath)) addDiscovery(runtimeDiscovery, sourcePath, "runtime-source", sourcePath);
  }
  for (const [reference, sources] of discovered.references) {
    if (actualPaths.has(reference)) {
      for (const source of sources) addDiscovery(runtimeDiscovery, reference, "literal", source);
    } else if (lowerPathMap.has(reference.toLowerCase())) {
      const matches = lowerPathMap.get(reference.toLowerCase()).sort(compareText);
      caseMismatches.push({ reference, actualPaths: matches, referencedBy: [...sources].sort(compareText) });
      for (const actualPath of matches) for (const source of sources) addDiscovery(runtimeDiscovery, actualPath, "case-mismatch", source);
    } else missingReferences.push({ path: reference, referencedBy: [...sources].sort(compareText) });
  }

  const patternRules = [
    ...[...discovered.templatePatterns].map(([pattern, sources]) => ({
      pattern, reason: "template-literal", referencedBy: [...sources].sort(compareText), allowEmpty: false,
    })),
    ...config.dynamicIncludes.map((rule) => ({
      pattern: rule.pattern, reason: rule.reason, referencedBy: rule.referencedBy ? [rule.referencedBy] : [], allowEmpty: rule.allowEmpty,
    })),
  ].sort((a, b) => compareText(a.pattern, b.pattern));
  for (const rule of patternRules) {
    const matcher = globToRegExp(rule.pattern);
    const matches = listed.files.filter((file) => matcher.test(file));
    if (!matches.length && !rule.allowEmpty) unmatchedPatterns.push({ pattern: rule.pattern, referencedBy: rule.referencedBy });
    for (const match of matches) {
      if (rule.referencedBy.length) for (const source of rule.referencedBy) addDiscovery(runtimeDiscovery, match, `pattern:${rule.pattern}`, source);
      else addDiscovery(runtimeDiscovery, match, `pattern:${rule.pattern}`, "");
    }
  }

  const runtimePaths = new Set(runtimeDiscovery.keys());
  const records = [];
  for (const repoPath of listed.files) {
    const absolutePath = path.join(repoRoot, ...repoPath.split("/"));
    const buffer = await fs.readFile(absolutePath);
    const classification = classifyAsset(repoPath, runtimePaths);
    const discovery = runtimeDiscovery.get(repoPath);
    const record = {
      path: repoPath,
      classification: classification.classification,
      classificationReason: classification.reason,
      bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
    const media = readMediaMetadata(repoPath, buffer);
    if (media) record.media = media;
    if (discovery) {
      record.discovery = [...discovery.methods].sort(compareText);
      record.referencedBy = [...discovery.sources].sort(compareText);
    }
    records.push(record);
  }

  const duplicates = findDuplicates(records);
  const summary = summarize(records);
  summary.exactDuplicateGroups = duplicates.length;
  summary.exactDuplicateCopies = duplicates.reduce((total, group) => total + group.paths.length - 1, 0);
  summary.exactDuplicateReclaimableBytes = duplicates.reduce((total, group) => total + group.reclaimableBytes, 0);
  const integrity = {
    missingSources: discovered.missingSources,
    missingReferences: missingReferences.sort((a, b) => compareText(a.path, b.path)),
    caseMismatches: caseMismatches.sort((a, b) => compareText(a.reference, b.reference)),
    unmatchedPatterns: unmatchedPatterns.sort((a, b) => compareText(a.pattern, b.pattern)),
    ignoredSymlinks: listed.ignoredSymlinks,
  };
  const runtimeRecords = records.filter((record) => record.classification === "runtime").map((record) => {
    const { classification, classificationReason, ...runtimeRecord } = record;
    return runtimeRecord;
  });
  const policyWarnings = runtimeRecords.filter((record) => {
    const lower = record.path.toLowerCase();
    return record.media?.parseError || /\/(?:source|sources|original|originals|raw|references?|workfiles?|archives?|backups?)\//.test(`/${lower}/`) || ARCHIVE_EXTENSIONS.has(path.posix.extname(lower));
  }).map((record) => ({
    path: record.path,
    reason: record.media?.parseError ? record.media.parseError : "Una ruta runtime apunta a material fuente o archivado.",
  }));

  return {
    inventory: {
      schemaVersion: config.schemaVersion,
      generator: "tools/assets/audit-assets.mjs",
      assetRoots: config.assetRoots,
      summary,
      integrity,
      duplicates,
      files: records,
    },
    runtime: {
      schemaVersion: config.schemaVersion,
      generator: "tools/assets/audit-assets.mjs",
      entrypoints: config.entrypoints,
      scannedSources: discovered.sources,
      dynamicIncludes: config.dynamicIncludes,
      summary: {
        files: runtimeRecords.length,
        bytes: runtimeRecords.reduce((total, record) => total + record.bytes, 0),
        policyWarnings: policyWarnings.length,
      },
      integrity,
      policyWarnings,
      files: runtimeRecords,
    },
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function writeOrCheckManifests(repoRoot, manifests, options) {
  const outputs = [
    { label: "inventory", path: path.resolve(repoRoot, options.inventoryOut), content: serializeManifest(manifests.inventory) },
    { label: "runtime", path: path.resolve(repoRoot, options.runtimeOut), content: serializeManifest(manifests.runtime) },
  ];
  const drift = [];
  for (const output of outputs) {
    if (options.check) {
      let current = "";
      try { current = await fs.readFile(output.path, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (current !== output.content) drift.push(normalizeRepoPath(path.relative(repoRoot, output.path)));
    } else {
      await fs.mkdir(path.dirname(output.path), { recursive: true });
      await fs.writeFile(output.path, output.content, "utf8");
    }
  }
  return drift;
}

export function hasIntegrityErrors(integrity) {
  return integrity.missingSources.length > 0
    || integrity.missingReferences.length > 0
    || integrity.caseMismatches.length > 0
    || integrity.unmatchedPatterns.length > 0;
}
