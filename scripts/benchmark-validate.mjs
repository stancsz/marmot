#!/usr/bin/env node

/**
 * Read-only validator for Marmot's benchmark protocol and benchmark result
 * records. Run from any directory inside the repository:
 *
 *   node scripts/benchmark-validate.mjs
 *   node scripts/benchmark-validate.mjs docs/benchmarks/results/run.json
 *
 * With no path argument the script discovers every *.json file under
 * docs/benchmarks/results/ and validates it as a single collection, rejecting
 * duplicate result_id values across the collection. An explicit path argument
 * validates only that file (or array) and does not check for duplicates.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const docPath = path.join(repoRoot, 'docs', 'BENCHMARKS.md')
const errors = []

function fail(message) {
  errors.push(message)
}

function slug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function headingsIn(source) {
  const found = new Set()
  for (const match of source.matchAll(/^#{1,6}\s+(.+)$/gm)) found.add(slug(match[1]))
  return found
}

function validateDocumentation() {
  if (!fs.existsSync(docPath)) {
    fail(`missing ${path.relative(repoRoot, docPath)}`)
    return
  }

  const source = fs.readFileSync(docPath, 'utf8')
  const requiredHeadings = [
    '## Reporting rules',
    '## Current evidence versus pending measurements',
    '## Benchmark matrix',
    '## Repeatable procedure',
    '## Model-fit recommendation',
    '## Acceptance thresholds and stop conditions',
    '## Result data schema',
    '## How contributors submit results',
  ]
  for (const heading of requiredHeadings) {
    if (!source.includes(heading)) fail(`missing heading: ${heading}`)
  }

  const requiredTerms = [
    'first-token latency',
    'generation speed',
    'Peak RAM',
    'battery impact',
    'Storage / model download',
    'cancellation',
    'android-low',
    'android-mid',
    'android-high',
    'iphone-low',
    'iphone-mid',
    'iphone-high',
    'Pixel 7',
    'Android 35',
    'x86_64',
    '1,536 MB',
    '40',
    'skipped frames',
    'no real-device or iPhone result',
  ]
  for (const term of requiredTerms) {
    if (!source.toLowerCase().includes(term.toLowerCase())) fail(`missing required term: ${term}`)
  }

  const fences = source.match(/^```/gm) ?? []
  if (fences.length % 2 !== 0) fail('unbalanced fenced code blocks')

  const headings = headingsIn(source)
  const localLinkPattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const match of source.matchAll(localLinkPattern)) {
    const target = match[1]
    if (/^(?:https?:|mailto:)/i.test(target)) continue
    if (target.startsWith('#')) {
      if (!headings.has(slug(target.slice(1)))) fail(`missing document anchor: ${target}`)
      continue
    }
    const [relativeTarget, anchor] = target.split('#', 2)
    const resolved = path.resolve(path.dirname(docPath), decodeURIComponent(relativeTarget))
    if (!fs.existsSync(resolved)) {
      fail(`broken local link: ${target}`)
      continue
    }
    if (anchor) {
      const linkedHeadings = headingsIn(fs.readFileSync(resolved, 'utf8'))
      if (!linkedHeadings.has(slug(anchor))) fail(`broken local anchor: ${target}`)
    }
  }

  for (const row of [
    'android-low',
    'android-mid',
    'android-high',
    'iphone-low',
    'iphone-mid',
    'iphone-high',
    'android-emulator-baseline',
  ]) {
    if (!source.includes(`\`${row}\``)) fail(`missing matrix row: ${row}`)
  }

  const jsonFence = source.match(/```json\s*\n([\s\S]*?)\n```/)
  if (!jsonFence) {
    fail('missing JSON schema example')
  } else {
    try {
      const example = JSON.parse(jsonFence[1])
      const required = [
        'schema_version',
        'result_id',
        'recorded_at_utc',
        'app',
        'device',
        'model',
        'workload',
        'measurements',
        'outcome',
        'evidence',
      ]
      for (const key of required) {
        if (!(key in example)) fail(`schema example missing key: ${key}`)
      }
      if (example.schema_version !== 'marmot.benchmark.v1') {
        fail('schema example has the wrong schema_version')
      }
      for (const key of [
        'first_visible_token_ms',
        'generation_tok_s',
        'peak_app_memory_mb',
        'battery_delta_percent_points',
        'download_wall_ms',
        'downloaded_bytes',
        'storage_delta_bytes',
        'cancel_to_idle_ms',
      ]) {
        if (!(key in example.measurements)) fail(`schema example missing measurement: ${key}`)
      }
    } catch (error) {
      fail(`invalid JSON schema example: ${error.message}`)
    }
  }
}

function validateResultRecord(record, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    fail(`${label}: result must be an object`)
    return
  }
  const required = [
    'schema_version',
    'result_id',
    'recorded_at_utc',
    'app',
    'device',
    'model',
    'workload',
    'measurements',
    'outcome',
    'evidence',
  ]
  for (const key of required) if (!(key in record)) fail(`${label}: missing ${key}`)
  if (record.schema_version !== 'marmot.benchmark.v1') fail(`${label}: invalid schema_version`)
  const app = record.app ?? {}
  for (const key of ['commit', 'version', 'build_type', 'native_runtime']) {
    if (typeof app[key] !== 'string' || app[key].trim() === '') fail(`${label}: app.${key} must be a non-empty string`)
  }
  const device = record.device ?? {}
  for (const key of ['platform', 'tier', 'manufacturer', 'model', 'os_version', 'cpu_abi', 'cpu_model', 'gpu']) {
    if (typeof device[key] !== 'string' || device[key].trim() === '') fail(`${label}: device.${key} must be a non-empty string`)
  }
  if (!['android', 'ios'].includes(device.platform)) fail(`${label}: device.platform must be android or ios`)
  if (!['android-low', 'android-mid', 'android-high', 'iphone-low', 'iphone-mid', 'iphone-high', 'android-emulator-baseline'].includes(device.tier)) {
    fail(`${label}: device.tier is not a recognized benchmark row`)
  }
  if (typeof device.is_emulator !== 'boolean') fail(`${label}: device.is_emulator must be boolean`)
  if (device.tier === 'android-emulator-baseline' && device.is_emulator !== true) fail(`${label}: emulator baseline must set is_emulator=true`)
  if (device.tier.startsWith('iphone-') && device.platform !== 'ios') fail(`${label}: iphone row requires ios platform`)
  if (device.tier.startsWith('android-') && device.platform !== 'android') fail(`${label}: android row requires android platform`)
  if (device.physical_ram_mb !== null && (typeof device.physical_ram_mb !== 'number' || !Number.isFinite(device.physical_ram_mb) || device.physical_ram_mb < 0)) {
    fail(`${label}: device.physical_ram_mb must be a non-negative number or null`)
  }

  const model = record.model ?? {}
  for (const key of ['id', 'quantization', 'model_url']) {
    if (typeof model[key] !== 'string' || model[key].trim() === '') fail(`${label}: model.${key} must be a non-empty string`)
  }
  if (model.projector_url !== null && (typeof model.projector_url !== 'string' || model.projector_url.trim() === '')) fail(`${label}: model.projector_url must be a string or null`)
  for (const key of ['model_bytes', 'projector_bytes']) {
    if (model[key] !== null && (typeof model[key] !== 'number' || !Number.isFinite(model[key]) || model[key] < 0)) fail(`${label}: model.${key} must be a non-negative number or null`)
  }
  for (const key of ['model_sha256', 'projector_sha256']) {
    if (model[key] !== null && (typeof model[key] !== 'string' || !/^[a-f0-9]{64}$/i.test(model[key]))) fail(`${label}: model.${key} must be a SHA-256 or null`)
  }

  const workload = record.workload ?? {}
  if (typeof workload.id !== 'string' || workload.id.trim() === '') fail(`${label}: workload.id must be a non-empty string`)
  if (workload.fixture_sha256 !== null && (typeof workload.fixture_sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(workload.fixture_sha256))) fail(`${label}: workload.fixture_sha256 must be a SHA-256 or null`)
  for (const key of ['context_length', 'max_response_tokens', 'temperature', 'top_p', 'repetition_index']) {
    if (typeof workload[key] !== 'number' || !Number.isFinite(workload[key]) || workload[key] < 0) fail(`${label}: workload.${key} must be a non-negative number`)
  }
  if (typeof workload.android_gpu !== 'boolean') fail(`${label}: workload.android_gpu must be boolean`)
  if (typeof workload.timing_method !== 'string' || workload.timing_method.trim() === '') fail(`${label}: workload.timing_method must be a non-empty string`)

  const measurementFields = [
    'first_visible_token_ms',
    'generation_tok_s',
    'generated_tokens',
    'peak_app_memory_mb',
    'memory_metric',
    'peak_swap_pss_mb',
    'battery_delta_percent_points',
    'battery_duration_ms',
    'download_wall_ms',
    'downloaded_bytes',
    'storage_delta_bytes',
    'image_eval_wall_ms',
    'skipped_frames',
    'cancel_to_idle_ms',
    'cancel_success',
    'share_to_preview_ms',
  ]
  for (const key of measurementFields) if (!(key in (record.measurements ?? {}))) fail(`${label}: missing measurement ${key}`)
  if (!Array.isArray(record.evidence)) fail(`${label}: evidence must be an array`)
  const statuses = new Set(['measured', 'pending', 'blocked'])
  if (!statuses.has(record.outcome?.status)) fail(`${label}: outcome.status must be measured, pending, or blocked`)
  if (!['runs-great', 'works-with-caution', 'too-large-or-unstable', 'pending'].includes(record.outcome?.fit_recommendation)) fail(`${label}: invalid outcome.fit_recommendation`)
  for (const [key, value] of Object.entries(record.measurements ?? {})) {
    if (value !== null && typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') {
      fail(`${label}: measurement ${key} must be scalar or null`)
    }
  }
  const numericMeasurements = measurementFields.filter((key) => key !== 'memory_metric' && key !== 'cancel_success')
  for (const key of numericMeasurements) {
    const value = record.measurements?.[key]
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) fail(`${label}: measurement ${key} must be a non-negative number or null`)
  }
  if (record.measurements?.memory_metric !== null && !['android_pss', 'ios_physical_footprint'].includes(record.measurements?.memory_metric)) fail(`${label}: invalid measurements.memory_metric`)
  if (record.measurements?.cancel_success !== null && typeof record.measurements?.cancel_success !== 'boolean') fail(`${label}: measurements.cancel_success must be boolean or null`)
  if (record.outcome?.status === 'measured' && record.evidence.length === 0) fail(`${label}: measured records require evidence`)
  if (record.outcome?.status === 'measured' && (!/^[a-f0-9]{64}$/i.test(model.model_sha256 ?? '') || (model.projector_bytes !== null && !/^[a-f0-9]{64}$/i.test(model.projector_sha256 ?? '')))) {
    fail(`${label}: measured records require model/projector SHA-256 hashes`)
  }
  for (const evidence of record.evidence ?? []) {
    if (typeof evidence !== 'string' || /^(?:https?:|pr:)/i.test(evidence)) continue
    const evidencePath = path.resolve(repoRoot, evidence)
    if (!fs.existsSync(evidencePath)) fail(`${label}: missing evidence path ${evidence}`)
  }
}

function validateResultArgument() {
  const target = process.argv[2]
  if (!target) return
  const absolute = path.resolve(process.cwd(), target)
  if (!fs.existsSync(absolute)) {
    fail(`result file not found: ${target}`)
    return
  }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  } catch (error) {
    fail(`invalid result JSON ${target}: ${error.message}`)
    return
  }
  const records = Array.isArray(parsed) ? parsed : [parsed]
  records.forEach((record, index) => validateResultRecord(record, `${target}[${index}]`))
}

function listResultFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(dir, name))
}

function validateResultCollection() {
  const dir = path.join(repoRoot, 'docs', 'benchmarks', 'results')
  const files = listResultFiles(dir)
  if (files.length === 0) return
  const seenIds = new Map()
  for (const file of files) {
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      fail(`invalid result JSON ${path.relative(repoRoot, file)}: ${error.message}`)
      continue
    }
    const records = Array.isArray(parsed) ? parsed : [parsed]
    records.forEach((record, index) => {
      const label = `${path.relative(repoRoot, file)}[${index}]`
      validateResultRecord(record, label)
      const id = record?.result_id
      if (typeof id === 'string' && id.trim() !== '') {
        const previous = seenIds.get(id)
        if (previous) {
          fail(`duplicate result_id "${id}" in ${label} (also in ${previous})`)
        } else {
          seenIds.set(id, label)
        }
      }
    })
  }
}

validateDocumentation()
validateResultArgument()
if (!process.argv[2]) validateResultCollection()

if (errors.length) {
  console.error(`FAIL: ${errors.length} benchmark validation error(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('PASS: benchmark protocol and schema validated')
