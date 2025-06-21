/**
 * @module entities/Player
 */

/**
 * Player entity class
 * Handles player state, movement, and actions
 */
export class Player {
  /**
   * Create a new player
   * @param {number} x - Initial X position
   * @param {number} y - Initial Y position
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 30;
    this.height = 30;
    this.speed = 5;
    this.jumpForce = 12;
    this.gravity = 0.5;
    this.velocityY = 0;
    this.isJumping = false;
    this.isInvulnerable = false;
    this.direction = 1; // 1 for right, -1 for left
    this.isHit = false;
    this.hitAnimationTimer = 0;
    this.hitAnimationDuration = 500; // Duration of hit animation in milliseconds

    // Animation properties
    this.currentAnimation = 'idle';
    this.animationFrame = 0;
    this.animationTimer = 0;
  }

  /**
   * Update player state
   * @param {Object} keys - Currently pressed keys
   * @param {number} deltaTime - Time since last update
   */
  update(keys, deltaTime) {
    // Handle horizontal movement
    if (keys['ArrowLeft']) {
      this.x -= this.speed;
      this.direction = -1;
    }
    if (keys['ArrowRight']) {
      this.x += this.speed;
      this.direction = 1;
    }

    // Handle jumping
    if (keys['ArrowUp'] && !this.isJumping) {
      this.velocityY = -this.jumpForce;
      this.isJumping = true;
    }

    // Apply gravity
    this.velocityY += this.gravity;
    this.y += this.velocityY;

    // Update hit animation
    if (
      this.isHit &&
      Date.now() - this.hitAnimationTimer > this.hitAnimationDuration
    ) {
      this.isHit = false;
    }

    // Determine current animation state
    this.updateAnimation(keys);

    // Update animation frame
    this.updateAnimationFrame(deltaTime);
  }

  /**
   * Update animation state based on player status
   * @param {Object} keys - Currently pressed keys
   */
  updateAnimation(keys) {
    const prevAnimation = this.currentAnimation;

    if (this.isHit) {
      this.currentAnimation = 'hit';
    } else if (this.isJumping) {
      this.currentAnimation = this.velocityY < 0 ? 'jump' : 'fall';
    } else if (keys['ArrowLeft'] || keys['ArrowRight']) {
      this.currentAnimation = 'run';
    } else {
      this.currentAnimation = 'idle';
    }

    // Reset frame if animation changed
    if (prevAnimation !== this.currentAnimation) {
      this.animationFrame = 0;
      this.animationTimer = 0;
    }
  }

  /**
   * Update animation frame
   * @param {number} deltaTime - Time since last update
   */
  updateAnimationFrame(deltaTime) {
    this.animationTimer += deltaTime;

    // Animation frame rates
    const frameRates = {
      idle: 11,
      run: 12,
      jump: 1,
      fall: 1,
      hit: 7
    };

    const frameCount = frameRates[this.currentAnimation] || 1;
    const frameDuration = 1000 / 15; // 15 FPS

    if (this.animationTimer >= frameDuration && frameCount > 1) {
      this.animationFrame = (this.animationFrame + 1) % frameCount;
      this.animationTimer = 0;
    }
  }

  /**
   * Make player jump
   */
  jump() {
    if (!this.isJumping) {
      this.velocityY = -this.jumpForce;
      this.isJumping = true;
    }
  }

  /**
   * Make player invulnerable for a period
   * @param {number} duration - Duration in milliseconds
   */
  makeInvulnerable(duration = 2000) {
    this.isInvulnerable = true;
    this.isHit = true;
    this.hitAnimationTimer = Date.now();

    // Reset hit animation
    setTimeout(() => {
      this.isHit = false;
    }, this.hitAnimationDuration);

    // Reset invulnerability
    setTimeout(() => {
      this.isInvulnerable = false;
    }, duration);
  }

  /**
   * Take damage and knock back player
   * @param {number} lives - Current lives before damage
   * @returns {number} Lives after damage
   */
  takeDamage(lives) {
    if (this.isInvulnerable) {
      return lives;
    }

    lives--;
    this.x = 50;
    this.y = 200;
    this.velocityY = 0;
    this.makeInvulnerable();

    return lives;
  }

  /**
   * Bounce player (after jumping on enemy)
   * @param {number} force - Bounce force multiplier
   */
  bounce(force = 0.7) {
    this.velocityY = -this.jumpForce * force;
  }

  /**
   * Get player bounds for collision detection
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
}
