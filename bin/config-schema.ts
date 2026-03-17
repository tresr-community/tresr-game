/**
 * Zod schema for config/tresr.yaml
 *
 * This is the single source of truth for the shape and constraints of the
 * entire tresr.yaml configuration file. It is used at build time by
 * bin/client-config.ts to validate the YAML before generating any derived
 * files, and by the test suite in bin/config-schema.test.ts.
 *
 * DO NOT import this file from browser-bundled code — it is build-tool only.
 */
import * as z from "zod";

// ---------------------------------------------------------------------------
// Reusable building blocks
// ---------------------------------------------------------------------------

/** EVM hex address: 0x + 40 hex chars. Some fields allow empty/zero address. */
const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, {
  message: "Must be a valid EVM address (0x + 40 hex chars)",
});

/** A colour expressed as a CSS hex string: #rrggbb */
const cssHexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, {
  message: "Must be a CSS hex colour (#rrggbb)",
});

/** A number in the range [0, 1] — used for ratios and alpha values. */
const ratio = z.number().min(0).max(1);

/** A duration in milliseconds — must be non-negative. */
const ms = z.number().nonnegative();

/** A URL string (http/https or localhost) — permissive, validated via z.url(). */
const urlStr = z.url();

// ---------------------------------------------------------------------------
// Server section
// ---------------------------------------------------------------------------

const JunoCollectionSchema = z.object({
  collection: z.string().min(1),
  read: z.enum(["public", "managed", "private"]),
  write: z.enum(["public", "managed", "private"]),
  memory: z.enum(["stable", "heap"]),
});

const JunoEnvironmentSchema = z.object({
  satellite_id: z.string().min(1),
  orbiter_id: z.string().min(1),
});

const JunoSchema = z.object({
  development: JunoEnvironmentSchema,
  staging: JunoEnvironmentSchema,
  production: JunoEnvironmentSchema,
  admins: z.array(z.string()).default([]),
  collections: z.object({
    datastore: z.array(JunoCollectionSchema).min(1),
    storage: z.array(JunoCollectionSchema).min(1),
  }),
});

const AntiCheatReplaySchema = z.object({
  max_actions: z.number().int().positive(),
  min_action_gap_ms: ms,
  min_attack_gap_ms: ms,
  grace_ms: ms,
  burst_limit_per_100ms: z.number().int().positive(),
  min_actions: z.number().int().positive(),
  attack_per_key_divisor: z.number().int().nonnegative(),
});

const AntiCheatSchema = z.object({
  ban_durations_hours: z.array(z.number().positive()).min(1),
  permanent_after_offence: z.number().int().min(1),
  ban_reasons: z.array(z.string().min(1)).min(1),
  replay: AntiCheatReplaySchema,
});

const HighscoreSchema = z.object({
  score_ttl_hours: z.number().positive(),
  consolation_prize_percent: z.number().min(0).max(100),
  consolation_prize_min_games: z.number().int().nonnegative(),
});

export const ServerConfigSchema = z.object({
  juno: JunoSchema,
  anti_cheat: AntiCheatSchema,
  highscore: HighscoreSchema,
});

// ---------------------------------------------------------------------------
// Client — auth
// ---------------------------------------------------------------------------

const AuthSchema = z.object({
  iid: z.object({
    enabled: z.boolean(),
    domain: z.string().optional(),
  }),
  webauthn: z.object({
    enabled: z.boolean(),
    session_ttl_ms: ms.optional(),
  }),
  avalanche: z.object({
    enabled: z.boolean(),
  }),
});

// ---------------------------------------------------------------------------
// Client — app
// ---------------------------------------------------------------------------

const AppSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  tagline: z.string(),
  footer_text: z.string(),
  narration_text: z
    .object({
      intro: z.string(),
    })
    .optional(),
  loader_messages: z.array(z.string()).optional(),
  custom_notifications: z.array(z.string()).optional(),
  custom_404: z.string().optional(),
  instructions: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Client — blockchain
// ---------------------------------------------------------------------------

const AvalancheEnvSchema = z.object({
  url: z.url({message: "Avalanche env URL must be a valid URL"}),
  fee: z.number().nonnegative(),
  burn_rate: z.number().nonnegative(),
  chain_id: z.number().int().positive(),
  rpc_urls: z.array(urlStr).min(1),
  allowed_origins: z.array(z.string()).default([]),
  token_ticker: z.string().min(1),
  tresr_token_contract: evmAddress,
  // These are optional — not all environments define all keys
  deployer_address: evmAddress.optional(),
  player_wallet: evmAddress.optional(),
  oracle_address: evmAddress.optional(),
  admin_address: evmAddress.optional(),
  safe_address: evmAddress.optional(),
  vault_contract: evmAddress,
  faucet_contract: evmAddress.optional(),
  explorer_url: z.url(),
});

const IcpEvmRpcEnvSchema = z.object({
  canister_id: z.string().min(1),
  rpc_url: urlStr.optional(),
  rpc_urls: z.array(urlStr).optional(),
});

const BlockchainSchema = z.object({
  avalanche: z.object({
    anvil: AvalancheEnvSchema,
    testnet: AvalancheEnvSchema,
    mainnet: AvalancheEnvSchema,
  }),
  icp: z.object({
    evm_rpc: z.object({
      anvil: IcpEvmRpcEnvSchema,
      testnet: IcpEvmRpcEnvSchema,
      mainnet: IcpEvmRpcEnvSchema,
    }),
  }),
});

// ---------------------------------------------------------------------------
// Client — wallet
// ---------------------------------------------------------------------------

const WalletSchema = z.object({
  faucet_cooldown_hours: z.number().positive(),
  balance_refresh_cooldown_ms: ms,
  vault_poll_interval_ms: ms,
  connect_timeout_ms: ms,
  tx_timeout_ms: ms,
  tx_polling_interval_ms: ms.positive(),
});

// ---------------------------------------------------------------------------
// Client — assets (populated at build time)
// ---------------------------------------------------------------------------

const AssetsSchema = z.object({
  wallpapers: z.array(z.string()).default([]),
  music: z.array(z.string()).default([]),
  sfx: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Client — display
// ---------------------------------------------------------------------------

const DisplaySchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  design_height: z.number().int().positive(),
  background_color: cssHexColor,
  pixel_art: z.boolean(),
});

// ---------------------------------------------------------------------------
// Client — gameplay
// ---------------------------------------------------------------------------

const KnockbackSchema = z.object({
  force: z.number().nonnegative(),
  stun_ms: ms,
});

const HitboxSchema = z.object({
  radius: z.number().positive().optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

const HealthBarSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  offset_y: z.number(),
  background_color: z.number().optional(),
  colors: z
    .object({
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      critical: z.number(),
    })
    .optional(),
  thresholds: z
    .object({
      high: ratio,
      medium: ratio,
      low: ratio,
      critical: ratio,
    })
    .optional(),
});

const PlayerSuperSchema = z.object({
  damage: z.number().positive(),
  splash_damage: z.number().nonnegative(),
  splash_radius: z.number().nonnegative(),
  speed: z.number().positive(),
  max_range: z.number().positive(),
  charge_per_kill: z.number().positive(),
  max_charge: z.number().positive(),
  max_projectiles: z.number().int().positive(),
  hitbox: z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
      hit_radius: z.number().positive(),
      depth_threshold: z.number().nonnegative(),
      fire_offset: z.number().nonnegative(),
      offscreen_margin: z.number().nonnegative(),
    })
    .optional(),
  effects: z.record(z.string(), z.number()).optional(),
});

const PlayerSchema = z.object({
  health: z.number().positive(),
  damage: z.number().positive(),
  speed: z.number().positive(),
  jump_force: z.number().positive(),
  knockback: KnockbackSchema,
  hitbox: HitboxSchema,
  combat: z.object({
    reach: z.number().positive(),
    attack_range: z.number().positive(),
    hit_stop_ms: ms,
  }),
  super: PlayerSuperSchema,
  health_bar: HealthBarSchema,
  effects: z.record(z.string(), z.unknown()).optional(),
  spawn: z.object({
    x_ratio: ratio,
    y_ratio: ratio,
  }),
  lives: z.number().int().positive(),
  respawn: z
    .object({
      invincibility_ms: ms,
      blink_interval_ms: ms.positive(),
      delay_ms: ms,
    })
    .optional(),
  input: z
    .object({
      gamepad_deadzone: ratio,
      touch: z
        .object({
          joystick_radius: z.number().positive(),
          joystick_deadzone: ratio,
        })
        .optional(),
    })
    .optional(),
});

/** Enemy AI profile schemas — only cautious, erratic, etc. have fields; direct is empty. */
const EnemyAiWeightsSchema = z.object({
  cautious: z.number().nonnegative(),
  direct: z.number().nonnegative(),
  erratic: z.number().nonnegative(),
  flanker: z.number().nonnegative(),
  passive: z.number().nonnegative(),
  retardio: z.number().nonnegative(),
  swarm: z.number().nonnegative(),
});

const EnemySchema = z.object({
  health: z.number().positive(),
  damage: z.number().nonnegative(),
  speed: z.number().positive(),
  flee_speed_mult: z.number().positive().optional(),
  flee_margin_px: z.number().nonnegative().optional(),
  offscreen_kill_distance_px: z.number().nonnegative().optional(),
  walk_in_boundary_margin_px: z.number().nonnegative().optional(),
  knockback: KnockbackSchema,
  hitbox: HitboxSchema,
  combat: z.object({
    attack_range: z.number().positive(),
    depth_threshold: z.number().nonnegative(),
    attack_check_ms: ms.positive(),
  }),
  ai: z
    .object({
      weights: EnemyAiWeightsSchema,
    })
    .loose(), // AI profiles have varying shapes — allow additional keys
  health_bar: HealthBarSchema,
  animations: z.object({death_delay: ms}).optional(),
  spawner: z
    .object({
      pool_size: z.number().int().positive(),
      delay_ms: ms.positive(),
      buffer_distance: z.number().nonnegative(),
      director: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  loot: z.record(z.string(), z.unknown()).optional(),
});

const BossSchema = z.object({
  health: z.number().positive(),
  damage: z.number().positive(),
  speed: z.number().positive(),
  knockback: KnockbackSchema,
  hitbox: HitboxSchema,
  combat: z.record(z.string(), z.unknown()),
  descent: z
    .object({
      speed: z.number().positive(),
      start_y: z.number(),
      threshold_ratio: ratio,
    })
    .optional(),
  phases: z.record(z.string(), z.unknown()).optional(),
  attacks: z.record(z.string(), z.unknown()).optional(),
  attack_cooldown_ms: ms,
  charge_range_mult: z.number().positive(),
  summon_pause_s: z.number().nonnegative(),
  defeated_alpha: ratio,
  enrage_flash_ms: ms,
  ground_pound_effects: z.record(z.string(), z.unknown()).optional(),
  death_effects: z.record(z.string(), z.unknown()).optional(),
  health_bar: HealthBarSchema,
  animations: z.object({death_delay: ms}).optional(),
});

const GameplayEntitiesSchema = z.object({
  player: PlayerSchema,
  enemy: EnemySchema,
  boss: BossSchema,
  /** Keys, bombs, chest, tresr_bot — varying shapes */
  key: z.record(z.string(), z.unknown()).optional(),
  bomb: z.record(z.string(), z.unknown()).optional(),
  chest: z.record(z.string(), z.unknown()).optional(),
  tresr_bot: z.record(z.string(), z.unknown()).optional(),
});

const WalkableAreaSchema = z.object({
  top_y_ratio: ratio,
  bottom_y_ratio: ratio,
  left_x_ratio: ratio,
  right_x_ratio: ratio,
});

const ScoringSchema = z.object({
  key_collection: z.number().nonnegative(),
  enemy_kill: z.number().nonnegative(),
  boss_hit: z.number().nonnegative(),
  super_hit: z.number().nonnegative(),
});

const PhysicsSchema = z.object({
  fps: z.number().int().positive(),
  gravity: z.number().nonnegative(),
  timestep: z.number().positive(),
  game_speed: z.number().positive(),
});

const DifficultyEscalationSchema = z.object({
  enabled: z.boolean(),
  interval_seconds: z.number().positive(),
  enemy_spawn_multiplier: z.number().positive(),
  bomb_spawn_multiplier: z.number().positive(),
  min_enemy_spawn_ms: ms.positive(),
  min_bomb_spawn_ms: ms.positive(),
});

const GuestSchema = z.object({
  enabled: z.boolean(),
  max_sessions_per_day: z.number().int().positive(),
  storage_key: z.string().min(1),
});

const FeeGateSchema = z.object({
  transaction_timeout_ms: ms.positive(),
});

const ClaimRetriesSchema = z.object({
  max_attempts: z.number().int().positive(),
  base_delay_ms: ms.positive(),
});

const VaultTiersSchema = z.object({
  building: z.number().positive(),
  sweet_spot: z.number().positive(),
  fomo: z.number().positive(),
});

const VaultSchema = z.object({
  max_score: z.number().int().positive(),
  minimum_cap: z.number().int().positive(),
  tiers: VaultTiersSchema,
  difficulty_multipliers: z.record(z.string(), z.number().positive()),
  payout_fixed: z.record(z.string(), z.number().nonnegative()).optional(),
  payout_percentages: z.record(z.string(), z.number().nonnegative()),
});

const AudioSchema = z.object({
  default_music_volume: ratio,
  default_sfx_volume: ratio,
  crossfade_duration_ms: ms,
  crossfade_step_ms: ms.positive(),
  preference_save_debounce_ms: ms,
  sfx_variants: z.record(z.string(), z.number().int().nonnegative()),
  sfx_volume_overrides: z.record(z.string(), z.number().nonnegative()),
});

/** Sprite animation entry (per-animation sheets) */
const AnimSchema = z.object({
  name: z.string().min(1),
  frames: z.number().int().positive(),
  frameRate: z.number().int().positive(),
  repeat: z.number().int(),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  path: z.string().optional(),
  pathTemplate: z.string().optional(),
});

const SpriteEntitySchema = z.object({
  scaleFactor: z.number().positive(),
  anims: z.array(AnimSchema).min(1),
  count: z.number().int().positive().optional(),
});

const GameplaySchema = z.object({
  time_limit_seconds: z.number().positive(),
  max_keys: z.number().int().positive(),
  difficulty_escalation: DifficultyEscalationSchema,
  guest: GuestSchema,
  fee_gate: FeeGateSchema,
  claim_retries: ClaimRetriesSchema,
  vault: VaultSchema,
  physics: PhysicsSchema,
  visuals: z.record(z.string(), z.unknown()).optional(),
  scoring: ScoringSchema,
  health_bar: HealthBarSchema,
  walkable_area: WalkableAreaSchema,
  entities: GameplayEntitiesSchema,
  combat: z.record(z.string(), z.unknown()).optional(),
  announcements: z.record(z.string(), z.unknown()).optional(),
  audio: AudioSchema,
  loading_screen: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Client — sprites
// ---------------------------------------------------------------------------

const SpritesSchema = z.object({
  defaults: z.object({
    frameWidth: z.number().int().positive(),
    frameHeight: z.number().int().positive(),
  }),
  hero: SpriteEntitySchema,
  super: SpriteEntitySchema,
  boss: SpriteEntitySchema,
  enemies: SpriteEntitySchema,
  tresr_bot: SpriteEntitySchema,
  items: z.record(z.string(), SpriteEntitySchema),
  statics: z.array(z.object({name: z.string(), path: z.string()})).default([]),
});

// ---------------------------------------------------------------------------
// Client — DaisyUI
// ---------------------------------------------------------------------------

const DaisyuiSchema = z.object({
  themes: z.array(z.string().min(1)).min(1),
});

// ---------------------------------------------------------------------------
// Top-level client section
// ---------------------------------------------------------------------------

export const ClientConfigSchema = z.object({
  daisyui: DaisyuiSchema,
  auth: AuthSchema,
  app: AppSchema,
  blockchain: BlockchainSchema,
  wallet: WalletSchema,
  assets: AssetsSchema,
  display: DisplaySchema,
  gameplay: GameplaySchema,
  sprites: SpritesSchema,
});

// ---------------------------------------------------------------------------
// Full config (server + client)
// ---------------------------------------------------------------------------

export const TresrConfigSchema = z.object({
  server: ServerConfigSchema,
  client: ClientConfigSchema,
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type ClientConfig = z.infer<typeof ClientConfigSchema>;
export type TresrConfig = z.infer<typeof TresrConfigSchema>;
