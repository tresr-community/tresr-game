# Tresr Game Roadmap

**Version:** 2.1
**Last Updated:** 2026-02-10

This document outlines the feature and bug fix roadmap for the Tresr game, organized by priority and category.

## Legend

- **P0**: Critical - Blocks gameplay or core functionality
- **P1**: High - Important features for MVP launch
- **P2**: Medium - Enhances gameplay experience
- **P3**: Low - Nice to have, post-MVP polish

---

## Phase 1: Core Gameplay Completion (P0-P1)

### 1.1 Super Attack System

**Status:** DONE
**Priority:** P1
**Spec Reference:** Section "Super Attack Mechanic"

- [x] Add `superCharge` field to game store (0-100%)
- [x] Charge increases on enemy kills (+10% per kill)
- [x] Add charge bar UI in HUD (bottom center, above phase text)
- [x] Implement super attack damage (area-of-effect, all enemies in radius)
- [x] Add super attack animation and SFX
- [x] Add super attack config to YAML (`gameplay.stats.player.super_damage`, `super_radius`)
- [x] ENTER key / RB gamepad button triggers when bar is full

### 1.2 Health Bars

**Status:** DONE
**Priority:** P1

- [x] Player HP bar: Visual progress bar in top-left HUD
- [x] Enemy floating HP bars: Show above each enemy sprite (color-coded thresholds)
- [x] Boss HP bar: Large bar at top of screen during boss phase
- [x] Implemented via Phaser Graphics (BaseEntity health bar system)

### 1.3 Combat Polish

**Status:** DONE
**Priority:** P1

- [x] Attack hitboxes with configurable reach/range
- [x] Damage values from config (player, enemy, boss)
- [x] Attack cooldown to prevent spam
- [x] Hit-stop mechanic on impact + camera shake
- [x] Knockback on hit (#175)
- [x] Fix chest interaction (punch-only, not overlap) (#176)

---

## Phase 2: AI and Enemy Behavior (P1-P2)

### 2.1 Enemy AI Enhancement

**Status:** DONE
**Priority:** P2
**Spec Reference:** Section "Entity System"

- [x] Implement AI behavior types:
  - [x] Direct: Straight chase (aggressive)
  - [x] Flanker: Approaches from sides, switches direction (intelligent)
  - [x] Cautious: Slower movement, stops occasionally (stealthy/waiting)
  - [x] Erratic: Random jitter movement (unpredictable)
- [x] Assign random AI type on spawn (via seeded RNG)
- [x] AI config driven from YAML

### 2.2 Boss AI Enhancement

**Status:** Partial — basic chase/attack works, advanced patterns NOT implemented
**Priority:** P2

- [x] Boss spawning with descent animation
- [x] Basic chase and attack behavior
- [ ] Add attack patterns:
  - [ ] Ground pound (AoE damage)
  - [ ] Charge attack (dash toward player)
  - [ ] Summon minions (spawn extra enemies)
- [ ] Add phase transitions based on HP thresholds
- [ ] Implement difficulty scaling per spec

### 2.3 Bomb Hazards

**Status:** DONE
**Priority:** P2

- [x] Implement bomb as damaging hazard (falling with Z-axis physics)
- [x] Splash damage on impact (configurable radius)
- [x] Camera shake on explosion
- [x] Damages both player and enemies

---

## Phase 3: Audio System (P1-P2)

### 3.1 SFX Implementation

**Status:** DONE
**Priority:** P1
**Spec Reference:** Section "SFX (Sound Effects)"

- [x] Player Attack: Punch sound with variants (punch_1, punch_2)
- [x] Player Hurt: Damage taken
- [x] Enemy Death: Enemy defeated
- [x] Key Collect: Key pickup
- [x] Boss Spawn: Boss arrival
- [x] Chest Hit: Punching chest (open_treasure_chest)
- [x] Victory: Game win
- [x] Game Over: Player death
- [x] Explosion: Bomb detonation
- [x] SFX loaded in Preloader, played via MainScene.playSound()
- [x] Volume control from game store
- [x] Seeded RNG for variant selection

### 3.2 Music System Improvements

**Status:** DONE
**Priority:** P2

- [x] MusicManager singleton with shuffle queue persistence
- [x] Track transitions and volume control
- [x] Preference saving to Juno
- [x] Add crossfade between tracks (#177)
- [ ] Separate volume for game music vs menu music

---

## Phase 4: Economy and Blockchain (P1)

### 4.1 Deposit Flow

**Status:** DONE
**Priority:** P1

- [x] FeeGate entry fee payment
- [x] Deposit transaction signing
- [x] Session ID tracking
- [ ] Implement 10% burn on deposit
- [ ] Verify deposit on Juno backend

### 4.2 Claim Flow

**Status:** DONE
**Priority:** P1

- [x] Implement replay input submission (Recorder.ts)
- [x] Implement oracle signature generation
- [x] Implement Vault.claim() call (avalanche.ts)
- [x] Victory modal with claim button
- [ ] Implement 24-hour cooldown enforcement
- [ ] Implement reward formula: `(keys_collected / 150) * 50%`

### 4.3 Vault Display

**Status:** Not implemented
**Priority:** P2

- [ ] Show treasure chest overlay on home page
- [ ] Display current vault balance in $TRESR
- [ ] Hide in guest mode

---

## Phase 5: UI/UX Polish (P2)

### 5.1 Game Over Screen

**Status:** DONE
**Priority:** P2

- [x] Victory modal with score/reward and claim button
- [x] Lost modal with retry option
- [x] Themed with DaisyUI styling
- [x] Display full stats (enemies killed, keys collected, time survived) (#181)
- [x] Auto-save high score on death (#181)

### 5.2 Loading Screen

**Status:** DONE
**Priority:** P2

- [x] Custom loader with spinning coin animation
- [x] Progress bar during asset load
- [x] Configurable messages and minimum display time
- [x] Smooth transitions

### 5.3 Leaderboard

**Status:** DONE
**Priority:** P2

- [x] Leaderboard modal component
- [x] Display top 10 by highScore from Juno
- [x] Shows nickname, avatar, score, date
- [x] Loading states

### 5.4 Notifications

**Status:** DONE
**Priority:** P2

- [x] NotificationManager with urgency levels (none/non-urgent/urgent)
- [x] Toast display component
- [x] Notification bell with badge
- [x] Snooze functionality
- [x] Persistence to Juno

---

## Phase 6: Performance and Code Quality (P2-P3)

### 6.1 Phaser Optimization

**Priority:** P2

- [x] Object pooling via Phaser Groups (enemies, keys, bombs, super projectiles)
- [ ] Profile update loop for bottlenecks
- [ ] Ensure proper cleanup in scene shutdown
- [ ] Verify no memory leaks from event listeners

### 6.2 Code Organization

**Priority:** P3

- [x] Folder structure: `lib/config`, `lib/game`, `lib/wallet`, `lib/pwa`, `lib/utils`
- [ ] Extract AI logic to `src/lib/game/ai/`
- [ ] Extract UI logic to `src/lib/game/ui/`

### 6.3 Logging Standardisation

**Status:** DONE
**Priority:** P3
**Spec Reference:** Section "Logging"

- [x] Centralized `log` utility with component tags and levels
- [x] Format: `[COMPONENT] [LEVEL] Message`
- [x] Browser console color formatting
- [x] Toast integration for warnings/errors

---

## Phase 7: PWA and Deployment (P2)

### 7.1 PWA Enhancements

**Status:** DONE
**Priority:** P2

- [x] Service worker registration with offline support
- [x] Update detection (SW byte-comparison + version polling)
- [x] Update notification system (UpdatePrompt component)
- [x] Install prompt handling
- [ ] Verify offline gameplay works end-to-end
- [ ] Test install prompt on mobile devices

### 7.2 Version Management & Anti-Cheat

**Status:** DONE
**Priority:** P2

- [x] Config hash validation (SHA-256 anti-cheat)
- [x] Escalating ban system with profile tracking (#152)
- [x] Ban modal with expiry timer and offence count (#152)
- [x] Gameplay lockout on tamper detection
- [x] Ban modal escape key bypass fix (#155)
- [x] Timing-safe hash comparison (#156)
- [x] Guest user ban bypass prevention (#166)
- [ ] Ensure `app.version` in tresr.yaml is bumped per release

---

## Phase 8: Loot, Narration, and Sprite Pipeline (P1-P2)

### 8.1 Loot Drop System

**Status:** DONE
**Priority:** P1

- [x] Health pickups: 5 variants (soda can, milkshake, water bottle, hamburger, french fries)
- [x] Powerup pickups: 5 variants (energy can blue, coffee mug, red bull, red bull no sugar, takeaway coffee cup)
- [x] Loot drops from defeated enemies via seeded RNG
- [x] Config-driven drop rates and variant counts (`loot.health.variants`, `loot.powerup.variants`)

### 8.2 Intro Narration Voiceover

**Status:** DONE
**Priority:** P2

- [x] Play intro narration (`intro.webm`) during Preloader loading screen
- [x] Gate scene transition: wait for voiceover to finish before moving to MainScene
- [x] Guest users: narration always plays
- [x] Logged-in users: controlled by `narration` preference (default: true)
- [x] Narration toggle checkbox in MusicPlayer (visible to logged-in users only)
- [x] `narration?: boolean` added to `UserProfile.preferences` in backend types
- [x] Graceful handling: autoplay blocked, audio error, or preference disabled → game proceeds normally
- [x] Audio stored at `public/assets/audio/narration/intro.webm`

### 8.3 Sprite Standardization

**Status:** DONE
**Priority:** P2

- [x] Standardized all sprite frames to 512x512 base size
- [x] Special frame sizes: hero super (1024x512), jump anims (512x1024), key/bomb (512x1024), loader (1024x1024)
- [x] Scale config for key/bomb (0.25), loader (0.5), chest (2.0)
- [x] Manual editing pipeline via Pixelorama (spritesheet import/export)
- [x] `bin/sprites.ts --convert` for PNG→WebP conversion
- [x] Boss sprites used as placeholder for all 5 enemy variants (temporary, `enemy_{i}_boss/` paths)

### 8.4 Super Projectile Rework

**Status:** DONE
**Priority:** P2

- [x] Pierce-through mechanics (hits all enemies in path) (#140)
- [x] Splash damage on boss impact
- [x] Per-enemy VFX and scoring on pierce

### 8.5 Pause Menu

**Status:** DONE
**Priority:** P2

- [x] Pause menu modal with resume and abort (#187)
- [x] ESC key toggles pause

### 8.6 Wallpaper Rotation

**Status:** DONE
**Priority:** P3

- [x] Random wallpaper on landing page (#189)

### 8.7 Orientation Lock

**Status:** DONE
**Priority:** P2

- [x] Landscape orientation lock for mobile (#190)

### 8.8 Timer Countdown SFX

**Status:** DONE
**Priority:** P2

- [x] Countdown sound effects during final seconds (#193)

### 8.9 Scene Shutdown Cleanup

**Status:** DONE
**Priority:** P2

- [x] Proper cleanup of event listeners, timers, tweens, sound on scene shutdown (#184)

---

## Bug Backlog

### Critical (P0)

- [x] 2.5D physics broken (Player stuck on single plane) - FIXED
- [x] Config race condition (sprites load before config) - FIXED
- [x] Boss never spawns - FIXED

### High (P1)

- [x] Music dropdown off-page - FIXED
- [x] Scoring bug: points per hit instead of per kill - FIXED (#132)
- [x] Bear Market (survival mode) timer loop - FIXED (#135)
- [x] MusicManager dual async race condition - FIXED (#137)
- [x] XSS vulnerability in LeaderboardModal - FIXED (#138)
- [ ] TypeScript errors in `src/lib/utils/log.ts` (window toast methods) — see ticket #145

### Medium (P2)

- [x] Super projectile splash double-damages direct hit target - FIXED (#140)
- [ ] Chest not playing open animation
- [ ] Bombs not playing idle animation
- [ ] Boss HP bar lingers at zero during death animation — see ticket #144

### Low (P3)

- [ ] Remove deprecated `player:` root config section
- [ ] Standardize damage field usage across entities

---

## Technical Debt

1. ~~**Async config fetching**: All prefabs now use registry~~ DONE
2. **Hardcoded values**: Audit for any remaining hardcoded gameplay values
3. **Event cleanup**: Verify all event listeners are cleaned up in shutdown()
4. **Type safety**: Some config types use `any` - should be fully typed

---

## Completed Items

- [x] Avalanche SIWA login (ic-siwa chainId fix)
- [x] 2.5D physics (groundY for Player, Enemy, Boss)
- [x] Config-driven architecture (all values from YAML)
- [x] Synchronous config loading in Preloader
- [x] Enemy sprite loading
- [x] Key spawn physics
- [x] Boss spawning and mechanics
- [x] Music player dropdown positioning
- [x] Treasure chest in items config (not statics)
- [x] Super attack system (hadouken projectile + splash damage)
- [x] Floating health bars (BaseEntity, color-coded thresholds)
- [x] Combat polish (cooldowns, hit-stop, camera shake)
- [x] Enemy AI types (direct, flanker, cautious, erratic)
- [x] Bomb hazards (falling, splash damage, camera shake)
- [x] SFX system (variants, seeded RNG, volume control)
- [x] MusicManager (shuffle queue, preferences to Juno)
- [x] FeeGate + deposit flow
- [x] Claim flow (oracle sig, Vault.claim(), Recorder)
- [x] Game over modals (victory + lost)
- [x] Loading screen (coin animation, progress bar)
- [x] Leaderboard (top 10 from Juno)
- [x] Notification system (urgency levels, bell, toast, snooze)
- [x] Anti-cheat (config hash, escalating bans, ban modal)
- [x] PWA (service worker, update detection, install prompt)
- [x] Logging utility (component tags, levels, colors, toast)
- [x] WalkableArea system (boundary enforcement, clamping)
- [x] Object pooling (Phaser Groups for all entities)
- [x] Input recording (Recorder.ts, GameAction, serialization)
- [x] Seeded RNG (deterministic gameplay via Phaser RandomDataGenerator)
- [x] Wallpaper generation pipeline (keys -> nano banana -> JPG -> WebP)
- [x] Config validation (Zod schemas, runtime validation)
- [x] Game store encapsulation (validated actions, read-only API)
- [x] Knockback on hit (#175)
- [x] Chest punch-to-open interaction (#176)
- [x] Music crossfade between tracks (#177)
- [x] Game over stats display with auto-save (#181)
- [x] Scene shutdown cleanup (#184)
- [x] Pause menu (#187)
- [x] Wallpaper rotation on landing page (#189)
- [x] Landscape orientation lock (#190)
- [x] Loot drop system: 5 health + 5 powerup variants (#192)
- [x] Timer countdown SFX (#193)
- [x] Super projectile pierce-through rework (#140)
- [x] Intro narration voiceover with preference toggle (INTRO ticket)
- [x] Sprite standardization (512x512 base, manual editing pipeline)
- [x] Anti-cheat ban system (#152, #155, #156, #166)
- [x] Scoring bug fix (#132)
- [x] Bear Market timer leak fix (#135)
- [x] MusicManager race condition fix (#137)
- [x] XSS fix in LeaderboardModal (#138)
- [x] Prebuild step added to juno-dev lint command
- [x] Removed stale eslint-disable directives from config generator

---

## Future (Post-MVP, when scrolling levels are added)

- [ ] Re-visit Phase Box2D Engine as possible option
- [ ] Environmental obstacles (dumpsters, pillars, barriers) with Arcade static bodies
- [ ] Multi-layer parallax background system (sky, buildings, midground, ground layers)
- [ ] Horizontal level scrolling with camera follow

---

## Next Steps (Recommended Priority)

1. **Boss AI patterns** — Ground pound, charge, summon minions, HP phase transitions (#173)
2. **Mobile touch controls** — Virtual joystick + attack button (#174)
3. **Vault display** — Show balance on home page (#178)
4. **Death/respawn with lives** — Multiple lives before game over (#191)
5. **Settings menu** — Volume, controls, preferences (#188)
6. **Bug fixes** — Work through ticket backlog (#144, #145, #161)
