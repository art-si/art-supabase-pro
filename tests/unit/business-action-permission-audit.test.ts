import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findActionPermissionIssues } from '../../scripts/business-action-permission-audit'

test('发现 Vue 菜单中会被猜成未登记权限的地址快捷项', () => {
  const source = `<template><ArtButtonMore :list="addressActions" /></template><script setup lang="ts">const addressActions = [{ key: 'recognize', label: '地址识别' }, { key: 'select', label: '选择地址', auth: 'TmsOrderOpen:Create' }]</script>`
  assert.deepEqual(
    findActionPermissionIssues(source, 'page.vue', true).map((issue) => issue.key),
    ['recognize']
  )
})
test('发现 TSX 函数和行内菜单中的缺失权限', () => {
  const source = `const actions = () => [{ key: 'changes', label: '查看变更清单' }]; const render = () => <ArtButtonMore list={actions()} />; const inline = () => <ArtButtonMore list={[{key:'receipts',label:'查看签收'}]} />`
  assert.deepEqual(
    findActionPermissionIssues(source, 'page.tsx', true)
      .map((issue) => issue.key)
      .sort(),
    ['changes', 'receipts']
  )
})
test('发现将菜单 auth 错用于查询工具栏的配置', () => {
  const source = `const headerActions = [{ key: 'convert', label: '转费用报销', auth: 'FinanceWaybillCost:Convert' }]`
  assert.equal(
    findActionPermissionIssues(source, 'page.ts', false)[0]?.kind,
    'header-auth-property'
  )
})
test('已显式绑定业务权限的菜单和工具栏不误报', () => {
  const source = `const actions = [{key:'recognize',label:'地址识别',auth:'TmsOrderOpen:Create'}]; const headerActions = [{key:'convert',label:'转报销',permission:'FinanceWaybillCost:Convert'}]; const render = () => <ArtButtonMore list={actions} />`
  assert.deepEqual(findActionPermissionIssues(source, 'page.tsx', true), [])
})

test('h 渲染的详情动作也必须指定已有的查看权限', () => {
  const source = `const render = () => h(ArtButtonMore, {list:[{key:'detail',label:'详情'}]})`
  assert.deepEqual(
    findActionPermissionIssues(source, 'page.ts', true).map((issue) => issue.key),
    ['detail']
  )
})
