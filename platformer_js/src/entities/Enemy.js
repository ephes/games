/**
 * @module entities/Enemy
 */

/**
 * Base enemy class
 */
export class Enemy {
  /**
   * Create a new enemy
   * @param {Object} config - Enemy configuration
   * @param {number} config.x - Initial X position
   * @param {number} config.y - Initial Y position
   * @param {number} config.speed - Movement speed
   * @param {number} config.platformIndex - Platform to patrol
   */
  constructor(config) {
    this.x = config.x;
    this.y = config.y;
    this.width = 44;
    this.height = 30;
    this.speed = config.speed || 2;
    this.direction = 1;
    this.platformIndex = config.platformIndex;
    this.alive = true;
    this.isHit = false;
    this.hitAnimationTimer = 0;
    this.hitAnimationDuration = 300;

    // Animation properties
    this.frameX = 0;
    this.frameTimer = 0;
    this.animationSpeed = 20;
  }

  /**
   * Update enemy state
   * @param {Array} platforms - List of platforms
   * @param {number} deltaTime - Time since last update
   */
  update(platforms, deltaTime) {
    if (!this.alive) {
      return;
    }

    // Move enemy
    this.x += this.speed * this.direction;

    // Get the platform this enemy is on
    const platform = platforms[this.platformIndex];
    if (!platform) {
      return;
    }

    // Check if enemy has reached platform edges
    if (this.x <= platform.x) {
      this.x = platform.x;
      this.direction = 1;
    } else if (this.x + this.width >= platform.x + platform.width) {
      this.x = platform.x + platform.width - this.width;
      this.direction = -1;
    }

    // Update animation
    this.updateAnimation(deltaTime);
  }

  /**
   * Update animation frame
   * @param {number} deltaTime - Time since last update
   */
  updateAnimation(_deltaTime) {
    const now = Date.now();
    const frameCount = this.isHit ? 5 : 10; // Different frame counts for different animations
    const animSpeed = this.isHit ? this.animationSpeed : 15;

    if (now - this.frameTimer > 1000 / animSpeed) {
      this.frameTimer = now;
      this.frameX = (this.frameX + 1) % frameCount;
    }
  }

  /**
   * Handle being hit
   */
  hit() {
    this.isHit = true;
    this.hitAnimationTimer = Date.now();
    this.frameX = 0; // Reset animation frame

    // Mark as dead after animation
    setTimeout(() => {
      this.alive = false;
    }, this.hitAnimationDuration);
  }

  /**
   * Get enemy bounds for collision detection
   * @returns {Object} Bounding box
   */
  getBounds() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    };
  }

  /**
   * Check if enemy is currently in hit animation
   * @returns {boolean} True if in hit animation
   */
  isInHitAnimation() {
    return (
      this.isHit &&
      Date.now() - this.hitAnimationTimer < this.hitAnimationDuration
    );
  }

  /**
   * Get animation state
   * @returns {string} Current animation state
   */
  getAnimationState() {
    return this.isHit ? 'hit' : 'run';
  }
}
