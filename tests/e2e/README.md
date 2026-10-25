# UI 视觉回归

视觉回归覆盖 Dashboard、在途监控、发票管理、Supabase AI 助手、AI 项目规划、运单录入、网站配置和 ArtTableQuery 示例页，并配置桌面、平板、移动端、暗色与阴影盒模型环境。

本地测试默认通过独立的 `41738` 端口运行 Vite `e2e` 模式；CI 或设置 `E2E_USE_DEV_SERVER=false` 时，通过 `41737` 端口预览 `VITE_OUT_DIR` 配置的生产构建（默认 `docs`）。设置 `E2E_BASE_URL` 后使用指定服务，不再自动启动本地服务。更新生产构建的视觉基准时，先构建，再显式选择预览模式：

```powershell
pnpm.cmd exec playwright install chromium
pnpm.cmd build
$env:E2E_USE_DEV_SERVER='false'
pnpm.cmd test:e2e:update
```

本地默认复用已安装的 Chrome；CI 环境使用 Playwright Chromium，因此流水线初始化阶段仍需执行 `pnpm.cmd test:e2e:install`。

日常验证：

```powershell
pnpm.cmd test:e2e
```

提交前的核心页面快速门禁只运行 1440 桌面与 390 移动端：

```powershell
pnpm.cmd test:e2e:core
```

完整 CI 门禁会依次执行静态检查、项目快照校验、生产构建和核心视觉回归：

```powershell
pnpm.cmd check:ci
```

需要真实登录的测试在准备阶段通过 Supabase 密码认证建立隔离会话，避免 Cloudflare Turnstile 阻断自动化。通过环境变量提供测试账号；远程地址或本机浏览器通道也可显式指定：

```powershell
$env:E2E_EMAIL='your-account@example.com'
$env:E2E_PASSWORD='your-password'
$env:E2E_BASE_URL='https://your-preview.example.com'
$env:E2E_BROWSER_CHANNEL='chrome'
pnpm.cmd test:e2e
```

如果本机访问 Supabase 项目域名时连接被重置，而通过代理可以访问，需同时为 Node 登录准备阶段和浏览器请求配置代理。`E2E_PROXY_URL` 会自动绕过本地预览地址：

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:PORT'
$env:NODE_USE_ENV_PROXY='1'
$env:E2E_PROXY_URL=$env:HTTPS_PROXY
pnpm.cmd test:e2e
```

失败时使用 `pnpm.cmd test:e2e:report` 查看截图差异与 Trace。认证状态只保存在被 Git 忽略的 `playwright/.auth/`。
