<template>
  <ArtDrawer ref="drawerRef" :show-footer="false" append-to-body>
    <template #header>
      <div class="capability-center__header">
        <span class="capability-center__brand">
          <ArtSvgIcon icon="ri:radar-line" />
        </span>
        <div>
          <strong>Supabase 全域能力中心</strong>
          <small>实时探测平台能力、安全边界与 AI 可用工具</small>
        </div>
        <ArtTooltip content="刷新能力快照" placement="bottom">
          <ArtIconButton
            class="capability-center__refresh"
            icon="ri:refresh-line"
            label="刷新能力快照"
            :loading="loading"
            @click="loadSnapshot"
          />
        </ArtTooltip>
      </div>
    </template>

    <div v-if="snapshot" class="capability-center">
      <section class="capability-center__summary">
        <div>
          <span>PROJECT INTELLIGENCE MAP</span>
          <h3>{{ enabledDomainCount }} / {{ capabilityCards.length }} 个能力域已启用</h3>
          <p>
            快照 {{ formatCapturedAt(snapshot.capturedAt) }} · PostgreSQL
            {{ snapshot.database.version }} · 全程只返回聚合元数据
          </p>
        </div>
        <div class="capability-center__coverage">
          <ElProgress
            type="dashboard"
            :percentage="snapshot.security.rlsCoveragePercent"
            :width="92"
            :stroke-width="8"
            color="var(--el-color-success)"
          />
          <span>RLS 覆盖率</span>
        </div>
      </section>

      <section>
        <ArtSectionTitle :show-line="false">Supabase 产品能力</ArtSectionTitle>
        <div class="capability-center__grid">
          <article
            v-for="card in capabilityCards"
            :key="card.key"
            :class="{ 'is-disabled': !card.enabled }"
          >
            <header>
              <span class="capability-center__card-icon"><ArtSvgIcon :icon="card.icon" /></span>
              <div>
                <strong>{{ card.title }}</strong>
                <small>{{ card.subtitle }}</small>
              </div>
              <ElTag
                class="capability-center__status-tag"
                :type="card.tagType"
                size="small"
                effect="light"
                round
              >
                {{ card.statusLabel }}
              </ElTag>
            </header>
            <div class="capability-center__metrics">
              <span v-for="metric in card.metrics" :key="metric.label">
                <strong>{{ metric.value }}</strong>
                <small>{{ metric.label }}</small>
              </span>
            </div>
            <footer>
              <span>{{ card.description }}</span>
              <ElButton text type="primary" @click="analyze(card)">
                AI 专项分析 <ArtSvgIcon icon="ri:arrow-right-up-line" />
              </ElButton>
            </footer>
          </article>
        </div>
      </section>

      <section class="capability-center__governance">
        <ArtSectionTitle :show-line="false">治理信号</ArtSectionTitle>
        <div class="capability-center__governance-grid">
          <article>
            <span class="is-success"><ArtSvgIcon icon="ri:shield-check-line" /></span>
            <div>
              <strong>RLS 租户隔离</strong>
              <small>
                {{ snapshot.security.rlsEnabledTables }} / {{ snapshot.security.publicTables }} 张
                public 表已启用 RLS
              </small>
            </div>
          </article>
          <article>
            <span :class="snapshot.security.invalidIndexes ? 'is-warning' : 'is-success'">
              <ArtSvgIcon
                :icon="snapshot.security.invalidIndexes ? 'ri:error-warning-line' : 'ri:check-line'"
              />
            </span>
            <div>
              <strong>索引有效性</strong>
              <small>{{ snapshot.security.invalidIndexes }} 个无效或未就绪索引</small>
            </div>
          </article>
          <article>
            <span :class="snapshot.security.unindexedForeignKeys ? 'is-warning' : 'is-success'">
              <ArtSvgIcon icon="ri:git-branch-line" />
            </span>
            <div>
              <strong>外键索引覆盖</strong>
              <small>{{ snapshot.security.unindexedForeignKeys }} 条外键需要评估索引</small>
            </div>
          </article>
          <article>
            <span :class="snapshot.storage.publicBuckets ? 'is-info' : 'is-success'">
              <ArtSvgIcon icon="ri:folder-shield-2-line" />
            </span>
            <div>
              <strong>Storage 公开边界</strong>
              <small>{{ snapshot.storage.publicBuckets }} 个公开桶，建议定期复核访问策略</small>
            </div>
          </article>
        </div>
      </section>

      <section class="capability-center__extensions">
        <ArtSectionTitle :show-line="false">Postgres 扩展</ArtSectionTitle>
        <div class="capability-center__extension-list">
          <ElTag
            v-for="extension in snapshot.extensions.installed"
            :key="extension.name"
            effect="plain"
            round
          >
            {{ extension.name }} · {{ extension.version }}
          </ElTag>
        </div>
      </section>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { formatSize } from '@/utils/file/format-size'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ElMessage } from 'element-plus'
  import { fetchProjectCatalog } from '@/api/supabase-ai-assistant'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type {
    ProjectCapabilitySnapshot,
    ProjectEdgeFunctionResult
  } from '@/types/supabase-ai-assistant'

  defineOptions({ name: 'ProjectCapabilityCenterDrawer' })

  interface OpenData {
    edgeFunctions: ProjectEdgeFunctionResult | null
  }

  interface CapabilityMetric {
    label: string
    value: string | number
  }

  interface CapabilityCard {
    key: string
    title: string
    subtitle: string
    description: string
    icon: string
    enabled: boolean
    statusLabel: string
    tagType: 'success' | 'warning' | 'info'
    metrics: CapabilityMetric[]
    prompt: string
  }

  const emit = defineEmits<{ analyze: [prompt: string] }>()
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const snapshot = ref<ProjectCapabilitySnapshot | null>(null)
  const edgeFunctions = ref<ProjectEdgeFunctionResult | null>(null)
  const loading = ref(false)

  const capabilityCards = computed<CapabilityCard[]>(() => {
    if (!snapshot.value) return []
    const data = snapshot.value
    const edgeCount = edgeFunctions.value?.functions.length ?? 0
    return [
      {
        key: 'database',
        title: 'Database',
        subtitle: 'PostgreSQL 数据底座',
        description: '结构、容量、连接与缓存命中率实时可见。',
        icon: 'ri:database-2-line',
        enabled: true,
        statusLabel: '运行中',
        tagType: 'success',
        metrics: [
          { label: 'public 表', value: data.database.publicTables },
          { label: '数据库大小', value: formatSize(data.database.sizeBytes, { precision: 1 }) },
          { label: '缓存命中', value: `${data.database.cacheHitPercent}%` }
        ],
        prompt:
          '全面分析当前 Database 容量、连接、缓存命中、表规模和结构治理状态，列出优先级与证据。'
      },
      {
        key: 'security',
        title: 'RLS & Security',
        subtitle: '数据访问安全',
        description: 'RLS、策略、视图与索引安全态势可审计。',
        icon: 'ri:shield-keyhole-line',
        enabled: data.security.rlsEnabledTables > 0,
        statusLabel: data.security.rlsCoveragePercent === 100 ? '覆盖完整' : '需要治理',
        tagType: data.security.rlsCoveragePercent === 100 ? 'success' : 'warning',
        metrics: [
          { label: 'RLS 覆盖', value: `${data.security.rlsCoveragePercent}%` },
          { label: '策略', value: data.security.policyCount },
          { label: '未索引外键', value: data.security.unindexedForeignKeys }
        ],
        prompt:
          '执行全项目 RLS 与安全治理审计，重点检查策略覆盖、视图 security_invoker、无效索引和未索引外键。'
      },
      {
        key: 'auth',
        title: 'Auth',
        subtitle: '身份认证与用户体系',
        description: '仅聚合分析用户确认率和近期活跃度，不读取身份明细。',
        icon: 'ri:shield-user-line',
        enabled: data.auth.enabled,
        statusLabel: data.auth.enabled ? '已启用' : '未启用',
        tagType: data.auth.enabled ? 'success' : 'info',
        metrics: [
          { label: '用户', value: data.auth.users },
          { label: '已确认', value: data.auth.confirmedUsers },
          { label: '30 天活跃', value: data.auth.active30d }
        ],
        prompt:
          '分析当前 Supabase Auth 聚合态势，包括确认率、活跃度、JWT/RLS 联动和企业级认证治理建议。'
      },
      {
        key: 'storage',
        title: 'Storage',
        subtitle: '对象存储',
        description: '桶、对象、容量和访问策略覆盖统一分析。',
        icon: 'ri:cloud-line',
        enabled: data.storage.enabled,
        statusLabel: data.storage.enabled ? '已启用' : '未启用',
        tagType: data.storage.enabled ? 'success' : 'info',
        metrics: [
          { label: '桶', value: data.storage.buckets },
          { label: '对象', value: data.storage.objects },
          { label: '容量', value: formatSize(data.storage.totalBytes, { precision: 1 }) }
        ],
        prompt:
          '审计 Supabase Storage 的桶、容量、公开边界和 RLS 策略，给出上传、覆盖、下载与删除权限检查清单。'
      },
      {
        key: 'realtime',
        title: 'Realtime',
        subtitle: '实时数据与协作',
        description: '检测 Postgres Changes 发布范围，并规划 Broadcast 与 Presence。',
        icon: 'ri:radio-line',
        enabled: data.realtime.enabled,
        statusLabel: data.realtime.enabled ? '已启用' : '未启用',
        tagType: data.realtime.enabled ? 'success' : 'info',
        metrics: [
          { label: '发布表', value: data.realtime.publishedTables },
          { label: 'Publication', value: data.realtime.enabled ? '可用' : '未配置' }
        ],
        prompt:
          '分析当前 Realtime 发布范围，并为 Postgres Changes、Broadcast、Presence 给出安全、性能和业务场景建议。'
      },
      {
        key: 'functions',
        title: 'Edge Functions',
        subtitle: '服务端计算与集成',
        description: '函数清单、JWT 校验和外部服务集成可统一审计。',
        icon: 'ri:flashlight-line',
        enabled: edgeCount > 0,
        statusLabel: edgeCount > 0 ? '已启用' : '未检测到',
        tagType: edgeCount > 0 ? 'success' : 'info',
        metrics: [
          { label: '函数', value: edgeCount },
          {
            label: 'JWT 校验',
            value:
              edgeFunctions.value?.functions.filter((item) => item.verifyJwt ?? item.verify_jwt)
                .length ?? 0
          }
        ],
        prompt:
          '全面审计 Edge Functions 清单、JWT 校验、密钥边界、错误恢复和可观测性，并按风险排序。'
      },
      {
        key: 'cron',
        title: 'Cron',
        subtitle: '定时任务',
        description: '检测 pg_cron 与任务运行能力，未启用不视为故障。',
        icon: 'ri:time-line',
        enabled: data.cron.enabled,
        statusLabel: data.cron.enabled ? '已启用' : '未启用',
        tagType: data.cron.enabled ? 'success' : 'info',
        metrics: [
          { label: '任务', value: data.cron.jobs },
          { label: '活动任务', value: data.cron.activeJobs }
        ],
        prompt:
          '评估项目是否需要 Supabase Cron，基于现有业务给出适合自动化的任务、幂等、重试和监控方案。'
      },
      {
        key: 'queues',
        title: 'Queues',
        subtitle: '可靠异步处理',
        description: '检测 pgmq 队列能力，并规划重试、可见性超时与削峰。',
        icon: 'ri:stack-line',
        enabled: data.queues.enabled,
        statusLabel: data.queues.enabled ? '已启用' : '未启用',
        tagType: data.queues.enabled ? 'success' : 'info',
        metrics: [{ label: '队列', value: data.queues.queues }],
        prompt:
          '评估项目引入 Supabase Queues 的收益，识别适合异步化的任务并给出重试、死信和并发控制方案。'
      },
      {
        key: 'vectors',
        title: 'Vectors',
        subtitle: '语义检索与 RAG',
        description: '检测 pgvector、向量字段和 HNSW/IVFFlat 索引能力。',
        icon: 'ri:brain-line',
        enabled: data.vectors.enabled,
        statusLabel: data.vectors.enabled ? '已启用' : '未启用',
        tagType: data.vectors.enabled ? 'success' : 'info',
        metrics: [
          { label: '向量字段', value: data.vectors.columns },
          { label: '向量索引', value: data.vectors.indexes }
        ],
        prompt:
          '评估当前项目使用 pgvector、Embedding 和 RAG 的企业级落地机会，给出数据源、索引、权限和更新链路方案。'
      }
    ]
  })

  const enabledDomainCount = computed(
    () => capabilityCards.value.filter((card) => card.enabled).length
  )

  function formatCapturedAt(value: string): string {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(value))
  }

  async function loadSnapshot(): Promise<void> {
    if (loading.value) return
    loading.value = true
    drawerRef.value?.setLoading(true)
    try {
      snapshot.value = await fetchProjectCatalog({
        catalogAction: 'capability_snapshot'
      })
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, 'Supabase 能力快照加载失败'))
    } finally {
      loading.value = false
      drawerRef.value?.setLoading(false)
    }
  }

  async function analyze(card: CapabilityCard): Promise<void> {
    await drawerRef.value?.handleClose()
    emit('analyze', card.prompt)
  }

  async function handleOpen(data: OpenData): Promise<void> {
    edgeFunctions.value = data.edgeFunctions
    await drawerRef.value?.handleOpen(data, {
      title: 'Supabase 全域能力中心',
      size: 'lg',
      contentHeight: 'calc(100vh - 94px)',
      showFooter: false,
      scrollbarAlways: true,
      drawerProps: {
        class: 'project-capability-drawer',
        resizable: true
      },
      onOpen: async () => {
        await loadSnapshot()
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .capability-center {
    display: flex;
    flex-direction: column;
    gap: 22px;

    &__header {
      display: flex;
      gap: 10px;
      align-items: center;
      width: 100%;

      > div {
        flex: 1;
        min-width: 0;

        strong,
        small {
          display: block;
        }

        small {
          margin-top: 3px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }

      > .capability-center__refresh {
        flex: 0 0 auto;
        margin-left: auto;
      }
    }

    &__brand {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      color: white;
      background: linear-gradient(145deg, var(--el-color-primary-light-3), var(--el-color-primary));
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 8px 18px rgb(64 128 255 / 22%);
    }

    &__summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px;
      background:
        radial-gradient(circle at 88% 15%, var(--el-color-primary-light-8), transparent 32%),
        linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-bg-color));
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--el-border-radius-base);

      > div:first-child {
        min-width: 0;

        > span {
          font-size: 10px;
          font-weight: 700;
          color: var(--el-color-primary);
          letter-spacing: 1.2px;
        }

        h3 {
          margin: 7px 0 4px;
          font-size: 20px;
        }

        p {
          margin: 0;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__coverage {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: center;

      > span {
        margin-top: -10px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;

      > article {
        padding: 14px;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);
        box-shadow: 0 5px 16px rgb(0 0 0 / 3%);
        transition:
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease;

        &:hover {
          border-color: var(--el-color-primary-light-7);
          box-shadow: 0 10px 24px rgb(64 128 255 / 9%);
          transform: translateY(-1px);
        }

        &.is-disabled {
          background: var(--el-fill-color-extra-light);

          .capability-center__card-icon {
            color: var(--el-text-color-secondary);
            background: var(--el-fill-color);
          }
        }

        header {
          display: flex;
          gap: 9px;
          align-items: center;

          .capability-center__card-icon {
            display: grid;
            flex: 0 0 auto;
            place-items: center;
            width: 34px;
            height: 34px;
            color: var(--el-color-primary);
            background: var(--el-color-primary-light-9);
            border-radius: var(--el-border-radius-base);
          }

          > div {
            flex: 1;
            min-width: 0;

            strong,
            small {
              display: block;
            }

            small {
              margin-top: 2px;
              font-size: 10px;
              color: var(--el-text-color-secondary);
            }
          }

          .capability-center__status-tag {
            flex: 0 0 auto;
            padding-inline: 8px;
          }
        }

        footer {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
          padding-top: 9px;
          margin-top: 10px;
          border-top: 1px solid var(--el-border-color-extra-light);

          > span {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 10px;
            color: var(--el-text-color-secondary);
            white-space: nowrap;
          }

          .el-button {
            flex: 0 0 auto;
            margin: 0;
          }
        }
      }
    }

    &__metrics {
      display: flex;
      gap: 6px;
      margin-top: 12px;

      > span {
        flex: 1;
        min-width: 0;
        padding: 7px;
        background: var(--el-fill-color-extra-light);
        border-radius: var(--el-border-radius-small);

        strong,
        small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 13px;
        }

        small {
          margin-top: 2px;
          font-size: 9px;
          color: var(--el-text-color-placeholder);
        }
      }
    }

    &__governance-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;

      article {
        display: flex;
        gap: 9px;
        align-items: center;
        padding: 10px 12px;
        background: var(--el-fill-color-extra-light);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;

          &.is-success {
            color: var(--el-color-success);
            background: var(--el-color-success-light-9);
          }

          &.is-warning {
            color: var(--el-color-warning);
            background: var(--el-color-warning-light-9);
          }

          &.is-info {
            color: var(--el-color-info);
            background: var(--el-color-info-light-9);
          }
        }

        > div {
          min-width: 0;

          strong,
          small {
            display: block;
          }

          strong {
            font-size: 12px;
          }

          small {
            margin-top: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 10px;
            color: var(--el-text-color-secondary);
            white-space: nowrap;
          }
        }
      }
    }

    &__extension-list {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 10px;
    }
  }

  @media (width <= 640px) {
    .capability-center__grid,
    .capability-center__governance-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
