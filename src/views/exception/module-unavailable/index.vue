<template>
  <div class="module-unavailable art-full-height">
    <section
      class="module-unavailable__panel art-card-xs"
      :aria-label="`${application.name} 子模块未装载`"
    >
      <div class="module-unavailable__status">
        <ArtSvgIcon icon="ri:plug-line" aria-hidden="true" />
        <span>404 · 子模块未装载</span>
      </div>

      <ArtEmptyState
        size="large"
        :title="`${application.name} 暂不可用`"
        :description="`当前平台已识别到你的菜单权限，但本次部署未装载 ${application.code.toUpperCase()} 页面源码。请联系平台管理员完成子模块装载并重新发布。`"
      >
        <div class="module-unavailable__actions">
          <ElButton type="primary" @click="handleBackHome">返回工作台</ElButton>
          <ElButton @click="handleReload">重新检查</ElButton>
        </div>
      </ArtEmptyState>

      <div class="module-unavailable__details">
        <div>
          <span>应用</span>
          <strong>{{ application.code.toUpperCase() }}</strong>
        </div>
        <div>
          <span>请求页面</span>
          <strong>{{ componentPath }}</strong>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { APPLICATION_PROFILES, type ApplicationCode } from '@/config/application'
  import { useCommon } from '@/hooks/core/useCommon'

  defineOptions({ name: 'ModuleUnavailable' })

  type HostedApplicationCode = Exclude<ApplicationCode, 'platform'>

  const props = defineProps<{
    applicationCode: HostedApplicationCode
    componentPath: string
  }>()

  const router = useRouter()
  const { homePath } = useCommon()
  const application = computed(() => APPLICATION_PROFILES[props.applicationCode])

  const handleBackHome = (): void => {
    void router.push(homePath.value || '/dashboard')
  }

  const handleReload = (): void => {
    window.location.reload()
  }
</script>

<style scoped lang="scss">
  .module-unavailable {
    display: grid;
    min-width: 0;
    padding: var(--art-space-4);

    &__panel {
      position: relative;
      display: grid;
      align-content: center;
      min-width: 0;
      min-height: 100%;
      padding: clamp(24px, 5vw, 56px);
      overflow: hidden;
    }

    &__status {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: center;
      justify-self: center;
      padding: 7px 12px;
      margin-bottom: var(--art-space-2);
      font-size: 12px;
      font-weight: 650;
      color: var(--theme-color);
      letter-spacing: 0.04em;
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 22%, transparent);
      border-radius: 999px;
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-3);
      justify-content: center;

      :deep(.el-button) {
        min-width: 112px;
        margin-left: 0;
      }
    }

    &__details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-3);
      width: min(680px, 100%);
      padding: var(--art-space-4);
      margin: var(--art-space-5) auto 0;
      background: color-mix(in srgb, var(--art-gray-100) 72%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-control-radius, var(--el-border-radius-base));

      > div {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      span {
        font-size: 12px;
        color: var(--art-gray-600);
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        font-weight: 600;
        color: var(--art-gray-800);
        white-space: nowrap;
      }
    }

    @media (width <= 720px) {
      padding: var(--art-space-2);

      &__panel {
        padding: var(--art-space-5) var(--art-space-3);
      }

      &__details {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
