/**
 * Generates every app icon and the in-app logo from one master artwork.
 *
 *   node scripts/generate-icons.mjs
 *
 * The master, `assets/brand/logo-source.png`, is the supplied logo: a cyan
 * speech bubble with an "A" and a black bubble with 文, on a transparent
 * background. Nothing here edits it; everything else is derived.
 *
 * Why each output is shaped the way it is:
 *
 * - The black in the artwork becomes the app's deep navy, so the mark matches
 *   the light UI it sits on. The cyan is left exactly as sampled (#0CC0DF).
 * - The Android launcher masks the foreground layer — to a circle on most
 *   phones — and only the central 66 of 108dp is guaranteed visible. The
 *   master's logo filled ~76% of its canvas, which is why the tails were cut
 *   off on the home screen. The foreground is now scaled so the farthest
 *   opaque pixel sits inside that safe circle.
 * - The monochrome layer is what Android 13+ draws for themed icons. It was
 *   still Expo's placeholder chevron; it is now the logo's own silhouette,
 *   with the "A" and 文 cut out so it still reads at a glance.
 * - `icon.png` is for iOS and pre-adaptive Android. iOS does not allow
 *   transparency (it fills it with black), so that one sits on white.
 *
 * Only `pngjs` is used: resampling is done here, in premultiplied alpha, so
 * edges against transparency do not pick up a dark halo.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import pngjs from 'pngjs';

const { PNG } = pngjs;

const SOURCE = 'assets/brand/logo-source.png';

const NAVY = [14, 19, 48]; // palette.sky[950]
const CYAN = [12, 192, 223]; // palette.brand[400], the logo's own cyan
const WHITE = [255, 255, 255];

/** Android's guaranteed-visible circle: 33dp radius of a 108dp layer. */
const ADAPTIVE_SAFE_RADIUS = 33 / 108;
/** A little inside it, so no launcher's mask ever touches the artwork. */
const ADAPTIVE_FILL = 0.94;

// ---------------------------------------------------------------------------
// Image plumbing: images are { width, height, data: Float32Array } holding
// premultiplied RGBA in 0..1, which is what makes resampling correct.

function load(path) {
  const png = PNG.sync.read(readFileSync(path));
  const data = new Float32Array(png.width * png.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    data[i] = (png.data[i] / 255) * a;
    data[i + 1] = (png.data[i + 1] / 255) * a;
    data[i + 2] = (png.data[i + 2] / 255) * a;
    data[i + 3] = a;
  }
  return { width: png.width, height: png.height, data };
}

function save(image, path) {
  const png = new PNG({ width: image.width, height: image.height });
  for (let i = 0; i < image.data.length; i += 4) {
    const a = image.data[i + 3];
    const un = (v) => Math.round(Math.min(1, a > 0 ? v / a : 0) * 255);
    png.data[i] = un(image.data[i]);
    png.data[i + 1] = un(image.data[i + 1]);
    png.data[i + 2] = un(image.data[i + 2]);
    png.data[i + 3] = Math.round(Math.min(1, a) * 255);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
  console.log(`wrote ${path} (${image.width}x${image.height})`);
}

function blank(width, height, rgb, alpha = 0) {
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (rgb[0] / 255) * alpha;
    data[i + 1] = (rgb[1] / 255) * alpha;
    data[i + 2] = (rgb[2] / 255) * alpha;
    data[i + 3] = alpha;
  }
  return { width, height, data };
}

/** Straight (non-premultiplied) 0..255 RGBA of one pixel. */
function straight(image, x, y) {
  const i = (y * image.width + x) * 4;
  const a = image.data[i + 3];
  if (a <= 0) return [0, 0, 0, 0];
  return [
    (image.data[i] / a) * 255,
    (image.data[i + 1] / a) * 255,
    (image.data[i + 2] / a) * 255,
    a,
  ];
}

function setStraight(image, x, y, rgb, a) {
  const i = (y * image.width + x) * 4;
  image.data[i] = (rgb[0] / 255) * a;
  image.data[i + 1] = (rgb[1] / 255) * a;
  image.data[i + 2] = (rgb[2] / 255) * a;
  image.data[i + 3] = a;
}

function crop(image, left, top, width, height) {
  const out = blank(width, height, [0, 0, 0]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x + left;
      const sy = y + top;
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
      const si = (sy * image.width + sx) * 4;
      const di = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = image.data[si + c];
    }
  }
  return out;
}

/** Area-averaging downscale, separable. Exact for any ratio below 1. */
function resize(image, width, height) {
  const pass = (src, sw, sh, dw, dh, horizontal) => {
    const out = new Float32Array(dw * dh * 4);
    const len = horizontal ? dw : dh;
    const srcLen = horizontal ? sw : sh;
    const ratio = srcLen / len;
    for (let d = 0; d < len; d++) {
      const start = d * ratio;
      const end = start + ratio;
      const weights = [];
      for (let s = Math.floor(start); s < Math.ceil(end); s++) {
        const w = Math.min(end, s + 1) - Math.max(start, s);
        if (w > 0 && s < srcLen) weights.push([s, w / ratio]);
      }
      const across = horizontal ? dh : dw;
      for (let k = 0; k < across; k++) {
        const di = horizontal ? (k * dw + d) * 4 : (d * dw + k) * 4;
        for (const [s, w] of weights) {
          const si = horizontal ? (k * sw + s) * 4 : (s * sw + k) * 4;
          for (let c = 0; c < 4; c++) out[di + c] += src[si + c] * w;
        }
      }
    }
    return out;
  };
  const wide = pass(image.data, image.width, image.height, width, image.height, true);
  const data = pass(wide, width, image.height, width, height, false);
  return { width, height, data };
}

/** Source-over, premultiplied. */
function composite(base, layer, left, top) {
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const bx = x + left;
      const by = y + top;
      if (bx < 0 || by < 0 || bx >= base.width || by >= base.height) continue;
      const li = (y * layer.width + x) * 4;
      const bi = (by * base.width + bx) * 4;
      const inv = 1 - layer.data[li + 3];
      for (let c = 0; c < 4; c++) base.data[bi + c] = layer.data[li + c] + base.data[bi + c] * inv;
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// The artwork.

const master = load(SOURCE);

/** Tight box around everything visible. */
function bounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0.04) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const box = bounds(master);

/**
 * The cyan bubble's circle, found from the artwork rather than typed in: its
 * leftmost and rightmost cyan pixels span the diameter (the tail hangs below,
 * inside that span), and its top is the circle's top.
 */
function cyanCircle(image) {
  let minX = image.width;
  let maxX = 0;
  let minY = image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = straight(image, x, y);
      if (a > 0.8 && r < 60 && g > 150 && b > 180) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
      }
    }
  }
  const radius = (maxX - minX) / 2;
  return { cx: minX + radius, cy: minY + radius, radius };
}

const circle = cyanCircle(master);

/**
 * Every pixel in the artwork is a blend of black with either white (the 文
 * glyph) or cyan (the bubble and the "A"'s edges). Recover which, and how
 * much, then re-blend with new colours in their place — so anti-aliased edges
 * stay smooth instead of turning into a grey fringe.
 *
 * Black means two different things: inside the cyan circle it is the "A";
 * outside it is the second bubble. They are recoloured separately, which is
 * what lets the dark-mode variant lighten the bubble without washing out the
 * "A" on cyan.
 */
function recolor(image, { bubble = NAVY, glyph = WHITE, letter = NAVY } = {}) {
  const out = blank(image.width, image.height, [0, 0, 0]);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = straight(image, x, y);
      if (a <= 0) continue;
      const inCyan = Math.hypot(x - circle.cx, y - circle.cy) < circle.radius;
      const dark = inCyan ? letter : bubble;
      const grey = Math.max(r, g, b) - Math.min(r, g, b) < 24;
      const toward = grey ? glyph : CYAN;
      const t = grey ? g / 255 : Math.min(1, g / CYAN[1]);
      const rgb = dark.map((n, c) => n + (toward[c] - n) * t);
      setStraight(out, x, y, rgb, a);
    }
  }
  return out;
}

/**
 * The themed-icon silhouette: both bubbles solid, the letters cut out.
 *
 * The "A" is the black inside the cyan circle (where the black bubble is
 * hidden behind the cyan one); 文 is the white inside the black bubble.
 *
 * In one colour the two bubbles would fuse into a single blob, so a thin gap
 * is cut into the back bubble along the front one's edge — the same trick a
 * hand-drawn glyph would use to keep overlapping shapes readable.
 */
function silhouette(image) {
  const gap = circle.radius * 0.07;
  const out = blank(image.width, image.height, WHITE);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = straight(image, x, y);
      if (a <= 0) continue;
      const distance = Math.hypot(x - circle.cx, y - circle.cy);
      const inCyan = distance < circle.radius;
      const grey = Math.max(r, g, b) - Math.min(r, g, b) < 24;
      let ink;
      if (grey) {
        // Soft-edged so the gap is anti-aliased like everything else.
        const clearance = Math.min(1, Math.max(0, (distance - circle.radius - gap) / 2));
        ink = inCyan ? 0 : (1 - g / 255) * clearance;
      } else {
        ink = inCyan ? Math.min(1, g / CYAN[1]) : 1;
      }
      setStraight(out, x, y, WHITE, a * ink);
    }
  }
  return out;
}

/** The logo cropped to its own bounds. */
const trim = (image) => crop(image, box.minX, box.minY, box.width, box.height);

const color = trim(recolor(master));
const mono = trim(silhouette(master));

/** Farthest visible pixel from the logo's centre, in trimmed-source pixels. */
function reach(image) {
  const cx = image.width / 2;
  const cy = image.height / 2;
  let far = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0.04) {
        far = Math.max(far, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
      }
    }
  }
  return far;
}

const logoReach = reach(color);

/** Scales the trimmed logo by `scale` and centres it on a canvas. */
function placed(logo, canvas, scale, background = { rgb: [0, 0, 0], alpha: 0 }) {
  const w = Math.round(logo.width * scale);
  const h = Math.round(logo.height * scale);
  const base = blank(canvas, canvas, background.rgb, background.alpha);
  return composite(
    base,
    resize(logo, w, h),
    Math.round((canvas - w) / 2),
    Math.round((canvas - h) / 2),
  );
}

/** Scales so the logo is `fraction` of the canvas wide. */
const widthScale = (canvas, fraction) => (canvas * fraction) / color.width;

// ---------------------------------------------------------------------------
// Outputs.

// Adaptive icon: foreground layer inside the safe circle, transparent.
const ADAPTIVE = 1024;
const adaptiveScale = (ADAPTIVE * ADAPTIVE_SAFE_RADIUS * ADAPTIVE_FILL) / logoReach;
save(placed(color, ADAPTIVE, adaptiveScale), 'assets/images/android-icon-foreground.png');
save(placed(mono, ADAPTIVE, adaptiveScale), 'assets/images/android-icon-monochrome.png');

// iOS and legacy Android: opaque, because iOS fills transparency with black.
save(
  placed(color, 1024, widthScale(1024, 0.72), { rgb: WHITE, alpha: 1 }),
  'assets/images/icon.png',
);

// Play Store listing icon (uploaded by hand): 512, opaque, Play rounds it.
save(
  placed(color, 512, widthScale(512, 0.72), { rgb: WHITE, alpha: 1 }),
  'assets/brand/play-store-icon-512.png',
);

// Splash: transparent, tight, so `imageWidth` in app.json is the logo's size.
save(placed(color, 1024, widthScale(1024, 0.96)), 'assets/images/splash-icon.png');

// Dark splash: the navy bubble would vanish on the dark background, so it
// turns light and its 文 turns navy. The "A" stays navy on cyan.
const LIGHT = [230, 237, 250]; // palette.sky[100]
save(
  placed(trim(recolor(master, { bubble: LIGHT, glyph: NAVY })), 1024, widthScale(1024, 0.96)),
  'assets/images/splash-icon-dark.png',
);

// Web favicon.
save(placed(color, 196, widthScale(196, 0.92)), 'assets/images/favicon.png');

// In-app mark: trimmed, transparent, sized for about 60pt at 3x.
const markWidth = 240;
save(
  resize(color, markWidth, Math.round((color.height * markWidth) / color.width)),
  'assets/images/logo-mark.png',
);
