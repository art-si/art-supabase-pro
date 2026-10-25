<template>
  <aside
    v-show="visible"
    class="art-notification-panel art-card-sm"
    :class="{ 'is-show': show }"
    aria-label="通知中心"
    @click.stop
  >
    <header class="art-notification-panel__header">
      <div>
        <span>通知中心</span>
        <small>审批动态与待办实时汇总</small>
      </div>
      <ElButton
        link
        type="primary"
        :loading="state.marking"
        :disabled="activeCategory !== 'todo' && activeUnreadCount === 0"
        @click="handleHeaderAction"
      >
        {{ activeCategory === 'todo' ? '刷新待办' : '全部已读' }}
      </ElButton>
    </header>

    <div class="art-notification-panel__tabs" role="tablist" aria-label="通知分类">
      <button
        v-for="(item, index) in tabs"
        :key="item.category"
        type="button"
        role="tab"
        :aria-selected="barActiveIndex === index"
        :class="{ 'is-active': barActiveIndex === index }"
        @click="changeBar(index)"
      >
        <span>{{ item.label }}</span>
        <em v-if="item.count">{{ item.count > 99 ? '99+' : item.count }}</em>
      </button>
    </div>

    <div class="art-notification-panel__body" :aria-busy="state.loading">
      <ArtOverlayLoading
        v-if="state.loading"
        loading
        overlay
        size="compact"
        text="正在加载通知…"
        description=""
      />
      <ElScrollbar class="art-notification-panel__scrollbar" always>
        <div v-if="state.error" class="art-notification-panel__error">
          <ArtSvgIcon icon="ri:wifi-off-line" />
          <strong>通知加载失败</strong>
          <p>{{ state.error }}</p>
          <ElButton size="small" @click="loadNotificationCenter(true)">重新加载</ElButton>
        </div>

        <div v-else-if="currentList.length" class="art-notification-panel__list">
          <button
            v-for="item in currentList"
            :key="item.id"
            type="button"
            class="art-notification-panel__item"
            :class="[{ 'is-unread': !item.isRead }, `is-${item.severity}`]"
            @click="handleItemClick(item)"
          >
            <span class="art-notification-panel__icon">
              <ArtSvgIcon :icon="getNotificationIcon(item)" />
            </span>
            <span class="art-notification-panel__item-copy">
              <strong>{{ item.title }}</strong>
              <span v-if="item.content">{{ item.content }}</span>
              <time>{{ formatNotificationTime(item.createdAt) }}</time>
            </span>
            <i v-if="!item.isRead" aria-label="未读"></i>
          </button>
        </div>

        <ArtEmptyState
          v-else
          size="compact"
          :visual-size="64"
          :title="emptyState.title"
          :description="emptyState.description"
          class="art-notification-panel__empty"
        />
      </ElScrollbar>
    </div>

    <footer class="art-notification-panel__footer">
      <ElButton @click="handleViewAll">
        {{ activeCategory === 'todo' ? '进入审批工作台' : '查看全部动态' }}
        <ArtSvgIcon icon="ri:arrow-right-line" />
      </ElButton>
    </footer>
  </aside>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useDocumentVisibility, useIntervalFn, useTimeoutFn } from '@vueuse/core'
  import { getCurrentScope } from 'vue'
  import { useRouter, type LocationQueryRaw } from 'vue-router'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import { fetchHeaderNotificationCenter, markHeaderNotificationsRead } from '@/api/notification'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'

  defineOptions({ name: 'ArtNotification' })

  type NotificationItem = Api.Notification.HeaderNotificationItem
  type NotificationCategory = Api.Notification.NotificationCategory

  interface NotificationTab {
    category: NotificationCategory
    label: string
    count: number
  }

  interface NotificationPanelState {
    loading: boolean
    marking: boolean
    error: string
    data: Api.Notification.HeaderNotificationCenter
  }

  const props = defineProps<{ value: boolean }>()
  const emit = defineEmits<{
    'update:value': [value: boolean]
    'unread-change': [count: number]
  }>()

  const router = useRouter()
  const componentScope = getCurrentScope()
  const show = ref(false)
  const visible = ref(false)
  const barActiveIndex = ref(0)
  let centerRequest: Promise<void> | undefined
  let lastLoadedAt = 0
  const NOTIFICATION_WARMUP_DELAY_MS = 30_000
  const NOTIFICATION_REFRESH_INTERVAL_MS = 60_000
  const documentVisibility = useDocumentVisibility()

  const createEmptyCenter = (): Api.Notification.HeaderNotificationCenter => ({
    notices: [],
    messages: [],
    todos: [],
    unreadNoticeCount: 0,
    unreadMessageCount: 0,
    pendingTodoCount: 0,
    totalUnreadCount: 0
  })

  const state = reactive<NotificationPanelState>({
    loading: false,
    marking: false,
    error: '',
    data: createEmptyCenter()
  })

  const tabs = computed<NotificationTab[]>(() => [
    {
      category: 'notice',
      label: '通知',
      count: state.data.unreadNoticeCount
    },
    {
      category: 'message',
      label: '消息',
      count: state.data.unreadMessageCount
    },
    {
      category: 'todo',
      label: '待办',
      count: state.data.pendingTodoCount
    }
  ])

  const activeCategory = computed<NotificationCategory>(
    () => tabs.value[barActiveIndex.value]?.category ?? 'notice'
  )
  const activeUnreadCount = computed(() => tabs.value[barActiveIndex.value]?.count ?? 0)
  const currentList = computed<NotificationItem[]>(() => {
    if (activeCategory.value === 'message') return state.data.messages
    if (activeCategory.value === 'todo') return state.data.todos
    return state.data.notices
  })
  const emptyState = computed(() => {
    if (activeCategory.value === 'todo') {
      return { title: '暂无待办', description: '新的审批任务会自动出现在这里。' }
    }
    if (activeCategory.value === 'message') {
      return { title: '暂无消息', description: '审批节点处理后会在这里留下动态。' }
    }
    return { title: '暂无通知', description: '流程完成、驳回或取消后会通知你。' }
  })

  function getNotificationIcon(item: NotificationItem): string {
    if (item.category === 'todo') return 'ri:todo-line'
    if (item.category === 'message') return 'ri:message-3-line'
    if (item.severity === 'success') return 'ri:checkbox-circle-line'
    if (item.severity === 'danger') return 'ri:error-warning-line'
    if (item.severity === 'warning') return 'ri:alarm-warning-line'
    return 'ri:notification-3-line'
  }

  const formatNotificationTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--',
    allowTimeOnly: false
  })

  function changeBar(index: number): void {
    barActiveIndex.value = index
  }

  function normalizeRouteQuery(query: NotificationItem['routeQuery']): LocationQueryRaw {
    return Object.fromEntries(
      Object.entries(query ?? {})
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => [key, String(value)])
    )
  }

  async function loadNotificationCenter(showLoading = false): Promise<void> {
    if (!componentScope?.active) return
    if (showLoading) state.loading = true
    if (centerRequest) return centerRequest

    const request = requestNotificationCenter()
    centerRequest = request
    try {
      await request
    } finally {
      if (centerRequest === request) centerRequest = undefined
    }
  }

  async function requestNotificationCenter(): Promise<void> {
    try {
      const response = await fetchHeaderNotificationCenter()
      if (!componentScope?.active) return
      Object.assign(state.data, response.data ?? createEmptyCenter())
      state.error = ''
      lastLoadedAt = Date.now()
      emit('unread-change', state.data.totalUnreadCount)
    } catch (error) {
      if (componentScope?.active)
        state.error = getFriendlySupabaseErrorMessage(error, '通知服务暂时不可用')
    } finally {
      if (componentScope?.active) state.loading = false
    }
  }

  async function markCurrentCategoryRead(): Promise<void> {
    const category = activeCategory.value
    if (category === 'todo' || activeUnreadCount.value === 0) return
    state.marking = true
    try {
      if (centerRequest) await centerRequest
      if (!componentScope?.active) return
      await markHeaderNotificationsRead({ category })
      await loadNotificationCenter()
    } finally {
      if (componentScope?.active) state.marking = false
    }
  }

  async function handleHeaderAction(): Promise<void> {
    if (activeCategory.value === 'todo') {
      await loadNotificationCenter(true)
      return
    }
    await markCurrentCategoryRead()
  }

  async function handleItemClick(item: NotificationItem): Promise<void> {
    if (!item.isRead && item.category !== 'todo') {
      if (centerRequest) await centerRequest
      if (!componentScope?.active) return
      await markHeaderNotificationsRead({ notificationIds: [item.id] })
      await loadNotificationCenter()
    }
    if (!componentScope?.active) return
    emit('update:value', false)
    await router.push({
      path: item.routePath || '/workflow/workbench',
      query: normalizeRouteQuery(item.routeQuery)
    })
  }

  async function handleViewAll(): Promise<void> {
    emit('update:value', false)
    await router.push({
      path: '/workflow/workbench',
      query: { tab: activeCategory.value === 'todo' ? 'pending' : 'initiated' }
    })
  }

  const animationDelay = ref(5)
  const { start: startAnimation, stop: stopAnimation } = useTimeoutFn(
    () => {
      if (props.value) show.value = true
      else visible.value = false
    },
    animationDelay,
    { immediate: false }
  )
  const { start: startWarmup, stop: stopWarmup } = useTimeoutFn(
    () => void loadNotificationCenter(),
    NOTIFICATION_WARMUP_DELAY_MS,
    { immediate: false }
  )

  function showPanel(open: boolean): void {
    stopAnimation()
    if (open) {
      stopWarmup()
      visible.value = true
      animationDelay.value = 5
      startAnimation()
      void loadNotificationCenter(true)
      return
    }
    show.value = false
    if (!visible.value) return
    animationDelay.value = 250
    startAnimation()
  }

  function scheduleNotificationWarmup(): void {
    stopWarmup()
    if (documentVisibility.value === 'visible' && !props.value && !lastLoadedAt) startWarmup()
  }

  watch(() => props.value, showPanel, { immediate: true })
  const { pause, resume } = useIntervalFn(
    () => void loadNotificationCenter(),
    NOTIFICATION_REFRESH_INTERVAL_MS,
    { immediate: false }
  )
  watch(documentVisibility, (visibility) => {
    if (visibility === 'hidden') {
      pause()
      stopWarmup()
      return
    }

    resume()
    if (!lastLoadedAt) scheduleNotificationWarmup()
    else if (Date.now() - lastLoadedAt >= NOTIFICATION_REFRESH_INTERVAL_MS) {
      void loadNotificationCenter()
    }
  })

  onMounted(() => {
    if (documentVisibility.value === 'visible') {
      resume()
      if (!props.value) scheduleNotificationWarmup()
    }
  })
</script>

<style scoped lang="scss">
  .art-notification-panel {
    position: absolute;
    top: 58px;
    right: 20px;
    z-index: 2300;
    display: flex;
    visibility: hidden;
    flex-direction: column;
    width: 380px;
    height: min(540px, calc(100vh - 82px));
    overflow: hidden;
    box-shadow: 0 16px 40px rgb(15 23 42 / 16%) !important;
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
    transform-origin: top right;
    transition:
      opacity var(--art-motion-duration-fast) var(--art-motion-ease-out),
      transform var(--art-motion-duration-fast) var(--art-motion-ease-out),
      visibility var(--art-motion-duration-fast) var(--art-motion-ease-out);

    &.is-show {
      visibility: visible;
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    &__header {
      display: flex;
      flex: none;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px 16px 12px;

      > div {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      span {
        font-size: 16px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__tabs {
      position: relative;
      display: flex;
      flex: none;
      gap: 22px;
      height: 46px;
      padding: 0 16px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      button {
        position: relative;
        display: inline-flex;
        gap: 6px;
        align-items: center;
        padding: 0;
        font-size: 13px;
        color: var(--el-text-color-regular);
        cursor: pointer;
        background: transparent;
        border: 0;

        &::after {
          position: absolute;
          right: 0;
          bottom: -1px;
          left: 0;
          height: 3px;
          content: '';
          background: transparent;
        }

        &.is-active {
          font-weight: 600;
          color: var(--theme-color);

          &::after {
            background: var(--theme-color);
          }
        }

        &:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--theme-color) 45%, transparent);
          outline-offset: 3px;
        }
      }

      em {
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        font-size: 11px;
        font-style: normal;
        line-height: 18px;
        color: var(--el-color-danger);
        text-align: center;
        background: var(--el-color-danger-light-9);
        border-radius: 999px;
      }
    }

    &__body {
      position: relative;
      flex: 1;
      min-height: 0;
    }

    &__scrollbar {
      height: 100%;

      :deep(.el-scrollbar__wrap) {
        overflow-x: hidden;
      }
    }

    &__list {
      padding: 6px 0;
    }

    &__item {
      position: relative;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      width: 100%;
      padding: 13px 16px;
      font: inherit;
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: 0;
      transition: background-color 160ms ease;

      &:hover,
      &:focus-visible {
        background: var(--el-fill-color-light);
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 40%, transparent);
        outline-offset: -2px;
      }

      &.is-unread {
        background: color-mix(in srgb, var(--theme-color) 4%, transparent);
      }

      > i {
        position: absolute;
        top: 18px;
        right: 14px;
        width: 7px;
        height: 7px;
        background: var(--el-color-danger);
        border-radius: 50%;
      }

      &.is-success .art-notification-panel__icon {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-warning .art-notification-panel__icon {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }

      &.is-danger .art-notification-panel__icon {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }
    }

    &__icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 18px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--art-control-radius);
    }

    &__item-copy {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      padding-right: 10px;

      strong,
      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        color: var(--el-text-color-primary);
      }

      > span {
        margin-top: 3px;
        font-size: 12px;
        line-height: 18px;
        color: var(--el-text-color-regular);
      }

      time {
        margin-top: 5px;
        font-size: 11px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__empty,
    &__error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      padding: 24px;
      text-align: center;
    }

    &__error {
      color: var(--el-text-color-secondary);

      > svg {
        margin-bottom: 12px;
        font-size: 34px;
        color: var(--el-color-danger);
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        max-width: 280px;
        margin: 6px 0 14px;
        font-size: 12px;
        line-height: 18px;
      }
    }

    &__footer {
      flex: none;
      padding: 12px 16px 16px;
      border-top: 1px solid var(--el-border-color-lighter);

      .el-button {
        width: 100%;
      }
    }

    @media (width <= 640px) {
      top: 65px;
      right: 8px;
      left: 8px;
      width: auto;
      height: min(72vh, 540px);
    }
  }
</style>
