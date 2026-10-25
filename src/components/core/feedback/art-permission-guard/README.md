# ArtPermissionGuard

页面级查看权限守卫。拥有权限时渲染默认插槽；缺少权限时不挂载业务页面内容，并展示统一的角色授权指引、权限刷新、返回与工作台入口。

授权分支必须保留一个可伸缩的真实 DOM 根节点，用于承接路由注入的 `art-page-view` class 与高度样式。不要把它改成裸 `slot` 或 Fragment，否则 `ArtTableQuery` 无法识别专注模式的页面边界。

```vue
<ArtPermissionGuard permission="SmisMaterialCategory:View" resource-name="物料类别">
  <div class="art-full-height">...</div>
</ArtPermissionGuard>
```

## Props

| Prop           | 类型      | 默认值       | 说明                                          |
| -------------- | --------- | ------------ | --------------------------------------------- |
| `permission`   | `string`  | `''`         | 页面查看权限标识。页面守卫场景必填。          |
| `forceDenied`  | `boolean` | `false`      | 强制展示权限受限状态，供路由级 403 页面复用。 |
| `resourceName` | `string`  | 当前路由标题 | 授权提示中的页面名称。                        |
| `showBack`     | `boolean` | `true`       | 是否显示“返回上一页”。                        |

页面根节点不要再使用 `v-auth` 隐藏整页。按钮和局部业务动作仍继续使用 `v-auth`、`hasAuth` 或组件 `permission` 属性。
