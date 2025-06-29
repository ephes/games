/**
 * @module entities/Boss
 */

import { Enemy } from './Enemy.js';
import { BossProjectile } from './BossProjectile.js';

/**
 * Boss enemy class
 * @extends Enemy
 */
export class Boss extends Enemy {
  /**
   * Create a new boss
   * @param {Object} config - Boss configuration
   */
  constructor(config) {
    super(config);

    // Override default size
    this.width = 64;
    this.height = 96;
    this.health = 10;
    this.maxHealth = 10;

    // Boss movement
    this.baseSpeed = config.speed || 2;
    this.speed = this.baseSpeed;

    // Boss-specific animation properties
    this.frameCount = 5;
    this.frameInterval = 200; // Slower animation for smoother appearance
    this.hitTimer = 0;
    this.hitDuration = 400;

    // Initialize animation frame (parent class sets these but let's ensure they're correct)
    this.frameX = 0;
    this.frameTimer = Date.now();

    // Animation sequence for smoother transitions
    // Play frames in a back-and-forth pattern: 0,1,2,3,4,3,2,1
    this.animationSequence = [0, 1, 2, 3, 4, 3, 2, 1];
    this.sequenceIndex = 0;

    // Projectile system
    this.projectiles = [];
    this.canShoot = true;
    this.shootCooldown = 1500; // 1.5 seconds between shots
    this.lastShotTime = -this.shootCooldown; // Allow immediate first shot
    this.shootingRange = 600; // Range to start shooting at player
  }

  /**
   * Update boss state
   * @param {Array} platforms - List of platforms
   * @param {number} deltaTime - Time since last update
   * @param {Object} player - Player object for AI targeting
   */
  update(platforms, deltaTime, player) {
    if (!this.alive) {
      return;
    }

    // Boss AI with zone-based behavior
    if (player) {
      const horizontalDistance = player.x - this.x;
      const distanceToPlayer = Math.abs(horizontalDistance);
      const playerDirection = horizontalDistance > 0 ? 1 : -1;
      const verticalDistance = player.y - this.y;

      // Check if player is above and falling (trying to stomp)
      if (
        verticalDistance < -50 &&
        player.velocityY > 0 &&
        distanceToPlayer < 100
      ) {
        // Dodge mechanic - move away quickly
        this.speed = this.baseSpeed * 3;
        this.direction = -playerDirection; // Move away from player
      } else {
        // Zone-based behavior
        if (distanceToPlayer > 600) {
          // Far zone: Normal patrol speed
          this.speed = this.baseSpeed;
        } else if (distanceToPlayer > 300) {
          // Medium zone: Face player, move slowly
          this.speed = this.baseSpeed * 0.5;
          // Only change direction if player is significantly to one side
          if (this.direction !== playerDirection && distanceToPlayer > 50) {
            this.direction = playerDirection;
          }
        } else {
          // Close zone: Aggressive pursuit
          this.speed = this.baseSpeed * 1.5;
          // Add dead zone to prevent spinning when player is directly above
          // Only change direction if player is at least 30 pixels away horizontally
          if (this.direction !== playerDirection && distanceToPlayer > 30) {
            this.direction = playerDirection;
          }
        }
      }
    }

    // Call parent update for movement but skip animation
    if (!this.alive) {
      return;
    }

    // Move enemy
    this.x += this.speed * this.direction;

    // Get the platform this enemy is on
    const platform = platforms[this.platformIndex];
    if (platform) {
      // Check if enemy has reached platform edges
      if (this.x <= platform.x) {
        this.x = platform.x;
        this.direction = 1;
      } else if (this.x + this.width >= platform.x + platform.width) {
        this.x = platform.x + platform.width - this.width;
        this.direction = -1;
      }
    }

    // Update boss-specific animation (NOT parent animation)
    this.updateBossAnimation();

    // Handle hit animation
    if (this.isHit && Date.now() - this.hitTimer > this.hitDuration) {
      this.isHit = false;
    }

    // Update projectile shooting
    this.updateShooting(player);

    // Update projectiles (only if boss is alive)
    if (this.alive) {
      this.projectiles = this.projectiles.filter(projectile => {
        projectile.update(deltaTime);
        return projectile.active;
      });
    }
  }

  /**
   * Update boss animation frames
   */
  updateBossAnimation() {
    const now = Date.now();

    if (now - this.frameTimer > this.frameInterval) {
      this.frameTimer = now;
      // Use the animation sequence for smoother transitions
      this.sequenceIndex =
        (this.sequenceIndex + 1) % this.animationSequence.length;
      this.frameX = this.animationSequence[this.sequenceIndex];

      if (window.DEBUG_BOSS) {
        console.log(
          `Boss animation: Frame ${this.frameX}, Sequence ${this.sequenceIndex}, Time: ${now}`
        );
      }
    }
  }

  /**
   * Handle boss taking damage
   * @returns {number} Points awarded for hit
   */
  takeDamage() {
    this.isHit = true;
    this.hitTimer = Date.now();
    this.health--;

    if (this.health <= 0) {
      this.alive = false;
      // Clear all projectiles when boss dies
      this.projectiles.forEach(projectile => {
        projectile.active = false;
      });
      this.projectiles = [];
      return 200; // Points for defeating boss
    }

    return 20; // Points for damaging boss
  }

  /**
   * Get health percentage
   * @returns {number} Health percentage (0-1)
   */
  getHealthPercentage() {
    return this.health / this.maxHealth;
  }

  /**
   * Override hit method to use takeDamage
   */
  hit() {
    return this.takeDamage();
  }

  /**
   * Update shooting behavior
   * @param {Object} player - Player object
   */
  updateShooting(player) {
    if (!player) {
      return;
    }
    if (!this.alive) {
      return;
    }

    const now = Date.now();
    const distanceToPlayer = Math.abs(player.x - this.x);
    const timeSinceLastShot = now - this.lastShotTime;

    // Check if can shoot
    if (this.canShoot && distanceToPlayer <= this.shootingRange) {
      if (timeSinceLastShot >= this.shootCooldown) {
        this.shoot(player);
        this.lastShotTime = now;
      }
    }
  }

  /**
   * Shoot a projectile at the player
   * @param {Object} player - Player object
   */
  shoot(player) {
    const direction = player.x > this.x ? 1 : -1;
    const projectileX = this.x + (direction > 0 ? this.width : 0);
    const projectileY = this.y + this.height / 2;

    // Simple, fair projectile speed
    const projectileSpeed = 5;

    const projectile = new BossProjectile(
      projectileX,
      projectileY,
      direction,
      projectileSpeed
    );
    this.projectiles.push(projectile);
  }

  /**
   * Get all active projectiles
   * @returns {Array} Active projectiles
   */
  getProjectiles() {
    return this.projectiles;
  }
}
