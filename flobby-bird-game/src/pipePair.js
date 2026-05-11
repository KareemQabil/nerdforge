/**
 * Simple PipePair implementation for the Flobby Bird game.
 *
 * The pair consists of an upper and lower pipe that share a vertical gap.
 * Pipes scroll left at a constant speed. When they move completely off the
 * left side of the screen they are recycled – repositioned back to the start
 * position on the right with a newly generated gap.
 *
 * This implementation is deliberately minimal and does not depend on any
 * rendering or physics library – it only tracks the numeric state required
 * by the unit‑tests (position, speed, gap generation and recycling).
 */

/**
 * Configuration constants – the values are chosen to be reasonable defaults
 * for typical Flappy‑Bird style games. Tests can override them by passing
 * custom arguments to the constructor.
 */
const DEFAULTS = {
  /** Starting X coordinate (off‑screen to the right). */
  startX: 800,
  /** Speed at which the pipes move left (pixels per update call). */
  speed: 2,
  /** Height of the vertical gap between the upper and lower pipe. */
  gapHeight: 120,
  /** Minimum centre Y coordinate for the gap (to keep pipes on‑screen). */
  minGapY: 80,
  /** Maximum centre Y coordinate for the gap. */
  maxGapY: 400,
  /** X coordinate at which a pipe is considered off‑screen left and should be recycled. */
  recycleX: -50
};

/**
 * PipePair class.
 *
 * @property {number} x          Current X position of the pipe pair.
 * @property {number} gapY       Y coordinate of the centre of the gap.
 * @property {number} speed      Horizontal scrolling speed (positive, moves left).
 * @property {number} gapHeight Height of the gap.
 */
class PipePair {
  /**
   * Creates a new PipePair.
   *
   * @param {object} [options] Optional configuration overrides.
   */
  constructor(options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    this.startX = cfg.startX;
    this.speed = cfg.speed;
    this.gapHeight = cfg.gapHeight;
    this.minGapY = cfg.minGapY;
    this.maxGapY = cfg.maxGapY;
    this.recycleX = cfg.recycleX;

    this.x = this.startX;
    this._randomiseGap();
  }

  /** Generate a new random centre Y for the gap within configured bounds. */
  _randomiseGap() {
    const range = this.maxGapY - this.minGapY;
    this.gapY = Math.random() * range + this.minGapY;
  }

  /**
   * Returns the Y coordinate of the upper pipe (top of the gap).
   * @returns {number}
   */
  getUpperY() {
    return this.gapY - this.gapHeight / 2;
  }

  /**
   * Returns the Y coordinate of the lower pipe (bottom of the gap).
   * @returns {number}
   */
  getLowerY() {
    return this.gapY + this.gapHeight / 2;
  }

  /**
   * Update the pipe pair – move it left by the configured speed.
   * If the pair has moved past the recycle threshold it is repositioned to
   * the start X coordinate and a new gap is generated.
   */
  update() {
    this.x -= this.speed;
    if (this.x < this.recycleX) {
      this.reset();
    }
  }

  /** Reset the pipe to the start position and randomise the gap. */
  reset() {
    this.x = this.startX;
    this._randomiseGap();
  }
}

module.exports = PipePair;
