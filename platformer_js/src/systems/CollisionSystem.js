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
   * @returns {string|null} Collision type: 'stomp', 'damage', or null
   */
  static checkEnemyCollision(player, enemy) {
    if (!enemy.alive || player.isInvulnerable) {
      return null;
    }

    if (this.checkCollision(player, enemy)) {
      const playerBottom = player.y + player.height;
      const enemyTop = enemy.y;
      const playerFalling = player.velocityY > 0;

      // Check if player is stomping on enemy
      if (
        playerFalling &&
        playerBottom >= enemyTop &&
        playerBottom - enemyTop <= player.velocityY + 10
      ) {
        // For boss enemies, only allow stomp on head area (top 20%)
        if (enemy.kind === 'boss') {
          const playerCenterX = player.x + player.width / 2;
          const enemyCenterX = enemy.x + enemy.width / 2;
          const headZoneWidth = enemy.width * 0.4; // Only central 40% counts as head

          // Check if player is hitting the head area
          if (Math.abs(playerCenterX - enemyCenterX) > headZoneWidth / 2) {
            return 'damage'; // Hit the side, not the head
          }

          // Check if hitting top part of boss
          if (playerBottom - enemyTop > enemy.height * 0.2) {
            return 'damage'; // Too low, not on head
          }
        }

        return 'stomp';
      }

      return 'damage';
    }

    return null;
  }

  /**
   * Check projectile collisions
   * @param {Object} projectile - Projectile to check
   * @param {Array} enemies - List of enemies
   * @param {Object} boss - Boss enemy (optional)
   * @returns {Object|null} Hit target or null
   */
  static checkProjectileCollisions(projectile, enemies, boss = null) {
    // Check enemy collisions
    for (const enemy of enemies) {
      if (enemy.alive && this.checkCollision(projectile, enemy)) {
        return { type: 'enemy', target: enemy };
      }
    }

    // Check boss collision
    if (boss && boss.alive && this.checkCollision(projectile, boss)) {
      return { type: 'boss', target: boss };
    }

    return null;
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
