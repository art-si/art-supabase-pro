# ArtTiptapEditor

项目统一的 Tiptap 3 / Vue 3 富文本编辑器封装，直接使用 `@tiptap/vue-3` 的 `EditorContent`、`useEditor` 与 `BubbleMenu`，视觉采用轻量中性的现代编辑器风格。内容通过 `v-model` 读写标准 HTML，支持标题、文本样式、列表、安全链接、网络图片、业务图片上传、字符上限、表格和全屏编辑。

表格内拖选相邻单元格后，Tiptap `BubbleMenu` 会显示上下文工具栏，可直接执行合并；选中已合并单元格后可拆分。浮动工具栏同时支持增删行列、表头切换和整表删除。

```vue
<ArtTiptapEditor
  v-model="form.contentHtml"
  height="340px"
  placeholder="请输入正文…"
  :exclude-keys="['image']"
/>
```

## 公共接口

- Props：`height`、`placeholder`、`disabled`、`showCharacterCount`、`maxLength`、`imageUpload`、`excludeKeys`，类型见 `types.ts`。
- Expose：`getEditor()`、`setHtml(html)`、`getHtml()`、`clear()`、`focus()`。
- 空编辑器向外输出空字符串，便于表单必填校验；非空内容输出标准 HTML，并保留表格的 `rowspan` / `colspan`。
- 图片 URL 仅接受 `http` / `https`。需要上传时传入 `imageUpload.upload(file)` 适配器，组件负责格式、大小、忙碌态和失败反馈，业务层负责鉴权与持久化。
