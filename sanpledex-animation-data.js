(() => {
  "use strict";

  function combatPack(line, slug) {
    const root = `assets/pokemon/${line}`;
    const melee = Object.freeze({
      front: `${root}/${slug}-attack-melee-front-pixellab.webp`,
      back: `${root}/${slug}-attack-melee-back-pixellab.webp`,
      pose: Object.freeze({
        front: `${root}/${slug}-attack-melee-front-pixellab.png`,
        back: `${root}/${slug}-attack-melee-back-pixellab.png`,
      }),
      durationMs: 840,
      impactMs: 620,
    });
    const ranged = Object.freeze({
      front: `${root}/${slug}-attack-ranged-front-pixellab.webp`,
      back: `${root}/${slug}-attack-ranged-back-pixellab.webp`,
      pose: Object.freeze({
        front: `${root}/${slug}-attack-ranged-front-pixellab.png`,
        back: `${root}/${slug}-attack-ranged-back-pixellab.png`,
      }),
      durationMs: 840,
      impactMs: 620,
    });
    return Object.freeze({
      idle: Object.freeze({
        front: `${root}/${slug}-idle-front-pixellab.webp`,
        back: `${root}/${slug}-idle-back-pixellab.webp`,
      }),
      attack: Object.freeze({ front: melee.front, back: melee.back }),
      pose: melee.pose,
      attacks: Object.freeze({ melee, ranged }),
      frameCount: 8,
      idleFrameMs: 120,
      attackFrameMs: 90,
      durationMs: 840,
      impactMs: 620,
    });
  }

  globalThis.SANPLEDEX_ANIMATION_ASSETS = Object.freeze({
    4: Object.freeze({
      idle: Object.freeze({
        front: "assets/pokemon/braspy-line/braspin-idle-front-pixellab.webp",
        back: "assets/pokemon/braspy-line/braspin-idle-back-pixellab.webp",
      }),
      attack: Object.freeze({
        front: "assets/pokemon/braspy-line/braspin-attack-melee-front-pixellab.webp",
        back: "assets/pokemon/braspy-line/braspin-attack-melee-back-pixellab.webp",
      }),
      pose: Object.freeze({
        front: "assets/pokemon/braspy-line/braspin-attack-melee-front-pixellab.png",
        back: "assets/pokemon/braspy-line/braspin-attack-melee-back-pixellab.png",
      }),
      attacks: Object.freeze({
        melee: Object.freeze({
          front: "assets/pokemon/braspy-line/braspin-attack-melee-front-pixellab.webp",
          back: "assets/pokemon/braspy-line/braspin-attack-melee-back-pixellab.webp",
          pose: Object.freeze({
            front: "assets/pokemon/braspy-line/braspin-attack-melee-front-pixellab.png",
            back: "assets/pokemon/braspy-line/braspin-attack-melee-back-pixellab.png",
          }),
          durationMs: 840,
          impactMs: 620,
        }),
        ranged: Object.freeze({
          front: "assets/pokemon/braspy-line/braspin-attack-ranged-front-pixellab.webp",
          back: "assets/pokemon/braspy-line/braspin-attack-ranged-back-pixellab.webp",
          pose: Object.freeze({
            front: "assets/pokemon/braspy-line/braspin-attack-ranged-front-pixellab.png",
            back: "assets/pokemon/braspy-line/braspin-attack-ranged-back-pixellab.png",
          }),
          durationMs: 840,
          impactMs: 620,
        }),
      }),
      frameCount: 8,
      idleFrameMs: 120,
      attackFrameMs: 90,
      durationMs: 840,
      impactMs: 620,
    }),
    5: combatPack("braspy-line", "ascuero"),
    6: combatPack("braspy-line", "volcazote"),
    9001: combatPack("petrillo-line", "petrillo"),
    9002: combatPack("petrillo-line", "musgolem"),
    9003: combatPack("petrillo-line", "terravordeo"),
    9101: combatPack("peyote-line", "peyote"),
    9102: combatPack("peyote-line", "prensalito"),
    9201: combatPack("dracoscama-line", "criascama"),
    9202: combatPack("dracoscama-line", "aliscama"),
    9203: combatPack("dracoscama-line", "dracoscama"),
  });
})();
