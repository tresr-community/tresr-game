<script lang="ts">
  import {confettiTrigger} from "@/lib/stores/ui.svelte";

  const DEFAULT_COLORS = [
    "#FFD700",
    "#FF6B6B",
    "#4ECDC4",
    "#A855F7",
    "#FB923C",
    "#34D399",
  ];
  const DEFAULT_COUNT = 80;
  const MAX_FRAMES = 180; // ~3 seconds at 60fps

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    rot: number;
    vr: number;
    color: string;
    alpha: number;
  }

  function fire(count = DEFAULT_COUNT, colors = DEFAULT_COLORS) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;inset:0;z-index:9999;pointer-events:none;";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d")!;
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: canvas.width * (0.3 + Math.random() * 0.4),
        y: canvas.height * 0.3,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 14 - 4,
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 2,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
      });
    }

    let frame = 0;

    function tick() {
      if (frame++ > MAX_FRAMES) {
        canvas.remove();
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.vy += 0.25; // gravity
        p.y += p.vy;
        p.rot += p.vr;
        p.alpha = Math.max(0, 1 - frame / MAX_FRAMES);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  $effect(() => {
    const payload = confettiTrigger.current;
    if (!payload) return;
    fire(payload.count ?? DEFAULT_COUNT, payload.colors ?? DEFAULT_COLORS);
  });
</script>
