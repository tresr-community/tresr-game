# Sprite Animation Generation — Ralph Loop Prompt

Generate animation sprite sheets for all entities using their approved still images as style seeds.

**Prerequisite:** ALL still images must exist in `assets-source/images/sprites/<entity>/still.png` (or `.jpg`) before running this loop. Run `sprites-stills.md` first and approve the results.

**Completion promise:** When ALL entities are in `completed` (or `failed`), output `SPRITES_COMPLETE`.

## Gemini Limitations

Gemini image generation **cannot produce true PNG transparency** (no alpha channel support).
It will either output a solid background or draw a fake checkerboard pattern.
It also tends to output JPEG files regardless of the requested format.

**Workaround:** All prompts request a **solid bright green (#00FF00) chroma key background**.
After generation, a post-processing step removes the green and produces a transparent PNG, which is then converted to WebP.

## Art Style Seed

**IMPORTANT:** Each entity's `still.png` (or `.jpg`) is the **sole style reference** for that entity's animations.
Read it before generating any animations — the generated frames MUST look like the same character from the still image —
same proportions, same colors, same outfit details, same face. If the result doesn't match the still, regenerate it.

## Frame Sizes

Two frame sizes are used depending on entity type:

- **Characters** (hero, boss, enemies): **1000x1000px** per frame
- **Items** (bomb, key, loader, chest, health, powerup, super): **512x512px** per frame

Use the correct size in the LAYOUT section of the prompt for each entity.

## Sprite Queue

Each entity's still image is already approved. Generate the animation sprite sheets listed below.

### Characters

- [ ] **Hero** (Ron Jay — 70s crypto degenerate, mullet, mustache, aviator sunglasses, white safari suit, red shirt, white pants, brown boots)
  - [ ] `hero/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/jump.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/super.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`

- [ ] **Boss** (Gary Gensler — evil banker/regulator in a dark gray suit, bald/thin hair, stern face, tie, menacing)
  - [ ] `boss/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `boss/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `boss/jump.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `boss/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `boss/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`

- [ ] **Enemy 1** (Businessman variant 1 — generic suit, briefcase, angry face, dark tie)
  - [ ] `enemy_1/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_1/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_1/jump.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_1/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_1/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`

- [ ] **Enemy 2** (Businessman variant 2 — pinstripe suit, slicked hair, red tie)
  - [ ] `enemy_2/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_2/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_2/jump.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_2/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_2/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`

- [ ] **Enemy 3** (Businessman variant 3 — suspenders, rolled sleeves, cigar, stocky)
  - [ ] `enemy_3/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_3/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_3/jump.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_3/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_3/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`

- [ ] **Enemy 4** (Businessman variant 4 — bowler hat, monocle, cane, thin)
  - [ ] `enemy_4/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_4/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_4/jump.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_4/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_4/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`

- [ ] **Enemy 5** (Businessman variant 5 — oversized suit, sunglasses, gold watch, beefy)
  - [ ] `enemy_5/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_5/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_5/jump.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_5/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `enemy_5/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`

- [ ] **TRESR-BOT** (Cyberpunk ghost entity made of glowing green digital code,
      floating slightly off the ground, no legs — just a trailing cascade of
      matrix-style characters fading into nothing. Hooded silhouette with a single
      bright green eye visible. One hand holds a giant old-school skeleton key
      crackling with electricity. The other hand is open-palmed projecting a
      holographic TRESR logo. Black and dark gray base palette with #00ff88 neon
      green accents.)
  - [ ] `tresr_bot/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `tresr_bot/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `tresr_bot/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `tresr_bot/special.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`

### Items

- [ ] **Candle Bomb** (A "stock trading red candle" that falls from the sky — red rectangular body, thin wick on top, menacing)
  - [ ] `bomb/idle.png` — 5 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Key** (A golden key — vertical orientation (teeth pointing down), modern diamond-shaped head with "TRESR" engraved
      on the front, glowing golden aura, shining highlights. The key falls vertically and shines/spins slightly as it
      descends.)
  - [ ] `key/idle.png` — 5 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Loader** (A golden coin spinner — shiny gold coin with "TRESR" on each side, spinning)
  - [ ] `loader/idle.png` — 5 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Chest** (Treasure chest — wooden with gold trim, classic pirate-style)
  - [ ] `chest/idle.png` — 5 frames, 512x512px per frame → `--aspect 21:9`
  - [ ] `chest/open.png` — 5 frames, 512x512px per frame → `--aspect 21:9`
  - [ ] `chest/close.png` — 5 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Health Pickup 1** (A roast chicken — golden brown, on a plate, steaming)
  - [ ] `health_1/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Health Pickup 2** (A steaming steak on a plate — thick cut, sizzling, garnished)
  - [ ] `health_2/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Health Pickup 3** (A kebab on a stick — colourful meat and vegetables, grilled)
  - [ ] `health_3/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Health Pickup 4** (A hamburger — thick juicy patty, melted cheese, lettuce, tomato, sesame seed bun, steaming)
  - [ ] `health_4/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Health Pickup 5** (A box of french fries — golden crispy fries in a red cardboard container, salt glistening)
  - [ ] `health_5/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Powerup 1** (A glowing energy drink can — neon blue, crackling electricity, floating)
  - [ ] `powerup_1/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Powerup 2** (A coffee mug — steaming hot, brown ceramic, energizing aura)
  - [ ] `powerup_2/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Powerup 3** (A Red Bull energy drink can — red, blue and silver can, iconic charging bull logo, power aura)
  - [ ] `powerup_3/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Powerup 4** (A Red Bull Sugar Free can — silver and blue can, lighter colour scheme, "sugar free" label, clean
      energy glow)
  - [ ] `powerup_4/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Powerup 5** (A takeaway coffee cup — white paper cup with brown cardboard sleeve, plastic lid, steam rising)
  - [ ] `powerup_5/idle.png` — 4 frames, 512x512px per frame → `--aspect 21:9`

- [ ] **Super Projectile** (A spinning gold coin — hadouken-style, glowing, energy trail)
  - [ ] `super/spin.png` — 5 frames, 512x512px per frame → `--aspect 21:9`

## Allowed Aspect Ratios

The image generator only supports these aspect ratios: `1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`.

**Do NOT use any other values.** For sprite sheets (which are wide horizontal strips), use `21:9` —
this ultra-wide ratio forces the AI to lay out frames in a single row rather than wrapping into multiple rows.

All animations in this project use `--aspect 21:9`.

## Output Filename Rules

**CRITICAL:** The output filename MUST exactly match `<entity>/<animation>.png` from the Sprite Queue.

- `idle` animation → `--output assets-source/images/sprites/<entity>/idle.png`
- `walk` animation → `--output assets-source/images/sprites/<entity>/walk.png`
- `jump` animation → `--output assets-source/images/sprites/<entity>/jump.png`
- `attack` animation → `--output assets-source/images/sprites/<entity>/attack.png`
- etc.

Do NOT rename, prefix with the entity name, or alter filenames.
Do NOT use names like `hero-idle`, `enemy_1-walk`, `hero-dig`, `hero-walk-left`, etc.

**Note:** Gemini will likely output a `.jpg` file even though we request `.png`. This is expected.
Always check the actual extension on disk and track the real filename.

## File Layout

- **Still images (seeds)**: `assets-source/images/sprites/<entity>/still.png` (or `.jpg`)
- **Generated sprite sheets**: `assets-source/images/sprites/<entity>/<animation>.png` (or `.jpg`)
- **Converted WebP output**: `public/assets/images/sprites/<entity>/<animation>.webp`
- Gemini will likely output JPEG — handle both `.png` and `.jpg`.

## State File

The state file at `assets-source/images/sprites/.progress.json` tracks animation generation progress.

Schema:

```json
{
  "generated": {
    "hero": ["idle.jpg", "walk.jpg"],
    "boss": ["idle.jpg"]
  },
  "failed": {
    "enemy_3": {"attack.png": "API Error (429): rate limited"}
  },
  "converted": {
    "hero": ["idle.webp", "walk.webp"]
  },
  "completed": ["hero"],
  "current_entity": "boss"
}
```

Field definitions:

- **`generated`** — map of entity → list of successfully generated animation filenames (use the REAL extension on disk)
- **`failed`** — map of entity → map of filename → error message
- **`converted`** — map of entity → list of converted WebP filenames
- **`completed`** — entities where ALL animations are generated, chromakeyed, AND converted
- **`current_entity`** — which entity is currently being processed

## Prerequisites

- **`GEMINI_API_KEY`** must be set in the environment. If not available, check `.env` or ask the user.
- **Runtime**: Use `bun run` if available. If `bun` is not in PATH (e.g., outside devenv shell), use `npx tsx` as a drop-in replacement.
- **Still images**: ALL entities must have a `still.png` or `still.jpg` in `assets-source/images/sprites/<entity>/`.
  These are the sole style references. If any are missing, STOP and tell the user to run `sprites-stills.md` first.

## Each Iteration

### Step 1: Initialize

**1a: Load or create state file.** Read `assets-source/images/sprites/.progress.json`. If it doesn't exist, create it:

```json
{
  "generated": {},
  "failed": {},
  "converted": {},
  "completed": [],
  "current_entity": null
}
```

**1b: Ensure directories exist.**

```bash
mkdir -p assets-source/images/sprites/{hero,boss,enemy_1,enemy_2,enemy_3,enemy_4,enemy_5,tresr_bot,bomb,key,loader,chest,health_1,health_2,health_3,health_4,health_5,powerup_1,powerup_2,powerup_3,powerup_4,powerup_5,super}
mkdir -p public/assets/images/sprites/{hero,boss,enemy_1,enemy_2,enemy_3,enemy_4,enemy_5,tresr_bot,bomb,key,loader,chest,health_1,health_2,health_3,health_4,health_5,powerup_1,powerup_2,powerup_3,powerup_4,powerup_5,super}
```

**1c: Verify all stills exist.** Check that every entity has `still.png` or `still.jpg` on disk.
If any are missing, output:

```text
MISSING STILL IMAGES - cannot proceed with animation generation.
Missing: <list of entities without stills>
Run the sprites-stills loop first.
```

Then output `SPRITES_COMPLETE` to end the loop (it cannot proceed without stills).

### Step 2: Reconcile State with Filesystem

Before looking for work, reconcile the state file against the actual filesystem. This ensures that if you delete a final WebP or its source, the sprite gets re-generated.

For every entity in the Sprite Queue, for every animation listed under it:

1. Check if the **final WebP** exists: `public/assets/images/sprites/<entity>/<animation>.webp`
2. Check if the **source image** exists: `assets-source/images/sprites/<entity>/<animation>.png` (or `.jpg`)

If the final WebP is **missing**:

- Remove `<animation>.webp` from `converted.<entity>` (if present)
- Remove entity from `completed` (if present)

If the source image is **also missing**:

- Remove `<animation>.png` / `<animation>.jpg` from `generated.<entity>` (if present)
- Remove entity from `completed` (if present)

Write the updated state file after reconciliation.

### Step 3: Find Next Entity

Walk the Sprite Queue in order. For each entity:

1. If entity is in `completed` → skip
2. If entity has remaining animations not in `generated` → this is the next entity to process
3. If ALL animations are generated but not all converted → needs chromakey + conversion (go to Step 6)

If no entity needs processing → all done. Go to Step 8 (Completion).

Set `current_entity` in state and write state file.

### Step 4: Generate Animations

**Read the entity's still image** (`assets-source/images/sprites/<entity>/still.png` or `.jpg`) to use as the
character-specific style reference. Study it carefully — the generated frames must depict the **exact same character**.

For each animation listed under the current entity in the Sprite Queue that is NOT yet in `generated.<entity>`:

**Determine frame size** from the Sprite Queue entry for this entity:

- Characters (hero, boss, enemy\_\*): `1000x1000` pixels per frame
- Items (bomb, key, loader, chest, health*\*, powerup*\*, super): `512x512` pixels per frame

**Construct the sprite sheet prompt:**

```raw
Create a horizontal sprite sheet for a 2D side-scrolling beat-em-up game.

BACKGROUND: The entire background MUST be a perfectly solid, uniform, bright green color (hex #00FF00). This is a chroma
key green screen. There must be NO variation, NO gradients, NO shadows, and NO other colors in the background — pure flat
#00FF00 everywhere the character is not. IMPORTANT: No part of the character, effects, particles, steam, smoke, aura, or
glow should use green or any shade close to #00FF00 — use white, gray, yellow, orange, blue, or other non-green colors
for all visual effects. Green elements will be destroyed by the chroma key removal.

LAYOUT: This is a SINGLE-ROW horizontal strip. All <N> poses MUST be in ONE row going left to right — NEVER stack them
into multiple rows or a grid. The image is an ultra-wide horizontal banner. Each pose occupies a <FRAME_SIZE>x<FRAME_SIZE>
pixel area. Total image: <N*FRAME_SIZE> pixels wide by <FRAME_SIZE> pixels tall. If you feel tempted to arrange in 2
rows — DON'T. One row only.

ABSOLUTELY NO BORDERS: Do NOT draw any borders, boxes, rectangles, frames, dividers, outlines, panels, cards, or lines
of any kind between, around, or near the poses. The poses sit directly on the green background with nothing separating
them — just green space between the character artwork. This is critical — any drawn borders or frame lines will ruin the
sprite sheet.

CHARACTER CONSISTENCY: The sprite sheet frames MUST all depict the SAME character described above — identical face,
identical hair, identical clothing colors, identical accessories, identical body proportions. The ONLY thing that changes
between frames is the pose/position. If something looks different between frames (wrong hair color, missing accessories,
different clothes), it is WRONG.

ART STYLE: Streets of Rage 4, hand-painted by Lizardcube. Chibi/super-deformed proportions (large head ~1/3 of body
height, stubby limbs). Thick black ink outlines on the character (2-3px). Cel-shaded flat coloring with bold saturated
colors. These outlines are part of the character's art style — they go ON the character, NOT around frame boundaries.

CHARACTER: <insert character description — MUST match the approved still image exactly. Describe clothing colors, hair
style, accessories, build in detail>

ANIMATION: <insert animation type and motion description>
<insert detailed pose-by-pose breakdown — see Animation Descriptions below>

REQUIREMENTS:
- Background is SOLID #00FF00 green — no exceptions
- NO green on the character or effects (steam, smoke, aura must be white/gray/yellow/blue — NOT green)
- ZERO borders, frames, boxes, or dividing lines anywhere in the image
- ALL <N> poses in a SINGLE horizontal row — absolutely NO multiple rows or grids
- Each pose centered within its <FRAME_SIZE>x<FRAME_SIZE> cell area
- ALL poses show the SAME character with IDENTICAL appearance — only the pose changes
- Character fully visible in every frame, not cropped at edges
```

Where `<FRAME_SIZE>` is `1000` for characters or `512` for items (see Frame Sizes section above).

**Animation Descriptions:**

**idle**: Character stands with subtle breathing motion. Pose 1: neutral stance.
Poses 2-3: slight torso rise (inhale). Poses 4-5: slight torso drop (exhale).
Pose 6: return to neutral. Gentle, subtle movement.

**walk**: Character walks forward (right-facing). Classic beat-em-up walk cycle.
Pose 1: contact (right foot forward). Pose 2: passing (feet together).
Pose 3: contact (left foot forward). Pose 4: passing.
Poses 5-6: return to start. Arms swing naturally opposite to legs.

**jump**: Character performs a jump. Pose 1: crouch anticipation (knees bent).
Pose 2: launch (legs extending, leaving ground). Pose 3: rising (arms up, legs tucked).
Pose 4: apex (peak height, body extended). Pose 5: descending (legs dropping).
Pose 6: landing (knees absorbing impact).

**attack**: Character throws a punch/strike. Pose 1: windup (arm pulled back).
Pose 2: arm extending. Pose 3: full extension (impact).
Pose 4: follow-through. Pose 5: retracting. Pose 6: return to idle. Quick, snappy motion.

**hurt**: Character recoils from being hit. Pose 1: impact (head snaps back).
Pose 2: full recoil (leaning back, arms out). Pose 3: recovery start.
Pose 4: return toward neutral. Exaggerated reaction.

**super** (hero only): Character performs a special power attack.
Pose 1: charging (crouching, energy gathering). Pose 2: energy building (glowing hands).
Pose 3: release windup. Pose 4: full power release (blast pose).
Pose 5: follow-through. Pose 6: recovery. Dramatic, powerful motion.

**spin** (super projectile): A gold "TRESR" coin flying as a projectile toward the right, spinning as it travels. ALL
frames show the coin moving RIGHT with an energy trail behind it (to the left). Pose 1: front face (flying right, "TRESR"
visible, energy trail left). Pose 2: 3/4 turn (angled ~45°, still flying right). Pose 3: edge-on (thin sliver, flying
right). Pose 4: 3/4 back (angled other way, flying right). Pose 5: back face (flying right, energy trail left). The coin
ALWAYS faces/moves to the right — this is a projectile, not a stationary spin.

**open** (chest): Chest lid opening. Pose 1: closed. Pose 2: lid cracking. Pose 3: half open. Pose 4: mostly open.
Pose 5: fully open with golden glow inside.

**close** (chest): Reverse of open. Pose 1: fully open. Pose 2: closing. Pose 3: half closed. Pose 4: nearly shut.
Pose 5: fully closed.

**key idle** (vertical golden key falling with shine): The key hangs vertically (teeth pointing down, diamond head on
top with "TRESR"). It has a subtle spin/shine effect as it falls. Pose 1: key facing front, neutral golden glow. Pose 2:
slight clockwise tilt (~5°), bright shine highlight on upper-left of head. Pose 3: back to vertical, shine moves to
center — peak brightness. Pose 4: slight counter-clockwise tilt (~5°), shine fading to upper-right. Pose 5: return to
neutral, shine gone. Creates a gentle rocking + travelling shine loop.

**Item idle animations** (bomb, health, powerup): Gentle bobbing/pulsing.
Pose 1: neutral. Pose 2: slight rise. Pose 3: peak. Pose 4: slight drop.
Pose 5: back to neutral. Subtle floating/pulsing glow effect.

**tresr-bot idle** (6 poses): Ghost entity hovering in place. Pose 1: neutral float, code particles drifting
upward. Pose 2: slight bob up, particles intensify. Pose 3: peak bob, green eye flickers brighter. Pose 4:
bob down, hood sways. Pose 5: settling, particles slow. Pose 6: return to neutral.

**tresr-bot walk** (6 poses): Ghost entity gliding forward with momentum. Pose 1: leaning forward, code
trail intensifies behind. Pose 2: surging forward, green eye brightens, particle trail stretches. Pose 3:
peak glide, hood billows back, key sparks. Pose 4: slight deceleration, particles swirl. Pose 5: re-lean
forward, trail reforms. Pose 6: full glide cycle, trail at maximum length.

**tresr-bot attack** (6 poses): Swings giant skeleton key like a battle axe. Pose 1: key raised overhead,
green lightning crackles. Pose 2: windup, body twists. Pose 3: downswing, green lightning trail follows the
arc. Pose 4: impact pose, key fully extended, shockwave sparks. Pose 5: follow-through. Pose 6: recovery,
key returns to rest.

**tresr-bot special** (6 poses): Slams key into ground, NFC-style shockwave. Pose 1: raises key high,
energy gathering. Pose 2: key glowing with green electricity. Pose 3: slam down, key hits ground. Pose 4:
shockwave ripple expanding outward in concentric rings. Pose 5: rings at full expansion, bot hovering higher.
Pose 6: recovery, energy fading.

**loader idle** (coin spinner): A gold coin rotating in 3D space, showing "TRESR" text. Pose 1: front face (fully
facing camera, "TRESR" readable). Pose 2: 3/4 turn (coin angled ~45°, getting narrower). Pose 3: edge-on (coin seen from
the side, very thin sliver). Pose 4: 3/4 back (coin angled the other way, back face emerging). Pose 5: back face (fully
facing away, reverse side visible). This creates a smooth coin-flip rotation loop.

Run the generation (**always use `--aspect 21:9`**):

```bash
python ~/.claude/plugins/marketplaces/nano-skills/skills/nano-image-generator/scripts/generate_image.py \
  "<prompt>" \
  --output assets-source/images/sprites/<entity>/<animation>.png \
  --aspect 21:9 \
  --size 2K
```

**After generation, verify the output file:**

```bash
ls assets-source/images/sprites/<entity>/<animation>.* 2>/dev/null
```

**Validate single-row layout:** Check that the image is wider than it is tall. Read the generated image and check its
dimensions. If `height > width` or `height > width / 2`, Gemini likely produced a multi-row grid instead of a single
horizontal strip. In that case:

- Log a warning: `[<entity>/<animation>] MULTI-ROW DETECTED (<width>x<height>) — regenerating`
- Delete the file and retry generation once with the same prompt
- If the retry also produces multiple rows, record it as a failure and move on

After each successful generation:

- Check the actual file extension on disk (`.png` or `.jpg`)
- Add the real filename to `generated.<entity>`
- Write state file
- Print: `[<entity>/<animation>] -> OK (entities completed: X/23, current: <entity>)`

If generation fails:

- Add error to `failed.<entity>.<filename>`
- Write state file
- Continue with next animation

### Step 5: Rate Limiting

After each generation, wait 3 seconds:

```bash
sleep 3
```

If you hit a rate limit error (429), wait 30 seconds and retry once. If it fails again, record the error and move on.

### Step 6: Chromakey — Remove Green Background

After ALL animations for the current entity are generated, remove the #00FF00 green screen background from all sprite
sheets to produce transparent PNGs.

```bash
bun run bin/sprites.ts --chromakey
```

This scans `assets-source/images/sprites/<entity>/` for PNG/JPG files (skipping `still.*`), removes the green
background with soft-edge anti-aliasing, and outputs transparent PNGs in place. JPG originals are replaced with the
transparent PNG.

Verify the output looks correct — the green background should be gone and character edges should be clean without green
fringing.

### Step 7: Convert to WebP

After chromakey processing, convert the transparent PNGs to WebP:

```bash
bun run bin/sprites.ts --convert
```

This converts all PNGs in `assets-source/images/sprites/<entity>/` to WebP in `public/assets/images/sprites/<entity>/`
with full alpha quality preservation. It skips files that are already up-to-date.

Update state:

- Add converted filenames to `converted.<entity>`
- If ALL expected animations are converted, add entity to `completed`
- Write state file

### Step 8: Completion Check

Count: all 23 entities must be in `completed` (or have all animations in `failed`).

If complete:

```text
SPRITE ANIMATION GENERATION COMPLETE

Results:
  <list each entity: completed or failed animations>
```

Output: `SPRITES_COMPLETE`

Otherwise, the loop will restart and process the next entity.

## Quick Reference: Entity → Animations

| Entity    | Animations                            | Frame Size | Frames      | Aspect |
| --------- | ------------------------------------- | ---------- | ----------- | ------ |
| hero      | idle, walk, jump, attack, hurt, super | 1000x1000  | 6,6,6,6,4,6 | 21:9   |
| boss      | idle, walk, jump, attack, hurt        | 1000x1000  | 6,6,6,6,4   | 21:9   |
| enemy_1   | idle, walk, jump, attack, hurt        | 1000x1000  | 6,6,6,6,4   | 21:9   |
| enemy_2   | idle, walk, jump, attack, hurt        | 1000x1000  | 6,6,6,6,4   | 21:9   |
| enemy_3   | idle, walk, jump, attack, hurt        | 1000x1000  | 6,6,6,6,4   | 21:9   |
| enemy_4   | idle, walk, jump, attack, hurt        | 1000x1000  | 6,6,6,6,4   | 21:9   |
| enemy_5   | idle, walk, jump, attack, hurt        | 1000x1000  | 6,6,6,6,4   | 21:9   |
| tresr_bot | idle, walk, attack, special           | 1000x1000  | 6,6,6,6     | 21:9   |
| bomb      | idle                                  | 512x512    | 5           | 21:9   |
| key       | idle                                  | 512x512    | 5           | 21:9   |
| loader    | idle                                  | 512x512    | 5           | 21:9   |
| chest     | idle, open, close                     | 512x512    | 5,5,5       | 21:9   |
| health_1  | idle                                  | 512x512    | 4           | 21:9   |
| health_2  | idle                                  | 512x512    | 4           | 21:9   |
| health_3  | idle                                  | 512x512    | 4           | 21:9   |
| health_4  | idle                                  | 512x512    | 4           | 21:9   |
| health_5  | idle                                  | 512x512    | 4           | 21:9   |
| powerup_1 | idle                                  | 512x512    | 4           | 21:9   |
| powerup_2 | idle                                  | 512x512    | 4           | 21:9   |
| powerup_3 | idle                                  | 512x512    | 4           | 21:9   |
| powerup_4 | idle                                  | 512x512    | 4           | 21:9   |
| powerup_5 | idle                                  | 512x512    | 4           | 21:9   |
| super     | spin                                  | 512x512    | 5           | 21:9   |
