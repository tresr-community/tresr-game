import Phaser from "phaser";

/**
 * WalkableArea — Defines the walkable ground plane where characters can move.
 *
 * In a Streets of Rage 4 style beat-em-up, characters walk on a flat street
 * that occupies the bottom ~35% of the screen. This class enforces those
 * boundaries for all entities.
 *
 * Coordinate reference (720px screen):
 *   topY  ~468  (65% — top of street, shallowest depth)
 *   bottomY ~695 (closest to camera, near the curb)
 *   leftX   0
 *   rightX  1280 (screen width, extends with level scrolling)
 */
export class WalkableArea {
  constructor(
    private topY: number,
    private bottomY: number,
    private leftX: number,
    private rightX: number
  ) {}

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
