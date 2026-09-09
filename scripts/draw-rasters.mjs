// Draws every raster this app ships, from the Block Chart's own palette, and stamps each one with
// where it came from. Nothing here is decoration borrowed from a template: the mark is the chart —
// five ruled columns rising left to right, the last one struck through with the marker — which is
// the same figure the week strip draws on the Today screen.
//
// Run: node scripts/draw-rasters.mjs
// Every output carries tEXt provenance (seed key, commit, date), so a raster can always be traced
// back to the source that drew it.

import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = join(ROOT, 'assets', 'images');

const SEED_KEY = 'c2b20aa3';
const FORM = 'The Block Chart';

/** Both palettes of src/constants/theme.ts, which is where these colours are law. */
const PALETTES = {
  light: {
    ground: [0xff, 0xff, 0xff],
    ink: [0x11, 0x11, 0x11],
    marker: [0xe8, 0xff, 0x3b],
    ramp: [
      [0xd4, 0xd4, 0xd4],
      [0xb0, 0xb0, 0xb0],
      [0x8a, 0x8a, 0x8a],
      [0x62, 0x62, 0x62],
      [0x3a, 0x3a, 0x3a],
    ],
  },
  dark: {
    ground: [0x0c, 0x0c, 0x0c],
    ink: [0xf2, 0xf2, 0xf2],
    marker: [0xe8, 0xff, 0x3b],
    ramp: [
      [0x2e, 0x2e, 0x2e],
      [0x48, 0x48, 0x48],
      [0x67, 0x67, 0x67],
      [0x90, 0x90, 0x90],
      [0xbe, 0xbe, 0xbe],
    ],
  },
};

const STEPS = PALETTES.light.ramp.length;

/** Column heights as a fraction of the mark, the shape of a week that builds toward its heavy day. */
const COLUMN_HEIGHTS = [0.26, 0.42, 0.58, 0.73, 0.88];
/** Gap as a fraction of a column, which is also what the marker shows either side of its band. */
const COLUMN_GAP = 0.5;
const BASELINE = 0.055;
const MARKER_EDGE = 0.014;

function canvas(size, fill) {
  const pixels = new Uint8Array(size * size * 4);
  if (fill) {
    for (let index = 0; index < size * size; index += 1) {
      pixels.set([...fill, 0xff], index * 4);
    }
  }
  return { size, pixels };
}

function rect({ size, pixels }, left, top, width, height, [r, g, b], alpha = 0xff) {
  const x0 = Math.max(0, Math.round(left));
  const y0 = Math.max(0, Math.round(top));
  const x1 = Math.min(size, Math.round(left + width));
  const y1 = Math.min(size, Math.round(top + height));

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      pixels.set([r, g, b, alpha], (y * size + x) * 4);
    }
  }
}

/**
 * The mark itself. `tone` decides how a column is filled: the load ramp for a full-colour raster,
 * or ink at the ramp's own alpha for a monochrome one, where Android tints the alpha channel.
 */
function drawMark(image, inset, { colour = true, palette = PALETTES.light } = {}) {
  const { ink, marker, ramp } = palette;
  const { size } = image;
  const left = size * inset;
  const span = size * (1 - inset * 2);
  const top = left;
  const baseline = top + span;
  const rule = span * BASELINE;
  // Each column owns an equal share of the mark, and stands its band in the middle of it. The
  // marker is one whole share wide, so it shows either side of the band it is struck across.
  const pitch = span / STEPS;
  const bandWidth = pitch / (1 + COLUMN_GAP);
  const bandInset = (pitch - bandWidth) / 2;
  const bodyHeight = span - rule;

  if (colour) {
    const markerLeft = left + pitch * (STEPS - 1);
    const edge = span * MARKER_EDGE;
    rect(image, markerLeft, top, pitch, span, marker);
    // The marker carries its ink edges here for the same reason the week strip does: on paper
    // white the fill alone is barely 1.1:1 against the ground, and the edge is what finds it.
    rect(image, markerLeft, top, edge, span, PALETTES.light.ink);
    rect(image, markerLeft + pitch - edge, top, edge, span, PALETTES.light.ink);
  }

  COLUMN_HEIGHTS.forEach((fraction, column) => {
    const height = bodyHeight * fraction;
    const tone = colour ? ramp[column] : ink;
    const alpha = colour ? 0xff : Math.round(((column + 1) / STEPS) * 0xff);
    const bandLeft = left + pitch * column + bandInset;
    rect(image, bandLeft, baseline - rule - height, bandWidth, height, tone, alpha);
  });

  rect(image, left, baseline - rule, span, rule, ink);
  return image;
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC = crcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function textChunk(keyword, value) {
  return chunk('tEXt', Buffer.from(`${keyword}\0${value}`, 'latin1'));
}

function encodePng({ size, pixels }, provenance) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // no filter: these are flat blocks, so filtering buys nothing
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...provenance.map(([keyword, value]) => textChunk(keyword, value)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function commit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  } catch {
    return 'unversioned';
  }
}

function provenanceFor(name) {
  const drawnAt = new Date().toISOString().slice(0, 10);
  return [
    ['Title', `HevyCoach — ${name}`],
    ['Software', 'scripts/draw-rasters.mjs'],
    ['Source', `${FORM}, seed key ${SEED_KEY}`],
    ['Creation Time', drawnAt],
    [
      'Comment',
      `${FORM} · seed key ${SEED_KEY} · commit ${commit()} · drawn ${drawnAt} · palette from src/constants/theme.ts`,
    ],
  ];
}

const LIGHT = PALETTES.light;
const DARK = PALETTES.dark;

const RASTERS = [
  { file: 'icon.png', size: 1024, ground: LIGHT.ground, inset: 0.19 },
  { file: 'splash-icon.png', size: 512, inset: 0.08 },
  { file: 'splash-icon-dark.png', size: 512, inset: 0.08, palette: DARK },
  { file: 'favicon.png', size: 64, ground: LIGHT.ground, inset: 0.12 },
  { file: 'android-icon-background.png', size: 432, ground: LIGHT.ground, inset: null },
  { file: 'android-icon-foreground.png', size: 432, inset: 0.27 },
  { file: 'android-icon-monochrome.png', size: 432, inset: 0.27, colour: false },
];

mkdirSync(IMAGES, { recursive: true });

for (const { file, size, ground = null, inset, colour = true, palette = LIGHT } of RASTERS) {
  const image = canvas(size, ground);
  if (inset !== null) {
    drawMark(image, inset, { colour, palette });
  }
  writeFileSync(join(IMAGES, file), encodePng(image, provenanceFor(file)));
  console.log(`drew ${file} at ${size}px`);
}
