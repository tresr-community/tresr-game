import {describe, expect, test, mock, beforeEach} from "bun:test";

// Mock the log module before importing Recorder
mock.module("@/lib/utils/log", () => ({
  log: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

import {Recorder} from "./Recorder";

describe("Recorder", () => {
  let recorder: Recorder;

  beforeEach(() => {
    recorder = new Recorder();
  });

  test("starts with empty actions", () => {
    expect(recorder.getActions()).toEqual([]);
  });

  test("records actions with timestamps", () => {
    recorder.log("attack");
    recorder.log("jump");
    const actions = recorder.getActions();
    expect(actions).toHaveLength(2);
    expect(actions[0].a).toBe("attack");
    expect(actions[1].a).toBe("jump");
  });

  test("timestamps are monotonically increasing", () => {
    recorder.log("move_left");
    recorder.log("move_right");
    recorder.log("attack");
    const actions = recorder.getActions();
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].t).toBeGreaterThanOrEqual(actions[i - 1].t);
    }
  });

  test("timestamps are relative to start time", () => {
    recorder.log("attack");
    const actions = recorder.getActions();
    // First action should be at or near t=0
    expect(actions[0].t).toBeGreaterThanOrEqual(0);
    expect(actions[0].t).toBeLessThan(1000); // within 1 second
  });

  test("getActions returns a copy, not a reference", () => {
    recorder.log("attack");
    const actions1 = recorder.getActions();
    const actions2 = recorder.getActions();
    expect(actions1).toEqual(actions2);
    expect(actions1).not.toBe(actions2);
  });

  test("reset clears all actions", () => {
    recorder.log("attack");
    recorder.log("jump");
    expect(recorder.getActions()).toHaveLength(2);
    recorder.reset();
    expect(recorder.getActions()).toEqual([]);
  });

  test("recording continues after reset", () => {
    recorder.log("attack");
    recorder.reset();
    recorder.log("jump");
    expect(recorder.getActions()).toHaveLength(1);
    expect(recorder.getActions()[0].a).toBe("jump");
  });

  test("reset resets the timestamp origin", () => {
    recorder.log("attack");
    recorder.reset();
    recorder.log("jump");
    const actions = recorder.getActions();
    // After reset, timestamp should be near 0 again
    expect(actions[0].t).toBeGreaterThanOrEqual(0);
    expect(actions[0].t).toBeLessThan(1000);
  });

  test("serialize returns Uint8Array of JSON", () => {
    recorder.log("attack");
    const serialized = recorder.serialize();
    expect(serialized).toBeInstanceOf(Uint8Array);
    const decoded = new TextDecoder().decode(serialized);
    const parsed = JSON.parse(decoded);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].a).toBe("attack");
  });

  test("empty recorder serializes to empty array", () => {
    const serialized = recorder.serialize();
    const decoded = new TextDecoder().decode(serialized);
    expect(decoded).toBe("[]");
  });

  test("action types are preserved through serialize/deserialize", () => {
    recorder.log("move_left");
    recorder.log("attack");
    recorder.log("super");
    const serialized = recorder.serialize();
    const decoded = new TextDecoder().decode(serialized);
    const parsed = JSON.parse(decoded);
    expect(parsed.map((a: {a: string}) => a.a)).toEqual([
      "move_left",
      "attack",
      "super",
    ]);
  });

  test("records many actions without errors", () => {
    for (let i = 0; i < 100; i++) {
      recorder.log("attack");
    }
    expect(recorder.getActions()).toHaveLength(100);
  });

  test("preserves action order", () => {
    const actionSequence = ["move_left", "jump", "attack", "move_right"];
    for (const action of actionSequence) {
      recorder.log(action);
    }
    const actions = recorder.getActions();
    expect(actions.map((a) => a.a)).toEqual(actionSequence);
  });
});
