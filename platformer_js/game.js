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
            { x: 0, y: 350, width: 800, height: 50 },      // Ground
            { x: 300, y: 250, width: 200, height: 20 },    // Middle platform
            { x: 100, y: 150, width: 200, height: 20 },    // Upper left platform
            { x: 500, y: 200, width: 200, height: 20 }     // Upper right platform
        ];

        this.coins = [
            { x: 350, y: 200, width: 20, height: 20, collected: false },
            { x: 150, y: 100, width: 20, height: 20, collected: false },
            { x: 550, y: 150, width: 20, height: 20, collected: false }
        ];

        this.enemies = [
            {
                x: 320,
                y: 220,
                width: 30,
                height: 30,
                speed: 2,
                direction: 1,
                platformIndex: 1,  // Index of the platform this enemy is on
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
        if (this.keys['ArrowLeft']) {
            this.player.x -= this.player.speed;
            this.player.direction = -1;
        }
        if (this.keys['ArrowRight']) {
            this.player.x += this.player.speed;
            this.player.direction = 1;
        }

        this.player.velocityY += this.player.gravity;
        this.player.y += this.player.velocityY;
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.x += projectile.speed * projectile.direction;

            // Remove projectiles that are off screen
            if (projectile.x < 0 || projectile.x > this.canvas.width) {
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
        this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
        this.player.y = Math.min(this.canvas.height - this.player.height, this.player.y);
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
            this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        });
    }

    drawCoins() {
        this.ctx.fillStyle = '#FFD700';
        this.coins.forEach(coin => {
            if (!coin.collected) {
                this.ctx.beginPath();
                this.ctx.arc(coin.x + coin.width/2, coin.y + coin.height/2, coin.width/2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }

    drawProjectiles() {
        this.ctx.fillStyle = '#FFD700';
        this.projectiles.forEach(projectile => {
            this.ctx.fillRect(projectile.x, projectile.y, projectile.width, projectile.height);
        });
    }

    drawEnemies() {
        this.enemies.forEach(enemy => {
            if (enemy.alive) {
                this.ctx.fillStyle = '#FF0000';
                this.ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
            }
        });
    }

    drawPlayer() {
        this.ctx.fillStyle = this.player.isInvulnerable ? '#FFA500' : '#FF5722';
        this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
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