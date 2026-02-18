import {log as appLog} from "@/lib/utils/log";

export interface GameAction {
  t: number; // relative time in ms
  a: string; // action key (e.g., 'move_left', 'attack')
}

/** All valid action types that the Recorder accepts. */
const VALID_ACTIONS = new Set([
  "move_left",
  "move_right",
  "move_up",
  "move_down",
  "jump",
  "attack",
  "super",
  "bot_refresh",
  "bot_spawn",
  "bot_despawn",
]);

export class Recorder {
  private static readonly MAX_ACTIONS = 50_000;
  private static readonly COMPONENT_NAME = "Recorder";
  private startTime: number = 0;
  private actions: GameAction[] = [];
  private capped: boolean = false;

  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = Date.now();
    this.actions = [];
    this.capped = false;
  }

  /** Clear the action buffer without resetting the start time. */
  clear() {
    this.actions = [];
    this.capped = false;
  }

  log(action: string) {
    if (this.capped) return;

    if (!VALID_ACTIONS.has(action)) {
      appLog.warn(Recorder.COMPONENT_NAME, `Unknown action type: ${action}`);
      return;
    }

    if (this.actions.length >= Recorder.MAX_ACTIONS) {
      this.capped = true;
      appLog.warn(
        Recorder.COMPONENT_NAME,
        "Action cap reached, recording stopped."
      );
      return;
    }
    this.actions.push({
      t: Date.now() - this.startTime,
      a: action,
    });
  }

  getActions(): GameAction[] {
    return [...this.actions];
  }

  serialize(): Uint8Array {
    const json = JSON.stringify(this.actions);
    return new TextEncoder().encode(json);
  }
}
