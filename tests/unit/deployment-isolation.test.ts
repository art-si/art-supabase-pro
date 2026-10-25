import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadEnv } from 'vite'

test('GitHub Pages production uses the original Supabase project and docs output', () => {
  const env = loadEnv('production', process.cwd(), 'VITE_')
  assert.equal(env.VITE_BAAS_PROVIDER, 'supabase')
  assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, 'ckbftoopuyophiebamwy.supabase.co')
  assert.equal(env.VITE_OUT_DIR, 'docs')
  assert.equal(env.VITE_BASE_URL, '/art-supabase-pro/')
})

test('CloudBase requires its own mode and writes a separate deployment artifact', () => {
  const env = loadEnv('cloudbase', process.cwd(), 'VITE_')
  assert.equal(env.VITE_BAAS_PROVIDER, 'cloudbase')
  assert.equal(env.VITE_CLOUDBASE_ENV_ID, 'art-supabase-staging-d8a9e32316e')
  assert.equal(env.VITE_OUT_DIR, 'cloudbase-dist')
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  assert.match(pkg.scripts['cloudbase:build'], /--mode cloudbase\b/)
  assert.match(pkg.scripts['cloudbase:build'], /VITE_OUT_DIR=cloudbase-dist\b/)
  assert.doesNotMatch(pkg.scripts['cloudbase:build'], /VITE_OUT_DIR=docs\b/)
})
