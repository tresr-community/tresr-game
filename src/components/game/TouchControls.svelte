<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import TouchInput from "@/lib/game/TouchInput";
  import {gameState} from "@/lib/game/state";
  import {config} from "@/lib/config/client";
  import Button from "@/components/ui/Button.svelte";

  const touchInput = TouchInput.getInstance();

  let isTouchDevice = false;
  let isGamePaused = false;
  let superCharge = 0;
  const maxCharge = config.gameplay.entities.player.super.max_charge;

  $: showControls = isTouchDevice && !isGamePaused;
  $: canSuper = Number(superCharge) >= Number(maxCharge);

  const JOYSTICK_RADIUS = 50;
  let joystickActive = false;
  let joystickTouchId: number | null = null;
  let joystickBaseElement: HTMLDivElement;
  let joystickThumbElement: HTMLDivElement;
  let baseRect: DOMRect | null = null;

  let unsubState: () => void;

  onMount(() => {
    isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice) {
      touchInput.setActive(true);
    }

    unsubState = gameState.subscribe((state) => {
      isGamePaused = state.isPaused;
      superCharge = state.superCharge;
    });

    // Global touch listeners for joystick drag
    document.addEventListener("touchmove", handleTouchMove, {passive: true});
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchCancel);
  });

  onDestroy(() => {
    if (unsubState) unsubState();
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchEnd);
    document.removeEventListener("touchcancel", handleTouchCancel);
  });

  function updateThumbPosition(dx: number, dy: number) {
    if (!joystickThumbElement) return;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const cx = clampedDist * Math.cos(angle);
    const cy = clampedDist * Math.sin(angle);

    joystickThumbElement.style.transform = `translate(${cx}px, ${cy}px)`;

    const nx = dist > 0 ? cx / JOYSTICK_RADIUS : 0;
    const ny = dist > 0 ? cy / JOYSTICK_RADIUS : 0;
    touchInput.setJoystick(nx, ny);
  }

  function resetJoystick() {
    joystickActive = false;
    joystickTouchId = null;
    if (joystickThumbElement)
      joystickThumbElement.style.transform = "translate(0px, 0px)";
    touchInput.setJoystick(0, 0);
  }

  function handleJoystickStart(e: TouchEvent) {
    if (joystickActive) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickActive = true;
    baseRect = joystickBaseElement?.getBoundingClientRect() ?? null;
    if (baseRect) {
      const centerX = baseRect.left + baseRect.width / 2;
      const centerY = baseRect.top + baseRect.height / 2;
      updateThumbPosition(touch.clientX - centerX, touch.clientY - centerY);
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (!joystickActive || joystickTouchId === null || !baseRect) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        const centerX = baseRect.left + baseRect.width / 2;
        const centerY = baseRect.top + baseRect.height / 2;
        updateThumbPosition(touch.clientX - centerX, touch.clientY - centerY);
        break;
      }
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        resetJoystick();
        break;
      }
    }
  }

  function handleTouchCancel() {
    resetJoystick();
  }

  function handleAttackStart(e: TouchEvent) {
    e.preventDefault();
    touchInput.fireAttack();
  }
  function handleJumpStart(e: TouchEvent) {
    e.preventDefault();
    touchInput.fireJump();
  }
  function handleSuperStart(e: TouchEvent) {
    e.preventDefault();
    touchInput.fireSuper();
  }
</script>

{#if showControls}
  <div class="pointer-events-none absolute inset-0 z-50">
    <!-- Virtual Joystick (left side) -->
    <div
      role="presentation"
      class="pointer-events-auto absolute touch-none sm:bottom-8 sm:left-8"
      style="bottom: max(1rem, var(--safe-bottom)); left: max(1rem, var(--safe-left));"
      on:touchstart|preventDefault={handleJoystickStart}
    >
      <div
        bind:this={joystickBaseElement}
        class="border-primary/30 relative flex h-24 w-24 items-center justify-center rounded-full border bg-black/40 backdrop-blur-sm sm:h-32 sm:w-32"
      >
        <div
          bind:this={joystickThumbElement}
          class="bg-primary/60 border-primary/80 absolute h-9 w-9 rounded-full border-2 shadow-lg sm:h-12 sm:w-12"
        ></div>
      </div>
    </div>

    <!-- Action Buttons (right side) -->
    <div
      class="pointer-events-auto absolute flex touch-none flex-col items-center gap-3 sm:right-8 sm:bottom-8 sm:gap-3"
      style="bottom: max(0.5rem, var(--safe-bottom)); right: max(0.5rem, var(--safe-right));"
    >
      <!-- Jump button (top) -->
      <Button
        variant="info"
        ontouchstart={handleJumpStart}
        class="border-info/60 h-14 w-14 rounded-full border text-xs font-bold text-white backdrop-blur-sm active:scale-90 sm:h-16 sm:w-16"
        aria-label="Jump"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 19V5"></path>
          <path d="M5 12l7-7 7 7"></path>
        </svg>
      </Button>

      <div class="flex gap-3">
        <!-- Super button (left of attack) -->
        <Button
          variant="warning"
          ontouchstart={handleSuperStart}
          class={`border-warning/60 h-14 w-14 rounded-full border text-xs font-bold text-white backdrop-blur-sm active:scale-90 sm:h-16 sm:w-16 ${canSuper ? "animate-pulse opacity-100" : "opacity-50"}`}
          aria-label="Super attack"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            ></polygon>
          </svg>
        </Button>

        <!-- Attack button (main) -->
        <Button
          variant="error"
          ontouchstart={handleAttackStart}
          class="border-error/70 h-14 w-14 rounded-full border text-xs font-bold text-white backdrop-blur-sm active:scale-90 sm:h-16 sm:w-16"
          aria-label="Attack"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14.5 17.5L3 6l3-3 11.5 11.5M13 19l6-6M16 16l4 4M19 13l2 2"
            ></path>
          </svg>
        </Button>
      </div>
    </div>
  </div>
{/if}
