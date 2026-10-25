import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createModuleTypecheckConfig } from '../../scripts/module-typecheck.mjs'

test('module typecheck resolves platform aliases from the physical package and preserves local aliases', () => {
  const applicationRoot = path.resolve('isolated/application')
  const platformRoot = path.resolve(
    'isolated/application/node_modules/.pnpm/platform/node_modules/art-supabase-pro'
  )
  const config = createModuleTypecheckConfig(applicationRoot, platformRoot, {
    paths: {
      '@/*': ['../../src/*', 'node_modules/art-supabase-pro/src/*'],
      '@styles/*': ['node_modules/art-supabase-pro/src/assets/styles/*'],
      '@smis/*': ['src/*']
    }
  })
  assert.equal(config.extends, path.join(applicationRoot, 'tsconfig.json'))
  assert.equal(config.compilerOptions.baseUrl, applicationRoot)
  assert.deepEqual(config.compilerOptions.paths, {
    '@/*': [path.join(platformRoot, 'src/*')],
    '@styles/*': [path.join(platformRoot, 'src/assets/styles/*')],
    '@smis/*': ['src/*']
  })
  assert.deepEqual(Object.keys(config.compilerOptions).sort(), ['baseUrl', 'paths'])
})
