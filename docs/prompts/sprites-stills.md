# Sprite Stills Generation — Ralph Loop Prompt

Generate all still images for every entity. These stills are the style seeds used later for animation sprite sheets.

**Completion promise:** When ALL entities have a still image on disk (or are in `failed`), output `STILLS_COMPLETE`.

## Art Style Seed

**IMPORTANT:** The "seed" for all art styles is `assets-source/images/hero.webp`.

You MUST visually read this file at the start of each iteration and use it as the style reference for EVERY generated image.

All sprites must match this art style exactly.

## Entity Queue

Generate one `still.png` per entity. Process **1 entity per iteration**.

### Characters

- [ ] **Hero** (Ron Jay — 70s crypto degenerate, mullet, mustache, black aviator sunglasses, white safari suit, red shirt, white pants, brown boots)
  - `hero/still.png`

- [ ] **Boss** (Gary Gensler — evil banker/regulator in a dark gray suit, bald/thin hair, stern face, tie, menacing)
  - `boss/still.png`

- [ ] **Enemy 1** (Businessman variant 1 — generic suit, briefcase, angry face, dark tie)
  - `enemy_1/still.png`

- [ ] **Enemy 2** (Businessman variant 2 — pinstripe suit, slicked hair, red tie)
  - `enemy_2/still.png`

- [ ] **Enemy 3** (Businessman variant 3 — suspenders, rolled sleeves, cigar, stocky)
  - `enemy_3/still.png`

- [ ] **Enemy 4** (Businessman variant 4 — bowler hat, monocle, cane, thin)
  - `enemy_4/still.png`

- [ ] **Enemy 5** (Businessman variant 5 — oversized suit, sunglasses, gold watch, beefy)
  - `enemy_5/still.png`

- [ ] **TRESR-BOT** (Cyberpunk ghost entity made of glowing green digital code,
      floating slightly off the ground, no legs — just a trailing cascade of
      matrix-style characters fading into nothing. Hooded silhouette with a single
      bright green eye visible. One hand holds a giant old-school skeleton key
      crackling with electricity. The other hand is open-palmed projecting a
      holographic TRESR logo. Black and dark gray base palette with #00ff88 neon
      green accents.)
  - `tresr_bot/still.png`

### Items

- [ ] **Candle Bomb** (A "stock trading red candle" that falls from the sky — red rectangular body, thin wick on top, menacing)
  - `bomb/still.png`

- [ ] **Key** (A golden key — vertical orientation (teeth pointing down), modern diamond-shaped head with "TRESR" engraved on the front, glowing golden aura, shining highlights)
  - `key/still.png`

- [ ] **Loader** (A golden coin spinner — shiny gold coin with "TRESR" on each side, spinning)
  - `loader/still.png`

- [ ] **Chest** (Treasure chest — wooden with gold trim, classic pirate-style)
  - `chest/still.png`

- [ ] **Health Pickup 1** (A roast chicken — golden brown, on a plate, steaming)
  - `health_1/still.png`

- [ ] **Health Pickup 2** (A steaming steak on a plate — thick cut, sizzling, garnished)
  - `health_2/still.png`

- [ ] **Health Pickup 3** (A kebab on a stick — colourful meat and vegetables, grilled)
  - `health_3/still.png`

- [ ] **Health Pickup 4** (A hamburger — thick juicy patty, melted cheese, lettuce, tomato, sesame seed bun, steaming)
  - `health_4/still.png`

- [ ] **Health Pickup 5** (A box of french fries — golden crispy fries in a red cardboard container, salt glistening)
  - `health_5/still.png`

- [ ] **Powerup 1** (A glowing energy drink can — neon blue, crackling electricity, floating)
  - `powerup_1/still.png`

- [ ] **Powerup 2** (A coffee mug — steaming hot, brown ceramic, energizing aura)
  - `powerup_2/still.png`

- [ ] **Powerup 3** (A Red Bull energy drink can — red, blue and silver can, iconic charging bull logo, power aura)
  - `powerup_3/still.png`

- [ ] **Powerup 4** (A Red Bull Sugar Free can — silver and blue can, lighter colour scheme, "sugar free" label, clean energy glow)
  - `powerup_4/still.png`

- [ ] **Powerup 5** (A takeaway coffee cup — white paper cup with brown cardboard sleeve, plastic lid, steam rising)
  - `powerup_5/still.png`

- [ ] **Super Projectile** (A spinning gold coin — hadouken-style, glowing, energy trail)
  - `super/still.png`

## File Layout

- **Output**: `assets-source/images/sprites/<entity>/still.png`
  - Example: `assets-source/images/sprites/hero/still.png`
- Gemini may output PNG or JPEG — accept both (`.png` or `.jpg`).

## State File

The state file at `assets-source/images/sprites/.progress-stills.json` tracks still generation progress.

Schema:

```json
{
  "generated": ["hero", "boss"],
  "failed": {
    "enemy_3": "API Error (429): rate limited"
  },
  "current_entity": "enemy_1"
}
```

Field definitions:

- **`generated`** — list of entity names that have a still image on disk
- **`failed`** — map of entity name → error message
- **`current_entity`** — which entity is currently being processed

## Prerequisites

- **`GEMINI_API_KEY`** must be set in the environment. If not available, check `.env` or ask the user.
- **Runtime**: Use `bun run` if available. If `bun` is not in PATH (e.g., outside devenv shell), use `npx tsx` as a drop-in replacement.
- **Style Seed**: The file `assets-source/images/hero.webp` must exist.

## Each Iteration

### Step 1: Initialize

**1a: Read the style seed.** Visually read `assets-source/images/hero.webp` to refresh the target art style.

**1b: Load or create state file.** Read `assets-source/images/sprites/.progress-stills.json`. If it doesn't exist, create it:

```json
{
  "generated": [],
  "failed": {},
  "current_entity": null
}
```

**1c: Ensure directories exist.**

```bash
mkdir -p assets-source/images/sprites/{hero,boss,enemy_1,enemy_2,enemy_3,enemy_4,enemy_5,tresr_bot,bomb,key,loader,chest,health_1,health_2,health_3,health_4,health_5,powerup_1,powerup_2,powerup_3,powerup_4,powerup_5,super}
```

### Step 2: Find Next Entity

Walk the Entity Queue in order. For each entity:

1. Check if `assets-source/images/sprites/<entity>/still.png` OR `assets-source/images/sprites/<entity>/still.jpg` exists on disk
2. If it exists → skip (already generated or user kept it after review)
3. If it does NOT exist → this is the next entity to process

**Important:** Check the actual filesystem, not just the state file. The user may have deleted stills they didn't like — those need regenerating.
If an entity is in `generated` but its still file is missing from disk, remove it from `generated`.

If no entity needs processing → all stills are done. Go to Step 5 (Completion).

### Step 3: Generate Still Image

Set `current_entity` in state and write state file.

**Read the style seed** (`assets-source/images/hero.webp`) and construct the prompt:

```raw
A single game character sprite in the exact style of Streets of Rage 4, hand-painted by Lizardcube studio. Chibi/super-deformed proportions with a large head (roughly 1/3 of total body height), stubby limbs, and exaggerated features. Thick black ink outlines (2-3px) on all shapes. Cel-shaded flat coloring with subtle gradients, no realistic shading. Bold, saturated colors.

CHARACTER: <insert character description from the Entity Queue — be very specific about clothing, hair, accessories, build, expression>

The character stands in a neutral idle pose, 3/4 front-facing view, feet slightly apart, arms relaxed at sides. The character is centered in the frame with adequate padding around all edges.

CRITICAL REQUIREMENTS:
- Transparent background (NO background elements, NO ground, NO shadows on ground)
- Single character only, no duplicates
- Character must be fully visible, not cropped
- Style must match the reference: chibi proportions, thick black outlines, cel-shaded, beat-em-up game sprite aesthetic
- The character should look like they belong in the same game as the hero reference

OUTPUT FORMAT: PNG with transparent background
```

**Art Style Consistency Rules** (the style seed defines the look — ALL sprites must match):

- **Chibi/super-deformed proportions** — large head (roughly 1/3 of body height), stubby limbs
- **Thick black ink outlines** on all shapes (2-3px at render size)
- **Cel-shaded coloring** — flat color fills with subtle gradients, no realistic shading
- **Cartoon facial features** — exaggerated expressions, simple shapes
- **Beat-em-up game character style** — Streets of Rage 4 / Lizardcube hand-painted look
- **Consistent scale** — characters should be similar proportions to the hero

Run the generation:

```bash
python ~/.claude/plugins/marketplaces/nano-skills/skills/nano-image-generator/scripts/generate_image.py \
  "<prompt>" \
  --output assets-source/images/sprites/<entity>/still.png \
  --aspect 1:1 \
  --size 1K
```

If generation succeeds:

- Add entity to `generated`
- Write state file
- Print: `[<entity>/still] -> OK (stills: X/23)`

If generation fails:

- Add error to `failed.<entity>`
- Write state file
- Print: `[<entity>/still] -> FAILED: <error>`

### Step 4: Rate Limiting

After each generation, wait 3 seconds:

```bash
sleep 3
```

If you hit a rate limit error (429), wait 30 seconds and retry once. If it fails again, record the error and move on.

### Step 5: Completion Check

Count how many of the 23 entities have a still image on disk (check filesystem, not just state).

If ALL 23 entities have a still on disk (or are in `failed`):

```text
STILLS GENERATION COMPLETE

Results:
  <list each entity: OK or FAILED>

Review the stills in assets-source/images/sprites/<entity>/still.png
- Delete any you don't like, then re-run this loop to regenerate them
- Once satisfied with ALL stills, run the sprites animation loop
```

Output: `STILLS_COMPLETE`

Otherwise, the loop will restart and process the next entity.
