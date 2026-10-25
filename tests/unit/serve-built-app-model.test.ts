import assert from 'node:assert/strict'
import { parse, resolve } from 'node:path'
import test from 'node:test'
import {
  extractBuildBase,
  isAssetPath,
  isPathWithinRoot,
  normalizeBuildBase,
  stripBuildBase
} from '../../scripts/serve-built-app-model'

test('normalizeBuildBase standardizes root and nested bases', () => {
  assert.equal(normalizeBuildBase(''), '/')
  assert.equal(normalizeBuildBase('/'), '/')
  assert.equal(normalizeBuildBase('art-supabase-pro'), '/art-supabase-pro/')
  assert.equal(normalizeBuildBase('/art-supabase-pro/'), '/art-supabase-pro/')
})

test('extractBuildBase reads the production asset prefix', () => {
  assert.equal(
    extractBuildBase(
      '<link href="/art-supabase-pro/assets/index.css"><script src="/assets/app.js">'
    ),
    '/art-supabase-pro/'
  )
  assert.equal(extractBuildBase('<main>no assets</main>'), '/')
})

test('stripBuildBase maps production URLs to the output directory', () => {
  assert.equal(
    stripBuildBase('/art-supabase-pro/assets/app.js', '/art-supabase-pro/'),
    '/assets/app.js'
  )
  assert.equal(stripBuildBase('/dashboard', '/art-supabase-pro/'), '/dashboard')
  assert.equal(stripBuildBase('/assets/app.js', '/'), '/assets/app.js')
})

test('path and asset guards reject traversal and normalize separators', () => {
  const root = resolve('docs')
  assert.equal(isPathWithinRoot(root, resolve(root, 'assets/app.js')), true)
  assert.equal(isPathWithinRoot(root, resolve(root, '../secret.txt')), false)
  assert.equal(isPathWithinRoot(root, root), true)
  assert.equal(isPathWithinRoot(root, resolve(root, '..notes')), true)
  assert.equal(isPathWithinRoot(root, resolve(root, '../docs-other/app.js')), false)
  assert.equal(isAssetPath('assets/app.js'), true)
  assert.equal(isAssetPath('assets\\app.js'), true)
  assert.equal(isAssetPath('index.html'), false)
})

test('path guard rejects a different Windows drive', { skip: process.platform !== 'win32' }, () => {
  const root = resolve('docs')
  const otherDrive = parse(root).root.toUpperCase().startsWith('C:') ? 'D:' : 'C:'
  assert.equal(isPathWithinRoot(root, `${otherDrive}\\outside\\app.js`), false)
})
