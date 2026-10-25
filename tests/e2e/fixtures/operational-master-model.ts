import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import OperationalMaster from '@mdm/views/components/operational-master/index.vue'
import MasterDialog from '@mdm/views/components/operational-master/modules/master-dialog.vue'
import type { OperationalMasterConfig } from '@mdm/views/components/operational-master/modules/master-config'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const config: OperationalMasterConfig = {
  kind: 'project',
  routeName: 'MdmProject',
  title: '项目',
  description: '主数据初始化与复制验收',
  icon: 'ri:folder-line',
  eyebrow: 'PROJECT',
  codeKey: 'projectCode',
  nameKey: 'projectName',
  formSections: [
    {
      key: 'identity',
      title: '项目信息',
      description: '确认项目名称',
      fieldKeys: ['projectCode', 'projectName', 'remark']
    }
  ],
  fields: [
    { key: 'projectCode', label: '项目编码', systemGenerated: true },
    { key: 'projectName', label: '项目名称', required: true },
    { key: 'remark', label: '备注', type: 'textarea', span: 24 }
  ]
}
const formulaPage = new URLSearchParams(location.search).has('formula')
const dialog = ref<InstanceType<typeof MasterDialog>>()
const open = (copy: boolean) =>
  dialog.value?.handleOpen({
    config,
    tenantId: 'test-tenant',
    tenantOptions: [],
    groups: [],
    copy,
    row: copy
      ? {
          id: 'source',
          tenantId: 'source-tenant',
          enabled: true,
          projectCode: 'PR001',
          projectName: '原项目',
          remark: '原项目备注'
        }
      : undefined
  })
const app = createApp({
  render: () =>
    formulaPage
      ? h('main', { class: 'art-page-view p-4' }, h(OperationalMaster))
      : h('main', { class: 'p-4' }, [
          h('button', { type: 'button', onClick: () => open(false) }, '新增测试项目'),
          h('button', { type: 'button', onClick: () => open(true) }, '复制测试项目'),
          h(MasterDialog, { ref: dialog })
        ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
})
app.use(router)
setupGlobDirectives(app)
if (formulaPage) {
  useUserStore(store).setUserInfo({
    userId: 'formula-dictionary-test',
    tenantId: '11111111-1111-4111-8111-111111111111',
    platformSuper: false
  })
  useMenuStore(store).setButtonList([
    { name: 'MdmActivityFormula:View', type: 'button', path: '', meta: { title: '查看' } }
  ])
  await router.push('/mdm/process-master/activity-formula')
}
app.mount('#master-model-preview')
