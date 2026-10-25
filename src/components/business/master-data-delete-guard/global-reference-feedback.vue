<template><MasterDataDeleteGuard ref="guardRef" /></template>

<script setup lang="ts">
  import MasterDataDeleteGuard from './index.vue'
  import { getRecordReferenceMeta } from './record-meta'
  import { recordDeleteGuardOptions } from '@/hooks/core/useRecordDeleteGuard'
  import type { DeleteReferenceContext } from '@/utils/supabase/delete-reference'

  const props = defineProps<{ context: DeleteReferenceContext }>()
  const guardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const showReferences = (context: DeleteReferenceContext): void => {
    const label = getRecordReferenceMeta(context.table).label
    void guardRef.value?.inspect(
      recordDeleteGuardOptions(
        context,
        label,
        context.ids.map((id) => ({ id, label: '当前记录' }))
      )
    )
  }
  onMounted(() => showReferences(props.context))
  watch(() => props.context, showReferences)
</script>
