(() => {
  "use strict";

  const CATEGORY_DEFINITIONS = Object.freeze([
    Object.freeze({ id: "city", label: "Ciudad", icon: "▦" }),
    Object.freeze({ id: "exploration", label: "Exploración", icon: "⌁" }),
    Object.freeze({ id: "venues", label: "Recintos", icon: "◆" }),
    Object.freeze({ id: "battle", label: "Combate", icon: "⚔" }),
    Object.freeze({ id: "events", label: "Eventos", icon: "✦" }),
  ]);

  const RHYTHMS = Object.freeze({
    stroll: [
      "K - H - S - H - K - H - S - H -",
      "K - H H S - H - K - H - S H H -",
      "K - H - S - H - K H H - S - H -",
      "K - H H S - H - K - H H S H H -",
    ],
    journey: [
      "K H H - S H H - K H H - S H H -",
      "K H H - S H H H K H K - S H H -",
      "K H H - S H H - K H H H S H H -",
      "K H K - S H H - K H H - S H H H",
    ],
    mystery: [
      "K - - H S - H - K - - H S - H -",
      "K - H - S - - H K - H - S H H -",
      "K - - H S - H - K H - H S - H -",
      "K - H - S - H H K - - H S H H -",
    ],
    arena: [
      "K H H K S H K H K H H K S H K H",
      "K H K H S H K H K K H H S H K H",
      "K H H K S H K H K H K K S H K H",
      "K K H H S H K H K H H K S K H H",
    ],
    danger: [
      "K H K H S H K H K H K H S H K H",
      "K H K K S H K H K K H K S H K H",
      "K K H H S H K K K H K H S K H H",
      "K H K K S K H H K K H K S K H H",
    ],
    sparkle: [
      "K - H H S - H H K - H H S - H H",
      "K H H - S H H - K H H - S H H H",
      "K - H H S H H - K - H H S H H -",
      "K H H H S H H - K H H H S H K H",
    ],
  });

  const repeat = (bar) => [bar, bar, bar, bar];
  const alternate = (first, second) => [first, second, first, second];
  const tokens = (bars) => (Array.isArray(bars) ? bars : [bars])
    .flatMap((bar) => String(bar || "").trim().split(/\s+/).filter(Boolean));

  function defineTrack(config) {
    const rawChannels = {
      lead: tokens(config.lead),
      harmony: tokens(config.harmony),
      bass: tokens(config.bass),
      drums: tokens(config.drums),
    };
    const steps = Math.max(64, ...Object.values(rawChannels).map((channel) => channel.length));
    const channels = {};
    Object.entries(rawChannels).forEach(([name, channel]) => {
      const normalized = channel.slice(0, steps);
      while (normalized.length < steps) normalized.push("-");
      channels[name] = Object.freeze(normalized);
    });
    return Object.freeze({
      id: config.id,
      title: config.title,
      category: config.category,
      scene: config.scene,
      bpm: config.bpm,
      color: config.color,
      steps,
      bars: steps / 16,
      channels: Object.freeze(channels),
    });
  }

  const TRACKS = Object.freeze([
    defineTrack({
      id: "city-azahar", title: "Azahar al amanecer", category: "city", scene: "Ciudad luminosa", bpm: 116, color: "#f4a83d",
      lead: [
        "E5 - G5 - A5 ~ G5 - E5 - D5 - C5 ~ D5 -",
        "E5 - G5 - B5 ~ A5 - G5 - E5 - D5 ~ E5 -",
        "C5 - E5 - G5 ~ E5 - A5 - G5 - E5 ~ D5 -",
        "F5 - E5 - D5 - C5 - D5 - E5 - G5 ~ E5 -",
      ],
      harmony: alternate("C4 E4 G4 E4 C4 E4 G4 E4 D4 F4 A4 F4 D4 F4 A4 F4", "E4 G4 B4 G4 E4 G4 B4 G4 C4 E4 A4 E4 C4 E4 A4 E4"),
      bass: alternate("C3 - C3 G2 C3 - E3 G2 D3 - D3 A2 D3 - F3 A2", "E3 - E3 B2 E3 - G3 B2 C3 - C3 G2 C3 - E3 G2"),
      drums: RHYTHMS.stroll,
    }),
    defineTrack({
      id: "city-san-pablo", title: "Tarde en San Pablo", category: "city", scene: "Barrio y plazas", bpm: 108, color: "#e36e4f",
      lead: [
        "G4 - C5 - D5 ~ E5 - G5 - E5 - D5 ~ C5 -",
        "A4 - C5 - E5 ~ D5 - C5 - A4 - G4 ~ A4 -",
        "C5 - D5 - E5 - G5 - A5 - G5 - E5 ~ D5 -",
        "F5 - E5 - D5 - C5 - A4 - B4 - C5 ~ ~ -",
      ],
      harmony: alternate("C4 G4 E4 G4 C4 G4 E4 G4 A3 E4 C4 E4 A3 E4 C4 E4", "F3 C4 A3 C4 G3 D4 B3 D4 C4 G4 E4 G4 C4 G4 E4 G4"),
      bass: alternate("C3 - G2 - A2 - E2 - F2 - C3 - G2 - D3 -", "A2 - E3 - F2 - C3 - G2 - D3 - C3 ~ ~ -"),
      drums: RHYTHMS.stroll,
    }),
    defineTrack({
      id: "city-night", title: "Farolas de medianoche", category: "city", scene: "Ciudad nocturna", bpm: 92, color: "#6b6ecf",
      lead: [
        "A4 ~ - C5 - E5 ~ - G5 - E5 - C5 ~ - -",
        "B4 ~ - D5 - Fs5 ~ - A5 - Fs5 - D5 ~ - -",
        "G4 ~ - B4 - D5 ~ - Fs5 - E5 - D5 ~ - -",
        "E5 - D5 - B4 ~ A4 - C5 - B4 - A4 ~ ~ -",
      ],
      harmony: alternate("A3 E4 C4 E4 A3 E4 C4 E4 G3 D4 B3 D4 G3 D4 B3 D4", "B3 Fs4 D4 Fs4 B3 Fs4 D4 Fs4 E3 B3 G3 B3 E3 B3 G3 B3"),
      bass: alternate("A2 - - E2 A2 - - E2 G2 - - D2 G2 - - D2", "B2 - - Fs2 B2 - - Fs2 E2 - - B2 E2 - - B2"),
      drums: RHYTHMS.mystery,
    }),
    defineTrack({
      id: "pokemon-center", title: "Descanso carmesí", category: "city", scene: "Centro de salud", bpm: 84, color: "#df5a69",
      lead: [
        "C5 - E5 - G5 ~ E5 - F5 - A5 - G5 ~ - -",
        "D5 - F5 - A5 ~ F5 - E5 - G5 - C6 ~ - -",
        "G5 - E5 - C5 ~ D5 - F5 - E5 - D5 ~ - -",
        "C5 - E5 - G5 - C6 - B5 - G5 - C6 ~ ~ -",
      ],
      harmony: alternate("C4 E4 G4 E4 C4 E4 G4 E4 F4 A4 C5 A4 F4 A4 C5 A4", "D4 F4 A4 F4 D4 F4 A4 F4 C4 E4 G4 E4 C4 E4 G4 E4"),
      bass: alternate("C3 - - G2 C3 - - G2 F2 - - C3 F2 - - C3", "D3 - - A2 D3 - - A2 C3 - - G2 C3 - - G2"),
      drums: repeat("K - - H S - - H K - - H S - H -"),
    }),
    defineTrack({
      id: "route-first", title: "Primer sendero", category: "exploration", scene: "Ruta de aventura", bpm: 128, color: "#62a64e",
      lead: [
        "G5 - E5 - C5 - D5 - E5 - G5 - A5 ~ G5 -",
        "E5 - D5 - C5 - E5 - G5 - C6 - B5 ~ G5 -",
        "A5 - G5 - E5 - D5 - C5 - D5 - E5 ~ G5 -",
        "F5 - A5 - G5 - E5 - D5 - B4 - C5 ~ ~ -",
      ],
      harmony: alternate("C4 G4 E4 G4 C4 G4 E4 G4 F4 C5 A4 C5 F4 C5 A4 C5", "A3 E4 C4 E4 A3 E4 C4 E4 G3 D4 B3 D4 G3 D4 B3 D4"),
      bass: alternate("C3 - G2 C3 E3 - G2 C3 F2 - C3 F2 A2 - C3 F2", "A2 - E3 A2 C3 - E3 A2 G2 - D3 G2 B2 - D3 G2"),
      drums: RHYTHMS.journey,
    }),
    defineTrack({
      id: "forest-whisper", title: "Bosque de 8 bits", category: "exploration", scene: "Bosque antiguo", bpm: 104, color: "#28765a",
      lead: [
        "E5 ~ G5 - B5 - G5 - Fs5 ~ E5 - D5 ~ - -",
        "G5 ~ B5 - D6 - B5 - A5 ~ G5 - E5 ~ - -",
        "D5 - E5 - G5 ~ A5 - B5 - A5 - G5 ~ E5 -",
        "Fs5 - E5 - D5 ~ B4 - D5 - E5 - G5 ~ - -",
      ],
      harmony: alternate("E4 B4 G4 B4 E4 B4 G4 B4 D4 A4 Fs4 A4 D4 A4 Fs4 A4", "G4 D5 B4 D5 G4 D5 B4 D5 E4 B4 G4 B4 E4 B4 G4 B4"),
      bass: alternate("E2 - B2 - E3 - B2 - D2 - A2 - D3 - A2 -", "G2 - D3 - G3 - D3 - E2 - B2 - E3 - B2 -"),
      drums: RHYTHMS.mystery,
    }),
    defineTrack({
      id: "coast-breeze", title: "Costa pixelada", category: "exploration", scene: "Mar y paseo", bpm: 112, color: "#3c9fc7",
      lead: [
        "D5 - Fs5 - A5 ~ Fs5 - E5 - D5 - B4 ~ D5 -",
        "E5 - G5 - B5 ~ A5 - G5 - E5 - D5 ~ E5 -",
        "Fs5 - A5 - D6 ~ A5 - G5 - Fs5 - E5 ~ D5 -",
        "B4 - D5 - E5 - Fs5 - A5 - G5 - Fs5 ~ ~ -",
      ],
      harmony: alternate("D4 A4 Fs4 A4 D4 A4 Fs4 A4 B3 Fs4 D4 Fs4 B3 Fs4 D4 Fs4", "E4 B4 G4 B4 E4 B4 G4 B4 A3 E4 Cs4 E4 A3 E4 Cs4 E4"),
      bass: alternate("D3 - A2 D3 Fs3 - A2 D3 B2 - Fs3 B2 D3 - Fs3 B2", "E3 - B2 E3 G3 - B2 E3 A2 - E3 A2 Cs3 - E3 A2"),
      drums: RHYTHMS.stroll,
    }),
    defineTrack({
      id: "crystal-cave", title: "Ecos de cristal", category: "exploration", scene: "Cueva resonante", bpm: 88, color: "#6da7c9",
      lead: [
        "C5 ~ - G5 - Ds5 ~ - C5 - D5 - G4 ~ - -",
        "D5 ~ - A5 - F5 ~ - D5 - Ds5 - A4 ~ - -",
        "G4 - C5 - Ds5 ~ G5 - Fs5 - Ds5 - C5 ~ - -",
        "A4 - C5 - D5 ~ Ds5 - D5 - C5 - G4 ~ ~ -",
      ],
      harmony: alternate("C4 G4 Ds4 G4 C4 G4 Ds4 G4 D4 A4 F4 A4 D4 A4 F4 A4", "G3 D4 As3 D4 G3 D4 As3 D4 C4 G4 Ds4 G4 C4 G4 Ds4 G4"),
      bass: alternate("C2 - - G2 C3 - - G2 D2 - - A2 D3 - - A2", "G2 - - D2 G2 - - D2 C2 - - G2 C3 - - G2"),
      drums: RHYTHMS.mystery,
    }),
    defineTrack({
      id: "grand-stadium", title: "Estadio del trueno", category: "venues", scene: "Estadio y gradas", bpm: 142, color: "#d9a829",
      lead: [
        "E5 E5 - G5 A5 - B5 - E6 - B5 - A5 G5 E5 -",
        "Fs5 Fs5 - A5 B5 - Cs6 - Fs6 - Cs6 - B5 A5 Fs5 -",
        "A5 - G5 - E5 E5 G5 - B5 - A5 - G5 E5 D5 -",
        "C6 - B5 - A5 - G5 - E5 - G5 - B5 ~ ~ -",
      ],
      harmony: alternate("E4 B4 E5 B4 E4 B4 E5 B4 A3 E4 A4 E4 A3 E4 A4 E4", "Fs4 Cs5 Fs5 Cs5 Fs4 Cs5 Fs5 Cs5 B3 Fs4 B4 Fs4 B3 Fs4 B4 Fs4"),
      bass: alternate("E2 E3 B2 E3 E2 E3 B2 E3 A2 A3 E3 A3 A2 A3 E3 A3", "Fs2 Fs3 Cs3 Fs3 Fs2 Fs3 Cs3 Fs3 B2 B3 Fs3 B3 B2 B3 Fs3 B3"),
      drums: RHYTHMS.arena,
    }),
    defineTrack({
      id: "gym-puzzle", title: "Desafío del gimnasio", category: "venues", scene: "Pruebas y mecanismos", bpm: 122, color: "#8967c4",
      lead: [
        "D5 - F5 G5 A5 - F5 - D5 - A4 C5 D5 ~ - -",
        "E5 - G5 A5 B5 - G5 - E5 - B4 D5 E5 ~ - -",
        "F5 - A5 - C6 - A5 - G5 - E5 - D5 ~ C5 -",
        "D5 F5 A5 C6 D6 - C6 - A5 - G5 - F5 ~ D5 -",
      ],
      harmony: alternate("D4 A4 F4 A4 D4 A4 F4 A4 C4 G4 E4 G4 C4 G4 E4 G4", "E4 B4 G4 B4 E4 B4 G4 B4 D4 A4 Fs4 A4 D4 A4 Fs4 A4"),
      bass: alternate("D2 D3 A2 D3 D2 D3 A2 D3 C2 C3 G2 C3 C2 C3 G2 C3", "E2 E3 B2 E3 E2 E3 B2 E3 D2 D3 A2 D3 D2 D3 A2 D3"),
      drums: RHYTHMS.journey,
    }),
    defineTrack({
      id: "professor-lab", title: "Laboratorio curioso", category: "venues", scene: "Laboratorio Pokémon", bpm: 126, color: "#49a592",
      lead: [
        "C5 E5 G5 - B5 G5 E5 - D5 Fs5 A5 - C6 A5 Fs5 -",
        "E5 G5 B5 - D6 B5 G5 - F5 A5 C6 - E6 C6 A5 -",
        "G5 - E5 G5 C6 - G5 - A5 - F5 A5 D6 - A5 -",
        "B5 A5 G5 E5 Fs5 - D5 - E5 G5 B5 - C6 ~ ~ -",
      ],
      harmony: alternate("C4 G4 E4 G4 B3 Fs4 D4 Fs4 C4 G4 E4 G4 B3 Fs4 D4 Fs4", "E4 B4 G4 B4 D4 A4 F4 A4 E4 B4 G4 B4 D4 A4 F4 A4"),
      bass: alternate("C3 - G2 C3 B2 - Fs2 B2 C3 - G2 C3 B2 - Fs2 B2", "E3 - B2 E3 D3 - A2 D3 E3 - B2 E3 D3 - A2 D3"),
      drums: RHYTHMS.sparkle,
    }),
    defineTrack({
      id: "ancient-ruins", title: "Ruinas del cartucho", category: "venues", scene: "Ruinas y subterráneos", bpm: 78, color: "#82745f",
      lead: [
        "D5 ~ - F5 - E5 ~ - C5 ~ - A4 - C5 ~ -",
        "E5 ~ - G5 - Fs5 ~ - D5 ~ - B4 - D5 ~ -",
        "A4 - C5 - D5 ~ F5 - E5 ~ D5 - C5 ~ - -",
        "B4 - D5 - E5 ~ G5 - F5 - E5 - D5 ~ ~ -",
      ],
      harmony: alternate("D4 A4 F4 A4 D4 A4 F4 A4 C4 G4 E4 G4 C4 G4 E4 G4", "E4 B4 G4 B4 E4 B4 G4 B4 D4 A4 Fs4 A4 D4 A4 Fs4 A4"),
      bass: alternate("D2 - - A2 D3 - - A2 C2 - - G2 C3 - - G2", "E2 - - B2 E3 - - B2 D2 - - A2 D3 - - A2"),
      drums: RHYTHMS.mystery,
    }),
    defineTrack({
      id: "battle-wild", title: "¡Aparece una criatura!", category: "battle", scene: "Combate salvaje", bpm: 154, color: "#d95747",
      lead: [
        "E5 G5 A5 B5 E6 - D6 B5 C6 - B5 G5 A5 Fs5 G5 -",
        "F5 A5 As5 C6 F6 - Ds6 C6 D6 - C6 A5 As5 G5 A5 -",
        "B5 B5 A5 G5 E5 G5 A5 B5 C6 C6 B5 A5 G5 E5 Fs5 -",
        "G5 A5 B5 D6 E6 D6 B5 A5 G5 Fs5 E5 D5 E5 ~ ~ -",
      ],
      harmony: alternate("E4 B4 E5 B4 G4 D5 G5 D5 A4 E5 A5 E5 B4 Fs5 B5 Fs5", "F4 C5 F5 C5 A4 E5 A5 E5 As4 F5 As5 F5 C5 G5 C6 G5"),
      bass: alternate("E2 E3 E2 B2 E2 E3 G2 B2 A2 A3 A2 E3 B2 B3 B2 Fs3", "F2 F3 F2 C3 F2 F3 A2 C3 As2 As3 As2 F3 C3 C4 C3 G3"),
      drums: RHYTHMS.danger,
    }),
    defineTrack({
      id: "battle-trainer", title: "Duelo de entrenadores", category: "battle", scene: "Combate de entrenador", bpm: 148, color: "#cf7445",
      lead: [
        "D5 D5 F5 A5 D6 - C6 A5 B5 - A5 F5 G5 E5 F5 -",
        "E5 E5 G5 B5 E6 - D6 B5 C6 - B5 G5 A5 Fs5 G5 -",
        "A5 - F5 A5 D6 C6 A5 F5 G5 - E5 G5 C6 B5 G5 E5",
        "F5 G5 A5 C6 D6 C6 A5 G5 F5 E5 D5 C5 D5 ~ ~ -",
      ],
      harmony: alternate("D4 A4 D5 A4 F4 C5 F5 C5 G4 D5 G5 D5 A4 E5 A5 E5", "E4 B4 E5 B4 G4 D5 G5 D5 A4 E5 A5 E5 B4 Fs5 B5 Fs5"),
      bass: alternate("D2 D3 A2 D3 F2 F3 C3 F3 G2 G3 D3 G3 A2 A3 E3 A3", "E2 E3 B2 E3 G2 G3 D3 G3 A2 A3 E3 A3 B2 B3 Fs3 B3"),
      drums: RHYTHMS.arena,
    }),
    defineTrack({
      id: "battle-rival", title: "Rival a toda velocidad", category: "battle", scene: "Combate de rival", bpm: 168, color: "#3f86c5",
      lead: [
        "A4 C5 E5 A5 G5 E5 C5 E5 A5 C6 B5 A5 G5 E5 D5 E5",
        "B4 D5 Fs5 B5 A5 Fs5 D5 Fs5 B5 D6 Cs6 B5 A5 Fs5 E5 Fs5",
        "C6 B5 A5 G5 E5 G5 A5 C6 D6 C6 B5 A5 G5 E5 Fs5 G5",
        "A5 G5 E5 D5 C5 E5 G5 A5 C6 B5 A5 G5 E5 ~ ~ -",
      ],
      harmony: alternate("A3 E4 A4 E4 C4 G4 C5 G4 E4 B4 E5 B4 G4 D5 G5 D5", "B3 Fs4 B4 Fs4 D4 A4 D5 A4 Fs4 Cs5 Fs5 Cs5 A4 E5 A5 E5"),
      bass: alternate("A2 A3 E3 A3 C3 C4 G3 C4 E2 E3 B2 E3 G2 G3 D3 G3", "B2 B3 Fs3 B3 D3 D4 A3 D4 Fs2 Fs3 Cs3 Fs3 A2 A3 E3 A3"),
      drums: RHYTHMS.danger,
    }),
    defineTrack({
      id: "battle-gym-leader", title: "Líder del gimnasio", category: "battle", scene: "Combate de medalla", bpm: 144, color: "#b04fbb",
      lead: [
        "C5 - C6 B5 G5 - E5 G5 As5 - A5 F5 D5 - G5 -",
        "D5 - D6 C6 A5 - Fs5 A5 C6 - B5 G5 E5 - A5 -",
        "E6 Ds6 B5 G5 A5 B5 C6 D6 E6 D6 C6 B5 A5 G5 Fs5 E5",
        "G5 B5 D6 F6 E6 D6 C6 B5 A5 G5 F5 D5 E5 ~ ~ -",
      ],
      harmony: alternate("C4 G4 C5 G4 E4 B4 E5 B4 As3 F4 As4 F4 G3 D4 G4 D4", "D4 A4 D5 A4 Fs4 Cs5 Fs5 Cs5 C4 G4 C5 G4 A3 E4 A4 E4"),
      bass: alternate("C2 C3 G2 C3 E2 E3 B2 E3 As2 As3 F3 As3 G2 G3 D3 G3", "D2 D3 A2 D3 Fs2 Fs3 Cs3 Fs3 C2 C3 G2 C3 A2 A3 E3 A3"),
      drums: RHYTHMS.arena,
    }),
    defineTrack({
      id: "battle-prism-boss", title: "Señor del prisma", category: "battle", scene: "Jefe dimensional", bpm: 132, color: "#5ad0cf",
      lead: [
        "C5 Cs5 G5 Cs5 C6 B5 G5 E5 Ds5 E5 B5 E5 D6 C6 G5 E5",
        "D5 Ds5 A5 Ds5 D6 Cs6 A5 Fs5 F5 Fs5 Cs6 Fs5 E6 D6 A5 Fs5",
        "G5 - Cs6 C6 G5 - E5 Ds5 G5 - B5 As5 E5 - Ds5 E5",
        "C6 B5 G5 E5 Ds5 E5 G5 B5 C6 D6 Ds6 D6 C6 B5 G5 ~",
      ],
      harmony: alternate("C4 G4 Cs5 G4 E4 B4 C5 B4 Ds4 As4 E5 As4 E4 B4 Fs5 B4", "D4 A4 Ds5 A4 Fs4 Cs5 D5 Cs5 F4 C5 Fs5 C5 Fs4 Cs5 G5 Cs5"),
      bass: alternate("C2 C3 Cs2 Cs3 E2 E3 Ds2 Ds3 E2 E3 Fs2 Fs3 G2 G3 E2 E3", "D2 D3 Ds2 Ds3 Fs2 Fs3 F2 F3 Fs2 Fs3 G2 G3 A2 A3 Fs2 Fs3"),
      drums: RHYTHMS.danger,
    }),
    defineTrack({
      id: "title-adventure", title: "Pulsa Start: aventura", category: "events", scene: "Inicio de aventura", bpm: 124, color: "#f0c441",
      lead: [
        "C5 - E5 G5 C6 ~ G5 - A5 - G5 E5 D5 ~ E5 -",
        "D5 - F5 A5 D6 ~ A5 - B5 - A5 F5 E5 ~ F5 -",
        "E5 G5 C6 E6 D6 C6 B5 G5 A5 C6 E6 D6 C6 B5 G5 E5",
        "F5 A5 C6 F6 E6 D6 C6 B5 C6 G5 E5 D5 C5 ~ ~ -",
      ],
      harmony: alternate("C4 G4 E4 G4 C4 G4 E4 G4 A3 E4 C4 E4 A3 E4 C4 E4", "D4 A4 F4 A4 D4 A4 F4 A4 B3 Fs4 D4 Fs4 B3 Fs4 D4 Fs4"),
      bass: alternate("C3 - G2 C3 E3 - G2 C3 A2 - E3 A2 C3 - E3 A2", "D3 - A2 D3 F3 - A2 D3 B2 - Fs3 B2 D3 - Fs3 B2"),
      drums: RHYTHMS.journey,
    }),
    defineTrack({
      id: "evolution-spark", title: "Chispa de evolución", category: "events", scene: "Evolución y descubrimiento", bpm: 136, color: "#75cfe8",
      lead: [
        "C5 E5 G5 C6 E6 C6 G5 E5 D5 Fs5 A5 D6 Fs6 D6 A5 Fs5",
        "E5 Gs5 B5 E6 Gs6 E6 B5 Gs5 Fs5 A5 Cs6 Fs6 A6 Fs6 Cs6 A5",
        "G5 B5 D6 G6 Fs6 D6 B5 G5 A5 C6 E6 A6 G6 E6 C6 A5",
        "B5 D6 G6 B6 A6 G6 E6 D6 C6 B5 G5 E5 C6 ~ ~ -",
      ],
      harmony: alternate("C4 G4 E4 G4 C4 G4 E4 G4 D4 A4 Fs4 A4 D4 A4 Fs4 A4", "E4 B4 Gs4 B4 E4 B4 Gs4 B4 Fs4 Cs5 A4 Cs5 Fs4 Cs5 A4 Cs5"),
      bass: alternate("C3 G3 E3 G3 C3 G3 E3 G3 D3 A3 Fs3 A3 D3 A3 Fs3 A3", "E3 B3 Gs3 B3 E3 B3 Gs3 B3 Fs3 Cs4 A3 Cs4 Fs3 Cs4 A3 Cs4"),
      drums: RHYTHMS.sparkle,
    }),
    defineTrack({
      id: "victory-fanfare", title: "Victoria de bolsillo", category: "events", scene: "Victoria y captura", bpm: 152, color: "#efc64c",
      lead: [
        "C5 E5 G5 C6 - G5 C6 E6 - D6 C6 B5 A5 G5 E5 -",
        "F5 A5 C6 F6 - C6 F6 A6 - G6 F6 E6 D6 C6 A5 -",
        "G5 B5 D6 G6 - D6 G6 B6 A6 G6 Fs6 E6 D6 B5 G5 -",
        "C6 E6 G6 C7 B6 G6 E6 C6 D6 G6 B6 D7 C7 ~ ~ -",
      ],
      harmony: alternate("C4 G4 E4 G4 C4 G4 E4 G4 A3 E4 C4 E4 G3 D4 B3 D4", "F4 C5 A4 C5 F4 C5 A4 C5 D4 A4 F4 A4 C4 G4 E4 G4"),
      bass: alternate("C3 C4 G3 C4 C3 C4 G3 C4 A2 A3 E3 A3 G2 G3 D3 G3", "F3 F4 C4 F4 F3 F4 C4 F4 D3 D4 A3 D4 C3 C4 G3 C4"),
      drums: RHYTHMS.sparkle,
    }),
  ]);

  const TRACK_BY_ID = new Map(TRACKS.map((track) => [track.id, track]));

  function noteFrequency(token) {
    const match = /^([A-G])([s#b]?)(-?\d)$/.exec(String(token || ""));
    if (!match) return 0;
    const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const accidental = match[2] === "b" ? -1 : match[2] ? 1 : 0;
    const midi = (Number(match[3]) + 1) * 12 + semitones[match[1]] + accidental;
    return 440 * (2 ** ((midi - 69) / 12));
  }

  class ChiptunePlayer {
    constructor(options = {}) {
      this.getAudioContext = options.getAudioContext;
      this.volume = Number.isFinite(options.volume) ? options.volume : 0.085;
      this.lookAhead = 0.14;
      this.intervalMs = 28;
      this.currentTrack = null;
      this.context = null;
      this.master = null;
      this.output = null;
      this.timer = 0;
      this.nextStepAt = 0;
      this.step = 0;
      this.activeNodes = new Set();
      this.noiseBuffer = null;
    }

    play(trackId) {
      const track = TRACK_BY_ID.get(trackId);
      if (!track || typeof this.getAudioContext !== "function") return false;
      if (this.currentTrack?.id === track.id && this.timer) return true;
      const context = this.getAudioContext();
      if (!context) return false;
      this.stop();
      this.context = context;
      this.currentTrack = track;
      this.master = context.createGain();
      this.master.gain.setValueAtTime(0.0001, context.currentTime);
      this.master.gain.exponentialRampToValueAtTime(this.volume, context.currentTime + 0.08);
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      this.master.connect(compressor);
      compressor.connect(context.destination);
      this.output = compressor;
      this.nextStepAt = context.currentTime + 0.04;
      this.step = 0;
      this.schedule();
      this.timer = globalThis.setInterval(() => this.schedule(), this.intervalMs);
      return true;
    }

    stop() {
      if (this.timer) globalThis.clearInterval(this.timer);
      this.timer = 0;
      this.activeNodes.forEach((node) => {
        try { node.stop(); } catch (error) { /* The node may already have ended. */ }
        try { node.disconnect(); } catch (error) { /* Optional cleanup. */ }
      });
      this.activeNodes.clear();
      if (this.master) {
        try { this.master.disconnect(); } catch (error) { /* Optional cleanup. */ }
      }
      if (this.output) {
        try { this.output.disconnect(); } catch (error) { /* Optional cleanup. */ }
      }
      this.master = null;
      this.output = null;
      this.currentTrack = null;
      this.noiseBuffer = null;
    }

    schedule() {
      const track = this.currentTrack;
      const context = this.context;
      if (!track || !context || !this.master) return;
      const stepDuration = 60 / track.bpm / 4;
      while (this.nextStepAt < context.currentTime + this.lookAhead) {
        this.scheduleStep(track, this.step, this.nextStepAt, stepDuration);
        this.step = (this.step + 1) % track.steps;
        this.nextStepAt += stepDuration;
      }
    }

    sustainSteps(channel, step) {
      let count = 1;
      while (count < 8 && channel[(step + count) % channel.length] === "~") count += 1;
      return count;
    }

    scheduleStep(track, step, start, stepDuration) {
      const voices = [
        ["lead", "square", 0.22, 0],
        ["harmony", "square", 0.115, -7],
        ["bass", "triangle", 0.25, 0],
      ];
      voices.forEach(([channelName, wave, level, detune]) => {
        const channel = track.channels[channelName];
        const token = channel[step];
        const frequency = noteFrequency(token);
        if (!frequency) return;
        const steps = this.sustainSteps(channel, step);
        this.scheduleTone(frequency, start, stepDuration * steps * 0.88, wave, level, detune);
      });
      const drum = track.channels.drums[step];
      if (drum?.includes("K")) this.scheduleKick(start);
      if (drum?.includes("S")) this.scheduleNoise(start, 0.105, 1200, 0.16);
      if (drum?.includes("H")) this.scheduleNoise(start, 0.032, 5200, 0.065);
    }

    trackNode(node, cleanupNodes = []) {
      this.activeNodes.add(node);
      node.onended = () => {
        this.activeNodes.delete(node);
        [node, ...cleanupNodes].forEach((entry) => {
          try { entry.disconnect(); } catch (error) { /* Optional cleanup. */ }
        });
      };
    }

    scheduleTone(frequency, start, duration, wave, level, detune = 0) {
      const context = this.context;
      if (!context || !this.master) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.detune.setValueAtTime(detune, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(level, start + 0.004);
      gain.gain.setValueAtTime(level * 0.88, Math.max(start + 0.005, start + duration - 0.018));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
      this.trackNode(oscillator, [gain]);
    }

    scheduleKick(start) {
      const context = this.context;
      if (!context || !this.master) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(135, start);
      oscillator.frequency.exponentialRampToValueAtTime(48, start + 0.09);
      gain.gain.setValueAtTime(0.28, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + 0.105);
      this.trackNode(oscillator, [gain]);
    }

    getNoiseBuffer() {
      const context = this.context;
      if (!context) return null;
      if (this.noiseBuffer) return this.noiseBuffer;
      const length = Math.floor(context.sampleRate * 0.14);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      let shiftRegister = 0x7fff;
      for (let index = 0; index < length; index += 1) {
        const bit = ((shiftRegister >> 0) ^ (shiftRegister >> 1)) & 1;
        shiftRegister = (shiftRegister >> 1) | (bit << 14);
        data[index] = (shiftRegister & 1) ? 0.72 : -0.72;
      }
      this.noiseBuffer = buffer;
      return buffer;
    }

    scheduleNoise(start, duration, cutoff, level) {
      const context = this.context;
      const buffer = this.getNoiseBuffer();
      if (!context || !buffer || !this.master) return;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.setValueAtTime(cutoff, start);
      gain.gain.setValueAtTime(level, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(start);
      source.stop(start + duration);
      this.trackNode(source, [filter, gain]);
    }
  }

  function tracksByCategory() {
    return CATEGORY_DEFINITIONS.map((category) => Object.freeze({
      ...category,
      tracks: Object.freeze(TRACKS.filter((track) => track.category === category.id)),
    }));
  }

  globalThis.GAME_MUSIC = Object.freeze({
    categories: CATEGORY_DEFINITIONS,
    tracks: TRACKS,
    trackById: (id) => TRACK_BY_ID.get(id) || null,
    tracksByCategory,
    noteFrequency,
    createPlayer: (options) => new ChiptunePlayer(options),
  });
})();
