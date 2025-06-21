/**
 * @module objects/Portal
 */

/**
 * Portal object - level exit
 */
export class Portal {
  /**
   * Create a portal
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 128;
    this.height = 128;
    this.sprite = null;
  }

  /**
   * Set portal sprite
   * @param {Image} sprite - Portal sprite image
   */
  setSprite(sprite) {
    this.sprite = sprite;
  }

  /**
   * Get portal bounds
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
   * Draw the portal
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} cameraX - Camera X offset
   */
  draw(ctx, cameraX) {
    if (this.sprite && this.sprite.complete) {
      // Create circular clipping region
      ctx.save();
      ctx.beginPath();

      const centerX = this.x - cameraX + this.width / 2;
      const centerY = this.y + this.height / 2;
      const radius = this.width / 2;

      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw portal sprite
      ctx.drawImage(
        this.sprite,
        this.x - cameraX,
        this.y,
        this.width,
        this.height
      );

      ctx.restore();
    } else {
      // Fallback drawing if sprite not loaded
      ctx.fillStyle = '#9400D3';
      ctx.beginPath();
      ctx.arc(
        this.x - cameraX + this.width / 2,
        this.y + this.height / 2,
        this.width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}
