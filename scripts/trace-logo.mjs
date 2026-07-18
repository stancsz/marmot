#!/usr/bin/env node
/**
 * Pixel-accurate raster → SVG tracer for the Marmot logo.
 *
 * One-off tooling — its deps are not in package.json (their wasm variants
 * break npm's lockfile validation). Install before use:
 *   npm i --no-save potrace pixelmatch pngjs @resvg/resvg-js
 *
 * Usage: node scripts/trace-logo.mjs <input.png> [output.svg]
 *
 * Traces the bitmap with potrace, renders the SVG back to a PNG at the
 * original resolution, and reports the pixel mismatch percentage so the
 * fidelity claim is measured, not asserted.
 */
import fs from 'node:fs'
import path from 'node:path'
import potrace from 'potrace'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { Resvg } from '@resvg/resvg-js'

const [, , input, output] = process.argv
if (!input) {
  console.error('usage: node scripts/trace-logo.mjs <input.png> [output.svg]')
  process.exit(1)
}
const outPath = output ?? path.join(path.dirname(input), 'logo.svg')

const trace = (file, opts) =>
  new Promise((resolve, reject) =>
    potrace.trace(file, opts, (err, svg) => (err ? reject(err) : resolve(svg)))
  )

const source = PNG.sync.read(fs.readFileSync(input))
const { width, height } = source

// Flatten transparency onto white so alpha edges trace like the visible image.
const flat = new PNG({ width, height })
for (let i = 0; i < source.data.length; i += 4) {
  const a = source.data[i + 3] / 255
  for (let c = 0; c < 3; c++) flat.data[i + c] = Math.round(source.data[i + c] * a + 255 * (1 - a))
  flat.data[i + 3] = 255
}
const flatPath = `${input}.flat.png`
fs.writeFileSync(flatPath, PNG.sync.write(flat))

let best = null
for (const threshold of [110, 128, 150, 170]) {
  const svg = await trace(flatPath, {
    threshold,
    turdSize: 8, // drop specks (the source has paper-noise texture)
    optTolerance: 0.2,
    alphaMax: 1,
    color: '#111111',
    background: '#ffffff',
  })
  const rendered = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'white',
  }).render()
  const renderedPng = PNG.sync.read(rendered.asPng())
  const diffCount = pixelmatch(flat.data, renderedPng.data, null, width, height, {
    threshold: 0.1,
  })
  const pct = (diffCount / (width * height)) * 100
  console.log(`threshold=${threshold}  mismatch=${pct.toFixed(3)}%`)
  if (!best || pct < best.pct) best = { svg, pct, threshold }
}

fs.writeFileSync(outPath, best.svg)
fs.unlinkSync(flatPath)
console.log(
  `\nwrote ${outPath} (threshold=${best.threshold}, mismatch=${best.pct.toFixed(3)}% of ${width}x${height}px)`
)
