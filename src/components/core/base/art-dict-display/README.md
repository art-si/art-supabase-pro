# ArtDictDisplay

展示字典值的公共组件，用于表格、详情和 `ElSelect` 的 `#label` 插槽。

```vue
<ArtDictDisplay :value="row.stockType" dict-code="wmsCountStockType" display="text" />
```

- `dictCode` 指定字典类型，`value` 保留业务记录的原始值；传入 `item` 时直接展示该字典记录。
- 优先读取公共字典缓存。未找到既有值时，由公共 store 按字典编码和值精确加载，包括停用的历史项。
- 历史查询结果使用独立展示缓存，不进入 `useDictionaryOptions` 的可选项。业务页面不得自行补查询或将历史项混入新增选项。
- 相同历史值的并发查询合并，未找到的结果也缓存；清空公共字典缓存会一并清空展示缓存。清空前的异步响应不能回填新缓存。
- 空值显示 `emptyText`，未找到的值显示 `unknownText` 或原始值。查询失败给出可重试的中文反馈，不将技术错误作为标签。
- `display="text"` 用于普通字段和下拉回显；默认 `auto` 按字典配置展示标签或徽标。
