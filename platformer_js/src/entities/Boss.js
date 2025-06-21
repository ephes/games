/**
 * @module entities/Boss
 */

import { Enemy } from './Enemy.js';

/**
 * Boss enemy class
 * @extends Enemy
 */
export class Boss extends Enemy {
  /**
   * Create a new boss
   * @param {Object} config - Boss configuration
   */
  constructor(config) {
    super(config);

    // Override default size
    this.width = 128;
    this.height = 128;
    this.health = 10;
    this.maxHealth = 10;

    // Boss-specific animation properties
    this.frameY = 0;
    this.frameCountX = 5;
    this.frameCountY = 2;
    this.frameInterval = 1000 / 10; // 10 FPS
    this.hitTimer = 0;
    this.hitDuration = 400;
  }

  /**
   * Update boss state
   * @param {Array} platforms - List of platforms
   * @param {number} deltaTime - Time since last update
   */
  update(platforms, deltaTime) {
    if (!this.alive) {
      return;
    }

    // Call parent update for movement
    super.update(platforms, deltaTime);

    // Update boss-specific animation
    this.updateBossAnimation();

    // Handle hit animation
    if (this.isHit && Date.now() - this.hitTimer > this.hitDuration) {
      this.isHit = false;
    }
  }

  /**
   * Update boss animation frames
   */
  updateBossAnimation() {
    const now = Date.now();

    if (now - this.frameTimer > this.frameInterval) {
      this.frameTimer = now;
      this.frameX = (this.frameX + 1) % this.frameCountX;
      if (this.frameX === 0) {
        this.frameY = (this.frameY + 1) % this.frameCountY;
      }
    }
  }

  /**
   * Handle boss taking damage
   * @returns {number} Points awarded for hit
   */
  takeDamage() {
    this.isHit = true;
    this.hitTimer = Date.now();
    this.health--;

    if (this.health <= 0) {
      this.alive = false;
      return 200; // Points for defeating boss
    }

    return 20; // Points for damaging boss
  }

  /**
   * Get health percentage
   * @returns {number} Health percentage (0-1)
   */
  getHealthPercentage() {
    return this.health / this.maxHealth;
  }

  /**
   * Override hit method to use takeDamage
   */
  hit() {
    return this.takeDamage();
  }
}
