(function attachAttackEffects(root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const PACK_KIND = "pokemon-city-attack-effects";
  const STORAGE_KEY = "pokemon-city-attack-effects-v1";
  const MOVE_ID_PATTERN = /^[a-z][A-Za-z0-9_-]{0,63}$/;
  const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  const PRESETS = Object.freeze({
    normal: Object.freeze({ name: "Impacto", color: "#f4f7f2", width: 28, height: 28 }),
    fire: Object.freeze({ name: "Llama", color: "#ff6b2c", width: 30, height: 30 }),
    water: Object.freeze({ name: "Agua", color: "#43cbed", width: 34, height: 20 }),
    grass: Object.freeze({ name: "Hoja", color: "#79bd4b", width: 29, height: 24 }),
    electric: Object.freeze({ name: "Rayo", color: "#ffdc3f", width: 28, height: 32 }),
    psychic: Object.freeze({ name: "Psíquico", color: "#df70d5", width: 30, height: 30 }),
    ghost: Object.freeze({ name: "Sombra", color: "#8a62bd", width: 32, height: 32 }),
    dragon: Object.freeze({ name: "Dragón", color: "#7668d8", width: 32, height: 32 }),
    wind: Object.freeze({ name: "Viento", color: "#bcecf4", width: 32, height: 24 }),
    bug: Object.freeze({ name: "Bicho", color: "#9eb946", width: 28, height: 28 }),
    poison: Object.freeze({ name: "Veneno", color: "#a965bc", width: 30, height: 30 }),
    steel: Object.freeze({ name: "Acero", color: "#a9c0c8", width: 30, height: 30 }),
    ground: Object.freeze({ name: "Tierra", color: "#ad7b45", width: 32, height: 26 }),
  });

  const TYPE_PRESETS = Object.freeze({
    Normal: "normal", Fuego: "fire", Agua: "water", Planta: "grass",
    "Eléctrico": "electric", "Psíquico": "psychic", Fantasma: "ghost",
    Siniestro: "ghost", "Dragón": "dragon", Hada: "psychic", Volador: "wind",
    Bicho: "bug", Veneno: "poison", Acero: "steel", Tierra: "ground",
    Roca: "ground", Hielo: "water", Lucha: "normal",
  });

  const IMPACTS = Object.freeze({
    auto: "Automático por tipo",
    none: "Sin sprite de impacto",
    normal: "Impacto normal",
    fire: "Anillo de fuego",
    water: "Remolino de agua",
    electric: "Descarga eléctrica",
  });

  const LIMITS = Object.freeze({
    width: Object.freeze([8, 120]),
    height: Object.freeze([4, 120]),
    offsetX: Object.freeze([-180, 180]),
    offsetY: Object.freeze([-140, 140]),
    duration: Object.freeze([180, 1600]),
    particles: Object.freeze([0, 24]),
    rings: Object.freeze([0, 6]),
    shake: Object.freeze([0, 2]),
    impactScale: Object.freeze([0.5, 5]),
  });

  function clampNumber(value, fallback, [minimum, maximum], integer = false) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const clamped = Math.max(minimum, Math.min(maximum, numeric));
    return integer ? Math.round(clamped) : Math.round(clamped * 100) / 100;
  }

  function normalizeColor(value, fallback) {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return `#${color.slice(1).split("").map((part) => part + part).join("")}`.toLowerCase();
    }
    return fallback;
  }

  function presetForType(type) {
    return TYPE_PRESETS[type] || "normal";
  }

  function defaultProfile(type = "Normal") {
    const preset = presetForType(type);
    const design = PRESETS[preset];
    return {
      enabled: true,
      preset,
      color: design.color,
      width: design.width,
      height: design.height,
      offsetX: 0,
      offsetY: 0,
      duration: 470,
      particles: 9,
      rings: ["electric", "psychic", "ghost", "dragon"].includes(preset) ? 3 : 0,
      shake: ["electric", "dragon", "ground", "steel", "water", "normal"].includes(preset) ? 0.65 : 0.35,
      impact: "auto",
      impactScale: 3.45,
      trail: true,
    };
  }

  function normalizeProfile(value = {}, type = "Normal") {
    const base = defaultProfile(type);
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const preset = owns(PRESETS, source.preset) ? source.preset : base.preset;
    const presetDesign = PRESETS[preset];
    const presetChanged = preset !== base.preset;
    const widthFallback = presetChanged ? presetDesign.width : base.width;
    const heightFallback = presetChanged ? presetDesign.height : base.height;
    const colorFallback = presetChanged ? presetDesign.color : base.color;
    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : base.enabled,
      preset,
      color: normalizeColor(source.color, colorFallback),
      width: clampNumber(source.width, widthFallback, LIMITS.width, true),
      height: clampNumber(source.height, heightFallback, LIMITS.height, true),
      offsetX: clampNumber(source.offsetX, base.offsetX, LIMITS.offsetX, true),
      offsetY: clampNumber(source.offsetY, base.offsetY, LIMITS.offsetY, true),
      duration: clampNumber(source.duration, base.duration, LIMITS.duration, true),
      particles: clampNumber(source.particles, base.particles, LIMITS.particles, true),
      rings: clampNumber(source.rings, base.rings, LIMITS.rings, true),
      shake: clampNumber(source.shake, base.shake, LIMITS.shake),
      impact: owns(IMPACTS, source.impact) ? source.impact : base.impact,
      impactScale: clampNumber(source.impactScale, base.impactScale, LIMITS.impactScale),
      trail: typeof source.trail === "boolean" ? source.trail : base.trail,
    };
  }

  function travelTail(value = {}, type = "Normal") {
    const profile = normalizeProfile(value, type);
    const lastProjectileDelay = ["electric", "psychic", "ghost", "dragon"].includes(profile.preset) ? 70 : 175;
    const lastRingDelay = profile.rings > 0 ? 180 + (profile.rings - 1) * 80 : 0;
    return profile.duration + Math.max(lastProjectileDelay, lastRingDelay);
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function safeJsonClone(value, seen = new WeakSet(), depth = 0) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (!value || typeof value !== "object" || depth >= 32 || seen.has(value)) return undefined;

    seen.add(value);
    if (Array.isArray(value)) {
      const result = value.map((item) => {
        const cloned = safeJsonClone(item, seen, depth + 1);
        return cloned === undefined ? null : cloned;
      });
      seen.delete(value);
      return result;
    }

    const result = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) continue;
      const cloned = safeJsonClone(item, seen, depth + 1);
      if (cloned !== undefined) result[key] = cloned;
    }
    seen.delete(value);
    return result;
  }

  function normalizePack(value, moveTypes = {}) {
    const source = isRecord(value) ? value : {};
    const hasEnvelope = owns(source, "effects");
    const rawEffects = hasEnvelope ? (isRecord(source.effects) ? source.effects : {}) : source;
    const carriedUnknownEffects = isRecord(source.unknownEffects) ? source.unknownEffects : {};
    const allowedMoveIds = isRecord(moveTypes) ? Object.keys(moveTypes) : [];
    const restrictIds = allowedMoveIds.length > 0;
    const effects = Object.create(null);
    const unknownEffects = Object.create(null);
    const ignored = new Set();

    for (const [moveId, profile] of Object.entries(carriedUnknownEffects)) {
      if (!MOVE_ID_PATTERN.test(moveId)) {
        ignored.add(moveId);
        continue;
      }
      if (restrictIds && owns(moveTypes, moveId)) {
        effects[moveId] = normalizeProfile(profile, moveTypes[moveId] || "Normal");
      } else {
        ignored.add(moveId);
        const safeProfile = safeJsonClone(profile);
        if (safeProfile !== undefined) unknownEffects[moveId] = safeProfile;
      }
    }

    for (const [moveId, profile] of Object.entries(rawEffects)) {
      if (!MOVE_ID_PATTERN.test(moveId)) {
        ignored.add(moveId);
        continue;
      }
      if (restrictIds && !owns(moveTypes, moveId)) {
        ignored.add(moveId);
        const safeProfile = safeJsonClone(profile);
        if (safeProfile !== undefined) unknownEffects[moveId] = safeProfile;
        continue;
      }
      ignored.delete(moveId);
      delete unknownEffects[moveId];
      effects[moveId] = normalizeProfile(profile, moveTypes[moveId] || "Normal");
    }
    return { effects, ignored: [...ignored], unknownEffects };
  }

  function parsePack(text, moveTypes = {}) {
    let parsed;
    try {
      parsed = JSON.parse(String(text || ""));
    } catch (error) {
      throw new Error("El archivo no contiene JSON válido.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("El paquete de efectos debe ser un objeto JSON.");
    }
    if (parsed.kind !== PACK_KIND) {
      throw new Error(`El kind del paquete debe ser "${PACK_KIND}".`);
    }
    if (typeof parsed.schemaVersion !== "number" || !Number.isInteger(parsed.schemaVersion)) {
      throw new Error("schemaVersion debe ser un número entero.");
    }
    if (parsed.schemaVersion > SCHEMA_VERSION) {
      throw new Error(`Este paquete usa una versión más nueva (${parsed.schemaVersion}).`);
    }
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`schemaVersion no compatible (${parsed.schemaVersion}).`);
    }
    if (!isRecord(parsed.effects)) {
      throw new Error("La propiedad effects debe ser un objeto JSON.");
    }
    return normalizePack(parsed, moveTypes);
  }

  function serializePack(effects, moveTypes = {}) {
    const source = isRecord(effects) && isRecord(effects.effects) ? effects : { effects };
    const normalized = normalizePack(source, moveTypes);
    const serializedEffects = Object.assign(
      Object.create(null),
      normalized.unknownEffects,
      normalized.effects,
    );
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      kind: PACK_KIND,
      exportedAt: new Date().toISOString(),
      effects: serializedEffects,
    }, null, 2);
  }

  root.AttackEffects = Object.freeze({
    SCHEMA_VERSION,
    PACK_KIND,
    STORAGE_KEY,
    PRESETS,
    IMPACTS,
    LIMITS,
    presetForType,
    defaultProfile,
    normalizeProfile,
    travelTail,
    normalizePack,
    parsePack,
    serializePack,
  });
})(globalThis);
