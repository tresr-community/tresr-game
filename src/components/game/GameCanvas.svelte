<script lang="ts">
  import {onDestroy} from "svelte";
  import {log} from "@/lib/utils/log";

  import HUD from "./HUD.svelte";
  import GameModals from "./GameModals.svelte";
  import PauseMenu from "./PauseMenu.svelte";
  import TouchControls from "./TouchControls.svelte";
  import CriticalError from "./CriticalError.svelte";

  /**
   * Bindable ref to the running Phaser.Game instance.
   * Parent (game/+page.svelte) binds this to get the game handle
   * without relying on (window as any).__phaserGame.
   */
  interface Props {
    game?: Phaser.Game | null;
  }

  let {game = $bindable(null)}: Props = $props();

  const COMPONENT_NAME = "GameCanvas";
  let container: HTMLDivElement;

  // $effect runs after DOM is painted — container ref is guaranteed bound here.
  // Dynamic import of game ensures Phaser bundle is code-split from this chunk.
  $effect(() => {
    if (!container || game) return;
    import("@/lib/game/game").then(({initGame}) => {
      log.info(COMPONENT_NAME, "Initializing Phaser engine...");
      game = initGame(container.id);
    });
  });

  onDestroy(() => {
    if (game) {
      log.info(
        COMPONENT_NAME,
        "Destroying game engine and clearing WebAudio contexts"
      );
      if (game.sound) {
        game.sound.removeAll();
      }
      // true = remove canvas from DOM
      game.destroy(true);
      game = null;
    }
  });
</script>

<div
  bind:this={container}
  id="phaser-game-container"
  class="relative h-full w-full overflow-hidden bg-black"
>
  <!-- Overlays rendered on top of Phaser canvas -->
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
