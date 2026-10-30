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

## SQL 工作台验证

SQL 控制台使用 `execute-sql-with-columns` Edge Function：`metadata` 通过用户身份调用静态 `SECURITY INVOKER` 元数据函数，只返回有访问权限的对象结构；`execute` 和 `explain` 由服务端校验平台超级管理员身份，属于数据库范围的管理操作，不受顶部租户筛选限制。普通用户仍可浏览结构和使用 AI 生成 SQL。

查询通过数据库连接执行，先在独立语句中设置事务级 `statement_timeout`，再执行实际 SQL。SELECT / WITH / VALUES / TABLE 进入只读事务，并以 `maxRows + 1` 判断是否截断；默认 200 行、10 秒，最大 1000 行、30 秒。EXPLAIN 固定 `ANALYZE FALSE`，仅展示预估计划。写入语句的展示上限不限制其实际影响行数。

- `unit/sql-console-input.test.ts`：前置注释、字符串分号、嵌套注释及语句边界。
- `unit/sql-completion-context.test.ts`：补全、模板、标识符转义、执行计划树，以及语句导航与执行选择共用的词法边界。
- `e2e/sql-workbench-inspection.spec.ts`：结构详情、关联定位、模板只载入、查询设置、截断提示、计划失败重试及普通用户限制；覆盖语句导航、分割面板折叠与宽度记忆、撤销/重做、语句选择，以及 SQL/JSON 的高亮、复制、查找和换行；配合 `e2e/sql-workbench.spec.ts` 验证草稿、历史与结果流程。
- `integration/sql-console-edge-boundary.test.ts`：使用显式测试凭据验证真实元数据、计划、限行、超时与普通用户拒绝执行。缺少凭据时跳过，不应将跳过报告为在线验证通过。
- `unit/sql-connections.test.ts` 与 `e2e/sql-resources-connections.spec.ts`：外接连接的加密保存、租户与账号授权、资源树、MySQL 补全与计划、JSON 单元格详情、查询页签隔离及刷新恢复。
- `integration/sql-connections.test.ts`：显式启用专用隔离实例验证 PostgreSQL / MySQL 的实际连接、元数据、只读事务、结果上限与超时；配置与使用方式见 [SQL 工作区说明](../src/views/data-center/sql-console/README.md)。执行端独立运行，不依赖 Docker；Docker 仅用于这组隔离集成测试。
- `integration/sql-gateway-startup.test.ts`：设置 `SQL_GATEWAY_STARTUP_TEST=1`，验证项目冷启动执行端、退出开发服务后继续运行、重复启动复用同一进程，以及精确来源校验和匿名请求拒绝。
- `e2e/sql-advanced-tools.spec.ts`：对象收藏、索引高亮和关联表定位、SQL 收藏、编辑器偏好与导入、注释撤销，以及连接服务自动加载和失败重试。
- `e2e/sql-enterprise-actions.spec.ts`：对象菜单、刷新空间与图标对齐、全局单图标 loading、减少动态效果、DM8 的连接类型及查询 schema、5000 个函数的虚拟列表；使用合成数据，不读取业务查询结果。
- `unit/sql-resource-tools.test.ts`：只读统计模板、复合外键、结构文档与达梦请求校验。

2026-10-29：远端新元数据函数已先在事务中验证并回滚，再直接应用；验证了 authenticated 可调用、anon 无执行权限及非系统对象结构完整。部署前备份保存在忽略的 `.artifacts/`；无业务数据变更。

## 不提交的内容

临时排查 SQL、导出的业务数据、备份、运行截图、trace、日志和覆盖率报告应保存在 Git 忽略的 `.artifacts/` 等目录。`playwright/.auth/`、`playwright-report/`、`test-results/` 同样不提交。运行截图不替代人工确认的视觉基准。

删除测试需有证据：被测功能已移除、断言已由其他测试完整覆盖，或测试入口与夹具确实不再被引用。不能仅凭文件数多、历史日期、未进入默认 CI 或没有静态导入就删除测试。
