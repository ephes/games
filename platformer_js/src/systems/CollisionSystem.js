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
   * @param {Object|number|null} [previousPose] - Pre-step x/y, legacy Y-only, or null for no history
   * @returns {Object} Collision info
   */
  static checkPlatformCollisions(entity, platforms, previousPose) {
    const position =
      previousPose !== null && typeof previousPose === 'object'
        ? previousPose
        : undefined;
    const previousY =
      typeof previousPose === 'number' ? previousPose : position?.y;
    const previousX = position ? position.x : entity.x;
    const result = { isGrounded: false, platform: null, side: null };
    const falling = entity.velocityY > 0;
    if (!falling && entity.velocityY >= 0) {
      return result;
    }
    let contact = null;
    let surface = falling ? Infinity : -Infinity;

    for (const platform of platforms) {
      const edge = falling ? platform.y : platform.y + platform.height;
      const next = falling ? entity.y + entity.height : entity.y;
      const previous = falling ? previousY + entity.height : previousY;
      const time =
        previousY === undefined || next === previous
          ? 1
          : (edge - previous) / (next - previous);
      const contactX = previousX + (entity.x - previousX) * time;
      const overlap =
        Math.min(contactX + entity.width, platform.x + platform.width) -
        Math.max(contactX, platform.x);
      if (falling ? overlap < entity.width * 0.5 : overlap <= 0) {
        continue;
      }
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
    if (!enemy.alive) {
      return null;
    }
    const captured = previousPlayer !== undefined;
    previousPlayer ??= this.#previousBodyPose(player);
    const time = this.sweptContactTime(
      player,
      enemy,
      previousPlayer,
      previousEnemy
    );
    return time === null
      ? null
      : this.#bodyContactType(
          player,
          enemy,
          previousPlayer,
          previousEnemy,
          time,
          captured
        );
  }

  static #previousBodyPose(player) {
    return {
      x: player.x,
      y: player.y - Math.max(0, player.velocityY)
    };
  }

  static #bodyContactType(
    player,
    enemy,
    previousPlayer,
    previousEnemy,
    time,
    captured
  ) {
    const damage = player.isInvulnerable ? null : 'damage';
    const gap = previousEnemy.y - (previousPlayer.y + player.height);
    const downward = player.y - previousPlayer.y - (enemy.y - previousEnemy.y);
    // Only a top crossing at the first relative contact is a stomp. Starting
    // inside or entering through a side while falling remains damage.
    if (gap < 0 || downward <= 0 || Math.abs(time - gap / downward) > 1e-7) {
      return damage;
    }
    if (enemy.kind === 'boss') {
      if (
        !captured &&
        player.y + player.height - enemy.y > enemy.height * 0.2
      ) {
        return damage;
      }
      const playerX = previousPlayer.x + (player.x - previousPlayer.x) * time;
      const enemyX = previousEnemy.x + (enemy.x - previousEnemy.x) * time;
      if (
        Math.abs(playerX + player.width / 2 - enemyX - enemy.width / 2) >
        enemy.width * 0.2
      ) {
        return damage;
      }
      // First top contact has zero penetration, inside the top 20% head zone.
    }
    return 'stomp';
  }

  /**
   * Earliest overlap time for linearly moving rectangles in one step.
   * The open overlap interval must extend into the step. Starting overlapped
   * or touching and moving inward gives time zero.
   * @param {Object} projectile - Current projectile rectangle
   * @param {Object} target - Current target rectangle
   * @param {Object} previousProjectile - Previous projectile position
   * @param {Object} previousTarget - Previous target position
   * @returns {number|null} Contact fraction in [0, 1), or null
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
    return entry < exit && exit > 0 && entry < 1 ? Math.max(0, entry) : null;
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
    return candidates;
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
   * @param {Array} [candidates] - Optional broad-phase entries with level order
   * @returns {Object|null} Hit type, target and contact time, or null
   */
  static checkProjectileCollisions(
    projectile,
    enemies,
    boss = null,
    previousProjectile = projectile,
    previousTargets = new Map(),
    candidates = null
  ) {
    return this.#firstTargetContact(
      projectile,
      enemies,
      boss,
      previousProjectile,
      previousTargets,
      candidates
    );
  }

  /**
   * Find the earliest enemy or boss body contact that affects the player.
   * Protected players can stomp, but damaging contacts are ignored.
   * @param {Object} player - Current player rectangle
   * @param {Array} enemies - List of enemies
   * @param {Object} boss - Boss enemy
   * @param {Object} [previousPlayer] - Player position before this step
   * @param {Map} [previousTargets] - Target positions before this step
   * @returns {Object|null} Target, target type, contact time and collision type
   */
  static checkBodyContacts(
    player,
    enemies,
    boss,
    previousPlayer,
    previousTargets
  ) {
    const start = previousPlayer ?? this.#previousBodyPose(player);
    return this.#firstTargetContact(
      player,
      enemies,
      boss,
      start,
      previousTargets,
      null,
      (target, previousTarget, time) =>
        this.#bodyContactType(
          player,
          target,
          start,
          previousTarget,
          time,
          previousPlayer !== undefined
        )
    );
  }

  static #firstTargetContact(
    moving,
    enemies,
    boss,
    previous,
    previousTargets,
    candidates,
    classify
  ) {
    let hit = null;
    let earliest = Infinity;
    let hitOrder = Infinity;
    const targets = candidates ?? [
      ...enemies.map(target => ({ type: 'enemy', target })),
      ...(boss ? [{ type: 'boss', target: boss }] : [])
    ];
    for (let i = 0; i < targets.length; i++) {
      const candidate = targets[i];
      const { target, order = i } = candidate;
      if (!target.alive) {
        continue;
      }
      const previousTarget = previousTargets?.get(target) ?? target;
      const time = this.sweptContactTime(
        moving,
        target,
        previous,
        previousTarget
      );
      if (time === null) {
        continue;
      }
      // Geometric tie breaking keeps distinct simultaneous contacts independent
      // of enemy array order. Exact duplicate rectangles retain level order.
      let before = false;
      if (hit && time === earliest) {
        before = order < hitOrder;
        for (const key of ['x', 'y', 'width', 'height']) {
          if (target[key] !== hit.target[key]) {
            before = target[key] < hit.target[key];
            break;
          }
        }
      }
      if (time < earliest || before) {
        const collision = classify?.(target, previousTarget, time);
        if (classify && !collision) {
          continue;
        }
        earliest = time;
        hitOrder = order;
        hit = { type: candidate.type, target, time };
        if (collision) {
          hit.collision = collision;
        }
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
   * @param {Object} [previousPlayer] - Start of admitted motion (no teleports)
   * @returns {boolean} True if centered enough anywhere along the motion
   */
  static checkPortalEntry(
    player,
    portal,
    threshold = 0.6,
    previousPlayer = player
  ) {
    return (
      this.portalEntryTime(player, portal, threshold, previousPlayer) !== null
    );
  }

  /**
   * Return the first contact fraction for the portal's open entry region.
   * Tangency and an endpoint only touching the boundary do not enter.
   * @returns {number|null}
   */
  static portalEntryTime(
    player,
    portal,
    threshold = 0.6,
    previousPlayer = player
  ) {
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const portalCenterX = portal.x + portal.width / 2;
    const portalCenterY = portal.y + portal.height / 2;

    const startX = previousPlayer.x + player.width / 2;
    const startY = previousPlayer.y + player.height / 2;
    const motionX = playerCenterX - startX;
    const motionY = playerCenterY - startY;
    const lengthSquared = motionX * motionX + motionY * motionY;
    const time =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((portalCenterX - startX) * motionX +
                (portalCenterY - startY) * motionY) /
                lengthSquared
            )
          );
    const x = previousPlayer.x + motionX * time;
    const y = previousPlayer.y + motionY * time;
    if (!this.checkCollision({ ...player, x, y }, portal)) {
      return null;
    }
    const dx = x + player.width / 2 - portalCenterX;
    const dy = y + player.height / 2 - portalCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const radius = (portal.width / 2) * threshold;
    if (!(distance < radius)) {
      return null;
    }
    if (lengthSquared === 0) {
      return 0;
    }

    // Trace backward from the closest admitted point to the circle boundary.
    const dot = dx * motionX + dy * motionY;
    const reach = Math.sqrt(
      dot * dot + lengthSquared * (radius * radius - distance * distance)
    );
    const circleEntry = time - (dot + reach) / lengthSquared;
    const boxEntry = this.sweptContactTime(
      player,
      portal,
      previousPlayer,
      portal
    );
    return Math.max(circleEntry, boxEntry);
  }
}
