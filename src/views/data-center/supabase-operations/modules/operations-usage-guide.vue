<template>
  <ArtDialog
    ref="dialogRef"
    title="Supabase 运维台使用说明"
    size="lg"
    content-max-height="min(72vh, calc(100vh - 180px))"
    :show-footer="false"
    :show-form-focus-button="false"
  >
    <div class="space-y-5 text-sm leading-6 text-g-700">
      <div class="rounded-lg bg-primary/10 px-4 py-3">
        <p class="font-medium text-g-900">常用顺序</p>
        <p class="mt-1 break-words"
          >创建完整备份 → 校验备份完整性 → 制作分发包 → 下载与解压分发包 → 恢复到本地环境</p
        >
        <p class="mt-1 text-xs text-g-600"
          >只有需要写入另一个全新云项目时，才选择“恢复到新云项目”；“发布短期下载链接”用于跨设备分发。</p
        >
      </div>

      <ElCollapse>
        <ElCollapseItem
          name="connection-and-status"
          title="第一次使用、页面刷新或任务中断，怎么办？"
        >
          <ol class="list-decimal space-y-2 pl-5 text-sm leading-6 text-g-700">
            <li
              >先在仓库终端运行页面上可复制的
              <code>pnpm supabase:ops</code
              >，保持窗口开启，再连接执行端。无需配对码，环境检查可选。</li
            >
            <li>页面刷新后会自动恢复已连接过的任务；“连接并查看任务”只读取状态，不会新建备份。</li>
            <li
              >绿色呼吸点表示最近核对时仍在运行；红色表示执行失败；黄色表示中断、断线或待核对。长时间没有日志输出，不能据此判断完成。</li
            >
            <li
              >“已停止，任务未完成”表示旧任务没有继续运行，日志是历史记录。核对旧 Docker
              导出已停止后，可填写原备份目录续跑；数据库文件不完整时还需输入来源数据库密码。</li
            >
            <li
              >如果旧 Docker
              导出仍在运行，可等待结束，或明确确认“停止旧导出”后再续跑；已有完整文件保留。完成备份必须生成清单并通过完整性校验。</li
            >
          </ol>
        </ElCollapseItem>
      </ElCollapse>

      <div class="flex flex-wrap items-center gap-3">
        <label for="operations-guide-selector" class="shrink-0 font-medium text-g-900"
          >查看功能</label
        >
        <ElSelect
          id="operations-guide-selector"
          v-model="selectedId"
          filterable
          class="min-w-0 flex-1"
          placeholder="输入名称搜索 12 个功能"
          aria-label="搜索和选择运维功能"
        >
          <ElOption
            v-for="operation in SUPABASE_OPERATIONS"
            :key="operation.id"
            :label="operation.title"
            :value="operation.id"
          />
        </ElSelect>
      </div>

      <section
        v-if="selectedOperation && guide"
        :aria-label="`${selectedOperation.title}使用说明`"
        class="space-y-5"
      >
        <div class="border-b border-g-200 pb-4">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold text-g-900">{{ selectedOperation.title }}</h3>
            <ElTag size="small" :type="riskTagType">{{ riskLabel }}</ElTag>
          </div>
          <p class="mt-2">{{ guide.when }}</p>
          <p class="mt-1 text-xs text-g-600">对应脚本：{{ selectedOperation.script }}</p>
        </div>

        <div>
          <h4 class="font-medium text-g-900">怎么操作</h4>
          <ol class="mt-2 list-decimal space-y-1 pl-5">
            <li v-for="step in guide.steps" :key="step">{{ step }}</li>
          </ol>
        </div>

        <div>
          <h4 class="font-medium text-g-900">需要填写</h4>
          <p v-if="selectedOperation.fields.length === 0" class="mt-2"
            >无需填写参数，连接本机执行端后即可执行。</p
          >
          <dl v-else class="mt-2 divide-y divide-g-200 rounded-lg border border-g-200 px-4">
            <div v-for="field in selectedOperation.fields" :key="field.key" class="py-2.5">
              <dt class="font-medium text-g-900">
                {{ field.label
                }}<span class="ml-2 text-xs font-normal text-g-600">{{
                  field.required ? '必填' : '选填'
                }}</span>
              </dt>
              <dd class="mt-0.5 text-xs text-g-700">{{
                field.help || fieldUsage[field.key] || '按页面提示填写；此项仅用于本次任务。'
              }}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h4 class="font-medium text-g-900">完成后会得到</h4>
          <p class="mt-2">{{ guide.result }}</p>
        </div>

        <div class="rounded-lg bg-warning/10 px-4 py-3">
          <h4 class="font-medium text-g-900">使用前留意</h4>
          <ul class="mt-1 list-disc space-y-1 pl-5">
            <li v-for="caution in guide.cautions" :key="caution">{{ caution }}</li>
          </ul>
        </div>
      </section>

      <p class="border-t border-g-200 pt-4 text-xs text-g-600">
        刷新页面后先重新连接执行端查看任务；“已中断”时先核对 Docker
        与已有产物。说明页只提供指引，切换选项不会启动任务。
      </p>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { SupabaseOperationId } from '@/types/supabase-operations'
  import { findSupabaseOperation, SUPABASE_OPERATIONS } from '@/utils/supabase/operations-catalog'
  import { OPERATION_USAGE_GUIDES } from './operations-usage-guide-data'

  const dialogRef = ref<ArtDialogExpose>()
  const selectedId = ref<SupabaseOperationId>('backup')
  const selectedOperation = computed(() => findSupabaseOperation(selectedId.value))
  const guide = computed(() => OPERATION_USAGE_GUIDES[selectedId.value])
  const riskLabel = computed(() => {
    if (selectedOperation.value?.risk === 'remote') return '写入独立云项目'
    if (selectedOperation.value?.risk === 'local') return '本机操作'
    return '读取与校验'
  })
  const riskTagType = computed<'warning' | 'primary' | 'info'>(() => {
    if (selectedOperation.value?.risk === 'remote') return 'warning'
    if (selectedOperation.value?.risk === 'local') return 'primary'
    return 'info'
  })

  const fieldUsage: Record<string, string> = {
    DbPassword: '来源 Supabase 项目的数据库密码。仅传给本次本机任务。',
    ArchivePath: '填写本机 ZIP 路径；制作分发包时留空会在备份目录旁生成 ZIP。',
    SignedUrl: '发布方提供的短期 HTTPS 下载链接；它可能过期。',
    PartsManifestPath: 'ZIP.parts.json 文件路径，分片文件须与清单一起保存。',
    ExpectedSha256: '发布方提供的 64 位 SHA-256，用于验证收到的 ZIP。',
    Destination: '接收分发包后的新解压目录。',
    TargetProjectRef: '要写入的全新空白 Supabase 云项目 ID，不得是来源项目。',
    ConfirmTargetProjectRef: '再次输入同一个目标项目 ID，避免误写。',
    TargetDbPassword: '目标云项目的数据库密码，只用于本次恢复。',
    DistributionProjectRef: '单独用于存放分发包的 Supabase 项目 ID。',
    DistributionSecretKey: '独立分发项目的 Secret Key，只用于本次上传和签发链接。',
    Email: '已恢复到本地环境的 Auth 用户邮箱。',
    Password: '新本地密码至少 8 位，只修改本地账号。'
  }

  function handleOpen(operationId?: SupabaseOperationId): void {
    if (operationId && findSupabaseOperation(operationId)) selectedId.value = operationId
    void dialogRef.value?.handleOpen()
  }

  defineExpose({ handleOpen })
</script>
