import {describe, expect, test} from "bun:test";
import {timingSafeEqual} from "./timing-safe-equal";

describe("timingSafeEqual", () => {
  test("equal strings return true", () => {
    expect(timingSafeEqual("hello", "hello")).toBe(true);
  });

  test("empty strings are equal", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  test("unequal strings of same length return false", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  test("strings of different lengths return false", () => {
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("ab", "abc")).toBe(false);
  });

  test("empty vs non-empty returns false", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
    expect(timingSafeEqual("a", "")).toBe(false);
  });

  test("prefix match does not return true (no short-circuit)", () => {
    expect(timingSafeEqual("abcdef", "abcxyz")).toBe(false);
  });

  test("single character equality", () => {
    expect(timingSafeEqual("a", "a")).toBe(true);
    expect(timingSafeEqual("a", "b")).toBe(false);
  });

  test("case sensitivity — uppercase != lowercase", () => {
    expect(timingSafeEqual("ABC", "abc")).toBe(false);
  });

  test("hex address comparison — equal", () => {
    const addr = "0xDeadBeef1234567890abcdef1234567890ABCDEF";
    expect(timingSafeEqual(addr, addr)).toBe(true);
  });

  test("hex address comparison — one character differs", () => {
    const a = "0xDeadBeef1234567890abcdef1234567890ABCDE0";
    const b = "0xDeadBeef1234567890abcdef1234567890ABCDE1";
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  test("long identical strings are equal", () => {
    const s = "x".repeat(1000);
    expect(timingSafeEqual(s, s)).toBe(true);
  });

  test("long strings differing at last character return false", () => {
    const a = "a".repeat(999) + "x";
    const b = "a".repeat(999) + "y";
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  test("numeric string comparison", () => {
    expect(timingSafeEqual("12345", "12345")).toBe(true);
    expect(timingSafeEqual("12345", "12346")).toBe(false);
  });
});
