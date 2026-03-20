import {describe, expect, test} from "bun:test";
import {validateConfig} from "./validate";

// A minimal valid config that satisfies all checks in validateConfig
function makeValidConfig(): Record<string, unknown> {
  return {
    configHash: "a".repeat(64),
    auth: {
      avalanche: {
        enabled: true,
      },
    },
    app: {},
    blockchain: {},
    wallet: {},
    assets: {},
    display: {},
    gameplay: {
      time_limit_seconds: 300,
      fee_gate: {
        transaction_timeout_ms: 60000,
      },
      entities: {
        player: {
          health: 100,
          speed: 250,
        },
      },
    },
    sprites: {},
    anti_cheat: {},
    credits: {},
    changelog: {},
  };
}

describe("validateConfig", () => {
  test("valid config returns true", () => {
    expect(validateConfig(makeValidConfig())).toBe(true);
  });

  test("null returns false", () => {
    expect(validateConfig(null)).toBe(false);
  });

  test("undefined returns false", () => {
    expect(validateConfig(undefined)).toBe(false);
  });

  test("non-object returns false", () => {
    expect(validateConfig("string")).toBe(false);
    expect(validateConfig(42)).toBe(false);
    expect(validateConfig(true)).toBe(false);
  });

  test("missing configHash returns false", () => {
    const c = makeValidConfig();
    delete c.configHash;
    expect(validateConfig(c)).toBe(false);
  });

  test("configHash too short returns false", () => {
    const c = makeValidConfig();
    c.configHash = "a".repeat(63);
    expect(validateConfig(c)).toBe(false);
  });

  test("configHash too long returns false", () => {
    const c = makeValidConfig();
    c.configHash = "a".repeat(65);
    expect(validateConfig(c)).toBe(false);
  });

  test("configHash with invalid characters returns false", () => {
    const c = makeValidConfig();
    c.configHash = "g".repeat(64); // 'g' is not valid hex
    expect(validateConfig(c)).toBe(false);
  });

  test("uppercase hex in configHash returns false (must be lowercase)", () => {
    const c = makeValidConfig();
    c.configHash = "A".repeat(64); // uppercase not matched by /^[a-f0-9]{64}$/
    expect(validateConfig(c)).toBe(false);
  });

  describe("missing required top-level keys", () => {
    const requiredKeys = [
      "auth",
      "app",
      "blockchain",
      "wallet",
      "assets",
      "display",
      "gameplay",
      "sprites",
      "anti_cheat",
      "credits",
      "changelog",
    ] as const;

    for (const key of requiredKeys) {
      test(`missing '${key}' returns false`, () => {
        const c = makeValidConfig();
        delete c[key];
        expect(validateConfig(c)).toBe(false);
      });

      test(`'${key}' as non-object returns false`, () => {
        const c = makeValidConfig();
        c[key] = "not-an-object";
        expect(validateConfig(c)).toBe(false);
      });
    }
  });

  describe("gameplay.time_limit_seconds", () => {
    test("zero returns false", () => {
      const c = makeValidConfig();
      (c.gameplay as Record<string, unknown>).time_limit_seconds = 0;
      expect(validateConfig(c)).toBe(false);
    });

    test("negative returns false", () => {
      const c = makeValidConfig();
      (c.gameplay as Record<string, unknown>).time_limit_seconds = -1;
      expect(validateConfig(c)).toBe(false);
    });

    test("string returns false", () => {
      const c = makeValidConfig();
      (c.gameplay as Record<string, unknown>).time_limit_seconds = "300";
      expect(validateConfig(c)).toBe(false);
    });

    test("missing returns false", () => {
      const c = makeValidConfig();
      delete (c.gameplay as Record<string, unknown>).time_limit_seconds;
      expect(validateConfig(c)).toBe(false);
    });
  });

  describe("gameplay.entities.player", () => {
    test("missing entities returns false", () => {
      const c = makeValidConfig();
      delete (c.gameplay as Record<string, unknown>).entities;
      expect(validateConfig(c)).toBe(false);
    });

    test("missing player returns false", () => {
      const c = makeValidConfig();
      const gp = c.gameplay as Record<string, unknown>;
      const ge = gp.entities as Record<string, unknown>;
      delete ge.player;
      expect(validateConfig(c)).toBe(false);
    });

    test("player.health <= 0 returns false", () => {
      const c = makeValidConfig();
      const gp = c.gameplay as Record<string, unknown>;
      const ge = gp.entities as Record<string, unknown>;
      const player = ge.player as Record<string, unknown>;
      player.health = 0;
      expect(validateConfig(c)).toBe(false);
    });

    test("player.speed <= 0 returns false", () => {
      const c = makeValidConfig();
      const gp = c.gameplay as Record<string, unknown>;
      const ge = gp.entities as Record<string, unknown>;
      const player = ge.player as Record<string, unknown>;
      player.speed = -5;
      expect(validateConfig(c)).toBe(false);
    });

    test("player.health non-number returns false", () => {
      const c = makeValidConfig();
      const gp = c.gameplay as Record<string, unknown>;
      const ge = gp.entities as Record<string, unknown>;
      const player = ge.player as Record<string, unknown>;
      player.health = "100";
      expect(validateConfig(c)).toBe(false);
    });
  });

  describe("gameplay.fee_gate", () => {
    test("missing fee_gate returns false", () => {
      const c = makeValidConfig();
      delete (c.gameplay as Record<string, unknown>).fee_gate;
      expect(validateConfig(c)).toBe(false);
    });

    test("fee_gate.transaction_timeout_ms <= 0 returns false", () => {
      const c = makeValidConfig();
      const gp = c.gameplay as Record<string, unknown>;
      const fg = gp.fee_gate as Record<string, unknown>;
      fg.transaction_timeout_ms = 0;
      expect(validateConfig(c)).toBe(false);
    });

    test("fee_gate.transaction_timeout_ms non-number returns false", () => {
      const c = makeValidConfig();
      const gp = c.gameplay as Record<string, unknown>;
      const fg = gp.fee_gate as Record<string, unknown>;
      fg.transaction_timeout_ms = "60000";
      expect(validateConfig(c)).toBe(false);
    });
  });

  describe("auth.avalanche.enabled", () => {
    test("missing avalanche returns false", () => {
      const c = makeValidConfig();
      delete (c.auth as Record<string, unknown>).avalanche;
      expect(validateConfig(c)).toBe(false);
    });

    test("enabled as string returns false", () => {
      const c = makeValidConfig();
      const au = c.auth as Record<string, unknown>;
      const av = au.avalanche as Record<string, unknown>;
      av.enabled = "true";
      expect(validateConfig(c)).toBe(false);
    });

    test("enabled as false is valid", () => {
      const c = makeValidConfig();
      const au = c.auth as Record<string, unknown>;
      const av = au.avalanche as Record<string, unknown>;
      av.enabled = false;
      expect(validateConfig(c)).toBe(true);
    });
  });
});
