import assert from 'node:assert/strict'
import test from 'node:test'
import { validateUserAccountIdentity } from '../../supabase/functions/_shared/user-account-identity-policy'

test('员工账号必须关联业务租户内的员工', () => {
  assert.equal(
    validateUserAccountIdentity({
      identityType: 'employee',
      employeeId: null,
      remark: null,
      tenantBuiltinType: null,
      callerIsPlatformSuper: false
    }),
    '员工账号必须关联员工花名册'
  )
  assert.equal(
    validateUserAccountIdentity({
      identityType: 'employee',
      employeeId: 'employee-id',
      remark: null,
      tenantBuiltinType: null,
      callerIsPlatformSuper: false
    }),
    null
  )
})

test('非员工账号不得关联员工并且必须说明用途', () => {
  assert.equal(
    validateUserAccountIdentity({
      identityType: 'external',
      employeeId: 'employee-id',
      remark: '供应商协作',
      tenantBuiltinType: null,
      callerIsPlatformSuper: false
    }),
    '非员工账号不能关联员工花名册'
  )
  assert.equal(
    validateUserAccountIdentity({
      identityType: 'service',
      employeeId: null,
      remark: ' ',
      tenantBuiltinType: null,
      callerIsPlatformSuper: false
    }),
    '请填写非员工账号的用途说明'
  )
})

test('历史待确认账号编辑时必须完成归类', () => {
  assert.equal(
    validateUserAccountIdentity({
      identityType: 'pending_review',
      employeeId: null,
      remark: null,
      tenantBuiltinType: null,
      callerIsPlatformSuper: true
    }),
    '历史待确认账号必须先完成人员身份归类'
  )
})

test('平台治理账号仅允许平台超级管理员维护', () => {
  assert.equal(
    validateUserAccountIdentity({
      identityType: 'platform',
      employeeId: null,
      remark: null,
      tenantBuiltinType: 'platform',
      callerIsPlatformSuper: false
    }),
    '平台治理账号只能由平台超级管理员在平台租户内维护'
  )
  assert.equal(
    validateUserAccountIdentity({
      identityType: 'platform',
      employeeId: null,
      remark: null,
      tenantBuiltinType: 'platform',
      callerIsPlatformSuper: true
    }),
    null
  )
})
