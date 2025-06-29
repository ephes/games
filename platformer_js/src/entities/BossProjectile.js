export class BossProjectile {
  constructor(x, y, direction, speed = 5) {
    this.x = x;
    this.y = y;
    this.width = 16;
    this.height = 16;
    this.velocityX = direction * speed;
    this.velocityY = 0;
    this.active = true;
    this.damage = 1;

    // Animation
    this.currentFrame = 0;
    this.animationSpeed = 0.2;
    this.animationTimer = 0;
    this.frameCount = 4;
  }

  update(_deltaTime) {
    if (!this.active) {
      return;
    }

    // Update position
    this.x += this.velocityX;
    this.y += this.velocityY;

    // Update animation
    this.animationTimer += this.animationSpeed;
    if (this.animationTimer >= 1) {
      this.animationTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % this.frameCount;
    }

    // Deactivate if off screen (level is 3000 wide)
    if (this.x < -200 || this.x > 3200 || this.y < -100 || this.y > 800) {
      this.active = false;
    }
  }

  draw(ctx, _camera) {
    if (!this.active) {
      return;
    }

    // Camera transform is already applied, so just use world coordinates
    const screenX = this.x;
    const screenY = this.y;

    // Draw fireball (will be replaced with sprite)
    ctx.save();
    ctx.fillStyle = '#FF6600';
    ctx.beginPath();
    ctx.arc(
      screenX + this.width / 2,
      screenY + this.height / 2,
      this.width / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Inner glow
    ctx.fillStyle = '#FFAA00';
    ctx.beginPath();
    ctx.arc(
      screenX + this.width / 2,
      screenY + this.height / 2,
      this.width / 3,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Core
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.arc(
      screenX + this.width / 2,
      screenY + this.height / 2,
      this.width / 6,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  drawWithSprite(ctx, _camera, sprite) {
    if (!this.active || !sprite) {
      return;
    }

    // Camera transform is already applied, so just use world coordinates
    const screenX = this.x;
    const screenY = this.y;

    // Draw sprite frame
    const frameWidth = 16;
    const sourceX = this.currentFrame * frameWidth;

    ctx.drawImage(
      sprite,
      sourceX,
      0,
      frameWidth,
      this.height,
      screenX,
      screenY,
      this.width,
      this.height
    );
  }
}
