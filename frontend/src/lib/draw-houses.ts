// Draw a cute little town background with simple houses, trees, and paths

type House = {
  x: number;
  y: number;
  w: number;
  h: number;
  roofH: number;
  color: string;
  roofColor: string;
  hasChimney: boolean;
  hasDoor: boolean;
  windowCount: number;
};

type Tree = {
  x: number;
  y: number;
  size: number;
  color: string;
};

// Seeded random for consistent layout
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

let cachedHouses: House[] | null = null;
let cachedTrees: Tree[] | null = null;
let cachedSeed = -1;

function generateTown(w: number, h: number) {
  const rand = seededRandom(42);
  const houses: House[] = [];
  const trees: Tree[] = [];

  const houseColors = ["#e8ddd4", "#d4c8be", "#ddd5cb", "#c8bfb5", "#e0d8d0", "#d8cfc5"];
  const roofColors = ["#b85c4a", "#8b6b5a", "#7a8b6b", "#6b7a8b", "#9b7b5b", "#a06850"];
  const treeColors = ["#8aab7a", "#7a9b6a", "#6b8b5a", "#9abb8a", "#78a068"];

  // Place houses around the edges and scattered, avoiding center
  const positions = [
    // Top row
    { x: 0.05, y: 0.02 }, { x: 0.18, y: 0.04 }, { x: 0.35, y: 0.01 },
    { x: 0.55, y: 0.03 }, { x: 0.72, y: 0.02 }, { x: 0.88, y: 0.04 },
    // Bottom row
    { x: 0.08, y: 0.88 }, { x: 0.25, y: 0.9 }, { x: 0.42, y: 0.87 },
    { x: 0.6, y: 0.89 }, { x: 0.78, y: 0.88 }, { x: 0.92, y: 0.86 },
    // Left side
    { x: 0.01, y: 0.25 }, { x: 0.03, y: 0.5 }, { x: 0.02, y: 0.72 },
    // Right side
    { x: 0.9, y: 0.28 }, { x: 0.92, y: 0.52 }, { x: 0.91, y: 0.75 },
  ];

  for (const pos of positions) {
    const houseW = 28 + rand() * 18;
    const houseH = 20 + rand() * 12;
    houses.push({
      x: pos.x * w,
      y: pos.y * h,
      w: houseW,
      h: houseH,
      roofH: 10 + rand() * 8,
      color: houseColors[Math.floor(rand() * houseColors.length)],
      roofColor: roofColors[Math.floor(rand() * roofColors.length)],
      hasChimney: rand() > 0.5,
      hasDoor: true,
      windowCount: Math.floor(1 + rand() * 2),
    });
  }

  // Trees scattered around edges
  const treePositions = [
    { x: 0.12, y: 0.12 }, { x: 0.3, y: 0.08 }, { x: 0.65, y: 0.1 },
    { x: 0.85, y: 0.15 }, { x: 0.05, y: 0.4 }, { x: 0.95, y: 0.42 },
    { x: 0.06, y: 0.65 }, { x: 0.93, y: 0.68 }, { x: 0.15, y: 0.85 },
    { x: 0.5, y: 0.92 }, { x: 0.82, y: 0.82 }, { x: 0.38, y: 0.06 },
    { x: 0.02, y: 0.15 }, { x: 0.96, y: 0.2 }, { x: 0.08, y: 0.78 },
    { x: 0.88, y: 0.92 },
  ];

  for (const pos of treePositions) {
    trees.push({
      x: pos.x * w,
      y: pos.y * h,
      size: 6 + rand() * 6,
      color: treeColors[Math.floor(rand() * treeColors.length)],
    });
  }

  return { houses, trees };
}

export function drawTownBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Regenerate if size changed significantly
  if (!cachedHouses || !cachedTrees || Math.abs(cachedSeed - w * h) > 10000) {
    const town = generateTown(w, h);
    cachedHouses = town.houses;
    cachedTrees = town.trees;
    cachedSeed = w * h;
  }

  // Soft path lines (little roads)
  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.5);
  ctx.quadraticCurveTo(w * 0.3, h * 0.45, w * 0.5, h * 0.5);
  ctx.quadraticCurveTo(w * 0.7, h * 0.55, w * 0.9, h * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.1);
  ctx.quadraticCurveTo(w * 0.48, h * 0.3, w * 0.5, h * 0.5);
  ctx.quadraticCurveTo(w * 0.52, h * 0.7, w * 0.5, h * 0.9);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Draw houses
  for (const house of cachedHouses) {
    const { x, y, w: hw, h: hh, roofH, color, roofColor, hasChimney, windowCount } = house;

    // House body
    ctx.fillStyle = color;
    ctx.fillRect(x, y + roofH, hw, hh);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y + roofH, hw, hh);

    // Roof
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + roofH);
    ctx.lineTo(x + hw / 2, y);
    ctx.lineTo(x + hw + 3, y + roofH);
    ctx.closePath();
    ctx.fill();

    // Chimney
    if (hasChimney) {
      ctx.fillStyle = roofColor;
      ctx.fillRect(x + hw * 0.65, y - 4, 5, roofH * 0.6);
    }

    // Door
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(x + hw / 2 - 3, y + roofH + hh - 10, 6, 10);

    // Windows
    ctx.fillStyle = "rgba(255,255,220,0.4)";
    for (let i = 0; i < windowCount; i++) {
      const wx = x + 4 + i * (hw / (windowCount + 1));
      ctx.fillRect(wx, y + roofH + 4, 5, 4);
    }
  }

  // Draw trees
  for (const tree of cachedTrees) {
    // Trunk
    ctx.fillStyle = "#8b7b6b";
    ctx.fillRect(tree.x - 1.5, tree.y + tree.size * 0.4, 3, tree.size * 0.6);

    // Canopy
    ctx.fillStyle = tree.color;
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.size, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(tree.x - tree.size * 0.2, tree.y - tree.size * 0.2, tree.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
