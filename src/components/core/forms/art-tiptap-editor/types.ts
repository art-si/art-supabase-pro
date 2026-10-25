export type ArtTiptapEditorFeature =
  | 'history'
  | 'heading'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'fontSize'
  | 'lineHeight'
  | 'textColor'
  | 'backgroundColor'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'codeBlock'
  | 'textAlign'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'table'
  | 'horizontalRule'
  | 'clearFormat'
  | 'fullscreen'

export interface ArtTiptapEditorProps {
  /** Target tenant for uploaded media in an all-tenant business form. */
  resourceTenantId?: string
  /** 编辑区域高度，支持任意合法 CSS 长度。 */
  height?: string
  /** 空内容时显示的占位文案。 */
  placeholder?: string
  /** 是否禁用编辑与工具栏操作。 */
  disabled?: boolean
  /** 是否显示底部字符统计。 */
  showCharacterCount?: boolean
  /** 最大字符数；达到上限后 Tiptap 会拒绝继续输入。 */
  maxLength?: number
  /** 隐藏指定功能；未列出的功能默认显示。 */
  excludeKeys?: ArtTiptapEditorFeature[]
}

export type ArtTiptapMediaKind = 'image' | 'video' | 'audio' | 'file'
