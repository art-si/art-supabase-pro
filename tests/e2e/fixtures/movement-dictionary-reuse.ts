import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import MovementPage from '@mdm/views/inventory-master/movement-type/index.vue'
import MovementTypeDialog from '@mdm/views/inventory-master/movement-type/modules/movement-type-dialog.vue'
import InventoryMovementDialog from '@mdm/views/inventory/storage/modules/inventory-movement-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const typeRef = ref<InstanceType<typeof MovementTypeDialog>>()
const inventoryRef = ref<InstanceType<typeof InventoryMovementDialog>>()
let openCount = 0
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view h-screen p-4',
        // 独立组件夹具没有应用外壳，高度契约由真正的外壳回归另行验证。
        style: { '--art-full-height': 'calc(100dvh - 32px)' }
      },
      mode === 'list'
        ? [h(MovementPage)]
        : [
            h(
              'button',
              {
                type: 'button',
                onClick: () =>
                  mode === 'type'
                    ? typeRef.value?.handleOpen({ mode: 'add', tenantId: 'test-tenant' })
                    : inventoryRef.value?.handleOpen('purchase_in', {
                        tenantId: 'test-tenant',
                        warehouseId: 'warehouse-test',
                        label: mode === 'race' ? `测试仓库 ${++openCount}` : '测试仓库'
                      })
              },
              '打开表单'
            ),
            mode === 'type'
              ? h(MovementTypeDialog, { ref: typeRef })
              : h(InventoryMovementDialog, { ref: inventoryRef })
          ]
    )
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'movement-dictionary-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['View', 'Export'].map((action) => ({
    name: `MdmStockMovementType:${action}`,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
)
app.mount('#movement-dictionary-reuse')
