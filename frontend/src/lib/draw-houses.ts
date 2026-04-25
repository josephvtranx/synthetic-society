// Minimal WBWWB-style background — clean field, no buildings

export function drawTownBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Subtle ground texture — just a few scattered dots like grass/dirt
  ctx.fillStyle = "rgba(0,0,0,0.015)";
  const rand = seededRandom(42);
  for (let i = 0; i < 80; i++) {
    const x = rand() * w;
    const y = rand() * h;
    ctx.beginPath();
    ctx.arc(x, y, 1 + rand() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}
