import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DeleteReferenceBlockedError,
  getDeleteReferenceContext
} from '../../src/utils/supabase/delete-reference'
import { getFriendlySupabaseErrorMessage } from '../../src/utils/supabase/error'

const id = '11111111-2222-3333-4444-555555555555'
const referenced = {
  code: '23503',
  message:
    'update or delete on table "mdm_material" violates foreign key constraint "mdm_bom_material_fkey" on table "mdm_bom"',
  details: `Key (id, tenant_id)=(${id}, 99999999-2222-3333-4444-555555555555) is still referenced from table "mdm_bom".`
}

test('identifies the deleted record from a composite FK without mistaking its tenant for the resource', () => {
  assert.deepEqual(getDeleteReferenceContext(referenced), {
    table: 'mdm_material',
    ids: [id],
    constraint: 'mdm_bom_material_fkey'
  })
  assert.deepEqual(
    getDeleteReferenceContext(new Error('失败', { cause: referenced })),
    getDeleteReferenceContext(referenced)
  )
})

test('does not open delete feedback for missing insert references or unstructured errors', () => {
  assert.equal(
    getDeleteReferenceContext({
      ...referenced,
      message:
        'insert or update on table "mdm_bom" violates foreign key constraint "mdm_bom_material_fkey"',
      details: `Key (material_id)=(${id}) is not present in table "mdm_material".`
    }),
    null
  )
  assert.equal(getDeleteReferenceContext({ code: '23503', message: '该资料被引用' }), null)
  assert.equal(getDeleteReferenceContext({ ...referenced, code: '42501' }), null)
  assert.equal(
    getDeleteReferenceContext({
      ...referenced,
      details: 'Key (id)=(invalid) is still referenced from table "mdm_bom".'
    }),
    null
  )
  const cycle: { cause?: unknown } = {}
  cycle.cause = cycle
  assert.equal(getDeleteReferenceContext(cycle), null)
})

test('keeps a handled dependency error actionable when callers normalize it again', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(new DeleteReferenceBlockedError(referenced)),
    '删除受阻，请处理弹窗中的关联记录后重试'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage(referenced),
    '该数据正在被其他业务使用，暂时不能修改或删除'
  )
})
