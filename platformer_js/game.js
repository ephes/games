class PlatformerGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.score = 0;
        this.lives = 3;
        this.gameOver = false;
        this.keys = {};
        this.projectiles = [];
        this.lastShotTime = 0;
        this.shotCooldown = 500; // Milliseconds between shots
        this.cameraX = 0;

        this.initializeGameObjects();
        this.setupEventListeners();
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
            direction: 1  // 1 for right, -1 for left
        };

        this.platforms = [
            { x: 0, y: 350, width: 3000, height: 50 },      // Extended ground
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
            { x: 350, y: 200, width: 20, height: 20, collected: false },
            { x: 150, y: 100, width: 20, height: 20, collected: false },
            { x: 550, y: 150, width: 20, height: 20, collected: false },
            { x: 850, y: 100, width: 20, height: 20, collected: false },
            { x: 1150, y: 200, width: 20, height: 20, collected: false },
            { x: 1450, y: 100, width: 20, height: 20, collected: false },
            { x: 1750, y: 150, width: 20, height: 20, collected: false },
            { x: 2050, y: 200, width: 20, height: 20, collected: false },
            { x: 2350, y: 100, width: 20, height: 20, collected: false },
            { x: 2650, y: 150, width: 20, height: 20, collected: false }
        ];

        this.enemies = [
            {
                x: 320,
                y: 220,
                width: 30,
                height: 30,
                speed: 2,
                direction: 1,
                platformIndex: 1,
                alive: true
            },
            {
                x: 120,
                y: 120,
                width: 30,
                height: 30,
                speed: 3,
                direction: 1,
                platformIndex: 2,
                alive: true
            },
            {
                x: 820,
                y: 170,
                width: 30,
                height: 30,
                speed: 2,
                direction: 1,
                platformIndex: 3,
                alive: true
            },
            {
                x: 1120,
                y: 220,
                width: 30,
                height: 30,
                speed: 3,
                direction: 1,
                platformIndex: 5,
                alive: true
            },
            {
                x: 1420,
                y: 120,
                width: 30,
                height: 30,
                speed: 2,
                direction: 1,
                platformIndex: 6,
                alive: true
            },
            {
                x: 1720,
                y: 170,
                width: 30,
                height: 30,
                speed: 3,
                direction: 1,
                platformIndex: 7,
                alive: true
            },
            {
                x: 2020,
                y: 220,
                width: 30,
                height: 30,
                speed: 2,
                direction: 1,
                platformIndex: 8,
                alive: true
            }
        ];
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === ' ') {
                this.shoot();
            }
        });
        document.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }

    shoot() {
        const currentTime = Date.now();
        if (currentTime - this.lastShotTime >= this.shotCooldown) {
            const projectile = {
                x: this.player.x + (this.player.direction > 0 ? this.player.width : 0),
                y: this.player.y + this.player.height/2,
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
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    makePlayerInvulnerable() {
        this.player.isInvulnerable = true;
        setTimeout(() => {
            this.player.isInvulnerable = false;
        }, 2000); // 2 seconds of invulnerability
    }

    update() {
        if (this.gameOver) return;

        this.updatePlayerMovement();
        this.updateProjectiles();
        this.checkPlatformCollisions();
        this.checkCoinCollisions();
        this.updateEnemies();
        this.checkEnemyCollisions();
        this.keepPlayerInBounds();
    }

    updatePlayerMovement() {
        // Get the rightmost boundary from ground platform
        const ground = this.platforms[0];
        const maxX = ground.x + ground.width - this.player.width;  // Maximum x position

        if (this.keys['ArrowLeft']) {
            this.player.x -= this.player.speed;
            this.player.direction = -1;
        }
        if (this.keys['ArrowRight']) {
            // Only allow movement if not at the boundary
            if (this.player.x + this.player.width <= maxX) {  // Changed condition here
                this.player.x += this.player.speed;
                this.player.direction = 1;
            }
        }

        // Ensure player stays within bounds
        this.player.x = Math.max(0, Math.min(maxX - this.player.width, this.player.x));  // Adjusted maxX

        // Update camera to follow player, but don't let it go past the level bounds
        const maxCameraX = maxX - this.canvas.width;
        this.cameraX = Math.max(0, Math.min(maxCameraX, this.player.x - this.canvas.width / 3));

        this.player.velocityY += this.player.gravity;
        this.player.y += this.player.velocityY;
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.x += projectile.speed * projectile.direction;

            // Remove projectiles that are too far from the player
            // Instead of using canvas width, we'll use a range relative to the camera
            if (projectile.x < this.cameraX - 100 || projectile.x > this.cameraX + this.canvas.width + 100) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check for collisions with enemies
            for (let enemy of this.enemies) {
                if (enemy.alive && this.checkCollision(projectile, enemy)) {
                    enemy.alive = false;
                    this.projectiles.splice(i, 1);
                    this.score += 50; // Bonus points for killing enemy
                    break;
                }
            }
        }
    }

    updateEnemies() {
        this.enemies.forEach(enemy => {
            if (!enemy.alive) return;
            
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
        if (this.player.isInvulnerable) return;

        for (let enemy of this.enemies) {
            if (enemy.alive && this.checkCollision(this.player, enemy)) {
                this.lives--;
                if (this.lives <= 0) {
                    this.gameOver = true;
                } else {
                    this.player.x = 50;
                    this.player.y = 200;
                    this.player.velocityY = 0;
                    this.makePlayerInvulnerable();
                }
                break;
            }
        }
    }

    checkPlatformCollisions() {
        this.player.isJumping = true;
        for (let platform of this.platforms) {
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
            }
        });
    }

    keepPlayerInBounds() {
        // Get the rightmost platform (which should be the ground)
        const ground = this.platforms[0];  // The first platform is our ground
        const maxX = ground.x + ground.width - this.player.width;  // Maximum x position

        // Prevent moving past left and right boundaries
        this.player.x = Math.max(0, Math.min(maxX, this.player.x));
        this.player.y = Math.min(this.canvas.height - this.player.height, this.player.y);
        
        // Prevent camera from showing area before start of level or after end of level
        const maxCameraX = maxX - this.canvas.width;
        this.cameraX = Math.max(0, Math.min(maxCameraX, this.cameraX));
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawPlatforms();
        this.drawCoins();
        this.drawProjectiles();
        this.drawEnemies();
        this.drawPlayer();
        this.drawScore();
        this.drawLives();
        this.drawControls();
        if (this.gameOver) this.drawGameOver();
    }

    drawPlatforms() {
        this.ctx.fillStyle = '#4CAF50';
        this.platforms.forEach(platform => {
            this.ctx.fillRect(platform.x - this.cameraX, platform.y, platform.width, platform.height);
        });
    }

    drawCoins() {
        this.ctx.fillStyle = '#FFD700';
        this.coins.forEach(coin => {
            if (!coin.collected) {
                this.ctx.beginPath();
                this.ctx.arc(coin.x -this.cameraX + coin.width/2, coin.y + coin.height/2, coin.width/2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }

    drawProjectiles() {
        this.ctx.fillStyle = '#FFD700';
        this.projectiles.forEach(projectile => {
            this.ctx.fillRect(projectile.x - this.cameraX, projectile.y, projectile.width, projectile.height);
        });
    }

    drawEnemies() {
        this.enemies.forEach(enemy => {
            if (enemy.alive) {
                this.ctx.fillStyle = '#FF0000';
                this.ctx.fillRect(enemy.x - this.cameraX, enemy.y, enemy.width, enemy.height);
            }
        });
    }

    drawPlayer() {
        this.ctx.fillStyle = this.player.isInvulnerable ? '#FFA500' : '#FF5722';
        this.ctx.fillRect(this.player.x - this.cameraX, this.player.y, this.player.width, this.player.height);
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
        this.ctx.fillText('Controls: Arrow Keys to move, SPACE to shoot', 20, this.canvas.height - 20);
    }

    drawGameOver() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Game Over!', this.canvas.width/2, this.canvas.height/2);
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width/2, this.canvas.height/2 + 40);
        this.ctx.textAlign = 'left';
    }

    gameLoop = () => {
        this.update();
        this.draw();
        requestAnimationFrame(this.gameLoop);
    }

    start() {
        this.gameLoop();
    }
}

// Initialize and start the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new PlatformerGame('gameCanvas');
    game.start();
});