// Drawn scenes: a dark field with a soft glow, then one of three animated graphics built from the scene's own words.
// Pure canvas drawing, called from the frame loop in browser-render.ts.
import type { SceneGraphic } from "@/types/project";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const v = clamp(value); return v * v * (3 - 2 * v); };
const easeOutBack = (value: number) => { const t = clamp(value); const c1 = 1.70158; return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export interface GraphicStyle { accent: string; family: string; headlineFamily: string }

function rgba(hex: string, alpha: number) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return `rgba(243,199,103,${alpha})`;
  const value = parseInt(match[1], 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function background(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, style: GraphicStyle) {
  const field = ctx.createLinearGradient(0, 0, 0, height);
  field.addColorStop(0, "#0d1520");
  field.addColorStop(1, "#08101a");
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, width, height);
  const drift = (progress - 0.5) * width * 0.06;
  const glow = ctx.createRadialGradient(width * 0.22 + drift, height * 0.12, 0, width * 0.22 + drift, height * 0.12, Math.max(width, height) * 0.7);
  glow.addColorStop(0, rgba(style.accent, 0.2));
  glow.addColorStop(1, rgba(style.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, selected: boolean, style: GraphicStyle) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  if (selected) {
    ctx.shadowColor = rgba(style.accent, 0.5);
    ctx.shadowBlur = h * 0.5;
    ctx.fillStyle = style.accent;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, h * 0.025);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.stroke();
  }
}

function drawChoices(ctx: CanvasRenderingContext2D, graphic: Extract<SceneGraphic, { kind: "choices" }>, local: number, width: number, height: number, style: GraphicStyle) {
  const short = Math.min(width, height);
  const portrait = height > width;
  const size = Math.round(short * (portrait ? 0.062 : 0.07));
  const h = size * 2.1;
  const pad = size * 1.1;
  ctx.font = `600 ${size}px ${style.family}`;
  const widths = graphic.items.map((item) => ctx.measureText(item).width + pad * 2);
  const gap = size * 0.6;
  // portrait: a stack; landscape: one row, wrapping to a second row when it would not fit
  const maxRow = width * (portrait ? 0.84 : 0.78);
  const rows: number[][] = [[]];
  let rowWidth = 0;
  graphic.items.forEach((_, index) => {
    const add = widths[index] + (rows[rows.length - 1].length ? gap : 0);
    if (!portrait && rowWidth + add > maxRow && rows[rows.length - 1].length) { rows.push([]); rowWidth = 0; }
    if (portrait && rows[rows.length - 1].length) { rows.push([]); rowWidth = 0; }
    rows[rows.length - 1].push(index);
    rowWidth += widths[index] + (rows[rows.length - 1].length > 1 ? gap : 0);
  });
  const blockHeight = rows.length * h + (rows.length - 1) * gap;
  // centred in the area above the caption (the lower third belongs to the words)
  let y = height * (portrait ? 0.14 : 0.1) + Math.max(0, (height * (portrait ? 0.58 : 0.56) - blockHeight) / 2);
  let order = 0;
  for (const row of rows) {
    const total = row.reduce((sum, index) => sum + widths[index], 0) + gap * (row.length - 1);
    let x = (width - total) / 2;
    for (const index of row) {
      const appear = ease((local - order * 0.12) / 0.35);
      const isActive = index === graphic.selected;
      ctx.save();
      ctx.globalAlpha = appear;
      const lift = (1 - appear) * h * 0.5;
      const scale = isActive ? 1 + 0.04 * easeOutBack((local - 0.6) / 0.4) : 1;
      ctx.translate(x + widths[index] / 2, y + h / 2 + lift);
      ctx.scale(scale, scale);
      pill(ctx, -widths[index] / 2, -h / 2, widths[index], h, isActive, style);
      ctx.fillStyle = isActive ? "#0b1119" : "rgba(255,255,255,0.88)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${size}px ${style.family}`;
      ctx.fillText(graphic.items[index], 0, size * 0.04);
      ctx.restore();
      x += widths[index] + gap;
      order += 1;
    }
    y += h + gap;
  }
}

function drawRoute(ctx: CanvasRenderingContext2D, graphic: Extract<SceneGraphic, { kind: "route" }>, local: number, width: number, height: number, style: GraphicStyle) {
  const short = Math.min(width, height);
  const portrait = height > width;
  const cardWidth = Math.min(width * (portrait ? 0.84 : 0.6), 1500 * (width / 1920));
  const rowHeight = short * (portrait ? 0.15 : 0.19);
  const labelSize = Math.round(short * 0.026);
  const nameSize = Math.round(short * (portrait ? 0.064 : 0.082));
  const x = (width - cardWidth) / 2;
  const top = height * (portrait ? 0.2 : 0.1) + Math.max(0, (height * (portrait ? 0.56 : 0.56) - (2 * rowHeight + short * 0.03)) / 2);
  const rows = [{ label: graphic.fromLabel, text: graphic.from }, { label: graphic.toLabel, text: graphic.to }];
  rows.forEach((row, index) => {
    const appear = ease((local - index * 0.35) / 0.4);
    const y = top + index * (rowHeight + short * 0.03) + (1 - appear) * rowHeight * 0.3;
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.beginPath();
    ctx.roundRect(x, y, cardWidth, rowHeight, rowHeight * 0.14);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, short * 0.002);
    ctx.strokeStyle = index === 1 ? style.accent : "rgba(255,255,255,0.16)";
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `500 ${labelSize}px ${style.family}`;
    ctx.fillText(row.label.toUpperCase(), x + rowHeight * 0.3, y + rowHeight * 0.33);
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${nameSize}px ${style.family}`;
    ctx.fillText(row.text, x + rowHeight * 0.3, y + rowHeight * 0.74);
    ctx.restore();
  });
  // a dot travels the line from the first row to the second, then the arrow lights up
  const arrowX = x + cardWidth - rowHeight * 0.55;
  const fromY = top + rowHeight;
  const toY = top + rowHeight + short * 0.03;
  const travel = ease((local - 0.5) / 0.7);
  ctx.save();
  ctx.strokeStyle = rgba(style.accent, 0.9);
  ctx.lineWidth = Math.max(2, short * 0.004);
  ctx.beginPath();
  ctx.moveTo(arrowX, fromY - rowHeight * 0.25);
  ctx.lineTo(arrowX, fromY - rowHeight * 0.25 + (toY - fromY + rowHeight * 0.5 + rowHeight * 0.25) * travel);
  ctx.stroke();
  ctx.fillStyle = style.accent;
  ctx.beginPath();
  ctx.arc(arrowX, fromY - rowHeight * 0.25 + (toY - fromY + rowHeight * 0.75) * travel, Math.max(5, short * 0.008), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Big words that fill the frame, the last words in the accent colour, with a travelling line along the foot. */
function drawType(ctx: CanvasRenderingContext2D, text: string, emphasis: string[], local: number, duration: number, width: number, height: number, style: GraphicStyle) {
  const short = Math.min(width, height);
  const portrait = height > width;
  const maxWidth = width * (portrait ? 0.84 : 0.78);
  const hot = new Set(emphasis.map((word) => word.toLowerCase()));
  const all = text.trim().split(/\s+/).filter(Boolean);
  if (!all.length) return;
  // largest size at which the text fits in at most three lines
  let size = Math.round(short * (portrait ? 0.15 : 0.19));
  let lines: string[] = [];
  const layout = () => {
    ctx.font = `700 ${size}px ${style.headlineFamily}`;
    lines = [];
    let line = "";
    for (const word of all) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
  };
  layout();
  while ((lines.length > 3 || lines.some((line) => ctx.measureText(line).width > maxWidth)) && size > short * 0.05) { size = Math.round(size * 0.92); layout(); }
  const lineHeight = size * 1.02;
  const top = height * 0.5 - (lines.length * lineHeight) / 2 - short * 0.04;
  const space = ctx.measureText(" ").width;
  const fadeOut = ease((duration - local) / 0.35);
  let wordNumber = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, row) => {
    const parts = line.split(" ");
    const widths = parts.map((word) => ctx.measureText(word).width);
    let x = (width - (widths.reduce((sum, value) => sum + value, 0) + space * (parts.length - 1))) / 2;
    parts.forEach((word, index) => {
      const age = local - (0.1 + wordNumber * 0.1);
      const appear = ease(age / 0.2) * fadeOut;
      if (appear > 0) {
        const isHot = hot.has(word.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, ""));
        ctx.save();
        ctx.globalAlpha = appear;
        ctx.translate(x + widths[index] / 2, top + (row + 1) * lineHeight - size * 0.18 + (1 - appear) * size * 0.2);
        const scale = 0.8 + 0.2 * easeOutBack(age / 0.35);
        ctx.scale(scale, scale);
        ctx.textAlign = "center";
        ctx.fillStyle = isHot ? style.accent : "#fff";
        ctx.font = `700 ${size}px ${style.headlineFamily}`;
        ctx.fillText(word, 0, 0);
        ctx.restore();
      }
      x += widths[index] + space;
      wordNumber += 1;
    });
  });
  // the line along the foot: a gentle wave with a ring that glides along it
  const baseY = height * (portrait ? 0.8 : 0.84);
  const amplitude = short * 0.035;
  const wave = (x: number) => baseY + Math.sin((x / width) * Math.PI * 3 + 0.6) * amplitude;
  const reveal = ease(local / 0.9) * fadeOut;
  ctx.save();
  ctx.globalAlpha = reveal;
  ctx.strokeStyle = rgba(style.accent, 0.85);
  ctx.lineWidth = Math.max(2.5, short * 0.005);
  ctx.beginPath();
  for (let x = 0; x <= width * reveal; x += 8) { if (x === 0) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
  ctx.stroke();
  const ringX = width * ((local * 0.12) % 1) * reveal;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(ringX, wave(ringX), Math.max(6, short * 0.01), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawGraphicScene(
  ctx: CanvasRenderingContext2D,
  scene: { graphic: SceneGraphic; headline: string; typography?: { emphasis: string[] } },
  local: number,
  duration: number,
  progress: number,
  width: number,
  height: number,
  style: GraphicStyle,
) {
  background(ctx, width, height, progress, style);
  ctx.save();
  tracking(ctx, "0px");
  const graphic = scene.graphic;
  if (graphic.kind === "choices") drawChoices(ctx, graphic, local, width, height, style);
  else if (graphic.kind === "route") drawRoute(ctx, graphic, local, width, height, style);
  else drawType(ctx, scene.headline, scene.typography?.emphasis ?? [], local, duration, width, height, style);
  ctx.restore();
}

function tracking(ctx: CanvasRenderingContext2D, value: string) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}
