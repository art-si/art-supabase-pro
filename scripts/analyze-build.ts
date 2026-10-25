import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'

process.env.VITE_BUILD_ANALYZE = 'true'
process.env.VITE_OUT_DIR =
  process.env.VITE_OUT_DIR || (await mkdtemp(join(tmpdir(), 'art-supabase-pro-analyze-')))

console.log(`[build:analyze] outDir=${process.env.VITE_OUT_DIR}`)

await build({ mode: 'production' })

console.log('[build:analyze] bundle report=.bundle-stats.html')
