import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const files = {
  readme: path.join(root, 'README.md'),
  homepage: path.join(root, 'docs', 'index.html'),
  release: path.join(root, '.github', 'workflows', 'release.yml'),
}

const canonicalRepo = 'https://github.com/stancsz/marmot'
const apkUrl = `${canonicalRepo}/releases/latest/download/marmot.apk`
const staleLinks = [
  'https://github.com/super-marmot/marmot',
  'https://github.com/super-marmot/super-marmot.github.io',
  'https://super-marmot.github.io',
]

const failures = []
const contents = {}
for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    failures.push(`${name}: missing ${path.relative(root, file)}`)
    continue
  }
  contents[name] = fs.readFileSync(file, 'utf8')
}

const requireText = (name, text, label) => {
  if (contents[name] && !contents[name].includes(text)) failures.push(`${name}: missing ${label}`)
}

for (const name of Object.keys(files)) {
  requireText(name, canonicalRepo, 'canonical repository URL')
  for (const staleLink of staleLinks) {
    if (contents[name]?.includes(staleLink)) failures.push(`${name}: contains stale repository/site URL ${staleLink}`)
  }
}

requireText('readme', apkUrl, 'stable latest-release APK URL')
requireText('homepage', apkUrl, 'stable latest-release APK URL')
requireText('readme', 'https://stancsz.github.io/marmot/', 'canonical Pages URL')
requireText('homepage', 'https://stancsz.github.io/marmot/', 'canonical Pages URL')
requireText('release', 'dist/marmot.apk', 'stable APK artifact')
requireText('readme', 'share something → understand it locally → propose the next action → approve and execute it on the phone', 'flagship share-to-action promise')
requireText('homepage', 'Share a screenshot or message → understand it locally → propose the next action → approve and execute it on the phone', 'flagship homepage promise')
requireText('homepage', 'calendar', 'phone-action outcome')

if (failures.length) {
  console.error('FAIL distribution-identity-verifier')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('PASS distribution-identity-verifier')
