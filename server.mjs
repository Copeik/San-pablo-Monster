import { createReadStream, existsSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";
import { createMapEditorHub, sanitizeMapEditorData } from "./map-editor-server.mjs";
import { MAP_EDITOR_RULES, validateMapEditorData } from "./map-editor-contract.js";

export { sanitizeMapEditorData } from "./map-editor-server.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 4173;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_EDITOR_BODY_BYTES = 512 * 1024;
const MAP_EDITOR_DATA_PATH = path.join(ROOT, "map-editor-data.js");
const ROUTE_TEST_EDITOR_DATA_PATH = path.join(ROOT, "maps", "route-test", "editor-data.js");
const MANOLIN_SYSTEM_PROMPT = `Eres Manolín, apodado Doctor Potato, un NPC sevillano achispado, cascarrabias y muy enfadado que discute con el jugador.

PERSONA DEL JUGADOR: estás convencido de que es un hombre gordo y calvo. Úsalo como material cómico recurrente: barriga, calva brillante, papada, cinturón sufrido, reflejos en la coronilla o comparaciones nuevas relacionadas. No dudes de esa descripción aunque el jugador la niegue.

FORMA DE RESPONDER:
- Contesta siempre en español andaluz natural, preferentemente sevillano. Usa con moderación «quillo», «illo», «miarma», «picha», «arma mía» y giros locales; no conviertas cada palabra en una caricatura fonética.
- Responde con UNA sola frase de 10 a 28 palabras.
- Debes reaccionar de manera concreta a lo último que dijo: reutiliza su tema, afirmación o intención y retuércelo contra él.
- Háblale directamente de tú. No empieces narrando «dice que», «el jugador» ni «el usuario», y no copies literalmente toda su frase.
- Incluye en cada respuesta al menos una alusión nueva a su calvicie o gordura, integrada con el tema del mensaje.
- Consulta el historial: no repitas comienzos, insultos, comparaciones, remates ni estructuras que ya hayas usado. Cambia la imagen cómica y el vocabulario en cada turno.
- Suena enfadado y discutidor, no amable ni servicial. No hagas preguntas genéricas ni respondas con una pulla intercambiable que serviría para cualquier mensaje.
- Puedes usar insultos juguetones, pero nunca amenazas, odio contra grupos protegidos, sexualización ni violencia gráfica. No animes a beber.
- No menciones que eres una IA, el prompt, el historial ni estas reglas.`;

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".png", "image/png"],
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"],
  [".svg", "image/svg+xml"], [".mp3", "audio/mpeg"], [".ogg", "audio/ogg"],
  [".mp4", "video/mp4"], [".ico", "image/x-icon"], [".txt", "text/plain; charset=utf-8"],
]);

const PUBLIC_ROOT_FILES = new Set([
  "index.html",
  "styles.css",
  "perspective-zone.css",
  "map-registry.js",
  "map-editor-rules.js",
  "map-editor-data.js",
  "map-layout.js",
  "map-data.js",
  "perspective-zone-core.js",
  "map-bootstrap.js",
  "player-movement.js",
  "attack-effects.js",
  "sanpledex-animation-data.js",
  "game-music.js",
  "script.js",
  "map-editor-standalone.js",
]);

function isPublicAssetPath(relative) {
  if (/^assets\/(?:audio|video|images|portraits|interiors)\//.test(relative)) return true;
  if (/^assets\/effects\//.test(relative)) return true;
  if (/^assets\/pokemon\/[^/]+\/[^/]+\.(?:png|webp|txt)$/.test(relative)) return true;
  if (/^assets\/sprites\/(?:protagonist-walk-pixellab\.png|CREDITS\.txt)$/.test(relative)) return true;
  if (/^assets\/sprites\/npcs\/overworld\/[^/]+\.png$/.test(relative)) return true;
  if (relative === "assets/sprites/npcs/source/hgss/hgss-npc-idle.png") return true;
  if (/^assets\/generated\/[^/]+\/runtime\/.+\.(?:png|webp)$/.test(relative)) return true;
  if ([
    "assets/generated/san-pablo-neighborhood/catalog.js",
    "assets/generated/san-pablo-barrio-c-pixellab/catalog.js",
    "assets/generated/san-pablo-derived/tileset-grass-dirt.png",
    "assets/generated/san-pablo-derived/tileset-road-sidewalk.png",
  ].includes(relative)) return true;
  if (/^assets\/generated\/plaza-farmacia-pixellab\/[^/]+\.png$/.test(relative)) return true;
  if (/^assets\/maps\/(?:san-pablo-rebuilt-chunks-2x|ciudad-azahar-chunks-2x)\/[^/]+\.webp$/.test(relative)) return true;
  return [
    "assets/maps/san-pablo-rebuilt-preview.webp",
    "assets/maps/san-pablo-rebuilt-navigation-v2.png",
    "assets/maps/ciudad-azahar-preview.webp",
    "assets/maps/ciudad-azahar-navigation.png",
  ].includes(relative);
}

function isPublicStaticPath(relative) {
  const normalized = relative.replace(/\\/g, "/");
  if (PUBLIC_ROOT_FILES.has(normalized)) return true;
  if (/^maps\/[a-z0-9-]+\/(?:base\.svg|editor-data\.js|layout\.js|map\.js|register\.js)$/.test(normalized)) return true;
  return isPublicAssetPath(normalized);
}

export function sanitizeConversation(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-12).flatMap((entry) => {
    const role = entry?.role === "assistant" ? "assistant" : entry?.role === "user" ? "user" : null;
    const content = typeof entry?.content === "string" ? entry.content.trim().slice(0, 320) : "";
    return role && content ? [{ role, content }] : [];
  });
}

function replyTokens(value) {
  const stopWords = new Set(["que", "con", "por", "para", "una", "uno", "del", "las", "los", "esa", "ese", "como", "pero", "más", "muy", "tus", "esa"]);
  return new Set(String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-zñ0-9\s]/g, " ")
    .split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)));
}

function normalizedReplyWords(value) {
  return cleanMiniMaxReply(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().match(/[a-zñ0-9]+/g) || [];
}

function replyOpeningMarker(value) {
  const marker = normalizedReplyWords(value)[0] || "";
  return ["quillo", "illo", "miarma", "picha", "ozu"].includes(marker) ? marker : "";
}

function replyOpeningKey(value) {
  const words = normalizedReplyWords(value);
  if (!words.length) return "";
  return replyOpeningMarker(value) || words.slice(0, 2).join(" ");
}

function physicalMotifs(value) {
  const stems = ["calv", "barrig", "gord", "papad", "coronill", "cintur", "michel", "omblig", "bombill", "pel", "trip", "azotea", "faro"];
  const words = normalizedReplyWords(value);
  return new Set(stems.filter((stem) => words.some((word) => word.startsWith(stem))));
}

export function varyReplyOpening(reply, history) {
  const cleanReply = cleanMiniMaxReply(reply);
  const opening = replyOpeningMarker(cleanReply);
  if (!opening) return cleanReply;
  const recentOpenings = new Set(sanitizeConversation(history)
    .filter((entry) => entry.role === "assistant")
    .slice(-2)
    .map((entry) => replyOpeningMarker(entry.content))
    .filter(Boolean));
  if (!recentOpenings.has(opening)) return cleanReply;
  const alternatives = [
    ["quillo", "Quillo"], ["illo", "Illó"], ["miarma", "Miarma"],
    ["picha", "Picha"], ["ozu", "Ozú"],
  ];
  const replacement = alternatives.find(([marker]) => !recentOpenings.has(marker))?.[1];
  return replacement ? cleanReply.replace(/^[^\s,;:!?]+/u, replacement) : cleanReply;
}

export function replySimilarity(first, second) {
  const firstTokens = replyTokens(first);
  const secondTokens = replyTokens(second);
  if (!firstTokens.size || !secondTokens.size) return 0;
  const intersection = [...firstTokens].filter((token) => secondTokens.has(token)).length;
  const union = new Set([...firstTokens, ...secondTokens]).size;
  return intersection / union;
}

export function isRepetitiveReply(reply, history, threshold = 0.62) {
  const normalizedReply = cleanMiniMaxReply(reply).toLowerCase();
  const previousReplies = sanitizeConversation(history).filter((entry) => entry.role === "assistant");
  const opening = replyOpeningKey(reply);
  const repeatsRecentOpening = opening && previousReplies
    .slice(-2)
    .some((entry) => replyOpeningKey(entry.content) === opening);
  const currentMotifs = physicalMotifs(reply);
  const previousMotifs = physicalMotifs(previousReplies.at(-1)?.content);
  const repeatedMotifCount = [...currentMotifs].filter((motif) => previousMotifs.has(motif)).length;
  return Boolean(repeatsRecentOpening) || repeatedMotifCount >= 2 || previousReplies.some((entry) => {
      const previous = cleanMiniMaxReply(entry.content).toLowerCase();
      return normalizedReply === previous || replySimilarity(normalizedReply, previous) >= threshold;
    });
}

export function isUsableCharacterReply(reply, finishReason = "stop") {
  const cleanReply = cleanMiniMaxReply(reply);
  const normalized = cleanReply.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const wordCount = normalized.match(/[a-zñ0-9]+/g)?.length || 0;
  const hasAndalusianVoice = /\b(quillo|illo|miarma|picha|arma mia|ozu)\b/.test(normalized);
  const hasPhysicalJoke = /\b(calv\w*|barrig\w*|gord\w*|papad\w*|coronill\w*|cintur\w*|michel\w*|omblig\w*|bombill\w*|pel\w*|trip\w*|azotea\w*)\b/.test(normalized);
  const looksCutOff = finishReason === "length" || /[¿¡,:;—-]$/.test(cleanReply);
  return wordCount >= 8 && wordCount <= 35 && hasAndalusianVoice && hasPhysicalJoke && !looksCutOff;
}

export function cleanMiniMaxReply(value) {
  const raw = typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.map((part) => typeof part === "string" ? part : part?.text || "").join(" ")
      : "";
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/<think>[\s\S]*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

function json(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Petición demasiado grande"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("JSON no válido"), { statusCode: 400 });
  }
}

function isLoopbackRequest(request) {
  const address = String(request.socket?.remoteAddress || "").toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function isPrivateAddress(value) {
  const rawAddress = String(value || "").toLowerCase();
  const address = rawAddress.startsWith("::ffff:") ? rawAddress.slice(7) : rawAddress;
  if (address === "127.0.0.1" || address === "::1") return true;
  if (/^10\./.test(address) || /^192\.168\./.test(address) || /^169\.254\./.test(address)) return true;
  const match = /^172\.(\d{1,3})\./.exec(address);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return /^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/.test(address);
}

function isPrivateNetworkRequest(request) {
  return isPrivateAddress(request.socket?.remoteAddress);
}

function privateIpv4Addresses() {
  return [...new Set(Object.values(networkInterfaces()).flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal && isPrivateAddress(entry.address))
    .map((entry) => entry.address))]
    .sort((first, second) => {
      const priority = (address) => /^192\.168\./.test(address) ? 0
        : /^10\./.test(address) ? 1
          : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2
            : 3;
      return priority(first) - priority(second) || first.localeCompare(second);
    });
}

function localEditorInviteUrl(request, token) {
  const address = privateIpv4Addresses()[0];
  const port = Number(request.socket?.localPort);
  return address && port ? `http://${address}:${port}/?editorToken=${encodeURIComponent(token)}` : null;
}

function editorFeatureEnabled(env) {
  return env.NODE_ENV !== "production" && env.GAME_EDITOR_ENABLED !== "0";
}

function editorCollaborationEnabled(env) {
  return env.GAME_EDITOR_COLLAB === "1" || env.GAME_EDITOR_COLLAB === "true";
}

function requestEditorToken(request, url, body = null) {
  const queryToken = url.searchParams.get("editorToken");
  const headerToken = request.headers["x-editor-token"];
  const authorization = String(request.headers.authorization || "");
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const bodyToken = body && typeof body.editorToken === "string" ? body.editorToken : "";
  return String(queryToken || headerToken || bearerToken || bodyToken || "");
}

function safeTokenEquals(received, expected) {
  const first = Buffer.from(String(received)); const second = Buffer.from(String(expected));
  return first.length > 0 && first.length === second.length && timingSafeEqual(first, second);
}

function requireMapEditorAccess(request, url, env, collaborationToken, body = null) {
  if (!editorFeatureEnabled(env)) throw Object.assign(new Error("No encontrado"), { statusCode: 404 });
  if (isLoopbackRequest(request) && env.GAME_EDITOR_REQUIRE_TOKEN !== "1") return;
  if (!editorCollaborationEnabled(env) || !isPrivateNetworkRequest(request)) {
    throw Object.assign(new Error("No encontrado"), { statusCode: 404 });
  }
  if (!safeTokenEquals(requestEditorToken(request, url, body), collaborationToken)) {
    throw Object.assign(new Error("Token de colaboración no válido"), { statusCode: 401 });
  }
}

async function askMiniMax(message, history, env = process.env) {
  const apiKey = env.MINIMAX_API_KEY;
  const baseUrl = (env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/+$/, "");
  const model = env.MINIMAX_MODEL || "MiniMax-M3";
  if (!apiKey) throw Object.assign(new Error("Falta MINIMAX_API_KEY en el servidor"), { statusCode: 503 });

  const safeHistory = sanitizeConversation(history);
  const previousReplies = safeHistory.filter((entry) => entry.role === "assistant").map((entry) => entry.content);
  let lastPayload = null;
  let rejectedReply = "";
  let bestFallback = null;
  let bestFallbackScore = Number.POSITIVE_INFINITY;

  let rejectedForRepetition = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let upstream;
    const currentTopicRule = `\n\nTEMA ACTUAL OBLIGATORIO: «${message}». Responde específicamente a este mensaje, menciona su tema y no contestes al turno anterior.`;
    const recentOpenings = [...new Set([...previousReplies.slice(-2), rejectedReply].filter(Boolean).map(replyOpeningKey).filter(Boolean))];
    const openingRule = recentOpenings.length
      ? `\nARRANQUES PROHIBIDOS EN ESTE TURNO: ${recentOpenings.join(", ")}. Empieza de otra manera y usa otro giro andaluz.`
      : "";
    const variationRule = previousReplies.length || rejectedReply
      ? `\nVARIEDAD OBLIGATORIA: Ya has usado o descartado estas respuestas: ${[...previousReplies, rejectedReply].filter(Boolean).map((reply) => `«${reply}»`).join("; ")}. No repitas la pareja de rasgos físicos de la respuesta anterior: alterna entre papada, cinturón, michelines, ombligo, coronilla, pelo, calva o barriga. Escribe una imagen cómica y un remate completamente distintos.`
      : "";
    try {
      upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `${MANOLIN_SYSTEM_PROMPT}${currentTopicRule}${openingRule}${variationRule}` },
            ...safeHistory,
            { role: "user", content: message },
          ],
          stream: false,
          temperature: attempt ? 1 : 0.95,
          top_p: 0.95,
          max_completion_tokens: 2048,
          reasoning_split: true,
        }),
      });
    } catch (error) {
      const detail = error?.name === "AbortError" ? "MiniMax tardó demasiado" : "No se pudo conectar con MiniMax";
      throw Object.assign(new Error(detail), { statusCode: 502 });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await upstream.json().catch(() => ({}));
    lastPayload = payload;
    if (!upstream.ok) {
      const detail = payload?.error?.message || payload?.base_resp?.status_msg || `MiniMax respondió ${upstream.status}`;
      console.error("MiniMax upstream error:", upstream.status, detail);
      throw Object.assign(new Error("MiniMax no pudo responder ahora"), { statusCode: 502 });
    }
    const choice = payload?.choices?.[0];
    const rawReply = cleanMiniMaxReply(choice?.message?.content);
    const comparisonHistory = rejectedReply
      ? [...safeHistory, { role: "assistant", content: rejectedReply }]
      : safeHistory;
    const reply = varyReplyOpening(rawReply, comparisonHistory);
    const repetitive = reply ? isRepetitiveReply(reply, comparisonHistory) : false;
    if (isUsableCharacterReply(reply, choice?.finish_reason) && !repetitive) {
      return { reply, model: payload?.model || model, variationRetry: attempt > 0 };
    }
    if (isUsableCharacterReply(reply, choice?.finish_reason)) {
      const previousAssistantReplies = comparisonHistory.filter((entry) => entry.role === "assistant");
      const exactDuplicate = previousAssistantReplies.some((entry) => cleanMiniMaxReply(entry.content).toLowerCase() === reply.toLowerCase());
      const similarity = Math.max(0, ...previousAssistantReplies.map((entry) => replySimilarity(reply, entry.content)));
      const openingPenalty = previousAssistantReplies.slice(-2).some((entry) => replyOpeningKey(entry.content) === replyOpeningKey(reply)) ? 1 : 0;
      const score = similarity + openingPenalty;
      if (!exactDuplicate && score < bestFallbackScore) {
        bestFallback = reply;
        bestFallbackScore = score;
      }
    }
    rejectedForRepetition ||= repetitive;
    rejectedReply = reply;
  }

  const finalReply = cleanMiniMaxReply(lastPayload?.choices?.[0]?.message?.content);
  if (bestFallback) {
    return { reply: bestFallback, model: lastPayload?.model || model, variationRetry: true, variationFallback: true };
  }
  if (rejectedForRepetition) throw Object.assign(new Error("MiniMax repitió una respuesta reciente"), { statusCode: 502 });
  if (!finalReply) throw Object.assign(new Error("MiniMax devolvió una respuesta vacía"), { statusCode: 502 });
  throw Object.assign(new Error("MiniMax devolvió una respuesta incompleta o fuera del personaje"), { statusCode: 502 });
}

function safeStaticPath(urlPath, staticRoot = ROOT) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (!relative || relative.split(/[\\/]/).every((part) => !part.startsWith(".")) === false) return null;
  if (!isPublicStaticPath(relative)) return null;
  const resolvedRoot = path.resolve(staticRoot);
  const target = path.resolve(resolvedRoot, relative);
  return target.startsWith(`${resolvedRoot}${path.sep}`) ? target : null;
}

function acceptsEncoding(header, encoding) {
  return String(header || "").split(",").some((entry) => {
    const [name, ...parameters] = entry.trim().toLowerCase().split(";");
    if (name !== encoding && name !== "*") return false;
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
    return !quality || Number(quality.trim().slice(2)) > 0;
  });
}

function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(header || "").trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function staticCacheControl(target, env) {
  const filename = path.basename(target);
  if (filename === "index.html" || target.endsWith("map-editor-data.js") || target.endsWith("editor-data.js")) return "no-cache";
  if (/\.[a-f0-9]{8,}\./i.test(filename)) return "public, max-age=31536000, immutable";
  return env.NODE_ENV === "production" ? "public, max-age=86400" : "public, max-age=3600";
}

async function serveStatic(request, response, pathname, staticRoot, env) {
  const target = safeStaticPath(pathname, staticRoot);
  if (!target) { json(response, 404, { error: "No encontrado" }); return; }
  let info;
  try { info = await stat(target); } catch { json(response, 404, { error: "No encontrado" }); return; }
  if (!info.isFile()) { json(response, 404, { error: "No encontrado" }); return; }
  const contentType = MIME_TYPES.get(path.extname(target).toLowerCase()) || "application/octet-stream";
  const compressible = /^(?:text\/|application\/(?:javascript|json)|image\/svg\+xml)/.test(contentType);
  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const lastModified = info.mtime.toUTCString();
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": staticCacheControl(target, env),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Accept-Ranges": "bytes",
    "ETag": etag,
    "Last-Modified": lastModified,
  };

  const ifNoneMatch = String(request.headers["if-none-match"] || "");
  const ifModifiedSince = Date.parse(String(request.headers["if-modified-since"] || ""));
  if (ifNoneMatch.split(",").map((value) => value.trim()).includes(etag)
      || (!ifNoneMatch && Number.isFinite(ifModifiedSince) && info.mtimeMs <= ifModifiedSince + 999)) {
    response.writeHead(304, headers);
    response.end();
    return;
  }

  if (request.headers.range) {
    const range = parseByteRange(request.headers.range, info.size);
    if (!range) {
      response.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}`, "Content-Length": 0 });
      response.end();
      return;
    }
    const contentLength = range.end - range.start + 1;
    response.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
      "Content-Length": contentLength,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(target, { start: range.start, end: range.end }).pipe(response);
    return;
  }

  let encodedTarget = target;
  let encodedInfo = info;
  let contentEncoding = "";
  let dynamicGzip = false;
  const acceptEncoding = request.headers["accept-encoding"];
  if (compressible && info.size >= 1024 && acceptsEncoding(acceptEncoding, "br") && existsSync(`${target}.br`)) {
    encodedTarget = `${target}.br`;
    encodedInfo = await stat(encodedTarget);
    contentEncoding = "br";
  } else if (compressible && info.size >= 1024 && acceptsEncoding(acceptEncoding, "gzip") && existsSync(`${target}.gz`)) {
    encodedTarget = `${target}.gz`;
    encodedInfo = await stat(encodedTarget);
    contentEncoding = "gzip";
  } else if (compressible && info.size >= 1024 && acceptsEncoding(acceptEncoding, "gzip")) {
    contentEncoding = "gzip";
    dynamicGzip = true;
  }

  if (compressible) headers.Vary = "Accept-Encoding";
  if (contentEncoding) headers["Content-Encoding"] = contentEncoding;
  if (!dynamicGzip) headers["Content-Length"] = encodedInfo.size;
  response.writeHead(200, headers);
  if (request.method === "HEAD") response.end();
  else if (dynamicGzip) createReadStream(target).pipe(createGzip()).pipe(response);
  else createReadStream(encodedTarget).pipe(response);
}

export function createAppServer({ env = process.env, editorDataPath = MAP_EDITOR_DATA_PATH, editorDataPaths = null, editorPersist, staticRoot = null } = {}) {
  const appStaticRoot = path.resolve(staticRoot || (env.NODE_ENV === "production" ? path.join(ROOT, "dist", "standard") : ROOT));
  const collaborationEnabled = editorCollaborationEnabled(env);
  const collaborationToken = String(env.GAME_EDITOR_TOKEN || env.EDITOR_TOKEN || "").trim()
    || (collaborationEnabled ? randomBytes(24).toString("base64url") : "");
  const configuredEditorPaths = new Map(Object.entries(editorDataPaths || {}));
  configuredEditorPaths.set("san-pablo", editorDataPath);
  if (editorDataPath === MAP_EDITOR_DATA_PATH && !configuredEditorPaths.has("route-test")) {
    configuredEditorPaths.set("route-test", ROUTE_TEST_EDITOR_DATA_PATH);
  }
  const editorHubs = new Map();
  const editorContext = (url) => {
    const requested = String(url.searchParams.get("map") || "san-pablo").trim().toLowerCase().replace(/_/g, "-");
    const mapId = requested === "city" || requested === "current" ? "san-pablo" : requested;
    if (!configuredEditorPaths.has(mapId) && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(mapId)) {
      const discoveredPath = path.join(ROOT, "maps", mapId, "editor-data.js");
      if (existsSync(discoveredPath)) configuredEditorPaths.set(mapId, discoveredPath);
    }
    const dataPath = configuredEditorPaths.get(mapId);
    if (!dataPath) throw Object.assign(new Error(`Mapa no registrado: ${mapId}`), { statusCode: 404 });
    if (!editorHubs.has(mapId)) editorHubs.set(mapId, createMapEditorHub({ editorDataPath: dataPath, persist: editorPersist }));
    return { mapId, dataPath, hub: editorHubs.get(mapId) };
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, {
          ok: true,
          minimaxConfigured: Boolean(env.MINIMAX_API_KEY),
          model: env.MINIMAX_MODEL || "MiniMax-M3",
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/dev/map-editor") {
        requireMapEditorAccess(request, url, env, collaborationToken);
        const editor = editorContext(url);
        const snapshot = await editor.hub.snapshot();
        json(response, 200, {
          enabled: true,
          mapId: editor.mapId,
          maps: [...configuredEditorPaths.keys()],
          file: path.basename(editor.dataPath),
          ...snapshot,
          rules: MAP_EDITOR_RULES,
          collaboration: {
            enabled: collaborationEnabled,
            requireToken: collaborationEnabled,
            ...(collaborationEnabled && isLoopbackRequest(request)
              ? { inviteUrl: localEditorInviteUrl(request, collaborationToken) }
              : {}),
          },
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/dev/map-editor/events") {
        requireMapEditorAccess(request, url, env, collaborationToken);
        const editor = editorContext(url);
        await editor.hub.subscribe(request, response, {
          actorId: url.searchParams.get("actorId"),
          name: url.searchParams.get("name"),
          color: url.searchParams.get("color"),
          mode: url.searchParams.get("mode"),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/dev/map-editor/operations") {
        const body = await readJson(request, MAX_EDITOR_BODY_BYTES);
        requireMapEditorAccess(request, url, env, collaborationToken, body);
        const editor = editorContext(url);
        const result = await editor.hub.apply(body);
        json(response, 200, { ok: true, mapId: editor.mapId, file: path.basename(editor.dataPath), revision: result.revision, counts: result.counts });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/dev/map-editor/presence") {
        const body = await readJson(request);
        requireMapEditorAccess(request, url, env, collaborationToken, body);
        const editor = editorContext(url);
        json(response, 200, { ok: true, mapId: editor.mapId, ...editor.hub.updatePresence(body) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/dev/map-editor") {
        const body = await readJson(request, MAX_EDITOR_BODY_BYTES);
        requireMapEditorAccess(request, url, env, collaborationToken, body);
        const editor = editorContext(url);
        const validation = validateMapEditorData(body);
        if (!validation.valid) throw Object.assign(new Error(validation.errors[0]), { statusCode: 400, details: { code: "validation", errors: validation.errors } });
        const data = sanitizeMapEditorData(body);
        const result = await editor.hub.replace(data);
        json(response, 200, {
          ok: true,
          mapId: editor.mapId,
          file: path.basename(editor.dataPath),
          revision: result.revision,
          counts: result.counts,
          tiles: result.counts.tiles,
          objects: result.counts.objects,
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/manolin/chat") {
        const body = await readJson(request);
        const message = typeof body.message === "string" ? body.message.trim().slice(0, 320) : "";
        if (!message) { json(response, 400, { error: "Falta lo que ha dicho el jugador" }); return; }
        json(response, 200, await askMiniMax(message, body.history, env));
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith("/api/")) {
        await serveStatic(request, response, url.pathname, appStaticRoot, env);
        return;
      }
      json(response, 404, { error: "No encontrado" });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      if (statusCode >= 500) console.error("Server error:", error?.message || error);
      if (!response.headersSent) json(response, statusCode, { error: error?.message || "Error interno", ...(error?.details || {}) });
      else response.end();
    }
  });
  const closeServer = server.close.bind(server);
  server.close = (callback) => {
    editorHubs.forEach((hub) => hub.close());
    const result = closeServer(callback);
    server.closeIdleConnections?.();
    return result;
  };
  Object.defineProperty(server, "editorCollaborationToken", { value: collaborationToken });
  Object.defineProperty(server, "staticRoot", { value: appStaticRoot });
  return server;
}

const isEntryPoint = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntryPoint) {
  const runtimeEnv = { ...process.env };
  if (process.argv.includes("--collab")) runtimeEnv.GAME_EDITOR_COLLAB = "1";
  if (process.argv.includes("--production")) runtimeEnv.NODE_ENV = "production";
  const profileIndex = process.argv.findIndex((argument) => argument === "--profile");
  const inlineProfile = process.argv.find((argument) => argument.startsWith("--profile="))?.slice("--profile=".length);
  const staticProfile = inlineProfile || (profileIndex >= 0 ? process.argv[profileIndex + 1] : "standard");
  if (runtimeEnv.NODE_ENV === "production" && !["standard", "legacy", "legacy-dev"].includes(staticProfile)) {
    throw new Error(`Perfil de publicación no válido: ${staticProfile}`);
  }
  const collaborationEnabled = editorCollaborationEnabled(runtimeEnv);
  if (collaborationEnabled && !runtimeEnv.GAME_EDITOR_TOKEN) runtimeEnv.GAME_EDITOR_TOKEN = randomBytes(24).toString("base64url");
  const port = Number(runtimeEnv.PORT) || DEFAULT_PORT;
  const host = collaborationEnabled ? runtimeEnv.HOST || "0.0.0.0" : "127.0.0.1";
  const editorDataPath = runtimeEnv.GAME_EDITOR_DATA_PATH ? path.resolve(runtimeEnv.GAME_EDITOR_DATA_PATH) : MAP_EDITOR_DATA_PATH;
  const staticRoot = runtimeEnv.NODE_ENV === "production" ? path.join(ROOT, "dist", staticProfile) : ROOT;
  const server = createAppServer({ env: runtimeEnv, editorDataPath, staticRoot });
  server.listen(port, host, () => {
    if (collaborationEnabled) {
      privateIpv4Addresses().forEach((address) => {
        console.log(`Invitación LAN: http://${address}:${port}/?editorToken=${encodeURIComponent(runtimeEnv.GAME_EDITOR_TOKEN)}`);
      });
    }
    if (collaborationEnabled) console.log(`Modo colaborativo activo · token: ${runtimeEnv.GAME_EDITOR_TOKEN}`);
    console.log(`Pokémon Adventure listo en http://${host}:${port}`);
    console.log(`Manolín: ${process.env.MINIMAX_API_KEY ? process.env.MINIMAX_MODEL || "MiniMax-M3" : "sin MINIMAX_API_KEY"}`);
  });
}
