class PlatformerGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.score = 0;
    this.lives = 3;
    this.gameOver = false;
    this.gameWon = false;
    this.keys = {};
    this.projectiles = [];
    this.lastShotTime = 0;
    this.shotCooldown = 500; // Milliseconds between shots
    this.cameraX = 0;
    this.canShoot = false;

    this.initializeGameObjects();
    this.setupEventListeners();
    this.loadSprites();
  }

  initializeGameObjects() {
    this.player = {
      x: 50,
      y: 200,
      width: 30,
      height: 30,
      speed: 5,
      jumpForce: 12,
      gravity: 0.5,
      velocityY: 0,
      isJumping: false,
      isInvulnerable: false,
      direction: 1, // 1 for right, -1 for left
      isHit: false,
      hitAnimationTimer: 0,
      hitAnimationDuration: 500 // Duration of hit animation in milliseconds
    };

    // Add end portal
    this.portal = {
      x: 2700,
      y: 222, // Adjusted to be visible on the platform
      width: 128,
      height: 128
    };

    this.platforms = [
      { x: 0, y: 350, width: 3000, height: 50 }, // Extended ground
      { x: 300, y: 250, width: 200, height: 20 },
      { x: 100, y: 150, width: 200, height: 20 },
      { x: 500, y: 200, width: 200, height: 20 },
      { x: 800, y: 150, width: 200, height: 20 },
      { x: 1100, y: 250, width: 200, height: 20 },
      { x: 1400, y: 150, width: 200, height: 20 },
      { x: 1700, y: 200, width: 200, height: 20 },
      { x: 2000, y: 250, width: 200, height: 20 },
      { x: 2300, y: 150, width: 200, height: 20 },
      { x: 2600, y: 200, width: 200, height: 20 }
    ];

    this.coins = [
      {
        x: 350,
        y: 200,
        width: 20,
        height: 20,
        collected: false,
        isPowerUp: true
      },
      { x: 150, y: 100, width: 20, height: 20, collected: false },
      { x: 550, y: 150, width: 20, height: 20, collected: false },
      { x: 850, y: 100, width: 20, height: 20, collected: false },
      { x: 1150, y: 200, width: 20, height: 20, collected: false },
      { x: 1450, y: 100, width: 20, height: 20, collected: false },
      { x: 1750, y: 150, width: 20, height: 20, collected: false },
      { x: 2050, y: 200, width: 20, height: 20, collected: false },
      { x: 2350, y: 100, width: 20, height: 20, collected: false },
      {
        x: 2650,
        y: 150,
        width: 20,
        height: 20,
        collected: false,
        isPowerUp: true
      }
    ];

    this.enemies = [
      {
        x: 320,
        y: 220,
        width: 44,
        height: 30,
        speed: 2,
        direction: 1,
        platformIndex: 1,
        alive: true,
        isHit: false,
        hitAnimationTimer: 0,
        hitAnimationDuration: 300,
        frameX: 0,
        frameTimer: 0,
        animationSpeed: 20
      },
      {
        x: 120,
        y: 120,
        width: 44,
        height: 30,
        speed: 3,
        direction: 1,
        platformIndex: 2,
        alive: true,
        isHit: false,
        hitAnimationTimer: 0,
        hitAnimationDuration: 300,
        frameX: 0,
        frameTimer: 0,
        animationSpeed: 20
      },
      {
        x: 820,
        y: 170,
        width: 44,
        height: 30,
        speed: 2,
        direction: 1,
        platformIndex: 3,
        alive: true,
        isHit: false,
        hitAnimationTimer: 0,
        hitAnimationDuration: 300,
        frameX: 0,
        frameTimer: 0,
        animationSpeed: 20
      },
      {
        x: 1120,
        y: 220,
        width: 44,
        height: 30,
        speed: 3,
        direction: 1,
        platformIndex: 5,
        alive: true,
        isHit: false,
        hitAnimationTimer: 0,
        hitAnimationDuration: 300,
        frameX: 0,
        frameTimer: 0,
        animationSpeed: 20
      },
      {
        x: 1420,
        y: 120,
        width: 44,
        height: 30,
        speed: 2,
        direction: 1,
        platformIndex: 6,
        alive: true,
        isHit: false,
        hitAnimationTimer: 0,
        hitAnimationDuration: 300,
        frameX: 0,
        frameTimer: 0,
        animationSpeed: 20
      },
      {
        x: 1720,
        y: 170,
        width: 44,
        height: 30,
        speed: 3,
        direction: 1,
        platformIndex: 7,
        alive: true,
        isHit: false,
        hitAnimationTimer: 0,
        hitAnimationDuration: 300,
        frameX: 0,
        frameTimer: 0,
        animationSpeed: 20
      },
      {
        x: 2020,
        y: 220,
        width: 44,
        height: 30,
        speed: 2,
        direction: 1,
        platformIndex: 8,
        alive: true,
        isHit: false,
        hitAnimationTimer: 0,
        hitAnimationDuration: 300,
        frameX: 0,
        frameTimer: 0,
        animationSpeed: 20
      }
    ];

    // Add boss (cobra) on the last platform
    this.boss = {
      x: 2600,
      y: 150, // On the last platform
      width: 128,
      height: 128,
      speed: 2,
      direction: 1,
      platformIndex: 10, // last platform
      health: 10,
      alive: true,
      frameX: 0,
      frameY: 0,
      frameCountX: 5,
      frameCountY: 2,
      frameTimer: 0,
      frameInterval: 1000 / 10, // 10 FPS
      hitTimer: 0,
      hitDuration: 400,
      isHit: false
    };
  }

  setupEventListeners() {
    document.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      if (e.key === ' ') {
        this.shoot();
      }
    });
    document.addEventListener('keyup', e => (this.keys[e.key] = false));
  }

  shoot() {
    if (!this.canShoot) {
      return;
    }
    const currentTime = Date.now();
    if (currentTime - this.lastShotTime >= this.shotCooldown) {
      const projectile = {
        x: this.player.x + (this.player.direction > 0 ? this.player.width : 0),
        y: this.player.y + this.player.height / 2,
        width: 10,
        height: 5,
        speed: 10,
        direction: this.player.direction
      };
      this.projectiles.push(projectile);
      this.lastShotTime = currentTime;
    }
  }

  checkCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  makePlayerInvulnerable() {
    this.player.isInvulnerable = true;
    this.player.isHit = true;
    this.player.hitAnimationTimer = performance.now();

    // Separate timeout for hit animation
    setTimeout(() => {
      this.player.isHit = false;
    }, this.player.hitAnimationDuration);

    // Original invulnerability timeout
    setTimeout(() => {
      this.player.isInvulnerable = false;
    }, 2000);
  }

  update() {
    if (this.gameOver || this.gameWon) {
      return;
    }

    this.updatePlayerMovement();
    this.updateProjectiles();
    this.checkPlatformCollisions();
    this.checkCoinCollisions();
    this.updateEnemies();
    this.checkEnemyCollisions();
    this.checkPortalCollision();
    this.keepPlayerInBounds();
    this.updateBoss();
  }

  updatePlayerMovement() {
    // Get the rightmost boundary from ground platform
    const ground = this.platforms[0];
    const maxX = ground.x + ground.width - this.player.width; // Maximum x position

    if (this.keys['ArrowLeft']) {
      this.player.x -= this.player.speed;
      this.player.direction = -1;
    }
    if (this.keys['ArrowRight']) {
      // Only allow movement if not at the boundary
      if (this.player.x + this.player.width <= maxX) {
        // Changed condition here
        this.player.x += this.player.speed;
        this.player.direction = 1;
      }
    }

    // Ensure player stays within bounds
    this.player.x = Math.max(
      0,
      Math.min(maxX - this.player.width, this.player.x)
    ); // Adjusted maxX

    // Update camera to follow player, but don't let it go past the level bounds
    const maxCameraX = maxX - this.canvas.width;
    this.cameraX = Math.max(
      0,
      Math.min(maxCameraX, this.player.x - this.canvas.width / 3)
    );

    this.player.velocityY += this.player.gravity;
    this.player.y += this.player.velocityY;
  }

  updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.x += projectile.speed * projectile.direction;

      // Remove projectiles that are too far from the player
      // Instead of using canvas width, we'll use a range relative to the camera
      if (
        projectile.x < this.cameraX - 100 ||
        projectile.x > this.cameraX + this.canvas.width + 100
      ) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check for collisions with enemies
      for (const enemy of this.enemies) {
        if (enemy.alive && this.checkCollision(projectile, enemy)) {
          // Start hit animation
          enemy.isHit = true;
          enemy.hitAnimationTimer = performance.now();
          enemy.frameX = 0; // Reset animation frame

          // Mark as dead after animation
          setTimeout(() => {
            enemy.alive = false;
          }, enemy.hitAnimationDuration);

          this.projectiles.splice(i, 1);
          this.score += 50;
          break;
        }
      }

      // Check for collisions with boss
      const boss = this.boss;
      if (boss.alive && this.checkCollision(projectile, boss)) {
        boss.isHit = true;
        boss.hitTimer = performance.now();
        boss.health--;
        if (boss.health <= 0) {
          boss.alive = false;
          this.score += 200;
        } else {
          this.score += 20;
        }
        this.projectiles.splice(i, 1);
        continue;
      }
    }
  }

  updateEnemies() {
    this.enemies.forEach(enemy => {
      if (!enemy.alive) {
        return;
      }

      // Move enemy
      enemy.x += enemy.speed * enemy.direction;

      // Get the platform this enemy is on
      const platform = this.platforms[enemy.platformIndex];

      // Check if enemy has reached the platform edges
      if (enemy.x <= platform.x) {
        enemy.x = platform.x;
        enemy.direction = 1;
      } else if (enemy.x + enemy.width >= platform.x + platform.width) {
        enemy.x = platform.x + platform.width - enemy.width;
        enemy.direction = -1;
      }
    });
  }

  checkEnemyCollisions() {
    if (this.player.isInvulnerable) {
      return;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      if (this.checkCollision(this.player, enemy)) {
        // Check if player is falling onto the enemy from above
        const playerBottom = this.player.y + this.player.height;
        const enemyTop = enemy.y;
        const playerFalling = this.player.velocityY > 0;

        if (
          playerFalling &&
          playerBottom >= enemyTop &&
          playerBottom - enemyTop <= this.player.velocityY + 10
        ) {
          // Player jumped on enemy
          enemy.isHit = true;
          enemy.hitAnimationTimer = performance.now();
          enemy.frameX = 0; // Reset animation frame

          // Mark as dead after animation
          setTimeout(() => {
            enemy.alive = false;
          }, enemy.hitAnimationDuration);

          // Bounce the player
          this.player.velocityY = -this.player.jumpForce * 0.7;
          this.score += 50;
        } else {
          // Player collided with enemy from the side or below
          this.lives--;
          if (this.lives <= 0) {
            this.gameOver = true;
          } else {
            this.player.x = 50;
            this.player.y = 200;
            this.player.velocityY = 0;
            this.makePlayerInvulnerable();
          }
        }
        break;
      }
    }

    // Check boss collision
    const boss = this.boss;
    if (boss.alive && this.checkCollision(this.player, boss)) {
      // Check if player is falling onto the boss from above
      const playerBottom = this.player.y + this.player.height;
      const bossTop = boss.y;
      const playerFalling = this.player.velocityY > 0;
      if (
        playerFalling &&
        playerBottom >= bossTop &&
        playerBottom - bossTop <= this.player.velocityY + 10
      ) {
        // Player jumped on boss
        boss.isHit = true;
        boss.hitTimer = performance.now();
        boss.health--;
        this.player.velocityY = -this.player.jumpForce * 0.7;
        if (boss.health <= 0) {
          boss.alive = false;
          this.score += 200;
        } else {
          this.score += 20;
        }
      } else {
        // Player hit by boss
        this.lives--;
        if (this.lives <= 0) {
          this.gameOver = true;
        } else {
          this.player.x = 50;
          this.player.y = 200;
          this.player.velocityY = 0;
          this.makePlayerInvulnerable();
        }
      }
    }
  }

  checkPlatformCollisions() {
    this.player.isJumping = true;
    for (const platform of this.platforms) {
      if (this.checkCollision(this.player, platform)) {
        if (this.player.velocityY > 0) {
          this.player.isJumping = false;
          this.player.velocityY = 0;
          this.player.y = platform.y - this.player.height;
        } else if (this.player.velocityY < 0) {
          this.player.velocityY = 0;
          this.player.y = platform.y + platform.height;
        }
      }
    }

    if (this.keys['ArrowUp'] && !this.player.isJumping) {
      this.player.velocityY = -this.player.jumpForce;
    }
  }

  checkCoinCollisions() {
    this.coins.forEach(coin => {
      if (!coin.collected && this.checkCollision(this.player, coin)) {
        coin.collected = true;
        this.score += 10;
        if (coin.isPowerUp) {
          this.canShoot = true;
        }
      }
    });
  }

  checkPortalCollision() {
    if (this.checkCollision(this.player, this.portal)) {
      // Calculate how centered the player is within the portal
      const playerCenterX = this.player.x + this.player.width / 2;
      const playerCenterY = this.player.y + this.player.height / 2;
      const portalCenterX = this.portal.x + this.portal.width / 2;
      const portalCenterY = this.portal.y + this.portal.height / 2;

      // Calculate distance from player center to portal center
      const dx = playerCenterX - portalCenterX;
      const dy = playerCenterY - portalCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Only trigger win when the player is reasonably close to the center (within 60% of portal radius)
      const portalRadius = this.portal.width / 2;
      if (distance < portalRadius * 0.6) {
        this.gameWon = true;
      }
    }
  }

  keepPlayerInBounds() {
    // Get the rightmost platform (which should be the ground)
    const ground = this.platforms[0]; // The first platform is our ground
    const maxX = ground.x + ground.width - this.player.width; // Maximum x position

    // Prevent moving past left and right boundaries
    this.player.x = Math.max(0, Math.min(maxX, this.player.x));
    this.player.y = Math.min(
      this.canvas.height - this.player.height,
      this.player.y
    );

    // Prevent camera from showing area before start of level or after end of level
    const maxCameraX = maxX - this.canvas.width;
    this.cameraX = Math.max(0, Math.min(maxCameraX, this.cameraX));
  }

  updateBoss() {
    const boss = this.boss;
    if (!boss.alive) {
      return;
    }
    // Move boss back and forth on its platform
    const platform = this.platforms[boss.platformIndex];
    boss.x += boss.speed * boss.direction;
    if (boss.x <= platform.x) {
      boss.x = platform.x;
      boss.direction = 1;
    } else if (boss.x + boss.width >= platform.x + platform.width) {
      boss.x = platform.x + platform.width - boss.width;
      boss.direction = -1;
    }
    // Animate boss
    if (performance.now() - boss.frameTimer > boss.frameInterval) {
      boss.frameTimer = performance.now();
      boss.frameX = (boss.frameX + 1) % boss.frameCountX;
      if (boss.frameX === 0) {
        boss.frameY = (boss.frameY + 1) % boss.frameCountY;
      }
    }
    // Handle hit animation
    if (boss.isHit && performance.now() - boss.hitTimer > boss.hitDuration) {
      boss.isHit = false;
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawPlatforms();
    this.drawCoins();
    this.drawProjectiles();
    this.drawEnemies();
    this.drawBoss();
    this.drawPortal();
    this.drawPlayer();
    this.drawScore();
    this.drawLives();
    this.drawControls();
    if (this.gameOver) {
      this.drawGameOver();
    }
    if (this.gameWon) {
      this.drawGameWon();
    }
  }

  drawPlatforms() {
    this.ctx.fillStyle = '#4CAF50';
    this.platforms.forEach(platform => {
      this.ctx.fillRect(
        platform.x - this.cameraX,
        platform.y,
        platform.width,
        platform.height
      );
    });
  }

  drawCoins() {
    this.coins.forEach(coin => {
      if (!coin.collected) {
        this.ctx.beginPath();
        this.ctx.fillStyle = '#FFD700';
        this.ctx.arc(
          coin.x - this.cameraX + coin.width / 2,
          coin.y + coin.height / 2,
          coin.width / 2,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }
    });
  }

  drawProjectiles() {
    this.ctx.fillStyle = '#FFD700';
    this.projectiles.forEach(projectile => {
      this.ctx.fillRect(
        projectile.x - this.cameraX,
        projectile.y,
        projectile.width,
        projectile.height
      );
    });
  }

  drawEnemies() {
    this.enemies.forEach(enemy => {
      // Don't draw if enemy is dead and hit animation is complete
      if (
        !enemy.alive &&
        (!enemy.isHit ||
          performance.now() - enemy.hitAnimationTimer >
            enemy.hitAnimationDuration)
      ) {
        return;
      }

      let currentSprite;
      let frameCount;

      if (enemy.isHit) {
        currentSprite = this.sprites.enemy.hit;
        frameCount = 5; // Hit animation frames

        // Update animation frame at higher speed
        if (
          performance.now() - enemy.frameTimer >
          1000 / enemy.animationSpeed
        ) {
          // 20 FPS animation
          enemy.frameTimer = performance.now();
          enemy.frameX = (enemy.frameX + 1) % frameCount;
        }
      } else {
        currentSprite = this.sprites.enemy.run;
        frameCount = 10; // Run animation frames

        // Keep normal run animation at 15 FPS
        if (performance.now() - enemy.frameTimer > 1000 / 15) {
          enemy.frameTimer = performance.now();
          enemy.frameX = (enemy.frameX + 1) % frameCount;
        }
      }

      // Draw the sprite
      this.ctx.save();
      if (enemy.direction === -1) {
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(
          currentSprite,
          enemy.frameX * 44, // Source width is 44
          0,
          44, // Source width is 44
          30, // Source height is 30
          -(enemy.x - this.cameraX + enemy.width),
          enemy.y,
          44, // Destination width should match enemy.width (44)
          30 // Destination height should match enemy.height (30)
        );
      } else {
        this.ctx.drawImage(
          currentSprite,
          enemy.frameX * 44,
          0,
          44,
          30,
          enemy.x - this.cameraX,
          enemy.y,
          44,
          30
        );
      }
      this.ctx.restore();
    });
  }

  drawPlayer() {
    let currentSprite;
    let currentFrameCount;

    // Check if hit animation should still be playing
    if (
      this.player.isHit &&
      performance.now() - this.player.hitAnimationTimer <
        this.player.hitAnimationDuration
    ) {
      currentSprite = this.sprites.player.hit;
      currentFrameCount = this.playerAnimation.frameCount.hit;
    } else {
      this.player.isHit = false; // End hit state if animation is complete
      // First check if player is hit
      if (this.player.isHit) {
        currentSprite = this.sprites.player.hit;
        currentFrameCount = this.playerAnimation.frameCount.hit;
      } else if (this.player.isJumping) {
        if (this.player.velocityY < 0) {
          currentSprite = this.sprites.player.jump;
          currentFrameCount = this.playerAnimation.frameCount.jump;
        } else {
          currentSprite = this.sprites.player.fall;
          currentFrameCount = this.playerAnimation.frameCount.fall;
        }
      } else if (this.keys['ArrowLeft'] || this.keys['ArrowRight']) {
        currentSprite = this.sprites.player.run;
        currentFrameCount = this.playerAnimation.frameCount.run;
      } else {
        currentSprite = this.sprites.player.idle;
        currentFrameCount = this.playerAnimation.frameCount.idle;
      }
    }

    // Update animation frame only for sprites with multiple frames
    if (
      currentFrameCount > 1 &&
      performance.now() - this.playerAnimation.frameTimer >
        this.playerAnimation.frameInterval
    ) {
      this.playerAnimation.frameTimer = performance.now();
      this.playerAnimation.frameX =
        (this.playerAnimation.frameX + 1) % currentFrameCount;
    }

    // For single-frame sprites, always use frame 0
    if (currentFrameCount === 1) {
      this.playerAnimation.frameX = 0;
    }

    // Draw the sprite
    this.ctx.save();
    if (this.player.direction === -1) {
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        currentSprite,
        this.playerAnimation.frameX * this.playerAnimation.frameWidth,
        this.playerAnimation.frameY,
        this.playerAnimation.frameWidth,
        this.playerAnimation.frameHeight,
        -(this.player.x - this.cameraX + this.player.width),
        this.player.y,
        this.player.width,
        this.player.height
      );
    } else {
      this.ctx.drawImage(
        currentSprite,
        this.playerAnimation.frameX * this.playerAnimation.frameWidth,
        this.playerAnimation.frameY,
        this.playerAnimation.frameWidth,
        this.playerAnimation.frameHeight,
        this.player.x - this.cameraX,
        this.player.y,
        this.player.width,
        this.player.height
      );
    }
    this.ctx.restore();
  }

  drawScore() {
    this.ctx.fillStyle = 'black';
    this.ctx.font = '20px Arial';
    this.ctx.fillText(`Score: ${this.score}`, 20, 30);
  }

  drawLives() {
    this.ctx.fillStyle = 'red';
    this.ctx.font = '20px Arial';
    this.ctx.fillText(`Lives: ${this.lives}`, 20, 60);
  }

  drawControls() {
    this.ctx.fillStyle = 'black';
    this.ctx.font = '16px Arial';
    let controls = 'Controls: Arrow Keys to move';
    if (this.canShoot) {
      controls += ', SPACE to shoot';
    }
    this.ctx.fillText(controls, 20, this.canvas.height - 20);
  }

  drawGameOver() {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = 'white';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      'Game Over!',
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    this.ctx.font = '24px Arial';
    this.ctx.fillText(
      `Final Score: ${this.score}`,
      this.canvas.width / 2,
      this.canvas.height / 2 + 40
    );
    this.ctx.textAlign = 'left';
  }

  drawGameWon() {
    this.ctx.fillStyle = 'rgba(0, 100, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = 'white';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      'You Won!',
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    this.ctx.font = '24px Arial';
    this.ctx.fillText(
      `Final Score: ${this.score}`,
      this.canvas.width / 2,
      this.canvas.height / 2 + 40
    );
    this.ctx.textAlign = 'left';
  }

  drawPortal() {
    // Create a circular clipping region to remove white corners
    this.ctx.save();

    // Create a circular mask for the portal
    this.ctx.beginPath();
    const centerX = this.portal.x - this.cameraX + this.portal.width / 2;
    const centerY = this.portal.y + this.portal.height / 2;
    const radius = this.portal.width / 2;
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.closePath();
    this.ctx.clip();

    // Draw the portal image inside the clipped region
    this.ctx.drawImage(
      this.sprites.portal,
      this.portal.x - this.cameraX,
      this.portal.y,
      this.portal.width,
      this.portal.height
    );

    this.ctx.restore();
  }

  drawBoss() {
    const boss = this.boss;
    if (!boss.alive) {
      return;
    }
    const sx = boss.frameX * boss.width;
    const sy = boss.frameY * boss.height;
    this.ctx.save();
    if (boss.direction === -1) {
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        this.sprites.boss,
        sx,
        sy,
        boss.width,
        boss.height,
        -(boss.x - this.cameraX + boss.width),
        boss.y,
        boss.width,
        boss.height
      );
    } else {
      this.ctx.drawImage(
        this.sprites.boss,
        sx,
        sy,
        boss.width,
        boss.height,
        boss.x - this.cameraX,
        boss.y,
        boss.width,
        boss.height
      );
    }
    // Draw health bar
    this.ctx.restore();
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(boss.x - this.cameraX, boss.y - 16, boss.width, 10);
    this.ctx.fillStyle = 'lime';
    this.ctx.fillRect(
      boss.x - this.cameraX,
      boss.y - 16,
      boss.width * (boss.health / 10),
      10
    );
  }

  gameLoop = () => {
    this.update();
    this.draw();
    requestAnimationFrame(this.gameLoop);
  };

  start() {
    this.gameLoop();
  }

  loadSprites() {
    // from here: https://pixelfrog-assets.itch.io/pixel-adventure-1
    this.sprites = {
      player: {
        idle: new Image(),
        run: new Image(),
        jump: new Image(),
        fall: new Image(),
        hit: new Image()
      },
      enemy: {
        run: new Image(),
        hit: new Image()
      },
      portal: new Image(),
      boss: new Image()
    };

    // Load sprite sheets
    this.sprites.player.idle.src = 'img/pink-man-idle.png';
    this.sprites.player.run.src = 'img/pink-man-run.png';
    this.sprites.player.jump.src = 'img/pink-man-jump.png';
    this.sprites.player.fall.src = 'img/pink-man-fall.png';
    this.sprites.player.hit.src = 'img/pink-man-hit.png';

    this.playerAnimation = {
      frameX: 0,
      frameY: 0,
      frameWidth: 32,
      frameHeight: 32,
      frameCount: {
        idle: 11,
        run: 12,
        jump: 1,
        fall: 1,
        hit: 7
      },
      frameTimer: 0,
      frameInterval: 1000 / 15
    };

    // Load enemy sprites
    this.sprites.enemy.run.src = 'img/slime-run.png';
    this.sprites.enemy.hit.src = 'img/slime-hit.png';

    // Load portal sprite
    this.sprites.portal.src = 'img/level_portal_128.png';
    this.sprites.portal.loaded = true; // Set to true by default

    // Load boss sprite
    this.sprites.boss.src = 'img/cobra_boss_moving.png';
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformerGame;
}
if (typeof window !== 'undefined') {
  window.PlatformerGame = PlatformerGame;
}

// Initialize and start the game
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const game = new PlatformerGame('gameCanvas');
    game.start();
  });
}
