// Turn a drawing or a photo into the bytes a BNNX model reads (uint8, HWC). Pure array code, testable in Node.

/** Area-average resize of a single-channel image (Float64Array-like) from sw x sh to dw x dh. */
export function resizeArea(src, sw, sh, dw, dh) {
  const out = new Float64Array(dw * dh);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * fy;
    const y1 = y0 + fy;
    // The last edge can land a rounding error past the source (22 px to 20: y1 = 22.000000000000004); clamp it.
    const yEnd = Math.min(sh, Math.ceil(y1));
    for (let x = 0; x < dw; x++) {
      const x0 = x * fx;
      const x1 = x0 + fx;
      const xEnd = Math.min(sw, Math.ceil(x1));
      let sum = 0;
      for (let sy = Math.floor(y0); sy < yEnd; sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < xEnd; sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          sum += src[sy * sw + sx] * wx * wy;
        }
      }
      out[y * dw + x] = sum / (fx * fy);
    }
  }
  return out;
}

/**
 * MNIST-style digit from a single-channel ink image (0 = background, 255 = ink), width x height:
 * crop to the ink, scale the longer side to 20 px, and place it in 28 x 28 with its centre of mass in the middle,
 * as the MNIST images were made. Returns Uint8Array(784), all zeros for an empty drawing.
 */
export function mnistFromInk(ink, width, height) {
  let top = height, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x] > 16) {
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        left = Math.min(left, x); right = Math.max(right, x);
      }
    }
  }
  const out = new Uint8Array(28 * 28);
  if (bottom < 0) return out;
  const cw = right - left + 1;
  const ch = bottom - top + 1;
  const crop = new Float64Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) crop[y * cw + x] = ink[(top + y) * width + left + x];
  const scale = 20 / Math.max(cw, ch);
  const dw = Math.max(1, Math.round(cw * scale));
  const dh = Math.max(1, Math.round(ch * scale));
  const small = resizeArea(crop, cw, ch, dw, dh);
  let mass = 0, mx = 0, my = 0;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const v = small[y * dw + x];
      mass += v; mx += v * x; my += v * y;
    }
  }
  const ox = Math.round(14 - (mass ? mx / mass : dw / 2) - 0.5);
  const oy = Math.round(14 - (mass ? my / mass : dh / 2) - 0.5);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const tx = x + ox;
      const ty = y + oy;
      if (tx >= 0 && tx < 28 && ty >= 0 && ty < 28) out[ty * 28 + tx] = Math.min(255, Math.round(small[y * dw + x]));
    }
  }
  return out;
}

/** The red channel of RGBA canvas data (the drawing canvas paints white ink on black). */
export function inkFromRGBA(rgba, width, height) {
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) ink[i] = rgba[4 * i];
  return ink;
}

/** Centre-crop an RGBA image to a square and area-resize it to 32 x 32 RGB: Uint8Array(3072) in HWC order. */
export function cifarFromRGBA(rgba, width, height) {
  const side = Math.min(width, height);
  const left = Math.floor((width - side) / 2);
  const top = Math.floor((height - side) / 2);
  const out = new Uint8Array(32 * 32 * 3);
  for (let c = 0; c < 3; c++) {
    const plane = new Float64Array(side * side);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) plane[y * side + x] = rgba[4 * ((top + y) * width + left + x) + c];
    const small = resizeArea(plane, side, side, 32, 32);
    for (let i = 0; i < 32 * 32; i++) out[3 * i + c] = Math.min(255, Math.round(small[i]));
  }
  return out;
}

/** What the digit model actually sees after its first layer: 1 where pixel >= threshold (binarize_input). */
export function binarize(pixels, threshold = 128) {
  return Uint8Array.from(pixels, (v) => (v >= threshold ? 1 : 0));
}

/**
 * The bytes an imported model reads: `lut[p]` for every pixel p (the table in an `input-transform.json` written by
 * `bnnx import-qonnx`). `pixels` are uint8 values (0..255) in any order; the result is a Uint8Array of the same length.
 * Throws for a table that is not 256 integers in 0..255 and for a pixel outside 0..255 (a silent clamp would call the
 * model with the wrong input). The Python twin, `bnnx.qonnx.apply_input_lut`, takes uint8 arrays only; here any
 * integer in 0..255 is accepted.
 */
export function applyInputLut(pixels, lut) {
  if (lut == null || lut.length !== 256) throw new Error("an input transform needs 256 integers in 0..255");
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const v = lut[i];
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error("an input transform needs 256 integers in 0..255");
    table[i] = v;
  }
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    if (!Number.isInteger(p) || p < 0 || p > 255) throw new Error(`pixel ${i} is ${p}, expected an integer in 0..255`);
    out[i] = table[p];
  }
  return out;
}
