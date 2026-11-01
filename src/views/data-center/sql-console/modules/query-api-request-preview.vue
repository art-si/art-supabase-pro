<template>
  <ArtDrawer
    ref="drawer"
    :size="840"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="关闭"
  >
    <div v-if="displayed" class="flex min-w-0 flex-col gap-4">
      <dl class="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs leading-5">
        <dt class="text-g-700">API 名称</dt>
        <dd class="m-0 min-w-0 font-medium text-g-900 [overflow-wrap:anywhere]">
          {{ displayed.name }}
        </dd>
        <dt class="text-g-700">请求地址</dt>
        <dd class="m-0 min-w-0 break-all font-mono text-g-800">POST {{ displayed.url }}</dd>
        <dt class="text-g-700">发起时间</dt>
        <dd class="m-0 min-w-0 text-g-800">
          <time :datetime="displayed.sentAt" :title="displayed.sentAt">
            {{ formatDateTimeValue(displayed.sentAt, { format: 'YYYY-MM-DD HH:mm:ss.SSS' }) }}
          </time>
        </dd>
      </dl>
      <p class="m-0 text-xs leading-5 text-g-700">
        参数以本次调用时为准，用于核对当前结果。请核对参数后再将示例接入应用。
      </p>
      <PlanCodePreview
        ref="bodyPreview"
        title="本次请求参数"
        language="json"
        :code="displayed.body"
        expanded
        max-height="min(280px, 36dvh)"
      />
      <PlanCodePreview
        ref="curlPreview"
        title="本次请求 cURL"
        language="plaintext"
        :code="displayed.curl"
        max-height="min(320px, 40dvh)"
      />
      <PlanCodePreview
        ref="javascriptPreview"
        title="本次请求 JavaScript"
        language="plaintext"
        :code="displayed.javascript"
        max-height="min(320px, 40dvh)"
      />
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { onActivated, onBeforeUnmount, onDeactivated, ref, shallowRef, watch } from 'vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import PlanCodePreview, { type PlanCodePreviewExpose } from './plan-code-preview.vue'
  import type { SqlQueryApiRequestSnapshot } from './query-api-request'

  defineOptions({ name: 'SqlQueryApiRequestPreview' })

  export interface QueryApiRequestPreviewExpose {
    open: () => Promise<void>
    reset: () => void
  }
  const props = defineProps<{ request: SqlQueryApiRequestSnapshot | null }>()
  const drawer = ref<ArtDrawerExpose>()
  const bodyPreview = ref<PlanCodePreviewExpose>()
  const curlPreview = ref<PlanCodePreviewExpose>()
  const javascriptPreview = ref<PlanCodePreviewExpose>()
  const displayed = shallowRef<SqlQueryApiRequestSnapshot | null>(null)
  let generation = 0
  let alive = true
  let active = true
  const invalidatePreviews = (): void => {
    bodyPreview.value?.invalidateCopy()
    curlPreview.value?.invalidateCopy()
    javascriptPreview.value?.invalidateCopy()
  }
  const clear = (): void => {
    generation++
    invalidatePreviews()
    displayed.value = null
  }
  const reset = (): void => {
    clear()
    void drawer.value?.handleClose(true)
  }
  const open = async (): Promise<void> => {
    const request = props.request
    const target = drawer.value
    if (!alive || !active || !request || !target) return
    const version = ++generation
    invalidatePreviews()
    displayed.value = request
    await target.handleOpen(undefined, {
      title: '本次请求',
      subtitle: '核对本次发送参数与结果；调用示例使用凭据占位符，不复用调用标识',
      headerIcon: 'ri:code-s-slash-line',
      onClose: () => {
        if (version === generation && displayed.value === request) clear()
      }
    })
  }
  watch(() => props.request, reset, { flush: 'sync' })
  onActivated(() => {
    active = true
  })
  onDeactivated(() => {
    active = false
    reset()
  })
  onBeforeUnmount(() => {
    alive = false
    reset()
  })
  defineExpose<QueryApiRequestPreviewExpose>({ open, reset })
</script>
