class PlatformerGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.score = 0;
        this.keys = {};

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
            isJumping: false
        };

        this.platforms = [
            { x: 0, y: 350, width: 800, height: 50 },
            { x: 300, y: 250, width: 200, height: 20 },
            { x: 100, y: 150, width: 200, height: 20 },
            { x: 500, y: 200, width: 200, height: 20 }
        ];

        this.coins = [
            { x: 350, y: 200, width: 20, height: 20, collected: false },
            { x: 150, y: 100, width: 20, height: 20, collected: false },
            { x: 550, y: 150, width: 20, height: 20, collected: false }
        ];
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.keys[e.key] = true);
        document.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }

    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    update() {
        this.updatePlayerMovement();
        this.checkPlatformCollisions();
        this.checkCoinCollisions();
        this.keepPlayerInBounds();
    }

    updatePlayerMovement() {
        if (this.keys['ArrowLeft']) this.player.x -= this.player.speed;
        if (this.keys['ArrowRight']) this.player.x += this.player.speed;

        this.player.velocityY += this.player.gravity;
        this.player.y += this.player.velocityY;
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
        this.drawPlayer();
        this.drawScore();
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

    drawPlayer() {
        this.ctx.fillStyle = '#FF5722';
        this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
    }

    drawScore() {
        this.ctx.fillStyle = 'black';
        this.ctx.font = '20px Arial';
        this.ctx.fillText(`Score: ${this.score}`, 20, 30);
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
