// Game types
export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  position: Position;
  render(ctx: CanvasRenderingContext2D): void;
  update(dt: number): void;
}

export interface GameState {
  keys: Key[];
  enemies: Enemy[];
  // Add other properties as needed
}

// Placeholder for Key and Enemy classes
export class Key implements Entity {
  position: Position;
  constructor(x: number, y: number) {
    this.position = { x, y };
  }
  render(ctx: CanvasRenderingContext2D): void {
    // Implement
  }
  update(dt: number): void {
    // Implement
  }
}

export class Enemy implements Entity {
  position: Position;
  constructor(x: number, y: number) {
    this.position = { x, y };
  }
  render(ctx: CanvasRenderingContext2D): void {
    // Implement
  }
  update(dt: number): void {
    // Implement
  }
}