/**
 * @module rendering/Renderer
 */

/**
 * Main rendering system
 */
export class Renderer {
  /**
   * Create renderer
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {Object} sprites - Sprite loader instance
   */
  constructor(canvas, sprites) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = sprites;
    this.animationConfigs = sprites.getAnimationConfig();
  }

  /**
   * Clear the canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw player sprite
   * @param {Object} player - Player object
   * @param {number} cameraX - Camera X offset
   */
  drawPlayer(player) {
    const config = this.animationConfigs.player;
    const sprite = this.sprites.getSprite(`player.${player.currentAnimation}`);

    if (!sprite) {
      return;
    }

    // Calculate frame position
    const frameX = player.animationFrame * config.frameWidth;
    const frameY = 0;

    this.ctx.save();

    // Flip sprite if facing left
    if (player.direction === -1) {
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        sprite,
        frameX,
        frameY,
        config.frameWidth,
        config.frameHeight,
        -(player.x + player.width),
        player.y,
        player.width,
        player.height
      );
    } else {
      this.ctx.drawImage(
        sprite,
        frameX,
        frameY,
        config.frameWidth,
        config.frameHeight,
        player.x,
        player.y,
        player.width,
        player.height
      );
    }

    this.ctx.restore();
  }

  /**
   * Draw enemy sprite
   * @param {Object} enemy - Enemy object
   * @param {number} cameraX - Camera X offset
   */
  drawEnemy(enemy) {
    if (!enemy.alive && !enemy.isInHitAnimation()) {
      return;
    }

    const config = this.animationConfigs.enemy;
    const animState = enemy.getAnimationState();
    const sprite = this.sprites.getSprite(`enemy.${animState}`);

    if (!sprite) {
      return;
    }

    const frameX = enemy.frameX * config.frameWidth;

    this.ctx.save();

    if (enemy.direction === -1) {
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        sprite,
        frameX,
        0,
        config.frameWidth,
        config.frameHeight,
        -(enemy.x + enemy.width),
        enemy.y,
        enemy.width,
        enemy.height
      );
    } else {
      this.ctx.drawImage(
        sprite,
        frameX,
        0,
        config.frameWidth,
        config.frameHeight,
        enemy.x,
        enemy.y,
        enemy.width,
        enemy.height
      );
    }

    this.ctx.restore();
  }

  /**
   * Draw boss sprite with health bar
   * @param {Object} boss - Boss object
   * @param {number} cameraX - Camera X offset
   */
  drawBoss(boss) {
    if (!boss.alive && !boss.isInHitAnimation()) {
      return;
    }

    const sprite = this.sprites.getSprite('boss');
    if (!sprite) {
      return;
    }

    const config = this.animationConfigs.boss;
    const sx = boss.frameX * config.frameWidth;
    const sy = 0; // Single row sprite sheet

    this.ctx.save();

    // Enable image smoothing for better animation
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    // Draw the boss sprite first
    if (boss.direction === -1) {
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        sprite,
        sx,
        sy,
        config.frameWidth,
        config.frameHeight,
        -(boss.x + boss.width),
        boss.y,
        boss.width,
        boss.height
      );
    } else {
      this.ctx.drawImage(
        sprite,
        sx,
        sy,
        config.frameWidth,
        config.frameHeight,
        boss.x,
        boss.y,
        boss.width,
        boss.height
      );
    }

    // Apply hit effect overlay after drawing the sprite
    if (boss.isHit) {
      // Create a more stable flash effect with slower pulsing
      const timeSinceHit = Date.now() - boss.hitTimer;
      const flashPhase = timeSinceHit / boss.hitDuration;
      const flashIntensity = Math.max(0, 1 - flashPhase) * 0.6; // Fade out over hit duration

      this.ctx.globalCompositeOperation = 'source-atop';
      this.ctx.fillStyle = `rgba(255, 100, 100, ${flashIntensity})`;
      this.ctx.fillRect(
        boss.direction === -1 ? -(boss.x + boss.width) : boss.x,
        boss.y,
        boss.width,
        boss.height
      );
      this.ctx.globalCompositeOperation = 'source-over';
    }

    this.ctx.restore();

    // Draw health bar only if boss is alive
    if (boss.alive) {
      this.drawHealthBar(
        boss.x,
        boss.y - 16,
        boss.width,
        10,
        boss.getHealthPercentage()
      );
    }

    // Debug overlay
    if (window.DEBUG_BOSS) {
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(boss.x - 50, boss.y - 50, 150, 30);
      this.ctx.fillStyle = 'black';
      this.ctx.font = '12px monospace';
      this.ctx.fillText(
        `Frame: ${boss.frameX} Seq: ${boss.sequenceIndex}`,
        boss.x - 45,
        boss.y - 35
      );
      this.ctx.fillText(
        `Timer: ${Date.now() - boss.frameTimer}ms`,
        boss.x - 45,
        boss.y - 25
      );

      // Draw frame boundaries
      this.ctx.strokeStyle = 'red';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(boss.x, boss.y, boss.width, boss.height);
    }
  }

  /**
   * Draw health bar
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Bar width
   * @param {number} height - Bar height
   * @param {number} percentage - Health percentage (0-1)
   */
  drawHealthBar(x, y, width, height, percentage) {
    // Background
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(x, y, width, height);

    // Health
    this.ctx.fillStyle = 'lime';
    this.ctx.fillRect(x, y, width * percentage, height);
  }

  /**
   * Draw UI text
   * @param {string} text - Text to draw
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {Object} options - Text options
   */
  drawText(text, x, y, options = {}) {
    this.ctx.fillStyle = options.color || 'black';
    this.ctx.font = options.font || '20px Arial';
    this.ctx.textAlign = options.align || 'left';
    this.ctx.fillText(text, x, y);
  }

  /**
   * Draw game over screen
   * @param {number} score - Final score
   */
  drawGameOver(score) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawText('Game Over!', this.canvas.width / 2, this.canvas.height / 2, {
      color: 'white',
      font: '48px Arial',
      align: 'center'
    });

    this.drawText(
      `Final Score: ${score}`,
      this.canvas.width / 2,
      this.canvas.height / 2 + 40,
      {
        color: 'white',
        font: '24px Arial',
        align: 'center'
      }
    );
  }

  /**
   * Draw win screen
   * @param {number} score - Final score
   */
  drawWinScreen(score) {
    this.ctx.fillStyle = 'rgba(0, 100, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawText('You Won!', this.canvas.width / 2, this.canvas.height / 2, {
      color: 'white',
      font: '48px Arial',
      align: 'center'
    });

    this.drawText(
      `Final Score: ${score}`,
      this.canvas.width / 2,
      this.canvas.height / 2 + 40,
      {
        color: 'white',
        font: '24px Arial',
        align: 'center'
      }
    );
  }
}
