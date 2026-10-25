import assert from 'node:assert/strict'
import test from 'node:test'
import { validateArtFormForSubmit } from '../../src/utils/form/validate-art-form'

test('表单字段校验失败时不抛出，避免与保存失败混淆', async () => {
  const form = {
    validate: async (callback: (isValid: boolean) => void) => {
      callback(false)
      return false
    }
  }

  assert.equal(await validateArtFormForSubmit(form), false)
  assert.equal(await validateArtFormForSubmit(null), false)
})

test('表单校验的非字段异常继续交给提交方处理', async () => {
  const failure = new Error('validator failed')
  const form = {
    validate: async () => {
      throw failure
    }
  }

  await assert.rejects(validateArtFormForSubmit(form), (error) => error === failure)
})

test('表单校验通过后允许提交', async () => {
  const form = {
    validate: async (callback: (isValid: boolean) => void) => {
      callback(true)
      return true
    }
  }

  assert.equal(await validateArtFormForSubmit(form), true)
})
