<template>
  <div class="auth-channel-settings">
    <div class="auth-channel-settings__toolbar">
      <div class="auth-channel-settings__toolbar-copy">
        <div class="auth-channel-settings__count">
          <strong>认证渠道</strong>
          <span>{{ channels.length }} 个</span>
        </div>
        <p>Provider 必须已在 Supabase Auth 中启用；这里不保存 AppID 或 Secret。</p>
      </div>
      <ElButton
        v-if="!disabled && availablePresets.length === 0"
        type="primary"
        plain
        @click="addPreset('custom')"
      >
        <ArtSvgIcon icon="ri:add-line" />
        添加自定义渠道
      </ElButton>
      <ElDropdown v-else-if="!disabled" trigger="click" @command="addPreset">
        <ElButton type="primary" plain>
          <ArtSvgIcon icon="ri:add-line" />
          添加渠道
          <ArtSvgIcon icon="ri:arrow-down-s-line" />
        </ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem
              v-for="preset in availablePresets"
              :key="preset.key"
              :command="preset.key"
            >
              {{ preset.label }}
            </ElDropdownItem>
            <ElDropdownItem command="custom">自定义渠道</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </div>

    <ArtEmptyState
      v-if="!channels.length"
      size="compact"
      title="尚未配置第三方登录"
      description="添加微信、钉钉、企业微信或其他 OAuth/OIDC 渠道后，可在登录页启用。"
    />

    <div v-else class="auth-channel-settings__list">
      <article v-for="(channel, index) in channels" :key="channel.key" class="auth-channel-row">
        <div class="auth-channel-row__identity">
          <span aria-hidden="true"><ArtSvgIcon :icon="channel.icon" /></span>
          <div>
            <strong>{{ channel.label || '未命名渠道' }}</strong>
            <small>{{ channel.key || '等待填写渠道标识' }}</small>
          </div>
        </div>

        <div class="auth-channel-row__fields">
          <ElFormItem label="显示名称">
            <ElInput v-model.trim="channel.label" maxlength="40" :disabled="disabled" />
          </ElFormItem>
          <ElFormItem label="渠道标识">
            <ElInput
              v-model.trim="channel.key"
              maxlength="40"
              placeholder="例如 wechat"
              :disabled="disabled"
            />
          </ElFormItem>
          <ElFormItem label="Supabase Provider">
            <ElInput
              v-model.trim="channel.provider"
              maxlength="50"
              placeholder="例如 custom:wechat"
              :disabled="disabled"
            />
          </ElFormItem>
          <ElFormItem label="图标">
            <ElInput
              v-model.trim="channel.icon"
              maxlength="80"
              placeholder="例如 ri:wechat-fill"
              :disabled="disabled"
            />
          </ElFormItem>
          <ElFormItem label="授权范围">
            <ElInput
              v-model.trim="channel.scopes"
              maxlength="200"
              placeholder="可选，例如 openid profile email"
              :disabled="disabled"
            />
          </ElFormItem>
          <ElFormItem label="身份中台连接参数">
            <div class="auth-channel-row__parameter">
              <ElInput
                v-model.trim="channel.queryParamName"
                maxlength="64"
                placeholder="参数名，例如 connection"
                :disabled="disabled"
              />
              <ElInput
                v-model.trim="channel.queryParamValue"
                maxlength="160"
                placeholder="参数值，例如 wechat"
                :disabled="disabled"
              />
            </div>
          </ElFormItem>
          <ElFormItem label="登录说明" class="is-wide">
            <ElInput
              v-model.trim="channel.description"
              maxlength="100"
              placeholder="告诉用户何时选择此登录方式"
              :disabled="disabled"
            />
          </ElFormItem>
        </div>

        <div class="auth-channel-row__actions">
          <div>
            <span>登录页展示</span>
            <ElSwitch v-model="channel.enabled" :disabled="disabled" />
          </div>
          <div>
            <span>允许用户绑定</span>
            <ElSwitch v-model="channel.allowLinking" :disabled="disabled" />
          </div>
          <ElButton
            v-if="!disabled"
            type="danger"
            text
            :aria-label="`移除${channel.label || '认证'}渠道`"
            @click="removeChannel(index)"
          >
            <ArtSvgIcon icon="ri:delete-bin-line" />
            移除
          </ElButton>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { cloneDeep, isEqual } from 'lodash-es'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { AUTH_CHANNEL_PRESETS } from '@/utils/supabase'

  const props = defineProps<{
    modelValue: Api.Auth.AuthChannel[]
    disabled?: boolean
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: Api.Auth.AuthChannel[]]
  }>()

  const channels = ref<Api.Auth.AuthChannel[]>(cloneDeep(props.modelValue))

  watch(
    () => props.modelValue,
    (value) => {
      if (!isEqual(value, channels.value)) channels.value = cloneDeep(value)
    },
    { deep: true }
  )

  watch(
    channels,
    (value) => {
      if (!isEqual(value, props.modelValue)) emit('update:modelValue', cloneDeep(value))
    },
    { deep: true }
  )

  const availablePresets = computed(() => {
    const existingKeys = new Set(channels.value.map((channel) => channel.key))
    return AUTH_CHANNEL_PRESETS.filter((preset) => !existingKeys.has(preset.key))
  })

  const addPreset = (key: string): void => {
    const preset = AUTH_CHANNEL_PRESETS.find((item) => item.key === key)
    const suffix = channels.value.length + 1
    const next: Api.Auth.AuthChannel = preset
      ? cloneDeep(preset)
      : {
          key: `custom_${suffix}`,
          label: `自定义渠道 ${suffix}`,
          provider: `custom:channel-${suffix}`,
          icon: 'ri:login-circle-line',
          description: '',
          scopes: '',
          queryParamName: '',
          queryParamValue: '',
          enabled: false,
          allowLinking: true
        }
    channels.value = [...channels.value, next]
  }

  const removeChannel = (index: number): void => {
    channels.value = channels.value.filter((_, itemIndex) => itemIndex !== index)
  }
</script>

<style scoped lang="scss">
  .auth-channel-settings {
    display: grid;
    grid-column: 1 / -1;
    gap: var(--art-space-4);
    min-width: 0;

    &__toolbar {
      display: flex;
      gap: var(--art-space-4);
      align-items: flex-start;
      justify-content: space-between;
      min-width: 0;

      .el-button {
        flex: none;
        min-height: 36px;
      }
    }

    &__toolbar-copy {
      min-width: 0;

      p {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 20px;
        color: var(--el-text-color-secondary);
      }
    }

    &__count {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      span {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: 999px;
      }
    }

    &__list {
      display: grid;
      gap: var(--art-space-3);
    }

    .auth-channel-row {
      display: grid;
      grid-template-columns: minmax(150px, 0.7fr) minmax(420px, 2.3fr) minmax(138px, 0.7fr);
      gap: var(--art-space-4);
      align-items: start;
      min-width: 0;
      padding: var(--art-space-4);
      background: color-mix(in srgb, var(--art-gray-100) 72%, var(--default-box-color));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--custom-radius);

      &__identity {
        display: flex;
        gap: var(--art-space-3);
        align-items: center;
        min-width: 0;

        > span {
          display: grid;
          flex: 0 0 40px;
          place-items: center;
          width: 40px;
          height: 40px;
          font-size: 20px;
          color: var(--el-color-primary);
          background: var(--default-box-color);
          border: 1px solid var(--el-color-primary-light-8);
          border-radius: var(--art-control-radius);
        }

        > div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }

        small {
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }

      &__fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--art-space-3);
        min-width: 0;

        :deep(.el-form-item) {
          margin: 0;
        }

        :deep(.el-form-item__label) {
          padding-bottom: 5px;
          font-size: 12px;
        }

        .is-wide {
          grid-column: 1 / -1;
        }
      }

      &__parameter {
        display: grid;
        grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
        gap: var(--art-space-2);
        width: 100%;
      }

      &__actions {
        display: grid;
        gap: var(--art-space-3);
        padding-left: var(--art-space-4);
        border-left: 1px solid var(--el-border-color-lighter);

        > div {
          display: flex;
          gap: var(--art-space-2);
          align-items: center;
          justify-content: space-between;
          min-width: 0;
          font-size: 12px;
          color: var(--el-text-color-regular);
        }

        .el-button {
          justify-self: start;
          margin-left: -8px;
        }
      }
    }

    @media (width <= 1180px) {
      .auth-channel-row {
        grid-template-columns: minmax(140px, 0.7fr) minmax(360px, 2fr);

        &__actions {
          grid-template-columns: repeat(3, max-content);
          grid-column: 1 / -1;
          align-items: center;
          padding-top: var(--art-space-3);
          padding-left: 0;
          border-top: 1px solid var(--el-border-color-lighter);
          border-left: 0;
        }
      }
    }

    @media (width <= 760px) {
      &__toolbar {
        flex-direction: column;
      }

      .auth-channel-row {
        grid-template-columns: minmax(0, 1fr);

        &__fields {
          grid-template-columns: minmax(0, 1fr);

          .is-wide {
            grid-column: auto;
          }
        }

        &__actions {
          grid-template-columns: minmax(0, 1fr);
          grid-column: auto;
          padding-top: var(--art-space-3);
        }

        &__parameter {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    }
  }
</style>
