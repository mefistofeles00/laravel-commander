// Generates the app icon master (1024×1024 PNG) from the brand marks:
// a warm-charcoal rounded square with the Laravel-flame `❯_` terminal prompt.
// Pure Node — no image libraries — so the icon is reproducible from source.
// Run: node scripts/generate-icon.mjs  (writes build/icon-master.png)
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SIZE = 1024
const SS = 4 // supersampling factor for anti-aliasing

// ---- brand ----
const CHARCOAL = [36, 31, 27] // #241f1b rounded-square background
const FLAME_TOP = [255, 107, 77] // #ff6b4d
const FLAME_BOTTOM = [226, 58, 34] // #e23a22
const CORNER = 224

// chevron `❯` polyline and stroke width (1024 space)
const P0 = [360, 296]
const P1 = [568, 512]
const P2 = [360, 728]
const STROKE = 104
// underscore cursor `_`
const CURSOR = { cx: 700, cy: 688, halfW: 75, halfH: 22, r: 22 }
// vertical extent the flame gradient spans
const GLYPH_TOP = 244
const GLYPH_BOTTOM = 780

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** Signed distance to a rounded box; <= 0 is inside. */
function sdRoundBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r)
  const qy = Math.abs(py - cy) - (halfH - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function sample(x, y) {
  // returns [r, g, b, a] in 0..255
  const insideBg = sdRoundBox(x, y, SIZE / 2, SIZE / 2, SIZE / 2, SIZE / 2, CORNER) <= 0
  const chevron =
    Math.min(distToSegment(x, y, ...P0, ...P1), distToSegment(x, y, ...P1, ...P2)) <= STROKE / 2
  const cursor = sdRoundBox(x, y, CURSOR.cx, CURSOR.cy, CURSOR.halfW, CURSOR.halfH, CURSOR.r) <= 0

  if (chevron || cursor) {
    const t = Math.max(0, Math.min(1, (y - GLYPH_TOP) / (GLYPH_BOTTOM - GLYPH_TOP)))
    return [
      Math.round(FLAME_TOP[0] + (FLAME_BOTTOM[0] - FLAME_TOP[0]) * t),
      Math.round(FLAME_TOP[1] + (FLAME_BOTTOM[1] - FLAME_TOP[1]) * t),
      Math.round(FLAME_TOP[2] + (FLAME_BOTTOM[2] - FLAME_TOP[2]) * t),
      255
    ]
  }
  if (insideBg) return [...CHARCOAL, 255]
  return [0, 0, 0, 0]
}

function render() {
  const out = Buffer.alloc(SIZE * SIZE * 4)
  const step = 1 / SS
  const offset = step / 2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let sa = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [r, g, b, a] = sample(x + sx * step + offset, y + sy * step + offset)
          const af = a / 255
          sr += r * af // premultiplied so transparent edges blend correctly
          sg += g * af
          sb += b * af
          sa += af
        }
      }
      const i = (y * SIZE + x) * 4
      const n = SS * SS
      const alpha = sa / n
      if (sa > 0) {
        out[i] = Math.round(sr / sa)
        out[i + 1] = Math.round(sg / sa)
        out[i + 2] = Math.round(sb / sa)
      }
      out[i + 3] = Math.round(alpha * 255)
    }
  }
  return out
}

// ---- minimal PNG encoder (truecolor + alpha) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // no filter
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const dir = dirname(fileURLToPath(import.meta.url))
const outPath = join(dir, '..', 'build', 'icon-master.png')
writeFileSync(outPath, encodePng(render(), SIZE))
console.log(`wrote ${outPath} (${SIZE}x${SIZE})`)
