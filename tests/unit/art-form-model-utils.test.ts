import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive, ref, toRefs } from 'vue'
import {
  cloneModelValue,
  updateFormFieldValue,
  sanitizeFormValue,
  type FormRecord
} from '../../src/components/core/forms/art-form/model-utils'

test('克隆由 reactive 和 toRefs 组合的表单模型时解包字段值', () => {
  const source = reactive({ cardNo: 'FUEL-001', amount: 100 })
  const selectedCardId = ref('card-001')
  const form = reactive({ ...toRefs(source), cardId: selectedCardId })

  const result = cloneModelValue(form)

  assert.deepEqual(result, { cardNo: 'FUEL-001', amount: 100, cardId: 'card-001' })
  assert.notEqual(result, form)
})
test('清洗嵌套表单时保留日期与文件控件值，仍移除空字段', () => {
  const date = new Date('2026-10-03T08:00:00Z')
  const file = new Blob(['测试附件'], { type: 'text/plain' })
  const options = {
    removeEmptyString: true,
    removeEmptyArray: true,
    removeEmptyObject: true,
    removeEmptyRichText: true,
    keepZero: true,
    keepFalse: true
  }
  const result = sanitizeFormValue(
    { period: [date], attachment: file, detail: { blank: '', count: 0, enabled: false } },
    options
  )
  assert.deepEqual(result, {
    period: [date],
    attachment: file,
    detail: { count: 0, enabled: false }
  })
  assert.equal((result as FormRecord).period[0], date)
  assert.equal((result as FormRecord).attachment, file)
})

test('更新普通字段时保留无关附件数组的引用', () => {
  const attachments = ['https://example.com/first.png', 'https://example.com/second.png']
  const form: FormRecord = {
    payeeName: '原收款人',
    basisUrls: attachments
  }

  const result = updateFormFieldValue(form, 'payeeName', '新收款人')

  assert.equal(result, form)
  assert.equal(result.payeeName, '新收款人')
  assert.equal(result.basisUrls, attachments)
})

test('支持嵌套字段更新和清除', () => {
  const form: FormRecord = {
    contact: { name: '张三', phone: '13800000000' }
  }

  updateFormFieldValue(form, 'contact.name', '李四')
  assert.deepEqual(form.contact, { name: '李四', phone: '13800000000' })

  updateFormFieldValue(form, 'contact.phone', undefined)
  assert.deepEqual(form.contact, { name: '李四' })
})
