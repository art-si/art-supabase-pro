<template>
  <div class="page-content mb-5">
    <div class="mb-8 text-center">
      <h1 class="my-4 text-2xl font-semibold leading-tight">WebSocket 连接示例</h1>
      <p class="m-0 text-base leading-relaxed text-g-700">
        实时通信演示，支持连接管理、消息收发和状态监控
      </p>
    </div>

    <!-- 连接状态和统计信息 -->
    <ElRow :gutter="20" class="mb-6">
      <ElCol :xs="24" :sm="12" :md="8">
        <ElCard class="h-full border-0" :body-style="{ padding: '20px' }">
          <div class="text-center">
            <div class="text-2xl font-bold text-[var(--theme-color)] mb-1">{{ messageCount }}</div>
            <div class="text-sm font-medium text-g-900 mb-1">消息统计</div>
            <div class="text-xs text-g-700">接收到的消息数量</div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :sm="12" :md="8">
        <ElCard class="h-full border-0" :body-style="{ padding: '20px' }">
          <div class="text-center">
            <ElTag :type="connectionTagType" size="large" class="mb-2">
              {{ connectionStatusText }}
            </ElTag>
            <div class="text-sm font-medium text-g-900">连接状态</div>
            <div class="text-xs text-g-700">当前 WebSocket 连接状态</div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :sm="12" :md="8">
        <ElCard class="h-full border-0" :body-style="{ padding: '20px' }">
          <div class="text-center">
            <div class="text-2xl font-bold text-[var(--el-color-warning)] mb-1">
              {{ reconnectCount }}
            </div>
            <div class="text-sm font-medium text-g-900 mb-1">重连次数</div>
            <div class="text-xs text-g-700">自动重连尝试次数</div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 连接配置和发送消息 -->
    <ElRow :gutter="20" class="mb-6">
      <ElCol :xs="24" :md="12">
        <ElCard class="h-full border-0">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">连接配置</span>
              <ElTag :type="connectionTagType" size="large">
                {{ connectionStatusText }}
              </ElTag>
            </div>
          </template>

          <ArtForm
            custom-layout
            :show-reset="false"
            :show-submit="false"
            v-model="connectForm"
            label-position="top"
            form-class="max-w-md"
          >
            <ElFormItem label="服务器地址">
              <ElInput v-model="connectForm.url" placeholder="ws://localhost:8080/ws" clearable />
            </ElFormItem>
            <ElFormItem label="连接选项">
              <ElSpace wrap>
                <ElCheckbox v-model="connectForm.autoReconnect">自动重连</ElCheckbox>
                <ElCheckbox v-model="connectForm.heartbeat">心跳检测</ElCheckbox>
              </ElSpace>
            </ElFormItem>
            <ElFormItem>
              <ElSpace wrap>
                <ElButton
                  type="primary"
                  @click="handleConnect"
                  :loading="isConnecting"
                  :disabled="isConnected"
                >
                  {{ isConnecting ? '连接中...' : '连接' }}
                </ElButton>
                <ElButton
                  type="danger"
                  @click="handleDisconnect"
                  :disabled="!isConnected && !isConnecting && reconnectCount === 0"
                >
                  断开连接
                </ElButton>
                <ElButton @click="handleReconnect" :disabled="isConnecting">重连</ElButton>
              </ElSpace>
            </ElFormItem>
          </ArtForm>
        </ElCard>
      </ElCol>

      <ElCol :xs="24" :md="12">
        <ElCard class="h-full border-0">
          <template #header>
            <span class="text-base font-bold">发送消息</span>
          </template>

          <ArtForm
            custom-layout
            :show-reset="false"
            :show-submit="false"
            v-model="messageForm"
            label-position="top"
            @submit="handleSendMessage"
          >
            <ElFormItem label="消息类型">
              <ElSelect v-model="messageForm.type" class="w-full">
                <ElOption label="文本消息" value="text" />
                <ElOption label="JSON数据" value="json" />
                <ElOption label="心跳包" value="ping" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="消息内容">
              <ElInput
                v-model="messageForm.content"
                type="textarea"
                :rows="4"
                placeholder="请输入要发送的消息内容"
              />
            </ElFormItem>
            <ElFormItem>
              <ElSpace wrap>
                <ElButton
                  type="primary"
                  @click="handleSendMessage"
                  :disabled="!isConnected || !messageForm.content"
                >
                  发送消息
                </ElButton>
                <ElButton @click="clearMessageForm">清空</ElButton>
              </ElSpace>
            </ElFormItem>
          </ArtForm>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 接收消息 - 单独占一行 -->
    <ElRow class="mb-6">
      <ElCol :span="24">
        <ElCard class="border-0">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">接收消息</span>
              <ElButton size="small" @click="clearMessages">清空记录</ElButton>
            </div>
          </template>

          <ElScrollbar class="message-container" max-height="24rem">
            <div v-for="message in messageList" :key="message.id" class="message-item">
              <div class="message-header">
                <ElTag size="small" :type="message.type === 'received' ? 'success' : 'info'">
                  {{ message.type === 'received' ? '接收' : '发送' }}
                </ElTag>
                <span class="message-time">{{ message.time }}</span>
              </div>
              <div class="message-content">{{ message.content }}</div>
            </div>

            <ArtEmptyState
              v-if="messageList.length === 0"
              title="暂无消息记录"
              description="发送消息后会显示在此。"
              :visual-size="88"
              size="compact"
            />
          </ElScrollbar>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 连接日志 -->
    <ElCard class="border-0">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-base font-bold">连接日志</span>
          <ElButton size="small" @click="clearLogs">清空日志</ElButton>
        </div>
      </template>

      <ElScrollbar class="log-container" max-height="16rem">
        <ElAlert
          v-for="log in logList"
          :key="log.id"
          :type="log.type"
          :closable="false"
          class="!mb-2"
        >
          <template #title>
            <div class="flex items-start gap-2">
              <span class="text-xs opacity-70 whitespace-nowrap">{{ log.time }}</span>
              <span class="flex-1">{{ log.message }}</span>
            </div>
          </template>
        </ElAlert>

        <ArtEmptyState
          v-if="logList.length === 0"
          title="暂无日志记录"
          description="连接与消息事件会显示在此。"
          :visual-size="88"
          size="compact"
        />
      </ElScrollbar>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { useIntervalFn, useWebSocket } from '@vueuse/core'
  import { ElMessage } from 'element-plus'

  defineOptions({ name: 'SocketChat' })

  const reconnectCount = ref(0)
  const messageCount = ref(0)

  // 表单数据
  const connectForm = ref({
    url: 'ws://localhost:8080/ws',
    autoReconnect: true,
    heartbeat: true
  })

  const messageForm = ref({
    type: 'text',
    content: ''
  })

  const socketUrl = ref<string>()
  const manuallyClosed = ref(false)
  const { status, ws, open, close, send } = useWebSocket<string>(socketUrl, {
    immediate: false,
    autoConnect: false,
    autoReconnect: {
      retries: (retried) => !manuallyClosed.value && connectForm.value.autoReconnect && retried < 5,
      delay: (attempt) => {
        reconnectCount.value = attempt
        addLog('warning', `自动重连中（第 ${attempt}/5 次）`)
        return Math.min(5_000 * 1.5 ** (attempt - 1), 25_000)
      },
      onFailed: () => {
        reconnectCount.value = 0
        if (!manuallyClosed.value && connectForm.value.autoReconnect) {
          addLog('error', '自动重连已停止，请检查服务后手动重连')
        }
      }
    },
    onConnected: () => {
      reconnectCount.value = 0
      addLog('success', 'WebSocket 连接成功')
    },
    onDisconnected: (socket, event) => {
      if (socket !== ws.value) return
      if (event.code === 1000) manuallyClosed.value = true
      if (!manuallyClosed.value) addLog('warning', '连接已断开，正在检查重连设置')
    },
    onError: () => addLog('error', 'WebSocket 连接失败，请检查服务地址'),
    onMessage: (socket, event) => {
      if (socket === ws.value) handleSocketMessage(event)
    }
  })
  const isConnecting = computed(() => status.value === 'CONNECTING')
  const isConnected = computed(() => status.value === 'OPEN')
  const connectionStatusText = computed(() => {
    if (isConnected.value) return '已连接'
    if (isConnecting.value) return '正在连接'
    if (reconnectCount.value && !manuallyClosed.value) {
      return `重连中（${reconnectCount.value}/5）`
    }
    return '已断开'
  })
  const { pause: pausePing, resume: resumePing } = useIntervalFn(
    () => {
      if (isConnected.value) send('ping', false)
    },
    10_000,
    { immediate: false }
  )
  watch(
    [isConnected, () => connectForm.value.heartbeat],
    ([connected, enabled]) => {
      if (connected && enabled) resumePing()
      else pausePing()
    },
    { immediate: true }
  )
  watch(
    () => connectForm.value.autoReconnect,
    (enabled) => {
      if (!enabled && status.value === 'CLOSED') {
        manuallyClosed.value = true
        reconnectCount.value = 0
        close()
      }
    }
  )

  // 消息和日志列表
  let nextMessageId = 0
  let nextLogId = 0
  const messageList = ref<
    Array<{
      id: number
      type: 'sent' | 'received'
      content: string
      time: string
    }>
  >([])

  const logList = ref<
    Array<{
      id: number
      type: 'info' | 'success' | 'warning' | 'error'
      message: string
      time: string
    }>
  >([])

  // 计算属性
  const connectionTagType = computed(() => {
    if (isConnecting.value) return 'warning'
    if (isConnected.value) return 'success'
    return 'danger'
  })

  /**
   * 添加日志
   */
  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    logList.value.unshift({
      id: ++nextLogId,
      type,
      message,
      time: new Date().toLocaleTimeString()
    })

    // 限制日志数量
    if (logList.value.length > 100) {
      logList.value = logList.value.slice(0, 100)
    }
  }

  /**
   * 添加消息记录
   */
  const addMessage = (type: 'sent' | 'received', content: string) => {
    messageList.value.unshift({
      id: ++nextMessageId,
      type,
      content,
      time: new Date().toLocaleTimeString()
    })

    // 限制消息数量
    if (messageList.value.length > 50) {
      messageList.value = messageList.value.slice(0, 50)
    }
  }

  /**
   * 处理WebSocket消息
   */
  const handleSocketMessage = (event: MessageEvent) => {
    const content = typeof event.data === 'string' ? event.data : '[二进制消息]'
    messageCount.value++
    addMessage('received', content)
    addLog('success', '收到消息')
  }

  const connectSocket = (force = false) => {
    if (!force && (isConnecting.value || isConnected.value)) return

    let address: URL
    try {
      address = new URL(connectForm.value.url.trim())
      if (!['ws:', 'wss:'].includes(address.protocol) || address.hash) {
        ElMessage.warning('请输入有效的 WebSocket 地址')
        return
      }
      if (window.location.protocol === 'https:' && address.protocol === 'ws:') {
        ElMessage.warning('当前页面使用 HTTPS，请输入 wss:// 地址')
        return
      }
    } catch {
      ElMessage.warning('请输入有效的 WebSocket 地址')
      return
    }

    manuallyClosed.value = false
    reconnectCount.value = 0
    socketUrl.value = address.href
    addLog('info', '正在连接 WebSocket 服务')
    try {
      open()
    } catch {
      status.value = 'CLOSED'
      addLog('error', '连接失败，请检查服务器地址后重试')
      ElMessage.error('连接失败，请检查服务器地址')
    }
  }

  const handleConnect = () => connectSocket()

  const handleDisconnect = () => {
    manuallyClosed.value = true
    reconnectCount.value = 0
    pausePing()
    close(1000, '手动断开')
    // VueUse close() 清理 ws 引用后不会更新 status。
    status.value = 'CLOSED'
    addLog('info', '手动断开 WebSocket 连接')
  }

  const handleReconnect = () => connectSocket(true)

  /**
   * 发送消息
   */
  const handleSendMessage = () => {
    if (!isConnected.value) {
      ElMessage.warning('请先建立 WebSocket 连接')
      return
    }

    let message = messageForm.value.content

    // 根据消息类型处理内容
    switch (messageForm.value.type) {
      case 'json':
        try {
          // 验证是否为有效JSON
          JSON.parse(message)
        } catch {
          ElMessage.error('请输入有效的 JSON 格式数据')
          return
        }
        break
      case 'ping':
        message = 'ping'
        break
    }

    try {
      if (!send(message, false)) {
        ElMessage.warning('消息未发送，请重新连接后重试')
        return
      }
      addMessage('sent', message)
      addLog('info', '已发送消息')
      ElMessage.success('消息发送成功')
    } catch {
      addLog('error', '发送失败，请检查连接状态后重试')
      ElMessage.error('发送消息失败')
    }
  }

  /**
   * 清空消息表单
   */
  const clearMessageForm = () => {
    messageForm.value.content = ''
  }

  /**
   * 清空消息记录
   */
  const clearMessages = () => {
    messageList.value = []
  }

  /**
   * 清空日志
   */
  const clearLogs = () => {
    logList.value = []
  }
</script>

<style scoped>
  @reference '@styles/core/tailwind.css';

  .message-container {
    :deep(.el-scrollbar__view) {
      @apply space-y-3;
    }
  }

  .message-item {
    @apply p-3 rounded-lg border border-g-300;

    background: var(--default-box-color);
  }

  .message-header {
    @apply flex items-center justify-between mb-2;
  }

  .message-time {
    @apply text-xs text-g-700;
  }

  .message-content {
    @apply text-sm text-g-800 break-words font-mono bg-g-200 p-2 rounded;

    overflow-wrap: anywhere;
  }
</style>
