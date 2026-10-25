import assert from 'node:assert/strict'
import test from 'node:test'
import { createLatestUniqueValidation } from '../../src/utils/form/latest-unique-validation'

test('superseded input settles its callback and checks only the latest value', async () => {
  const checked: string[] = []
  const results: Array<string | undefined> = []
  let resolveLatest!: () => void
  const latestFinished = new Promise<void>((resolve) => {
    resolveLatest = resolve
  })
  const validate = createLatestUniqueValidation({
    check: async (value) => {
      checked.push(value)
      return value === 'taken'
    },
    duplicateMessage: '已存在',
    errorMessage: () => '查询失败',
    delay: 10
  })

  validate('first', (error) => results.push(error?.message))
  validate('taken', (error) => {
    results.push(error?.message)
    resolveLatest()
  })
  await latestFinished

  assert.deepEqual(checked, ['taken'])
  assert.deepEqual(results, [undefined, '已存在'])
})

test('an older in-flight response cannot reject the newer value', async () => {
  let finishOldCheck: ((exists: boolean) => void) | undefined
  let markOldStarted!: () => void
  const oldStarted = new Promise<void>((resolve) => {
    markOldStarted = resolve
  })
  let markNewFinished!: () => void
  const newFinished = new Promise<void>((resolve) => {
    markNewFinished = resolve
  })
  const results: Array<string | undefined> = []
  const validate = createLatestUniqueValidation({
    check: (value) =>
      value === 'old'
        ? new Promise<boolean>((resolve) => {
            finishOldCheck = resolve
            markOldStarted()
          })
        : Promise.resolve(false),
    duplicateMessage: '已存在',
    errorMessage: () => '查询失败',
    delay: 0
  })

  validate('old', (error) => results.push(error?.message))
  await oldStarted
  validate('new', (error) => {
    results.push(error?.message)
    markNewFinished()
  })
  finishOldCheck?.(true)
  await newFinished

  assert.deepEqual(results, [undefined, undefined])
})

test('query failures reject validation instead of accepting the value', async () => {
  const result = new Promise<string | undefined>((resolve) => {
    const validate = createLatestUniqueValidation({
      check: async () => {
        throw new Error('network unavailable')
      },
      duplicateMessage: '已存在',
      errorMessage: () => '校验失败，请稍后重试',
      delay: 0
    })
    validate('candidate', (error) => resolve(error?.message))
  })

  assert.equal(await result, '校验失败，请稍后重试')
})

test('a superseded callback can start another validation without losing it', async () => {
  const checked: string[] = []
  const results: string[] = []
  let finishLatest!: () => void
  const latestFinished = new Promise<void>((resolve) => {
    finishLatest = resolve
  })
  const validate = createLatestUniqueValidation({
    check: async (value) => {
      checked.push(value)
      return false
    },
    duplicateMessage: '已存在',
    errorMessage: () => '查询失败',
    delay: 0
  })

  validate('first', () => {
    results.push('first')
    validate('latest', () => {
      results.push('latest')
      finishLatest()
    })
  })
  validate('middle', () => results.push('middle'))
  await latestFinished

  assert.deepEqual(checked, ['latest'])
  assert.deepEqual(results, ['first', 'middle', 'latest'])
})
