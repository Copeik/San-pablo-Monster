(function installMapEditorRules(root) {
  "use strict";

  if (root.MAP_EDITOR_RULES?.version === 6) return;

  root.MAP_EDITOR_RULES = Object.freeze({
    version: 6,
    world: Object.freeze({
      width: 2508,
      height: 2508,
      tileSize: 32,
      cols: Math.ceil(2508 / 32),
      rows: Math.ceil(2508 / 32),
      minCols: 12,
      minRows: 12,
      maxWidth: 4096,
      maxHeight: 4096,
      maxCols: 128,
      maxRows: 128,
    }),
    types: Object.freeze({
      terrain: Object.freeze(["walkable", "blocked", "door", "encounter", "event"]),
      ground: Object.freeze([
        "grass", "dirt", "asphalt", "sidewalk", "plaza", "sand",
        "path-grass", "path-dirt", "path-asphalt", "path-sidewalk", "path-plaza", "path-sand",
        "interior-oak-honey", "interior-walnut-dark", "interior-parquet-herringbone",
        "interior-ceramic-cream", "interior-ceramic-blue", "interior-terracotta",
        "interior-stone-light", "interior-stone-dark", "interior-laboratory-mint",
        "interior-clinic-white", "interior-carpet-beige", "interior-carpet-red",
        "interior-wood-amber", "interior-wood-farmhouse", "interior-kitchen-checker",
        "interior-carpet-lavender",
      ]),
      event: Object.freeze([
        "dialogue", "thought", "computer", "letter", "pickup", "heal", "switch", "sound",
        "vibration", "teleport", "transition",
      ]),
      trigger: Object.freeze(["interact", "step"]),
      eventItem: Object.freeze([
        "balls", "potions", "maxPotions", "berries", "ultraBalls", "masterBalls",
        "rareCandies", "prismBatteries", "prismShards", "money",
      ]),
      jingle: Object.freeze(["success", "capture", "level", "encounter", "lose"]),
      entranceAction: Object.freeze(["transition", "exit", "house", "heal", "shop", "lab", "route", "closed", "prism"]),
      direction: Object.freeze(["up", "down", "left", "right"]),
      effect: Object.freeze(["fade", "flash", "none"]),
    }),
    lengths: Object.freeze({
      id: 80,
      label: 120,
      assetLabel: 80,
      npcName: 80,
      npcLines: 12,
      npcLine: 500,
      eventMessage: 1000,
      actorName: 32,
    }),
    ranges: Object.freeze({
      scale: Object.freeze([0.25, 4]),
      rotation: Object.freeze([-360, 360]),
      depthY: Object.freeze([-4096, 8192]),
      patrolSpeed: Object.freeze([0.05, 10]),
      duration: Object.freeze([0, 60000]),
      intensity: Object.freeze([0, 10]),
      itemAmount: Object.freeze([1, 99]),
      targetCoordinate: Object.freeze([0, 100000]),
    }),
    limits: Object.freeze({
      operationsPerBatch: 256,
      historyCommands: 80,
      tileOverrides: 65536,
      groundOverrides: 65536,
      assetOverrides: 1000,
      addedAssets: 500,
      hiddenAssets: 1000,
      npcOverrides: 500,
      addedNpcs: 500,
      hiddenNpcs: 1000,
      entrances: 500,
      events: 1000,
    }),
    timing: Object.freeze({
      presenceMovementMs: 50,
      presenceHeartbeatMs: 12000,
      flushDelayMs: 50,
      reconnectMaximumMs: 30000,
    }),
  });
})(globalThis);
