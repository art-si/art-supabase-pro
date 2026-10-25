<template>
  <ArtDialog size="lg" ref="dialogRef" show-fullscreen-button @opened="handleDialogOpened">
    <div class="menu-dialog-content">
      <ElAlert v-if="treeError" type="error" :closable="false" show-icon>
        <template #title>菜单层级加载失败</template>
        <ElButton link type="primary" @click="loadMenuTree">重新加载</ElButton>
      </ElAlert>
      <section class="menu-dialog-content__context art-card-xs">
        <span class="menu-dialog-content__context-icon" aria-hidden="true">
          <ArtSvgIcon :icon="menuTypeMeta.icon" />
        </span>
        <div>
          <strong>{{ menuTypeMeta.label }}</strong>
          <p>{{ menuTypeMeta.description }}</p>
        </div>
      </section>

      <ArtForm
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="rules"
        :span="width > 640 ? 12 : 24"
        :gutter="20"
        label-width="100px"
        :validate-on-rule-change="false"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { FormRules } from 'element-plus'
  import { formatMenuTitle } from '@/utils/router'
  import type { AppRouteRecord } from '@/types/router'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { useWindowSize } from '@vueuse/core'

  import { addMenu, editMenu, saveMenuSort } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import {
    buildMenuEditOrderUpdates,
    filterMenuParentTree,
    isMenuParentAvailable,
    normalizeMenuParentId
  } from './menu-order'

  const { width } = useWindowSize()

  interface MenuFormData extends MenuFormSelectData {
    id?: string
    parentId?: string | null
    name: string
    title: string
    path: string
    component: string
    icon: string
    isEnable: boolean
    sort: number
    keepAlive: boolean
    isHide: boolean
    isHideTab: boolean
    link: string
    isIframe: boolean
    showBadge: boolean
    showTextBadge: string
    fixedTab: boolean
    activePath: string
    roles: string[]
    isFullPage: boolean
  }

  interface MenuFormSelectData {
    menuTree?: AppRouteRecord[]
  }

  interface MenuDialogOpenData {
    row?: AppRouteRecord
    type?: 'folder' | 'menu' | 'button'
    parent?: AppRouteRecord | MenuFormData
    menuTree?: AppRouteRecord[]
    loadMenuTree?: () => Promise<AppRouteRecord[]>
  }

  interface Emits {
    (e: 'submit', data: MenuFormData): void
  }

  type MenuType = 'folder' | 'menu' | 'button'
  type MenuFormModel = MenuFormData & { type: MenuType }

  const emit = defineEmits<Emits>()
  const dialogRef = ref<ArtDialogExpose<MenuDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)

  const createInitialForm = (): MenuFormModel => ({
    id: undefined,
    type: 'menu',
    parentId: '',
    name: '',
    path: '',
    title: '',
    component: '',
    icon: '',
    isEnable: true,
    sort: 1,
    keepAlive: true,
    isHide: false,
    isHideTab: false,
    link: '',
    isIframe: false,
    showBadge: false,
    showTextBadge: '',
    fixedTab: false,
    activePath: '',
    roles: [],
    isFullPage: false
  })

  const form = ref<MenuFormModel>(createInitialForm())
  const sourceMenuTree = shallowRef<AppRouteRecord[]>([])
  const treeError = ref(false)
  const menuTreeLoader = shallowRef<(() => Promise<AppRouteRecord[]>) | undefined>()
  const originalParentId = ref<string | null>(null)
  const originalSort = ref(1)

  const menuTypeMeta = computed(() => {
    const metaMap: Record<MenuType, { label: string; description: string; icon: string }> = {
      folder: {
        label: '目录负责组织导航层级',
        description: '用于承载下级菜单，本身通常不对应具体业务页面。',
        icon: 'ri:folder-3-line'
      },
      menu: {
        label: '菜单对应可访问页面',
        description: '请同时确认路由、组件路径和可见性，避免产生无法访问的入口。',
        icon: 'ri:file-list-3-line'
      },
      button: {
        label: '权限控制页面内操作',
        description: '按钮权限必须挂在具体菜单下，并使用稳定、唯一的权限标识。',
        icon: 'ri:cursor-line'
      }
    }
    return metaMap[form.value.type]
  })
  const menuTypeLabel = computed(
    () => ({ folder: '目录', menu: '菜单', button: '权限' })[form.value.type]
  )

  const select = ref<MenuFormSelectData>({
    menuTree: []
  })

  const hasParentId = (parentId?: string | null): boolean => parentId != null && parentId !== ''

  const resolveFolderComponent = (parentId?: string | null): string =>
    hasParentId(parentId) ? '' : '/index/index'

  const syncComponentByType = (): void => {
    if (form.value.type === 'folder') {
      form.value.component = resolveFolderComponent(form.value.parentId)
      return
    }

    if (form.value.type === 'button') {
      form.value.path = ''
      form.value.component = ''
    }
  }

  const rules: FormRules = {
    name: [
      { required: true, message: '请输入权限标识', trigger: 'blur' },
      { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
    ],
    path: [
      {
        validator: (_rule, value, callback) => {
          if (form.value.type !== 'button' && !String(value ?? '').trim()) {
            callback(new Error('请输入路由地址'))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ],
    title: [{ required: true, message: '请输入显示名称', trigger: 'blur' }]
  }

  /**
   * 表单项配置
   */
  const formItems = computed<FormItem[]>(() => {
    const baseItems: FormItem[] = [
      {
        label: '菜单类型',
        key: 'type',
        type: 'segment',
        span: 24,
        options: getDictMap.value.menuType?.length
          ? getDictMap.value.menuType
          : [
              { label: '目录', value: 'folder' },
              { label: '菜单', value: 'menu' },
              { label: '按钮权限', value: 'button' }
            ],
        description: form.value.id
          ? '菜单类型创建后不建议变更，避免影响现有路由和授权。'
          : '请选择目录、菜单或按钮权限。按钮权限需挂在具体菜单下。',
        props: {
          disabled: !!form.value.id,
          validateEvent: false,
          onChange: handleMenuTypeChange
        }
      }
    ]
    // Switch 组件的 span：小屏幕 12，大屏幕 6
    const switchSpan = width.value < 640 ? 12 : 6
    if (['folder'].includes(form.value.type)) {
      return [
        ...baseItems,
        { label: '基础定义', key: 'basicSection', type: 'divider', span: 24 },
        {
          label: '父级菜单',
          key: 'parentId',
          type: 'treeSelect',
          props: {
            clearable: true,
            filterable: true,
            placeholder: '不选择则创建为顶级菜单',
            checkStrictly: true,
            onChange: handleParentChange,
            data: select.value.menuTree,
            props: {
              label: (data: AppRouteRecord) => formatMenuTitle(data.meta?.title),
              value: 'id'
            }
          }
        },
        {
          label: '目录名称',
          key: 'title',
          type: 'input',
          props: { placeholder: '如：系统管理' },
          description: '用于侧边导航展示，建议简短明确。'
        },
        { label: '权限标识', key: 'name', type: 'input', props: { placeholder: '如：System' } },
        { label: '路由与展示', key: 'routeSection', type: 'divider', span: 24 },
        {
          label: '路由地址',
          help: () =>
            [
              '一级菜单：以 / 开头的绝对路径（如 /dashboard）',
              '二级及以下：相对路径（如 console、user）'
            ].map((value) => h('p', value)),
          key: 'path',
          type: 'input',
          props: { placeholder: '如：/dashboard 或 console' }
        },
        {
          label: '组件路径',
          help: () =>
            ['一级父级菜单：填写 /index/index', '具体页面：填写组件路径（如 /system/user）'].map(
              (value) => h('p', value)
            ),
          key: 'component',
          type: 'input',
          props: {
            disabled: true,
            placeholder: '一级父级菜单固定为 /index/index'
          }
        },
        {
          label: '图标',
          help: '支持搜索并选择 Remix Icon 图标',
          key: 'icon',
          type: 'iconPicker',
          props: { placeholder: '请选择菜单图标' }
        },
        {
          label: '菜单排序',
          help: '值越小越靠前',
          key: 'sort',
          type: 'number',
          props: { min: 1, controlsPosition: 'right', style: { width: '100%' } }
        },
        {
          label: '文本徽章',
          key: 'showTextBadge',
          type: 'input',
          props: { placeholder: '如：New、Hot' }
        },
        { label: '可见性控制', key: 'visibilitySection', type: 'divider', span: 24 },
        { label: '是否启用', key: 'isEnable', type: 'switch', span: switchSpan },
        { label: '隐藏菜单', key: 'isHide', type: 'switch', span: switchSpan },
        { label: '显示徽章', key: 'showBadge', type: 'switch', span: switchSpan }
      ]
    }
    if (['menu'].includes(form.value.type)) {
      return [
        ...baseItems,
        { label: '基础定义', key: 'basicSection', type: 'divider', span: 24 },
        {
          label: '父级菜单',
          key: 'parentId',
          type: 'treeSelect',
          props: {
            clearable: true,
            filterable: true,
            placeholder: '不选择则创建为顶级菜单',
            checkStrictly: true,
            data: select.value.menuTree,
            props: {
              label: (data: AppRouteRecord) => formatMenuTitle(data.meta?.title),
              value: 'id'
            }
          }
        },
        {
          label: '菜单名称',
          key: 'title',
          type: 'input',
          props: { placeholder: '如：用户管理' },
          description: '用于导航与页面标签展示。'
        },
        { label: '权限标识', key: 'name', type: 'input', props: { placeholder: '如：User' } },
        { label: '路由配置', key: 'routeSection', type: 'divider', span: 24 },
        {
          label: '路由地址',
          help: () =>
            [
              '一级菜单：以 / 开头的绝对路径（如 /dashboard）',
              '二级及以下：相对路径（如 console、user）'
            ].map((value) => h('p', value)),
          key: 'path',
          type: 'input',
          props: { placeholder: '如：/dashboard 或 console' }
        },
        {
          label: '组件路径',
          help: () =>
            ['一级父级菜单：填写 /index/index', '具体页面：填写组件路径（如 /system/user）'].map(
              (value) => h('p', value)
            ),
          key: 'component',
          type: 'input',
          props: { placeholder: '如：/system/user 或留空' }
        },
        {
          label: '图标',
          help: '支持搜索并选择 Remix Icon 图标',
          key: 'icon',
          type: 'iconPicker',
          props: { placeholder: '请选择菜单图标' }
        },
        {
          label: '菜单排序',
          help: '值越小越靠前',
          key: 'sort',
          type: 'number',
          props: { min: 1, controlsPosition: 'right', style: { width: '100%' } }
        },
        /*{
          label: '角色权限',
          help: () =>
            [
                '仅用于前端权限模式：配置角色标识',
              '后端权限模式：无需配置'
            ].map((value) => h('p', value)),
          key: 'roles',
          type: 'inputTag',
          props: { placeholder: '输入角色标识后按回车' }
        },*/
        {
          label: '外部链接',
          key: 'link',
          type: 'input',
          props: { placeholder: '如：https://www.example.com' }
        },
        {
          label: '文本徽章',
          key: 'showTextBadge',
          type: 'input',
          props: { placeholder: '如：New、Hot' }
        },
        {
          label: '激活路径',
          help: () =>
            [
              '用于详情页等隐藏菜单，指定高亮显示的父级菜单路径',
              '例如：用户详情页高亮显示"用户管理"菜单'
            ].map((value) => h('p', value)),
          key: 'activePath',
          type: 'input',
          props: { placeholder: '如：/system/user' }
        },
        { label: '页面行为', key: 'behaviorSection', type: 'divider', span: 24 },
        { label: '是否启用', key: 'isEnable', type: 'switch', span: switchSpan },
        { label: '页面缓存', key: 'keepAlive', type: 'switch', span: switchSpan },
        { label: '隐藏菜单', key: 'isHide', type: 'switch', span: switchSpan },
        { label: '是否内嵌', key: 'isIframe', type: 'switch', span: switchSpan },
        { label: '显示徽章', key: 'showBadge', type: 'switch', span: switchSpan },
        { label: '固定标签', key: 'fixedTab', type: 'switch', span: switchSpan },
        { label: '标签隐藏', key: 'isHideTab', type: 'switch', span: switchSpan },
        { label: '全屏页面', key: 'isFullPage', type: 'switch', span: switchSpan }
      ]
    } else {
      return [
        ...baseItems,
        { label: '权限定义', key: 'permissionSection', type: 'divider', span: 24 },
        {
          label: '权限名称',
          key: 'title',
          type: 'input',
          props: { placeholder: '如：新增用户' },
          description: '用于权限配置树和操作入口展示。'
        },
        {
          label: '权限标识',
          key: 'name',
          type: 'input',
          props: { placeholder: '如：System:User:Add' },
          description: '建议采用“模块:资源:动作”的稳定命名方式。'
        },
        {
          label: '权限排序',
          help: '值越小越靠前',
          key: 'sort',
          type: 'number',
          props: { min: 1, controlsPosition: 'right', style: { width: '100%' } }
        }
      ]
    }
  })

  const handleMenuTypeChange = async (
    value: string | number | boolean | undefined
  ): Promise<void> => {
    if (value !== 'folder' && value !== 'menu' && value !== 'button') return

    syncComponentByType()
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleParentChange = (): void => {
    syncComponentByType()
  }

  /**
   * 重置表单数据
   */
  const handleResetFields = async (): Promise<void> => {
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleDialogOpened = async (): Promise<void> => {
    await nextTick()
    formRef.value?.clearValidate()
  }

  /**
   * 加载表单数据（编辑模式）
   */
  const loadFormData = (
    row: AppRouteRecord | Record<string, never>,
    defaultType: MenuType
  ): void => {
    const {
      id,
      parentId = form.value.parentId,
      type,
      name,
      sort,
      path,
      component,
      meta: routeMeta = {}
    } = row
    const meta = routeMeta as NonNullable<AppRouteRecord['meta']>
    Object.assign(form.value, {
      id,
      parentId,
      type: type || defaultType,
      title: formatMenuTitle(meta?.title || ''),
      name,
      sort,
      path,
      component,
      icon: meta.icon ?? '',
      keepAlive: meta.keepAlive ?? false,
      isHide: meta.isHide ?? false,
      isHideTab: meta.isHideTab ?? false,
      isEnable: meta.isEnable ?? true,
      link: meta.link ?? '',
      isIframe: meta.isIframe ?? false,
      showBadge: meta.showBadge ?? false,
      showTextBadge: meta.showTextBadge ?? '',
      fixedTab: meta.fixedTab ?? false,
      activePath: meta.activePath ?? '',
      isFullPage: meta.isFullPage ?? false
    })
  }

  /**
   * 提交表单
   */
  const handleSubmit = async (): Promise<boolean> => {
    if (treeError.value) {
      ElMessage.warning('请先重新加载菜单层级')
      return false
    }
    if (!formRef.value) return false

    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '菜单表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const { id, parentId, path, component = '', name, type, sort, ...rest } = toRaw(form.value)
      const normalizedParentId = normalizeMenuParentId(parentId)
      if (!isMenuParentAvailable(sourceMenuTree.value, id, normalizedParentId)) {
        ElMessage.error('父级菜单无效，不能选择当前菜单或其下级')
        return false
      }
      const submitPath = type === 'button' ? '' : path
      const submitComponent =
        type === 'folder'
          ? resolveFolderComponent(normalizedParentId)
          : type === 'button'
            ? ''
            : component
      const parentChanged = originalParentId.value !== normalizedParentId
      const targetSort =
        parentChanged && sort === originalSort.value ? Number.MAX_SAFE_INTEGER : sort
      const sortUpdates = id
        ? buildMenuEditOrderUpdates({
            tree: sourceMenuTree.value,
            id,
            sourceParentId: originalParentId.value,
            targetParentId: normalizedParentId,
            targetSort
          })
        : []
      const normalizedSort = sortUpdates.find((item) => item.id === id)?.sort ?? sort
      const params: AppRouteRecord = {
        parentId: normalizedParentId,
        path: submitPath,
        component: submitComponent,
        name,
        type,
        sort: normalizedSort,
        meta: { ...rest }
      }
      if (id == null) {
        await addMenu(params)
      } else {
        await editMenu({ ...params, id })
        await saveMenuSort(sortUpdates)
      }
      emit('submit', { ...form.value })
      return true
    } catch (error) {
      notifyFriendlyError(error, '菜单保存失败，请检查层级与排序后重试', 'warning')
      return false
    }
  }

  const handleSetParent = (row: Pick<MenuFormData, 'id' | 'menuTree'> = {}): void => {
    form.value.parentId = row.id ?? null
    select.value = {
      ...unref(select),
      menuTree: row.menuTree
    }
  }

  const initializeForm = (data: MenuDialogOpenData = {}): void => {
    Object.assign(form.value, createInitialForm())
    sourceMenuTree.value = data.menuTree ?? []
    originalParentId.value = normalizeMenuParentId(data.row?.parentId)
    originalSort.value = data.row?.sort ?? 1
    handleSetParent({
      id: data.parent?.id,
      menuTree: data.menuTree ?? []
    })
    loadFormData(data.row ?? {}, data.type ?? 'menu')
    select.value.menuTree = filterMenuParentTree(sourceMenuTree.value, form.value.id)
    syncComponentByType()
  }

  const loadMenuTree = async (): Promise<void> => {
    if (!menuTreeLoader.value) return
    treeError.value = false
    dialogRef.value?.setLoading(true)
    try {
      const tree = await menuTreeLoader.value()
      sourceMenuTree.value = tree
      select.value.menuTree = filterMenuParentTree(tree, form.value.id)
    } catch {
      treeError.value = true
    } finally {
      dialogRef.value?.setLoading(false)
    }
  }

  const handleReset = async (): Promise<void> => {
    Object.assign(form.value, createInitialForm())
    select.value = { menuTree: [] }
    sourceMenuTree.value = []
    originalParentId.value = null
    originalSort.value = 1
    await handleResetFields()
  }

  const handleOpen = async (data: MenuDialogOpenData = {}): Promise<void> => {
    initializeForm(data)
    treeError.value = false
    menuTreeLoader.value = data.menuTree?.length ? undefined : data.loadMenuTree
    await dialogRef.value?.handleOpen(data, {
      title: `${data.row?.id != null ? '编辑' : '新增'}${menuTypeLabel.value}`,
      dialogProps: {
        class: 'menu-dialog'
      },
      contentMaxHeight: '72vh',
      confirmText: data.row?.id != null ? '保存修改' : `创建${menuTypeLabel.value}`,
      loading: !data.menuTree?.length && Boolean(data.loadMenuTree),
      loadingText: '正在加载菜单层级…',
      onOpen: async () => {
        await Promise.all([handleResetFields(), loadMenuTree()])
      },
      onConfirm: handleSubmit,
      onReset: () => {
        handleReset()
      }
    })
  }

  defineExpose({
    handleOpen,
    handleSubmit,
    handleReset,
    handleSetParent
  })
</script>

<style scoped lang="scss">
  .menu-dialog-content {
    overscroll-behavior: contain;

    &__context {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 14px 16px;
      margin-bottom: 18px;

      strong {
        display: block;
        margin-bottom: 4px;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__context-icon {
      display: grid;
      flex: 0 0 38px;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 18px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--art-control-radius);
    }

    :deep(.art-form) {
      padding-bottom: 4px !important;
    }
  }
</style>
