(() => {
  "use strict";

  const MINUTES_PER_DAY = 24 * 60;
  const PHASES = Object.freeze({
    night: Object.freeze({ label: "NOCHE", icon: "☾" }),
    dawn: Object.freeze({ label: "AMANECER", icon: "◐" }),
    day: Object.freeze({ label: "DÍA", icon: "☀" }),
    dusk: Object.freeze({ label: "ATARDECER", icon: "◒" }),
  });
  const LIGHT_STOPS = Object.freeze([
    Object.freeze({ minute: 0, top: [13, 23, 58, .42], bottom: [20, 30, 67, .32], vignette: .17 }),
    Object.freeze({ minute: 330, top: [13, 23, 58, .42], bottom: [20, 30, 67, .32], vignette: .17 }),
    Object.freeze({ minute: 390, top: [68, 58, 101, .22], bottom: [246, 132, 84, .13], vignette: .08 }),
    Object.freeze({ minute: 450, top: [255, 255, 255, 0], bottom: [255, 255, 255, 0], vignette: 0 }),
    Object.freeze({ minute: 1140, top: [255, 255, 255, 0], bottom: [255, 255, 255, 0], vignette: 0 }),
    Object.freeze({ minute: 1200, top: [65, 41, 92, .21], bottom: [236, 106, 68, .16], vignette: .07 }),
    Object.freeze({ minute: 1260, top: [13, 23, 58, .42], bottom: [20, 30, 67, .32], vignette: .17 }),
    Object.freeze({ minute: MINUTES_PER_DAY, top: [13, 23, 58, .42], bottom: [20, 30, 67, .32], vignette: .17 }),
  ]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeMinutes(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return ((numeric % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }

  function localMinutes(dateLike = new Date()) {
    const hours = Number(dateLike.getHours());
    const minutes = Number(dateLike.getMinutes());
    const seconds = Number(dateLike.getSeconds());
    const milliseconds = Number(dateLike.getMilliseconds());
    return normalizeMinutes(
      hours * 60
      + minutes
      + seconds / 60
      + milliseconds / 60000,
    );
  }

  function phaseAtMinutes(value) {
    const minute = normalizeMinutes(value);
    if (minute >= 330 && minute < 450) return "dawn";
    if (minute >= 450 && minute < 1140) return "day";
    if (minute >= 1140 && minute < 1260) return "dusk";
    return "night";
  }

  function interpolate(start, end, progress) {
    return start + (end - start) * progress;
  }

  function interpolateColor(start, end, progress) {
    return start.map((value, index) => interpolate(value, end[index], progress));
  }

  function lightingAtMinutes(value) {
    const minute = normalizeMinutes(value);
    let lower = LIGHT_STOPS[0];
    let upper = LIGHT_STOPS[1];
    for (let index = 1; index < LIGHT_STOPS.length; index += 1) {
      upper = LIGHT_STOPS[index];
      if (minute <= upper.minute) break;
      lower = upper;
    }
    const duration = Math.max(1, upper.minute - lower.minute);
    const progress = clamp((minute - lower.minute) / duration, 0, 1);
    return {
      top: interpolateColor(lower.top, upper.top, progress),
      bottom: interpolateColor(lower.bottom, upper.bottom, progress),
      vignette: interpolate(lower.vignette, upper.vignette, progress),
    };
  }

  function formatClock(value) {
    const minute = Math.floor(normalizeMinutes(value));
    const hours = Math.floor(minute / 60);
    const minutes = minute % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function sampleAtMinutes(value) {
    const minute = normalizeMinutes(value);
    const phase = phaseAtMinutes(minute);
    const lighting = lightingAtMinutes(minute);
    return {
      minute,
      phase,
      label: PHASES[phase].label,
      icon: PHASES[phase].icon,
      clock: formatClock(minute),
      isNight: phase === "night",
      top: lighting.top,
      bottom: lighting.bottom,
      vignette: lighting.vignette,
      strength: Math.max(lighting.top[3], lighting.bottom[3], lighting.vignette),
    };
  }

  function sample(dateLike = new Date()) {
    return sampleAtMinutes(localMinutes(dateLike));
  }

  function rgba(color) {
    const red = Math.round(clamp(color[0], 0, 255));
    const green = Math.round(clamp(color[1], 0, 255));
    const blue = Math.round(clamp(color[2], 0, 255));
    const alpha = clamp(color[3], 0, 1);
    return `rgba(${red},${green},${blue},${alpha.toFixed(4)})`;
  }

  function paint(context, width, height, snapshot) {
    const viewportWidth = Math.max(0, Number(width) || 0);
    const viewportHeight = Math.max(0, Number(height) || 0);
    if (!context || viewportWidth < 1 || viewportHeight < 1 || !snapshot || snapshot.strength <= .0005) return false;

    context.save();
    try {
      const sky = context.createLinearGradient(0, 0, 0, viewportHeight);
      sky.addColorStop(0, rgba(snapshot.top));
      sky.addColorStop(1, rgba(snapshot.bottom));
      context.fillStyle = sky;
      context.fillRect(0, 0, viewportWidth, viewportHeight);

      if (snapshot.vignette > .0005) {
        const radius = Math.hypot(viewportWidth, viewportHeight) * .62;
        const vignette = context.createRadialGradient(
          viewportWidth * .5,
          viewportHeight * .48,
          Math.min(viewportWidth, viewportHeight) * .18,
          viewportWidth * .5,
          viewportHeight * .48,
          radius,
        );
        vignette.addColorStop(0, "rgba(5,11,28,0)");
        vignette.addColorStop(1, `rgba(5,11,28,${clamp(snapshot.vignette, 0, 1).toFixed(4)})`);
        context.fillStyle = vignette;
        context.fillRect(0, 0, viewportWidth, viewportHeight);
      }
    } finally {
      context.restore();
    }
    return true;
  }

  globalThis.DAY_NIGHT_CYCLE = Object.freeze({
    MINUTES_PER_DAY,
    localMinutes,
    phaseAtMinutes,
    sampleAtMinutes,
    sample,
    paint,
  });
})();
