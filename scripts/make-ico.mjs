// Assembles a Windows .ico from PNG files (PNG-embedded ICO, Vista+).
// Usage: node scripts/make-ico.mjs <out.ico> <png16> <png32> ...
import { readFileSync, writeFileSync } from 'node:fs'

const [outPath, ...pngPaths] = process.argv.slice(2)
if (!outPath || pngPaths.length === 0) {
  console.error('usage: make-ico.mjs <out.ico> <png...>')
  process.exit(1)
}

const images = pngPaths.map((p) => {
  const data = readFileSync(p)
  // PNG IHDR width/height are big-endian uint32 at bytes 16 and 20.
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  return { data, width, height }
})

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(images.length, 4)

const entries = Buffer.alloc(16 * images.length)
let offset = 6 + entries.length
const blobs = []
images.forEach((img, i) => {
  const e = i * 16
  entries[e] = img.width >= 256 ? 0 : img.width // 0 means 256
  entries[e + 1] = img.height >= 256 ? 0 : img.height
  entries[e + 2] = 0 // color palette
  entries[e + 3] = 0 // reserved
  entries.writeUInt16LE(1, e + 4) // color planes
  entries.writeUInt16LE(32, e + 6) // bits per pixel
  entries.writeUInt32LE(img.data.length, e + 8)
  entries.writeUInt32LE(offset, e + 12)
  offset += img.data.length
  blobs.push(img.data)
})

writeFileSync(outPath, Buffer.concat([header, entries, ...blobs]))
console.log(`wrote ${outPath} (${images.length} sizes)`)
