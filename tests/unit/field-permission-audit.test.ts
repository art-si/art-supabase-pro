import assert from 'node:assert/strict'
import test from 'node:test'
import { getFieldPermissionAuditChanges } from '../../src/views/system/field-permission/modules/field-permission-audit'

const fields: Api.SystemManage.FieldPermissionField[] = [
  {
    id: 'field-phone',
    fieldKey: 'contactPhone',
    fieldLabel: '联系电话',
    defaultAccess: 'hidden',
    inheritedAccess: 'masked',
    ownerOverrideEnabled: true
  },
  {
    id: 'field-amount',
    fieldKey: 'contractAmount',
    fieldLabel: '合同金额',
    defaultAccess: 'hidden',
    inheritedAccess: 'read',
    ownerOverrideEnabled: true
  }
]

test('field permission audit changes keep labels and before/after levels', () => {
  const changes = getFieldPermissionAuditChanges(
    {
      id: 'audit-1',
      action: 'replace',
      beforeValue: { contactPhone: 'masked', contractAmount: 'read' },
      afterValue: { contactPhone: 'hidden', contractAmount: 'edit' },
      actorName: '租户管理员',
      createTime: '2026-08-22T00:00:00Z'
    },
    fields
  )

  assert.deepEqual(changes, [
    {
      fieldKey: 'contactPhone',
      fieldLabel: '联系电话',
      beforeAccess: 'masked',
      afterAccess: 'hidden'
    },
    {
      fieldKey: 'contractAmount',
      fieldLabel: '合同金额',
      beforeAccess: 'read',
      afterAccess: 'edit'
    }
  ])
})

test('field permission audit changes represent inherited or cleared entries with null', () => {
  const [change] = getFieldPermissionAuditChanges(
    {
      id: 'audit-2',
      action: 'clear',
      beforeValue: { contactPhone: 'read' },
      afterValue: {},
      actorName: '租户管理员',
      createTime: '2026-08-22T00:00:00Z'
    },
    fields
  )

  assert.deepEqual(change, {
    fieldKey: 'contactPhone',
    fieldLabel: '联系电话',
    beforeAccess: 'read',
    afterAccess: null
  })
})
