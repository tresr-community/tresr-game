/**
 * Test suite for bin/config-schema.ts (bun:test)
 *
 * Run with: bun test bin/config-schema.test.ts
 *
 * Covers:
 *   - The real config/tresr.yaml parses successfully end-to-end.
 *   - Server anti-cheat constraint violations are caught with clear paths.
 *   - Client blockchain constraint violations are caught.
 *   - Client gameplay entity / ratio / display constraints are caught.
 *   - Missing required fields produce errors, not silently pass.
 *   - Type coercion is rejected (no implicit string→number).
 */
import {describe, expect, test} from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  TresrConfigSchema,
  ServerConfigSchema,
  ClientConfigSchema,
} from "./config-schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const projectRoot = path.resolve(import.meta.dir, "..");
const configPath = path.join(projectRoot, "config", "tresr.yaml");

/** Load and parse the real tresr.yaml. */
function loadRealConfig(): unknown {
  const raw = fs.readFileSync(configPath, "utf8");
  return yaml.parse(raw);
}

/**
 * Deep-clone via JSON round-trip so individual tests can mutate without
 * affecting others.
 */
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Extract all dotted paths that appeared in a Zod error result.
 * Zod v4 types issue.path as PropertyKey[] (includes symbol),
 * so we coerce each segment with String().
 */
function errorPaths(result: {
  success: false;
  error: {issues: Array<{path: PropertyKey[]}>};
}): string[] {
  return result.error.issues.map((i) => i.path.map(String).join("."));
}

// ---------------------------------------------------------------------------
// Load the full config once for the session — all tests clone from this.
// ---------------------------------------------------------------------------

const realConfig = loadRealConfig() as Record<string, unknown>;
const realServer = (realConfig.server ?? {}) as Record<string, unknown>;
const realClient = (realConfig.client ?? {}) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Suite 1: Real tresr.yaml
// ---------------------------------------------------------------------------

describe("Real tresr.yaml", () => {
  test("parses the entire config successfully", () => {
    const result = TresrConfigSchema.safeParse(realConfig);
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `  ${i.path.join(".")}: ${i.message}`
      );
      throw new Error(`tresr.yaml validation failed:\n${issues.join("\n")}`);
    }
    expect(result.success).toBe(true);
  });

  test("server section alone parses successfully", () => {
    const result = ServerConfigSchema.safeParse(realServer);
    expect(result.success).toBe(true);
  });

  test("client section alone parses successfully", () => {
    const result = ClientConfigSchema.safeParse(realClient);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: server.anti_cheat.replay
// ---------------------------------------------------------------------------

describe("server.anti_cheat.replay", () => {
  function serverWith(replayPatch: Record<string, unknown>) {
    const s = clone(realServer);
    const ac = s.anti_cheat as Record<string, unknown>;
    ac.replay = {...(ac.replay as Record<string, unknown>), ...replayPatch};
    return s;
  }

  test("burst_limit_per_100ms must be a positive integer", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({burst_limit_per_100ms: 0})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = errorPaths(result);
      expect(paths.some((p) => p.includes("burst_limit_per_100ms"))).toBe(true);
    }
  });

  test("burst_limit_per_100ms rejects negative values", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({burst_limit_per_100ms: -5})
    );
    expect(result.success).toBe(false);
  });

  test("burst_limit_per_100ms rejects floats", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({burst_limit_per_100ms: 1.5})
    );
    expect(result.success).toBe(false);
  });

  test("min_actions must be a positive integer", () => {
    const result = ServerConfigSchema.safeParse(serverWith({min_actions: 0}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("min_actions"))).toBe(
        true
      );
    }
  });

  test("min_actions rejects negative", () => {
    const result = ServerConfigSchema.safeParse(serverWith({min_actions: -10}));
    expect(result.success).toBe(false);
  });

  test("grace_ms must be non-negative", () => {
    const result = ServerConfigSchema.safeParse(serverWith({grace_ms: -1}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("grace_ms"))).toBe(true);
    }
  });

  test("grace_ms accepts zero (disable)", () => {
    const result = ServerConfigSchema.safeParse(serverWith({grace_ms: 0}));
    expect(result.success).toBe(true);
  });

  test("attack_per_key_divisor accepts 0 (disable check)", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({attack_per_key_divisor: 0})
    );
    expect(result.success).toBe(true);
  });

  test("attack_per_key_divisor rejects negative values", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({attack_per_key_divisor: -1})
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: server.anti_cheat (top-level)
// ---------------------------------------------------------------------------

describe("server.anti_cheat", () => {
  function serverWith(acPatch: Record<string, unknown>) {
    const s = clone(realServer);
    s.anti_cheat = {...(s.anti_cheat as Record<string, unknown>), ...acPatch};
    return s;
  }

  test("ban_durations_hours must not be empty", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({ban_durations_hours: []})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        errorPaths(result).some((p) => p.includes("ban_durations_hours"))
      ).toBe(true);
    }
  });

  test("ban_durations_hours rejects zero duration", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({ban_durations_hours: [0, 24, 72]})
    );
    expect(result.success).toBe(false);
  });

  test("permanent_after_offence must be >= 1", () => {
    const result = ServerConfigSchema.safeParse(
      serverWith({permanent_after_offence: 0})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        errorPaths(result).some((p) => p.includes("permanent_after_offence"))
      ).toBe(true);
    }
  });

  test("ban_reasons must not be empty", () => {
    const result = ServerConfigSchema.safeParse(serverWith({ban_reasons: []}));
    expect(result.success).toBe(false);
  });

  test("max_score must be a positive integer", () => {
    const result = ServerConfigSchema.safeParse(serverWith({max_score: 0}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("max_score"))).toBe(
        true
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: client.blockchain
// ---------------------------------------------------------------------------

describe("client.blockchain", () => {
  function clientWithAnvil(anvilPatch: Record<string, unknown>) {
    const c = clone(realClient);
    const bc = c.blockchain as Record<string, unknown>;
    const av = bc.avalanche as Record<string, unknown>;
    av.anvil = {...(av.anvil as Record<string, unknown>), ...anvilPatch};
    return c;
  }

  test("chain_id must be a positive integer", () => {
    const result = ClientConfigSchema.safeParse(clientWithAnvil({chain_id: 0}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("chain_id"))).toBe(true);
    }
  });

  test("chain_id rejects floats", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAnvil({chain_id: 31337.5})
    );
    expect(result.success).toBe(false);
  });

  test("rpc_urls must be non-empty", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAnvil({rpc_urls: []})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("rpc_urls"))).toBe(true);
    }
  });

  test("rpc_urls entries must be valid URLs", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAnvil({rpc_urls: ["not-a-url"]})
    );
    expect(result.success).toBe(false);
  });

  test("tresr_token_contract must be a valid EVM address", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAnvil({tresr_token_contract: "0xDEAD"})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        errorPaths(result).some((p) => p.includes("tresr_token_contract"))
      ).toBe(true);
    }
  });

  test("vault_contract must be a valid EVM address", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAnvil({vault_contract: "not-an-address"})
    );
    expect(result.success).toBe(false);
  });

  test("fee must be non-negative", () => {
    const result = ClientConfigSchema.safeParse(clientWithAnvil({fee: -1}));
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: client.gameplay.entities
// ---------------------------------------------------------------------------

describe("client.gameplay.entities.player", () => {
  function clientWithPlayer(patch: Record<string, unknown>) {
    const c = clone(realClient);
    const gp = c.gameplay as Record<string, unknown>;
    const ent = gp.entities as Record<string, unknown>;
    ent.player = {...(ent.player as Record<string, unknown>), ...patch};
    return c;
  }

  test("health must be positive", () => {
    const result = ClientConfigSchema.safeParse(clientWithPlayer({health: 0}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("health"))).toBe(true);
    }
  });

  test("health rejects negative", () => {
    const result = ClientConfigSchema.safeParse(clientWithPlayer({health: -1}));
    expect(result.success).toBe(false);
  });

  test("speed must be positive", () => {
    const result = ClientConfigSchema.safeParse(clientWithPlayer({speed: 0}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("speed"))).toBe(true);
    }
  });

  test("lives must be a positive integer", () => {
    const result = ClientConfigSchema.safeParse(clientWithPlayer({lives: 0}));
    expect(result.success).toBe(false);
  });

  test("spawn.x_ratio must be in [0, 1]", () => {
    const c = clone(realClient);
    const gp = c.gameplay as Record<string, unknown>;
    const ent = gp.entities as Record<string, unknown>;
    const player = ent.player as Record<string, unknown>;
    player.spawn = {x_ratio: 1.5, y_ratio: 0.9};
    const result = ClientConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("x_ratio"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6: client.gameplay.walkable_area ratios
// ---------------------------------------------------------------------------

describe("client.gameplay.walkable_area", () => {
  function clientWithWalkable(patch: Record<string, unknown>) {
    const c = clone(realClient);
    const gp = c.gameplay as Record<string, unknown>;
    gp.walkable_area = {
      ...(gp.walkable_area as Record<string, unknown>),
      ...patch,
    };
    return c;
  }

  test("top_y_ratio rejects value > 1", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithWalkable({top_y_ratio: 1.1})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("top_y_ratio"))).toBe(
        true
      );
    }
  });

  test("left_x_ratio rejects value < 0", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithWalkable({left_x_ratio: -0.1})
    );
    expect(result.success).toBe(false);
  });

  test("all four ratio fields accept valid [0, 1] values", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithWalkable({
        top_y_ratio: 0.85,
        bottom_y_ratio: 1.0,
        left_x_ratio: 0.0,
        right_x_ratio: 1.0,
      })
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: client.display
// ---------------------------------------------------------------------------

describe("client.display", () => {
  function clientWithDisplay(patch: Record<string, unknown>) {
    const c = clone(realClient);
    c.display = {...(c.display as Record<string, unknown>), ...patch};
    return c;
  }

  test("background_color must match #rrggbb", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithDisplay({background_color: "black"})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        errorPaths(result).some((p) => p.includes("background_color"))
      ).toBe(true);
    }
  });

  test("background_color rejects 3-char shorthand", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithDisplay({background_color: "#000"})
    );
    expect(result.success).toBe(false);
  });

  test("background_color accepts #000000", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithDisplay({background_color: "#000000"})
    );
    expect(result.success).toBe(true);
  });

  test("width must be a positive integer", () => {
    const result = ClientConfigSchema.safeParse(clientWithDisplay({width: 0}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("width"))).toBe(true);
    }
  });

  test("height must be a positive integer", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithDisplay({height: -1})
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: client.gameplay.audio volumes
// ---------------------------------------------------------------------------

describe("client.gameplay.audio", () => {
  function clientWithAudio(patch: Record<string, unknown>) {
    const c = clone(realClient);
    const gp = c.gameplay as Record<string, unknown>;
    gp.audio = {...(gp.audio as Record<string, unknown>), ...patch};
    return c;
  }

  test("default_music_volume must be in [0, 1]", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAudio({default_music_volume: 1.5})
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        errorPaths(result).some((p) => p.includes("default_music_volume"))
      ).toBe(true);
    }
  });

  test("default_sfx_volume rejects negative", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAudio({default_sfx_volume: -0.1})
    );
    expect(result.success).toBe(false);
  });

  test("crossfade_step_ms must be positive", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithAudio({crossfade_step_ms: 0})
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Missing required fields
// ---------------------------------------------------------------------------

describe("missing required fields", () => {
  test("missing server.anti_cheat fails", () => {
    const s = clone(realServer);
    delete (s as Record<string, unknown>).anti_cheat;
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("anti_cheat"))).toBe(
        true
      );
    }
  });

  test("missing client.gameplay fails", () => {
    const c = clone(realClient);
    delete (c as Record<string, unknown>).gameplay;
    const result = ClientConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("gameplay"))).toBe(true);
    }
  });

  test("missing client.display fails", () => {
    const c = clone(realClient);
    delete (c as Record<string, unknown>).display;
    const result = ClientConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("display"))).toBe(true);
    }
  });

  test("missing client.blockchain fails", () => {
    const c = clone(realClient);
    delete (c as Record<string, unknown>).blockchain;
    const result = ClientConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 10: Type coercion rejection
// ---------------------------------------------------------------------------

describe("type coercion rejection", () => {
  test("string '40' where number expected fails (burst_limit_per_100ms)", () => {
    const s = clone(realServer);
    const ac = s.anti_cheat as Record<string, unknown>;
    const rp = ac.replay as Record<string, unknown>;
    rp.burst_limit_per_100ms = "40"; // should be number
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        errorPaths(result).some((p) => p.includes("burst_limit_per_100ms"))
      ).toBe(true);
    }
  });

  test("string 'true' where boolean expected fails (display.pixel_art)", () => {
    const c = clone(realClient);
    const d = c.display as Record<string, unknown>;
    d.pixel_art = "true"; // should be boolean
    const result = ClientConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("pixel_art"))).toBe(
        true
      );
    }
  });

  test("array where object expected fails (server.anti_cheat.replay)", () => {
    const s = clone(realServer);
    const ac = s.anti_cheat as Record<string, unknown>;
    ac.replay = [1, 2, 3]; // should be an object
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: client.gameplay.vault economics
// ---------------------------------------------------------------------------

describe("client.gameplay.vault", () => {
  function clientWithVault(patch: Record<string, unknown>) {
    const c = clone(realClient);
    const gp = c.gameplay as Record<string, unknown>;
    gp.vault = {...(gp.vault as Record<string, unknown>), ...patch};
    return c;
  }

  test("payout_max_score must be a positive integer", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithVault({payout_max_score: 0})
    );
    expect(result.success).toBe(false);
  });

  test("minimum_cap must be a positive integer", () => {
    const result = ClientConfigSchema.safeParse(
      clientWithVault({minimum_cap: -1})
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite: server.juno environment fields
// ---------------------------------------------------------------------------

describe("server.juno environment fields", () => {
  function serverWithJunoEnv(
    env: "development" | "staging" | "production",
    patch: Record<string, unknown>
  ) {
    const s = clone(realServer);
    const juno = s.juno as Record<string, Record<string, unknown>>;
    juno[env] = {...juno[env], ...patch};
    return s;
  }

  // -- satellite_id (required) --
  test("satellite_id is required", () => {
    const s = serverWithJunoEnv("development", {});
    const juno = s.juno as Record<string, Record<string, unknown>>;
    delete juno.development.satellite_id;
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("satellite_id"))).toBe(
        true
      );
    }
  });

  test("satellite_id rejects empty string", () => {
    const result = ServerConfigSchema.safeParse(
      serverWithJunoEnv("development", {satellite_id: ""})
    );
    expect(result.success).toBe(false);
  });

  // -- orbiter_id (required) --
  test("orbiter_id is required", () => {
    const s = serverWithJunoEnv("staging", {});
    const juno = s.juno as Record<string, Record<string, unknown>>;
    delete juno.staging.orbiter_id;
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("orbiter_id"))).toBe(
        true
      );
    }
  });

  test("orbiter_id rejects empty string", () => {
    const result = ServerConfigSchema.safeParse(
      serverWithJunoEnv("staging", {orbiter_id: ""})
    );
    expect(result.success).toBe(false);
  });

  // -- site_url (required) --
  test("site_url is required", () => {
    const s = serverWithJunoEnv("production", {});
    const juno = s.juno as Record<string, Record<string, unknown>>;
    delete juno.production.site_url;
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("site_url"))).toBe(true);
    }
  });

  test("site_url rejects empty string", () => {
    const result = ServerConfigSchema.safeParse(
      serverWithJunoEnv("production", {site_url: ""})
    );
    expect(result.success).toBe(false);
  });

  // -- siwa_id (required) --
  test("siwa_id is required", () => {
    const s = serverWithJunoEnv("development", {});
    const juno = s.juno as Record<string, Record<string, unknown>>;
    delete juno.development.siwa_id;
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorPaths(result).some((p) => p.includes("siwa_id"))).toBe(true);
    }
  });

  test("siwa_id rejects empty string", () => {
    const result = ServerConfigSchema.safeParse(
      serverWithJunoEnv("development", {siwa_id: ""})
    );
    expect(result.success).toBe(false);
  });

  // -- internet_identity_id (optional) --
  test("internet_identity_id is optional", () => {
    const s = serverWithJunoEnv("staging", {});
    const juno = s.juno as Record<string, Record<string, unknown>>;
    delete juno.staging.internet_identity_id;
    const result = ServerConfigSchema.safeParse(s);
    expect(result.success).toBe(true);
  });

  test("internet_identity_id accepts a valid canister ID", () => {
    const result = ServerConfigSchema.safeParse(
      serverWithJunoEnv("staging", {
        internet_identity_id: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      })
    );
    expect(result.success).toBe(true);
  });

  test("internet_identity_id rejects empty string when provided", () => {
    const result = ServerConfigSchema.safeParse(
      serverWithJunoEnv("development", {internet_identity_id: ""})
    );
    expect(result.success).toBe(false);
  });
});
