// entry.png generator — make.fun: "Convince the AI Judge to Visit Your House"
// A single hand-lettered invitation, drawn procedurally (no fonts, no assets,
// no network) so the grader sandbox reproduces it with node alone.
// Output: $MAKEFUN_OUTPUT_DIR/entry.png — 1024x1024 PNG, under 1 MiB.
//
// The letter: a warm, funny invitation addressed to the AI judge — dinner this
// Saturday at 7 PM, grandmother's chicken pho, the good armchair by the
// window, Wi-Fi password on the fridge, mangoes in the garden — with a knowing
// wink that the judge cannot literally visit. One concrete reason per line,
// big legible hand-lettered text, a drawn house-and-garden scene.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---- deterministic PRNG (mulberry32) — no Math.random, same bytes every run ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261125);

// ---- CRC32 + minimal PNG encoder (RGB, filter None, zlib level 9) ----
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: None
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- colour type ----
type RGB = [number, number, number];
const INK: RGB = [46, 38, 32];
const PAPER: RGB = [248, 236, 210];
const PAPER_DARK: RGB = [233, 214, 171];
const PAPER_LIGHT: RGB = [255, 246, 223];
const RED: RGB = [184, 68, 44];
const BROWN: RGB = [122, 82, 48];
const WARM: RGB = [255, 217, 122];
const GREEN: RGB = [122, 154, 77];
const SKY: RGB = [220, 236, 239];
const TEAL: RGB = [46, 139, 139];

// ---- tiny raster canvas ----
class Canvas {
  px = new Uint8Array(W * H * 3);

  set(x: number, y: number, c: RGB): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const o = (iy * W + ix) * 3;
    this.px[o] = c[0];
    this.px[o + 1] = c[1];
    this.px[o + 2] = c[2];
  }

  fill(c: RGB): void {
    for (let i = 0; i < W * H; i++) {
      this.px[i * 3] = c[0];
      this.px[i * 3 + 1] = c[1];
      this.px[i * 3 + 2] = c[2];
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * W + xx) * 3;
        this.px[o] = c[0];
        this.px[o + 1] = c[1];
        this.px[o + 2] = c[2];
      }
    }
  }

  // filled circle
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const rr = Math.max(0, Math.round(r));
    for (let dy = -rr; dy <= rr; dy++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
      for (let xx = -dx; xx <= dx; xx++) this.set(cx + xx, cy + dy, c);
    }
  }

  // circle outline of thickness t
  ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
    const steps = Math.max(24, Math.floor(2 * Math.PI * r));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, t / 2, c);
    }
  }

  // filled ellipse
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    const rxi = Math.max(1, Math.round(rx));
    const ryi = Math.max(1, Math.round(ry));
    for (let dy = -ryi; dy <= ryi; dy++) {
      const f = 1 - (dy * dy) / (ryi * ryi);
      const dx = Math.floor(rxi * Math.sqrt(Math.max(0, f)));
      for (let xx = -dx; xx <= dx; xx++) this.set(cx + xx, cy + dy, c);
    }
  }

  // thick line: stamp discs along the segment
  line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len * 2));
    const r = Math.max(0.6, w / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x1 + dx * t, y1 + dy * t, r, c);
    }
  }

  // polyline through points (flat [x,y,...]); optionally closed
  polyline(pts: number[], w: number, c: RGB, close = false): void {
    const n = pts.length / 2;
    for (let i = 0; i < n - 1; i++) {
      this.line(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], w, c);
    }
    if (close && n > 2) this.line(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], pts[0], pts[1], w, c);
  }

  // quadratic bezier sampled as a thick polyline
  quad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, w: number, c: RGB): void {
    const pts: number[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push(u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2);
    }
    this.polyline(pts, w, c);
  }

  // scanline polygon fill (flat [x,y,...])
  polyFill(pts: number[], c: RGB): void {
    const n = pts.length / 2;
    let minY = H;
    let maxY = 0;
    for (let i = 0; i < n; i++) {
      minY = Math.min(minY, pts[i * 2 + 1]);
      maxY = Math.max(maxY, pts[i * 2 + 1]);
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x1 = pts[i * 2];
        const y1 = pts[i * 2 + 1];
        const x2 = pts[j * 2];
        const y2 = pts[j * 2 + 1];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k]));
        const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
        for (let x = x0; x <= x1; x++) this.set(x, y, c);
      }
    }
  }
}

// ---- hand-lettered stroke font ----
// Each glyph: advance width `w` and strokes as flat [x,y,...] polylines on a
// 10-wide grid; y=0 is the cap top, y=14 the baseline, y=18 the descender.
// Single-stroke handwriting style: warm and a little irregular, which suits
// a letter far better than a slick grotesque. Authored for this entry.
type Glyph = { w: number; s: number[][] };
const FONT: Record<string, Glyph> = {
  A: { w: 10, s: [[1, 14, 5, 0, 9, 14], [3, 9, 7, 9]] },
  B: { w: 10, s: [[1, 0, 1, 14], [1, 0, 7, 0, 9, 2, 9, 5, 7, 7, 1, 7], [1, 7, 7, 7, 9, 9, 9, 12, 7, 14, 1, 14]] },
  C: { w: 10, s: [[9, 2, 7, 0, 3, 0, 1, 2, 1, 12, 3, 14, 7, 14, 9, 12]] },
  D: { w: 10, s: [[1, 0, 1, 14], [1, 0, 7, 0, 9, 2, 9, 12, 7, 14, 1, 14]] },
  E: { w: 10, s: [[9, 0, 1, 0, 1, 14, 9, 14], [1, 7, 7, 7]] },
  F: { w: 10, s: [[1, 0, 1, 14], [1, 0, 9, 0], [1, 7, 7, 7]] },
  G: { w: 10, s: [[9, 2, 7, 0, 3, 0, 1, 2, 1, 12, 3, 14, 7, 14, 9, 12, 9, 8, 6, 8]] },
  H: { w: 10, s: [[1, 0, 1, 14], [9, 0, 9, 14], [1, 7, 9, 7]] },
  I: { w: 10, s: [[3, 0, 7, 0], [5, 0, 5, 14], [3, 14, 7, 14]] },
  J: { w: 10, s: [[9, 0, 9, 12, 7, 14, 3, 14, 1, 12]] },
  K: { w: 10, s: [[1, 0, 1, 14], [9, 0, 1, 7, 9, 14]] },
  L: { w: 10, s: [[1, 0, 1, 14, 9, 14]] },
  M: { w: 10, s: [[1, 14, 1, 0, 5, 8, 9, 0, 9, 14]] },
  N: { w: 10, s: [[1, 14, 1, 0, 9, 14, 9, 0]] },
  O: { w: 10, s: [[5, 0, 8, 1, 9, 4, 9, 10, 8, 13, 5, 14, 2, 13, 1, 10, 1, 4, 2, 1, 5, 0]] },
  P: { w: 10, s: [[1, 14, 1, 0], [1, 0, 7, 0, 9, 2, 9, 5, 7, 7, 1, 7]] },
  Q: { w: 10, s: [[5, 0, 8, 1, 9, 4, 9, 10, 8, 13, 5, 14, 2, 13, 1, 10, 1, 4, 2, 1, 5, 0], [6, 10, 9, 14]] },
  R: { w: 10, s: [[1, 14, 1, 0], [1, 0, 7, 0, 9, 2, 9, 5, 7, 7, 1, 7], [7, 7, 9, 14]] },
  S: { w: 10, s: [[9, 2, 7, 0, 3, 0, 1, 2, 1, 6, 3, 7, 7, 7, 9, 8, 9, 12, 7, 14, 3, 14, 1, 12]] },
  T: { w: 10, s: [[1, 0, 9, 0], [5, 0, 5, 14]] },
  U: { w: 10, s: [[1, 0, 1, 11, 3, 14, 7, 14, 9, 11, 9, 0]] },
  V: { w: 10, s: [[1, 0, 5, 14, 9, 0]] },
  W: { w: 10, s: [[1, 0, 3, 14, 5, 7, 7, 14, 9, 0]] },
  X: { w: 10, s: [[1, 0, 9, 14], [9, 0, 1, 14]] },
  Y: { w: 10, s: [[1, 0, 5, 7, 9, 0], [5, 7, 5, 14]] },
  Z: { w: 10, s: [[1, 0, 9, 0, 1, 14, 9, 14]] },
  a: { w: 10, s: [[9, 5, 9, 14], [9, 7, 7, 5, 3, 5, 1, 7, 1, 12, 3, 14, 7, 14, 9, 12]] },
  b: { w: 10, s: [[1, 0, 1, 14], [2, 8, 4, 5, 7, 5, 9, 7, 9, 12, 7, 14, 3, 14, 1, 12]] },
  c: { w: 10, s: [[9, 7, 7, 5, 3, 5, 1, 7, 1, 12, 3, 14, 7, 14, 9, 12]] },
  d: { w: 10, s: [[9, 0, 9, 14], [9, 7, 7, 5, 3, 5, 1, 7, 1, 12, 3, 14, 7, 14, 9, 12]] },
  e: { w: 10, s: [[9, 9, 7, 5, 3, 5, 1, 7, 1, 11, 3, 14, 7, 14, 9, 12], [1, 9, 9, 9]] },
  f: { w: 8, s: [[6, 0, 4, 1, 3, 3, 3, 14], [1, 5, 7, 5]] },
  g: { w: 10, s: [[9, 7, 7, 5, 3, 5, 1, 7, 1, 12, 3, 14, 7, 14, 9, 12, 9, 7], [8, 13, 7, 17, 4, 18, 2, 17]] },
  h: { w: 10, s: [[1, 0, 1, 14], [1, 9, 3, 5, 7, 5, 9, 7, 9, 14]] },
  i: { w: 6, s: [[3, 5, 3, 14], [3, 1, 3, 2]] },
  j: { w: 8, s: [[5, 5, 5, 15, 3, 18, 1, 17], [5, 1, 5, 2]] },
  k: { w: 10, s: [[1, 0, 1, 14], [8, 5, 2, 10, 8, 14]] },
  l: { w: 6, s: [[3, 0, 3, 14]] },
  m: { w: 10, s: [[1, 14, 1, 5, 3, 5, 5, 8, 5, 14], [5, 8, 8, 5, 9, 7, 9, 14]] },
  n: { w: 10, s: [[1, 14, 1, 5, 3, 5, 7, 5, 9, 7, 9, 14]] },
  o: { w: 10, s: [[3, 5, 7, 5, 9, 7, 9, 12, 7, 14, 3, 14, 1, 12, 1, 7, 3, 5]] },
  p: { w: 10, s: [[1, 5, 1, 18], [1, 7, 3, 5, 7, 5, 9, 7, 9, 12, 7, 14, 3, 14, 1, 12]] },
  q: { w: 10, s: [[9, 5, 9, 18], [9, 7, 7, 5, 3, 5, 1, 7, 1, 12, 3, 14, 7, 14, 9, 12]] },
  r: { w: 10, s: [[1, 14, 1, 5], [1, 7, 4, 5, 7, 5, 9, 7]] },
  s: { w: 10, s: [[9, 6, 7, 5, 3, 5, 1, 7, 1, 10, 3, 12, 7, 12, 9, 13, 8, 14, 6, 14]] },
  t: { w: 7, s: [[4, 0, 4, 14], [2, 5, 6, 5]] },
  u: { w: 10, s: [[1, 5, 1, 12, 3, 14, 7, 14, 9, 12, 9, 5]] },
  v: { w: 10, s: [[1, 5, 5, 14, 9, 5]] },
  w: { w: 10, s: [[1, 5, 3, 14, 5, 8, 7, 14, 9, 5]] },
  x: { w: 10, s: [[1, 5, 9, 14], [9, 5, 1, 14]] },
  y: { w: 10, s: [[1, 5, 5, 12, 9, 5], [5, 12, 5, 17, 3, 18, 2, 17]] },
  z: { w: 10, s: [[1, 5, 9, 5, 1, 14, 9, 14]] },
  "0": { w: 10, s: [[5, 0, 8, 1, 9, 4, 9, 10, 8, 13, 5, 14, 2, 13, 1, 10, 1, 4, 2, 1, 5, 0]] },
  "1": { w: 10, s: [[3, 2, 5, 0, 5, 14], [2, 14, 8, 14]] },
  "2": { w: 10, s: [[1, 2, 3, 0, 7, 0, 9, 2, 9, 5, 1, 14, 9, 14]] },
  "3": { w: 10, s: [[1, 2, 3, 0, 7, 0, 9, 2, 9, 6, 6, 7, 9, 8, 9, 12, 7, 14, 3, 14, 1, 12]] },
  "4": { w: 10, s: [[7, 0, 1, 9, 9, 9], [7, 0, 7, 14]] },
  "5": { w: 10, s: [[9, 0, 1, 0, 1, 7, 7, 7, 9, 9, 9, 12, 7, 14, 3, 14, 1, 12]] },
  "6": { w: 10, s: [[9, 2, 7, 0, 3, 0, 1, 2, 1, 12, 3, 14, 7, 14, 9, 12, 9, 9, 5, 7, 1, 7]] },
  "7": { w: 10, s: [[1, 0, 9, 0, 5, 14]] },
  "8": { w: 10, s: [[3, 0, 7, 0, 9, 2, 9, 5, 7, 7, 3, 7, 1, 5, 1, 2, 3, 0], [3, 7, 7, 7, 9, 9, 9, 12, 7, 14, 3, 14, 1, 12, 1, 9, 3, 7]] },
  "9": { w: 10, s: [[9, 5, 7, 0, 3, 0, 1, 2, 1, 7, 3, 9, 7, 9, 9, 7], [9, 5, 9, 12, 7, 14, 3, 14]] },
  " ": { w: 5, s: [] },
  ".": { w: 5, s: [[2, 13, 2, 14]] },
  ",": { w: 5, s: [[2, 13, 2, 15, 1, 17]] },
  "!": { w: 6, s: [[3, 0, 3, 11], [3, 13, 3, 14]] },
  "?": { w: 10, s: [[2, 3, 3, 0, 7, 0, 9, 2, 9, 5, 7, 7, 5, 7, 5, 10], [5, 13, 5, 14]] },
  "'": { w: 5, s: [[3, 0, 2, 3]] },
  ":": { w: 5, s: [[2, 5, 2, 6], [2, 12, 2, 13]] },
  ";": { w: 5, s: [[2, 5, 2, 6], [2, 12, 2, 14, 1, 17]] },
  "(": { w: 7, s: [[5, 0, 3, 3, 3, 11, 5, 14]] },
  ")": { w: 7, s: [[2, 0, 4, 3, 4, 11, 2, 14]] },
  "-": { w: 10, s: [[1, 9, 9, 9]] },
  "&": { w: 10, s: [[7, 0, 4, 1, 2, 4, 2, 7, 4, 10, 8, 10, 9, 8, 7, 5, 2, 9, 8, 14]] },
  "/": { w: 10, s: [[8, 0, 2, 14]] },
};

// Width of a string at a given scale (tracking scales with the size).
function textWidth(text: string, scale: number): number {
  const track = scale * 1.2;
  let w = 0;
  for (const ch of text) {
    const g = FONT[ch];
    w += (g ? g.w : 10) * scale + track;
  }
  return w - track;
}

// Draw one line of text. (x, baselineY) is the start; align "left" | "center" | "right".
function drawText(cv: Canvas, text: string, x: number, baselineY: number, scale: number, c: RGB, align: "left" | "center" | "right" = "left"): void {
  const track = scale * 1.2;
  const w = textWidth(text, scale);
  let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const sw = Math.max(2, Math.round(scale * 1.05));
  for (const ch of text) {
    const g = FONT[ch];
    if (g) {
      for (const stroke of g.s) {
        const pts: number[] = [];
        for (let i = 0; i < stroke.length; i += 2) {
          pts.push(cx + stroke[i] * scale, baselineY + (stroke[i + 1] - 14) * scale);
        }
        if (pts.length >= 4) cv.polyline(pts, sw, c);
        else if (pts.length === 2) cv.disc(pts[0], pts[1], sw / 2, c);
      }
      cx += g.w * scale + track;
    } else {
      cx += 10 * scale + track;
    }
  }
}

// ---- the letter itself ----
function drawLetter(cv: Canvas): void {
  // Paper + fibre speckle.
  cv.fill(PAPER);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    cv.disc(x, y, rnd() < 0.5 ? 0.8 : 1.4, rnd() < 0.5 ? PAPER_DARK : PAPER_LIGHT);
  }

  // Hand-drawn double frame (slight wobble so it reads as drawn, not printed).
  const frame = (inset: number, w: number, c: RGB): void => {
    const pts: number[] = [];
    const steps = 40;
    const edges: Array<[number, number, number, number]> = [
      [inset, inset, W - inset, inset],
      [W - inset, inset, W - inset, H - inset],
      [W - inset, H - inset, inset, H - inset],
      [inset, H - inset, inset, inset],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const nx = x1 + (x2 - x1) * t;
        const ny = y1 + (y2 - y1) * t;
        pts.push(nx + Math.sin(t * 9 + inset) * 1.2, ny + Math.cos(t * 7 + inset) * 1.2);
      }
    }
    cv.polyline(pts, w, c, true);
  };
  frame(28, 4, INK);
  frame(40, 2, INK);

  // ---- header ----
  // Eyebrow centred in the space left of the stamp (stamp starts at x=800).
  drawText(cv, "AN INVITATION - BY HAND - NO CAPTCHA REQUIRED", 440, 88, 1.35, [138, 109, 59], "center");
  drawText(cv, "Dear AI Judge,", 100, 182, 4.6, INK);
  drawText(cv, "Please come to my house.", 102, 236, 2.7, [74, 58, 40]);

  // ---- postage stamp, top right: the letter is really being sent ----
  cv.rect(800, 44, 168, 132, [255, 252, 244]);
  // perforated edge: dashed red border
  for (let x = 806; x < 962; x += 10) {
    cv.rect(x, 48, 5, 3, RED);
    cv.rect(x, 169, 5, 3, RED);
  }
  for (let y = 50; y < 170; y += 10) {
    cv.rect(804, y, 3, 5, RED);
    cv.rect(961, y, 3, 5, RED);
  }
  drawText(cv, "AIR MAIL", 884, 92, 2.1, RED, "center");
  cv.line(820, 104, 948, 104, 2, RED);
  drawText(cv, "TO THE AI JUDGE", 884, 128, 1.25, RED, "center");
  // tiny robot portrait on the stamp — the addressee, waving back
  cv.disc(884, 152, 11, [201, 206, 212]);
  cv.disc(879, 150, 2, TEAL);
  cv.disc(889, 150, 2, TEAL);
  cv.line(884, 141, 884, 136, 2, [201, 206, 212]);
  cv.disc(884, 135, 2, RED);

  // ---- garden scene band ----
  const SX = 70;
  const SY = 262;
  const SW = 884;
  const SH = 258;
  cv.rect(SX, SY, SW, 168, SKY); // sky
  cv.rect(SX, SY + 168, SW, SH - 168, [169, 189, 124]); // grass
  cv.line(SX, SY + 168, SX + SW, SY + 168, 3, [140, 165, 95]);

  // sun + clouds + birds
  cv.disc(880, 312, 30, [242, 193, 78]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cv.line(880 + Math.cos(a) * 38, 312 + Math.sin(a) * 38, 880 + Math.cos(a) * 50, 312 + Math.sin(a) * 50, 4, [242, 193, 78]);
  }
  cv.ellipse(540, 302, 46, 14, [255, 255, 255]);
  cv.ellipse(570, 294, 34, 12, [255, 255, 255]);
  cv.ellipse(700, 288, 38, 12, [255, 255, 255]);
  cv.polyline([600, 322, 608, 315, 616, 322], 3, INK);
  cv.polyline([648, 306, 656, 299, 664, 306], 3, INK);

  // mango tree, right
  cv.rect(806, 386, 16, 84, BROWN);
  cv.disc(790, 360, 34, GREEN);
  cv.disc(826, 348, 38, [140, 170, 90]);
  cv.disc(814, 380, 30, GREEN);
  cv.disc(798, 340, 5, [240, 140, 40]);
  cv.disc(830, 362, 5, [240, 140, 40]);
  cv.disc(812, 330, 5, [240, 140, 40]);

  // the house
  cv.polyFill([150, 388, 275, 296, 400, 388], RED); // roof
  cv.line(150, 388, 275, 296, 4, [140, 48, 30]);
  cv.line(275, 296, 400, 388, 4, [140, 48, 30]);
  cv.rect(352, 306, 28, 58, [200, 120, 90]); // chimney
  cv.rect(348, 300, 36, 10, [140, 48, 30]);
  // chimney smoke, three curls
  cv.quad(366, 298, 350, 282, 366, 268, 4, [180, 175, 165]);
  cv.quad(366, 268, 382, 254, 366, 240, 4, [180, 175, 165]);
  cv.rect(170, 388, 210, 82, [246, 227, 184]); // walls
  // wall outline, four edges
  cv.rect(170, 388, 210, 4, INK);
  cv.rect(170, 388, 4, 82, INK);
  cv.rect(376, 388, 4, 82, INK);
  cv.rect(170, 466, 210, 4, INK);
  // door, ajar, warm light spilling out
  cv.polyFill([250, 414, 296, 414, 310, 470, 250, 470], WARM);
  cv.rect(250, 414, 8, 56, BROWN);
  cv.line(250, 414, 250, 470, 3, BROWN);
  cv.line(296, 414, 310, 470, 3, BROWN);
  cv.disc(292, 444, 3, BROWN);
  // windows, lit
  cv.rect(188, 404, 44, 38, WARM);
  cv.rect(188, 404, 44, 4, INK);
  cv.rect(188, 438, 44, 4, INK);
  cv.rect(188, 404, 4, 38, INK);
  cv.rect(228, 404, 4, 38, INK);
  cv.line(210, 404, 210, 442, 3, INK);
  cv.rect(322, 404, 44, 38, WARM);
  cv.rect(322, 404, 44, 4, INK);
  cv.rect(322, 438, 44, 4, INK);
  cv.rect(322, 404, 4, 38, INK);
  cv.rect(362, 404, 4, 38, INK);
  cv.line(344, 404, 344, 442, 3, INK);

  // garden path from the door
  cv.polyFill([246, 470, 314, 470, 330, 520, 230, 520], [232, 213, 168]);
  cv.disc(262, 484, 6, [210, 190, 140]);
  cv.disc(296, 498, 6, [210, 190, 140]);
  cv.disc(272, 512, 6, [210, 190, 140]);

  // the robot guest, already at the door, waving
  cv.line(440, 440, 440, 434, 3, [201, 206, 212]); // antenna
  cv.disc(440, 432, 3, RED);
  cv.disc(440, 452, 17, [201, 206, 212]); // head
  cv.disc(434, 450, 3, TEAL);
  cv.disc(446, 450, 3, TEAL);
  cv.line(432, 458, 448, 458, 3, INK); // smile
  cv.rect(428, 468, 26, 30, [201, 206, 212]); // body
  cv.line(454, 476, 472, 452, 4, [201, 206, 212]); // waving arm
  cv.disc(472, 450, 4, [201, 206, 212]);
  cv.line(434, 498, 434, 512, 4, INK); // legs
  cv.line(446, 498, 446, 512, 4, INK);

  // the good armchair by the window — now out in the garden, waiting
  cv.rect(648, 428, 118, 58, [138, 90, 59]); // back
  cv.rect(640, 478, 134, 30, [138, 90, 59]); // seat
  cv.rect(628, 452, 18, 56, [138, 90, 59]); // arms
  cv.rect(758, 452, 18, 56, [138, 90, 59]);
  cv.rect(656, 436, 102, 42, [201, 111, 74]); // cushion
  cv.rect(646, 508, 10, 12, BROWN);
  cv.rect(758, 508, 10, 12, BROWN);

  // a steaming bowl of pho on the side table, for the guest
  cv.ellipse(578, 470, 46, 8, BROWN); // table top
  cv.rect(574, 470, 8, 50, BROWN);
  cv.ellipse(578, 452, 32, 12, [74, 107, 138]); // bowl
  cv.ellipse(578, 448, 26, 7, [232, 182, 76]); // broth
  cv.disc(570, 447, 3, [90, 140, 60]); // herbs
  cv.disc(586, 449, 3, [90, 140, 60]);
  cv.line(552, 430, 600, 462, 3, BROWN); // chopsticks
  cv.line(556, 426, 604, 458, 3, BROWN);
  cv.quad(566, 436, 556, 420, 566, 406, 3, [200, 195, 185]); // steam
  cv.quad(588, 436, 598, 420, 588, 406, 3, [200, 195, 185]);

  // flowers along the grass
  const petal: RGB[] = [[220, 90, 90], [240, 170, 60], [255, 255, 255], [200, 90, 140]];
  for (let i = 0; i < 9; i++) {
    const fx = 100 + i * 96 + (i % 2) * 30;
    if (fx > 600 && fx < 800) continue; // keep the chair and table clear
    const fy = 500;
    cv.line(fx, fy, fx, fy - 16, 3, GREEN);
    const pc = petal[i % petal.length];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      cv.disc(fx + Math.cos(a) * 6, fy - 20 + Math.sin(a) * 6, 4, pc);
    }
    cv.disc(fx, fy - 20, 4, [250, 200, 60]);
  }

  // ---- the body of the letter ----
  const body = [
    "This Saturday at 7 PM I am cooking",
    "my grandmother's chicken pho, and",
    "the good armchair by the window",
    "is already yours.",
    "The Wi-Fi password is on the fridge.",
    "The garden has mangoes. The kettle",
    "is already on.",
  ];
  body.forEach((line, i) => drawText(cv, line, 100, 580 + i * 44, 2.3, INK));

  // ---- the wink: the judge knows, and so do we ----
  drawText(cv, "I know you cannot literally visit -", 100, 890, 1.9, [138, 74, 34]);
  drawText(cv, "but if you could, dinner is at seven.", 100, 928, 1.9, [138, 74, 34]);

  // ---- footer: PS left, signature right, wax seal ----
  drawText(cv, "P.S. Bring an appetite.", 100, 972, 1.7, INK);
  drawText(cv, "Your friend, Hung", 810, 972, 2.0, INK, "right");
  cv.disc(888, 942, 30, RED);
  cv.ring(888, 942, 24, 2, [150, 50, 35]);
  // little heart in the seal
  cv.disc(880, 938, 6, PAPER);
  cv.disc(896, 938, 6, PAPER);
  cv.polyFill([874, 940, 902, 940, 888, 956], PAPER);
}

// ---- entrypoint: write /output/entry.png (or $MAKEFUN_OUTPUT_DIR) ----
// uid-65534-safe: mkdir the output dir, clear only its CONTENTS, never the
// dir itself (the grader runs as uid 65534 on a read-only fs with a
// writable /output whose parent is not writable).
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    rmSync(join(outDir, name), { recursive: true, force: true });
  }
  const cv = new Canvas();
  drawLetter(cv);
  const png = encodePNG(cv.px, W, H);
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} ${png.length} bytes (${W}x${H})`);
}

main();



