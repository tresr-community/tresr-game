# Sprite Animation Generation (Single Test) — Ralph Loop Prompt

Generate animation sprite sheets for the **Hero** entity only, as a test run before processing all entities.

**Prerequisite:** The hero still image must exist at `assets-source/images/sprites/hero/still.png` (or `.jpg`). Run `sprites-stills.md` first and approve the results.

**Completion promise:** When the hero entity is in `completed` (or `failed`), output `SPRITES_SINGLE_COMPLETE`.

## Gemini Limitations

Gemini image generation **cannot produce true PNG transparency** (no alpha channel support). It will either output a solid background or draw a fake
checkerboard pattern.
It also tends to output JPEG files regardless of the requested format.

**Workaround:** All prompts request a **solid bright green (#00FF00) chroma key background**. After generation, a post-processing step removes the green
and produces a transparent PNG, which is then converted to WebP.

## Art Style Seed

**IMPORTANT:** The hero's `still.png` (or `.jpg`) is the \*\*sole style reference\*\* for animation generation. Read it before generating any animations —
the generated frames MUST look like the same character from the still image — same proportions, same colors, same outfit details, same face. If the result
doesn't match the still, regenerate it.

## Sprite Queue

- [ ] **Hero** (Ron Jay — 70s crypto degenerate, mullet, mustache, aviator sunglasses, white safari suit, red shirt, white pants, brown boots)
  - [ ] `hero/idle.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/walk.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/attack.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/hurt.png` — 4 frames, 1000x1000px per frame → `--aspect 21:9`
  - [ ] `hero/super.png` — 6 frames, 1000x1000px per frame → `--aspect 21:9`

## Allowed Aspect Ratios

The image generator only supports these aspect ratios: `1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`.

**Do NOT use any other values.** For sprite sheets (which are wide horizontal strips), use `21:9` — this ultra-wide ratio forces the AI to lay out
frames in a single row rather than wrapping into multiple rows.

## File Layout

- **Still image (seed)**: `assets-source/images/sprites/hero/still.png` (or `.jpg`)
- **Generated sprite sheets**: `assets-source/images/sprites/hero/<animation>.png` (or `.jpg`)
- **Converted WebP output**: `public/assets/images/sprites/hero/<animation>.webp`
- Gemini will likely output JPEG — handle both `.png` and `.jpg`.

## Output Filename Rules

**CRITICAL:** The output filename MUST exactly match the animation name from the Sprite Queue above.

- `idle` animation → `--output assets-source/images/sprites/hero/idle.png`
- `walk` animation → `--output assets-source/images/sprites/hero/walk.png`
- `attack` animation → `--output assets-source/images/sprites/hero/attack.png`
- `hurt` animation → `--output assets-source/images/sprites/hero/hurt.png`
- `super` animation → `--output assets-source/images/sprites/hero/super.png`

Do NOT rename, prefix, or alter these filenames. Do NOT use names like `hero-idle`, `hero-attack`, `hero-walk-left`, `hero-dig`, etc.

**Note:** Gemini will likely output a `.jpg` file even though we request `.png`. This is expected. Always check the actual extension on disk and track the real filename.

## State File

The state file at `assets-source/images/sprites/.progress-single.json` tracks this test run.

Schema:

```json
{
  "generated": ["idle.jpg", "walk.jpg"],
  "failed": {"attack.png": "API Error (429): rate limited"},
  "converted": ["idle.webp", "walk.webp"],
  "completed": false
}
```

Field definitions:

- **`generated`** — list of successfully generated animation filenames (e.g. `"idle.jpg"`)
- **`failed`** — map of filename → error message
- **`converted`** — list of converted WebP filenames
- **`completed`** — `true` when ALL animations are generated, chromakeyed, AND converted

**IMPORTANT:** When tracking generated files, check what extension Gemini actually output (`.png` or `.jpg`). Track the real filename on disk, not the
requested one.

## Prerequisites

- **`GEMINI_API_KEY`** must be set in the environment. If not available, check `.env` or ask the user.
- **Runtime**: Use `bun run` if available. If `bun` is not in PATH (e.g., outside devenv shell), use `npx tsx` as a drop-in replacement.
- **Still image**: `assets-source/images/sprites/hero/still.png` (or `.jpg`) must exist. This is the sole style reference. If missing, STOP and tell the user to
  run `sprites-stills.md` first, then output `SPRITES_SINGLE_COMPLETE`.

## Each Iteration

### Step 1: Initialize

**1a: Read the hero still image.** Visually read `assets-source/images/sprites/hero/still.png` (or `.jpg`) as the style reference. Study it carefully —
the generated frames must depict the **exact same character**.

**1b: Load or create state file.** Read `assets-source/images/sprites/.progress-single.json`. If it doesn't exist, create it:

```json
{
  "generated": [],
  "failed": {},
  "converted": [],
  "completed": false
}
```

**1c: Ensure directories exist.**

```bash
mkdir -p assets-source/images/sprites/hero
mkdir -p public/assets/images/sprites/hero
```

### Step 2: Find Next Animation

The hero needs these animations (in this exact order): `idle`, `walk`, `attack`, `hurt`, `super`.

Walk this list in order. For each animation:

1. If `<name>.png` or `<name>.jpg` is in `generated` → skip
2. If `<name>.png` or `<name>.jpg` is in `failed` → skip
3. Otherwise → this is the next animation to generate

If no animation needs processing → go to Step 5 (Chromakey) or Step 7 (Completion).

### Step 3: Generate Animation

**Construct the sprite sheet prompt:**

```raw
Create a horizontal sprite sheet for a 2D side-scrolling beat-em-up game.

BACKGROUND: The entire background MUST be a perfectly solid, uniform, bright green color (hex #00FF00). This is a chroma key green screen. There must be
NO variation, NO gradients, NO shadows, and NO other colors in the background — pure flat #00FF00 everywhere the character is not. IMPORTANT: No part of the
character, effects, particles, steam, smoke, aura, or glow should use green or any shade close to #00FF00 — use white, gray, yellow, orange, blue, or other
non-green colors for all visual effects. Green elements will be destroyed by the chroma key removal.

LAYOUT: This is a SINGLE-ROW horizontal strip. All <N> poses MUST be in ONE row going left to right — NEVER stack them into multiple rows or a grid. The
image is an ultra-wide horizontal banner. Each pose occupies a 1000x1000 pixel area. Total image: <N*1000> pixels wide by 1000 pixels tall. If you feel
tempted to arrange in 2 rows — DON'T. One row only.

ABSOLUTELY NO BORDERS: Do NOT draw any borders, boxes, rectangles, frames, dividers, outlines, panels, cards, or lines of any kind between, around, or near
the poses. The poses sit directly on the green background with nothing separating them — just green space between the character artwork. This is critical —
any drawn borders or frame lines will ruin the sprite sheet.

CHARACTER CONSISTENCY: The sprite sheet frames MUST all depict the SAME character described above — identical face, identical hair, identical clothing
colors, identical accessories, identical body proportions. The ONLY thing that changes between frames is the pose/position. If something looks different between
frames (wrong hair color, missing accessories, different clothes), it is WRONG.

ART STYLE: Streets of Rage 4, hand-painted by Lizardcube. Chibi/super-deformed proportions (large head ~1/3 of body height, stubby limbs). Thick black ink
outlines on the character (2-3px). Cel-shaded flat coloring with bold saturated colors. These outlines are part of the character's art style — they go ON the
character, NOT around frame boundaries.

CHARACTER: Ron Jay — 70s crypto degenerate with a flowing brown mullet, thick brown mustache, gold-framed aviator sunglasses, white safari suit jacket over a
red collared shirt, brown leather belt, white pants, brown leather boots. Chibi proportions with large head (~1/3 body height), stocky build, cocky confident
stance.

ANIMATION: <insert animation type and motion description from below>

REQUIREMENTS:
- Background is SOLID #00FF00 green — no exceptions
- NO green on the character or effects (steam, smoke, aura must be white/gray/yellow/blue — NOT green)
- ZERO borders, frames, boxes, or dividing lines anywhere in the image
- ALL <N> poses in a SINGLE horizontal row — absolutely NO multiple rows or grids
- Each pose centered within its 1000x1000 cell area
- ALL poses show the SAME character with IDENTICAL appearance — only the pose changes
- Character fully visible in every frame, not cropped at edges
```

**Animation Descriptions:**

**idle** (6 poses): Character stands with subtle breathing motion. Pose 1: neutral stance. Poses 2-3: slight torso rise (inhale). Poses 4-5: slight torso drop (exhale). Pose 6: return to neutral.

**walk** (6 poses): Character walks forward (right-facing). Pose 1: contact (right foot forward). Pose 2: passing (feet together). Pose 3: contact (left foot
forward). Pose 4: passing. Poses 5-6: return to start. Arms swing naturally.

**attack** (6 poses): Character throws a punch. Pose 1: windup (arm pulled back). Pose 2: arm extending. Pose 3: full extension (impact). Pose 4:
follow-through. Pose 5: retracting. Pose 6: return to idle.

**hurt** (4 poses): Character recoils from hit. Pose 1: impact (head snaps back). Pose 2: full recoil (leaning back). Pose 3: recovery start. Pose 4: return toward neutral.

**super** (6 poses): Special power attack. Pose 1: charging (crouching, energy gathering). Pose 2: energy building (glowing hands). Pose 3: release windup.
Pose 4: full power release (blast pose). Pose 5: follow-through. Pose 6: recovery.

Run the generation (use `--aspect 21:9` for ALL hero animations):

```bash
python ~/.claude/plugins/marketplaces/nano-skills/skills/nano-image-generator/scripts/generate_image.py \
  "<prompt>" \
  --output assets-source/images/sprites/hero/<animation>.png \
  --aspect 21:9 \
  --size 2K
```

**After generation, verify the output file:**

```bash
# Check what file was actually created (may be .png or .jpg)
ls assets-source/images/sprites/hero/<animation>.* 2>/dev/null
```

**Validate single-row layout:** Check that the image is wider than it is tall. Read the generated image and check its dimensions. If `height > width` or
`height > width / 2`, Gemini likely produced a multi-row grid instead of a single horizontal strip. In that case:

- Log a warning: `[hero/<animation>] MULTI-ROW DETECTED (<width>x<height>) — regenerating`
- Delete the file and retry generation once with the same prompt
- If the retry also produces multiple rows, record it as a failure and move on

After success:

- Check the actual file extension on disk (`.png` or `.jpg`)
- Add the real filename (e.g. `idle.jpg`) to `generated`
- Write state file
- Print: `[hero/<animation>] -> OK (generated: X/5)`

After failure:

- Add error to `failed.<animation>.png`
- Write state file
- Print: `[hero/<animation>] -> FAILED: <error>`

### Step 4: Rate Limiting

After each generation, wait 3 seconds:

```bash
sleep 3
```

If you hit a rate limit error (429), wait 30 seconds and retry once. If it fails again, record the error and move on.

### Step 5: Chromakey — Remove Green Background

When ALL 5 animations are in `generated` (or `failed`), remove the #00FF00 green screen background from all sprite sheets to produce transparent PNGs.

```bash
bun run bin/sprites.ts --chromakey
```

This scans `assets-source/images/sprites/hero/` for PNG/JPG files (skipping `still.*`), removes the green background with soft-edge anti-aliasing, and outputs
transparent PNGs in place. JPG originals are replaced with the transparent PNG.

Verify the output looks correct — the green background should be gone and character edges should be clean without green fringing.

### Step 6: Convert to WebP

After chromakey processing, convert the transparent PNGs to WebP:

```bash
bun run bin/sprites.ts --convert
```

This converts PNGs in `assets-source/images/sprites/hero/` to WebP in `public/assets/images/sprites/hero/` with full alpha quality preservation. It skips files that are already up-to-date.

Update state:

- Add converted filenames to `converted`
- If all generated animations are converted, set `completed` to `true`
- Write state file

### Step 7: Completion Check

If `completed` is `true`, or all 5 animations are in either `generated` or `failed`:

```text
HERO SPRITE TEST COMPLETE

Results:
  idle:    <OK or FAILED> (<dimensions> <format>)
  walk:    <OK or FAILED> (<dimensions> <format>)
  attack:  <OK or FAILED> (<dimensions> <format>)
  hurt:    <OK or FAILED> (<dimensions> <format>)
  super:   <OK or FAILED> (<dimensions> <format>)

Review the results in:
  Source:  assets-source/images/sprites/hero/
  WebP:    public/assets/images/sprites/hero/
```

Output: `SPRITES_SINGLE_COMPLETE`

Otherwise, the loop will restart and process the next animation.
