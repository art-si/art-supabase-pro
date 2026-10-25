import { readdir } from 'node:fs/promises'
import path from 'node:path'

const origin = 'https://art-supabase-staging-d8a9e32316e-1257156420.tcloudbaseapp.com'
const files = await readdir('docs', { recursive: true, withFileTypes: true })
const paths = files
  .filter((entry) => entry.isFile() && entry.name !== '.nojekyll')
  .map((entry) => {
    const parent = path.relative(path.resolve('docs'), entry.parentPath).replace(/\\/gu, '/')
    return `/${parent ? `${parent}/` : ''}${entry.name}`
  })
  .sort()
const results: Array<{ assetPath: string; status: number }> = []
let cursor = 0
const workers = Array.from({ length: 24 }, async () => {
  while (cursor < paths.length) {
    const assetPath = paths[cursor]
    cursor += 1
    const response = await fetch(`${origin}${assetPath}`, { method: 'HEAD' })
    results.push({ assetPath, status: response.status })
  }
})
await Promise.all(workers)
const missing = results.filter((result) => result.status !== 200)
process.stdout.write(`${JSON.stringify({ checked: results.length, missing }, null, 2)}\n`)
if (missing.length > 0) process.exitCode = 1
