<template>
  <div class="website-wordmark-settings">
    <div class="website-wordmark-settings__switch-row">
      <div>
        <strong>使用品牌字图</strong>
        <p>开启后，菜单头部优先显示与系统名称配套的字图；图片异常时自动回退到艺术文字。</p>
      </div>
      <ElSwitch
        :model-value="enabled"
        :disabled="disabled"
        aria-label="使用品牌字图"
        @update:model-value="handleEnabledChange"
      />
    </div>

    <div v-if="enabled" class="website-wordmark-settings__content">
      <div class="website-wordmark-settings__toolbar">
        <div class="website-wordmark-settings__guidance">
          <ArtSvgIcon icon="ri:information-line" aria-hidden="true" />
          <span>
            推荐使用 1008×240 透明 PNG/WebP；菜单按约 109×26px 展示，与默认品牌文字视觉高度一致。AI
            生成艺术风格，系统用真实字体精确排版名称，并自动输出同款深色与浅色配色后存入资源管理器。
          </span>
        </div>
        <ElButton
          v-if="!disabled"
          v-auth="'System:WebsiteConfig:GenerateWordmark'"
          :loading="generating"
          @click="handleGenerate"
        >
          <ArtSvgIcon icon="ri:magic-line" aria-hidden="true" />
          AI 艺术字生成
        </ElButton>
      </div>

      <div class="website-wordmark-settings__asset-list">
        <section class="website-wordmark-settings__asset-card">
          <div class="website-wordmark-settings__asset-header">
            <div class="website-wordmark-settings__asset-copy">
              <div class="website-wordmark-settings__asset-title">
                <strong>浅色菜单字图</strong>
                <span>浅色菜单时显示</span>
              </div>
              <p>建议使用深色字形，透明背景。</p>
            </div>
          </div>

          <div class="website-wordmark-settings__picker">
            <ArtUploadImage
              :model-value="lightUrl"
              :resource-tenant-id="resourceTenantId"
              title="选择浅色菜单字图"
              width="100%"
              :height="150"
              preview-fit="contain"
              :limit="1"
              :readonly="disabled"
              @update:model-value="emitUrl('light', $event)"
            />
          </div>
        </section>

        <section class="website-wordmark-settings__asset-card">
          <div class="website-wordmark-settings__asset-header">
            <div class="website-wordmark-settings__asset-copy">
              <div class="website-wordmark-settings__asset-title">
                <strong>深色菜单字图</strong>
                <span>深色菜单时显示</span>
              </div>
              <p>建议使用浅色字形，透明背景。</p>
            </div>
          </div>

          <div class="website-wordmark-settings__picker">
            <ArtUploadImage
              :model-value="darkUrl"
              :resource-tenant-id="resourceTenantId"
              title="选择深色菜单字图"
              width="100%"
              :height="150"
              preview-fit="contain"
              :limit="1"
              :readonly="disabled"
              @update:model-value="emitUrl('dark', $event)"
            />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { uploadAttachment } from '@/api/attachments'
  import { generateWebsiteWordmark } from '@/api/system-manage/website-config'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import { createGeneratedWordmarkFiles } from './wordmark-image'

  defineOptions({ name: 'WebsiteWordmarkSettings' })

  const props = defineProps<{
    enabled: boolean
    lightUrl?: string | null
    darkUrl?: string | null
    siteName: string
    resourceTenantId: string
    disabled?: boolean
  }>()

  const emit = defineEmits<{
    (event: 'update:enabled', value: boolean): void
    (event: 'update:lightUrl', value: string): void
    (event: 'update:darkUrl', value: string): void
  }>()

  const generating = ref(false)

  const handleEnabledChange = (value: string | number | boolean): void => {
    emit('update:enabled', Boolean(value))
  }

  const updateWordmarkUrl = (theme: Api.SystemManage.WebsiteWordmarkTheme, url: string): void => {
    if (theme === 'light') {
      emit('update:lightUrl', url)
      return
    }
    emit('update:darkUrl', url)
  }

  const emitUrl = (
    theme: Api.SystemManage.WebsiteWordmarkTheme,
    value: string | string[]
  ): void => {
    const url = Array.isArray(value) ? (value[0] ?? '') : value
    updateWordmarkUrl(theme, url)
  }

  const uploadGeneratedWordmark = async (
    file: File,
    siteName: string,
    theme: Api.SystemManage.WebsiteWordmarkTheme
  ): Promise<string> => {
    const [resource] = await uploadAttachment(file, {
      targetTenantId: props.resourceTenantId,
      remark: `${siteName}菜单品牌字图（${theme === 'light' ? '浅色菜单' : '深色菜单'}）`
    })
    if (!resource?.url) throw new Error('品牌字图已生成，但未获得资源地址')
    return resource.url
  }

  const handleGenerate = async (): Promise<void> => {
    const siteName = props.siteName.trim()
    if (!siteName) {
      ElMessage.warning('请先填写系统名称')
      return
    }

    generating.value = true
    try {
      const generated = await generateWebsiteWordmark({ siteName })
      const files = await createGeneratedWordmarkFiles(generated, siteName)
      const [lightUrl, darkUrl] = await Promise.all([
        uploadGeneratedWordmark(files.light, siteName, 'light'),
        uploadGeneratedWordmark(files.dark, siteName, 'dark')
      ])
      emit('update:lightUrl', lightUrl)
      emit('update:darkUrl', darkUrl)
      ElMessage.success('同款浅色与深色菜单字图已生成，请确认文字无误后再发布')
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, 'AI 品牌字图生成失败，请稍后重试'))
    } finally {
      generating.value = false
    }
  }
</script>

<style scoped lang="scss">
  .website-wordmark-settings {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    width: 100%;

    &__switch-row {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      justify-content: space-between;
      min-height: 64px;
      padding: var(--art-space-3) var(--art-space-4);
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);

      strong {
        display: block;
        margin-bottom: var(--art-space-1);
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        color: var(--el-text-color-secondary);
      }
    }

    &__content {
      display: flex;
      flex-direction: column;
      gap: var(--art-space-3);
    }

    &__toolbar,
    &__guidance {
      display: flex;
      min-width: 0;
    }

    &__toolbar {
      gap: var(--art-space-3);
      align-items: center;

      > .el-button {
        flex: none;
      }
    }

    &__guidance {
      flex: 1;
      gap: var(--art-space-2);
      align-items: flex-start;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.7;
      color: var(--el-text-color-secondary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-control-radius);

      .art-svg-icon {
        flex: none;
        margin-top: 2px;
        font-size: 16px;
        color: var(--el-color-primary);
      }
    }

    &__asset-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-3);
    }

    &__asset-card {
      min-width: 0;
      padding: var(--art-space-4);
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);
    }

    &__asset-header {
      display: flex;
      gap: var(--art-space-3);
      align-items: flex-start;
      justify-content: space-between;
      min-height: 58px;
      margin-bottom: var(--art-space-3);
    }

    &__asset-copy {
      min-width: 0;

      p {
        margin: var(--art-space-1) 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__asset-title {
      display: flex;
      flex-wrap: wrap;
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
        padding-inline: 8px;
        font-size: 11px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: 999px;
      }
    }

    &__picker {
      min-width: 0;
    }
  }

  @media (width <= 900px) {
    .website-wordmark-settings {
      &__asset-list {
        grid-template-columns: 1fr;
      }
    }
  }

  @media (width <= 520px) {
    .website-wordmark-settings {
      &__toolbar,
      &__asset-header {
        flex-direction: column;
        align-items: stretch;

        > .el-button {
          width: 100%;
        }
      }
    }
  }
</style>
