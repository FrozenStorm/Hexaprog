// Minimal animated GIF encoder (GIF89a, LZW, global palette, endless loop).
// No libraries: used by the AI Lab to save a short video of every game.

/**
 * @param {number} width
 * @param {number} height
 * @param {Array<[number, number, number]>} palette  up to 256 colours
 * @param {Array<{ pixels: Uint8Array, delay: number }>} frames  palette indices, delay in 1/100 s
 * @returns {Uint8Array}
 */
export function encodeGif(width, height, palette, frames) {
  let bits = 1;
  while ((1 << bits) < palette.length) bits++;
  const size = 1 << bits;
  const out = new ByteWriter();
  out.str("GIF89a");
  out.u16(width); out.u16(height);
  out.byte(0x80 | ((bits - 1) << 4) | (bits - 1)); // global colour table
  out.byte(0); out.byte(0);
  for (let i = 0; i < size; i++) {
    const c = palette[i] || [0, 0, 0];
    out.byte(c[0]); out.byte(c[1]); out.byte(c[2]);
  }
  // Netscape extension: loop forever.
  out.bytes([0x21, 0xff, 0x0b]); out.str("NETSCAPE2.0"); out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  const minCode = Math.max(2, bits);
  for (const f of frames) {
    out.bytes([0x21, 0xf9, 0x04, 0x04]); // graphic control: do not dispose
    out.u16(Math.max(2, Math.round(f.delay)));
    out.bytes([0x00, 0x00]);
    out.byte(0x2c); out.u16(0); out.u16(0); out.u16(width); out.u16(height); out.byte(0);
    out.byte(minCode);
    lzw(f.pixels, minCode, out);
  }
  out.byte(0x3b);
  return out.result();
}

function lzw(pixels, minCode, out) {
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize = minCode + 1, next = eoi + 1;
  let table = new Map();
  const sub = [];
  let acc = 0, accBits = 0;
  const emit = (code) => {
    acc |= code << accBits;
    accBits += codeSize;
    while (accBits >= 8) {
      sub.push(acc & 0xff);
      acc >>>= 8;
      accBits -= 8;
      if (sub.length === 255) { out.byte(255); out.bytes(sub); sub.length = 0; }
    }
  };
  emit(clear);
  let cur = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const keyv = (cur << 8) | k;
    const found = table.get(keyv);
    if (found !== undefined) { cur = found; continue; }
    emit(cur);
    if (next === 4096) {
      emit(clear);
      table = new Map();
      codeSize = minCode + 1;
      next = eoi + 1;
    } else {
      if (next >= (1 << codeSize)) codeSize++;
      table.set(keyv, next++);
    }
    cur = k;
  }
  emit(cur);
  emit(eoi);
  if (accBits > 0) { sub.push(acc & 0xff); if (sub.length === 255) { out.byte(255); out.bytes(sub); sub.length = 0; } }
  if (sub.length) { out.byte(sub.length); out.bytes(sub); }
  out.byte(0);
}

class ByteWriter {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  grow(k) {
    if (this.n + k <= this.buf.length) return;
    let len = this.buf.length * 2;
    while (len < this.n + k) len *= 2;
    const b = new Uint8Array(len);
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
  }
  byte(v) { this.grow(1); this.buf[this.n++] = v & 0xff; }
  u16(v) { this.byte(v & 0xff); this.byte(v >> 8); }
  bytes(a) { this.grow(a.length); for (let i = 0; i < a.length; i++) this.buf[this.n++] = a[i]; }
  str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.n); }
}
