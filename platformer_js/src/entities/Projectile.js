/**
 * @module entities/Projectile
 */

/**
 * Projectile entity fired by the player
 */
export class Projectile {
  /**
   * Create a projectile
   * @param {number} x - Starting X position
   * @param {number} y - Starting Y position
   * @param {number} direction - Direction (1 or -1)
   */
  constructor(x, y, direction) {
    this.x = x;
    this.y = y;
    this.width = 10;
    this.height = 5;
    this.speed = 10;
    this.direction = direction;
    this.active = true;
    this.color = '#FFD700';
  }

  /**
   * Update projectile position
   * @param {number} deltaTime - Time since last update
   */
  update(_deltaTime) {
    this.x += this.speed * this.direction;
  }

  /**
   * Check if projectile is out of bounds
   * @param {number} cameraX - Camera X position
   * @param {number} screenWidth - Screen width
   * @returns {boolean} True if out of bounds
   */
  isOutOfBounds(cameraX, screenWidth) {
    return this.x < cameraX - 100 || this.x > cameraX + screenWidth + 100;
  }

  /**
   * Get projectile bounds
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
   * Draw the projectile
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} cameraX - Camera X offset
   */
  draw(ctx, cameraX) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
  }
}
