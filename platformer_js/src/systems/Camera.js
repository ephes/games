/**
 * @module systems/Camera
 */

/**
 * Camera system for viewport management
 */
export class Camera {
  /**
   * Create camera
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   */
  constructor(width, height) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.bounds = null;
  }

  /**
   * Set camera bounds
   * @param {Object} bounds - Camera movement bounds
   */
  setBounds(bounds) {
    this.bounds = bounds;
  }

  /**
   * Update camera to follow target
   * @param {Object} target - Target to follow (usually player)
   */
  follow(target) {
    // Center camera on target with offset
    this.x = target.x - this.width / 3;

    // Apply bounds if set
    if (this.bounds) {
      this.x = Math.max(
        this.bounds.minX,
        Math.min(this.bounds.maxX - this.width, this.x)
      );
      this.y = Math.max(
        this.bounds.minY,
        Math.min(this.bounds.maxY - this.height, this.y)
      );
    }
  }

  /**
   * Check if object is visible in camera view
   * @param {Object} object - Object with x, y, width, height
   * @returns {boolean} True if visible
   */
  isVisible(object) {
    return (
      object.x + object.width >= this.x &&
      object.x <= this.x + this.width &&
      object.y + object.height >= this.y &&
      object.y <= this.y + this.height
    );
  }

  /**
   * Convert world coordinates to screen coordinates
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {Object} Screen coordinates
   */
  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.x,
      y: worldY - this.y
    };
  }

  /**
   * Apply camera transform to context
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  applyTransform(ctx) {
    ctx.translate(-this.x, -this.y);
  }
}
