import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  isLazyCapabilityAsset,
  isLazyCapabilityStyle,
  platformChunkFileName,
  shouldPreloadHtmlDependency
} from '../../scripts/bundle-boundaries'

test('compact production URLs preserve every lazy-capability budget boundary', () => {
  for (const name of [
    'monaco',
    'exceljs.bare.min',
    'pdf.worker',
    'pdf',
    'charts',
    'file-viewer',
    'iwork.parser',
    'receivable-workspace',
    'framework'
  ]) {
    const output = platformChunkFileName({ name })
      .replace('[name]', name)
      .replace('[hash]', 'ABC12345')
    const namedOutput = `assets/${name}-ABC12345.js`
    assert.equal(isLazyCapabilityAsset(output), isLazyCapabilityAsset(namedOutput), name)
    assert.equal(
      shouldPreloadHtmlDependency(output),
      shouldPreloadHtmlDependency(namedOutput),
      name
    )
    if (!isLazyCapabilityAsset(namedOutput)) assert.equal(output, 'assets/ABC12345.js')
  }
})

test('heavy capabilities remain outside ordinary application chunk budgets', () => {
  for (const asset of [
    'assets/3d-runtime.123.js',
    'assets/exceljs.123.js',
    'assets/file-viewer.123.js',
    'assets/monaco.123.js'
  ]) {
    assert.equal(isLazyCapabilityAsset(asset), true, asset)
    assert.equal(shouldPreloadHtmlDependency(asset), false, asset)
  }

  assert.equal(isLazyCapabilityAsset('assets/dashboard.123.js'), false)
  assert.equal(shouldPreloadHtmlDependency('assets/framework.123.js'), true)
})

test('only known lazy capability styles are excluded from application CSS totals', () => {
  assert.equal(isLazyCapabilityStyle('assets/art-file-viewer.123.css'), true)
  assert.equal(isLazyCapabilityStyle('assets/art-settings-panel.123.css'), true)
  assert.equal(isLazyCapabilityStyle('assets/art-global-search.123.css'), true)
  assert.equal(isLazyCapabilityStyle('assets/art-chat-window.123.css'), true)
  assert.equal(isLazyCapabilityStyle('assets/art-fireworks-effect.123.css'), true)
  assert.equal(isLazyCapabilityStyle('vendor/pdf/viewer.css'), true)
  assert.equal(isLazyCapabilityStyle('assets/dashboard.123.css'), false)
})

test('SQL console keeps Monaco limited to the workers it actually uses', () => {
  const sqlSetupSource = readFileSync(
    new URL('../../src/utils/monaco-sql-setup.ts', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(sqlSetupSource, /from ['"]monaco-editor['"]/)
  assert.doesNotMatch(sqlSetupSource, /pgsql\.worker\?worker/)
  assert.doesNotMatch(sqlSetupSource, /setupLanguageFeatures/)
  assert.match(sqlSetupSource, /registerCompletionItemProvider/)
})

test('application shell imports focused system APIs instead of the management barrel', () => {
  const shellSources = [
    '../../src/router/core/menu-processor.ts',
    '../../src/store/modules/tenant-scope.ts',
    '../../src/hooks/core/useWebsiteConfig.ts',
    '../../src/hooks/core/system-param/read-system-param.ts',
    '../../src/utils/application-navigation.ts'
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))

  for (const source of shellSources) {
    assert.doesNotMatch(source, /from ['"]@\/api\/system-manage['"]/)
  }

  const combinedSource = shellSources.join('\n')
  assert.match(combinedSource, /system-manage\/application-access/)
  assert.match(combinedSource, /system-manage\/tenant/)
  assert.match(combinedSource, /system-manage\/system-param/)
  assert.match(combinedSource, /system-manage\/website-config/)
})

test('startup modules avoid the all-utils barrel and defer dictionary queries', () => {
  const shellPaths = [
    '../../src/store/modules/setting.ts',
    '../../src/store/modules/menu.ts',
    '../../src/store/modules/user.ts',
    '../../src/router/core/menu-processor.ts',
    '../../src/api/attachments.ts',
    '../../src/api/region-options.ts',
    '../../src/api/unique-field.ts',
    '../../src/views/auth/login/index.vue'
  ]

  for (const path of shellPaths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /from ['"]@\/utils['"]/, path)
  }

  const userStoreSource = readFileSync(
    new URL('../../src/store/modules/user.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(userStoreSource, /from ['"]@\/api\/data-center['"]/)
  assert.match(userStoreSource, /await import\(['"]@\/api\/data-center['"]\)/)
})

test('the public entry defers hosted application views until authenticated route registration', () => {
  const entrySource = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8')
  const guardSource = readFileSync(
    new URL('../../src/router/guards/before-each.ts', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(entrySource, /import ['"]\.\/bootstrap-hosted-applications['"]/)
  assert.match(
    entrySource,
    /loadHostedApplications: \(\) => import\(['"]\.\/bootstrap-hosted-applications['"]\)/
  )
  assert.match(guardSource, /loadHostedApplications\?\.\(\)/)
  assert.match(guardSource, /routeRegistry \?\?= new RouteRegistry\(router\)/)
  assert.ok(
    guardSource.indexOf('loadHostedApplications?.()') <
      guardSource.indexOf('routeRegistry ??= new RouteRegistry(router)')
  )
})

test('upgrade changelog stays out of the startup dependency graph', () => {
  const upgradeSource = readFileSync(
    new URL('../../src/utils/sys/upgrade.ts', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(upgradeSource, /import \{ upgradeLogList \} from/)
  assert.match(upgradeSource, /await import\(['"]@\/mock\/upgrade\/change-log['"]\)/)
})
