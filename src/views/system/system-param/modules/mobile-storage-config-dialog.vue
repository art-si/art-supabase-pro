<template>
  <ArtDialog
    ref="dialogRef"
    size="md"
    :confirm-disabled="!current || optionsLoading || Boolean(optionsError)"
  >
    <div class="mobile-storage-config-dialog">
      <section class="mobile-storage-config-dialog__context">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:smartphone-line" /></span>
        <div>
          <strong>设置时光记事的云端使用资格</strong>
          <p>获得授权的账号登录后，可自行选择本机或云端存储。</p>
        </div>
      </section>

      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="24"
        label-position="top"
        label-width="auto"
        :validate-on-rule-change="false"
      />
      <div v-if="optionsError" class="flex flex-wrap items-center gap-2" role="status">
        <span class="text-sm text-[var(--el-text-color-regular)]">{{ optionsError }}</span>
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </div>

      <p class="mobile-storage-config-dialog__note">
        <ArtSvgIcon icon="ri:information-line" />
        本机存储始终可用。关闭云端或移出授权名单会停止对应账号的云端访问，已有记录会保留。
      </p>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase/error'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import {
    fetchNoteCloudSettings,
    fetchNoteCloudUsers,
    saveNoteCloudSettings,
    type NoteCloudScope,
    type NoteCloudSettings
  } from '@/api/system-manage/note-cloud'
  import type { ArtUserSelectOption } from '@/components/core/forms/art-user-select/types'

  type StorageModeForm = {
    mode: 'local-only' | 'local-and-cloud'
    scope: Exclude<NoteCloudScope, 'closed'>
    tenantIds: string[]
    userIds: string[]
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [config: NoteCloudSettings] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const current = ref<NoteCloudSettings>()
  const form = ref<StorageModeForm>({
    mode: 'local-only',
    scope: 'all',
    tenantIds: [],
    userIds: []
  })
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const userOptions = ref<ArtUserSelectOption[]>([])
  const optionsLoading = ref(false)
  const optionsError = ref('')
  let loadVersion = 0
  const activeScope = computed<NoteCloudScope>(() =>
    form.value.mode === 'local-only' ? 'closed' : form.value.scope
  )
  const items = computed<FormItem[]>(() => [
    {
      label: '可用模式',
      key: 'mode',
      type: 'radioGroup',
      span: 24,
      props: {
        optionType: 'button',
        options: [
          { label: '仅本机', value: 'local-only' },
          { label: '本机 + Supabase 云端', value: 'local-and-cloud' }
        ]
      },
      description: '新安装默认使用本机存储。'
    },
    {
      label: '授权范围',
      key: 'scope',
      type: 'radioGroup',
      hidden: activeScope.value === 'closed',
      props: {
        optionType: 'button',
        options: [
          { label: '全部用户', value: 'all' },
          { label: '指定租户', value: 'tenants' },
          { label: '指定人员', value: 'users' }
        ]
      },
      description: '授权只决定能否使用云端，用户仍只能访问自己的笔记。'
    },
    {
      label: '授权租户',
      key: 'tenantIds',
      type: 'select',
      hidden: activeScope.value !== 'tenants',
      props: {
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        options: tenantOptions.value,
        loading: optionsLoading.value,
        disabled: Boolean(optionsError.value),
        placeholder: '搜索并选择租户'
      },
      description: '所选租户下启用的账号可使用云端。'
    },
    {
      label: '授权人员',
      key: 'userIds',
      type: 'userSelect',
      hidden: activeScope.value !== 'users',
      options: userOptions.value,
      props: {
        multiple: true,
        maxCollapseTags: 3,
        loading: optionsLoading.value,
        disabled: Boolean(optionsError.value),
        placeholder: '按姓名、账号、邮箱或租户搜索'
      },
      description: '只向选中的登录账号开放云端。'
    }
  ])
  const rules = computed<FormRules<StorageModeForm>>(() => ({
    ...(activeScope.value === 'tenants'
      ? {
          tenantIds: [
            {
              type: 'array',
              required: true,
              min: 1,
              message: '请至少选择一个租户',
              trigger: 'change'
            }
          ]
        }
      : activeScope.value === 'users'
        ? {
            userIds: [
              {
                type: 'array',
                required: true,
                min: 1,
                message: '请至少选择一位人员',
                trigger: 'change'
              }
            ]
          }
        : {})
  }))

  async function loadOptions(): Promise<void> {
    const version = ++loadVersion
    const scope = activeScope.value
    optionsError.value = ''
    optionsLoading.value = scope === 'tenants' || scope === 'users'
    if (!optionsLoading.value) return
    try {
      if (scope === 'tenants') {
        const result = await fetchEnabledTenantList({ showErrorMessage: false })
        if (result.error) throw result.error
        if (version !== loadVersion) return
        tenantOptions.value = (result.data ?? []).flatMap((tenant) =>
          tenant.id ? [{ value: tenant.id, label: tenant.tenantName }] : []
        )
        for (const id of form.value.tenantIds) {
          if (!tenantOptions.value.some((option) => option.value === id))
            tenantOptions.value.push({ value: id, label: '已停用或不存在的租户' })
        }
      } else {
        const users = await fetchNoteCloudUsers(form.value.userIds)
        if (version !== loadVersion) return
        userOptions.value = users.map((user) => ({
          value: user.id,
          label: user.nickName || user.userName || user.userEmail || '未命名账号',
          userName: user.userName,
          nickName: user.nickName,
          userEmail: user.userEmail,
          avatar: user.avatar,
          secondaryText: [
            user.userEmail || user.userName,
            user.tenant?.tenantName,
            user.status !== '1' || user.deletedAt ? '账号已停用' : ''
          ]
            .filter(Boolean)
            .join(' · ')
        }))
        for (const id of form.value.userIds) {
          if (!userOptions.value.some((option) => option.value === id))
            userOptions.value.push({ value: id, label: '已移除的账号' })
        }
      }
    } catch (error) {
      if (version === loadVersion)
        optionsError.value = getFriendlySupabaseErrorMessage(error, '授权对象加载失败，请重试')
    } finally {
      if (version === loadVersion) optionsLoading.value = false
    }
  }

  watch(activeScope, () => {
    if (!current.value) return
    void formRef.value?.clearValidate()
    void loadOptions()
  })

  const handleConfirm = async (): Promise<boolean> => {
    if (!(await validateArtFormForSubmit(formRef.value))) return false
    const config = current.value
    if (!config || optionsLoading.value || optionsError.value) return false
    const scope = activeScope.value
    try {
      const next = await saveNoteCloudSettings({
        scope,
        targetIds:
          scope === 'tenants' ? form.value.tenantIds : scope === 'users' ? form.value.userIds : [],
        updatedAt: config.updatedAt
      })
      emit('success', next)
      ElMessage.success('云端存储授权已保存')
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查平台配置权限后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (): Promise<void> => {
    await dialogRef.value?.handleOpen(undefined, {
      title: '时光记事存储模式',
      subtitle: '控制哪些账号可以使用云端存储。',
      confirmText: '保存授权',
      onConfirm: handleConfirm,
      onOpen: async (_, api) => {
        current.value = undefined
        api.setLoading(true)
        try {
          const value = await fetchNoteCloudSettings()
          form.value = {
            mode: value.scope === 'closed' ? 'local-only' : 'local-and-cloud',
            scope: value.scope === 'closed' ? 'all' : value.scope,
            tenantIds: value.scope === 'tenants' ? value.targetIds : [],
            userIds: value.scope === 'users' ? value.targetIds : []
          }
          await loadOptions()
          current.value = value
        } catch (error) {
          notifyFriendlyError(error, '读取云端授权失败，请关闭弹窗后重新打开')
          await api.handleClose(true)
        } finally {
          api.setLoading(false)
        }
      },
      onReset: () => {
        loadVersion += 1
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .mobile-storage-config-dialog {
    display: grid;
    gap: 18px;

    &__context {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        font-size: 18px;
        color: var(--el-color-primary);
        background: var(--el-bg-color);
        border-radius: var(--art-control-radius);
      }

      strong {
        display: block;
        line-height: 1.4;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 12px 14px;
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-lighter);
      border-radius: var(--art-control-radius);

      :deep(.art-svg-icon) {
        flex: none;
        margin-top: 2px;
        color: var(--el-color-primary);
      }
    }
  }
</style>
