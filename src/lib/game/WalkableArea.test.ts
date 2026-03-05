/**
 * WalkableArea unit tests.
 *
 * We do NOT import WalkableArea statically because its file imports Phaser,
 * which runs browser-detection code at module-evaluation time (touches `document`,
 * `window.Worker`, etc.). Instead we:
 *   1. Polyfill the minimum DOM globals Phaser needs at the top.
 *   2. Use mock.module("phaser", ...) to replace the real Phaser bundle.
 *   3. Dynamically import WalkableArea AFTER the mock is in place.
 *
 * Phaser.Math.Clamp is the only runtime dep used by WalkableArea.
 */
import {describe, expect, test, mock} from "bun:test";

// ── DOM stubs Phaser's device-detection touches ──────────────────────────────
// These must be set before any Phaser-related module loads.
if (typeof globalThis.window === "undefined") {
  (globalThis as Record<string, unknown>).window = globalThis;
}
if (typeof globalThis.document === "undefined") {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      getContext: () => null,
      style: {},
    }),
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    pointerLockElement: undefined,
    mozPointerLockElement: undefined,
    webkitPointerLockElement: undefined,
  };
}
if (typeof (globalThis as Record<string, unknown>).Worker === "undefined") {
  (globalThis as Record<string, unknown>).Worker = undefined;
}
if (typeof (globalThis as Record<string, unknown>).navigator === "undefined") {
  (globalThis as Record<string, unknown>).navigator = {
    maxTouchPoints: 0,
    userAgent: "bun-test",
  };
}

// ── Phaser stub — replace the whole bundle with just what WalkableArea needs ─
mock.module("phaser", () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number): number =>
        Math.min(Math.max(value, min), max),
      RandomDataGenerator: class {
        integerInRange(min: number, max: number): number {
          return Math.floor(min + Math.random() * (max - min + 1));
        }
      },
    },
  },
}));

// Dynamic import so the mock is registered before WalkableArea's module evaluates
const {WalkableArea} = await import("./WalkableArea");

// ── Constants matching WalkableArea JSDoc reference ratios (1280×720) ─────────
const TOP_RATIO = 0.833;
const BOTTOM_RATIO = 0.972;
const LEFT_RATIO = 0.0;
const RIGHT_RATIO = 1.0;
const CANVAS_W = 1280;
const CANVAS_H = 720;

function makeArea(
  w = CANVAS_W,
  h = CANVAS_H,
  topR = TOP_RATIO,
  bottomR = BOTTOM_RATIO,
  leftR = LEFT_RATIO,
  rightR = RIGHT_RATIO
): typeof WalkableArea.prototype {
  return new WalkableArea(topR, bottomR, leftR, rightR, w, h);
}

describe("WalkableArea", () => {
  // ─── Constructor ────────────────────────────────────────────────────────────
  describe("constructor", () => {
    test("computes topY via Math.round", () => {
      const area = makeArea();
      expect(area.getTopY()).toBe(Math.round(TOP_RATIO * CANVAS_H));
    });

    test("computes bottomY via Math.round", () => {
      const area = makeArea();
      expect(area.getBottomY()).toBe(Math.round(BOTTOM_RATIO * CANVAS_H));
    });

    test("leftX is 0 when leftRatio is 0", () => {
      const area = makeArea();
      expect(area.getLeftX()).toBe(0);
    });

    test("rightX equals canvas width when rightRatio is 1.0", () => {
      const area = makeArea();
      expect(area.getRightX()).toBe(CANVAS_W);
    });

    test("topY < bottomY (top is above bottom in screen space)", () => {
      const area = makeArea();
      expect(area.getTopY()).toBeLessThan(area.getBottomY());
    });

    test("works with non-standard canvas sizes", () => {
      const area = new WalkableArea(0.5, 0.9, 0.1, 0.9, 800, 600);
      expect(area.getTopY()).toBe(Math.round(0.5 * 600));
      expect(area.getBottomY()).toBe(Math.round(0.9 * 600));
      expect(area.getLeftX()).toBe(Math.round(0.1 * 800));
      expect(area.getRightX()).toBe(Math.round(0.9 * 800));
    });
  });

  // ─── resize() ───────────────────────────────────────────────────────────────
  describe("resize()", () => {
    test("updates topY and bottomY after resize", () => {
      const area = makeArea(1280, 720);
      area.resize(640, 360);
      expect(area.getTopY()).toBe(Math.round(TOP_RATIO * 360));
      expect(area.getBottomY()).toBe(Math.round(BOTTOM_RATIO * 360));
    });

    test("updates leftX and rightX after resize", () => {
      const area = makeArea(1280, 720);
      area.resize(640, 360);
      expect(area.getLeftX()).toBe(0);
      expect(area.getRightX()).toBe(640);
    });

    test("resize to larger canvas expands boundaries", () => {
      const area = makeArea(640, 360);
      area.resize(1920, 1080);
      expect(area.getBottomY()).toBe(Math.round(BOTTOM_RATIO * 1080));
      expect(area.getRightX()).toBe(1920);
    });
  });

  // ─── isWalkable() ───────────────────────────────────────────────────────────
  describe("isWalkable()", () => {
    test("center of walkable area returns true", () => {
      const area = makeArea();
      const midX = CANVAS_W / 2;
      const midY = (area.getTopY() + area.getBottomY()) / 2;
      expect(area.isWalkable(midX, midY)).toBe(true);
    });

    test("edges are walkable", () => {
      const area = makeArea();
      const midY = (area.getTopY() + area.getBottomY()) / 2;
      expect(area.isWalkable(area.getLeftX(), midY)).toBe(true);
      expect(area.isWalkable(area.getRightX(), midY)).toBe(true);
      expect(area.isWalkable(CANVAS_W / 2, area.getTopY())).toBe(true);
      expect(area.isWalkable(CANVAS_W / 2, area.getBottomY())).toBe(true);
    });

    test("above topY is not walkable", () => {
      const area = makeArea();
      expect(area.isWalkable(CANVAS_W / 2, area.getTopY() - 1)).toBe(false);
    });

    test("below bottomY is not walkable", () => {
      const area = makeArea();
      expect(area.isWalkable(CANVAS_W / 2, area.getBottomY() + 1)).toBe(false);
    });

    test("left of leftX is not walkable when leftRatio > 0", () => {
      const area = new WalkableArea(0.5, 0.9, 0.1, 0.9, 800, 600);
      const midY = (area.getTopY() + area.getBottomY()) / 2;
      expect(area.isWalkable(area.getLeftX() - 1, midY)).toBe(false);
    });

    test("right of rightX is not walkable when rightRatio < 1", () => {
      const area = new WalkableArea(0.5, 0.9, 0.1, 0.9, 800, 600);
      const midY = (area.getTopY() + area.getBottomY()) / 2;
      expect(area.isWalkable(area.getRightX() + 1, midY)).toBe(false);
    });
  });

  // ─── clampToWalkable() ──────────────────────────────────────────────────────
  describe("clampToWalkable()", () => {
    test("position inside area is returned unchanged", () => {
      const area = makeArea();
      const x = CANVAS_W / 2;
      const y = (area.getTopY() + area.getBottomY()) / 2;
      expect(area.clampToWalkable(x, y)).toEqual({x, groundY: y});
    });

    test("x too small is clamped to leftX", () => {
      const area = makeArea();
      const y = (area.getTopY() + area.getBottomY()) / 2;
      expect(area.clampToWalkable(-999, y).x).toBe(area.getLeftX());
    });

    test("x too large is clamped to rightX", () => {
      const area = makeArea();
      const y = (area.getTopY() + area.getBottomY()) / 2;
      expect(area.clampToWalkable(99999, y).x).toBe(area.getRightX());
    });

    test("groundY too small is clamped to topY", () => {
      const area = makeArea();
      expect(area.clampToWalkable(CANVAS_W / 2, 0).groundY).toBe(
        area.getTopY()
      );
    });

    test("groundY too large is clamped to bottomY", () => {
      const area = makeArea();
      expect(area.clampToWalkable(CANVAS_W / 2, 99999).groundY).toBe(
        area.getBottomY()
      );
    });

    test("both dimensions clamped simultaneously", () => {
      const area = makeArea();
      const result = area.clampToWalkable(-100, 99999);
      expect(result.x).toBe(area.getLeftX());
      expect(result.groundY).toBe(area.getBottomY());
    });
  });
});
