<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { initGame } from "@/lib/game/game";
  import { log } from "@/lib/utils/log";

  import HUD from "./HUD.svelte";
  import GameModals from "./GameModals.svelte";
  import PauseMenu from "./PauseMenu.svelte";
  import TouchControls from "./TouchControls.svelte";
  import CriticalError from "./CriticalError.svelte";

  let container: HTMLDivElement;
  let game: Phaser.Game | null = null;
  const COMPONENT_NAME = "GameCanvas";

  export let isStarting = false;

  $: if (isStarting && !game && container) {
      log.info(COMPONENT_NAME, "Initializing engine...");
      game = initGame(container.id);
      // Expose for portrait detection to pause/resume scenes
      (window as any).__phaserGame = game;
  }

  onDestroy(() => {
    if (game) {
      log.info(COMPONENT_NAME, "Destroying game engine and clearing WebAudio contexts");

      // True flag removes canvas from DOM during destroy
      game.destroy(true);

      if (game.sound) {
          game.sound.removeAll();
      }

      delete (window as any).__phaserGame;
    }
  });
</script>

<div
  bind:this={container}
  id="phaser-game-container"
  class="relative h-full w-full overflow-hidden bg-black"
>
  <!-- Overlays -->
  <HUD />
  <GameModals />
  <PauseMenu />
  <CriticalError />
  <TouchControls />
</div>

<style>
  :global(#phaser-game-container canvas) {
    display: block;
    margin: 0 auto;
  }
</style>
