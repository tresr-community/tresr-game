# Wallpaper Generation — Ralph Loop Prompt

## Task

Generate a Streets of Rage 4 style game background wallpaper for every key image in `assets-source/images/keys/`. One wallpaper per key image. Track progress in a state file so work survives across iterations.

## State File

The state file at `assets-source/images/wallpapers/.progress.json` is managed
by `bin/wallpapers.ts`. Do NOT manually edit it — the script handles
all state updates for conversion and integrity. You only update it when adding
entries to `generated` after successful image generation.

Schema:

```json
{
  "generated": ["key-001.jpg", "key-002.jpg"],
  "failed": ["key-012.jpg"],
  "completed": ["key-001.jpg", "key-002.jpg"],
  "next_wallpaper_number": 3,
  "total_keys": 112,
  "errors": {
    "key-012.jpg": "API Error (429): rate limited"
  },
  "converted": {
    "wallpaper_1.webp": true,
    "wallpaper_2.webp": true
  }
}
```

Field definitions:

- **`generated`** — keys that have had a wallpaper image generated (JPG)
- **`converted`** — wallpapers confirmed as WebP (key is filename, value is `true`)
- **`completed`** — keys that are both generated AND converted to WebP. This is the true "done" list.
- **`failed`** — keys where generation failed
- **`errors`** — error messages for failed keys

## Prerequisites

- **`GEMINI_API_KEY`** must be set in the environment. If not available, check `.env` or ask the user.
- **Runtime**: Use `bun run` if available. If `bun` is not in PATH (e.g., outside devenv shell), use `npx tsx` as a drop-in replacement for all `bun run bin/wallpapers.ts` commands.

## Each Iteration

### 1. Run Conversion Script (MANDATORY)

**STEP 1a: Run the conversion script in sync mode.** You MUST run this BEFORE doing anything else every iteration:

```bash
bun run bin/wallpapers.ts --sync
```

> **Fallback**: If `bun` is not found, use `npx tsx bin/wallpapers.ts --sync` instead. This applies to ALL script commands in this prompt.

The `--sync` flag runs a **full sync** and creates all required directories automatically:

- Creates `assets-source/images/wallpapers/`, `assets-source/images/keys/`, and `public/assets/images/wallpapers/` if they don't exist
- **Reverse cleanup**: if a WebP was manually deleted, auto-deletes the corresponding source JPG/PNG so the key gets fully regenerated from scratch
- Converts ALL pending `wallpaper_*.jpg` and `wallpaper_*.png` source files to WebP
- Bootstraps state from disk — if WebPs exist for keys not yet tracked, auto-adds them
- Rebuilds `converted` and `completed` from actual disk state
- Writes the updated `.progress.json`

**IMPORTANT:** Only use `--sync` here at the START of each iteration.
Do NOT use `--sync` after generating — it would delete the new source JPG
before converting it. Use `--update` after generating (see Step 4).

**Do NOT proceed to Step 1b until this script completes successfully.**

**STEP 1b: Get pending keys.** Run the script in pending mode to find out exactly which keys need wallpapers and their correct wallpaper numbers:

```bash
bun run bin/wallpapers.ts --pending
```

This outputs machine-readable data:

```text
PENDING_COUNT=2
TOTAL_KEYS=109
GENERATED=107
FAILED=0
COMPLETED=107
---
KEY_FILE|WALLPAPER_NUM|OUTPUT_PATH
key-015.jpg|15|assets-source/images/wallpapers/wallpaper_15.jpg
key-055.jpg|55|assets-source/images/wallpapers/wallpaper_55.jpg
```

**CRITICAL — Wallpaper Number Rules:**

- The `WALLPAPER_NUM` from `--pending` output is the ONLY correct wallpaper number. **Use it exactly as shown.**
- Wallpaper number = the number extracted from the key filename. `key-015.jpg` → `wallpaper_15`.
- **NEVER calculate wallpaper numbers yourself.** Always use the `--pending` output.

If the output shows `ALL_KEYS_PROCESSED`, output `<promise>WALLPAPERS_COMPLETE</promise>` and stop.

Process the first pending key from the list. Use the `WALLPAPER_NUM` and `OUTPUT_PATH` values directly in Steps 3 and 4.

### 2. Read the Key Image

Read the key image file visually. Extract TWO categories of information:

**A. Scene Description** (this drives the unique environment for each wallpaper):

- Scene setting — what type of environment is depicted?
  (e.g., enchanted garden, rain-soaked alley, abandoned warehouse,
  moonlit harbor, neon-lit arcade, overgrown ruins, rooftop at sunset,
  underground subway station, mystical cave, seaside boardwalk, etc.)
- Time of day / weather — dawn, midday, dusk, night, stormy, foggy, clear, snowy, etc.
- Architectural style — modern concrete, Victorian brick, Japanese wooden, Art Deco, industrial steel, medieval stone, futuristic neon, Mediterranean stucco, etc.
- Surface materials visible — cobblestone, wet asphalt, wooden planks, sand, marble tiles, rusty metal grating, mossy stone, etc.
- Environmental props/details — what objects, textures, vegetation, or
  features make this scene unique? (e.g., cherry blossom petals, hanging
  lanterns, puddles reflecting neon, ivy-covered walls, steam vents,
  stacked crates, fishing nets, train tracks, etc.)
- Depth/atmosphere — hazy, crystal clear, smoky, misty, particle-filled, etc.

**B. Color & Key Details**:

- Dominant color palette (4-6 hex colors)
- Sky/background gradient colors
- Wall/surface tones
- Shadow and dark accent colors
- Accent/highlight colors (neon, glowing elements)
- Overall lighting mood (warm sunset, cool night, neon-lit, etc.)
- Overall brightness (dark/moody, medium, bright/vibrant)
- Key object appearance (ornate, simple, golden, rusty, glowing, etc.)

**IMPORTANT**: The scene description must be DERIVED from the key image.
If the key image has warm pinks and teals with soft lighting, the scene
should be something like a sunset boardwalk or rooftop garden — NOT a
dark alley. If the key image is electric purple and magical, the scene
should be a mystical or fantastical environment. The key image's mood
and colors DICTATE the scene type.

### 3. Generate Wallpaper

Construct the prompt by filling in the scene description, color palette,
and key description from Step 2. Each `<insert ...>` placeholder MUST be
replaced with specific details extracted from the key image.
**Do NOT use generic/default descriptions** — every wallpaper should
have a unique scene.

```raw
Streets of Rage 4 style beat-em-up game background, hand-painted by Lizardcube studio. Hand-drawn 2D cel-shaded art with bold ink outlines and painterly brushwork. Thick black contour lines on all architectural elements. Rich color fills with visible brush texture and subtle color gradients within shapes. Atmospheric lighting with volumetric light shafts and environmental haze. Stylized cartoon proportions.

SCENE: <insert scene setting, time of day, weather, and architectural style here — e.g., "A moonlit Japanese garden district at night during light rain. Traditional wooden buildings with curved tile roofs and paper lanterns. Cherry blossom petals drift through the air.">

2.5D fixed side-view perspective with a slight low-angle tilt for cinematic depth. The bottom 35-40% of the image is a flat, unobstructed ground plane where characters will walk with no objects blocking this area. The ground surface is <insert surface material — e.g., "wet cobblestone with puddles reflecting lantern light">. Midground at 40-70% has <insert midground architectural details and props — e.g., "wooden shrine gates, stone lanterns, bamboo fences, and a tea house with sliding doors"> pushed behind the walkable area. Background at 70-100% shows <insert background/sky description — e.g., "a misty mountain silhouette under a deep indigo sky with a pale full moon">.

ENVIRONMENTAL DETAILS: <insert unique props and atmosphere — e.g., "Soft pink cherry blossom petals scattered on the ground and drifting in the air. Warm golden light spills from paper lanterns. Gentle mist hugs the ground. A small stone fountain trickles water.">.

COLOR PALETTE AND MOOD: <insert extracted hex colors and mood description here>

Hidden somewhere in the midground is a tiny, realistic-sized <insert key description here>. It must be very small — no larger than 1-2% of the image width, the size a real key would appear at this distance. It should be subtle and easy to miss, blending naturally into the scene as if someone left it on <insert a scene-appropriate hiding spot — e.g., "a stone lantern ledge" or "a windowsill" or "a rusty pipe">. Do NOT make the key large, prominent, or obvious. CRITICAL: Do NOT draw any circles, rings, outlines, halos, glows, highlights, arrows, markers, or ANY visual indicator around or near the key. The key must have NO special visual treatment — it should look like just another small object in the scene with no way to distinguish it from other environmental details. No red circles, no white circles, no glowing edges, no spotlight effects. The key blends in completely.

No characters, no people, no living figures. Only the background environment. The scene should feel like a playable game level.

OUTPUT FORMAT: PNG
```

**CRITICAL — Scene Diversity Rules:**

- NEVER repeat the same scene type for consecutive wallpapers
- Each wallpaper MUST have a distinct environment derived from its key image
- If the key image is warm/bright → outdoor daytime scenes (markets, gardens, beaches, rooftops)
- If the key image is cool/dark → night scenes (alleys, docks, warehouses, underground)
- If the key image is colorful/magical → fantastical scenes (neon arcades, mystical ruins, carnival)
- If the key image is muted/industrial → gritty scenes (factories, train yards, construction sites)
- The midground and background descriptions MUST match the scene type — no "city skyline" in a cave scene

Run the generation:

```bash
python ~/.claude/plugins/marketplaces/nano-skills/skills/nano-image-generator/scripts/generate_image.py \
  "<prompt>" \
  --output assets-source/images/wallpapers/wallpaper_<N>.jpg \
  --aspect 16:9 \
  --size 2K
```

Where `<N>` is the `WALLPAPER_NUM` from the `--pending` output for this
key (Step 1b). The number matches the key filename:
`key-015.jpg` → `wallpaper_15.jpg`. The image is saved as JPG in
`assets-source/images/wallpapers/` (outside `public/` so it won't be
deployed). The conversion script will convert it to WebP in
`public/assets/images/wallpapers/` on the next run.

### 4. Update State

If generation succeeded (a file was created in `jpg/`):

- Add the key filename to `generated`
- Write the updated state file
- Run `bun run bin/wallpapers.ts --update` to convert the new JPG to WebP and update `converted`/`completed`/`next_wallpaper_number`
- **CRITICAL:** Use `--update` here, NOT `--sync`. The `--update` flag converts without deleting sources. Using `--sync` would delete the new JPG before converting it.
- **Do NOT manually set `next_wallpaper_number`** — the `--update` script calculates it from disk state.

If generation failed:

- Add the key filename to `failed`
- Record the error message in `errors`
- Write the updated state file

### 5. Rate Limiting

After each successful generation, wait 3 seconds:

```bash
sleep 3
```

If you hit a rate limit error (429), wait 30 seconds and retry the same key once. If it fails again, mark it as failed and move on.

### 6. Progress Report

After processing each key, print a one-line status:

```text
[wallpaper_<N>] key-XXX.jpg -> OK (generated: G, converted: C, completed: X/Y, failed: Z)
```

### 7. Completion Check

If all keys in `assets-source/images/keys/` are in either `completed` or `failed`:

Output: `<promise>WALLPAPERS_COMPLETE</promise>`

Otherwise, process the NEXT unprocessed key in the same iteration (process up to 5 keys per iteration to make steady progress, then let the loop restart for the next batch).
