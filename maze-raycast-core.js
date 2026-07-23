(function exposeMazeRaycastCore(global) {
  "use strict";

  const CORNER_EPSILON = 1e-12;

  function isWall(grid, cellX, cellY) {
    return !Array.isArray(grid[cellY]) || grid[cellY][cellX] !== 0;
  }

  function castGridRay(grid, originX, originY, angle, maxDistance = 24) {
    if (!Array.isArray(grid) || !Number.isFinite(originX) || !Number.isFinite(originY)
      || !Number.isFinite(angle) || !Number.isFinite(maxDistance) || maxDistance <= 0) {
      return 0;
    }

    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    let cellX = Math.floor(originX);
    let cellY = Math.floor(originY);
    if (isWall(grid, cellX, cellY)) return 0;

    const stepX = directionX < 0 ? -1 : 1;
    const stepY = directionY < 0 ? -1 : 1;
    const deltaX = Math.abs(directionX) < Number.EPSILON ? Infinity : Math.abs(1 / directionX);
    const deltaY = Math.abs(directionY) < Number.EPSILON ? Infinity : Math.abs(1 / directionY);
    let nextX = directionX < 0
      ? (originX - cellX) * deltaX
      : (cellX + 1 - originX) * deltaX;
    let nextY = directionY < 0
      ? (originY - cellY) * deltaY
      : (cellY + 1 - originY) * deltaY;

    while (true) {
      let distance;
      if (Math.abs(nextX - nextY) <= CORNER_EPSILON) {
        distance = nextX;
        nextX += deltaX;
        nextY += deltaY;
        cellX += stepX;
        cellY += stepY;
      } else if (nextX < nextY) {
        distance = nextX;
        nextX += deltaX;
        cellX += stepX;
      } else {
        distance = nextY;
        nextY += deltaY;
        cellY += stepY;
      }

      if (!Number.isFinite(distance) || distance >= maxDistance) return maxDistance;
      if (isWall(grid, cellX, cellY)) return Math.max(0, distance);
    }
  }

  global.MAZE_RAYCAST_CORE = Object.freeze({ castGridRay });
})(typeof window === "undefined" ? globalThis : window);
