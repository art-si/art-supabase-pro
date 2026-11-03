import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, effectScope } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useRouteOperationGuard } from '../../src/hooks/core/useRouteTableContext'

test('route operation capture stays invalid after its Vue scope is disposed', async () => {
  const app = createSSRApp({})
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/first', component: {} },
      { path: '/second', component: {} }
    ]
  })
  app.use(router)
  await router.push('/first')
  await router.isReady()

  const scope = effectScope()
  let capture!: ReturnType<typeof useRouteOperationGuard>
  try {
    scope.run(() =>
      app.runWithContext(() => {
        capture = useRouteOperationGuard()
      })
    )
    const firstRoute = capture()
    assert.equal(firstRoute(), true)

    await router.push('/second')
    assert.equal(firstRoute(), false)
    const secondRoute = capture()
    assert.equal(secondRoute(), true)

    scope.stop()
    assert.equal(secondRoute(), false)
    assert.equal(capture()(), false)
  } finally {
    scope.stop()
  }
})
