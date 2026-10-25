<template>
  <div
    ref="editorShellRef"
    class="art-tiptap-editor"
    :class="{
      'is-disabled': disabled,
      'is-fullscreen': isFullscreen,
      'has-open-popover': hasOpenPopover
    }"
    :style="{ '--art-tiptap-height': height }"
  >
    <ElScrollbar class="art-tiptap-editor__toolbar-scrollbar">
      <div class="art-tiptap-editor__toolbar" role="toolbar" aria-label="富文本编辑工具栏">
        <div v-if="isFeatureVisible('history')" class="art-tiptap-editor__tool-group">
          <ToolbarButton
            label="撤销（Ctrl+Z）"
            icon="ri:arrow-go-back-line"
            :disabled="isActionDisabled || !canUndo"
            @click="runCommand(() => editor?.chain().focus().undo().run())"
          />
          <ToolbarButton
            label="重做（Ctrl+Shift+Z）"
            icon="ri:arrow-go-forward-line"
            :disabled="isActionDisabled || !canRedo"
            @click="runCommand(() => editor?.chain().focus().redo().run())"
          />
        </div>

        <div v-if="isFeatureVisible('heading')" class="art-tiptap-editor__tool-group">
          <ElDropdown
            trigger="click"
            placement="bottom-start"
            :disabled="isActionDisabled"
            popper-class="art-tiptap-editor-popper"
            @command="setBlockType"
          >
            <ToolbarButton
              label="段落样式"
              icon="ri:heading"
              :text="currentBlockLabel"
              dropdown
              :tooltip="false"
              :disabled="isActionDisabled"
            />
            <template #dropdown>
              <ElDropdownMenu class="art-tiptap-editor-menu">
                <ElDropdownItem
                  v-for="item in blockTypes"
                  :key="item.value"
                  :command="item.value"
                  :class="{ 'is-selected': currentBlockType === item.value }"
                >
                  <span :class="`art-tiptap-editor-menu__block--${item.value}`">{{
                    item.label
                  }}</span>
                  <ArtSvgIcon
                    v-if="currentBlockType === item.value"
                    icon="ri:check-line"
                    aria-hidden="true"
                  />
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>

        <div class="art-tiptap-editor__tool-group">
          <ToolbarButton
            v-if="isFeatureVisible('bold')"
            label="加粗（Ctrl+B）"
            icon="ri:bold"
            toggle
            :active="isActive('bold')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleBold().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('italic')"
            label="斜体（Ctrl+I）"
            icon="ri:italic"
            toggle
            :active="isActive('italic')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleItalic().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('underline')"
            label="下划线（Ctrl+U）"
            icon="ri:underline"
            toggle
            :active="isActive('underline')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleUnderline().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('strike')"
            label="删除线"
            icon="ri:strikethrough"
            toggle
            :active="isActive('strike')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleStrike().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('code')"
            label="行内代码"
            icon="ri:code-line"
            toggle
            :active="isActive('code')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleCode().run())"
          />
        </div>

        <div
          v-if="isFeatureVisible('fontSize') || isFeatureVisible('lineHeight')"
          class="art-tiptap-editor__tool-group"
        >
          <ElDropdown
            v-if="isFeatureVisible('fontSize')"
            trigger="click"
            placement="bottom-start"
            :disabled="isActionDisabled"
            popper-class="art-tiptap-editor-popper"
            @command="setFontSize"
          >
            <ToolbarButton
              label="字号"
              icon="ri:font-size"
              :text="currentFontSizeLabel"
              dropdown
              :tooltip="false"
              :disabled="isActionDisabled"
            />
            <template #dropdown>
              <ElDropdownMenu class="art-tiptap-editor-menu">
                <ElDropdownItem
                  v-for="item in fontSizes"
                  :key="item.value || 'default'"
                  :command="item.value"
                  :class="{ 'is-selected': currentFontSize === item.value }"
                >
                  <span>{{ item.label }}</span>
                  <ArtSvgIcon
                    v-if="currentFontSize === item.value"
                    icon="ri:check-line"
                    aria-hidden="true"
                  />
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
          <ElDropdown
            v-if="isFeatureVisible('lineHeight')"
            trigger="click"
            placement="bottom-start"
            :disabled="isActionDisabled"
            popper-class="art-tiptap-editor-popper"
            @command="setLineHeight"
          >
            <ToolbarButton
              label="行高"
              icon="ri:line-height"
              :text="currentLineHeightLabel"
              dropdown
              :tooltip="false"
              :disabled="isActionDisabled"
            />
            <template #dropdown>
              <ElDropdownMenu class="art-tiptap-editor-menu">
                <ElDropdownItem
                  v-for="item in lineHeights"
                  :key="item.value || 'default'"
                  :command="item.value"
                  :class="{ 'is-selected': currentLineHeight === item.value }"
                >
                  <span>{{ item.label }}</span>
                  <ArtSvgIcon
                    v-if="currentLineHeight === item.value"
                    icon="ri:check-line"
                    aria-hidden="true"
                  />
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>

        <div
          v-if="isFeatureVisible('textColor') || isFeatureVisible('backgroundColor')"
          class="art-tiptap-editor__tool-group"
        >
          <ElPopover
            v-if="isFeatureVisible('textColor')"
            v-model:visible="textColorPopoverVisible"
            placement="bottom"
            :width="286"
            trigger="click"
            :show-arrow="false"
            popper-class="art-tiptap-editor-popper"
          >
            <template #reference>
              <span class="art-tiptap-editor__menu-trigger">
                <ToolbarButton
                  label="文字颜色"
                  icon="ri:font-color"
                  dropdown
                  :tooltip="false"
                  :disabled="isActionDisabled"
                />
              </span>
            </template>
            <ColorPalette
              label="文字颜色"
              :colors="textColors"
              :model-value="currentTextColor"
              @select="selectTextColor"
            />
          </ElPopover>
          <ElPopover
            v-if="isFeatureVisible('backgroundColor')"
            v-model:visible="backgroundColorPopoverVisible"
            placement="bottom"
            :width="286"
            trigger="click"
            :show-arrow="false"
            popper-class="art-tiptap-editor-popper"
          >
            <template #reference>
              <span class="art-tiptap-editor__menu-trigger">
                <ToolbarButton
                  label="高亮颜色"
                  icon="ri:mark-pen-line"
                  dropdown
                  :tooltip="false"
                  :disabled="isActionDisabled"
                />
              </span>
            </template>
            <ColorPalette
              label="高亮颜色"
              :colors="highlightColors"
              :model-value="currentBackgroundColor"
              fallback-color="#fff2a8"
              @select="selectBackgroundColor"
            />
          </ElPopover>
        </div>

        <div class="art-tiptap-editor__tool-group">
          <ToolbarButton
            v-if="isFeatureVisible('blockquote')"
            label="引用"
            icon="ri:double-quotes-l"
            toggle
            :active="isActive('blockquote')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleBlockquote().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('bulletList')"
            label="无序列表"
            icon="ri:list-unordered"
            toggle
            :active="isActive('bulletList')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleBulletList().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('orderedList')"
            label="有序列表"
            icon="ri:list-ordered-2"
            toggle
            :active="isActive('orderedList')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleOrderedList().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('taskList')"
            label="任务列表"
            icon="ri:list-check-3"
            toggle
            :active="isActive('taskList')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleTaskList().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('codeBlock')"
            label="代码块"
            icon="ri:code-box-line"
            toggle
            :active="isActive('codeBlock')"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().toggleCodeBlock().run())"
          />
        </div>

        <div v-if="isFeatureVisible('textAlign')" class="art-tiptap-editor__tool-group">
          <ElDropdown
            trigger="click"
            placement="bottom-start"
            :disabled="isActionDisabled"
            popper-class="art-tiptap-editor-popper"
            @command="setTextAlignment"
          >
            <ToolbarButton
              :label="currentAlignment.label"
              :icon="currentAlignment.icon"
              dropdown
              :tooltip="false"
              :disabled="isActionDisabled"
            />
            <template #dropdown>
              <ElDropdownMenu class="art-tiptap-editor-menu">
                <ElDropdownItem
                  v-for="item in alignments"
                  :key="item.value"
                  :command="item.value"
                  :class="{ 'is-selected': currentAlignment.value === item.value }"
                >
                  <span class="art-tiptap-editor-menu__option">
                    <ArtSvgIcon :icon="item.icon" aria-hidden="true" />
                    {{ item.label }}
                  </span>
                  <ArtSvgIcon
                    v-if="currentAlignment.value === item.value"
                    icon="ri:check-line"
                    aria-hidden="true"
                  />
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>

        <div class="art-tiptap-editor__tool-group">
          <ElPopover
            v-if="isFeatureVisible('link')"
            v-model:visible="linkPopoverVisible"
            placement="bottom"
            :width="320"
            :trigger="[]"
            :show-arrow="false"
            popper-class="art-tiptap-editor-popper"
          >
            <template #reference>
              <span class="art-tiptap-editor__popover-trigger">
                <ToolbarButton
                  label="插入或编辑链接"
                  icon="ri:link"
                  toggle
                  :active="isActive('link')"
                  :tooltip="false"
                  :disabled="isActionDisabled"
                  @click="openLinkPopover"
                />
              </span>
            </template>
            <div class="art-tiptap-editor__panel-form">
              <div class="art-tiptap-editor__panel-heading">
                <span class="art-tiptap-editor__panel-icon" aria-hidden="true">
                  <ArtSvgIcon icon="ri:link" />
                </span>
                <span>
                  <strong>{{ isActive('link') ? '编辑链接' : '插入链接' }}</strong>
                  <small>支持网页、邮箱和电话号码</small>
                </span>
              </div>
              <input
                v-model="linkUrl"
                type="text"
                placeholder="https://example.com"
                aria-label="链接地址"
                @keyup.enter="applyLink"
              />
              <div class="art-tiptap-editor__popover-actions">
                <button
                  v-if="isActive('link')"
                  class="is-secondary"
                  type="button"
                  @click="removeLink"
                >
                  移除链接
                </button>
                <button type="button" @click="applyLink">应用链接</button>
              </div>
            </div>
          </ElPopover>

          <MediaPopover
            v-if="isFeatureVisible('image')"
            :resource-tenant-id="resourceTenantId"
            kind="image"
            label="插入图片"
            icon="ri:image-add-line"
            :accept="mediaConfig.image.accept"
            :max-size="mediaConfig.image.maxSize"
            :disabled="isActionDisabled"
            url-placeholder="https://example.com/image.png"
            @upload="insertUploadedImage"
            @url="insertImageUrl"
            @visibility-change="setMediaPopoverVisibility('image', $event)"
          />
          <MediaPopover
            v-if="isFeatureVisible('video')"
            :resource-tenant-id="resourceTenantId"
            kind="video"
            label="插入视频"
            icon="ri:video-add-line"
            :accept="mediaConfig.video.accept"
            :max-size="mediaConfig.video.maxSize"
            :disabled="isActionDisabled"
            url-placeholder="https://example.com/video.mp4"
            @upload="insertUploadedVideo"
            @url="insertVideoUrl"
            @visibility-change="setMediaPopoverVisibility('video', $event)"
          />
          <MediaPopover
            v-if="isFeatureVisible('audio')"
            :resource-tenant-id="resourceTenantId"
            kind="audio"
            label="插入音频"
            icon="ri:volume-up-line"
            :accept="mediaConfig.audio.accept"
            :max-size="mediaConfig.audio.maxSize"
            :disabled="isActionDisabled"
            url-placeholder="https://example.com/audio.mp3"
            @upload="insertUploadedAudio"
            @url="insertAudioUrl"
            @visibility-change="setMediaPopoverVisibility('audio', $event)"
          />
          <MediaPopover
            v-if="isFeatureVisible('file')"
            :resource-tenant-id="resourceTenantId"
            kind="file"
            label="插入附件"
            icon="ri:attachment-2"
            :accept="mediaConfig.file.accept"
            :max-size="mediaConfig.file.maxSize"
            :disabled="isActionDisabled"
            url-placeholder="https://example.com/document.pdf"
            @upload="insertUploadedFile"
            @url="insertFileUrl"
            @visibility-change="setMediaPopoverVisibility('file', $event)"
          />

          <ElPopover
            v-if="isFeatureVisible('table')"
            v-model:visible="tablePopoverVisible"
            placement="bottom"
            :width="244"
            :trigger="[]"
            :show-arrow="false"
            popper-class="art-tiptap-editor-popper"
          >
            <template #reference>
              <span class="art-tiptap-editor__popover-trigger">
                <ToolbarButton
                  label="插入表格"
                  icon="ri:table-2"
                  :tooltip="false"
                  :disabled="isActionDisabled"
                  @click="tablePopoverVisible = true"
                />
              </span>
            </template>
            <TablePicker @insert="insertTable" />
          </ElPopover>
          <ToolbarButton
            v-if="isFeatureVisible('horizontalRule')"
            label="插入分隔线"
            icon="ri:separator"
            :disabled="isActionDisabled"
            @click="runCommand(() => editor?.chain().focus().setHorizontalRule().run())"
          />
          <ToolbarButton
            v-if="isFeatureVisible('clearFormat')"
            label="清除格式"
            icon="ri:format-clear"
            :disabled="isActionDisabled"
            @click="clearFormat"
          />
          <ToolbarButton
            v-if="isFeatureVisible('fullscreen')"
            :label="isFullscreen ? '退出全屏' : '全屏编辑'"
            :icon="isFullscreen ? 'ri:fullscreen-exit-line' : 'ri:fullscreen-line'"
            toggle
            :active="isFullscreen"
            :disabled="disabled"
            @click="toggleFullscreen"
          />
        </div>
      </div>
    </ElScrollbar>

    <BubbleMenu
      v-if="editor && isFeatureVisible('table')"
      :editor="editor"
      :should-show="shouldShowTableMenu"
      :options="{ placement: 'top' }"
      class="art-tiptap-editor__table-toolbar"
      :class="{ 'is-suppressed': hasOpenPopover }"
      role="toolbar"
      aria-label="表格编辑工具栏"
    >
      <ElScrollbar class="art-tiptap-editor__table-toolbar-scrollbar">
        <div class="art-tiptap-editor__table-toolbar-content">
          <span class="art-tiptap-editor__table-toolbar-title">
            <ArtSvgIcon icon="ri:table-2" aria-hidden="true" />
            表格
          </span>
          <div class="art-tiptap-editor__tool-group">
            <ToolbarButton
              label="在上方插入行"
              icon="ri:insert-row-top"
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().addRowBefore().run())"
            />
            <ToolbarButton
              label="在下方插入行"
              icon="ri:insert-row-bottom"
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().addRowAfter().run())"
            />
            <ToolbarButton
              label="删除当前行"
              icon="ri:delete-row"
              danger
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().deleteRow().run())"
            />
          </div>
          <div class="art-tiptap-editor__tool-group">
            <ToolbarButton
              label="在左侧插入列"
              icon="ri:insert-column-left"
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().addColumnBefore().run())"
            />
            <ToolbarButton
              label="在右侧插入列"
              icon="ri:insert-column-right"
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().addColumnAfter().run())"
            />
            <ToolbarButton
              label="删除当前列"
              icon="ri:delete-column"
              danger
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().deleteColumn().run())"
            />
          </div>
          <div class="art-tiptap-editor__tool-group art-tiptap-editor__tool-group--labeled">
            <ToolbarButton
              label="合并单元格"
              icon="ri:merge-cells-horizontal"
              show-label
              :disabled="isActionDisabled || !canMergeCells"
              @click="runCommand(() => editor?.chain().focus().mergeCells().run())"
            />
            <ToolbarButton
              label="拆分单元格"
              icon="ri:split-cells-horizontal"
              show-label
              :disabled="isActionDisabled || !canSplitCell"
              @click="runCommand(() => editor?.chain().focus().splitCell().run())"
            />
            <ToolbarButton
              label="切换表头行"
              icon="ri:layout-row-line"
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().toggleHeaderRow().run())"
            />
            <ToolbarButton
              label="删除整个表格"
              icon="ri:delete-bin-6-line"
              danger
              :disabled="isActionDisabled"
              @click="runCommand(() => editor?.chain().focus().deleteTable().run())"
            />
          </div>
        </div>
      </ElScrollbar>
    </BubbleMenu>

    <ElScrollbar class="art-tiptap-editor__scrollbar" :height="editorViewportHeight">
      <EditorContent class="art-tiptap-editor__content" :editor="editor" />
    </ElScrollbar>
    <footer v-if="showCharacterCount" class="art-tiptap-editor__statusbar" aria-live="polite">
      <span :class="{ 'is-limit-reached': isCharacterLimitReached }">
        {{ characterCount }}<template v-if="maxLength"> / {{ maxLength }}</template> 字符
      </span>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { clamp } from 'lodash-es'
  import { computed, ref, watch } from 'vue'
  import { useFullscreen } from '@vueuse/core'
  import { uploadAttachment } from '@/api/attachments'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import type { Editor, JSONContent } from '@tiptap/core'
  import { EditorContent, useEditor } from '@tiptap/vue-3'
  import { BubbleMenu } from '@tiptap/vue-3/menus'
  import StarterKit from '@tiptap/starter-kit'
  import FileHandler from '@tiptap/extension-file-handler'
  import { TableKit } from '@tiptap/extension-table'
  import Image from '@tiptap/extension-image'
  import Placeholder from '@tiptap/extension-placeholder'
  import TaskList from '@tiptap/extension-task-list'
  import TaskItem from '@tiptap/extension-task-item'
  import TextAlign from '@tiptap/extension-text-align'
  import { TextStyleKit } from '@tiptap/extension-text-style'
  import CharacterCount from '@tiptap/extension-character-count'
  import ColorPalette from './art-tiptap-color-palette.vue'
  import MediaPopover from './art-tiptap-media-popover.vue'
  import TablePicker from './art-tiptap-table-picker.vue'
  import ToolbarButton from './art-tiptap-toolbar-button.vue'
  import type { ArtTiptapEditorFeature, ArtTiptapEditorProps, ArtTiptapMediaKind } from './types'
  import { ArtAudio, ArtFileAttachment, ArtVideo } from './media-extensions'
  import { isAcceptedFileType } from '@/utils/file/accept'
  import { normalizeEditorUrl } from './utils'

  defineOptions({ name: 'ArtTiptapEditor' })

  const props = withDefaults(defineProps<ArtTiptapEditorProps>(), {
    resourceTenantId: '',
    height: '500px',
    placeholder: '请输入内容…',
    disabled: false,
    showCharacterCount: true,
    maxLength: undefined,
    excludeKeys: () => []
  })

  const modelValue = defineModel<string>({ default: '' })
  const editorShellRef = ref<HTMLElement>()
  const viewVersion = ref(0)
  const linkPopoverVisible = ref(false)
  const textColorPopoverVisible = ref(false)
  const backgroundColorPopoverVisible = ref(false)
  const linkUrl = ref('')
  const tablePopoverVisible = ref(false)
  const activeMediaPopover = ref<ArtTiptapMediaKind | null>(null)

  const headingLevels = [1, 2, 3, 4, 5, 6] as const
  const blockTypes = [
    { label: '正文', value: 'paragraph' },
    ...headingLevels.map((level) => ({ label: `标题 ${level}`, value: `heading-${level}` }))
  ] as const
  const fontSizes = [
    { label: '默认字号', value: '' },
    { label: '12px', value: '12px' },
    { label: '14px', value: '14px' },
    { label: '16px', value: '16px' },
    { label: '18px', value: '18px' },
    { label: '20px', value: '20px' },
    { label: '24px', value: '24px' },
    { label: '32px', value: '32px' }
  ] as const
  const lineHeights = [
    { label: '默认行高', value: '' },
    { label: '1', value: '1' },
    { label: '1.25', value: '1.25' },
    { label: '1.5', value: '1.5' },
    { label: '1.75', value: '1.75' },
    { label: '2', value: '2' }
  ] as const
  const textColors = [
    '#222325',
    '#53565a',
    '#a14220',
    '#c46a1a',
    '#2f6f4e',
    '#2f6f99',
    '#74469a',
    '#b23c65',
    '#c43f3f'
  ] as const
  const highlightColors = [
    '#f8f8f7',
    '#f4eeee',
    '#fbeddd',
    '#fef9c3',
    '#dcfce7',
    '#e0f2fe',
    '#f3e8ff',
    '#fceff6',
    '#ffe4e6'
  ] as const
  const alignments = [
    { label: '左对齐', value: 'left', icon: 'ri:align-left' },
    { label: '居中对齐', value: 'center', icon: 'ri:align-center' },
    { label: '右对齐', value: 'right', icon: 'ri:align-right' },
    { label: '两端对齐', value: 'justify', icon: 'ri:align-justify' }
  ] as const
  const mediaConfig = {
    image: {
      accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml',
      maxSize: 10 * 1024 * 1024
    },
    video: {
      accept: 'video/mp4,video/webm,video/ogg',
      maxSize: 100 * 1024 * 1024
    },
    audio: {
      accept: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4',
      maxSize: 30 * 1024 * 1024
    },
    file: {
      accept:
        '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip,application/x-rar-compressed,application/x-7z-compressed',
      maxSize: 50 * 1024 * 1024
    }
  } as const

  const refreshToolbar = () => {
    viewVersion.value += 1
  }

  const editor = useEditor({
    content: modelValue.value,
    editable: !props.disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [...headingLevels] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }
        }
      }),
      Placeholder.configure({ placeholder: props.placeholder }),
      CharacterCount.configure({ limit: props.maxLength }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'left' }),
      TextStyleKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: false }),
      ArtVideo,
      ArtAudio,
      ArtFileAttachment,
      FileHandler.configure({
        onPaste: (currentEditor, files) => {
          void uploadDroppedFiles(currentEditor, files)
        },
        onDrop: (currentEditor, files, position) => {
          void uploadDroppedFiles(currentEditor, files, position)
        }
      }),
      TableKit.configure({
        table: {
          resizable: true,
          lastColumnResizable: false,
          allowTableNodeSelection: true
        }
      })
    ],
    editorProps: {
      attributes: {
        class: 'art-tiptap-editor__prosemirror',
        'aria-label': '富文本内容编辑区'
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      modelValue.value = currentEditor.isEmpty ? '' : currentEditor.getHTML()
      refreshToolbar()
    },
    onSelectionUpdate: refreshToolbar,
    onTransaction: refreshToolbar
  })

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(editorShellRef)

  const touchViewVersion = () => {
    void viewVersion.value
  }

  const isFeatureVisible = (feature: ArtTiptapEditorFeature) => !props.excludeKeys.includes(feature)
  const isActionDisabled = computed(() => props.disabled || !editor.value)
  const hasOpenPopover = computed(
    () =>
      linkPopoverVisible.value ||
      textColorPopoverVisible.value ||
      backgroundColorPopoverVisible.value ||
      tablePopoverVisible.value ||
      activeMediaPopover.value !== null
  )
  const editorViewportHeight = computed(() =>
    isFullscreen.value ? 'calc(100vh - 164px)' : props.height
  )
  const characterCount = computed(() => {
    touchViewVersion()
    return editor.value?.storage.characterCount.characters() ?? 0
  })
  const isCharacterLimitReached = computed(() =>
    Boolean(props.maxLength && characterCount.value >= props.maxLength)
  )

  const isActive = (nameOrAttributes: string | Record<string, unknown>) => {
    touchViewVersion()
    if (!editor.value) return false
    return typeof nameOrAttributes === 'string'
      ? editor.value.isActive(nameOrAttributes)
      : editor.value.isActive(nameOrAttributes)
  }

  const canUndo = computed(() => {
    touchViewVersion()
    return editor.value?.can().undo() ?? false
  })
  const canRedo = computed(() => {
    touchViewVersion()
    return editor.value?.can().redo() ?? false
  })
  const canMergeCells = computed(() => {
    touchViewVersion()
    return editor.value?.can().mergeCells() ?? false
  })
  const canSplitCell = computed(() => {
    touchViewVersion()
    return editor.value?.can().splitCell() ?? false
  })
  const currentBlockType = computed(() => {
    touchViewVersion()
    const currentEditor = editor.value
    if (!currentEditor) return 'paragraph'
    const level = headingLevels.find((item) => currentEditor.isActive('heading', { level: item }))
    return level ? `heading-${level}` : 'paragraph'
  })
  const currentBlockLabel = computed(
    () => blockTypes.find((item) => item.value === currentBlockType.value)?.label ?? '正文'
  )
  const currentFontSize = computed(() => {
    touchViewVersion()
    return String(editor.value?.getAttributes('textStyle').fontSize ?? '')
  })
  const currentFontSizeLabel = computed(
    () => fontSizes.find((item) => item.value === currentFontSize.value)?.label ?? '字号'
  )
  const currentLineHeight = computed(() => {
    touchViewVersion()
    return String(editor.value?.getAttributes('textStyle').lineHeight ?? '')
  })
  const currentLineHeightLabel = computed(
    () => lineHeights.find((item) => item.value === currentLineHeight.value)?.label ?? '行高'
  )
  const currentTextColor = computed(() => {
    touchViewVersion()
    return String(editor.value?.getAttributes('textStyle').color ?? '#20242c')
  })
  const currentBackgroundColor = computed(() => {
    touchViewVersion()
    return String(editor.value?.getAttributes('textStyle').backgroundColor ?? '')
  })
  const currentAlignment = computed(() => {
    touchViewVersion()
    const currentEditor = editor.value
    return (
      alignments.find(
        (item) => item.value !== 'left' && currentEditor?.isActive({ textAlign: item.value })
      ) ?? alignments[0]
    )
  })

  const runCommand = (command: () => boolean | undefined) => {
    if (isActionDisabled.value) return
    command()
    refreshToolbar()
  }

  const setBlockType = (value: string) => {
    if (value === 'paragraph') {
      runCommand(() => editor.value?.chain().focus().setParagraph().run())
      return
    }
    const level = Number(value.replace('heading-', '')) as (typeof headingLevels)[number]
    runCommand(() => editor.value?.chain().focus().setHeading({ level }).run())
  }

  const setFontSize = (value: string) => {
    runCommand(() => {
      const chain = editor.value?.chain().focus()
      return value ? chain?.setFontSize(value).run() : chain?.unsetFontSize().run()
    })
  }

  const setLineHeight = (value: string) => {
    runCommand(() => {
      const chain = editor.value?.chain().focus()
      return value ? chain?.setLineHeight(value).run() : chain?.unsetLineHeight().run()
    })
  }

  const setTextAlignment = (value: string) => {
    runCommand(() => {
      const chain = editor.value?.chain().focus()
      return value === 'left' ? chain?.unsetTextAlign().run() : chain?.setTextAlign(value).run()
    })
  }

  const setTextColor = (value: string) => {
    runCommand(() => {
      const chain = editor.value?.chain().focus()
      return value ? chain?.setColor(value).run() : chain?.unsetColor().run()
    })
  }

  const setBackgroundColor = (value: string) => {
    runCommand(() => {
      const chain = editor.value?.chain().focus()
      return value ? chain?.setBackgroundColor(value).run() : chain?.unsetBackgroundColor().run()
    })
  }

  const selectTextColor = (value: string) => {
    setTextColor(value)
    textColorPopoverVisible.value = false
  }

  const selectBackgroundColor = (value: string) => {
    setBackgroundColor(value)
    backgroundColorPopoverVisible.value = false
  }

  const shouldShowTableMenu = () => !props.disabled && (editor.value?.isActive('table') ?? false)

  const setMediaPopoverVisibility = (kind: ArtTiptapMediaKind, visible: boolean) => {
    if (visible) {
      activeMediaPopover.value = kind
      return
    }
    if (activeMediaPopover.value === kind) activeMediaPopover.value = null
  }

  const clearFormat = () => {
    runCommand(() => editor.value?.chain().focus().unsetAllMarks().clearNodes().run())
  }

  const insertTable = (options: { rows: number; columns: number; withHeaderRow: boolean }) => {
    runCommand(() =>
      editor.value
        ?.chain()
        .focus()
        .insertTable({
          rows: options.rows,
          cols: options.columns,
          withHeaderRow: options.withHeaderRow
        })
        .run()
    )
    tablePopoverVisible.value = false
  }

  const openLinkPopover = () => {
    linkUrl.value = String(editor.value?.getAttributes('link').href ?? '')
    linkPopoverVisible.value = true
  }

  const applyLink = () => {
    const href = normalizeEditorUrl(linkUrl.value, ['http:', 'https:', 'mailto:', 'tel:'])
    if (!href) {
      ElMessage.warning('请输入有效的链接地址')
      return
    }
    runCommand(() => editor.value?.chain().focus().extendMarkRange('link').setLink({ href }).run())
    linkPopoverVisible.value = false
  }

  const removeLink = () => {
    runCommand(() => editor.value?.chain().focus().extendMarkRange('link').unsetLink().run())
    linkPopoverVisible.value = false
  }

  const normalizeMediaUrl = (value: string, label: string) => {
    const url = normalizeEditorUrl(value, ['http:', 'https:'])
    if (!url) ElMessage.warning(`请输入有效的${label}地址`)
    return url
  }

  const buildMediaNode = (
    kind: keyof typeof mediaConfig,
    resource: { url: string; name?: string; size?: string; mimeType?: string }
  ): JSONContent => {
    if (kind === 'image') {
      return {
        type: 'image',
        attrs: { src: resource.url, alt: resource.name, title: resource.name }
      }
    }
    if (kind === 'video') {
      return { type: 'artVideo', attrs: { src: resource.url, title: resource.name } }
    }
    if (kind === 'audio') {
      return { type: 'artAudio', attrs: { src: resource.url, title: resource.name } }
    }
    return {
      type: 'artFileAttachment',
      attrs: {
        href: resource.url,
        name: resource.name || '附件',
        size: resource.size,
        mimeType: resource.mimeType
      }
    }
  }

  const insertMediaNode = (
    kind: keyof typeof mediaConfig,
    resource: { url: string; name?: string; size?: string; mimeType?: string },
    targetEditor: Editor | undefined = editor.value,
    position?: number
  ) => {
    if (!targetEditor) return false
    const nodes: JSONContent[] = [buildMediaNode(kind, resource), { type: 'paragraph' }]
    const chain = targetEditor.chain().focus()
    if (position === undefined) return chain.insertContent(nodes).run()
    const safePosition = clamp(position, 0, targetEditor.state.doc.content.size)
    return chain.insertContentAt(safePosition, nodes).run()
  }

  const getUploadedResource = (
    resource: Api.DataCenter.Resources.ResourceListItem,
    fallbackName?: string
  ) => {
    const url = normalizeMediaUrl(resource.url || '', '文件')
    if (!url) return null
    return {
      url,
      name: resource.originName || fallbackName || '附件',
      size: resource.sizeInfo,
      mimeType: resource.mimeType
    }
  }

  const insertUploadedMedia = (
    kind: keyof typeof mediaConfig,
    resource: Api.DataCenter.Resources.ResourceListItem,
    fileName: string
  ) => {
    const normalized = getUploadedResource(resource, fileName)
    if (!normalized) return
    runCommand(() => insertMediaNode(kind, normalized))
  }

  const insertUploadedImage = (
    resource: Api.DataCenter.Resources.ResourceListItem,
    fileName: string
  ) => insertUploadedMedia('image', resource, fileName)
  const insertUploadedVideo = (
    resource: Api.DataCenter.Resources.ResourceListItem,
    fileName: string
  ) => insertUploadedMedia('video', resource, fileName)
  const insertUploadedAudio = (
    resource: Api.DataCenter.Resources.ResourceListItem,
    fileName: string
  ) => insertUploadedMedia('audio', resource, fileName)
  const insertUploadedFile = (
    resource: Api.DataCenter.Resources.ResourceListItem,
    fileName: string
  ) => insertUploadedMedia('file', resource, fileName)

  const insertMediaUrl = (
    kind: keyof typeof mediaConfig,
    value: { url: string; name?: string },
    label: string
  ) => {
    const url = normalizeMediaUrl(value.url, label)
    if (!url) return
    runCommand(() => insertMediaNode(kind, { url, name: value.name }))
  }

  const insertImageUrl = (value: { url: string; name?: string }) =>
    insertMediaUrl('image', value, '图片')
  const insertVideoUrl = (value: { url: string; name?: string }) =>
    insertMediaUrl('video', value, '视频')
  const insertAudioUrl = (value: { url: string; name?: string }) =>
    insertMediaUrl('audio', value, '音频')
  const insertFileUrl = (value: { url: string; name?: string }) =>
    insertMediaUrl(
      'file',
      {
        ...value,
        name: value.name || decodeURIComponent(value.url.split('/').pop()?.split('?')[0] || '附件')
      },
      '附件'
    )

  const getMediaKind = (
    value: Pick<File, 'name' | 'type'> | { name?: string; type?: string }
  ): keyof typeof mediaConfig => {
    const mimeType = value.type?.toLowerCase() || ''
    const fileName = value.name?.toLowerCase() || ''
    if (mimeType.startsWith('image/') || /\.(gif|jpe?g|png|svg|webp)$/.test(fileName)) {
      return 'image'
    }
    if (mimeType.startsWith('video/') || /\.(mp4|ogg|webm)$/.test(fileName)) return 'video'
    if (mimeType.startsWith('audio/') || /\.(mp3|wav|m4a)$/.test(fileName)) return 'audio'
    return 'file'
  }

  const uploadDroppedFiles = async (
    targetEditor: Editor,
    files: File[],
    position?: number
  ): Promise<void> => {
    if (props.disabled || !files.length) return
    const validFiles = files.filter((file) => {
      const kind = getMediaKind(file)
      const config = mediaConfig[kind]
      return isAcceptedFileType(file, config.accept) && file.size <= config.maxSize
    })
    if (!validFiles.length) {
      ElMessage.warning('文件格式不受支持或超过大小限制')
      return
    }
    if (validFiles.length !== files.length) {
      ElMessage.warning(
        `已忽略 ${files.length - validFiles.length} 个格式不支持或超过大小限制的文件`
      )
    }

    try {
      const resources = await uploadAttachment(validFiles, {
        targetTenantId: props.resourceTenantId || undefined
      })
      let insertPosition = position
      resources.forEach((resource) => {
        const normalized = getUploadedResource(resource)
        if (!normalized) return
        const kind = getMediaKind({ name: normalized.name, type: normalized.mimeType })
        insertMediaNode(kind, normalized, targetEditor, insertPosition)
        insertPosition = undefined
      })
      ElMessage.success(`已插入 ${resources.length} 个文件`)
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '文件上传失败，请稍后重试'))
    }
  }

  watch(
    () => modelValue.value,
    (value) => {
      const currentEditor = editor.value
      if (!currentEditor) return
      const currentValue = currentEditor.isEmpty ? '' : currentEditor.getHTML()
      if (value === currentValue) return
      currentEditor.commands.setContent(value || '', { emitUpdate: false })
    }
  )

  watch(
    () => props.disabled,
    (disabled) => editor.value?.setEditable(!disabled)
  )

  defineExpose({
    getEditor: (): Editor | undefined => editor.value,
    setHtml: (html: string) => editor.value?.commands.setContent(html || ''),
    getHtml: () => (editor.value?.isEmpty ? '' : editor.value?.getHTML()),
    clear: () => editor.value?.commands.clearContent(),
    focus: () => editor.value?.commands.focus()
  })
</script>

<style lang="scss">
  @use './style';
</style>
