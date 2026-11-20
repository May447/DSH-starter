#!/usr/bin/env node
/**
 * Generates the launcher icon without image tooling.
 *
 * Draws a rounded-square dark tile with the accent gradient and a terminal
 * prompt chevron, then writes a PNG (RGBA, 8-bit) byte for byte with zlib.
 * Run: node scripts/gen-icon.mjs [size] [out]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { deflateSync } from 'node:zlib'

const size = Number(process.argv[2] ?? 1024)
const out = process.argv[3] ?? 'build/icon.png'

const pixels = new Uint8Array(size * size * 4)

const accentA = [124, 140, 255]
const accentB = [176, 107, 255]
const tileTop = [18, 20, 30]
const tileBottom = [9, 10, 15]

const corner = size * 0.16
const inset = size * 0.06
const half = size / 2

/** Signed distance to a rounded rectangle (negative inside). */
function roundedRect(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius)
  const dy = Math.abs(py - cy) - (halfH - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - radius
}

/** Distance from a point to a line segment. */
function segment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1
  const vy = y2 - y1
  const wx = px - x1
  const wy = py - y1
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
  return Math.hypot(wx - vx * t, wy - vy * t)
}

const stroke = size * 0.055
const chevronTx = size * 0.42
const chevronTy = size * 0.5
const chevronSize = size * 0.17
const barX = size * 0.56
const barHalf = size * 0.11

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const index = (y * size + x) * 4
    const px = x + 0.5
    const py = y + 0.5

    // Cursor affordance: the whole tile is a rounded square.
    const tile = roundedRect(px, py, half, half, half - inset, half - inset, corner)
    if (tile > 0.6) continue

    // Vertical base gradient, slightly brighter at the top.
    const t = py / size
    const r = Math.round(tileTop[0] * (1 - t) + tileBottom[0] * t)
    const g = Math.round(tileTop[1] * (1 - t) + tileBottom[1] * t)
    const b = Math.round(tileTop[2] * (1 - t) + tileBottom[2] * t)

    // Accent glow in the top-left, diagonal gradient direction.
    const glow = Math.max(0, 1 - Math.hypot(px - size * 0.28, py - size * 0.22) / (size * 0.55))
    const mix = glow * glow * 0.34
    let rr = r + (accentA[0] - r) * mix
    let gg = g + (accentA[1] - g) * mix
    let bb = b + (accentA[2] - b) * mix

    // Terminal prompt chevron ">" plus a "█" cursor bar, in accent colour.
    const chevron = Math.min(
      segment(px, py, chevronTx, chevronTy - chevronSize, chevronTx + chevronSize, chevronTy),
      segment(px, py, chevronTx + chevronSize, chevronTy, chevronTx, chevronTy + chevronSize),
    )
    const bar = roundedRect(px, py, barX, chevronTy + chevronSize * 0.85, barHalf, size * 0.028, size * 0.01)
    const mark = Math.min(chevron - stroke, bar)
    if (mark < 0) {
      const blend = Math.min(1, -mark / 2)
      rr = rr * (1 - blend) + accentB[0] * blend
      gg = gg * (1 - blend) + accentB[1] * blend
      bb = bb * (1 - blend) + accentB[2] * blend
    }

    // Soft edge antialiasing for the tile silhouette.
    const edge = Math.min(1, Math.max(0, -tile / 1.6))
    pixels[index] = Math.round(rr)
    pixels[index + 1] = Math.round(gg)
    pixels[index + 2] = Math.round(bb)
    pixels[index + 3] = Math.round(255 * edge)
  }
}

/** One PNG chunk: length, type, payload, CRC32. */
function chunk(type, payload) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuffer, payload])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

const table = (() => {
  const values = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    values[n] = c >>> 0
  }
  return values
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const raw = Buffer.alloc(size * (size * 4 + 1))
for (let y = 0; y < size; y += 1) {
  const rowStart = y * (size * 4 + 1)
  raw[rowStart] = 0
  Buffer.from(pixels.buffer, pixels.byteOffset + y * size * 4, size * 4).copy(raw, rowStart + 1)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(size, 0)
ihdr.writeUInt32BE(size, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`icon: ${out} (${size}x${size}, ${Math.round(png.length / 1024)} KB)`)
