# ArtDrawer

Read exposed boolean state with `unref(drawerRef.value?.visible)`; template component instances automatically unwrap refs. The shared [exposed-state contract](../../dialogs/art-dialog/README.md#reading-exposed-state) applies to drawers and dialogs.

## Content Loading

`loading` covers the drawer's visible content viewport, centers the loading state there, and disables the default footer buttons. It is independent from the confirm button's `confirmLoading`.

Whole-drawer fetches bind `loading` on `ArtDrawer`. A root `ArtAsyncState` inside it owns error, empty, and retry states; do not give that root state another loading mask. Local table or card fetches continue to use the corresponding shared component's loading state.

```vue
<ArtDrawer
  ref="drawerRef"
  :loading="loading"
  loading-text="Loading..."
  loading-background="rgba(255, 255, 255, 0.72)"
/>
```

It can also be configured for one open operation or controlled through the exposed API:

```ts
await drawerRef.value?.handleOpen(data, {
  loading: true,
  loadingText: 'Loading details...'
})

drawerRef.value?.setLoading(false)
```

For asynchronous initialization:

```ts
onOpen: async (_data, api) => {
  api.setLoading(true)
  try {
    await loadDetail()
  } finally {
    api.setLoading(false)
  }
}
```

`ArtDrawer` 是基于 Element Plus `ElDrawer` 封装的命令式抽屉组件。父组件通过 Ref 调用方法，不需要维护 `v-model` 和显示状态，适合详情、编辑、配置、审批等侧边工作流。

## 默认行为

- 默认方向为 `rtl`
- 默认尺寸为 `40%`
- 默认启用 `append-to-body`，避免抽屉被专注模式、祖先层叠上下文或裁剪容器遮挡
- 默认启用 `destroy-on-close`
- 默认显示全屏切换按钮，可通过 `showFullscreenButton="false"` 关闭
- 内容包含 `ArtForm` 时显示“专注填单”按钮；进入后全屏并收拢辅助信息，退出时恢复先前的全屏状态
- 默认显示“取消”和“确定”按钮
- 确认成功后默认自动关闭
- 支持异步确认、关闭拦截和 Loading
- 内容区域默认使用 `ElScrollbar`，长表单和详情可在抽屉内滚动；`contentHeight` 可覆盖滚动区域高度
- 支持自定义 Header、Footer 和动态内容组件
- `headerIcon` 为默认标题增加业务图标并将副标题对齐到标题；自定义 `header` 插槽优先，未设置图标时保留普通标题。
- 未封装的 `ElDrawer` API 可以直接透传

## 配置方式与优先级

扩展配置支持组件 Props 和 `handleOpen` 第二参数两种来源：

```vue
<ArtDrawer
  ref="drawerRef"
  size="45%"
  content-height="70vh"
  :drawer-props="{ appendToBody: true, closeOnClickModal: false }"
  :on-confirm="handleDefaultConfirm"
/>
```

```ts
drawerRef.value?.handleOpen(data, {
  title: '订单详情',
  subtitle: '展示订单状态、金额与履约信息',
  size: 720,
  drawerProps: {
    class: 'order-drawer',
    resizable: true
  },
  onConfirm: handleSubmit
})
```

优先级为：内置默认值 `<` 组件 Props/原生属性 `<` 组件 `drawerProps` `<` `handleOpen` 第二参数。`handleOpen.drawerProps` 和 `handleOpen.contentProps` 会与静态对象合并，同名字段由本次打开配置覆盖。

## 基础用法

```vue
<template>
  <ArtDrawer ref="drawerRef">
    <template #default="{ data }">
      <ElForm label-width="90px">
        <ElFormItem label="名称">
          <ElInput v-model="data.name" />
        </ElFormItem>
      </ElForm>
    </template>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'

  interface DrawerData {
    id?: string
    name: string
  }

  const drawerRef = ref<ArtDrawerExpose<DrawerData>>()

  const handleOpen = () => {
    drawerRef.value?.handleOpen(
      { name: '' },
      {
        title: '编辑资料',
        size: 560,
        onConfirm: async (data) => {
          await saveData(data)
        }
      }
    )
  }
</script>
```

## 复杂业务组件模式

业务抽屉应在自己的组件内部组合 `ArtDrawer` 和表单。列表页面只保留 `<OrderDrawer ref="orderDrawerRef" />`，并通过业务组件暴露的方法打开。

```vue
<template>
  <ArtDrawer ref="drawerRef">
    <OrderForm ref="formRef" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  const drawerRef = ref<ArtDrawerExpose<OrderOpenData>>()
  const formRef = ref<OrderFormExpose>()

  const handleOpen = async (data: OrderOpenData) => {
    await drawerRef.value?.handleOpen(data, {
      title: '处理订单',
      size: '55%',
      onOpen: async (openData) => {
        await nextTick()
        await formRef.value?.handleOpen(openData)
      },
      onConfirm: async () => {
        return (await formRef.value?.handleSubmit()) ?? false
      }
    })
  }

  defineExpose({ handleOpen })
</script>
```

`onConfirm` 返回 `false` 时抽屉保持打开。回调执行期间确定按钮会自动进入 Loading。若内容中的 `ElFormItem` 已显示校验错误，抽屉会在错误渲染后滚动并聚焦第一个错误字段；业务表单仍需配置 `prop` 和规则。自定义底部按钮绕过 `api.handleConfirm()` 时，请在校验失败分支调用 `focusFirstInvalidFormField`。

## 内容滚动

抽屉 `size` 支持 `sm / md / lg / xl / full` 响应式预设，也兼容原有数字、像素和百分比写法。所有尺寸都会自动限制在当前视口内。

```ts
drawerRef.value?.handleOpen(data, {
  contentHeight: 'calc(100vh - 180px)',
  scrollbarAlways: true
})
```

也可以主动控制位置：

```ts
drawerRef.value?.scrollTo(0)
drawerRef.value?.scrollTo({ top: 500, behavior: 'smooth' })
```

## 自定义插槽

```vue
<ArtDrawer ref="drawerRef">
  <template #header="{ data }">
    <strong>{{ data.title }}</strong>
  </template>

  <template #default="{ data, api }">
    <DetailPanel :data="data" :drawer-api="api" />
  </template>

  <template #footer="{ loading, api }">
    <ElButton @click="api.handleClose()">取消</ElButton>
    <ElButton type="primary" :loading="loading" @click="api.handleConfirm()">
      提交
    </ElButton>
  </template>
</ArtDrawer>
```

| 插槽       | 参数                     | 说明         |
| ---------- | ------------------------ | ------------ |
| `default`  | `data`, `api`            | 默认内容     |
| `header`   | `data`, `api`            | 自定义头部   |
| `subtitle` | `data`, `api`            | 自定义副标题 |
| `footer`   | `data`, `loading`, `api` | 自定义底部   |

## 动态组件

```ts
drawerRef.value?.handleOpen(order, {
  title: '订单详情',
  content: OrderDetail,
  contentProps: {
    readonly: true
  },
  showFooter: false
})
```

动态组件自动接收 `data`、`drawerApi` 和 `contentProps`。

## ArtDrawerOptions

| 属性                  | 类型                             | 默认值      | 说明                   |
| --------------------- | -------------------------------- | ----------- | ---------------------- |
| `title`               | `string`                         | `''`        | 标题                   |
| `subtitle`            | `string`                         | `''`        | 标题下方的辅助说明     |
| `size`                | `string \| number`               | `'40%'`     | 抽屉尺寸               |
| `direction`           | `ltr \| rtl \| ttb \| btt`       | `'rtl'`     | 展开方向               |
| `contentHeight`       | `string \| number`               | `undefined` | 固定内容高度           |
| `showFooter`          | `boolean`                        | `true`      | 是否显示 Footer        |
| `showCancelButton`    | `boolean`                        | `true`      | 是否显示取消按钮       |
| `showConfirmButton`   | `boolean`                        | `true`      | 是否显示确定按钮       |
| `cancelText`          | `string`                         | `'取消'`    | 取消按钮文字           |
| `confirmText`         | `string`                         | `'确定'`    | 确定按钮文字           |
| `confirmDisabled`     | `boolean`                        | `false`     | 是否禁用确定按钮       |
| `autoClose`           | `boolean`                        | `true`      | 确认成功后自动关闭     |
| `resetOnClose`        | `boolean`                        | `true`      | 关闭后自动重置         |
| `closeOnConfirmError` | `boolean`                        | `false`     | 确认异常后是否强制关闭 |
| `scrollbarAlways`     | `boolean`                        | `false`     | 始终显示滚动条         |
| `nativeScrollbar`     | `boolean`                        | `false`     | 使用原生滚动条         |
| `content`             | `Component`                      | `undefined` | 动态内容组件           |
| `contentProps`        | `Record<string, unknown>`        | `undefined` | 动态组件 Props         |
| `drawerProps`         | `ElDrawer Props`                 | `undefined` | 单次打开的底层配置     |
| `onOpen`              | `(data, api) => void`            | `undefined` | 内容挂载后的打开回调   |
| `onConfirm`           | `(data, api) => boolean \| void` | `undefined` | 异步确认回调           |
| `onClose`             | `(data, api) => boolean \| void` | `undefined` | `handleClose` 关闭拦截 |
| `onReset`             | `(api) => void`                  | `undefined` | 重置回调               |

## Ref 方法

| 方法                          | 说明                            |
| ----------------------------- | ------------------------------- |
| `handleOpen(data?, options?)` | 打开并传入数据和配置            |
| `handleClose(force?)`         | 关闭；`force=true` 跳过关闭拦截 |
| `handleConfirm()`             | 主动执行确认流程                |
| `handleReset()`               | 重置数据与 Loading              |
| `setLoading(value)`           | 设置内容 Loading                |
| `setConfirmLoading(value)`    | 设置确认按钮 Loading            |
| `setOptions(options)`         | 增量更新配置                    |
| `setData(data)`               | 替换当前数据                    |
| `updateData(data)`            | 浅合并当前对象数据              |
| `getData()`                   | 获取当前数据                    |
| `getDrawerInstance()`         | 获取底层 `ElDrawer` 实例        |
| `scrollTo(options)`           | 控制滚动位置                    |

## 事件

支持 `open`、`opened`、`close`、`closed`、`open-auto-focus`、 `close-auto-focus`、`resize-start`、`resize`、`resize-end`，并额外提供：

| 事件      | 参数      | 说明             |
| --------- | --------- | ---------------- |
| `confirm` | 当前数据  | 开始确认         |
| `reset`   | 无        | 重置完成         |
| `error`   | `unknown` | 确认回调发生异常 |

## ElDrawer API 透传

项目默认启用 `appendToBody`、`destroyOnClose`、`withHeader`、`modal`、`lockScroll`、`showClose`、`closeOnClickModal` 和 `closeOnPressEscape`。这些参数支持组件上显式设置为 `false`；单次打开的 `drawerProps` 可以进一步覆盖。`destroyOnClose=false` 保留底层内容，与业务数据是否重置的 `resetOnClose` 是两个独立设置。

`ArtDrawer` 的 SFC Props 类型已继承 `DrawerPropsPublic`，所以在模板中使用时，除 `model-value` 外的 `ElDrawer` Props 都会有类型提示。`model-value`、`update:model-value` 由命令式 API 接管，不要在业务侧使用。

```vue
<ArtDrawer
  ref="drawerRef"
  append-to-body
  :close-on-click-modal="false"
  :close-on-press-escape="false"
/>
```

单次配置：

```ts
drawerRef.value?.handleOpen(data, {
  drawerProps: {
    appendToBody: true,
    closeOnClickModal: false,
    closeOnPressEscape: false,
    modal: true,
    resizable: true
  }
})
```

优先级为：组件默认值、静态透传属性、`drawerProps`、`ArtDrawerOptions` 中的核心配置。

### 异步操作与重新打开

每次 `handleOpen()` 都建立新的打开批次。前一次打开中的 `onOpen`、`onClose`、`onConfirm` 或原生 `before-close` 回调完成后，不会关闭新记录、解除新记录的提交锁、显示旧错误或聚焦新记录的校验字段。关闭检查和提交期间会阻止重复操作。

这项隔离只管理组件状态；已经发出的业务请求仍可能完成。业务回调应使用传入的 `data` 保存当前记录，并在需要取消网络请求时使用 API 的取消机制。

### ElDrawer Props 完整列表

| 属性                    | 说明                                                    |
| ----------------------- | ------------------------------------------------------- |
| `direction`             | 打开方向；也可用 `ArtDrawer.direction`                  |
| `resizable`             | 是否可拖拽调整尺寸                                      |
| `size`                  | 抽屉尺寸；也可用 `ArtDrawer.size`                       |
| `with-header`           | 是否显示 header                                         |
| `modal-fade`            | 是否启用遮罩动画                                        |
| `header-aria-level`     | header aria level                                       |
| `append-to-body`        | 是否插入至 body                                         |
| `append-to`             | 挂载目标，默认 `body`                                   |
| `before-close`          | 原生关闭前回调；调用 `done()` 后仍须通过 `onClose` 检查 |
| `destroy-on-close`      | 关闭后销毁内容；`ArtDrawer` 默认 `true`                 |
| `close-on-click-modal`  | 点击遮罩关闭                                            |
| `close-on-press-escape` | 按 ESC 关闭                                             |
| `lock-scroll`           | 打开时锁定 body 滚动                                    |
| `modal`                 | 是否显示遮罩                                            |
| `modal-penetrable`      | 遮罩是否穿透                                            |
| `open-delay`            | 打开延迟                                                |
| `close-delay`           | 关闭延迟                                                |
| `top`                   | 顶部距离                                                |
| `modal-class`           | 遮罩 class                                              |
| `header-class`          | header class                                            |
| `body-class`            | body class                                              |
| `footer-class`          | footer class                                            |
| `width`                 | 底层兼容属性；抽屉尺寸优先用 `size`                     |
| `z-index`               | 层级                                                    |
| `trap-focus`            | 是否启用焦点陷阱                                        |
| `transition`            | 过渡动画                                                |
| `center`                | header/footer 是否居中                                  |
| `align-center`          | 是否居中对齐                                            |
| `close-icon`            | 自定义关闭图标                                          |
| `draggable`             | 底层兼容属性                                            |
| `overflow`              | 底层兼容属性                                            |
| `fullscreen`            | 底层兼容属性                                            |
| `show-close`            | 是否显示关闭按钮                                        |
| `title`                 | 标题；也可用 `ArtDrawer.title`                          |
| `aria-level`            | aria level                                              |

### ElDrawer Events

| 事件               | 说明                                       |
| ------------------ | ------------------------------------------ |
| `open`             | Drawer 打开动画开始；事件参数为当前 `data` |
| `opened`           | Drawer 打开动画结束；事件参数为当前 `data` |
| `close`            | Drawer 关闭动画开始；事件参数为当前 `data` |
| `closed`           | Drawer 关闭动画结束                        |
| `open-auto-focus`  | 内容获得焦点时触发                         |
| `close-auto-focus` | 内容失去焦点时触发                         |
| `resize-start`     | 开始调整尺寸，参数为 `event, size`         |
| `resize`           | 调整尺寸中，参数为 `event, size`           |
| `resize-end`       | 结束调整尺寸，参数为 `event, size`         |

`update:model-value` 不对业务开放；请使用 `ref.handleOpen()` 和 `ref.handleClose()`。

## 使用建议

抽屉 Body 本身不设置内边距，默认内容间距由 `art-drawer__content` 承担，因此滚动条会贴近抽屉边缘。确需贴边展示的特殊内容可在抽屉类名上覆盖 `--art-drawer-content-padding: 0`。

抽屉内容中嵌套 `ElScrollbar`、表格等独立滚动区时，内部仍可滚动的方向由内部消费；内部没有滚动空间或已到边界时，纵向滚轮会自动交给抽屉外层，避免形成滚轮陷阱。

- 详情类抽屉设置 `showFooter: false`
- 编辑类抽屉让内部表单暴露 `handleOpen` 和 `handleSubmit`
- 校验或接口失败时返回 `false`
- 长内容设置稳定的 `contentHeight`
- 需要阻止关闭时通过 `onClose` 返回 `false`
- 多种详情共用一个抽屉时使用动态 `content`
