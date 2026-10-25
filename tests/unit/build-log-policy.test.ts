import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBuildLogPolicy,
  getKnownFileViewerExternalization
} from '../../scripts/build-log-policy.mjs'

test('build log policy recognizes known lazy file-viewer transitive warnings', () => {
  const warning = getKnownFileViewerExternalization({
    message:
      'Module "util" has been externalized for browser compatibility, imported by "D:/repo/node_modules/.pnpm/avsc@5.7.9/node_modules/avsc/lib/types.js".'
  })

  assert.equal(warning, 'util:avsc')
})

test('build log policy keeps unknown browser externalizations visible', () => {
  assert.equal(
    getKnownFileViewerExternalization({
      message:
        'Module "fs" has been externalized for browser compatibility, imported by "D:/repo/node_modules/.pnpm/new-package@1.0.0/node_modules/new-package/index.js".'
    }),
    null
  )
  assert.equal(getKnownFileViewerExternalization({ message: 'Circular dependency detected' }), null)
})

test('shared build policy only folds known warnings and owns common Rolldown settings', () => {
  const policy = createBuildLogPolicy()
  const forwarded: string[] = []
  const defaultHandler = (_level: string, log: { message?: string }) => {
    forwarded.push(log.message || '')
  }

  policy.rolldownOptions.onLog(
    'warn',
    {
      message:
        'Module "stream" has been externalized for browser compatibility, imported by "D:/repo/node_modules/.pnpm/avsc@5.7.9/node_modules/avsc/lib/types.js".'
    },
    defaultHandler
  )
  policy.rolldownOptions.onLog(
    'warn',
    { message: 'A new warning that must remain visible' },
    defaultHandler
  )

  assert.deepEqual(forwarded, ['A new warning that must remain visible'])
  assert.equal(policy.chunkSizeWarningLimit, 7000)
  assert.deepEqual(policy.rolldownOptions.checks, {
    invalidAnnotation: false,
    pluginTimings: false
  })
})
