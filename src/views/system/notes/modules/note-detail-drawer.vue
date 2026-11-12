<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="note" class="note-detail">
      <section class="note-detail__hero art-card-xs">
        <span class="note-detail__icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:quill-pen-line" />
        </span>
        <div class="note-detail__hero-copy">
          <h2>时间轴笔记</h2>
          <p>{{ authorLabel(note) }} · {{ formatWithDayjs(note.createdAt) || '--' }}</p>
        </div>
      </section>

      <ArtSectionCard class="note-detail__section" preserve-content-structure>
        <header class="note-detail__section-head">
          <div>
            <ArtSectionTitle :show-line="false">笔记正文</ArtSectionTitle>
            <p>移动端时间轴中的原始内容</p>
          </div>
          <span>{{ note.contentText.length }} 字</span>
        </header>
        <div class="note-detail__content" v-html="safeContent" />
      </ArtSectionCard>

      <ArtSectionCard class="note-detail__section" preserve-content-structure>
        <header class="note-detail__section-head">
          <div>
            <ArtSectionTitle :show-line="false">记录信息</ArtSectionTitle>
            <p>归属、标签与同步时间</p>
          </div>
        </header>
        <dl class="note-detail__facts">
          <div
            ><dt>归属用户</dt><dd>{{ authorLabel(note) }}</dd></div
          >
          <div
            ><dt>用户标识</dt><dd class="note-detail__mono">{{ note.userId }}</dd></div
          >
          <div
            ><dt>标签</dt><dd>{{ note.tags.length ? note.tags.join('、') : '未设置标签' }}</dd></div
          >
          <div
            ><dt>更新时间</dt><dd>{{ formatWithDayjs(note.updatedAt) || '--' }}</dd></div
          >
          <div
            ><dt>图片附件</dt
            ><dd>{{ note.images.length ? `${note.images.length} 张` : '无图片附件' }}</dd></div
          >
        </dl>
        <div v-if="note.imageUrls.length" class="note-detail__images">
          <img
            v-for="(url, index) in note.imageUrls"
            :key="url"
            :src="url"
            width="160"
            height="160"
            loading="lazy"
            :alt="`笔记图片 ${index + 1}`"
          />
        </div>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import DOMPurify from 'dompurify'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { formatWithDayjs } from '@/utils/time'

  const drawerRef = ref<ArtDrawerExpose<Api.Notes.NoteItem>>()
  const note = shallowRef<Api.Notes.NoteItem>()
  const safeContent = computed(() => DOMPurify.sanitize(note.value?.content ?? ''))
  const authorLabel = (row: Api.Notes.NoteItem): string =>
    row.author?.nickName || row.author?.userName || `移动端用户 · ${row.userId.slice(0, 8)}`

  async function handleOpen(row: Api.Notes.NoteItem): Promise<void> {
    note.value = row
    await drawerRef.value?.handleOpen(row, {
      title: '笔记详情',
      subtitle: '按时间轴语义查看正文、标签与附件。',
      contentHeight: 'calc(100vh - 126px)',
      scrollbarAlways: true,
      showFooter: false,
      onReset: () => {
        note.value = undefined
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .note-detail {
    display: grid;
    gap: 16px;

    &__hero {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 18px;
    }

    &__icon {
      display: grid;
      flex: 0 0 42px;
      place-items: center;
      width: 42px;
      height: 42px;
      font-size: 20px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-control-radius);
    }

    &__hero-copy {
      min-width: 0;
    }

    &__title-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 18px;
      color: var(--el-text-color-primary);
    }

    &__hero-copy p,
    &__section-head p {
      margin-top: 4px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__section {
      min-width: 0;
    }

    &__section-head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    &__section-head > span {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__content {
      font-size: 14px;
      line-height: 1.8;
      color: var(--el-text-color-primary);
      overflow-wrap: anywhere;
    }

    &__content :deep(p) {
      margin: 0 0 10px;
    }

    &__content :deep(img) {
      max-width: 100%;
      height: auto;
      border-radius: var(--art-control-radius);
    }

    &__content :deep(a) {
      color: var(--el-color-primary);
    }

    &__facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 24px;
      margin: 0;
    }

    &__facts div {
      display: grid;
      grid-template-columns: 78px minmax(0, 1fr);
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__facts dt {
      color: var(--el-text-color-secondary);
    }

    &__facts dd {
      min-width: 0;
      margin: 0;
      color: var(--el-text-color-primary);
      overflow-wrap: anywhere;
    }

    &__mono {
      font-family: var(--el-font-family-monospace);
      font-size: 12px;
    }

    &__images {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 14px;
    }

    &__images img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: var(--art-control-radius);
    }
  }

  @media (width <= 720px) {
    .note-detail__facts {
      grid-template-columns: 1fr;
    }
  }
</style>
