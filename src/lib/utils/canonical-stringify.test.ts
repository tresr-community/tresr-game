import {describe, expect, test} from "bun:test";
import {canonicalStringify} from "./canonical-stringify";

describe("canonicalStringify", () => {
  test("handles null", () => {
    expect(canonicalStringify(null)).toBe("null");
  });

  test("handles undefined", () => {
    expect(canonicalStringify(undefined)).toBe(undefined);
  });

  test("handles strings", () => {
    expect(canonicalStringify("hello")).toBe('"hello"');
    expect(canonicalStringify("")).toBe('""');
  });

  test("handles numbers", () => {
    expect(canonicalStringify(42)).toBe("42");
    expect(canonicalStringify(0)).toBe("0");
    expect(canonicalStringify(-1.5)).toBe("-1.5");
  });

  test("handles booleans", () => {
    expect(canonicalStringify(true)).toBe("true");
    expect(canonicalStringify(false)).toBe("false");
  });

  test("handles empty objects", () => {
    expect(canonicalStringify({})).toBe("{}");
  });

  test("handles empty arrays", () => {
    expect(canonicalStringify([])).toBe("[]");
  });

  test("sorts object keys alphabetically", () => {
    const result = canonicalStringify({z: 1, a: 2, m: 3});
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  test("sorts nested object keys", () => {
    const result = canonicalStringify({b: {z: 1, a: 2}, a: 1});
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  test("handles arrays preserving order", () => {
    const result = canonicalStringify([3, 1, 2]);
    expect(result).toBe("[3,1,2]");
  });

  test("handles arrays of objects with sorted keys", () => {
    const result = canonicalStringify([{b: 1, a: 2}]);
    expect(result).toBe('[{"a":2,"b":1}]');
  });

  test("handles deeply nested structures", () => {
    const result = canonicalStringify({
      c: {b: {a: 1}},
      a: [1, {z: 2, a: 3}],
    });
    expect(result).toBe('{"a":[1,{"a":3,"z":2}],"c":{"b":{"a":1}}}');
  });

  test("produces identical output regardless of key insertion order", () => {
    const obj1 = {health: 100, damage: 25, speed: 250};
    const obj2 = {speed: 250, health: 100, damage: 25};
    expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
  });

  test("handles mixed types in arrays", () => {
    const result = canonicalStringify([1, "two", true, null, {a: 1}]);
    expect(result).toBe('[1,"two",true,null,{"a":1}]');
  });

  test("handles config-like critical values structure", () => {
    const criticalValues = {
      scoring: {enemy_kill: 10, key_collection: 100},
      entities: {player: {health: 10000, damage: 25}},
      time_limit_seconds: 300,
    };
    const result = canonicalStringify(criticalValues);
    // Keys sorted: entities, scoring, time_limit_seconds
    // Nested keys also sorted
    expect(result).toBe(
      '{"entities":{"player":{"damage":25,"health":10000}},' +
        '"scoring":{"enemy_kill":10,"key_collection":100},' +
        '"time_limit_seconds":300}'
    );
  });
});
