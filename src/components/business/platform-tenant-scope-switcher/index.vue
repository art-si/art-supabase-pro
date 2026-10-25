<template>
  <ElDropdown
    v-if="isPlatformScope"
    trigger="click"
    placement="bottom-end"
    @command="handleCommand"
    @visible-change="handleVisibleChange"
  >
    <button
      class="tenant-scope-switcher"
      type="button"
      :aria-label="`当前租户范围：${scopeLabel}`"
      :aria-busy="loading"
      :title="scopeLabel"
    >
      <ArtSvgIcon icon="ri:building-2-line" />
      <span>{{ scopeLabel }}</span>
      <ArtSvgIcon class="tenant-scope-switcher__arrow" icon="ri:arrow-down-s-line" />
    </button>

    <template #dropdown>
      <ElScrollbar
        class="tenant-scope-switcher__scrollbar"
        max-height="min(520px, calc(100vh - 120px))"
      >
        <ElDropdownMenu class="tenant-scope-switcher__menu">
          <ElDropdownItem :command="ALL_TENANTS_COMMAND" :disabled="isAllTenants">
            <span class="tenant-scope-switcher__item-icon">
              <ArtSvgIcon icon="ri:global-line" />
            </span>
            <span class="tenant-scope-switcher__item-copy">
              <strong>全部租户</strong>
              <small>跨租户查看；新增默认归属平台租户</small>
            </span>
            <ArtSvgIcon
              v-if="isAllTenants"
              icon="ri:check-line"
              class="tenant-scope-switcher__check"
            />
          </ElDropdownItem>

          <ElDropdownItem
            v-for="tenant in tenantOptions"
            :key="tenant.id"
            :command="tenant.id"
            :disabled="tenant.id === selectedTenantId"
          >
            <span class="tenant-scope-switcher__item-icon">
              <ArtSvgIcon icon="ri:building-line" />
            </span>
            <span class="tenant-scope-switcher__item-copy">
              <strong>{{ tenant.tenantName }}</strong>
              <small>{{ tenant.tenantCode }}</small>
            </span>
            <ArtSvgIcon
              v-if="tenant.id === selectedTenantId"
              icon="ri:check-line"
              class="tenant-scope-switcher__check"
            />
          </ElDropdownItem>

          <ElDropdownItem v-if="loadError" :command="RETRY_COMMAND" divided>
            <span class="tenant-scope-switcher__item-icon tenant-scope-switcher__item-icon--danger">
              <ArtSvgIcon icon="ri:refresh-line" />
            </span>
            <span class="tenant-scope-switcher__item-copy">
              <strong>重新加载</strong>
              <small>{{ loadError }}</small>
            </span>
            <span />
          </ElDropdownItem>
        </ElDropdownMenu>
      </ElScrollbar>
    </template>
  </ElDropdown>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase/error'

  defineOptions({ name: 'PlatformTenantScopeSwitcher' })

  const tenantScopeStore = useTenantScopeStore()
  const userStore = useUserStore()
  const {
    isPlatformScope,
    isAllTenants,
    selectedTenantId,
    tenantOptions,
    loading,
    loadError,
    scopeLabel
  } = storeToRefs(tenantScopeStore)

  const ALL_TENANTS_COMMAND = '__all_tenants__'
  const RETRY_COMMAND = '__retry__'

  const handleCommand = (command: string): void => {
    if (command === RETRY_COMMAND) {
      void tenantScopeStore.loadTenantOptions(true)
      return
    }
    tenantScopeStore.setTenantScope(command === ALL_TENANTS_COMMAND ? null : command)
  }

  const handleVisibleChange = (visible: boolean): void => {
    if (visible) void tenantScopeStore.loadTenantOptions()
  }

  const reloadDictionaries = async (): Promise<void> => {
    try {
      await userStore.fetchDictList()
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '字典数据加载失败，请刷新页面重试'))
    }
  }

  watch(() => tenantScopeStore.revision, reloadDictionaries)

  onMounted(async () => {
    await tenantScopeStore.loadTenantOptions()
    await reloadDictionaries()
  })
</script>

<style scoped lang="scss">
  .tenant-scope-switcher {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    max-width: 190px;
    min-height: 36px;
    padding: 0 10px;
    margin-right: 8px;
    color: var(--art-gray-700);
    cursor: pointer;
    background: var(--default-box-color);
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    transition:
      border-color 0.2s ease,
      color 0.2s ease;

    &:hover,
    &:focus-visible {
      color: var(--main-color);
      outline: none;
      border-color: color-mix(in srgb, var(--main-color) 45%, transparent);
    }

    > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__arrow {
      flex: none;
      color: var(--art-gray-500);
    }
  }

  .tenant-scope-switcher__scrollbar {
    width: min(360px, calc(100vw - 24px));
  }

  .tenant-scope-switcher__menu {
    width: 100%;

    :deep(.el-dropdown-menu__item) {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 20px;
      gap: 10px;
      align-items: center;
      min-height: 60px;
    }
  }

  .tenant-scope-switcher__item-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    color: var(--main-color);
    background: color-mix(in srgb, var(--main-color) 10%, transparent);
    border-radius: 8px;

    &--danger {
      color: var(--el-color-danger);
      background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
    }
  }

  .tenant-scope-switcher__item-copy {
    display: grid;
    min-width: 0;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 13px;
      font-weight: 600;
    }

    small {
      margin-top: 2px;
      font-size: 11px;
      color: var(--art-gray-500);
    }
  }

  .tenant-scope-switcher__check {
    color: var(--main-color);
  }

  @media (width <= 900px) {
    .tenant-scope-switcher {
      justify-content: center;
      width: 36px;
      padding: 0;

      > span,
      &__arrow {
        display: none;
      }
    }
  }
</style>
