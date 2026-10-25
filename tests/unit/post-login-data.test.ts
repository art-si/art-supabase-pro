import assert from 'node:assert/strict'
import test from 'node:test'
import { preparePostLoginData } from '../../src/views/auth/login/modules/post-login-data'

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
} {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

test('starts dictionaries only after the required user profile and an explicit trigger', async () => {
  const dictionaries = createDeferred()
  let dictionaryStarted = false

  const initialization = await preparePostLoginData({
    loadDictionaries: () => {
      dictionaryStarted = true
      return dictionaries.promise
    },
    loadUserProfile: async () => true
  })

  assert.equal(dictionaryStarted, false)
  const dictionariesReady = initialization.startDictionaries()
  assert.equal(dictionaryStarted, true)
  dictionaries.resolve()
  await dictionariesReady
})

test('rejects login initialization when the business user profile is unavailable', async () => {
  await assert.rejects(
    preparePostLoginData({
      loadDictionaries: async () => undefined,
      loadUserProfile: async () => false
    }),
    /缺少有效的业务用户资料/
  )
})

test('reports dictionary failures without turning them into login failures', async () => {
  const dictionaryError = new Error('dictionary unavailable')
  let reportedError: unknown

  const initialization = await preparePostLoginData({
    loadDictionaries: async () => {
      throw dictionaryError
    },
    loadUserProfile: async () => true,
    onDictionaryError: (error) => {
      reportedError = error
    }
  })

  await initialization.startDictionaries()
  assert.equal(reportedError, dictionaryError)
})

test('starts the dictionary request at most once', async () => {
  let startCount = 0
  const initialization = await preparePostLoginData({
    loadDictionaries: async () => {
      startCount += 1
    },
    loadUserProfile: async () => true
  })

  await Promise.all([initialization.startDictionaries(), initialization.startDictionaries()])
  assert.equal(startCount, 1)
})
