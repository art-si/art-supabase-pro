<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="workflow-catalog">
      <ArtWorkspaceSplitter
        primary-size="264px"
        primary-min="240px"
        primary-max="380px"
        :breakpoint="900"
        stacked-primary-size="300px"
      >
        <template #primary>
          <aside class="workflow-catalog__menu">
            <WorkflowBusinessMenuFilter
              :data="menuTree"
              :selected-menu-id="selectedMenuId"
              :loading="loading"
              @select="handleMenuSelect"
              @refresh="emit('refresh')"
            />
          </aside>
        </template>

        <div class="workflow-catalog__content">
          <section class="workflow-catalog__summary">
            <div class="workflow-catalog__summary-copy">
              <span><ArtSvgIcon icon="ri:apps-2-line" /></span>
              <div>
                <strong>{{ visibleContracts.length }} 类业务纳入当前覆盖范围</strong>
                <p>每类业务均使用服务端真实数据做条件判断，并在审批时提供业务决策快照。</p>
              </div>
            </div>
            <div class="workflow-catalog__summary-meta">
              <dl class="workflow-catalog__summary-stats">
                <div>
                  <dt>高风险</dt>
                  <dd>{{ visibleHighRiskCount }}</dd>
                </div>
                <div>
                  <dt>决策字段</dt>
                  <dd>{{ visibleFieldCount }}</dd>
                </div>
              </dl>
              <ElTag class="workflow-catalog__coverage" type="success" effect="plain" round>
                <ArtSvgIcon icon="ri:shield-check-line" />
                当前范围 {{ visibleContracts.length }} / {{ workflowBusinessContracts.length }}
              </ElTag>
            </div>
          </section>

          <ElScrollbar class="workflow-catalog__body">
            <div class="workflow-catalog__body-inner">
              <section
                v-if="visibleContracts.length"
                class="workflow-catalog__grid"
                aria-label="审批业务覆盖矩阵"
              >
                <article
                  v-for="contract in visibleContracts"
                  :key="contract.businessType"
                  class="art-card-xs"
                >
                  <header>
                    <span><ArtSvgIcon :icon="domainIcon(contract.domain)" /></span>
                    <div>
                      <strong>{{ contract.label }}</strong>
                      <small>{{ contract.owner }} · {{ domainLabel(contract.domain) }}</small>
                    </div>
                    <ElTag
                      class="workflow-catalog__risk"
                      :type="contract.riskLevel === 'high' ? 'danger' : 'warning'"
                      effect="plain"
                      size="small"
                      round
                    >
                      <ArtSvgIcon
                        :icon="
                          contract.riskLevel === 'high'
                            ? 'ri:alarm-warning-line'
                            : 'ri:error-warning-line'
                        "
                      />
                      {{ contract.riskLevel === 'high' ? '高风险' : '中风险' }}
                    </ElTag>
                  </header>
                  <dl>
                    <div
                      ><dt>业务归口</dt><dd>{{ contract.owner }}</dd></div
                    >
                    <div
                      ><dt>条件字段</dt><dd>{{ contract.fields.length }} 个</dd></div
                    >
                    <div
                      ><dt>可信上下文</dt
                      ><dd><ArtSvgIcon icon="ri:checkbox-circle-fill" />服务端生成</dd></div
                    >
                    <div
                      ><dt>状态防绕过</dt
                      ><dd><ArtSvgIcon icon="ri:checkbox-circle-fill" />数据库守卫</dd></div
                    >
                  </dl>
                  <footer>
                    <small>决策字段</small>
                    <div>
                      <span v-for="field in contract.fields.slice(0, 4)" :key="field.key">
                        {{ field.label }}
                      </span>
                      <span v-if="contract.fields.length > 4" class="is-more">
                        +{{ contract.fields.length - 4 }}
                      </span>
                    </div>
                  </footer>
                </article>
              </section>
              <ArtEmptyState
                v-else
                title="当前菜单下暂无已接入审批的业务"
                description="请先在业务目录接入审批对象。"
              />

              <section class="workflow-catalog__boundary art-card-xs">
                <span><ArtSvgIcon icon="ri:flow-chart" /></span>
                <div>
                  <strong>当前流程图采用“企业审批流”模型</strong>
                  <p>
                    已覆盖顺序节点、条件跳过、或签、全员会签、比例会签、否决策略、SLA、委托和转交。
                    只有出现并行网关、子流程、补偿事件或跨系统长事务时，才需要升级为完整 BPMN 引擎。
                  </p>
                </div>
              </section>
            </div>
          </ElScrollbar>
        </div>
      </ArtWorkspaceSplitter>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { AppRouteRecord } from '@/types/router'
  import { workflowBusinessContracts } from '../../modules/workflow-business-contracts'
  import WorkflowBusinessMenuFilter from './workflow-business-menu-filter.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'

  defineOptions({ name: 'WorkflowBusinessCatalogDialog' })

  const dialogRef = ref<ArtDialogExpose>()
  withDefaults(defineProps<{ menuTree: AppRouteRecord[]; loading?: boolean }>(), {
    loading: false
  })
  const emit = defineEmits<{ refresh: [] }>()
  const selectedMenuId = ref('')
  const selectedBusinessTypes = ref<string[]>([])
  const visibleContracts = computed(() =>
    selectedBusinessTypes.value.length
      ? workflowBusinessContracts.filter((contract) =>
          selectedBusinessTypes.value.includes(contract.businessType)
        )
      : workflowBusinessContracts
  )
  const visibleHighRiskCount = computed(
    () => visibleContracts.value.filter((contract) => contract.riskLevel === 'high').length
  )
  const visibleFieldCount = computed(() =>
    visibleContracts.value.reduce((total, contract) => total + contract.fields.length, 0)
  )

  function handleMenuSelect(menuId: string, businessTypes: string[]): void {
    selectedMenuId.value = menuId
    selectedBusinessTypes.value =
      businessTypes.length === workflowBusinessContracts.length ? [] : businessTypes
  }

  function domainIcon(
    domain: 'transport' | 'finance' | 'master_data' | 'safety' | 'hr' | 'scm'
  ): string {
    return {
      transport: 'ri:truck-line',
      finance: 'ri:money-cny-circle-line',
      master_data: 'ri:database-2-line',
      safety: 'ri:shield-check-line',
      hr: 'ri:team-line',
      scm: 'ri:shopping-bag-3-line'
    }[domain]
  }

  function domainLabel(
    domain: 'transport' | 'finance' | 'master_data' | 'safety' | 'hr' | 'scm'
  ): string {
    return {
      transport: '运输业务',
      finance: '财务业务',
      master_data: '基础资料',
      safety: '安全管理',
      hr: '人力资源',
      scm: '供应链管理'
    }[domain]
  }

  async function handleOpen(): Promise<void> {
    await dialogRef.value?.handleOpen(undefined, {
      title: '审批业务覆盖与风险矩阵',
      subtitle: '用于确认哪些业务必须走审批、由谁负责、以哪些可信字段作出决策。',
      dialogProps: { class: 'workflow-catalog-dialog' },
      showFooter: false
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-catalog {
    min-width: 0;
    height: 100%;
    min-height: 0;

    &__menu,
    &__content {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    &__content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    &__summary,
    &__summary-copy,
    &__summary-meta,
    &__summary-stats {
      display: flex;
      align-items: center;
    }

    &__summary {
      flex: none;
      gap: 16px;
      justify-content: space-between;
      min-width: 0;
      padding: 14px 16px;
      background: color-mix(in srgb, var(--el-color-success-light-9) 78%, var(--default-box-color));
      border: 1px solid var(--el-color-success-light-7);
      border-radius: var(--el-border-radius-base);

      &-copy {
        flex: 1 1 auto;
        gap: 12px;
        min-width: 0;

        > span {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 40px;
          height: 40px;
          font-size: 19px;
          color: var(--el-color-success);
          background: var(--default-box-color);
          border-radius: 50%;
        }

        > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
      }

      &-meta {
        flex: none;
        gap: 12px;
      }

      &-stats {
        gap: 4px;
        margin: 0;

        > div {
          display: grid;
          min-width: 64px;
          padding: 2px 10px;
          text-align: center;
          border-right: 1px solid var(--el-color-success-light-7);

          &:last-child {
            border-right: 0;
          }
        }

        dt {
          font-size: 10px;
          color: var(--art-gray-600);
        }

        dd {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
          color: var(--art-gray-900);
        }
      }

      strong {
        font-size: 15px;
        color: var(--art-gray-900);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--art-gray-600);
      }
    }

    &__body {
      flex: 1 1 auto;
      min-height: 0;

      :deep(.el-scrollbar__view) {
        min-height: 100%;
      }
    }

    &__body-inner {
      display: grid;
      gap: 12px;
      min-height: 100%;
      padding-right: 8px;
    }

    &__coverage,
    &__risk {
      flex: 0 0 auto;

      :deep(.el-tag__content) {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        white-space: nowrap;
      }

      svg {
        font-size: 13px;
      }
    }

    &__coverage.el-tag {
      min-height: 28px;
      padding-inline: 10px;
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      align-content: start;
    }

    &__grid article {
      display: flex;
      flex-direction: column;
      gap: 11px;
      min-width: 0;
      min-height: 208px;
      padding: 14px;
    }

    &__grid header {
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;

      > span {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
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
        color: var(--art-gray-900);
      }

      small {
        font-size: 11px;
        color: var(--art-gray-500);
      }
    }

    &__risk {
      justify-self: end;
      min-width: 68px;
      max-width: 100%;
    }

    &__grid dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0;
      overflow: hidden;
      background: color-mix(in srgb, var(--art-gray-100) 72%, transparent);
      border: 1px solid color-mix(in srgb, var(--art-gray-200) 82%, transparent);
      border-radius: var(--el-border-radius-small);

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
        padding: 7px 9px 8px;
        border-right: 1px solid color-mix(in srgb, var(--art-gray-200) 82%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--art-gray-200) 82%, transparent);

        &:nth-child(2n) {
          border-right: 0;
        }

        &:nth-last-child(-n + 2) {
          border-bottom: 0;
        }
      }

      dt {
        font-size: 11px;
        color: var(--art-gray-500);
      }

      dd {
        display: flex;
        gap: 4px;
        align-items: center;
        min-width: 0;
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--art-gray-800);
        overflow-wrap: anywhere;
      }

      svg {
        color: var(--el-color-success);
      }
    }

    &__grid footer {
      display: grid;
      gap: 6px;
      margin-top: auto;

      > small {
        font-size: 11px;
        color: var(--art-gray-500);
      }

      > div {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        min-width: 0;
      }

      span {
        max-width: 100%;
        padding: 3px 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--art-gray-600);
        white-space: nowrap;
        background: var(--art-gray-50);
        border: 1px solid var(--art-gray-200);
        border-radius: 999px;

        &.is-more {
          flex: 0 0 auto;
          font-weight: 600;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
          border-color: color-mix(in srgb, var(--theme-color) 22%, var(--el-border-color));
        }
      }
    }

    &__boundary {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 14px;

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      strong {
        color: var(--art-gray-900);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.65;
        color: var(--art-gray-600);
      }
    }
  }

  :global(.workflow-catalog-dialog > .el-dialog__body) {
    height: min(78vh, calc(100vh - 136px));
    min-height: 420px;
    overflow: hidden;
  }

  :global(.workflow-catalog-dialog > .el-dialog__body > .art-dialog__content) {
    height: 100%;
  }

  @media only screen and (width <= 1080px) {
    .workflow-catalog {
      &__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 900px) {
    .workflow-catalog {
      height: 100%;

      &__grid {
        grid-template-columns: 1fr;
      }
    }
  }

  @media only screen and (width <= 680px) {
    .workflow-catalog {
      &__grid {
        grid-template-columns: 1fr;
      }

      &__summary {
        flex-direction: column;
        align-items: flex-start;

        &-meta {
          justify-content: space-between;
          width: 100%;
        }
      }
    }
  }
</style>
