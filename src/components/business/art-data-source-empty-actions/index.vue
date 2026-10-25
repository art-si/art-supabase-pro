<template>
  <div class="art-data-source-empty-actions">
    <div v-if="authorizedActions.length" class="art-data-source-empty-actions__buttons">
      <ElButton
        v-for="(action, index) in authorizedActions"
        :key="`${String(action.routeName)}-${action.label}`"
        :type="index === 0 ? 'primary' : 'default'"
        :plain="index > 0"
        @click="navigate(action)"
      >
        <ArtSvgIcon :icon="action.icon || 'ri:external-link-line'" />
        {{ action.label }}
      </ElButton>
    </div>
    <p v-else class="art-data-source-empty-actions__permission-note">
      <ArtSvgIcon icon="ri:information-line" />
      当前账号暂无{{ resourceName }}维护页面的查看权限，请联系管理员维护数据或开通权限。
    </p>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import type { RouteRecordNameGeneric } from 'vue-router'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'

  defineOptions({ name: 'ArtDataSourceEmptyActions' })

  export interface ArtDataSourceEmptyAction {
    label: string
    routeName: NonNullable<RouteRecordNameGeneric>
    permission?: string
    icon?: string
  }

  interface Props {
    actions: readonly ArtDataSourceEmptyAction[]
    resourceName: string
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ navigate: [action: ArtDataSourceEmptyAction] }>()
  const router = useRouter()
  const { hasAuth } = useAuth()

  const authorizedActions = computed(() =>
    props.actions.filter((action) => !action.permission || hasAuth(action.permission))
  )

  const navigate = async (action: ArtDataSourceEmptyAction): Promise<void> => {
    if (!router.hasRoute(action.routeName)) {
      ElMessage.warning(
        `当前账号暂时无法打开${action.label.replace(/^去/, '')}页面，请联系管理员开通权限。`
      )
      return
    }
    emit('navigate', action)
    await router.push({ name: action.routeName })
  }
</script>

<style scoped lang="scss">
  .art-data-source-empty-actions {
    display: grid;
    justify-items: center;
    width: min(100%, 680px);
    margin: var(--art-space-3) auto 0;

    &__buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      justify-content: center;

      :deep(.el-button + .el-button) {
        margin-left: 0;
      }
    }

    &__permission-note {
      display: flex;
      gap: var(--art-space-1);
      align-items: flex-start;
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
      text-align: left;
    }
  }
</style>
