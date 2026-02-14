/**
 * TouchInput — bridge between DOM touch controls and Phaser Player input.
 *
 * The Player reads `.x`, `.y`, `.attack`, `.super`, `.jump` each frame.
 * DOM event handlers in TouchControls.astro write to this singleton.
 */

export interface TouchState {
  /** Joystick X axis: -1 (left) to 1 (right), 0 = neutral */
  x: number;
  /** Joystick Y axis: -1 (up) to 1 (down), 0 = neutral */
  y: number;
  /** True on the frame attack was pressed */
  attack: boolean;
  /** True on the frame super was pressed */
  super: boolean;
  /** True on the frame jump was pressed */
  jump: boolean;
  /** Whether touch controls are active (touch device detected) */
  active: boolean;
}

class TouchInput {
  private static instance: TouchInput;
  public state: TouchState = {
    x: 0,
    y: 0,
    attack: false,
    super: false,
    jump: false,
    active: false,
  };

  private constructor() {}

  static getInstance(): TouchInput {
    if (!TouchInput.instance) {
      TouchInput.instance = new TouchInput();
    }
    return TouchInput.instance;
  }

  /** Set joystick axes (called by TouchControls component) */
  setJoystick(x: number, y: number) {
    this.state.x = x;
    this.state.y = y;
  }

  /** Fire a one-shot action (consumed after one frame by Player) */
  fireAttack() {
    this.state.attack = true;
  }

  fireSuper() {
    this.state.super = true;
  }

  fireJump() {
    this.state.jump = true;
  }

  /** Called by Player at end of frame to clear one-shot actions */
  consumeActions() {
    this.state.attack = false;
    this.state.super = false;
    this.state.jump = false;
  }

  /** Reset one-shot action flags (called on scene restart to clear stale input) */
  reset() {
    this.state.attack = false;
    this.state.super = false;
    this.state.jump = false;
  }

  setActive(active: boolean) {
    this.state.active = active;
  }
}

export default TouchInput;
