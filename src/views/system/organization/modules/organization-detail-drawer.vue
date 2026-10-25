<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="organization" class="organization-detail">
      <section class="organization-detail__hero art-card-xs">
        <div class="organization-detail__hero-main">
          <span class="organization-detail__hero-icon" aria-hidden="true">
            <ArtSvgIcon :icon="organizationIcon" />
          </span>
          <div>
            <div class="organization-detail__title-row">
              <h2>{{ organization.organizationName }}</h2>
              <ElTag v-if="organization.isSystem" type="warning" effect="light" round>
                根组织
              </ElTag>
              <ArtDictDisplay dict-code="status" :value="organization.status" display="tag" />
            </div>
            <p>{{ organization.description || '暂未填写组织职责说明。' }}</p>
            <div class="organization-detail__meta">
              <span class="art-icon-label"
                ><ArtSvgIcon icon="ri:hashtag" />{{ organization.organizationCode }}</span
              >
              <span class="art-icon-label">
                <ArtSvgIcon icon="ri:building-line" />
                {{ organization.tenant?.tenantName || '当前租户' }}
              </span>
              <span class="art-icon-label" v-if="organization.leader">
                <ArtSvgIcon icon="ri:user-star-line" />
                {{ organization.leader.nickName || organization.leader.userName }}
              </span>
            </div>
          </div>
        </div>
        <div class="organization-detail__hero-actions">
          <ElButton plain @click="goToUserManagement">
            <ArtSvgIcon icon="ri:user-settings-line" />
            用户管理
          </ElButton>
          <ElButton type="primary" plain @click="goToRoleManagement">
            <ArtSvgIcon icon="ri:shield-user-line" />
            角色权限
          </ElButton>
        </div>
      </section>

      <section class="organization-detail__metrics" aria-label="组织授权链概览">
        <article class="art-card-xs">
          <span>直接成员</span>
          <strong>{{ members.length }}</strong>
          <small>用户归属该组织</small>
        </article>
        <article class="art-card-xs">
          <span>职责角色</span>
          <strong>{{ roles.length }}</strong>
          <small>角色适用该组织</small>
        </article>
        <article class="art-card-xs">
          <span>菜单覆盖</span>
          <strong>{{ menuCoverage.length }}</strong>
          <small>角色授权去重结果</small>
        </article>
        <article class="art-card-xs">
          <span>启用覆盖</span>
          <strong>{{ enabledRoleCount }}</strong>
          <small>当前可授权角色</small>
        </article>
      </section>

      <section class="organization-detail__chain art-card-xs">
        <div class="organization-detail__chain-step is-current">
          <span><ArtSvgIcon icon="ri:organization-chart" /></span>
          <div
            ><strong>组织</strong><small>{{ organization.organizationName }}</small></div
          >
        </div>
        <ArtSvgIcon class="organization-detail__chain-arrow" icon="ri:arrow-right-line" />
        <div class="organization-detail__chain-step">
          <span><ArtSvgIcon icon="ri:group-line" /></span>
          <div
            ><strong>用户</strong><small>{{ members.length }} 名成员</small></div
          >
        </div>
        <ArtSvgIcon class="organization-detail__chain-arrow" icon="ri:arrow-right-line" />
        <div class="organization-detail__chain-step">
          <span><ArtSvgIcon icon="ri:shield-user-line" /></span>
          <div
            ><strong>角色</strong><small>{{ roles.length }} 个职责角色</small></div
          >
        </div>
        <ArtSvgIcon class="organization-detail__chain-arrow" icon="ri:arrow-right-line" />
        <div class="organization-detail__chain-step">
          <span><ArtSvgIcon icon="ri:menu-line" /></span>
          <div
            ><strong>菜单</strong><small>{{ menuCoverage.length }} 项访问权限</small></div
          >
        </div>
      </section>

      <ElTabs v-model="activeTab" class="organization-detail__tabs">
        <ElTabPane name="members">
          <template #label>
            <span class="organization-detail__tab-label">
              <ArtSvgIcon icon="ri:group-line" />成员 {{ members.length }}
            </span>
          </template>
          <div v-if="members.length" class="organization-detail__member-grid">
            <article v-for="member in members" :key="member.id" class="art-card-xs">
              <ElAvatar :size="42" :src="member.avatar || undefined">
                {{ getMemberFallback(member) }}
              </ElAvatar>
              <div class="organization-detail__member-copy">
                <strong>{{ member.nickName || member.userName }}</strong>
                <span>{{ member.userEmail }}</span>
                <small>{{ formatMemberRoles(member.userRoles) }}</small>
              </div>
              <ArtDictDisplay dict-code="status" :value="member.status" display="tag" />
            </article>
          </div>
          <ArtEmptyState
            v-else
            title="该组织暂无直接归属成员"
            description="可前往用户管理分配组织。"
            :visual-size="96"
          />
        </ElTabPane>

        <ElTabPane name="roles">
          <template #label>
            <span class="organization-detail__tab-label">
              <ArtSvgIcon icon="ri:shield-user-line" />角色 {{ roles.length }}
            </span>
          </template>
          <div v-if="roles.length" class="organization-detail__role-list">
            <article v-for="role in roles" :key="role.id" class="art-card-xs">
              <span class="organization-detail__role-icon" aria-hidden="true">
                {{ role.roleName.slice(0, 1) }}
              </span>
              <div class="organization-detail__role-copy">
                <div>
                  <strong>{{ role.roleName }}</strong>
                  <ArtDictDisplay
                    dict-code="commonBoolean"
                    :value="String(role.enabled)"
                    display="tag"
                  />
                </div>
                <span>{{ role.roleCode }}</span>
                <small>{{ role.roleMenus?.length ?? 0 }} 项菜单或操作权限</small>
              </div>
            </article>
          </div>
          <ArtEmptyState
            v-else
            title="该组织暂无适用角色"
            description="可前往角色管理建立职责角色。"
            :visual-size="96"
          />
        </ElTabPane>

        <ElTabPane name="menus">
          <template #label>
            <span class="organization-detail__tab-label">
              <ArtSvgIcon icon="ri:menu-line" />菜单 {{ menuCoverage.length }}
            </span>
          </template>
          <div v-if="menuCoverage.length" class="organization-detail__menu-grid">
            <article v-for="menu in menuCoverage" :key="menu.id" class="art-card-xs">
              <span><ArtSvgIcon :icon="menu.icon" /></span>
              <div>
                <strong>{{ menu.title }}</strong>
                <small>{{ menu.type === 'button' ? '操作权限' : '页面访问' }}</small>
              </div>
            </article>
          </div>
          <ArtEmptyState
            v-else
            title="当前组织角色尚未配置菜单权限"
            description="为组织角色配置菜单权限后，可在此查看。"
            :visual-size="96"
          />
        </ElTabPane>
      </ElTabs>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { fetchOrganizationDetail } from '@/api/system-manage'

  type Organization = Api.SystemManage.OrganizationListItem
  type OrganizationMember = Api.SystemManage.OrganizationMember

  interface MenuCoverageItem {
    id: string
    title: string
    type: string
    icon: string
  }

  const router = useRouter()
  const drawerRef = ref<ArtDrawerExpose<Organization>>()
  const organization = shallowRef<Organization>()
  const activeTab = ref('members')

  const members = computed(() => organization.value?.members ?? [])
  const roles = computed(() => organization.value?.roles ?? [])
  const enabledRoleCount = computed(() => roles.value.filter((role) => role.enabled).length)
  const organizationIcon = computed(() => {
    const iconMap: Record<Api.SystemManage.OrganizationType, string> = {
      company: 'ri:building-4-line',
      division: 'ri:git-branch-line',
      department: 'ri:team-line',
      team: 'ri:group-2-line'
    }
    return organization.value
      ? iconMap[organization.value.organizationType]
      : 'ri:organization-chart'
  })

  const menuCoverage = computed<MenuCoverageItem[]>(() => {
    const menuMap = new Map<string, MenuCoverageItem>()
    roles.value.forEach((role) => {
      role.roleMenus?.forEach((roleMenu) => {
        if (!roleMenu.menuId || menuMap.has(roleMenu.menuId)) return
        const meta = roleMenu.menu?.meta
        const title =
          typeof meta?.title === 'string' ? meta.title : roleMenu.menu?.name || '未命名权限'
        const icon =
          typeof meta?.icon === 'string'
            ? meta.icon
            : roleMenu.menu?.type === 'button'
              ? 'ri:cursor-line'
              : 'ri:file-list-3-line'
        menuMap.set(roleMenu.menuId, {
          id: roleMenu.menuId,
          title,
          type: roleMenu.menu?.type || 'menu',
          icon
        })
      })
    })
    return Array.from(menuMap.values()).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  })

  const getMemberFallback = (member: OrganizationMember): string =>
    (member.nickName || member.userName || 'U').slice(0, 1).toUpperCase()

  const formatMemberRoles = (roleCodes?: string[]): string =>
    roleCodes?.length ? roleCodes.slice(0, 3).join('、') : '尚未分配角色'

  const goToUserManagement = (): void => {
    void router.push('/system/user')
  }

  const goToRoleManagement = (): void => {
    void router.push('/system/role')
  }

  const handleOpen = async (row: Organization): Promise<void> => {
    organization.value = row
    activeTab.value = 'members'
    await drawerRef.value?.handleOpen(row, {
      title: '组织治理详情',
      contentHeight: 'calc(100vh - 126px)',
      scrollbarAlways: true,
      showFooter: false,
      loading: true,
      loadingText: '正在加载组织治理详情…',
      onReset: () => {
        organization.value = undefined
        activeTab.value = 'members'
      }
    })

    if (!row.id) {
      drawerRef.value?.setLoading(false)
      return
    }

    try {
      const response = await fetchOrganizationDetail(row.id)
      if (response.data) organization.value = response.data
    } finally {
      drawerRef.value?.setLoading(false)
    }
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .organization-detail {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__hero {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 18px;
    }

    &__hero-main {
      display: flex;
      gap: 14px;
      min-width: 0;

      > div {
        min-width: 0;
      }

      p {
        margin: 6px 0 10px;
        font-size: 13px;
        line-height: 1.65;
        color: var(--el-text-color-secondary);
        overflow-wrap: anywhere;
      }
    }

    &__hero-icon {
      display: grid;
      flex: 0 0 46px;
      place-items: center;
      width: 46px;
      height: 46px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--custom-radius);

      :deep(svg) {
        width: 22px;
        height: 22px;
      }
    }

    &__title-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-width: 0;

      h2 {
        margin: 0;
        font-size: 20px;
        line-height: 1.4;
        color: var(--el-text-color-primary);
      }
    }

    &__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;

      span {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        min-width: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__hero-actions {
      display: flex;
      flex: 0 0 auto;
      gap: 8px;

      .el-button {
        margin-left: 0;
      }
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;

      article {
        display: grid;
        min-width: 0;
        padding: 14px 16px;

        span,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        strong {
          margin: 3px 0;
          font-size: 22px;
          line-height: 1.2;
          color: var(--el-text-color-primary);
        }
      }
    }

    &__chain {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
    }

    &__chain-step {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color-light);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        display: grid;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      &.is-current > span {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border: 1px solid var(--el-color-primary-light-7);
      }
    }

    &__chain-arrow {
      flex: 0 0 auto;
      color: var(--el-text-color-placeholder);
    }

    &__tabs {
      min-width: 0;

      :deep(.el-tabs__header) {
        margin-bottom: 12px;
      }
    }

    &__tab-label {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }

    &__member-grid,
    &__menu-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    &__member-grid article {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;

      :deep(.el-avatar) {
        font-weight: 700;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border: 1px solid var(--el-color-primary-light-7);
      }
    }

    &__member-copy,
    &__role-copy {
      display: grid;
      min-width: 0;

      strong,
      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      span,
      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__role-list {
      display: grid;
      gap: 10px;

      article {
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 0;
        padding: 12px 14px;
      }
    }

    &__role-icon {
      display: grid;
      flex: 0 0 38px;
      place-items: center;
      width: 38px;
      height: 38px;
      font-weight: 700;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);
    }

    &__role-copy {
      flex: 1;

      > div {
        display: flex;
        gap: 8px;
        align-items: center;
        min-width: 0;
      }
    }

    &__menu-grid article {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
      padding: 12px 14px;

      > span {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: var(--el-border-radius-base);
      }

      > div {
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
          color: var(--el-text-color-primary);
        }

        small {
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    @media (width <= 860px) {
      &__hero {
        flex-direction: column;
      }

      &__hero-actions {
        flex-wrap: wrap;
        width: 100%;
        padding-left: 60px;
      }

      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__chain {
        flex-direction: column;
        align-items: stretch;
      }

      &__chain-arrow {
        margin-left: 9px;
        transform: rotate(90deg);
      }
    }

    @media (width <= 620px) {
      &__member-grid,
      &__menu-grid,
      &__metrics {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
