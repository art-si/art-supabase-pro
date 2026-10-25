<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="notification-channel-dialog grid gap-4">
      <ElAlert
        :title="channelHelp.title"
        :description="channelHelp.description"
        :type="channel.channelCode === 'in_app' ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="18"
        label-width="104px"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { ElAlert, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { saveNotificationChannel } from '@/api/notification-reminder'

  interface Props {
    tenantId: string
  }

  interface ChannelForm {
    enabled: boolean
    providerCode: string
    fromEmail: string
    senderName: string
    endpointUrl: string
    templateCode: string
    apiKey: string
    webhookUrl: string
    authorization: string
    signSecret: string
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Api.NotificationReminder.ChannelConfig>>()
  const formRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const channel = reactive<Api.NotificationReminder.ChannelConfig>({
    id: '',
    tenantId: '',
    channelCode: 'in_app',
    providerCode: 'builtin',
    enabled: true,
    config: {},
    secretConfigured: true
  })
  const form = reactive<ChannelForm>({
    enabled: true,
    providerCode: 'builtin',
    fromEmail: '',
    senderName: '',
    endpointUrl: '',
    templateCode: '',
    apiKey: '',
    webhookUrl: '',
    authorization: '',
    signSecret: ''
  })

  const channelName: Record<Api.NotificationReminder.ChannelCode, string> = {
    in_app: '站内通知',
    email: '邮件',
    sms: '短信',
    dingtalk: '钉钉',
    wecom: '企业微信'
  }
  const channelHelp = computed(() => {
    if (channel.channelCode === 'in_app') {
      return {
        title: '站内通知无需外部凭据',
        description: '消息会进入顶部通知中心，并保留已读状态。'
      }
    }
    return {
      title: `${channelName[channel.channelCode]}凭据由 Supabase Vault 加密保存`,
      description: '编辑时不回显密钥；留空表示保留现有凭据。测试失败会记录真实错误原因。'
    }
  })

  const rules = computed<FormRules<ChannelForm>>(() => ({
    fromEmail:
      channel.channelCode === 'email' && form.enabled
        ? [{ required: true, message: '请输入发件邮箱', trigger: 'blur' }]
        : [],
    apiKey:
      channel.channelCode === 'email' && form.enabled && !channel.secretConfigured
        ? [{ required: true, message: '首次启用需填写 API Key', trigger: 'blur' }]
        : [],
    webhookUrl:
      channel.channelCode !== 'in_app' &&
      channel.channelCode !== 'email' &&
      form.enabled &&
      !channel.secretConfigured
        ? [{ required: true, message: '首次启用需填写服务地址', trigger: 'blur' }]
        : []
  }))

  const items = computed<FormItem[]>(() => [
    {
      label: '启用渠道',
      key: 'enabled',
      type: 'switch',
      span: 24,
      props: {
        disabled: channel.channelCode === 'in_app',
        activeText: '启用',
        inactiveText: '停用'
      }
    },
    {
      label: '服务商',
      key: 'providerCode',
      type: 'text',
      span: 24,
      props: {
        formatter: () =>
          channel.channelCode === 'email'
            ? 'Resend API'
            : channel.channelCode === 'sms'
              ? '通用 HTTP 短信网关'
              : channel.channelCode === 'in_app'
                ? '系统内置'
                : '群机器人 Webhook'
      }
    },
    {
      label: '发件邮箱',
      key: 'fromEmail',
      type: 'input',
      hidden: () => channel.channelCode !== 'email',
      props: { placeholder: 'notice@example.com' }
    },
    {
      label: '发件名称',
      key: 'senderName',
      type: 'input',
      hidden: () => channel.channelCode !== 'email',
      props: { placeholder: '业务提醒中心' }
    },
    {
      label: 'API 地址',
      key: 'endpointUrl',
      type: 'input',
      span: 24,
      hidden: () => channel.channelCode !== 'email',
      props: { placeholder: '留空使用 https://api.resend.com/emails' }
    },
    {
      label: 'API Key',
      key: 'apiKey',
      type: 'input',
      span: 24,
      hidden: () => channel.channelCode !== 'email',
      props: { type: 'password', showPassword: true, autocomplete: 'new-password' }
    },
    {
      label: '服务地址',
      key: 'webhookUrl',
      type: 'input',
      span: 24,
      hidden: () => ['in_app', 'email'].includes(channel.channelCode),
      props: {
        type: 'password',
        showPassword: true,
        autocomplete: 'new-password',
        placeholder: channel.channelCode === 'sms' ? '短信网关 HTTP 地址' : '机器人 Webhook 地址'
      }
    },
    {
      label: '签名密钥',
      key: 'signSecret',
      type: 'input',
      span: 24,
      hidden: () => channel.channelCode !== 'dingtalk',
      props: { type: 'password', showPassword: true, autocomplete: 'new-password' },
      description: '钉钉机器人启用加签时填写。'
    },
    {
      label: '认证请求头',
      key: 'authorization',
      type: 'input',
      span: 24,
      hidden: () => channel.channelCode !== 'sms',
      props: { type: 'password', showPassword: true, autocomplete: 'new-password' },
      description: '例如 Bearer token；短信网关不需要时可留空。'
    },
    {
      label: '模板编码',
      key: 'templateCode',
      type: 'input',
      span: 24,
      hidden: () => channel.channelCode !== 'sms',
      props: { placeholder: '网关无需模板时可留空' }
    }
  ])

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    const config: Record<string, unknown> = {}
    const secret: Record<string, unknown> = {}
    if (channel.channelCode === 'email') {
      Object.assign(config, {
        fromEmail: form.fromEmail.trim(),
        senderName: form.senderName.trim(),
        endpointUrl: form.endpointUrl.trim()
      })
      if (form.apiKey.trim()) secret.apiKey = form.apiKey.trim()
    } else if (channel.channelCode === 'sms') {
      config.templateCode = form.templateCode.trim()
      if (form.webhookUrl.trim()) secret.webhookUrl = form.webhookUrl.trim()
      if (form.authorization.trim()) secret.authorization = form.authorization.trim()
    } else if (channel.channelCode === 'dingtalk') {
      if (form.webhookUrl.trim()) secret.webhookUrl = form.webhookUrl.trim()
      if (form.signSecret.trim()) secret.signSecret = form.signSecret.trim()
    } else if (channel.channelCode === 'wecom' && form.webhookUrl.trim()) {
      secret.webhookUrl = form.webhookUrl.trim()
    }

    try {
      await saveNotificationChannel({
        tenantId: props.tenantId,
        channelCode: channel.channelCode,
        providerCode: form.providerCode,
        enabled: channel.channelCode === 'in_app' ? true : form.enabled,
        config,
        secret: Object.keys(secret).length ? secret : null
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '通知渠道保存失败，请核对配置后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (row: Api.NotificationReminder.ChannelConfig): Promise<void> => {
    Object.assign(channel, structuredClone(toRaw(row)))
    const config = row.config ?? {}
    Object.assign(form, {
      enabled: row.channelCode === 'in_app' ? true : row.enabled,
      providerCode: row.providerCode,
      fromEmail: String(config.fromEmail ?? ''),
      senderName: String(config.senderName ?? ''),
      endpointUrl: String(config.endpointUrl ?? ''),
      templateCode: String(config.templateCode ?? ''),
      apiKey: '',
      webhookUrl: '',
      authorization: '',
      signSecret: ''
    })
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(row, {
      title: `配置${channelName[row.channelCode]}`,
      contentMaxHeight: '68vh',
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>
