// Normalize the "Explore the Catalogue" part photos to one identical square
// canvas so the landing-page card can use plain `object-cover` and always
// fill completely: no crop that cuts the part in half, and no letterbox
// dead space that reads as an empty gray box.
//
// Why pad instead of crop: cropping a 1.78:1 studio shot to 1:1 slices ~44%
// off the sides, which is exactly what made a bearing or U-joint
// unrecognizable. Padding adds canvas instead of removing part.
//
// Why this is seamless: every source photo is a dark studio shot with a
// near-uniform, vignetted backdrop. We build the pad by taking the photo's
// own outermost edge strip and stretching it outward, so the pad literally
// starts from the boundary pixels — there is no seam to see. A wide,
// one-dimensional blur across the stretched strip kills the vertical
// streaking that stretching a few pixels would otherwise produce.
//
// Run: node scripts/normalize-part-photos.mjs
// Sources live in assets-src/parts/ (untouched); output overwrites
// public/images/parts/. Re-runnable at any time — always reads the sources,
// never its own output, so repeated runs can't compound artifacts.

import { execFile } from 'node:child_process';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'assets-src', 'parts');
const OUT_DIR = join(ROOT, 'public', 'images', 'parts');

/** Final delivered size. Square, so every card is dimensionally identical. */
const SIZE = 1200;

/** Width of the edge strip sampled to build the pad, in source pixels. */
const EDGE_STRIP = 6;

/**
 * Per-image color grading, applied after padding.
 *
 * `brakes` is the one source that isn't a dark studio shot — it's a
 * real-world under-car snapshot with a warm red garage behind it. Left alone
 * it clashes badly with the other six. This pulls the saturation and the red
 * cast down and darkens it so it sits in the same tonal family as the rest.
 */
const GRADE = {
  brakes: 'eq=saturation=0.35:contrast=1.12:brightness=-0.10,colorbalance=rm=-0.10:rh=-0.12',
};

/**
 * Sources that must be cropped to square rather than padded.
 *
 * Edge-extension only disappears when the edge it copies is near-uniform.
 * `brakes` is shot in a cluttered garage, so stretching its left/right
 * columns smears the red workbench into obvious horizontal bands. Its
 * subject (the disc) is centred and fits inside a square, so cropping keeps
 * the whole part and loses only background clutter — the better trade here.
 * `y` is the top of the crop window in source pixels, chosen to keep the
 * full disc in frame.
 */
const CROP_TO_SQUARE = {
  brakes: { y: 145 },
};

async function probeSize(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    file,
  ]);
  const [width, height] = stdout.trim().split(',').map(Number);
  return { width, height };
}

/**
 * Build the ffmpeg filter chain that turns a W×H photo into a seamless
 * square. Landscape pads top+bottom, portrait pads left+right, and an
 * already-square source skips padding entirely.
 */
function buildFilter(width, height, grade, crop) {
  const target = Math.max(width, height);
  const steps = [];

  if (crop) {
    const side = Math.min(width, height);
    const x = Math.max(0, Math.min(crop.x ?? Math.floor((width - side) / 2), width - side));
    const y = Math.max(0, Math.min(crop.y ?? Math.floor((height - side) / 2), height - side));
    const tail = [`crop=${side}:${side}:${x}:${y}`, `scale=${SIZE}:${SIZE}:flags=lanczos`];
    if (grade) tail.push(grade);
    return `[0:v]${tail.join(',')}[out]`;
  }

  // A stream label can only be consumed once in an ffmpeg filter graph, and
  // this graph needs the source three times (top pad, body, bottom pad), so
  // it must be split explicitly first. Without the split the stacks silently
  // produce a mangled frame rather than erroring.
  if (width !== height) {
    steps.push('[0:v]split=3[body][edgeA][edgeB]');
  }

  if (width > height) {
    const total = target - height;
    const top = Math.floor(total / 2);
    const bottom = total - top;
    steps.push(
      `[edgeA]crop=${width}:${EDGE_STRIP}:0:0,scale=${width}:${top}:flags=bilinear,avgblur=sizeX=140:sizeY=1,eq=brightness=-0.055[top]`,
      `[edgeB]crop=${width}:${EDGE_STRIP}:0:${height - EDGE_STRIP},scale=${width}:${bottom}:flags=bilinear,avgblur=sizeX=140:sizeY=1,eq=brightness=-0.055[bot]`,
      `[top][body][bot]vstack=inputs=3[padded]`,
    );
  } else if (height > width) {
    const total = target - width;
    const left = Math.floor(total / 2);
    const right = total - left;
    steps.push(
      `[edgeA]crop=${EDGE_STRIP}:${height}:0:0,scale=${left}:${height}:flags=bilinear,avgblur=sizeX=1:sizeY=140,eq=brightness=-0.055[lft]`,
      `[edgeB]crop=${EDGE_STRIP}:${height}:${width - EDGE_STRIP}:0,scale=${right}:${height}:flags=bilinear,avgblur=sizeX=1:sizeY=140,eq=brightness=-0.055[rgt]`,
      `[lft][body][rgt]hstack=inputs=3[padded]`,
    );
  } else {
    steps.push('[0:v]null[padded]');
  }

  const tail = [`scale=${SIZE}:${SIZE}:flags=lanczos`];
  if (grade) tail.push(grade);

  steps.push(`[padded]${tail.join(',')}[out]`);
  return steps.join(';');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(SRC_DIR)).filter((f) => f.toLowerCase().endsWith('.jpg'));

  for (const file of files) {
    const name = file.replace(/\.jpg$/i, '');
    const src = join(SRC_DIR, file);
    const out = join(OUT_DIR, file);
    const tmp = join(OUT_DIR, `${name}.tmp.jpg`);

    const { width, height } = await probeSize(src);
    const crop = CROP_TO_SQUARE[name];
    const filter = buildFilter(width, height, GRADE[name], crop);

    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', src,
      '-filter_complex', filter,
      '-map', '[out]',
      '-q:v', '3',
      tmp,
    ]);
    await rename(tmp, out);

    const how = width === height ? 'already square' : crop ? 'cropped' : 'padded';
    console.log(
      `${file.padEnd(16)} ${String(`${width}x${height}`).padEnd(10)} → ${SIZE}x${SIZE}  ${how}${GRADE[name] ? ' + graded' : ''}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
