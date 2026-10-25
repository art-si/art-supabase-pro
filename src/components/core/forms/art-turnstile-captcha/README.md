# ArtTurnstileCaptcha

共享 Cloudflare Turnstile 验证码。登录、注册等入口复用此组件，不在业务页创建 SDK 脚本或维护小部件生命周期。

## 属性与事件

- `sitekey`：网站公钥，必填。空值不创建小部件。
- `theme`：`light`、`dark` 或 `auto`，默认 `auto`。
- `size`：`normal`、`compact` 或 `flexible`，默认 `normal`。
- `appearance`：`always`、`execute` 或 `interaction-only`，默认 `always`。
- `execution`：`render` 或 `execute`，默认 `render`。
- `verify(token)`、`expired`、`error`、`timeout`：由调用方维护表单令牌和提交反馈。

## 实例方法

- `execute(): Promise<string>`：准备小部件并请求校验，成功返回令牌。调用方必须处理失败。
- `reset(): void`：重置当前小部件，取消等待中的校验。
- `remove(): void`：移除当前小部件并取消等待中的校验。

## 加载与恢复

脚本通过 VueUse `useScriptTag` 按需加载。多个实例共享同一脚本元素，已加载的全局 SDK 保留供其他入口复用；卸载一个组件只移除它自己的小部件。

可见模式的首次脚本加载使用共享 `ArtAsyncState` 骨架。`interaction-only` 模式保留原有隐藏布局。加载失败时两种模式都会显示共享错误状态和“重新加载”按钮，并发出 `error`，不向页面抛出未处理异常。显式重试会清除失败的脚本加载缓存。

配置更新、移除或卸载会使旧渲染失效；旧小部件的回调不能提交令牌。重置、移除和卸载会以“验证码校验已取消，请重试”结束等待中的 `execute()`，调用方应保留已填写的表单内容。

浏览器验证见 `tests/e2e/auth-sdk-lifecycle.spec.ts`，覆盖共享脚本、失败重试、配置更新、卸载及等待中的校验取消。
