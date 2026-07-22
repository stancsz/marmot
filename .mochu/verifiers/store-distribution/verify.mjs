import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const files = {
  app: path.join(root, 'app.json'),
  eas: path.join(root, 'eas.json'),
  release: path.join(root, '.github', 'workflows', 'release.yml'),
  store: path.join(root, '.github', 'workflows', 'store-release.yml'),
  signing: path.join(root, 'scripts', 'configure-android-signing.mjs'),
  docs: path.join(root, 'docs', 'STORE_RELEASE.md'),
}

const failures = []
const contents = {}
for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    failures.push(`${name}: missing ${path.relative(root, file)}`)
    continue
  }
  if (fs.statSync(file).isDirectory()) {
    failures.push(`${name}: expected a file at ${path.relative(root, file)}`)
    continue
  }
  contents[name] = fs.readFileSync(file, 'utf8')
}

const requireText = (name, text, label = text) => {
  if (contents[name] && !contents[name].includes(text)) failures.push(`${name}: missing ${label}`)
}

let app
let eas
if (contents.app) {
  try {
    app = JSON.parse(contents.app).expo
  } catch {
    failures.push('app: invalid JSON')
  }
}
if (contents.eas) {
  try {
    eas = JSON.parse(contents.eas)
  } catch {
    failures.push('eas: invalid JSON')
  }
}

if (app) {
  if (typeof app.version !== 'string' || app.version === '0.1.0') {
    failures.push('app: store release must carry a version newer than the 0.1.0 sideload baseline')
  }
  if (app.ios?.bundleIdentifier !== 'app.marmot.chat') failures.push('app: iOS bundle identifier drifted')
  if (app.android?.package !== 'app.marmot.chat') failures.push('app: Android package drifted')
  if (app.ios?.config?.usesNonExemptEncryption !== false) {
    failures.push('app: iOS config.usesNonExemptEncryption must be false')
  }
}

if (eas) {
  if (eas.cli?.appVersionSource !== 'remote') failures.push('eas: cli.appVersionSource must be remote')
  const production = eas.build?.production
  if (production?.autoIncrement !== true) failures.push('eas: production build must auto-increment native versions')
  if (production?.android?.buildType !== 'app-bundle') failures.push('eas: production Android build must be an AAB')
  if (eas.submit?.internal?.android?.track !== 'internal') failures.push('eas: internal Android submit track missing')
  if (eas.submit?.production?.android?.track !== 'production') failures.push('eas: production Android submit track missing')
  if (!eas.submit?.production || typeof eas.submit.production.ios !== 'object') {
    failures.push('eas: production iOS submit profile missing')
  }
}

for (const text of Object.values(contents)) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|EXPO_TOKEN:\s*['\"][^$]/.test(text)) {
    failures.push('release configuration contains a hard-coded credential-shaped value')
    break
  }
}

requireText('release', 'MARMOT_ANDROID_KEYSTORE_BASE64', 'Android keystore secret')
requireText('release', 'MARMOT_ANDROID_KEYSTORE_PASSWORD', 'Android keystore password secret')
requireText('release', 'MARMOT_ANDROID_KEY_ALIAS', 'Android key alias secret')
requireText('release', 'MARMOT_ANDROID_KEY_PASSWORD', 'Android key password secret')
requireText('release', 'configure-android-signing.mjs', 'production signing configurator')
requireText('release', 'bundleRelease', 'production AAB build')
requireText('release', 'assembleRelease', 'sideload APK build')
requireText('release', 'marmot.aab', 'stable AAB artifact')
requireText('release', 'dist/marmot.apk', 'stable APK artifact')
requireText('release', 'test -n', 'fail-closed missing-secret check')
if (contents.release?.includes('signingConfigs.debug') || contents.release?.includes('debug.keystore')) {
  failures.push('release: production workflow still references debug signing')
}

for (const required of ['workflow_dispatch:', "tags: ['store-v*']", 'EXPO_TOKEN', 'npx eas-cli@21.0.2 build', '--platform all', '--profile production', '--auto-submit', '--non-interactive', '--wait']) {
  requireText('store', required, `store workflow ${required}`)
}
for (const required of ['EAS', 'Google Play', 'TestFlight', 'EXPO_TOKEN', 'MARMOT_ANDROID_KEYSTORE_BASE64', 'not shipped']) {
  requireText('docs', required, `store release documentation ${required}`)
}

if (contents.signing) {
  const check = spawnSync(process.execPath, ['--check', files.signing], { cwd: root, encoding: 'utf8' })
  if (check.status !== 0) failures.push(`signing: node --check failed${check.stderr ? `: ${check.stderr.trim()}` : ''}`)
}

if (failures.length) {
  console.error('FAIL store-distribution-verifier')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('PASS store-distribution-verifier')
