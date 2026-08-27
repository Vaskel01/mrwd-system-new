import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const legacyPaths = [
  'src/pages/admin',
]

let removed = 0
for (const relativePath of legacyPaths) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) continue
  fs.rmSync(absolutePath, { recursive: true, force: true })
  console.log(`Removed legacy path: ${relativePath}`)
  removed += 1
}

if (removed === 0) {
  console.log('No legacy project paths found. Repository is already clean.')
} else {
  console.log(`Removed ${removed} legacy path${removed === 1 ? '' : 's'}. Run git status, commit the deletions, then run npm run verify.`)
}
