<template>
  <ArtDrawer
    ref="drawerRef"
    :show-footer="false"
    :show-fullscreen-button="false"
    :drawer-props="drawerProps"
    @opened="scrollToBottom"
  >
    <template #header="{ api }">
      <header class="art-ai-assistant__header" :class="{ 'is-project-mode': isProjectMode }">
        <div class="art-ai-assistant__identity">
          <div class="art-ai-assistant__brand-icon">
            <ArtSvgIcon :icon="assistantIcon" />
          </div>
          <div class="art-ai-assistant__identity-copy">
            <div class="art-ai-assistant__title-row">
              <strong>{{ assistantTitle }}</strong>
              <span>{{ assistantModeLabel }}</span>
            </div>
            <div class="art-ai-assistant__status">
              <span class="art-ai-assistant__connection">
                <i :class="{ 'is-offline': !isOnline }"></i>
                {{ isOnline ? '网络在线' : '网络已断开' }}
              </span>
              <em>·</em>
              <span class="art-ai-assistant__page">{{ pageTitle }}</span>
            </div>
          </div>
        </div>

        <div class="art-ai-assistant__header-actions">
          <ElSegmented
            :disabled="state.sending"
            v-model="assistantMode"
            :options="assistantModeOptions"
            size="small"
            class="art-ai-assistant__mode-switch"
          />
          <ArtTooltip
            v-if="!isMobile"
            :content="isExpanded ? '退出放大' : '放大对话'"
            placement="bottom"
          >
            <ArtIconButton
              :icon="isExpanded ? 'dashicons:fullscreen-exit-alt' : 'dashicons:fullscreen-alt'"
              :label="isExpanded ? '退出放大' : '放大对话'"
              class="art-ai-assistant__header-button"
              @click="toggleExpanded"
            />
          </ArtTooltip>
          <ArtTooltip v-if="isProjectMode" content="打开 Supabase AI 工作台" placement="bottom">
            <ArtIconButton
              icon="ri:dashboard-line"
              label="打开 Supabase AI 工作台"
              class="art-ai-assistant__header-button"
              @click="openProjectWorkbench"
            />
          </ArtTooltip>
          <ArtTooltip content="会话历史" placement="bottom">
            <ArtIconButton
              icon="ri:history-line"
              label="会话历史"
              :disabled="state.sending"
              class="art-ai-assistant__header-button"
              @click="openHistory"
            />
          </ArtTooltip>
          <ArtTooltip content="新建对话" placement="bottom">
            <ArtIconButton
              icon="ri:chat-new-line"
              label="新建对话"
              :disabled="state.sending"
              class="art-ai-assistant__header-button"
              @click="resetConversation"
            />
          </ArtTooltip>
          <ArtTooltip content="关闭" placement="bottom">
            <ArtIconButton
              icon="ri:close-line"
              :label="`关闭 ${assistantTitle}`"
              class="art-ai-assistant__header-button"
              @click="api.handleClose()"
            />
          </ArtTooltip>
        </div>
      </header>
    </template>

    <div
      class="art-ai-assistant"
      :class="{ 'is-project-mode': isProjectMode, 'is-expanded': isExpanded }"
    >
      <ElScrollbar ref="scrollbarRef" class="art-ai-assistant__messages">
        <div class="art-ai-assistant__conversation">
          <section v-if="showWelcome" class="art-ai-assistant__welcome">
            <div class="art-ai-assistant__welcome-mark">
              <ArtSvgIcon :icon="assistantIcon" />
            </div>
            <span class="art-ai-assistant__eyebrow">{{ assistantEyebrow }}</span>
            <h2>{{ welcomeTitle }}</h2>
            <p>{{ welcomeDescription }}</p>
            <div class="art-ai-assistant__context-pill">
              <ArtSvgIcon icon="ri:focus-3-line" />
              <span>正在关注</span>
              <strong>{{ pageTitle }}</strong>
            </div>

            <div class="art-ai-assistant__prompt-grid">
              <button
                v-for="suggestion in suggestions"
                :key="suggestion.label"
                type="button"
                class="art-ai-assistant__prompt-card"
                :disabled="!isOnline"
                @click="sendSuggestion(suggestion.label)"
              >
                <span class="art-ai-assistant__prompt-icon">
                  <ArtSvgIcon :icon="suggestion.icon" />
                </span>
                <span>
                  <strong>{{ suggestion.label }}</strong>
                  <small>{{ suggestion.description }}</small>
                </span>
                <ArtSvgIcon icon="ri:arrow-right-up-line" />
              </button>
            </div>

            <div class="art-ai-assistant__capabilities">
              <span class="art-icon-label"
                ><ArtSvgIcon icon="ri:shield-check-line" /> 权限隔离</span
              >
              <span class="art-icon-label"
                ><ArtSvgIcon icon="ri:database-2-line" /> {{ dataCapabilityLabel }}</span
              >
              <span class="art-icon-label"><ArtSvgIcon icon="ri:eye-line" /> 不修改数据</span>
            </div>
          </section>

          <template v-else>
            <article
              v-for="message in state.messages"
              :key="message.id"
              class="art-ai-assistant__message"
              :class="{
                'is-user': message.role === 'user',
                'is-error': message.isError
              }"
            >
              <ElAvatar
                v-if="message.role === 'user'"
                :size="32"
                :src="userAvatar"
                class="art-ai-assistant__avatar"
              />
              <div v-else class="art-ai-assistant__assistant-avatar">
                <ArtSvgIcon :icon="assistantIcon" />
              </div>

              <div class="art-ai-assistant__message-body">
                <div class="art-ai-assistant__message-meta">
                  <span>{{ message.role === 'user' ? userName : assistantTitle }}</span>
                  <time>{{ message.time }}</time>
                </div>
                <div class="art-ai-assistant__bubble">
                  <div class="art-ai-assistant__message-content">{{ message.content }}</div>
                  <div v-if="message.destinations?.length" class="mt-2 flex flex-wrap gap-2">
                    <ElButton
                      v-for="destination in message.destinations"
                      :key="destination.path"
                      size="small"
                      :disabled="state.sending"
                      @click="openDestination(destination)"
                      >{{ destination.title }}</ElButton
                    >
                  </div>
                  <div
                    v-if="message.role === 'assistant' && hasMessageTrace(message)"
                    class="art-ai-assistant__trace"
                    aria-label="回答运行信息"
                  >
                    <span class="art-icon-label" v-if="message.model">
                      <ArtSvgIcon icon="ri:cpu-line" /> {{ message.model }}
                    </span>
                    <span class="art-icon-label" v-if="message.latencyMs != null">
                      <ArtSvgIcon icon="ri:timer-line" /> {{ formatDurationMs(message.latencyMs) }}
                    </span>
                    <span class="art-icon-label" v-if="message.usage">
                      <ArtSvgIcon icon="ri:braces-line" /> {{ getTokenTotal(message) }} tokens
                    </span>
                    <span
                      v-for="tool in message.tools"
                      :key="tool.name"
                      class="art-ai-assistant__tool-chip"
                      :class="{ 'is-failed': tool.status === 'failed' }"
                    >
                      <ArtSvgIcon
                        :icon="
                          tool.status === 'succeeded' ? 'ri:check-line' : 'ri:error-warning-line'
                        "
                      />
                      {{ getToolLabel(tool.name) }}
                    </span>
                  </div>
                </div>

                <div v-if="message.isError" class="art-ai-assistant__retry">
                  <ElButton
                    size="small"
                    plain
                    :icon="Refresh"
                    :disabled="state.sending || !isOnline"
                    @click="retryMessage(message)"
                  >
                    重新尝试
                  </ElButton>
                </div>

                <div
                  v-else-if="message.role === 'assistant'"
                  class="art-ai-assistant__message-actions"
                >
                  <ElButton text size="small" @click="copyMessage(message.content)">
                    <ArtSvgIcon icon="ri:file-copy-line" /> 复制
                  </ElButton>
                  <ElButton
                    text
                    size="small"
                    :disabled="state.sending || !isOnline"
                    @click="retryMessage(message)"
                  >
                    <ArtSvgIcon icon="ri:refresh-line" /> 重试
                  </ElButton>
                  <ArtAiFeedback
                    v-if="message.runId"
                    :run-id="message.runId"
                    :context-label="assistantTitle"
                    compact
                    @submitted="message.feedback = $event.rating"
                  />
                </div>
              </div>
            </article>

            <article v-if="state.sending" class="art-ai-assistant__message">
              <div class="art-ai-assistant__assistant-avatar">
                <ArtSvgIcon :icon="assistantIcon" />
              </div>
              <div class="art-ai-assistant__message-body">
                <div class="art-ai-assistant__message-meta">
                  <span>{{ assistantTitle }}</span>
                  <span>正在处理</span>
                </div>
                <div class="art-ai-assistant__thinking">
                  <span class="art-ai-assistant__typing-dots" aria-hidden="true">
                    <i></i><i></i><i></i>
                  </span>
                  <span>{{ thinkingText }}</span>
                  <small>{{ formatDurationMs(state.elapsedMs) }}</small>
                </div>
              </div>
            </article>
          </template>
        </div>
      </ElScrollbar>

      <footer class="art-ai-assistant__composer">
        <div class="art-ai-assistant__composer-content">
          <ElScrollbar v-if="state.messages.length" class="art-ai-assistant__quick-scrollbar">
            <div class="art-ai-assistant__quick-actions">
              <button
                v-for="action in quickActions"
                :key="action.label"
                type="button"
                :disabled="state.sending || !isOnline"
                @click="sendSuggestion(action.prompt)"
              >
                <ArtSvgIcon :icon="action.icon" /> {{ action.label }}
              </button>
            </div>
          </ElScrollbar>
          <div class="art-ai-assistant__composer-box">
            <ElInput
              v-model="state.input"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              :maxlength="4000"
              resize="none"
              :placeholder="composerPlaceholder"
              :disabled="state.sending || !isOnline"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <div class="art-ai-assistant__composer-actions">
              <div class="art-ai-assistant__composer-meta">
                <span class="art-icon-label"
                  ><ArtSvgIcon icon="ri:shield-check-line" /> {{ assistantModeLabel }}</span
                >
                <span>{{ state.input.length }} / 4000</span>
                <span class="art-ai-assistant__keyboard-hint">Shift + Enter 换行</span>
              </div>
              <span class="art-ai-assistant__send-actions">
                <small>Enter 发送</small>
                <ArtIconButton
                  class="art-ai-assistant__send-button"
                  icon="ri:arrow-up-line"
                  variant="solid"
                  :loading="state.sending"
                  :disabled="!state.input.trim() || !isOnline"
                  label="发送消息"
                  @click="sendMessage"
                />
              </span>
            </div>
          </div>
          <p>{{ footerNotice }}</p>
        </div>
      </footer>
    </div>
  </ArtDrawer>
  <ArtAssistantHistoryDrawer
    ref="historyDrawerRef"
    v-model:query="historyQuery"
    :loading="false"
    error=""
    :items="filteredHistory"
    :active-id="activeHistoryId"
    @select="selectHistory"
    @rename="renameHistory"
  />
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { copyTextToClipboard } from '@/utils/file/clipboard'

  import ArtAssistantHistoryDrawer from '@/components/core/layouts/art-assistant-history-drawer/index.vue'
  import { formatDurationMs } from '@/utils/ui/format'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { Refresh } from '@element-plus/icons-vue'
  import { useIntervalFn, useNetwork, useWindowSize, useSessionStorage } from '@vueuse/core'
  import { ElMessage, type ScrollbarInstance } from 'element-plus'
  import { useRoute, useRouter } from 'vue-router'
  import { chatWithAiAssistant } from '@/api/ai-assistant'
  import { chatWithProjectAssistant } from '@/api/supabase-ai-assistant'
  import ArtAiFeedback from '@/components/core/base/art-ai-feedback/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { useCurrentAssistantPage } from '@/hooks/core/useAssistantPage'
  import { useMenuStore } from '@/store/modules/menu'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    matchAssistantDestinations,
    parseAssistantFilters,
    type AssistantDestination
  } from '@/utils/assistant-navigation'
  import type { AppRouteRecord } from '@/types/router'
  import { useUserStore } from '@/store/modules/user'
  import type {
    AiAssistantMessageRole,
    AiAssistantPageContext,
    AiAssistantToolResult
  } from '@/types/ai-assistant'
  import { mittBus } from '@/utils/sys'
  import meAvatar from '@/assets/images/avatar/avatar5.webp'

  defineOptions({ name: 'ArtChatWindow' })

  interface ChatMessage {
    id: string
    role: AiAssistantMessageRole
    content: string
    time: string
    runId?: string
    tools?: AiAssistantToolResult[]
    model?: string
    promptVersion?: string
    latencyMs?: number
    usage?: {
      inputTokens?: number
      outputTokens?: number
    }
    feedback?: -1 | 1
    isError?: boolean
    pageContext?: AiAssistantPageContext
    retryContent?: string
    destinations?: AssistantDestination[]
  }

  interface AssistantState {
    sending: boolean
    input: string
    conversationId?: string
    routePath?: string
    startedAt: number
    elapsedMs: number
    messages: ChatMessage[]
  }

  interface PromptSuggestion {
    label: string
    description: string
    icon: string
  }

  interface QuickAction {
    label: string
    prompt: string
    icon: string
  }

  const MOBILE_BREAKPOINT = 640
  const route = useRoute()
  const router = useRouter()
  const isSmisPage = computed(() => route.path.startsWith('/smis/'))
  const userStore = useUserStore()
  const { width } = useWindowSize()
  const { isOnline } = useNetwork()
  const drawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const scrollbarRef = ref<ScrollbarInstance>()
  const isMobile = computed(() => width.value < MOBILE_BREAKPOINT)
  const isExpanded = ref(false)
  const assistantMode = ref<'business' | 'project'>('business')
  const assistantModeOptions = [
    { label: '业务助手', value: 'business' },
    { label: 'Supabase', value: 'project' }
  ]
  const isProjectMode = computed(() => assistantMode.value === 'project')
  const assistantModeLabel = computed(() => (isProjectMode.value ? '只读安全模式' : '权限内只读'))
  const assistantTitle = computed(() =>
    isProjectMode.value ? 'Supabase 管理助手' : isSmisPage.value ? 'AI 安全助理' : 'AI 业务助理'
  )
  const assistantIcon = computed(() =>
    isProjectMode.value ? 'ri:database-2-line' : 'ri:sparkling-2-fill'
  )
  const assistantEyebrow = computed(() =>
    isProjectMode.value
      ? 'SUPABASE PROJECT COPILOT'
      : isSmisPage.value
        ? 'SMIS SAFETY COPILOT'
        : 'ART BUSINESS COPILOT'
  )
  const welcomeTitle = computed(() =>
    isProjectMode.value ? '想了解项目里的什么？' : '今天想了解什么？'
  )
  const welcomeDescription = computed(() =>
    isProjectMode.value
      ? '我可以只读查看数据库对象、DDL、外键关系和 Edge Function 元数据，并生成变更方案。'
      : isSmisPage.value
        ? '我会在你的数据权限内查询隐患、特殊作业、培训与安全知识，并生成可复核的安全交底提纲。'
        : '支持跨页面连续对话。发送“当前页面”了解业务上下文，或发送“打开 + 菜单名称”前往有权访问的页面。'
  )
  const dataCapabilityLabel = computed(() =>
    isProjectMode.value ? '项目实时元数据' : '实时业务数据'
  )
  const thinkingText = computed(() =>
    isProjectMode.value ? '正在读取并分析项目元数据…' : '正在查询并整理业务数据…'
  )
  const composerPlaceholder = computed(() =>
    isProjectMode.value
      ? '询问数据库、函数、RLS 或 Edge Function，Enter 发送'
      : '输入业务问题，Enter 发送，Shift + Enter 换行'
  )
  const footerNotice = computed(() =>
    isProjectMode.value
      ? '当前为只读安全模式：不会执行 DDL、DML 或任意 SQL。'
      : 'AI 生成内容可能存在偏差，关键业务信息请以系统记录为准。'
  )
  const drawerProps = {
    appendToBody: true,
    closeOnClickModal: false,
    showClose: false,
    class: 'art-ai-assistant-drawer'
  }
  const drawerSize = computed(() => {
    if (isMobile.value) return '100%'
    if (isExpanded.value) return 'full'
    return 'min(800px, 100vw)'
  })

  function getDrawerProps(): typeof drawerProps {
    return {
      ...drawerProps,
      class: `art-ai-assistant-drawer${isExpanded.value ? ' is-expanded' : ''}`
    }
  }
  const pageTitle = computed(() => {
    const title = route.meta.title
    if (typeof title === 'string' && title) return title
    return typeof route.name === 'string' ? route.name : '当前页面'
  })
  const userName = computed(
    () =>
      userStore.getUserInfo.nickName ||
      userStore.getUserInfo.userName ||
      userStore.getUserInfo.email ||
      '当前用户'
  )
  const userAvatar = computed(() => userStore.getUserInfo.avatar || meAvatar)
  const state = reactive<AssistantState>({
    sending: false,
    input: '',
    conversationId: undefined,
    routePath: undefined,
    startedAt: 0,
    elapsedMs: 0,
    messages: []
  })
  const menuStore = useMenuStore()
  const tenantScope = useTenantScopeStore()
  const pageCapabilities = useCurrentAssistantPage()
  const historyScope = computed(
    () =>
      `art-assistant:${userStore.getUserInfo.userId}:${tenantScope.effectiveTenantId ?? 'all'}:${assistantMode.value}`
  )
  interface SavedChat {
    id: string
    title: string
    conversationId?: string
    updateTime?: string
    messages: ChatMessage[]
  }
  // Tab-scoped history avoids leaving business messages on a shared computer after the tab closes.
  const history = useSessionStorage<SavedChat[]>(historyScope, [])
  const activeHistoryId = ref<string>(crypto.randomUUID())
  const { promptText } = useArtFeedback()
  const historyDrawerRef = ref<ArtDrawerExpose>()
  const historyQuery = ref('')
  const filteredHistory = computed(() =>
    history.value
      .filter((item) =>
        item.title.toLocaleLowerCase().includes(historyQuery.value.trim().toLocaleLowerCase())
      )
      .map((item) => {
        const lastReply = [...item.messages]
          .reverse()
          .find((message) => message.role === 'assistant')
        return {
          ...item,
          lastMessage: item.messages.at(-1),
          lastRun: lastReply?.model
            ? { model: lastReply.model, latencyMs: lastReply.latencyMs }
            : undefined
        }
      })
  )
  async function renameHistory(item: SavedChat): Promise<void> {
    try {
      const title = await promptText('请输入新的会话标题', '重命名会话', {
        initialValue: item.title,
        maxLength: 80,
        emptyMessage: '会话标题不能为空'
      })
      history.value = history.value.map((saved) =>
        saved.id === item.id ? { ...saved, title } : saved
      )
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') ElMessage.error('会话重命名失败，请重试')
    }
  }
  function openHistory(): void {
    historyQuery.value = ''
    void historyDrawerRef.value?.handleOpen()
  }
  function selectHistory(id: string): void {
    restoreHistory(id)
    historyDrawerRef.value?.handleClose()
  }
  let requestGeneration = 0
  function persistHistory(): void {
    if (!state.messages.length) return
    const saved: SavedChat = {
      id: activeHistoryId.value,
      title:
        state.messages.find((message) => message.role === 'user')?.content.slice(0, 40) || '新对话',
      conversationId: state.conversationId,
      updateTime: new Date().toISOString(),
      messages: state.messages.slice(-80)
    }
    history.value = [saved, ...history.value.filter((item) => item.id !== saved.id)].slice(0, 20)
  }
  function restoreHistory(id: string): void {
    if (state.sending) return
    const saved = history.value.find((item) => item.id === id)
    if (!saved) return
    resetConversation()
    activeHistoryId.value = saved.id
    state.conversationId = saved.conversationId
    state.messages = cloneDeep(saved.messages)
    scrollToBottom()
  }
  const destinations = computed<AssistantDestination[]>(() => {
    const result: AssistantDestination[] = []
    function visit(menus: AppRouteRecord[]): void {
      for (const menu of menus) {
        if (menu.children?.length) visit(menu.children)
        else if (
          !menu.meta.isHide &&
          !menu.meta.link &&
          menu.type !== 'button' &&
          router.hasRoute(menu.name)
        ) {
          const registered = router.getRoutes().find((record) => record.name === menu.name)
          if (!registered || registered.path.includes(':')) continue
          const resolved = router.resolve({ name: menu.name })
          if (resolved.matched.length && !resolved.path.includes(':'))
            result.push({ title: menu.meta.title, path: resolved.path })
        }
      }
    }
    visit(menuStore.menuList)
    return result
  })
  async function openDestination(destination: AssistantDestination): Promise<void> {
    if (!destinations.value.some((item) => item.path === destination.path)) {
      ElMessage.warning('该页面当前不可访问，请刷新权限后重试')
      return
    }
    await router.push(destination.path)
  }
  async function runPageCommand(
    content: string
  ): Promise<{ message: string; destinations?: AssistantDestination[] } | null> {
    if (/^查看选中记录[。！!]?$/u.test(content)) {
      const capability = pageCapabilities.value.find((item) => item.viewSelection)
      if (!capability?.viewSelection) return { message: '当前页面尚未接入选中记录详情。' }
      await capability.viewSelection()
      await drawerRef.value?.handleClose()
      return { message: '已打开选中记录的详情。' }
    }
    const matches = matchAssistantDestinations(content, destinations.value)
    if (matches)
      return {
        message: matches.length
          ? '请选择要打开的页面，当前对话会保留。'
          : '未找到你有权访问的页面，请使用菜单中的完整名称。',
        destinations: matches
      }
    const filters = parseAssistantFilters(content)
    if (filters) {
      const capability = pageCapabilities.value.find(
        (item) =>
          item.applyFilters && Object.keys(filters).every((key) => item.filterFields?.includes(key))
      )
      if (!capability?.applyFilters)
        return { message: '当前页面不支持这些筛选项。发送“当前页面”可查看可用筛选项。' }
      await capability.applyFilters(filters)
      return { message: '已应用页面筛选条件，请查看列表结果。' }
    }
    if (
      /^(当前页面|这个页面|这个菜单|这个菜单用的是哪个数据库表|这个菜单用哪个数据库表|页面说明)[？?。]*$/u.test(
        content.replace(/\s/g, '')
      )
    ) {
      const capabilities = pageCapabilities.value
      return {
        message: [
          `当前页面：${pageTitle.value}（${route.path}）`,
          ...capabilities.map((item) =>
            [
              item.label ? `当前业务：${item.label}` : '',
              item.description || '',
              item.routePath ? `业务路径：${item.routePath}` : '',
              item.dataSources?.length ? `数据来源：${item.dataSources.join('、')}` : '',
              item.filters ? `筛选条件：${JSON.stringify(item.filters)}` : '',
              item.selection?.length ? `选中记录：${item.selection.join('、')}` : '',
              item.filterFields?.length
                ? `可用筛选：${item.filterFields.join('、')}。示例：筛选：${item.filterFields[0]}=关键词`
                : ''
            ]
              .filter(Boolean)
              .join('\n')
          ),
          capabilities.length ? '' : '该页面尚未接入详细业务上下文。',
          '可发送“打开 + 菜单名称”前往其他页面。'
        ]
          .filter(Boolean)
          .join('\n'),
        destinations: destinations.value.filter((destination) =>
          capabilities.some(
            (item) => item.routePath === destination.path && item.routePath !== route.path
          )
        )
      }
    }
    return null
  }
  const { pause: pauseElapsedTimer, resume: resumeElapsedTimer } = useIntervalFn(
    () => {
      if (state.startedAt) state.elapsedMs = Date.now() - state.startedAt
    },
    100,
    { immediate: false }
  )

  const suggestions = computed<PromptSuggestion[]>(() => {
    if (isProjectMode.value) {
      return [
        {
          label: '概览当前 Supabase 项目',
          description: '统计数据库对象和项目能力',
          icon: 'ri:dashboard-3-line'
        },
        {
          label: '列出 public schema 的表',
          description: '查看表、说明和对象目录',
          icon: 'ri:table-2'
        },
        {
          label: '检查 RLS 策略概况',
          description: '查看策略对象并提示安全风险',
          icon: 'ri:shield-keyhole-line'
        },
        {
          label: '列出项目 Edge Functions',
          description: '查看函数状态和 JWT 校验配置',
          icon: 'ri:cloud-line'
        }
      ]
    }
    if (isSmisPage.value) {
      return [
        {
          label: '查看近 30 天隐患概览',
          description: '汇总待核准、整改中与待验收事项',
          icon: 'ri:alarm-warning-line'
        },
        {
          label: '查看近 30 天特殊作业概览',
          description: '了解作业票阶段与近期安排',
          icon: 'ri:shield-check-line'
        },
        {
          label: '生成当前安全交底提纲',
          description: '结合近期隐患、作业与知识库',
          icon: 'ri:file-list-3-line'
        },
        {
          label: '搜索动火相关安全知识',
          description: '检索权限内制度、措施与案例',
          icon: 'ri:book-open-line'
        }
      ]
    }
    const items: PromptSuggestion[] = [
      {
        label: '总结最近订单',
        description: '查看最新订单、线路、状态和费用',
        icon: 'ri:file-list-3-line'
      },
      {
        label: '查看近 30 天运输概览',
        description: '汇总订单量、状态分布与费用',
        icon: 'ri:line-chart-line'
      },
      {
        label: '查询 30 天内车辆到期事项',
        description: '检查保险、年检和服务期限',
        icon: 'ri:alarm-warning-line'
      }
    ]
    if (getRecordId()) {
      items.unshift({
        label: '总结当前订单',
        description: '基于当前记录提炼关键信息',
        icon: 'ri:focus-3-line'
      })
    } else {
      items.unshift({
        label: '这个页面可以做什么？',
        description: '了解当前页面和可用能力',
        icon: 'ri:compass-3-line'
      })
    }
    return items
  })
  const showWelcome = computed(() => state.messages.length === 0 && !state.sending)
  const quickActions = computed<QuickAction[]>(() =>
    isProjectMode.value
      ? [
          {
            label: '安全审计',
            prompt: '检查当前项目的 RLS 与安全配置，并按风险等级给出改进建议',
            icon: 'ri:shield-check-line'
          },
          {
            label: '影响分析',
            prompt: '分析当前数据库对象之间的依赖关系与潜在变更影响',
            icon: 'ri:git-branch-line'
          },
          {
            label: '变更方案',
            prompt: '基于当前项目状态，生成一份只读的数据库优化与变更方案',
            icon: 'ri:file-list-3-line'
          }
        ]
      : isSmisPage.value
        ? [
            {
              label: '隐患概览',
              prompt: '查看近 30 天隐患概览与待闭环事项',
              icon: 'ri:alarm-warning-line'
            },
            {
              label: '安全交底',
              prompt: '生成当前页面相关的安全交底提纲',
              icon: 'ri:shield-check-line'
            },
            {
              label: '知识检索',
              prompt: '搜索当前作业相关的安全知识与控制措施',
              icon: 'ri:book-open-line'
            }
          ]
        : [
            {
              label: '经营摘要',
              prompt: '总结当前页面相关的核心业务数据与变化趋势',
              icon: 'ri:bar-chart-box-line'
            },
            {
              label: '风险提醒',
              prompt: '检查当前业务范围内需要关注的风险与临期事项',
              icon: 'ri:alarm-warning-line'
            },
            {
              label: '下一步建议',
              prompt: '根据当前数据给出清晰、可执行的下一步建议',
              icon: 'ri:route-line'
            }
          ]
  )

  function formatCurrentTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function getRecordId(): string | undefined {
    const candidate = route.params.id ?? route.query.id
    if (Array.isArray(candidate)) return candidate[0]
    return typeof candidate === 'string' && candidate ? candidate : undefined
  }

  function getPageContext(): AiAssistantPageContext {
    return {
      routeName: typeof route.name === 'string' ? route.name : undefined,
      routePath: route.path,
      pageTitle: pageTitle.value,
      recordId: getRecordId(),
      query: { ...route.query },
      capabilities: pageCapabilities.value.map((item) => ({
        label: item.label,
        description: item.description,
        routePath: item.routePath,
        dataSources: item.dataSources,
        filters: item.filters,
        selection: item.selection,
        filterFields: item.filterFields
      }))
    }
  }

  function scrollToBottom(): void {
    nextTick(() => scrollbarRef.value?.setScrollTop(Number.MAX_SAFE_INTEGER))
  }

  function resetConversation(): void {
    requestGeneration += 1
    activeHistoryId.value = crypto.randomUUID()
    pauseElapsedTimer()
    Object.assign(state, {
      sending: false,
      input: '',
      conversationId: undefined,
      routePath: route.fullPath,
      startedAt: 0,
      elapsedMs: 0,
      messages: []
    })
    scrollToBottom()
  }

  function toggleExpanded(): void {
    isExpanded.value = !isExpanded.value
    drawerRef.value?.setOptions({
      size: drawerSize.value,
      drawerProps: getDrawerProps()
    })
    scrollToBottom()
  }

  async function openProjectWorkbench(): Promise<void> {
    await drawerRef.value?.handleClose()
    await router.push('/data-center/supabase-ai-assistant')
  }

  function openChat(): void {
    state.routePath = route.fullPath
    isExpanded.value = false
    void drawerRef.value?.handleOpen(
      {},
      {
        size: drawerSize.value,
        showFooter: false,
        resetOnClose: false,
        drawerProps: getDrawerProps()
      }
    )
  }

  function sendSuggestion(suggestion: string): void {
    state.input = suggestion
    void sendMessage()
  }

  function retryMessage(message: ChatMessage): void {
    if (state.sending) return
    if (message.retryContent) {
      const errorIndex = state.messages.findIndex((item) => item.id === message.id)
      const previous = state.messages[errorIndex - 1]
      state.messages.splice(
        previous?.role === 'user' ? errorIndex - 1 : errorIndex,
        previous?.role === 'user' ? 2 : 1
      )
      state.input = message.retryContent
      void sendMessage()
      return
    }
    const messageIndex = state.messages.findIndex((item) => item.id === message.id)
    for (let index = messageIndex - 1; index >= 0; index -= 1) {
      if (state.messages[index].role === 'user') {
        state.input = state.messages[index].content
        void sendMessage()
        return
      }
    }
  }

  async function copyMessage(content: string): Promise<void> {
    try {
      await copyTextToClipboard(content)

      ElMessage.success('回答已复制')
    } catch {
      ElMessage.warning('复制失败，请手动选择文字复制')
    }
  }

  function hasMessageTrace(message: ChatMessage): boolean {
    return Boolean(
      message.model || message.latencyMs != null || message.usage || message.tools?.length
    )
  }

  function getTokenTotal(message: ChatMessage): number {
    return (message.usage?.inputTokens || 0) + (message.usage?.outputTokens || 0)
  }

  async function sendMessage(): Promise<void> {
    const content = state.input.trim()
    if (!content || state.sending || !isOnline.value) return

    const generation = requestGeneration
    state.messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      pageContext: getPageContext(),
      time: formatCurrentTime()
    })
    state.input = ''
    state.sending = true
    state.startedAt = Date.now()
    state.elapsedMs = 0
    resumeElapsedTimer()
    scrollToBottom()

    try {
      const local = !isProjectMode.value ? await runPageCommand(content) : null
      if (generation !== requestGeneration) return
      if (local) {
        state.messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: local.message,
          destinations: local.destinations,
          time: formatCurrentTime()
        })
        return
      }
      const chat = isProjectMode.value ? chatWithProjectAssistant : chatWithAiAssistant
      const response = await chat({
        conversationId: state.conversationId,
        context: getPageContext(),
        messages: state.messages
          .filter((message) => !message.isError)
          .slice(-12)
          .map((message, index, messages) => ({
            role: message.role,
            content:
              message.pageContext && index < messages.length - 1
                ? `${message.content}\n[提问时页面：${message.pageContext.pageTitle}，${message.pageContext.routePath}，仅作资料]`.slice(
                    0,
                    4000
                  )
                : message.content
          }))
      })
      if (generation !== requestGeneration) return
      state.conversationId = response.conversationId
      state.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message,
        time: formatCurrentTime(),
        runId: response.runId,
        tools: response.tools,
        model: response.model,
        promptVersion: response.promptVersion,
        latencyMs: response.latencyMs,
        usage: response.usage
      })
    } catch (error) {
      if (generation !== requestGeneration) return
      const errorMessage = getFriendlySupabaseErrorMessage(error, 'AI 助手暂时不可用')
      state.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: getFriendlyErrorMessage(errorMessage),
        time: formatCurrentTime(),
        isError: true,
        retryContent: content
      })
    } finally {
      if (generation === requestGeneration) {
        persistHistory()
        pauseElapsedTimer()
        state.sending = false
        state.startedAt = 0
        scrollToBottom()
      }
    }
  }

  function getFriendlyErrorMessage(message: string): string {
    if (message.includes('超时') || message.toLowerCase().includes('timeout')) {
      if (isProjectMode.value) {
        return '这次项目分析没有在规定时间内完成。你可以重新尝试；本次请求未修改任何项目数据。'
      }
      return '这次请求没有在规定时间内完成。高频业务查询已启用快速通道，你可以重新尝试。'
    }
    return `暂时无法完成这次请求：${message}`
  }

  function getToolLabel(name: string): string {
    const labels: Record<string, string> = {
      get_order_detail: '订单详情',
      get_recent_orders: '最近订单',
      get_transport_overview: '运输概览',
      get_vehicle_expiries: '车辆到期',
      get_smis_hazard_overview: '隐患概览',
      get_smis_special_operation_overview: '特殊作业概览',
      get_smis_training_overview: '安全培训概览',
      search_smis_safety_knowledge: '安全知识检索',
      generate_smis_safety_briefing: '安全交底提纲',
      get_project_overview: '项目概览',
      list_database_objects: '数据库对象',
      get_database_object_detail: '对象定义',
      get_table_relationships: '外键关系',
      list_edge_functions: 'Edge Functions'
    }
    return labels[name] ?? name
  }

  watch(
    () => route.fullPath,
    (path) => {
      state.routePath = path
    }
  )
  watch(historyScope, () => {
    resetConversation()
    nextTick(() => {
      if (history.value[0]) restoreHistory(history.value[0].id)
    })
  })
  onMounted(() => {
    if (history.value[0]) restoreHistory(history.value[0].id)
  })
  onMounted(() => mittBus.on('openChat', openChat))
  onUnmounted(() => {
    pauseElapsedTimer()
    mittBus.off('openChat', openChat)
  })
</script>

<style scoped lang="scss">
  :global(.art-ai-assistant-drawer .el-drawer__header) {
    position: relative;
    z-index: 2;
    padding: 0;
    margin-bottom: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    box-shadow: 0 4px 18px rgb(31 45 61 / 4%);
  }

  :global(.art-ai-assistant-drawer .el-drawer__body) {
    --art-drawer-content-padding: 0;

    padding: 0;
  }

  :global(.art-ai-assistant-drawer .art-drawer__content) {
    height: 100%;
  }

  :global(
    .art-ai-assistant-drawer .art-drawer__scrollbar > .el-scrollbar__wrap > .el-scrollbar__view
  ) {
    height: 100%;
  }

  :global(.art-ai-assistant-drawer) {
    border-left: 1px solid var(--el-border-color-extra-light);
    box-shadow: -18px 0 55px rgb(22 34 51 / 16%) !important;
  }

  :global(.art-ai-assistant-drawer.is-expanded) {
    top: 6px;
    right: 6px;
    height: calc(100vh - 12px);
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    box-shadow: 0 20px 70px rgb(22 34 51 / 22%) !important;
  }

  .art-ai-assistant {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background:
      radial-gradient(circle at 92% 2%, var(--el-color-primary-light-8), transparent 28%),
      linear-gradient(180deg, var(--el-color-primary-light-9), transparent 190px),
      var(--el-bg-color);

    &__header {
      display: flex;
      gap: 18px;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 78px;
      padding: 13px 20px;
      background:
        linear-gradient(105deg, transparent 35%, var(--el-color-primary-light-9)),
        var(--el-bg-color);

      &::after {
        position: absolute;
        right: 28%;
        bottom: -1px;
        left: 28%;
        height: 1px;
        pointer-events: none;
        content: '';
        background: linear-gradient(
          90deg,
          transparent,
          var(--el-color-primary-light-6),
          transparent
        );
      }
    }

    &__identity,
    &__title-row,
    &__status,
    &__header-actions,
    &__trace,
    &__message-actions,
    &__composer-actions,
    &__composer-meta,
    &__quick-actions,
    &__send-actions,
    &__capabilities,
    &__context-pill,
    &__thinking {
      display: flex;
      align-items: center;
    }

    &__identity {
      gap: 12px;
      min-width: 0;
    }

    &__brand-icon,
    &__welcome-mark,
    &__assistant-avatar,
    &__prompt-icon {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      color: var(--el-color-white);
      background: linear-gradient(145deg, var(--el-color-primary), #7559e8);
    }

    &__brand-icon {
      width: 42px;
      height: 42px;
      font-size: 20px;
      border-radius: var(--el-border-radius-base);
      box-shadow:
        0 8px 22px rgb(64 116 255 / 22%),
        0 0 0 5px var(--el-color-primary-light-9);
    }

    &__identity-copy {
      min-width: 0;
    }

    &__title-row {
      gap: 8px;

      strong {
        font-size: 16px;
        color: var(--el-text-color-primary);
      }

      > span {
        padding: 2px 8px;
        font-size: 10px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border: 1px solid var(--el-color-primary-light-8);
        border-radius: 999px;
      }
    }

    &__status {
      gap: 6px;
      min-width: 0;
      margin-top: 4px;
      font-size: 12px;
      color: var(--el-text-color-secondary);

      em {
        font-style: normal;
        color: var(--el-text-color-placeholder);
      }
    }

    &__connection {
      display: inline-flex;
      gap: 5px;
      align-items: center;

      i {
        box-sizing: content-box;
        width: 7px;
        height: 7px;
        background: var(--el-color-success);
        border: 2px solid var(--el-color-success-light-8);
        border-radius: 50%;

        &.is-offline {
          background: var(--el-color-danger);
          border-color: var(--el-color-danger-light-8);
        }
      }
    }

    &__page {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__header-actions {
      flex-shrink: 0;
      gap: 3px;
    }

    &__header-button {
      font-size: 18px;

      &:hover {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }
    }

    &__mode-switch {
      padding: 3px;
      margin-right: 4px;
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-extra-light);
      border-radius: var(--el-border-radius-base);

      :deep(.el-segmented__item-selected) {
        box-shadow: 0 4px 12px rgb(64 116 255 / 16%);
      }
    }

    &__messages {
      flex: 1;
      min-height: 0;
      background:
        radial-gradient(circle at 100% 0, var(--el-color-primary-light-9), transparent 34%),
        color-mix(in srgb, var(--el-fill-color-extra-light) 78%, transparent);
    }

    &__conversation {
      width: 100%;
      min-height: 100%;
      padding: 26px 24px 34px;
      margin: 0 auto;
    }

    &__welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 536px;
      padding-top: clamp(24px, 6vh, 66px);
      margin: 0 auto;
      text-align: center;

      h2 {
        margin: 10px 0 8px;
        font-size: 26px;
        font-weight: 650;
        color: var(--el-text-color-primary);
        letter-spacing: -0.5px;
      }

      > p {
        max-width: 430px;
        margin: 0;
        line-height: 1.7;
        color: var(--el-text-color-secondary);
      }
    }

    &__welcome-mark {
      position: relative;
      width: 58px;
      height: 58px;
      font-size: 28px;
      border-radius: var(--el-border-radius-base);
      box-shadow:
        0 14px 32px rgb(64 116 255 / 28%),
        0 0 0 9px rgb(64 116 255 / 7%);

      &::before {
        position: absolute;
        inset: -18px;
        z-index: -1;
        content: '';
        background: radial-gradient(circle, var(--el-color-primary-light-8), transparent 70%);
        border: 1px solid var(--el-color-primary-light-8);
        border-radius: 50%;
      }
    }

    &__eyebrow {
      margin-top: 18px;
      font-size: 10px;
      font-weight: 700;
      color: var(--el-color-primary);
      letter-spacing: 0.18em;
    }

    &__context-pill {
      gap: 6px;
      max-width: 100%;
      padding: 7px 11px;
      margin-top: 18px;
      font-size: 12px;
      color: var(--el-text-color-regular);
      background: color-mix(in srgb, var(--el-bg-color) 88%, var(--el-color-primary));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 999px;
      box-shadow: 0 5px 14px rgb(31 45 61 / 5%);

      > svg {
        color: var(--el-color-primary);
      }

      > span {
        color: var(--el-text-color-secondary);
      }

      strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &__prompt-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 11px;
      width: 100%;
      margin-top: 26px;
    }

    &__prompt-card {
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 11px;
      align-items: center;
      min-height: 88px;
      padding: 14px 13px;
      overflow: hidden;
      font: inherit;
      color: var(--el-text-color-primary);
      text-align: left;
      cursor: pointer;
      background:
        linear-gradient(125deg, var(--el-color-primary-light-9), transparent 62%),
        var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 5px 16px rgb(31 45 61 / 4%);
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;

      &::before {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 3px;
        content: '';
        background: linear-gradient(180deg, var(--el-color-primary-light-3), transparent);
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      &:hover:not(:disabled) {
        border-color: var(--el-color-primary-light-5);
        box-shadow: 0 12px 26px rgb(64 116 255 / 12%);
        transform: translateY(-2px);

        &::before {
          opacity: 1;
        }

        > svg,
        > :deep(svg) {
          color: var(--el-color-primary);
          transform: translate(1px, -1px);
        }
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      > span:nth-child(2) {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      strong {
        font-size: 13px;
        line-height: 1.45;
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      > svg,
      > :deep(svg) {
        color: var(--el-text-color-placeholder);
        transition:
          color 0.2s ease,
          transform 0.2s ease;
      }
    }

    &__prompt-icon {
      width: 34px;
      height: 34px;
      font-size: 16px;
      background: linear-gradient(
        145deg,
        var(--el-color-primary-light-8),
        var(--el-color-primary-light-9)
      );
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--el-border-radius-small);

      :deep(svg) {
        color: var(--el-color-primary);
      }
    }

    &__capabilities {
      flex-wrap: wrap;
      gap: 14px;
      justify-content: center;
      margin-top: 24px;
      font-size: 11px;
      color: var(--el-text-color-placeholder);

      span {
        display: inline-flex;
        gap: 4px;
        align-items: center;

        svg {
          color: var(--el-color-primary-light-3);
        }
      }
    }

    &__message {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 24px;

      &.is-user {
        flex-direction: row-reverse;

        .art-ai-assistant__message-body {
          align-items: flex-end;
        }

        .art-ai-assistant__bubble {
          color: var(--el-color-white);
          background: linear-gradient(
            145deg,
            var(--el-color-primary-light-3),
            var(--el-color-primary)
          );
          border-color: transparent;
          box-shadow: 0 8px 20px rgb(64 116 255 / 16%);
        }
      }

      &.is-error {
        .art-ai-assistant__bubble {
          color: var(--el-color-danger-dark-2);
          background: var(--el-color-danger-light-9);
          border-color: var(--el-color-danger-light-7);
        }
      }
    }

    &__avatar,
    &__assistant-avatar {
      flex-shrink: 0;
    }

    &__assistant-avatar {
      width: 32px;
      height: 32px;
      font-size: 15px;
      border-radius: var(--el-border-radius-small);
      box-shadow: 0 6px 16px rgb(64 116 255 / 18%);
    }

    &__message-body {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      max-width: min(84%, 470px);
    }

    &__message-meta {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
      font-size: 11px;
      color: var(--el-text-color-secondary);

      span:first-child {
        font-weight: 600;
        color: var(--el-text-color-regular);
      }
    }

    &__bubble {
      width: fit-content;
      max-width: 100%;
      padding: 12px 14px;
      line-height: 1.75;
      color: var(--el-text-color-primary);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 5px 18px rgb(31 45 61 / 5%);
    }

    &__message-content {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    &__trace {
      flex-wrap: wrap;
      gap: 5px;
      padding-top: 9px;
      margin-top: 9px;
      font-size: 10px;
      color: var(--el-text-color-secondary);
      border-top: 1px solid var(--el-border-color-extra-light);

      > span {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        padding: 3px 7px;
        background: var(--el-fill-color-light);
        border-radius: 999px;

        > svg {
          color: var(--el-text-color-placeholder);
        }

        &.art-ai-assistant__tool-chip {
          color: var(--el-color-success-dark-2);
          background: var(--el-color-success-light-9);

          > svg {
            color: var(--el-color-success);
          }

          &.is-failed {
            color: var(--el-color-danger-dark-2);
            background: var(--el-color-danger-light-9);

            > svg {
              color: var(--el-color-danger);
            }
          }
        }
      }
    }

    &__message-actions {
      min-height: 28px;
      margin: 5px -6px -5px;
      color: var(--el-text-color-secondary);
      opacity: 0.72;
      transition: opacity 0.18s ease;

      .el-button {
        padding-inline: 6px;

        + .el-button {
          margin-left: 0;
        }
      }
    }

    &__message:hover &__message-actions,
    &__message:focus-within &__message-actions {
      opacity: 1;
    }

    &__retry {
      margin-top: 8px;
    }

    &__thinking {
      gap: 8px;
      padding: 11px 13px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: linear-gradient(90deg, var(--el-color-primary-light-9), var(--el-bg-color));
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--el-border-radius-base);

      small {
        margin-left: 3px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__typing-dots {
      display: inline-flex;
      gap: 3px;
      align-items: center;

      i {
        width: 5px;
        height: 5px;
        background: var(--el-color-primary-light-3);
        border-radius: 50%;
        animation: assistant-typing 1.2s ease-in-out infinite;

        &:nth-child(2) {
          animation-delay: 0.16s;
        }

        &:nth-child(3) {
          animation-delay: 0.32s;
        }
      }
    }

    &__composer {
      position: relative;
      padding: 13px 20px 15px;
      background:
        linear-gradient(180deg, var(--el-color-primary-light-9), transparent 80%),
        var(--el-bg-color);
      border-top: 1px solid var(--el-border-color-lighter);

      &::before {
        position: absolute;
        top: -18px;
        right: 0;
        left: 0;
        height: 18px;
        pointer-events: none;
        content: '';
        background: linear-gradient(transparent, var(--el-bg-color));
      }

      p {
        margin: 9px 0 0;
        font-size: 10px;
        color: var(--el-text-color-placeholder);
        text-align: center;
      }
    }

    &__composer-content {
      width: 100%;
      margin: 0 auto;
    }

    &__quick-actions {
      gap: 6px;
      width: max-content;
      padding-bottom: 9px;

      button {
        display: inline-flex;
        flex: 0 0 auto;
        gap: 5px;
        align-items: center;
        padding: 5px 9px;
        font: inherit;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        background: var(--el-fill-color-extra-light);
        border: 1px solid var(--el-border-color-extra-light);
        border-radius: 999px;
        transition:
          color 0.18s ease,
          background-color 0.18s ease,
          border-color 0.18s ease;

        &:hover:not(:disabled) {
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
          border-color: var(--el-color-primary-light-7);
        }

        &:focus-visible {
          outline: 2px solid var(--el-color-primary-light-5);
          outline-offset: 2px;
        }

        &:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
      }
    }

    &__composer-box {
      padding: 9px 9px 8px 12px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 9px 28px rgb(31 45 61 / 8%);
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease;

      &:focus-within {
        border-color: var(--el-color-primary-light-5);
        box-shadow:
          0 10px 30px rgb(64 116 255 / 12%),
          0 0 0 3px var(--el-color-primary-light-9);
      }

      :deep(.el-textarea__inner) {
        min-height: 60px !important;
        padding: 3px 2px 8px;
        line-height: 1.65;
        background: transparent;
        border: 0;
        box-shadow: none;
      }
    }

    &__composer-actions {
      gap: 12px;
      justify-content: space-between;
    }

    &__composer-meta {
      gap: 10px;
      min-width: 0;
      font-size: 10px;
      color: var(--el-text-color-placeholder);

      span {
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
    }

    &__keyboard-hint {
      color: var(--el-text-color-placeholder);
    }

    &__send-actions {
      flex: 0 0 auto;
      gap: 8px;

      small {
        font-size: 10px;
        color: var(--el-text-color-placeholder);
      }

      .art-ai-assistant__send-button {
        width: 36px;
        height: 36px;
        margin: 0;
      }
    }

    &.is-expanded {
      background: var(--default-box-color);

      .art-ai-assistant__conversation {
        max-width: 980px;
        padding: 32px 40px 46px;
      }

      .art-ai-assistant__welcome {
        max-width: 760px;
      }

      .art-ai-assistant__message-body {
        max-width: min(82%, 760px);
      }

      .art-ai-assistant__composer-content {
        max-width: 980px;
      }
    }
  }

  @keyframes assistant-typing {
    0%,
    60%,
    100% {
      opacity: 0.35;
      transform: translateY(0);
    }

    30% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }

  @media (width <= 640px) {
    .art-ai-assistant {
      &__header {
        flex-wrap: wrap;
        padding: 12px 14px;
      }

      &__identity {
        flex: 1 1 100%;
      }

      &__header-actions {
        justify-content: flex-end;
        width: 100%;
      }

      &__title-row,
      &__connection {
        white-space: nowrap;
      }

      &__conversation {
        padding: 20px 14px 24px;
      }

      &__prompt-grid {
        grid-template-columns: 1fr;
      }

      &__welcome {
        padding-top: 18px;
      }

      &__composer {
        padding: 12px;
      }

      &__keyboard-hint {
        display: none !important;
      }

      &__send-actions small {
        display: none;
      }

      &__message-body {
        max-width: 87%;
      }
    }
  }
</style>
