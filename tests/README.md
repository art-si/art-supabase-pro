# 测试目录与提交原则

这里保存可复现的测试源码，不是数据库备份或每次执行的结果。

| 目录                   | 用途                                       | 是否提交         |
| ---------------------- | ------------------------------------------ | ---------------- |
| `unit/`                | 工具函数、业务规则及源码边界的自动化断言   | 是               |
| `e2e/`                 | Playwright 浏览器测试                      | 是               |
| `e2e/fixtures/`        | 测试页面、组件挂载入口和合成数据           | 被测试引用时提交 |
| `e2e/__screenshots__/` | `toHaveScreenshot` 使用的人工确认基准图    | 是               |
| `integration/`         | SQL 权限、租户隔离、业务计算和事务行为回归 | 是               |
| `powershell/`          | Supabase 备份、认证和恢复工具的测试        | 是               |

主仓浏览器测试也会调用 `modules/*/tests/e2e/fixtures/`。检查测试夹具是否仍有用时，必须搜索主仓和全部子仓，不能只看文件所在仓库。某些夹具通过 HTTP 路径而不是 `import` 引用。

## 运行入口

- `pnpm test:unit`：运行主仓单元测试；业务子仓还有各自的测试入口。
- `pnpm test:e2e`：运行 Playwright 测试；可追加文件路径和 `--project` 进行聚焦验证。
- `pnpm exec playwright test --list`：只检查浏览器测试发现和配置，不执行登录或业务操作。
- `pnpm test:db`：只运行 `integration/database-security-policy.sql`，不是执行全部 SQL。
- PowerShell 测试使用 Pester；先阅读各文件的模拟范围及环境要求。

## SQL 执行边界

SQL 文件包含独立回归脚本和配套片段。没有 `ROLLBACK` 不代表文件无用：例如 `fms-receivable-fixtures.sql`、`fms-payable-isolated-context.sql` 为同一会话中的后续断言准备数据，部分应收断言也要求调用方提供外层事务。以各文件开头的执行说明为准。

执行涉及写入的测试前，先阅读脚本和依赖，使用合适的隔离环境，并在同一数据库会话中完成 `BEGIN`、必要的准备片段、测试断言和 `ROLLBACK`。断言失败时同样必须回滚。不要按文件名排序批量执行整个目录，不要提交测试事务，不要把夹具当作生产初始化数据。测试中固定的日期和 UUID 可能是关联场景所需的合成身份，删除前必须检查相关准备脚本。

## 不提交的内容

临时排查 SQL、导出的业务数据、备份、运行截图、trace、日志和覆盖率报告应保存在 Git 忽略的 `.artifacts/` 等目录。`playwright/.auth/`、`playwright-report/`、`test-results/` 同样不提交。运行截图不替代人工确认的视觉基准。

删除测试需有证据：被测功能已移除、断言已由其他测试完整覆盖，或测试入口与夹具确实不再被引用。不能仅凭文件数多、历史日期、未进入默认 CI 或没有静态导入就删除测试。
