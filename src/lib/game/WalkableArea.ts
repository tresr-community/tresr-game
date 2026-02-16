import Phaser from "phaser";

/**
 * WalkableArea — Defines the walkable ground plane where characters can move.
 *
 * In a Streets of Rage 4 style beat-em-up, characters walk on a flat street
 * that occupies the bottom ~35% of the screen. This class enforces those
 * boundaries for all entities.
 *
 * Values are stored as ratios (0.0–1.0) of canvas dimensions so they scale
 * dynamically with any screen size. Pixel values are computed on construction
 * and updated via resize().
 *
 * Reference ratios (original 1280×720):
 *   topY   0.833  (600/720)
 *   bottomY 0.972 (700/720)
 *   leftX   0.0
 *   rightX  1.0
 */
export class WalkableArea {
  private topYRatio: number;
  private bottomYRatio: number;
  private leftXRatio: number;
  private rightXRatio: number;

  private topY: number;
  private bottomY: number;
  private leftX: number;
  private rightX: number;

  constructor(
    topYRatio: number,
    bottomYRatio: number,
    leftXRatio: number,
    rightXRatio: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    this.topYRatio = topYRatio;
    this.bottomYRatio = bottomYRatio;
    this.leftXRatio = leftXRatio;
    this.rightXRatio = rightXRatio;

    this.topY = Math.round(topYRatio * canvasHeight);
    this.bottomY = Math.round(bottomYRatio * canvasHeight);
    this.leftX = Math.round(leftXRatio * canvasWidth);
    this.rightX = Math.round(rightXRatio * canvasWidth);
  }

  /** Update pixel boundaries when the canvas resizes */
  resize(canvasWidth: number, canvasHeight: number) {
    this.topY = Math.round(this.topYRatio * canvasHeight);
    this.bottomY = Math.round(this.bottomYRatio * canvasHeight);
    this.leftX = Math.round(this.leftXRatio * canvasWidth);
    this.rightX = Math.round(this.rightXRatio * canvasWidth);
  }

  /** Check if a position is within the walkable ground plane */
  isWalkable(x: number, groundY: number): boolean {
    return (
      x >= this.leftX &&
      x <= this.rightX &&
      groundY >= this.topY &&
      groundY <= this.bottomY
    );
  }

  /** Clamp a position to the nearest valid point within the walkable area */
  clampToWalkable(x: number, groundY: number): {x: number; groundY: number} {
    return {
      x: Phaser.Math.Clamp(x, this.leftX, this.rightX),
      groundY: Phaser.Math.Clamp(groundY, this.topY, this.bottomY),
    };
  }

  /** Get a random position within the walkable area using seeded RNG */
  getRandomPosition(rng: Phaser.Math.RandomDataGenerator): {
    x: number;
    groundY: number;
  } {
    return {
      x: rng.integerInRange(this.leftX, this.rightX),
      groundY: rng.integerInRange(this.topY, this.bottomY),
    };
  }

  /** Get a random groundY within the walkable area using seeded RNG */
  getRandomGroundY(rng: Phaser.Math.RandomDataGenerator): number {
    return rng.integerInRange(this.topY, this.bottomY);
  }

  getTopY(): number {
    return this.topY;
  }

  getBottomY(): number {
    return this.bottomY;
  }

  getLeftX(): number {
    return this.leftX;
  }

  getRightX(): number {
    return this.rightX;
  }
}
