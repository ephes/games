/**
 * @module systems/CollisionSystem
 */

/**
 * Handles all collision detection in the game
 */
export class CollisionSystem {
  /**
   * Check collision between two rectangles
   * @param {Object} rect1 - First rectangle
   * @param {Object} rect2 - Second rectangle
   * @returns {boolean} True if collision detected
   */
  static checkCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  /**
   * Check platform collisions for an entity
   * @param {Object} entity - Entity to check
   * @param {Array} platforms - List of platforms
   * @param {number} [previousY] - Y before this simulation step (enables swept contact)
   * @returns {Object} Collision info
   */
  static checkPlatformCollisions(entity, platforms, previousY) {
    const result = { isGrounded: false, platform: null, side: null };
    const falling = entity.velocityY > 0;
    if (!falling && entity.velocityY >= 0) {
      return result;
    }
    let contact = null;
    let surface = falling ? Infinity : -Infinity;

    for (const platform of platforms) {
      const overlap =
        Math.min(entity.x + entity.width, platform.x + platform.width) -
        Math.max(entity.x, platform.x);
      if (falling ? overlap < entity.width * 0.5 : overlap <= 0) {
        continue;
      }
      const edge = falling ? platform.y : platform.y + platform.height;
      const next = falling ? entity.y + entity.height : entity.y;
      const previous = falling ? previousY + entity.height : previousY;
      const crossed =
        previousY === undefined
          ? this.checkCollision(entity, platform) &&
            (falling ? entity.y < edge : entity.y + entity.height > edge)
          : falling
            ? previous <= edge && next >= edge
            : previous >= edge && next <= edge;
      if (crossed && (falling ? edge < surface : edge > surface)) {
        contact = platform;
        surface = edge;
      }
    }

    if (contact) {
      entity.y = falling ? surface - entity.height : surface;
      entity.velocityY = 0;
      result.side = falling ? 'top' : 'bottom';
      if (falling) {
        entity.isJumping = false;
        result.isGrounded = true;
        result.platform = contact;
      }
    }
    return result;
  }

  /**
   * Check enemy collision with player
   * @param {Object} player - Player object
   * @param {Object} enemy - Enemy object
   * @param {Object} [previousPlayer] - Captured player position before movement
   * @param {Object} [previousEnemy] - Captured enemy position before movement
   * @returns {string|null} Collision type: 'stomp', 'damage', or null
   */
  static checkEnemyCollision(
    player,
    enemy,
    previousPlayer,
    previousEnemy = enemy
  ) {
    if (!enemy.alive || player.isInvulnerable) {
      return null;
    }
    const captured = previousPlayer !== undefined;
    previousPlayer ??= {
      x: player.x,
      y: player.y - Math.max(0, player.velocityY)
    };
    const time = this.sweptContactTime(
      player,
      enemy,
      previousPlayer,
      previousEnemy
    );
    if (time === null) {
      return null;
    }
    const gap = previousEnemy.y - (previousPlayer.y + player.height);
    const downward = player.y - previousPlayer.y - (enemy.y - previousEnemy.y);
    // Only a top crossing at the first relative contact is a stomp. Starting
    // inside or entering through a side while falling remains damage.
    if (gap < 0 || downward <= 0 || Math.abs(time - gap / downward) > 1e-7) {
      return 'damage';
    }
    if (enemy.kind === 'boss') {
      if (
        !captured &&
        player.y + player.height - enemy.y > enemy.height * 0.2
      ) {
        return 'damage';
      }
      const playerX = previousPlayer.x + (player.x - previousPlayer.x) * time;
      const enemyX = previousEnemy.x + (enemy.x - previousEnemy.x) * time;
      if (
        Math.abs(playerX + player.width / 2 - enemyX - enemy.width / 2) >
        enemy.width * 0.2
      ) {
        return 'damage';
      }
      // First top contact has zero penetration, inside the top 20% head zone.
    }
    return 'stomp';
  }

  /**
   * Earliest overlap time for linearly moving rectangles in one step.
   * Stationary touching edges and tangential grazing do not count as overlap.
   * @param {Object} projectile - Current projectile rectangle
   * @param {Object} target - Current target rectangle
   * @param {Object} previousProjectile - Previous projectile position
   * @param {Object} previousTarget - Previous target position
   * @returns {number|null} Contact fraction in [0, 1], or null
   */
  static sweptContactTime(
    projectile,
    target,
    previousProjectile,
    previousTarget
  ) {
    let entry = -Infinity;
    let exit = Infinity;
    for (const [axis, size] of [
      ['x', 'width'],
      ['y', 'height']
    ]) {
      const start = previousProjectile[axis] - previousTarget[axis];
      const motion = projectile[axis] - target[axis] - start;
      if (motion === 0) {
        if (start >= target[size] || start + projectile[size] <= 0) {
          return null;
        }
        continue;
      }
      const first = (-projectile[size] - start) / motion;
      const last = (target[size] - start) / motion;
      entry = Math.max(entry, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
    }
    return entry < exit && exit > 0 && entry <= 1 ? Math.max(0, entry) : null;
  }

  /** Build one balanced swept-bounds tree for all player shots in a step. */
  static buildProjectileIndex(enemies, boss, previousTargets = new Map()) {
    const entries = [...enemies, ...(boss ? [boss] : [])]
      .map((target, order) => {
        const previous = previousTargets.get(target) ?? target;
        return {
          target,
          order,
          type: order < enemies.length ? 'enemy' : 'boss',
          minX: Math.min(previous.x, target.x),
          maxX: Math.max(previous.x, target.x) + target.width,
          minY: Math.min(previous.y, target.y),
          maxY: Math.max(previous.y, target.y) + target.height
        };
      })
      .filter(entry => entry.target.alive)
      .sort((a, b) => a.minX - b.minX || a.order - b.order);
    const build = (start, end) => {
      if (start >= end) {
        return null;
      }
      if (end - start === 1) {
        return { ...entries[start], leaf: true };
      }
      const mid = (start + end) >>> 1;
      const left = build(start, mid),
        right = build(mid, end);
      return {
        left,
        right,
        minX: Math.min(left.minX, right.minX),
        maxX: Math.max(left.maxX, right.maxX),
        minY: Math.min(left.minY, right.minY),
        maxY: Math.max(left.maxY, right.maxY)
      };
    };
    return build(0, entries.length);
  }

  /** Query conservative swept bounds; exact contact remains authoritative. */
  static queryProjectileIndex(index, shot, previous) {
    const minX = Math.min(shot.x, previous.x);
    const maxX = Math.max(shot.x, previous.x) + shot.width;
    const minY = Math.min(shot.y, previous.y);
    const maxY = Math.max(shot.y, previous.y) + shot.height;
    const candidates = [];
    const visit = node => {
      if (
        !node ||
        node.minX > maxX ||
        node.maxX < minX ||
        node.minY > maxY ||
        node.maxY < minY
      ) {
        return;
      }
      if (node.leaf) {
        candidates.push(node);
      } else {
        visit(node.left);
        visit(node.right);
      }
    };
    visit(index);
    // Preserve level order for identical rectangles, and enemy-before-boss ties.
    return candidates.sort((a, b) => a.order - b.order);
  }

  /**
   * Find the first live target crossed, including relative target movement.
   * Equal-time hits use x/y/size order, then enemy before boss; identical enemy
   * rectangles retain level order. Omitting previous positions checks overlaps.
   * @param {Object} projectile - Current projectile rectangle
   * @param {Array} enemies - List of enemies
   * @param {Object} [boss] - Boss enemy
   * @param {Object} [previousProjectile] - Projectile position before this step
   * @param {Map} [previousTargets] - Target positions before this step
   * @param {Array} [candidates] - Optional broad-phase query in level order
   * @returns {Object|null} Hit target or null
   */
  static checkProjectileCollisions(
    projectile,
    enemies,
    boss = null,
    previousProjectile = projectile,
    previousTargets = new Map(),
    candidates = null
  ) {
    let hit = null;
    let earliest = Infinity;
    const targets = candidates ?? [
      ...enemies.map(target => ({ type: 'enemy', target })),
      ...(boss ? [{ type: 'boss', target: boss }] : [])
    ];
    for (const candidate of targets) {
      const { target } = candidate;
      if (!target.alive) {
        continue;
      }
      const time = this.sweptContactTime(
        projectile,
        target,
        previousProjectile,
        previousTargets.get(target) ?? target
      );
      if (time === null) {
        continue;
      }
      // Geometric tie breaking keeps distinct simultaneous contacts independent
      // of enemy array order. Exact duplicate rectangles retain level order.
      let before = false;
      if (hit && time === earliest) {
        for (const key of ['x', 'y', 'width', 'height']) {
          if (target[key] !== hit.target[key]) {
            before = target[key] < hit.target[key];
            break;
          }
        }
      }
      if (time < earliest || before) {
        earliest = time;
        hit = { type: candidate.type, target };
      }
    }
    return hit;
  }

  /**
   * Check if entity is within bounds
   * @param {Object} entity - Entity to check
   * @param {Object} bounds - Boundary limits
   * @returns {Object} Clamped position
   */
  static keepInBounds(entity, bounds) {
    const clampedX = Math.max(
      bounds.minX,
      Math.min(bounds.maxX - entity.width, entity.x)
    );
    const clampedY = Math.min(bounds.maxY - entity.height, entity.y);

    return {
      x: clampedX,
      y: clampedY,
      clamped: clampedX !== entity.x || clampedY !== entity.y
    };
  }

  /**
   * Check if player is centered in portal
   * @param {Object} player - Player object
   * @param {Object} portal - Portal object
   * @param {number} threshold - Distance threshold (0-1)
   * @returns {boolean} True if centered enough
   */
  static checkPortalEntry(player, portal, threshold = 0.6) {
    if (!this.checkCollision(player, portal)) {
      return false;
    }

    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const portalCenterX = portal.x + portal.width / 2;
    const portalCenterY = portal.y + portal.height / 2;

    const dx = playerCenterX - portalCenterX;
    const dy = playerCenterY - portalCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const portalRadius = portal.width / 2;
    return distance < portalRadius * threshold;
  }
}
