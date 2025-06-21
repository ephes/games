/**
 * @module objects/Coin
 */

/**
 * Collectible coin object
 */
export class Coin {
  /**
   * Create a coin
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {boolean} isPowerUp - Whether this coin grants shooting ability
   */
  constructor(x, y, isPowerUp = false) {
    this.x = x;
    this.y = y;
    this.width = 20;
    this.height = 20;
    this.collected = false;
    this.isPowerUp = isPowerUp;
    this.color = '#FFD700';
    this.value = 10;
  }

  /**
   * Collect the coin
   * @returns {Object} Collection result
   */
  collect() {
    if (this.collected) {
      return { collected: false };
    }

    this.collected = true;
    return {
      collected: true,
      points: this.value,
      powerUp: this.isPowerUp
    };
  }

  /**
   * Get coin bounds
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
   * Draw the coin
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} cameraX - Camera X offset
   */
  draw(ctx, cameraX) {
    if (this.collected) {
      return;
    }

    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(
      this.x - cameraX + this.width / 2,
      this.y + this.height / 2,
      this.width / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Draw power-up indicator
    if (this.isPowerUp) {
      ctx.strokeStyle = '#FFA500';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
