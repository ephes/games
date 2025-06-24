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
    this.isLocked = true;
    this.pulseTime = 0;
  }

  /**
   * Set portal sprite
   * @param {Image} sprite - Portal sprite image
   */
  setSprite(sprite) {
    this.sprite = sprite;
  }

  /**
   * Lock the portal
   */
  lock() {
    this.isLocked = true;
  }

  /**
   * Unlock the portal
   */
  unlock() {
    this.isLocked = false;
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
    const centerX = this.x - cameraX + this.width / 2;
    const centerY = this.y + this.height / 2;
    const radius = this.width / 2;

    // Update pulse animation
    this.pulseTime += 0.05;

    if (this.sprite && this.sprite.complete) {
      // Create circular clipping region
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw portal sprite with locked effect
      if (this.isLocked) {
        // Draw darker/grayed out portal
        ctx.globalAlpha = 0.3;
      }

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
      ctx.fillStyle = this.isLocked ? '#4B0082' : '#9400D3';
      ctx.globalAlpha = this.isLocked ? 0.5 : 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw lock barrier effect
    if (this.isLocked) {
      ctx.save();

      // Red barrier circle
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.6 + Math.sin(this.pulseTime) * 0.2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
      ctx.stroke();

      // Cross lines
      ctx.lineWidth = 3;
      ctx.beginPath();

      // Diagonal cross
      const offset = radius * 0.7;
      ctx.moveTo(centerX - offset, centerY - offset);
      ctx.lineTo(centerX + offset, centerY + offset);
      ctx.moveTo(centerX + offset, centerY - offset);
      ctx.lineTo(centerX - offset, centerY + offset);

      ctx.stroke();

      // "LOCKED" text
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKED', centerX, centerY + radius + 25);

      ctx.restore();
    } else {
      // Unlocked glow effect
      ctx.save();
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 + Math.sin(this.pulseTime * 2) * 0.3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
