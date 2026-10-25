<template>
  <div class="resource-media-cover" :class="[`is-${kind}`, `tone-${presentation.tone}`]">
    <template v-if="kind === 'image'">
      <el-image :src="props.resource.url" fit="cover" class="resource-media-cover__image" lazy>
        <template #error>
          <div class="resource-media-cover__fallback">
            <ArtSvgIcon icon="ri:image-line" />
            <span>图片加载失败</span>
          </div>
        </template>
      </el-image>
    </template>

    <template v-else-if="kind === 'video'">
      <video
        v-if="props.resource.url && !videoFailed"
        ref="videoRef"
        :key="props.resource.url"
        :src="props.resource.url"
        class="resource-media-cover__video"
        preload="none"
        muted
        playsinline
        aria-hidden="true"
        tabindex="-1"
        @loadedmetadata="handleVideoMetadata"
        @play="emit('playbackStateChange', true)"
        @pause="handlePause"
        @ended="handleEnded"
        @error="videoFailed = true"
      />
      <div v-else class="resource-media-cover__fallback">
        <ArtSvgIcon icon="ri:video-line" />
        <span>视频封面不可用</span>
      </div>
      <ArtIconButton
        class="resource-media-cover__control"
        :icon="props.playing ? 'ri:pause-fill' : 'ri:play-fill'"
        :label="props.playing ? '暂停视频' : '播放视频'"
        :disabled="videoFailed || !props.resource.url"
        @click.stop="emit('togglePlay')"
        @dblclick.stop
      />
      <span v-if="durationLabel" class="resource-media-cover__duration">{{ durationLabel }}</span>
    </template>

    <template v-else-if="kind === 'audio'">
      <audio
        v-if="props.resource.url"
        ref="audioRef"
        :key="props.resource.url"
        :src="props.resource.url"
        preload="none"
        @loadedmetadata="handleAudioMetadata"
        @play="emit('playbackStateChange', true)"
        @pause="handlePause"
        @ended="handleEnded"
        @error="mediaFailed = true"
      />
      <ArtIconButton
        class="resource-media-cover__audio-control"
        :icon="props.playing ? 'ri:pause-fill' : 'ri:music-2-fill'"
        :label="props.playing ? '暂停音频' : '播放音频'"
        :disabled="mediaFailed || !props.resource.url"
        @click.stop="emit('togglePlay')"
        @dblclick.stop
      />
      <div
        class="resource-media-cover__wave"
        :class="{ 'is-playing': props.playing }"
        aria-hidden="true"
      >
        <i v-for="height in waveform" :key="height" :style="{ height: `${height}%` }" />
      </div>
      <span v-if="durationLabel" class="resource-media-cover__duration">
        {{ durationLabel }}
      </span>
    </template>

    <template v-else>
      <div class="resource-media-cover__document" aria-hidden="true">
        <span class="resource-media-cover__sheet">
          <ArtSvgIcon :icon="presentation.icon" />
        </span>
        <span>{{ presentation.label }}</span>
      </div>
    </template>

    <span v-if="kind !== 'image'" class="resource-media-cover__badge">
      {{ suffixLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
  import type { Resource } from './type'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'

  defineOptions({ name: 'ResourceMediaCover' })

  const props = withDefaults(defineProps<{ resource: Resource; playing?: boolean }>(), {
    playing: false
  })
  const emit = defineEmits<{
    (event: 'togglePlay'): void
    (event: 'playbackStateChange', playing: boolean): void
  }>()

  type ResourceKind = 'image' | 'video' | 'audio' | 'document' | 'file'
  type PresentationTone = 'pdf' | 'word' | 'sheet' | 'slides' | 'text' | 'archive' | 'media'

  interface FilePresentation {
    icon: string
    label: string
    tone: PresentationTone
  }

  const IMAGE_SUFFIXES = new Set(['bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
  const VIDEO_SUFFIXES = new Set(['avi', 'flv', 'mkv', 'mov', 'mp4', 'webm', 'wmv'])
  const AUDIO_SUFFIXES = new Set([
    'aac',
    'ape',
    'flac',
    'm4a',
    'mp3',
    'ogg',
    'wav',
    'wavpack',
    'wma'
  ])
  const DOCUMENT_SUFFIXES = new Set([
    'csv',
    'doc',
    'docx',
    'md',
    'odt',
    'pdf',
    'ppt',
    'pptx',
    'rtf',
    'txt',
    'xls',
    'xlsx'
  ])
  const waveform = [34, 58, 82, 46, 70, 92, 62, 40, 76, 54, 86, 48]

  const videoFailed = ref(false)
  const mediaFailed = ref(false)
  const durationLabel = ref('')
  const videoRef = ref<HTMLVideoElement>()
  const audioRef = ref<HTMLAudioElement>()
  const suffix = computed(() => {
    const explicitSuffix = props.resource.suffix?.trim().replace(/^\./, '').toLowerCase()
    if (explicitSuffix) return explicitSuffix
    const name = props.resource.originName?.trim() ?? ''
    const finalDot = name.lastIndexOf('.')
    return finalDot > -1 ? name.slice(finalDot + 1).toLowerCase() : ''
  })
  const suffixLabel = computed(() => suffix.value.toUpperCase() || 'FILE')
  const kind = computed<ResourceKind>(() => {
    const mimeType = props.resource.mimeType?.toLowerCase() ?? ''
    if (mimeType.startsWith('image/') || IMAGE_SUFFIXES.has(suffix.value)) return 'image'
    if (mimeType.startsWith('video/') || VIDEO_SUFFIXES.has(suffix.value)) return 'video'
    if (mimeType.startsWith('audio/') || AUDIO_SUFFIXES.has(suffix.value)) return 'audio'
    if (
      mimeType.startsWith('text/') ||
      mimeType.includes('document') ||
      mimeType.includes('pdf') ||
      mimeType.includes('sheet') ||
      mimeType.includes('presentation') ||
      DOCUMENT_SUFFIXES.has(suffix.value)
    ) {
      return 'document'
    }
    return 'file'
  })
  const presentation = computed<FilePresentation>(() => {
    if (suffix.value === 'pdf') {
      return { icon: 'ri:file-pdf-2-line', label: 'PDF 文档', tone: 'pdf' }
    }
    if (['doc', 'docx', 'odt', 'rtf'].includes(suffix.value)) {
      return { icon: 'ri:file-word-2-line', label: '文字文档', tone: 'word' }
    }
    if (['csv', 'xls', 'xlsx'].includes(suffix.value)) {
      return { icon: 'ri:file-excel-2-line', label: '电子表格', tone: 'sheet' }
    }
    if (['ppt', 'pptx'].includes(suffix.value)) {
      return { icon: 'ri:file-ppt-2-line', label: '演示文稿', tone: 'slides' }
    }
    if (['md', 'txt'].includes(suffix.value)) {
      return { icon: 'ri:file-text-line', label: '文本文件', tone: 'text' }
    }
    if (['7z', 'rar', 'tar', 'zip'].includes(suffix.value)) {
      return { icon: 'ri:file-zip-line', label: '压缩文件', tone: 'archive' }
    }
    return { icon: 'ri:file-3-line', label: '通用文件', tone: 'media' }
  })

  watch(
    () => props.resource.url,
    () => {
      videoFailed.value = false
      mediaFailed.value = false
      durationLabel.value = ''
    }
  )

  watch(
    () => props.playing,
    async (playing) => {
      await nextTick()
      const media = videoRef.value ?? audioRef.value
      if (!media) {
        if (playing) emit('playbackStateChange', false)
        return
      }
      if (!playing) {
        media.pause()
        return
      }
      try {
        await media.play()
      } catch {
        mediaFailed.value = true
        emit('playbackStateChange', false)
      }
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => {
    const media = videoRef.value ?? audioRef.value
    media?.pause()
  })

  function handleVideoMetadata(event: Event): void {
    const video = event.currentTarget as HTMLVideoElement
    if (Number.isFinite(video.duration)) {
      durationLabel.value = formatDuration(video.duration)
    }
    if (video.duration > 0.2) {
      video.currentTime = Math.min(0.5, video.duration * 0.08)
    }
  }

  function handleAudioMetadata(event: Event): void {
    const audio = event.currentTarget as HTMLAudioElement
    if (Number.isFinite(audio.duration)) durationLabel.value = formatDuration(audio.duration)
  }

  function handlePause(): void {
    if (props.playing) emit('playbackStateChange', false)
  }

  function handleEnded(event: Event): void {
    const media = event.currentTarget as HTMLMediaElement
    media.currentTime = 0
    emit('playbackStateChange', false)
  }

  function formatDuration(duration: number): string {
    const rounded = Math.max(0, Math.round(duration))
    const hours = Math.floor(rounded / 3600)
    const minutes = Math.floor((rounded % 3600) / 60)
    const seconds = rounded % 60
    const minuteSecond = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    return hours ? `${hours}:${minuteSecond}` : minuteSecond
  }
</script>

<style scoped lang="scss">
  .resource-media-cover {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: var(--file-accent, var(--art-gray-700));
    background:
      radial-gradient(
        circle at 76% 16%,
        color-mix(in srgb, currentcolor 13%, transparent),
        transparent 38%
      ),
      linear-gradient(
        145deg,
        color-mix(in srgb, currentcolor 8%, var(--default-box-color)),
        var(--default-box-color)
      );

    &__image,
    &__video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &__video {
      display: block;
      background: var(--art-gray-900);
    }

    &__fallback {
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      font-size: 12px;
      color: var(--art-gray-600);

      :deep(.art-svg-icon) {
        font-size: 30px;
      }
    }

    &__control {
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding-left: 2px;
      font-size: 19px;
      color: #fff;
      background: rgb(15 23 42 / 68%);
      border: 1px solid rgb(255 255 255 / 42%);
      border-radius: var(--art-control-radius);
      box-shadow: 0 6px 18px rgb(15 23 42 / 28%);
      backdrop-filter: blur(5px);
      transform: translate(-50%, -58%);

      &:hover,
      &:focus-visible {
        outline: none;
        background: color-mix(in srgb, var(--theme-color) 82%, rgb(15 23 42 / 72%));
        box-shadow:
          0 0 0 3px rgb(255 255 255 / 32%),
          0 8px 22px rgb(15 23 42 / 34%);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.48;
      }
    }

    &__duration,
    &__badge {
      position: absolute;
      top: 9px;
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 700;
      line-height: 14px;
      letter-spacing: 0.02em;
      border-radius: 999px;
    }

    &__badge {
      left: 9px;
      color: var(--file-accent, var(--art-gray-700));
      background: color-mix(in srgb, var(--default-box-color) 88%, transparent);
      border: 1px solid color-mix(in srgb, currentcolor 16%, transparent);
      backdrop-filter: blur(7px);
    }

    &__duration {
      right: 9px;
      color: #fff;
      background: rgb(15 23 42 / 66%);
    }

    &__audio-control {
      position: absolute;
      top: 30px;
      left: 50%;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      font-size: 27px;
      color: #fff;
      background: linear-gradient(
        145deg,
        var(--theme-color),
        color-mix(in srgb, var(--theme-color) 64%, #7c3aed)
      );
      border-radius: 16px;
      box-shadow: 0 12px 28px color-mix(in srgb, var(--theme-color) 28%, transparent);
      transform: translateX(-50%);
      transition:
        box-shadow 160ms ease,
        transform 160ms ease;

      &:hover,
      &:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 3px color-mix(in srgb, var(--theme-color) 20%, transparent),
          0 14px 30px color-mix(in srgb, var(--theme-color) 34%, transparent);
        transform: translateX(-50%) translateY(-2px);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.56;
        filter: grayscale(0.55);
      }
    }

    &__wave {
      position: absolute;
      right: 20px;
      bottom: 32px;
      left: 20px;
      display: flex;
      gap: 3px;
      align-items: center;
      height: 24px;

      i {
        flex: 1;
        min-height: 3px;
        background: color-mix(in srgb, var(--theme-color) 58%, var(--art-gray-400));
        border-radius: 99px;
        opacity: 0.76;
      }

      &.is-playing i {
        transform-origin: center;
        animation: resource-audio-wave 720ms ease-in-out infinite alternate;

        &:nth-child(3n + 2) {
          animation-delay: -240ms;
        }

        &:nth-child(3n) {
          animation-delay: -480ms;
        }
      }
    }

    &__document {
      position: absolute;
      inset: 28px 12px 30px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: var(--art-gray-600);
    }

    &__sheet {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 66px;
      overflow: hidden;
      font-size: 31px;
      color: var(--file-accent);
      background: var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--file-accent) 17%, var(--default-border));
      border-radius: 8px 14px 8px 8px;
      box-shadow: 0 10px 24px color-mix(in srgb, var(--file-accent) 12%, transparent);

      &::after {
        position: absolute;
        right: -1px;
        bottom: 0;
        left: -1px;
        height: 5px;
        content: '';
        background: var(--file-accent);
      }
    }
  }

  .is-video {
    --file-accent: var(--el-color-primary);
  }

  .is-audio {
    --file-accent: var(--theme-color);
  }

  .tone-pdf {
    --file-accent: var(--el-color-danger);
  }

  .tone-word {
    --file-accent: var(--el-color-primary);
  }

  .tone-sheet {
    --file-accent: var(--el-color-success);
  }

  .tone-slides {
    --file-accent: var(--el-color-warning);
  }

  .tone-text,
  .tone-archive,
  .tone-media {
    --file-accent: var(--art-gray-600);
  }

  @keyframes resource-audio-wave {
    from {
      transform: scaleY(0.45);
    }

    to {
      transform: scaleY(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .resource-media-cover__wave.is-playing i {
      animation: none;
    }
  }
</style>
