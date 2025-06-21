/**
 * @module objects/Platform
 */

/**
 * Platform object that entities can stand on
 */
export class Platform {
  /**
   * Create a platform
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Platform width
   * @param {number} height - Platform height
   */
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = '#4CAF50';
  }

  /**
   * Get platform bounds
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
   * Draw the platform
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} cameraX - Camera X offset
   */
  draw(ctx, cameraX) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
  }
}
