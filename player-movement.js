(function initializePlayerMovement(root) {
  "use strict";

  const CARDINAL_DIRECTIONS = Object.freeze(["up", "down", "left", "right"]);

  function movementIntent(input = {}, preferredDirection = "down") {
    const rawX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const rawY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const length = Math.hypot(rawX, rawY);
    if (!length) {
      return {
        active: false,
        diagonal: false,
        x: 0,
        y: 0,
        direction: preferredDirection,
        animationDirection: preferredDirection,
      };
    }

    const horizontalDirection = rawX < 0 ? "left" : rawX > 0 ? "right" : null;
    const verticalDirection = rawY < 0 ? "up" : rawY > 0 ? "down" : null;
    const diagonal = Boolean(horizontalDirection && verticalDirection);
    let direction;
    if (diagonal && [horizontalDirection, verticalDirection].includes(preferredDirection)) {
      direction = preferredDirection;
    } else if (Math.abs(rawX) > Math.abs(rawY)) {
      direction = horizontalDirection;
    } else {
      direction = verticalDirection || horizontalDirection || preferredDirection;
    }

    return {
      active: true,
      diagonal,
      x: rawX / length,
      y: rawY / length,
      direction,
      animationDirection: diagonal ? `${verticalDirection}-${horizontalDirection}` : direction,
    };
  }

  function smoothVelocity(current, target, deltaSeconds, response) {
    const safeDelta = Math.max(0, Number(deltaSeconds) || 0);
    const safeResponse = Math.max(0, Number(response) || 0);
    const blend = 1 - Math.exp(-safeResponse * safeDelta);
    const x = current.x + (target.x - current.x) * blend;
    const y = current.y + (target.y - current.y) * blend;
    return {
      x: Math.abs(x - target.x) < .01 ? target.x : x,
      y: Math.abs(y - target.y) < .01 ? target.y : y,
    };
  }

  function advanceAnimationPhase(currentPhase, distance, running = false) {
    const safePhase = Math.max(0, Number(currentPhase) || 0) % 4;
    const safeDistance = Math.max(0, Number(distance) || 0);
    const pixelsPerFrame = running ? 16 : 12;
    return (safePhase + safeDistance / pixelsPerFrame) % 4;
  }

  root.PLAYER_MOVEMENT_CORE = Object.freeze({
    CARDINAL_DIRECTIONS,
    advanceAnimationPhase,
    movementIntent,
    smoothVelocity,
  });
})(globalThis);
