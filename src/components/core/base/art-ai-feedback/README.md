# ArtAiFeedback

统一的 AI 运行反馈入口。组件通过 `runId` 读取并写入当前用户的 `ai_feedback`，提供快捷好评以及带问题类型、问题说明和正确结果的负面反馈。

```vue
<ArtAiFeedback run-id="..." context-label="AI 运单费用审核" />
```

- `runId` 必须来自 AI 接口响应，不能使用业务单据 ID 替代。
- 正面反馈可直接提交；负面反馈必须选择问题类型。
- 反馈不会修改 AI 结果或业务数据。
- `compact` 适合聊天消息等紧凑区域。
