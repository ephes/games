/**
 * @module systems/LevelManager
 */

import { LEVELS } from '../utils/constants.js';

/**
 * Level management system
 */
export class LevelManager {
  /**
   * Create level manager
   */
  constructor() {
    this.currentLevel = 0;
    this.totalLevels = LEVELS.length;
    this.transitioning = false;
    this.transitionTimer = 0;
    this.transitionDuration = 1000; // 1 second
  }

  /**
   * Get current level data
   * @returns {Object} Current level data
   */
  getCurrentLevel() {
    return LEVELS[this.currentLevel];
  }

  /**
   * Get level by index
   * @param {number} index - Level index
   * @returns {Object} Level data
   */
  getLevel(index) {
    return LEVELS[index];
  }

  /**
   * Check if on last level
   * @returns {boolean} True if on last level
   */
  isLastLevel() {
    return this.currentLevel >= this.totalLevels - 1;
  }

  /**
   * Move to next level
   * @returns {boolean} True if moved to next level, false if all levels completed
   */
  nextLevel() {
    if (this.isLastLevel()) {
      return false;
    }

    this.currentLevel++;
    this.startTransition();
    return true;
  }

  /**
   * Start level transition
   */
  startTransition() {
    this.transitioning = true;
    this.transitionTimer = 0;
  }

  /**
   * Update transition
   * @param {number} deltaTime - Time since last update
   */
  updateTransition(deltaTime) {
    if (!this.transitioning) {
      return;
    }

    this.transitionTimer += deltaTime;

    if (this.transitionTimer >= this.transitionDuration) {
      this.transitioning = false;
      this.transitionTimer = 0;
    }
  }

  /**
   * Get transition progress
   * @returns {number} Progress from 0 to 1
   */
  getTransitionProgress() {
    if (!this.transitioning) {
      return 1;
    }
    return Math.min(this.transitionTimer / this.transitionDuration, 1);
  }

  /**
   * Reset to first level
   */
  reset() {
    this.currentLevel = 0;
    this.transitioning = false;
    this.transitionTimer = 0;
  }
}
