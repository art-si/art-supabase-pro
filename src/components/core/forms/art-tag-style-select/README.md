# ArtTagStyleSelect

标签样式选择器。下拉项统一显示样式值与真实 `ElTag` 预览，供字典、主数据和业务配置表单复用。

```vue
<ArtTagStyleSelect v-model="tagStyle" :options="tagStyleOptions" clearable />
```

未传 `options` 时使用 `primary / success / info / warning / danger` 默认集合及中文标签。
