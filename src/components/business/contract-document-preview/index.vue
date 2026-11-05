<template>
  <ArtDialog ref="dialogRef" size="xl" :show-footer="false">
    <article v-if="document" class="contract-document" aria-label="合同文书预览">
      <header class="text-center">
        <h1 class="m-0 text-3xl font-semibold leading-relaxed">{{ document.title }}</h1>
        <p class="mt-2 text-sm">编号：{{ document.documentNo }}</p>
        <p class="mt-2 text-base">
          有效期：{{ document.startsOn || '未约定' }} 至 {{ document.endsOn || '未约定' }}
        </p>
      </header>
      <dl class="mt-8 grid gap-3 text-base">
        <div class="flex flex-wrap gap-x-3"
          ><dt>{{ document.partyA.label || '甲方' }}：</dt><dd>{{ document.partyA.name }}</dd></div
        >
        <div class="flex flex-wrap gap-x-3"
          ><dt>{{ document.partyB.label || '乙方' }}：</dt><dd>{{ document.partyB.name }}</dd></div
        >
        <div v-for="fact in document.facts" :key="fact.label" class="flex flex-wrap gap-x-3">
          <dt>{{ fact.label }}：</dt><dd>{{ fact.value || '—' }}</dd>
        </div>
      </dl>
      <p v-if="document.settlementText" class="mt-6 leading-8">{{ document.settlementText }}</p>
      <section class="contract-document__body mt-6" aria-label="合同正文" v-html="safeContent" />
      <section v-if="document.attachments.length" class="mt-8" aria-label="合同附件">
        <ArtSectionTitle>附件</ArtSectionTitle>
        <ArtUploadFile :model-value="document.attachments" title="文书附件" multiple readonly />
      </section>
      <section v-if="document.certificateGroups?.length" class="mt-8" aria-label="认证证照">
        <ArtSectionTitle>证照附件</ArtSectionTitle>
        <div class="grid gap-5 sm:grid-cols-2">
          <div v-for="group in document.certificateGroups" :key="group.label" class="min-w-0">
            <p class="mb-2 font-medium">{{ group.label }}</p>
            <ArtUploadImage
              v-if="group.urls.length"
              :model-value="group.urls"
              :title="group.label"
              :size="100"
              multiple
              readonly
              preview-fit="contain"
            />
            <p v-else class="text-sm">未附{{ group.label }}图片</p>
          </div>
        </div>
      </section>
      <footer class="contract-document__signatures mt-12 grid gap-8 sm:grid-cols-2">
        <section
          v-for="(party, index) in [document.partyA, document.partyB]"
          :key="index"
          class="relative min-w-0 pt-24"
        >
          <img
            v-if="safeImageUrl(party.sealUrl)"
            :src="safeImageUrl(party.sealUrl)"
            :alt="`${index === 0 ? '甲方' : '乙方'}印章`"
            width="132"
            height="132"
            class="absolute top-0 right-4 h-[132px] w-[132px] object-contain"
          />
          <img
            v-if="safeImageUrl(party.signatureUrl)"
            :src="safeImageUrl(party.signatureUrl)"
            :alt="`${index === 0 ? '甲方' : '乙方'}手写签名`"
            width="160"
            height="72"
            class="relative mb-3 h-[72px] w-[160px] object-contain"
          />
          <p>{{ index === 0 ? '甲方' : '乙方' }}（签章）：{{ party.name }}</p>
          <p class="mt-3">代表人：{{ party.representative || '未填写' }}</p>
          <p class="mt-3">签署日期：{{ formatSignedDate(party.signedOn) }}</p>
        </section>
      </footer>
    </article>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import DOMPurify from 'dompurify'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import { resolveFileActionUrl } from '@/utils/file/url'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import type { ContractDocument, ContractDocumentPreviewExpose } from './types'

  defineOptions({ name: 'ContractDocumentPreview' })
  const formatSignedDate = createDateTimeFormatter({ format: 'YYYY-MM-DD', emptyText: '待签署' })
  const dialogRef = ref<ArtDialogExpose>()
  const document = shallowRef<ContractDocument>()
  const safeContent = computed(() => DOMPurify.sanitize(document.value?.contentHtml || ''))
  const safeImageUrl = (url?: string | null): string | undefined => {
    return resolveFileActionUrl(url, window.location.href) || undefined
  }
  const handleOpen: ContractDocumentPreviewExpose['handleOpen'] = async (data) => {
    document.value = cloneDeep(data)
    await dialogRef.value?.handleOpen(undefined, {
      title: '文书预览',
      subtitle: data.documentNo,
      contentMaxHeight: '78vh',
      onReset: () => {
        document.value = undefined
      }
    })
  }
  defineExpose<ContractDocumentPreviewExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  .contract-document {
    // The legal document is white paper in either workspace theme.
    --el-text-color-primary: #222;
    --el-text-color-regular: #444;
    --el-text-color-secondary: #666;
    --el-border-color: #ddd;
    --el-border-color-lighter: #ddd;
    --el-bg-color: #fff;
    --el-fill-color-lighter: #f7f7f7;
    --color-box: #fff;

    min-height: 1040px;
    padding: 40px;
    color: #222;
    overflow-wrap: anywhere;
    background: #fff;

    dd {
      margin: 0;
    }

    &__body {
      min-height: 280px;
      font-size: 16px;
      line-height: 2;

      :deep(img) {
        max-width: 100%;
        height: auto;
      }

      :deep(table) {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
      }

      :deep(td),
      :deep(th) {
        padding: 8px;
        border: 1px solid #bbb;
      }

      :deep(p) {
        margin: 0 0 12px;
      }
    }

    @media (width <= 640px) {
      min-height: 0;
      padding: 20px 16px;
    }
  }
</style>
