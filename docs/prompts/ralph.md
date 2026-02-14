# RALPH LOOPS

## ONE SHOT (Implement + Review)

```bash
/ralph-loop "Read and follow docs/prompts/loop.md exactly." --completion-promise "LOOP_COMPLETE" --max-iterations 25
```

## IMPLEMENTATION

```bash
/ralph-loop "Read and follow docs/prompts/implementation.md exactly." --completion-promise "CODE_COMPLETE" --max-iterations 10
```

## REVIEW

```bash
/ralph-loop "Read and follow docs/prompts/review.md exactly." --completion-promise "REVIEW_COMPLETE" --max-iterations 10
```

## WALLPAPERS

```bash
/ralph-loop \
  "Your ONLY instructions are in docs/prompts/wallpapers.md. \
  Read that file completely and follow every step exactly in order. \
  Do NOT skip any sub-steps. Process up to 25 keys per iteration. \
  When ALL keys are in completed or failed, output \
  WALLPAPERS_COMPLETE." \
  --completion-promise "WALLPAPERS_COMPLETE" \
  --max-iterations 30
```

## SPRITES

### 1. Create Still Images for approval

```bash
/ralph-loop \
  "Your ONLY instructions are in docs/prompts/sprites-stills.md. \
  Read that file completely and follow every step exactly in order. \
  Do NOT skip any sub-steps. Process all sprites per iteration. \
  When ALL sprites have stills on disk or are in failed, output \
  STILLS_COMPLETE." \
  --completion-promise "STILLS_COMPLETE" \
  --max-iterations 25
```

### 2a. Create Animation Sprite Sheets (Single sprite test)

```bash
/ralph-loop \
  "Your ONLY instructions are in docs/prompts/sprites-single.md. \
  Read that file completely and follow every step exactly in order. \
  Do NOT skip any sub-steps. Process up to 1 sprite per iteration. \
  When ALL sprites have animation sprite sheets on disk or are in failed, output \
  SPRITES_SINGLE_COMPLETE." \
  --completion-promise "SPRITES_SINGLE_COMPLETE" \
  --max-iterations 5
```

### 2b. Create Animation Sprite Sheets

```bash
/ralph-loop \
  "Your ONLY instructions are in docs/prompts/sprites.md. \
  Read that file completely and follow every step exactly in order. \
  Do NOT skip any sub-steps. When ALL sprites are in completed or failed, output \
  SPRITES_COMPLETE." \
  --completion-promise "SPRITES_COMPLETE" \
  --max-iterations 100
```
