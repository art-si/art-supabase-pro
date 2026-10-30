<template>
  <ArtDrawer
    ref="drawerRef"
    :size="640"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="关闭"
  >
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <span class="art-icon-label text-sm font-medium"
          ><ArtSvgIcon
            :icon="snapshot ? 'ri:checkbox-circle-line' : 'ri:database-2-line'"
            :class="snapshot ? 'text-success' : 'text-g-600'"
          />{{ snapshot ? '连接服务已就绪' : loading ? '正在连接服务…' : '数据库连接服务' }}</span
        >
        <ElButton :loading="loading" @click="connect"
          ><ArtSvgIcon icon="ri:refresh-line" />{{ snapshot ? '刷新连接' : '连接执行端' }}</ElButton
        >
      </div>
      <details class="connection-manager__advanced">
        <summary class="art-icon-label text-xs text-g-600"
          ><ArtSvgIcon icon="ri:settings-3-line" />高级连接设置</summary
        >
        <ArtForm
          v-model="endpoint"
          :items="endpointItems"
          :show-submit="false"
          :show-reset="false"
          label-position="top"
        />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <ElButton @click="copyCommand"
            ><ArtSvgIcon icon="ri:terminal-box-line" />复制启动命令</ElButton
          >
        </div>
        <p class="m-0 text-xs leading-5 text-g-600"
          >项目启动时会自动检查本机执行端。单独使用时运行 pnpm sql:gateway，启动后可关闭终端。远程
          HTTPS 地址须由管理员配置为可信地址；密码由执行端加密保存。</p
        >
      </details>
      <ArtAsyncState
        :loading="loading"
        :error="error"
        error-title="数据库连接服务未就绪"
        :empty="!snapshot"
        empty-text="连接数据库执行端"
        empty-description="连接后可管理 PostgreSQL、MySQL、达梦 DM8 数据源"
        size="compact"
        @retry="connect"
      >
        <template v-if="snapshot">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">数据库连接 · {{ snapshot.connections.length }}</span>
            <ElButton v-if="snapshot.canManage" type="primary" @click="edit()"
              ><ArtSvgIcon icon="ri:add-line" />新建连接</ElButton
            >
          </div>
          <ArtEmptyState
            v-if="!snapshot.connections.length"
            title="暂无可用连接"
            :description="
              snapshot.canManage ? '新建连接并测试数据库访问' : '请联系管理员授权本租户的只读连接'
            "
            size="compact"
          />
          <div
            v-for="connection in snapshot.connections"
            :key="connection.id"
            class="connection-manager__item"
          >
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded bg-primary/10 text-primary"
              ><ArtSvgIcon icon="ri:database-2-line"
            /></span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium" :title="connection.name">{{
                connection.name
              }}</div>
              <div
                class="truncate text-xs leading-5 text-g-600"
                :title="`${connection.host}:${connection.port} / ${getSqlDatabaseLabel(connection)}`"
                >{{ SQL_DIALECT_LABELS[connection.dialect] }} ·
                {{ getSqlDatabaseLabel(connection) }} ·
                {{ connection.enabled ? '只读' : '已停用' }}</div
              >
            </div>
            <ElButton v-if="snapshot.canManage" size="small" @click="edit(connection)"
              >编辑</ElButton
            >
            <ElButton size="small" :disabled="!connection.enabled" @click="use(connection)"
              >使用</ElButton
            >
          </div>
        </template>
      </ArtAsyncState>
    </div>
  </ArtDrawer>
  <ArtDialog ref="formDialogRef">
    <div class="flex flex-col gap-3">
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="rules"
        :show-submit="false"
        :show-reset="false"
        label-position="top"
      >
        <template #allowedUserIds>
          <ArtUserSelect
            v-model="form.allowedUserIds"
            multiple
            :options="userOptions"
            placeholder="默认仅平台超级管理员可用"
          />
        </template>
      </ArtForm>
      <p class="m-0 text-xs leading-5 text-g-600"
        >请使用数据库只读账号。授权用户可以读取此数据库账号可见的数据；连接仅向所属租户内的授权账号开放。</p
      >
      <div class="flex items-center gap-3">
        <ElButton :loading="testing" @click="test">测试连接</ElButton>
        <span
          v-if="testMessage"
          class="text-xs"
          :class="testOk ? 'text-success' : 'text-danger'"
          role="status"
          >{{ testMessage }}</span
        >
      </div>
    </div>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUserSelect from '@/components/core/forms/art-user-select/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { fetchTenantList } from '@/api/system-manage/tenant'
  import { fetchSqlConnections, saveSqlConnection, testSqlConnection } from '@/api/sql-connections'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    validateSqlConnection,
    SQL_DIALECT_LABELS,
    SQL_DIALECT_PORTS,
    getSqlDatabaseLabel
  } from '@/utils/sql-connections'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import type {
    SqlConnection,
    SqlConnectionInput,
    SqlGatewaySnapshot
  } from '@/types/sql-connections'

  const props = defineProps<{ base: string }>()
  const emit = defineEmits<{
    connected: [base: string, snapshot: SqlGatewaySnapshot]
    use: [connection: SqlConnection]
  }>()
  const userStore = useUserStore()
  const tenantScope = useTenantScopeStore()
  const scope = computed(() => tenantScope.effectiveTenantId || 'all')
  const drawerRef = ref<ArtDrawerExpose>()
  const formDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const endpoint = ref({ base: props.base })
  const endpointItems: FormItem[] = [
    {
      key: 'base',
      label: 'SQL 执行端地址',
      type: 'input',
      span: 24,
      placeholder: 'http://127.0.0.1:4319'
    }
  ]
  const loading = ref(false)
  const error = ref('')
  const snapshot = ref<SqlGatewaySnapshot | null>(null)
  let generation = 0
  const emptyForm = (): SqlConnectionInput => ({
    name: '',
    dialect: 'postgres',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    tls: true,
    enabled: true,
    tenantId: tenantScope.effectiveTenantId || userStore.getUserInfo.tenantId || '',
    allowedUserIds: []
  })
  const form = ref<SqlConnectionInput>(emptyForm())
  const testing = ref(false)
  const testOk = ref(false)
  const testMessage = ref('')
  const userOptions = computed(() =>
    (snapshot.value?.users || [])
      .filter((user) => user.tenantId === form.value.tenantId)
      .map((user) => ({ value: user.id, label: user.name }))
  )
  const formItems = computed<FormItem[]>(() => [
    { key: 'name', label: '连接名称', type: 'input', span: 24, props: { maxlength: 80 } },
    {
      key: 'dialect',
      label: '数据库类型',
      type: 'segment',
      span: 24,
      options: [
        { label: 'PostgreSQL', value: 'postgres' },
        { label: 'MySQL', value: 'mysql' },
        { label: '达梦 DM8', value: 'dm' }
      ]
    },
    { key: 'host', label: '主机地址', type: 'input', span: 16, placeholder: '数据库域名或 IP' },
    {
      key: 'port',
      label: '端口',
      type: 'number',
      span: 8,
      props: { min: 1, max: 65535, controlsPosition: 'right' }
    },
    {
      key: 'database',
      label: form.value.dialect === 'dm' ? '默认 schema（可选）' : '数据库名称',
      type: 'input',
      span: 12,
      placeholder:
        form.value.dialect === 'dm' ? '留空使用账号默认 schema' : '填写实际库名，不是主机 IP',
      description:
        form.value.dialect === 'dm'
          ? '达梦按主机、端口和账号连接；此处填写模式名，不填写 IP。'
          : undefined
    },
    {
      key: 'username',
      label: '数据库账号',
      type: 'input',
      span: 12,
      props: { autocomplete: 'off' }
    },
    {
      key: 'password',
      label: '数据库密码',
      description: '仅发送给执行端。编辑时留空保留已有密码。',
      type: 'input',
      span: 24,
      placeholder: form.value.id ? '留空保留已有密码' : '仅发送给执行端，不写入浏览器存储',
      props: { type: 'password', showPassword: true, autocomplete: 'new-password' }
    },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 24,
      api: () => fetchTenantList({ status: '1', from: 0, to: 999 }),
      resultField: 'data',
      labelField: 'tenantName',
      valueField: 'id',
      props: { disabled: Boolean(form.value.id) || Boolean(tenantScope.effectiveTenantId) }
    },
    {
      key: 'tls',
      label: 'TLS 加密连接',
      type: 'switch',
      span: 12,
      props: { disabled: form.value.dialect === 'dm' },
      description: form.value.dialect === 'dm' ? '当前达梦驱动支持内网直连' : undefined
    },
    { key: 'enabled', label: '启用连接', type: 'switch', span: 12 },
    { key: 'allowedUserIds', label: '授权只读账号', span: 24 }
  ])
  const rules = computed(() => ({
    name: [{ required: true, message: '请输入连接名称' }],
    host: [{ required: true, message: '请输入主机地址' }],
    database: [{ required: form.value.dialect !== 'dm', message: '请输入数据库名称' }],
    username: [{ required: true, message: '请输入数据库账号' }],
    tenantId: [{ required: true, message: '请选择所属租户' }]
  }))
  const message = (cause: unknown) =>
    getFriendlySupabaseErrorMessage(cause, '连接操作失败，请检查执行端后重试')
  const connect = async () => {
    if (loading.value) return
    const current = ++generation
    loading.value = true
    error.value = ''
    try {
      const value = await fetchSqlConnections(endpoint.value.base, scope.value)
      if (current !== generation) return
      snapshot.value = value
      emit('connected', endpoint.value.base, value)
    } catch (cause) {
      if (current === generation) error.value = message(cause)
    } finally {
      if (current === generation) loading.value = false
    }
  }
  const edit = async (connection?: SqlConnection) => {
    form.value = connection
      ? { ...connection, allowedUserIds: [...connection.allowedUserIds], password: '' }
      : emptyForm()
    testMessage.value = ''
    await formDialogRef.value?.handleOpen(undefined, {
      title: connection ? '编辑数据库连接' : '新建数据库连接',
      subtitle: 'PostgreSQL / MySQL / 达梦 DM8 · 只读查询',
      width: 640,
      confirmText: '保存连接',
      onConfirm: async () => {
        const current = generation
        const owner = scope.value
        const base = endpoint.value.base
        try {
          await formRef.value?.validate()
          if (current !== generation) return false
          const input = validateSqlConnection(form.value)
          await saveSqlConnection(base, owner, input)
          if (current !== generation) return false
          form.value.password = ''
          await connect()
          ElMessage.success('连接已保存')
          return true
        } catch (cause) {
          if (cause instanceof Error) ElMessage.warning(message(cause))
          return false
        }
      },
      onClose: () => {
        form.value.password = ''
        testMessage.value = ''
      }
    })
  }
  const test = async () => {
    if (testing.value) return
    const current = generation
    const owner = scope.value
    const base = endpoint.value.base
    testing.value = true
    testMessage.value = ''
    try {
      await formRef.value?.validate()
      if (current !== generation) return
      await testSqlConnection(base, owner, validateSqlConnection(form.value))
      if (current === generation) {
        testOk.value = true
        testMessage.value = '连接成功 · 只读事务可用'
      }
    } catch (cause) {
      if (current === generation) {
        testOk.value = false
        testMessage.value = message(cause)
      }
    } finally {
      testing.value = false
    }
  }
  const use = (connection: SqlConnection) => {
    emit('use', connection)
    drawerRef.value?.handleClose()
  }
  const copyCommand = async () => {
    try {
      await copyTextToClipboard('pnpm sql:gateway')
      ElMessage.success('启动命令已复制')
    } catch {
      ElMessage.warning('复制失败，请手动运行 pnpm sql:gateway')
    }
  }
  watch(
    () => [userStore.getUserInfo.userId, scope.value],
    () => {
      generation++
      loading.value = false
      snapshot.value = null
      form.value = emptyForm()
      error.value = ''
      formDialogRef.value?.handleClose()
      drawerRef.value?.handleClose()
    }
  )
  watch(
    () => form.value.dialect,
    (value, before) => {
      if (before && value !== before && form.value.port === SQL_DIALECT_PORTS[before])
        form.value.port = SQL_DIALECT_PORTS[value]
      if (value === 'dm' && value !== before) form.value.tls = false
      if (value === 'dm' && form.value.database === form.value.host) form.value.database = ''
      testMessage.value = ''
    }
  )
  watch(
    () => form.value.tenantId,
    () => {
      form.value.allowedUserIds = form.value.allowedUserIds.filter((id) =>
        userOptions.value.some((user) => user.value === id)
      )
    }
  )
  defineExpose({
    open: () => {
      endpoint.value.base = props.base
      void connect()
      return drawerRef.value?.handleOpen(undefined, {
        title: '数据库连接',
        subtitle: '连接执行端，管理只读数据源',
        headerIcon: 'ri:database-2-line'
      })
    }
  })
</script>
<style scoped lang="scss">
  .connection-manager__item {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .connection-manager__advanced {
    > summary {
      justify-content: flex-start;
      min-height: 32px;
      cursor: pointer;
      list-style: none;

      &::-webkit-details-marker {
        display: none;
      }

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
      }
    }

    > .art-form {
      margin-top: 12px;
    }
  }
</style>
