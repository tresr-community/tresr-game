// AUTO-GENERATED: Run `bunx tsx bin/client-config.ts` to regenerate.

import type { ConfigTypes } from "../../types/config.ts";

export const config: ConfigTypes = {
  "daisyui": {
    "themes": [
      "abyss",
      "aqua",
      "black",
      "bumblebee",
      "business",
      "cmyk",
      "coffee",
      "corporate",
      "cyberpunk",
      "dark",
      "dim",
      "dracula",
      "fantasy",
      "forest",
      "halloween",
      "lemonade",
      "light",
      "luxury",
      "night",
      "retro",
      "sunset",
      "synthwave",
      "valentine",
      "winter"
    ]
  },
  "auth": {
    "iid": {
      "enabled": false,
      "domain": "id.ai"
    },
    "webauthn": {
      "enabled": false,
      "session_ttl_ms": 14400000
    },
    "avalanche": {
      "enabled": true
    }
  },
  "app": {
    "name": "TRESR Game",
    "description": "Beat up bankers to claim the $TRESR.",
    "tagline": "Collect Keys. Fight Enemies. Claim the $TRESR.",
    "footer_text": "Powered by Avalanche 🔺",
    "narration_text": {
      "intro": "Yo, I'm Ron Jay — full-time degen, airdrop farmer,\nmeme-coin maniac and diamond-handed legend.\n\nThese suit-wearing bankers think they can gatekeep crypto forever.\n\nThe streets are dead quiet tonight.\n\nBut not for long.\n\nGrab your fists, let's send these clowns to zero!\n"
    },
    "loader_messages": [
      "Aping In...",
      "Boarding Yacht...",
      "Bridging Assets...",
      "Checking Mempool...",
      "Deploying Smart Contracts...",
      "Extracting Yield...",
      "Farming Airdrops...",
      "Flipping NFTs...",
      "HODLing...",
      "Liquidating Shorts...",
      "Minting Blocks...",
      "Preparing to Rug...",
      "Pumping Bags...",
      "Stacking Sats...",
      "Deploying more capital - steady lads...",
      "Updating Roadmap...",
      "Yield Farming..."
    ],
    "custom_notifications": [
      "No Lambos",
      "No farming notices today",
      "No forks",
      "No gems",
      "No mints",
      "No moonshots",
      "No new airdrops",
      "No pumps have happened today",
      "No rugs"
    ],
    "custom_404": "404, degen not found.\n",
    "instructions": "## 🎯 Mission\n\nYour mission, should you choose to accept it;\n\n- ⚔️ Defeat enemies for points\n- 🚀 Collect keys to multiply rewards\n- ⏱️ Survive the time limit\n- 👑 Defeat the final boss\n- 💎 And finally, open the treasure chest for your **$TRESR** reward!\n\n## 🎮 Controls\n\n**Keyboard** (both schemes active simultaneously):\n\n| Action       | WASD Scheme | Arrow Scheme |\n|--------------|-------------|--------------|\n| Move         | W/A/S/D     | Arrow Keys   |\n| Jump         | Space       | Space        |\n| Attack       | J           | Z            |\n| Super Attack | K           | X            |\n| Pause        | Escape      | Escape       |\n\n**Gamepad**:\n\n| Action       | Button               |\n|--------------|---------------------- |\n| Move         | Left Stick / D-Pad    |\n| Jump         | A (Xbox) / Cross (PS) |\n| Attack       | X (Xbox) / Square (PS)|\n| Super Attack | RB (Xbox) / R1 (PS)   |\n\n**Touch**:\n\n- Virtual joystick on left half of screen for movement\n- Right side control for attack, jump and super.\n\n## 💰 Economy\n\n- 💵 Pay a fee in **$TRESR** to start your epic adventure\n- 🔑 Keys boost your rewards big time\n- 🏆 Beat the boss to claim the **$TRESR** prize\n- ⚠️ **Warning:** Die and lose your **TRESR** Stay alive! 💀\n"
  },
  "blockchain": {
    "avalanche": {
      "anvil": {
        "url": "http://auamu-4x777-77775-aaaaa-cai.localhost:5987",
        "fee": 100,
        "burn_rate": 1000,
        "chain_id": 31337,
        "rpc_urls": [
          "http://localhost:8545"
        ],
        "allowed_origins": [
          "http://localhost:5173",
          "http://localhost:4943",
          "http://auamu-4x777-77775-aaaaa-cai.localhost:5987",
          "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:5987"
        ],
        "token_ticker": "tRON",
        "tresr_token_contract": "0x7a2088a1bFc9d81c55368AE168C2C02570cB814F",
        "deployer_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "vault_contract": "0x9E545E3C0baAB3E08CdfD552C960A1050f373042",
        "faucet_contract": "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
        "player_wallet": "0xb81749c72db5b5209098f2bd45a7a0293925da13",
        "explorer_url": "http://localhost:8545/tx/"
      },
      "testnet": {
        "url": "https://game-testnet.tresr.community",
        "fee": 100,
        "burn_rate": 1000,
        "chain_id": 43113,
        "rpc_urls": [
          "https://api.avax-test.network/ext/bc/C/rpc",
          "https://avalanche-fuji-c-chain-rpc.publicnode.com",
          "https://rpc.ankr.com/avalanche_fuji",
          "https://avalanche-fuji.drpc.org"
        ],
        "allowed_origins": [
          "https://game-testnet.tresr.community"
        ],
        "token_ticker": "tRON",
        "tresr_token_contract": "0x0000000000000000000000000000000000000000",
        "oracle_address": "0x0000000000000000000000000000000000000000",
        "admin_address": "0x628F3Df70dd2F19e28842c9AB64c64A9700a929e",
        "vault_contract": "0x0000000000000000000000000000000000000000",
        "faucet_contract": "0x0000000000000000000000000000000000000000",
        "explorer_url": "https://testnet.snowtrace.io/tx/"
      },
      "mainnet": {
        "url": "https://game.tresr.community",
        "fee": 100,
        "burn_rate": 1000,
        "chain_id": 43114,
        "rpc_urls": [
          "https://api.avax.network/ext/bc/C/rpc",
          "https://avalanche-c-chain-rpc.publicnode.com"
        ],
        "allowed_origins": [
          "https://game.tresr.community"
        ],
        "token_ticker": "TRESR",
        "tresr_token_contract": "0x9913BA363073Ca3e9eA0cD296E36B75aF9E40bef",
        "oracle_address": "0x0000000000000000000000000000000000000000",
        "safe_address": "0x0e7E7a40A7a70e9A758f4cB46f01bB12Eb6b29c3",
        "vault_contract": "0x0000000000000000000000000000000000000000",
        "explorer_url": "https://snowtrace.io/tx/"
      }
    },
    "icp": {
      "evm_rpc_canister_id": "7hfb6-caaaa-aaaar-qadga-cai"
    }
  },
  "wallet": {
    "faucet_cooldown_hours": 24,
    "balance_refresh_cooldown_ms": 30000,
    "vault_poll_interval_ms": 60000,
    "connect_timeout_ms": 300000,
    "tx_timeout_ms": 60000,
    "tx_polling_interval_ms": 1000
  },
  "assets": {
    "music": [
      "Analog Ghosts",
      "Arcade Assasian",
      "Binary Bleed",
      "Cyber Victory",
      "Cybernetic Funk",
      "Hardwired Heartbeat",
      "Memory Leak",
      "Neon Grid",
      "Neon Overdrive",
      "Neural Knot",
      "Riot in Sector 4",
      "Terminal Velocity",
      "VHS Violence",
      "Velvet Static"
    ],
    "sfx": [
      "bot_attack_1",
      "bot_attack_2",
      "bot_spawn_1",
      "bot_spawn_10",
      "bot_spawn_2",
      "bot_spawn_3",
      "bot_spawn_4",
      "bot_spawn_5",
      "bot_spawn_6",
      "bot_spawn_7",
      "bot_spawn_8",
      "bot_spawn_9",
      "bot_special_1",
      "countdown_1",
      "countdown_2",
      "death_1",
      "death_2",
      "death_3",
      "death_4",
      "explosion_1",
      "explosion_2",
      "explosion_3",
      "game_over_1",
      "game_over_2",
      "game_over_3",
      "hurt_1",
      "hurt_2",
      "hurt_3",
      "hurt_4",
      "hurt_5",
      "hurt_6",
      "key_collect_1",
      "key_collect_2",
      "key_collect_3",
      "open_treasure_chest_1",
      "open_treasure_chest_2",
      "open_treasure_chest_3",
      "powerup_collect_1",
      "punch_1",
      "punch_2",
      "punch_3",
      "punch_4",
      "punch_5",
      "victory_1",
      "victory_2",
      "victory_3"
    ],
    "wallpapers": [
      "wallpaper_1",
      "wallpaper_10",
      "wallpaper_100",
      "wallpaper_101",
      "wallpaper_102",
      "wallpaper_103",
      "wallpaper_104",
      "wallpaper_105",
      "wallpaper_106",
      "wallpaper_107",
      "wallpaper_108",
      "wallpaper_109",
      "wallpaper_11",
      "wallpaper_110",
      "wallpaper_111",
      "wallpaper_112",
      "wallpaper_113",
      "wallpaper_114",
      "wallpaper_115",
      "wallpaper_116",
      "wallpaper_117",
      "wallpaper_118",
      "wallpaper_119",
      "wallpaper_120",
      "wallpaper_121",
      "wallpaper_122",
      "wallpaper_123",
      "wallpaper_124",
      "wallpaper_125",
      "wallpaper_126",
      "wallpaper_127",
      "wallpaper_128",
      "wallpaper_129",
      "wallpaper_13",
      "wallpaper_130",
      "wallpaper_131",
      "wallpaper_132",
      "wallpaper_133",
      "wallpaper_134",
      "wallpaper_135",
      "wallpaper_136",
      "wallpaper_137",
      "wallpaper_138",
      "wallpaper_139",
      "wallpaper_14",
      "wallpaper_140",
      "wallpaper_141",
      "wallpaper_142",
      "wallpaper_143",
      "wallpaper_144",
      "wallpaper_145",
      "wallpaper_146",
      "wallpaper_147",
      "wallpaper_148",
      "wallpaper_149",
      "wallpaper_15",
      "wallpaper_150",
      "wallpaper_16",
      "wallpaper_17",
      "wallpaper_18",
      "wallpaper_19",
      "wallpaper_2",
      "wallpaper_20",
      "wallpaper_21",
      "wallpaper_22",
      "wallpaper_28",
      "wallpaper_29",
      "wallpaper_3",
      "wallpaper_30",
      "wallpaper_31",
      "wallpaper_32",
      "wallpaper_33",
      "wallpaper_34",
      "wallpaper_35",
      "wallpaper_36",
      "wallpaper_37",
      "wallpaper_38",
      "wallpaper_39",
      "wallpaper_4",
      "wallpaper_40",
      "wallpaper_41",
      "wallpaper_42",
      "wallpaper_43",
      "wallpaper_44",
      "wallpaper_45",
      "wallpaper_46",
      "wallpaper_47",
      "wallpaper_48",
      "wallpaper_49",
      "wallpaper_5",
      "wallpaper_50",
      "wallpaper_51",
      "wallpaper_52",
      "wallpaper_53",
      "wallpaper_54",
      "wallpaper_55",
      "wallpaper_56",
      "wallpaper_57",
      "wallpaper_58",
      "wallpaper_59",
      "wallpaper_6",
      "wallpaper_60",
      "wallpaper_61",
      "wallpaper_62",
      "wallpaper_63",
      "wallpaper_64",
      "wallpaper_65",
      "wallpaper_66",
      "wallpaper_67",
      "wallpaper_68",
      "wallpaper_69",
      "wallpaper_7",
      "wallpaper_70",
      "wallpaper_71",
      "wallpaper_72",
      "wallpaper_73",
      "wallpaper_74",
      "wallpaper_75",
      "wallpaper_76",
      "wallpaper_77",
      "wallpaper_78",
      "wallpaper_79",
      "wallpaper_8",
      "wallpaper_80",
      "wallpaper_81",
      "wallpaper_82",
      "wallpaper_83",
      "wallpaper_84",
      "wallpaper_85",
      "wallpaper_86",
      "wallpaper_87",
      "wallpaper_88",
      "wallpaper_89",
      "wallpaper_9",
      "wallpaper_90",
      "wallpaper_91",
      "wallpaper_92",
      "wallpaper_93",
      "wallpaper_94",
      "wallpaper_95",
      "wallpaper_96",
      "wallpaper_97",
      "wallpaper_98",
      "wallpaper_99"
    ]
  },
  "display": {
    "width": 1920,
    "height": 1080,
    "design_height": 1080,
    "background_color": "#000000",
    "pixel_art": true
  },
  "gameplay": {
    "time_limit_seconds": 180,
    "max_keys": 150,
    "difficulty_escalation": {
      "enabled": true,
      "interval_seconds": 60,
      "enemy_spawn_multiplier": 0.85,
      "bomb_spawn_multiplier": 0.9,
      "min_enemy_spawn_ms": 750,
      "min_bomb_spawn_ms": 2500
    },
    "guest": {
      "enabled": true,
      "max_sessions_per_day": 24,
      "storage_key": "tresr_guest_sessions"
    },
    "fee_gate": {
      "transaction_timeout_ms": 300000
    },
    "claim_retries": {
      "max_attempts": 3,
      "base_delay_ms": 100
    },
    "vault": {
      "max_score": 20000,
      "minimum_cap": 1000,
      "tiers": {
        "building": 10000,
        "sweet_spot": 50000,
        "fomo": 100000
      },
      "difficulty_multipliers": {
        "building": 1,
        "sweet_spot": 1.5,
        "fomo": 2,
        "legendary": 3
      },
      "payout_fixed": {
        "building": 500
      },
      "payout_percentages": {
        "sweet_spot": 10,
        "fomo": 25,
        "legendary": 50
      }
    },
    "physics": {
      "fps": 60,
      "gravity": 0.75,
      "timestep": 0.01667,
      "game_speed": 1.5
    },
    "visuals": {
      "shadow": {
        "color": 0,
        "opacity": 0.35,
        "width": 105,
        "height": 24,
        "offset_x": 0,
        "offset_y": -45,
        "angle": 10
      },
      "damage_tint_duration": 100
    },
    "scoring": {
      "key_collection": 100,
      "enemy_kill": 10,
      "boss_hit": 25,
      "super_hit": 25
    },
    "health_bar": {
      "thresholds": {
        "high": 0.75,
        "medium": 0.5,
        "low": 0.25,
        "critical": 0.1
      },
      "width": 60,
      "height": 6,
      "offset_y": -15,
      "background_color": 0,
      "colors": {
        "high": 65280,
        "medium": 16776960,
        "low": 16746496,
        "critical": 16711680
      }
    },
    "walkable_area": {
      "top_y_ratio": 0.85,
      "bottom_y_ratio": 1,
      "left_x_ratio": 0,
      "right_x_ratio": 1
    },
    "entities": {
      "player": {
        "health": 1000,
        "damage": 25,
        "speed": 300,
        "jump_force": 25,
        "knockback": {
          "force": 200,
          "stun_ms": 300
        },
        "hitbox": {
          "radius": 20,
          "offsetX": 236,
          "offsetY": 472
        },
        "combat": {
          "reach": 80,
          "attack_range": 80,
          "hit_stop_ms": 50
        },
        "super": {
          "damage": 500,
          "splash_damage": 250,
          "splash_radius": 100,
          "speed": 500,
          "max_range": 1000,
          "charge_per_kill": 10,
          "max_charge": 100,
          "max_projectiles": 3,
          "hitbox": {
            "width": 30,
            "height": 50,
            "hit_radius": 40,
            "depth_threshold": 60,
            "fire_offset": 40,
            "offscreen_margin": 50
          },
          "effects": {
            "shake_duration": 200,
            "shake_intensity": 0.02,
            "explosion_initial_radius": 10,
            "explosion_expand_duration": 300
          }
        },
        "health_bar": {
          "width": 50,
          "height": 6,
          "offset_y": -5
        },
        "effects": {
          "attack_shake_duration": 100,
          "attack_shake_intensity": 0.01,
          "victory_flash_duration": 500
        },
        "spawn": {
          "x_ratio": 0.039,
          "y_ratio": 0.903
        },
        "lives": 1,
        "respawn": {
          "invincibility_ms": 3000,
          "blink_interval_ms": 100,
          "delay_ms": 1000
        },
        "input": {
          "gamepad_deadzone": 0.2,
          "touch": {
            "joystick_radius": 50,
            "joystick_deadzone": 0.15
          }
        }
      },
      "enemy": {
        "health": 100,
        "damage": 10,
        "speed": 150,
        "flee_speed_mult": 1.5,
        "flee_margin_px": 50,
        "offscreen_kill_distance_px": 100,
        "walk_in_boundary_margin_px": 5,
        "knockback": {
          "force": 300,
          "stun_ms": 200
        },
        "hitbox": {
          "radius": 18,
          "offsetX": 238,
          "offsetY": 476
        },
        "combat": {
          "attack_range": 80,
          "depth_threshold": 40,
          "attack_check_ms": 500
        },
        "ai": {
          "cautious": {
            "speed_mult": 0.7,
            "preferred_distance": 250,
            "group_radius": 200,
            "pack_threshold": 4,
            "charge_speed_mult": 1.3,
            "strafe_speed_mult": 0.9,
            "strafe_switch_time": 2,
            "check_frame_interval": 10
          },
          "direct": {},
          "erratic": {
            "speed_mult": 1.2,
            "zigzag_frequency": 1.5,
            "zigzag_amplitude": 1.5,
            "jitter_x": 80,
            "jitter_y": 40
          },
          "flanker": {
            "speed_mult": 1.1,
            "offset": 200,
            "switch_time": 3,
            "orbit_time": 2,
            "lunge_speed_mult": 2.5,
            "lunge_duration": 0.3,
            "recovery_time": 0.8
          },
          "passive": {
            "speed_mult": 0.5,
            "provoked_speed_mult": 1.3,
            "hp_mult": 1.5
          },
          "retardio": {
            "speed_mult": 1.1,
            "jitter_time": 0.3,
            "retarget_time": 4,
            "attack_damage": 10,
            "attack_cooldown_s": 0.5,
            "rage_tint": 16711680
          },
          "swarm": {
            "speed_mult": 1,
            "group_radius": 150,
            "speed_bonus_per_ally": 0.15,
            "max_speed_mult": 2,
            "rush_threshold": 3,
            "rush_tint": 65416,
            "check_frame_interval": 10
          },
          "weights": {
            "cautious": 10,
            "direct": 20,
            "erratic": 20,
            "flanker": 20,
            "passive": 10,
            "retardio": 10,
            "swarm": 10
          }
        },
        "health_bar": {
          "width": 30,
          "height": 4,
          "offset_y": -5
        },
        "animations": {
          "death_delay": 500
        },
        "spawner": {
          "pool_size": 50,
          "delay_ms": 2500,
          "buffer_distance": 50,
          "director": {
            "burst_chance": 0.15,
            "burst_count_min": 3,
            "burst_count_max": 7,
            "burst_delay_ms": 300,
            "breather_chance": 0.2,
            "breather_duration_ms": 5000,
            "limo_chance": 0.05,
            "limo_count": 5
          }
        },
        "loot": {
          "health": {
            "drop_chance": 0.25,
            "heal_amount": 25,
            "variants": 5
          },
          "powerup": {
            "drop_chance": 0.1,
            "variants": 5
          },
          "hitbox": {
            "width": 400,
            "height": 400
          },
          "pool_size": 20,
          "bob_distance": 8,
          "bob_duration": 600,
          "despawn_ms": 8000
        }
      },
      "boss": {
        "health": 250,
        "damage": 25,
        "speed": 150,
        "knockback": {
          "force": 50,
          "force_mult": 0.5,
          "stun_ms": 100
        },
        "hitbox": {
          "radius": 20,
          "offsetX": 236,
          "offsetY": 472
        },
        "combat": {
          "attack_range": 60,
          "contact_depth_threshold": 60
        },
        "descent": {
          "speed": 3,
          "start_y": -100,
          "threshold_ratio": 0.903
        },
        "phases": {
          "enrage_threshold": 0.5,
          "phase2_speed_mult": 2,
          "phase2_damage_mult": 2,
          "enrage_tint": 16711680
        },
        "attacks": {
          "ground_pound": {
            "damage": 15,
            "radius": 120,
            "windup_ms": 800,
            "cooldown_ms": 5000
          },
          "charge": {
            "speed_mult": 4,
            "damage": 20,
            "duration_ms": 1000,
            "cooldown_ms": 7000
          },
          "summon": {
            "count": 3,
            "cooldown_ms": 10000
          }
        },
        "attack_cooldown_ms": 3000,
        "charge_range_mult": 2,
        "summon_pause_s": 0.5,
        "defeated_alpha": 0.5,
        "enrage_flash_ms": 200,
        "ground_pound_effects": {
          "shake_duration": 200,
          "shake_intensity": 0.01,
          "ring_initial_radius": 10,
          "ring_expand_duration": 400
        },
        "death_effects": {
          "shake_duration": 300,
          "shake_intensity": 0.025,
          "flash_duration": 200,
          "flash_r": 255,
          "flash_g": 200,
          "flash_b": 100
        },
        "health_bar": {
          "width": 80,
          "height": 8,
          "offset_y": -10
        },
        "animations": {
          "death_delay": 1000
        }
      },
      "key": {
        "speed": 80,
        "gravity": 0.04,
        "terminal_vz": 1.5,
        "drag": 0.12,
        "wind_frequency": 0.4,
        "bounce_threshold": 0.3,
        "oscillation": {
          "frequency": 3,
          "amplitude": 18
        },
        "bounce_damping": 0.2,
        "offscreen_kill_distance": 200,
        "animations": {
          "fade_duration": 500,
          "fade_delay": 3000
        },
        "spawner": {
          "pool_size": 20,
          "delay_ms": 2000,
          "start_z": 800,
          "x_margin": 100,
          "y_margin_top_ratio": 0.833,
          "y_margin_bottom_ratio": 0.035
        }
      },
      "bomb": {
        "damage": 50,
        "explosion_radius": 250,
        "hitbox": {
          "width": 25,
          "height": 25
        },
        "effects": {
          "shake_duration": 150,
          "shake_intensity": 0.015,
          "explosion_scale": 0.2,
          "explosion_duration": 300,
          "explosion_tint": 16737792,
          "explosion_alpha": 0.5
        },
        "spawner": {
          "pool_size": 10,
          "delay_ms": 5000,
          "start_z": 800,
          "x_margin": 100,
          "y_margin_top_ratio": 0.833,
          "y_margin_bottom_ratio": 0.035
        }
      },
      "chest": {
        "fallback_tint": 65280,
        "combat": {
          "interact_range": 100
        },
        "air_drop": {
          "delay_after_boss_ms": 1000,
          "landing_flash_color": 65416,
          "landing_flash_ms": 300,
          "landing_dust_color": 13412932,
          "landing_dust_radius": 80,
          "landing_dust_duration_ms": 400,
          "landing_shake_duration": 150,
          "landing_shake_intensity": 0.01
        }
      },
      "tresr_bot": {
        "health": 500,
        "damage": 50,
        "speed": 180,
        "air_drop": {
          "landing_flash_color": 65416,
          "landing_flash_ms": 500,
          "landing_dust_color": 8947848,
          "landing_dust_radius": 60,
          "landing_dust_duration_ms": 300,
          "landing_shake_duration": 100,
          "landing_shake_intensity": 0.005
        },
        "knockback": {
          "force": 120,
          "stun_ms": 200
        },
        "hitbox": {
          "radius": 13,
          "offsetX": 193,
          "offsetY": 361
        },
        "combat": {
          "attack_range": 80,
          "attack_cooldown_ms": 800,
          "target_switch_ms": 2000,
          "follow_distance": 80,
          "follow_speed_mult": 0.7
        },
        "lifetime": {
          "duration_ms": 30000,
          "fade_duration_ms": 1500,
          "spawn_flash_ms": 500
        },
        "special": {
          "cooldown_ms": 10000,
          "damage": 100,
          "radius": 120,
          "min_enemies": 3
        },
        "max_concurrent": 1,
        "max_drops_per_game": 5
      }
    },
    "combat": {
      "enemy_damage_cooldown_ms": 500,
      "enemy_spawn_offscreen_px": 80,
      "boss_melee_range_bonus": 20,
      "projectile_hit_radius": 40
    },
    "announcements": {
      "font": "80px Orbitron",
      "color": "#00ff00",
      "stroke_color": "#000000",
      "stroke_thickness": 8,
      "enter_duration": 500,
      "display_duration": 2000,
      "exit_duration": 500
    },
    "audio": {
      "default_music_volume": 0.75,
      "default_sfx_volume": 0.5,
      "crossfade_duration_ms": 2000,
      "crossfade_step_ms": 50,
      "preference_save_debounce_ms": 2000,
      "sfx_variants": {
        "bot_attack": 2,
        "bot_spawn": 10,
        "bot_special": 1,
        "countdown": 2,
        "death": 4,
        "explosion": 3,
        "game_over": 3,
        "hurt": 6,
        "key_collect": 3,
        "open_treasure_chest": 3,
        "powerup_collect": 1,
        "punch": 5,
        "victory": 3
      },
      "sfx_volume_overrides": {
        "bot_attack": 1,
        "bot_spawn": 1,
        "bot_special": 1,
        "countdown": 1,
        "death": 1,
        "explosion": 1,
        "game_over": 1,
        "hurt": 1,
        "key_collect": 1,
        "open_treasure_chest": 1,
        "powerup_collect": 1,
        "punch": 1,
        "victory": 1
      }
    },
    "loading_screen": {
      "mode": "video",
      "spinner": {
        "y_offset": -60
      },
      "video": {
        "path": "/assets/videos/loader.webp",
        "scale": 0.4,
        "y_offset": -60
      }
    }
  },
  "sprites": {
    "defaults": {
      "frameWidth": 512,
      "frameHeight": 512
    },
    "hero": {
      "scaleFactor": 0.8,
      "anims": [
        {
          "name": "idle",
          "frames": 6,
          "frameRate": 6,
          "repeat": -1,
          "path": "/assets/images/sprites/hero/idle.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "walk",
          "frames": 6,
          "frameRate": 8,
          "repeat": -1,
          "path": "/assets/images/sprites/hero/walk.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "jump",
          "frames": 6,
          "frameRate": 10,
          "repeat": 0,
          "path": "/assets/images/sprites/hero/jump.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "attack",
          "frames": 6,
          "frameRate": 10,
          "repeat": 0,
          "path": "/assets/images/sprites/hero/attack.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "hurt",
          "frames": 4,
          "frameRate": 8,
          "repeat": 0,
          "path": "/assets/images/sprites/hero/hurt.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "super",
          "frames": 6,
          "frameRate": 12,
          "repeat": 0,
          "path": "/assets/images/sprites/hero/super.webp",
          "frameWidth": 512,
          "frameHeight": 512
        }
      ]
    },
    "super": {
      "scaleFactor": 1,
      "anims": [
        {
          "name": "spin",
          "frames": 5,
          "frameRate": 15,
          "repeat": -1,
          "path": "/assets/images/sprites/super/spin.webp",
          "frameWidth": 256,
          "frameHeight": 256
        }
      ]
    },
    "boss": {
      "scaleFactor": 2,
      "anims": [
        {
          "name": "idle",
          "frames": 8,
          "frameRate": 6,
          "repeat": -1,
          "path": "/assets/images/sprites/boss/idle.webp",
          "frameWidth": 400,
          "frameHeight": 500
        },
        {
          "name": "walk",
          "frames": 8,
          "frameRate": 8,
          "repeat": -1,
          "path": "/assets/images/sprites/boss/walk.webp",
          "frameWidth": 400,
          "frameHeight": 516
        },
        {
          "name": "jump",
          "frames": 8,
          "frameRate": 10,
          "repeat": 0,
          "path": "/assets/images/sprites/boss/jump.webp",
          "frameWidth": 400,
          "frameHeight": 700
        },
        {
          "name": "attack",
          "frames": 8,
          "frameRate": 10,
          "repeat": 0,
          "path": "/assets/images/sprites/boss/attack.webp",
          "frameWidth": 400,
          "frameHeight": 500
        },
        {
          "name": "hurt",
          "frames": 8,
          "frameRate": 8,
          "repeat": 0,
          "path": "/assets/images/sprites/boss/hurt.webp",
          "frameWidth": 400,
          "frameHeight": 500
        }
      ]
    },
    "enemies": {
      "scaleFactor": 0.8,
      "count": 5,
      "anims": [
        {
          "name": "idle",
          "frames": 6,
          "frameRate": 6,
          "repeat": -1,
          "pathTemplate": "/assets/images/sprites/enemy_{i}/idle.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "walk",
          "frames": 6,
          "frameRate": 8,
          "repeat": -1,
          "pathTemplate": "/assets/images/sprites/enemy_{i}/walk.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "jump",
          "frames": 6,
          "frameRate": 10,
          "repeat": 0,
          "pathTemplate": "/assets/images/sprites/enemy_{i}/jump.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "attack",
          "frames": 6,
          "frameRate": 10,
          "repeat": 0,
          "pathTemplate": "/assets/images/sprites/enemy_{i}/attack.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "hurt",
          "frames": 4,
          "frameRate": 8,
          "repeat": 0,
          "pathTemplate": "/assets/images/sprites/enemy_{i}/hurt.webp",
          "frameWidth": 512,
          "frameHeight": 512
        }
      ]
    },
    "tresr_bot": {
      "scaleFactor": 1,
      "anims": [
        {
          "name": "idle",
          "frames": 6,
          "frameRate": 6,
          "repeat": -1,
          "path": "/assets/images/sprites/tresr_bot/idle.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "walk",
          "frames": 6,
          "frameRate": 8,
          "repeat": -1,
          "path": "/assets/images/sprites/tresr_bot/walk.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "attack",
          "frames": 6,
          "frameRate": 10,
          "repeat": 0,
          "path": "/assets/images/sprites/tresr_bot/attack.webp",
          "frameWidth": 512,
          "frameHeight": 512
        },
        {
          "name": "special",
          "frames": 6,
          "frameRate": 10,
          "repeat": 0,
          "path": "/assets/images/sprites/tresr_bot/special.webp",
          "frameWidth": 512,
          "frameHeight": 512
        }
      ]
    },
    "items": {
      "key": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 5,
            "frameRate": 4,
            "repeat": -1,
            "path": "/assets/images/sprites/key/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "bomb": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 5,
            "frameRate": 10,
            "repeat": -1,
            "path": "/assets/images/sprites/bomb/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "loader": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 5,
            "frameRate": 8,
            "repeat": -1,
            "path": "/assets/images/sprites/loader/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "chest": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 5,
            "frameRate": 8,
            "repeat": -1,
            "path": "/assets/images/sprites/chest/idle.webp",
            "frameWidth": 512,
            "frameHeight": 512
          },
          {
            "name": "open",
            "frames": 5,
            "frameRate": 8,
            "repeat": 0,
            "path": "/assets/images/sprites/chest/open.webp",
            "frameWidth": 512,
            "frameHeight": 512
          },
          {
            "name": "close",
            "frames": 5,
            "frameRate": 8,
            "repeat": 0,
            "path": "/assets/images/sprites/chest/close.webp",
            "frameWidth": 512,
            "frameHeight": 512
          }
        ]
      },
      "health_1": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/health_1/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "health_2": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/health_2/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "health_3": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/health_3/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "health_4": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/health_4/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "health_5": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/health_5/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "powerup_1": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/powerup_1/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "powerup_2": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/powerup_2/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "powerup_3": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/powerup_3/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "powerup_4": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/powerup_4/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      },
      "powerup_5": {
        "scaleFactor": 1,
        "anims": [
          {
            "name": "idle",
            "frames": 4,
            "frameRate": 6,
            "repeat": -1,
            "path": "/assets/images/sprites/powerup_5/idle.webp",
            "frameWidth": 256,
            "frameHeight": 256
          }
        ]
      }
    },
    "statics": []
  },
  "anti_cheat": {
    "ban_durations_hours": [
      24,
      72,
      168
    ],
    "permanent_after_offence": 4,
    "ban_reasons": [
      "config_hash_mismatch",
      "is_a_sore_loser",
      "replay_validation_failure",
      "score_exceeds_maximum",
      "wallet_tampering"
    ],
    "replay": {
      "max_actions": 50000,
      "min_action_gap_ms": 10,
      "min_attack_gap_ms": 200,
      "grace_ms": 5000
    }
  },
  "credits": {
    "description": "Look here degen, this is just a fun, unofficial game whipped up for the TRESR community.\n\nIt's kind of like fanfic but with crypto twists and pixels.\n\nNo official ties to the TRESR project (you know, the ones slinging those killer t-shirts over at tresr.com).\n\nBugs might creep in, or things could glitch out.\n\nBut that's all on me – the TRESR folks aren't to blame; they're the pros laying the groundwork we all love.\n\nThis was put together with a ton of love ❤️, some wild ideas, and mad respect for the TRESR community.\n\nDisclaimer out of the way, let's hit the credits!\n\nThis whole thing's built on the work of some absolute legends; without 'em, we'd be nowhere in this crypto playground.\n\nBig ups to these folks;\n",
    "coders": [
      {
        "name": "MAHDTech",
        "role": "Degenerate Programmer",
        "description": "Platform Engineer moonlighting as a game dev."
      },
      {
        "name": "Phantom",
        "role": "Opinion Giver",
        "description": "MAHDTech's eldest son, giver of opinions and selector of AI Art/Music."
      },
      {
        "name": "Remminator",
        "role": "Consumer of Snacks",
        "description": "MAHDTech's youngest son and master of eating snacks while testing."
      }
    ],
    "components": [
      {
        "name": "Astro"
      },
      {
        "name": "Avalanche Network"
      },
      {
        "name": "DaisyUI"
      },
      {
        "name": "Internet Computer Protocol"
      },
      {
        "name": "Juno"
      },
      {
        "name": "Phaser 3"
      }
    ],
    "assets": [
      {
        "type": "audio",
        "subtype": "sfx",
        "provider": "Eleven Labs"
      },
      {
        "type": "audio",
        "subtype": "narration",
        "provider": "Eleven Labs"
      },
      {
        "type": "audio",
        "subtype": "music",
        "provider": "Suno"
      },
      {
        "type": "art",
        "subtype": "character",
        "provider": "Google Gemini Nano Banana"
      },
      {
        "type": "art",
        "subtype": "backgrounds",
        "provider": "Google Gemini Nano Banana"
      }
    ]
  },
  "changelog": {
    "versions": [
      {
        "version": "0.4.0",
        "date": "2026-03-15",
        "title": "Prizes for losers",
        "notes": [
          "Parachute physics for Key airdrops",
          "Consolation prize for expired #1 active score — a participation trophy for degens",
          "Squashed bugs like there was a cockroach infestation",
          "Game sessions are used for Claim Authorizations. Cheaters will now be banned"
        ]
      },
      {
        "version": "0.3.0",
        "date": "2026-03-03",
        "title": "Make AI great again",
        "notes": [
          "$tRON token and Faucet enabled",
          "v2 Sprites with ridiculous big head animation",
          "Active score leaderboard with 24h TTL decay — your high score rugs itself",
          "Unit tests included to catch dem sneaky regressions",
          "New Enemy AI types — the bankers brought reinforcements from TradFi",
          "Added Enemy AI 1. Direct: Charges straight at the player with no special movement",
          "Added Enemy AI 2. Flanker: Orbits the player at a set radius, then lunges in to attack.",
          "Added Enemy AI 3. Cautious: Strafes laterally at preferred distance when solo.",
          "Added Enemy AI 4. Erratic: Snakes toward the player with continuous sine-wave zigzag.",
          "Added Enemy AI 5. Swarm: Clusters with nearby allies. When rush_threshold allies are nearby, triggers a coordinated rush with a green tint visual cue.",
          "Added Enemy AI 6. Passive (The Banker): Walks slowly across the screen, minding its own business.",
          "Added Enemy AI 7. Retardio: Rare, chaotic enemy that attacks OTHER enemies."
        ]
      },
      {
        "version": "0.2.0",
        "date": "2026-02-21",
        "title": "Mobile Friendly",
        "notes": [
          "Mobile support so you can beat-up bankers from the toilet",
          "Mobile touch controls and Game Pad support",
          "PWA Mobile support for that poor-man native app feel",
          "Portrait mode blocked — forced landscape, no vertical charts allowed",
          "Game speed set to 1.5, because degens have no patience",
          "Guest (normie) and authenticated (degen) play modes",
          "SIWA enabled (Sign-In with Avalanche)",
          "CI Pipelines — because yolo-pushing to main was getting old",
          "CI Pipeline caching — builds go brrr 🚀",
          "Game session tracking on victory and defeat — receipts for your bags and your L's",
          "Leaderboard — finally some on-chain clout to flex",
          "Countdown timers on active leaderboard entries — watch your clout evaporate in real time",
          "Screen wake lock — your phone won't paper-hand and go to sleep mid-boss",
          "Two-tab leaderboard UI (ACTIVE + ALL TIME) — so you can cope in two dimensions",
          "An initial half-arsed attempt at cheating prevention"
        ]
      },
      {
        "version": "0.1.0",
        "date": "2026-02-11",
        "title": "Genesis Drop",
        "notes": [
          "Initial MVP release pushed straight to main like a savage",
          "Guest(normie) play modes",
          "Beat-em-up combat with 2.5D physics",
          "Phaser 3 Arcade Engine",
          "Single enemy sprite with multiple AI behaviors",
          "Boss encounters with ground pound and charge attacks",
          "Key and loot drop system",
          "Bear Market of endless retardio bankers",
          "AI generated Art, SFX and Music",
          "No working backend or smart contracts yet"
        ]
      }
    ]
  },
  "configHash": "d61adb513ea3681ea22779f1ec194cf82485ad6ba6a77787e472da64b5779e81"
};
