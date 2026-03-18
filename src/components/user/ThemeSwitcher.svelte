<script lang="ts">
  import {onMount} from "svelte";
  import {DropdownMenu} from "bits-ui";

  const themes = [
    {id: "synthwave", name: "Synthwave", icon: "🌃"},
    {id: "dark", name: "Dark", icon: "🌙"},
    {id: "light", name: "Light", icon: "☀️"},
  ];

  let currentTheme = $state("synthwave");

  onMount(() => {
    const saved = localStorage.getItem("tresr-theme");
    if (saved && themes.find((t) => t.id === saved)) {
      setTheme(saved);
    } else {
      setTheme("synthwave");
    }
  });

  function setTheme(themeId: string) {
    currentTheme = themeId;
    document.documentElement.dataset.theme = themeId;
    localStorage.setItem("tresr-theme", themeId);
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="border-primary/20 flex items-center gap-2 rounded border bg-white/5 px-2 py-1 font-mono text-xs transition-colors hover:bg-white/10 focus:outline-none"
    aria-label="Toggle Theme"
  >
    {themes.find((t) => t.id === currentTheme)?.icon}
    <span class="hidden sm:inline"
      >{themes.find((t) => t.id === currentTheme)?.name}</span
    >
  </DropdownMenu.Trigger>
  <DropdownMenu.Content
    align="end"
    sideOffset={4}
    class="border-primary/20 z-[100] mt-1 w-36 rounded-lg border bg-black/90 shadow-[0_0_15px_rgba(var(--color-primary),0.2)] backdrop-blur-md outline-none"
  >
    <div class="flex flex-col py-1">
      {#each themes as theme}
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-2 text-left font-mono text-xs transition-colors hover:bg-white/10 {currentTheme ===
          theme.id
            ? 'text-primary bg-primary/10 font-bold'
            : 'text-white/80'}"
          onclick={() => setTheme(theme.id)}
        >
          <span>{theme.icon}</span>
          {theme.name}
        </button>
      {/each}
    </div>
  </DropdownMenu.Content>
</DropdownMenu.Root>
