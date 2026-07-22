import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const files = {
  config: path.join(root, 'app.json'),
  app: path.join(root, 'App.tsx'),
  media: path.join(root, 'src', 'lib', 'sharedMedia.ts'),
  ingest: path.join(root, 'src', 'screens', 'IngestScreen.tsx'),
  test: path.join(root, 'src', 'lib', '__tests__', 'sharedMedia.test.ts'),
  evidence: path.join(root, 'docs', 'verification', 'flagship-share-vertical-2026-07-22.md'),
}

const failures = []
const source = {}
for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    failures.push(`${name}: missing ${path.relative(root, file)}`)
    source[name] = ''
    continue
  }
  source[name] = fs.readFileSync(file, 'utf8')
}

const requireText = (name, text, label = text) => {
  if (source[name] && !source[name].includes(text)) failures.push(`${name}: missing ${label}`)
}

requireText('config', '"androidIntentFilters": ["text/*", "image/*"]', 'Android text and image share filters')
requireText('config', '"NSExtensionActivationSupportsImageWithMaxCount": 1', 'iOS image share activation rule')
requireText('app', 'shareIntent.files', 'external shared file intake')
requireText('app', 'buildAttachmentFromCopy', 'copy shared media into app storage')
requireText('app', "attachment:", 'attachment route parameter')
requireText('media', 'export function sharedFileToAttachment', 'shared-file normalization helper')
requireText('media', 'image/', 'image MIME allowlist')
requireText('media', 'buildAttachmentFromCopy', 'local copy boundary')
requireText('ingest', 'buildCompletionMessages', 'structured local image completion')
requireText('ingest', 'getLoadedModalities', 'vision capability gate')
requireText('ingest', 'Extract calendar event', 'explicit extraction action')
requireText('ingest', 'calendarEventCard', 'typed calendar action card')
requireText('ingest', 'enableThinking: false', 'fast bounded vision extraction')
requireText('ingest', 'Add to calendar', 'approval button for the resulting phone action')
requireText('evidence', 'external', 'external-app evidence boundary')
requireText('evidence', 'not claimed', 'honest runtime claim')

// Execute the focused behavior suite with npx so a presence-only check cannot pass.
const testArgs = ['jest', 'src/lib/__tests__/sharedMedia.test.ts', '--runInBand', '--silent']
const test = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npx.cmd ${testArgs.join(' ')}`], {
      cwd: root,
      encoding: 'utf8',
    })
  : spawnSync('npx', testArgs, { cwd: root, encoding: 'utf8' })
if (test.status !== 0) failures.push('sharedMedia behavior test failed')

if (failures.length) {
  console.error('FAIL flagship-share-vertical-verifier')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('PASS flagship-share-vertical-verifier')
