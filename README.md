<div align="center">
  <img src="./src/assets/images/common/logo.webp" width="96" alt="亿企工场 Logo" />
  <h1>亿企工场</h1>
  <p><strong>Vue 3 + Supabase 驱动的模块化企业业务平台</strong></p>
  <p>统一平台底座，组合运输、车辆、财务、人力、安全生产、司机协同与可治理 AI。</p>

  <p>
    <a href="https://gitee.com/art-si/art-supabase-pro">Gitee</a>
    ·
    <a href="https://github.com/art-si/art-supabase-pro">GitHub</a>
    ·
    <a href="https://art-si.github.io/art-supabase-pro/">在线演示</a>
    ·
    <a href="./README.en.md">English</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Vue-3.5-42b883" alt="Vue 3.5" />
    <img src="https://img.shields.io/badge/TypeScript-6.x-3178c6" alt="TypeScript 6" />
    <img src="https://img.shields.io/badge/Element_Plus-2.14-409eff" alt="Element Plus" />
    <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e" alt="Supabase" />
    <img src="https://img.shields.io/badge/License-MulanPSL--2.0-blue" alt="MulanPSL-2.0 License" />
  </p>
</div>

![运输运营工作台](screenshots/02-dashboard.png)

> 历史展示截图：画面显示 2026 年 9 月 22 日。实际工作台界面与数据以当前运行版本为准。

## 项目定位

亿企工场不是只展示表格、表单和图表的 UI 模板。它以 **Supabase Auth、PostgreSQL、RLS、Storage、Realtime、RPC 与 Edge Functions** 为后端基础，以主平台统一公共运行时、业务子仓独立演进的方式，提供可以继续落地和二次开发的企业业务能力。

项目当前已经覆盖：

- 企业级基础平台：登录认证、多租户、RBAC、动态菜单、按钮权限、数据字典、附件、系统参数与审计。
- TMS 运输全链路：客户、承运商、司机、货物、合同、站点、开单、订单、运单、配载、配送、在途监控与财务结算。
- 车辆全生命周期：车辆档案、入档审核、保险、年检、维修、事故、里程、例检、配件与到期提醒。
- 财务管理：运输结算、应收账龄、资金、会计核算、票据、税务、固定资产、薪资与财务报表。
- 人力资源：组织岗位、员工生命周期、招聘、编制、考勤、薪酬福利、绩效、人才与员工服务。
- 安全生产：设备台账、资质培训、应急救援、反违章、劳保用品、工器具与事故管理。
- 审批工作流：版本化流程、条件节点、任务处理、转交、委托、催办、监控、回调补偿与完整审计轨迹。
- AI 业务能力：智能填单、SQL 助手、项目助手、调度推荐、运输异常研判、费用审核、利润诊断、回款风险、车辆健康、票据/OCR 与质量运营。

## 项目全景

| 仓库 | 定位 | 独立开发端口 |
| --- | --- | --: |
| [`art-supabase-pro`](https://gitee.com/art-si/art-supabase-pro) | 平台宿主、公共运行时、审批、数据中心与 AI 治理 | `3006` |
| [`art-supabase-tms`](https://gitee.com/art-si/art-supabase-tms) | TMS 智慧运输与履约协同 | `3016` |
| [`art-supabase-vms`](https://gitee.com/art-si/art-supabase-vms) | VMS 车辆全生命周期管理 | `3015` |
| [`art-supabase-fms`](https://gitee.com/art-si/art-supabase-fms) | FMS 运输财务与企业核算 | `3012` |
| [`art-supabase-hr`](https://gitee.com/art-si/art-supabase-hr) | HR 人力资源与人才运营 | `3013` |
| [`art-supabase-smis`](https://gitee.com/art-si/art-supabase-smis) | SMIS 安全生产与设备治理 | `3014` |
| [`art-supabase-scm`](https://gitee.com/art-si/art-supabase-scm) | SCM供应链管理：报价、合同、订单与发运 | `3021` |
| [`supabase-mobile-tms-driver`](https://gitee.com/art-si/supabase-mobile-tms-driver) | 面向司机的 H5 / 微信小程序运输执行端 | — |
| [`art-supabase-doc`](https://gitee.com/art-si/art-supabase-doc) | 使用、开发、部署与运维文档站 | `5173` |
| [`art-supabase-site`](https://gitee.com/art-si/art-supabase-site) | 亿企工场独立官网与产品矩阵 | `3022` |

主仓通过 Git submodule 固定各业务应用的提交，统一装载认证、租户、菜单、权限、布局、公共组件和 Supabase 客户端。业务仓保留领域页面、API、类型与规则的所有权；司机端通过受控服务端契约与 TMS 共享同一条运单履约链路。

## 为什么值得关注

| 能力              | 项目提供的实现                                                               |
| ----------------- | ---------------------------------------------------------------------------- |
| Supabase 原生后端 | Auth、PostgreSQL、RLS、Storage、Realtime、RPC、Edge Functions 深度集成       |
| 多租户与权限      | 租户级数据隔离、角色菜单、按钮权限、平台超级管理员边界                       |
| 真实业务闭环      | 从运输开单、调度、在途、签收，到对账、收付款、发票、利润分析                 |
| 可治理的 AI       | 普通用户可用的只读能力与按权限建档、受控写入、运行审计及反馈闭环             |
| 可复用审批引擎    | 版本不可变、条件路由、审批任务、委托转交、SLA、通知、回调与补偿              |
| 工程化前端        | Vue 3、TypeScript、Vite、Pinia、Element Plus、Monaco、ECharts 与统一业务组件 |

## 核心功能实拍

以下为仓库保存的产品运行截图，用于展示功能；页面样式和数据请以当前运行版本为准。

### AI 智能填单

支持粘贴客户聊天、运输委托等文字资料，也可以上传订单图片。AI 完成识别、字段核对、主数据匹配与建档建议，最终由操作人员确认后回填订单，避免 AI 越权直接保存业务数据。

![AI 智能填单](screenshots/04-ai-order-copilot.png)

### TMS 实时在途监控

在同一驾驶舱内查看在途车辆、运输进度、线路、实时报警、司机与货物信息，并提供 AI 异常研判和快捷处置入口。

![TMS 实时在途监控](screenshots/05-in-transit-monitor.png)

### 一车一档与车辆健康

围绕单车聚合档案、司机、零部件、保险、年检、违章、事故、维修保养、例检、里程和设备信息，并提供 AI 车辆健康研判。

![车辆全生命周期档案](screenshots/06-vehicle-lifecycle.png)

### 审批工作台与流程治理

审批中心统一承载待办、已处理、我发起、离岗委托和租户隔离；流程定义采用版本化治理，已发布版本保持不可变，可查看节点快照与版本差异。

![审批工作台](screenshots/07-approval-workbench.png)

![流程版本治理](screenshots/08-workflow-governance.png)

### Supabase AI 项目助手

统一浏览 Database、视图、函数、触发器、RLS 与 Edge Functions。项目助手基于实时元数据提供只读分析与治理建议，不直接执行 SQL 或修改项目。

![Supabase AI 项目助手](screenshots/09-supabase-ai-assistant.png)

### 运输财务工作台

集中展示应收、应付、回款、付款、开票、费用审核、核销进度和运输毛利，并提供 AI 回款风险研判。

![运输财务工作台](screenshots/11-finance-workbench.png)

### AI 运行与质量运营

对 AI 调用次数、成功率、响应耗时、Token 消耗、能力分布、OCR/填单质量、用户反馈和失败原因进行统一观测，让 AI 能力可追踪、可评价、可持续改进。

![AI 运行中心](screenshots/12-ai-operations.png)

### HR 人员与组织运营

围绕组织、岗位和员工身份建立连续的人事数据主线，并在同一工作区展示任职状态、组织归属、岗位、用工类型、系统账号与完整履历。

![HR 员工花名册](screenshots/13-hr-employee-roster.png)

### SMIS 安全生产治理

通过安全基础资料、设备台账、资质培训、应急救援、反违章、劳保工器具和事故管理形成可追溯闭环；演练计划明确关联预案、周期、组织、负责人和预警状态。

![SMIS 应急演练计划](screenshots/15-smis-emergency-drill-plan.png)

### TMS 司机移动工作台

司机端以 H5 与微信小程序承接运输执行，集中呈现绑定车辆、当前任务、运输节点、剩余里程与现场操作入口，并与 Web 管理端共享受控的运单履约状态。

![TMS 司机移动工作台](screenshots/16-driver-mobile-home.png)

<details>
<summary><strong>查看更多：登录体验、运输开单与 AI SQL 工作台</strong></summary>

### 企业级登录体验

![登录页面](screenshots/01-login.png)

### 运输开单工作区

![运输开单](screenshots/03-smart-order.png)

### AI SQL 工作台

![AI SQL 工作台](screenshots/10-ai-sql-workbench.png)

</details>

## 业务模块

### TMS 运输管理

- 基础资料：客户、客户地址、客户价格、承运商、承运商价格、司机、货物、合同、站点。
- 运输执行：智能开单、订单列表、待配载、已配载、配送签收、回单识别、异常工单、在途监控。
- 财务结算：客户对账、承运商对账、收付款、核销、发票、运单费用、利润分析。
- AI 辅助：填单、调度、异常研判、费用审核、利润诊断、回款风险、承运商评估、发票与凭证识别。

### FMS 财务管理

- 运输结算：客户/承运商对账、收付款、发票、运单费用、利润与应收账龄。
- 资金与核算：资金账户、日记账、调拨、银行对账、凭证、自动入账、账簿、报表与结账。
- 专项财务：付款申请、费用报销、票据、税务、固定资产、薪资和异常中心。

### HR 人力资源

- 组织与人员：组织设计、岗位与职务体系、编制、花名册、档案和入转调离。
- 人才与运营：招聘、考勤、休假、薪酬福利、绩效、学习发展、继任、人才盘点与内部流动。
- 治理与服务：合规、政策签收、员工关系、自助服务、人员分析和用工风险。

### SMIS 安全生产

- 安全基础与设备：岗位风险、安全责任、作业指导、场所、供应商、设备与特种设备台账。
- 资质培训：课程、题库、考试、培训计划/记录/统计与各类安全资格证书。
- 生产安全：应急预案与演练、反违章、制度文档、劳保用品、工器具和事故管理。

### 司机协同端

- 接单、装卸货定位打卡、发车、到达、签收、收车与运输轨迹。
- 现场照片、磅单、回单、签字、里程和费用凭证移动采集。
- 费用上报与 OCR 辅助识别，审批状态与 Web 管理端同步。

### 车辆管理

- 车辆档案录入、编辑、审核和详情聚合。
- 保险、年检、违章、事故、维修保养、例检和里程记录。
- 零部件、分类、供应商、领用与寿命跟踪。
- 保险、年检、保养、配件与车辆寿命提醒，支持风险工单与健康研判。

### 审批中心

- 跨业务审批工作台：待我审批、我已处理、我发起的。
- 流程定义、草稿与发布版本、条件节点、会签/或签、SLA 与版本差异。
- 审批、驳回、撤回、转交、委托、催办和完整操作轨迹。
- 业务回调 Outbox、失败重试、死信与人工补偿。

### 数据与 AI

- Monaco SQL 工作台：PostgreSQL 编辑、格式化、补全、JOIN 推断、错误定位与结果查看。
- AI 生成 SQL 与错误修复，结合项目 Schema 摘要减少表名、字段名幻觉。
- Supabase 项目对象浏览和只读项目助手。
- AI 配置、提示词、运行记录、质量指标、用户反馈与问题闭环。

## 技术架构

业务菜单由 Supabase `sys_menu` 提供。菜单的完整访问路径、`component` 路径与业务子仓 `src/views` 下的视图目录逐段对应；详情路由的 `:id` 等参数不进入文件目录。多个菜单共用一个实现时，每个访问路径仍有自己的视图入口，复用实现放在 `views/components`。

2026-10-03 的路由目录核对覆盖 11 个应用的 449 个页面菜单，修正了 111 个组件路径；数据库复查时各应用的路径与组件不匹配数均为 0。更新前菜单路径与组件映射已保存在本次工作区的 `.artifacts/menu-route-audit.json`，并有对应的恢复 SQL。

```text
Vue 3 + TypeScript + Element Plus
              │
       统一 API Provider 层
              │
┌─────────────┴────────────────────────────────────┐
│ Supabase Auth │ PostgreSQL + RLS │ Storage       │
│ Realtime      │ RPC / Functions  │ Edge Functions│
└─────────────┬────────────────────────────────────┘
              │
    TMS / 车辆 / 审批 / 财务 / AI 业务模块
```

## 技术栈

| 分类        | 技术                                                               |
| ----------- | ------------------------------------------------------------------ |
| 前端框架    | Vue 3、TypeScript、Vite、Vue Router、Pinia                         |
| UI 与可视化 | Element Plus、SCSS、Tailwind CSS、ECharts、Vue Flow                |
| 数据与后端  | Supabase、PostgreSQL、RLS、Realtime、Storage、Edge Functions       |
| 编辑与文件  | Monaco Editor、Tiptap、XLSX、File Viewer、XGPlayer                 |
| 工程质量    | ESLint、Prettier、Stylelint、vue-tsc、Playwright、Node Test Runner |

## 快速开始

### 环境要求

- Node.js `>= 22.0.0`
- pnpm `>= 11.9.0`
- 一个 Supabase 项目

### 1. 获取代码

```bash
git clone --recurse-submodules https://gitee.com/art-si/art-supabase-pro.git
cd art-supabase-pro
pnpm install
```

共享依赖补丁由主仓 `patches/` 维护。Element Plus 2.14.7 的补丁修复数字输入框解除禁用后 `aria-disabled` 不更新的问题，同时覆盖 ES Module 和 CommonJS。业务子仓保留相同补丁以支持独立安装；更新主仓补丁后运行 `pnpm dependencies:sync-patches` 同步副本，`pnpm dependencies:audit` 会检查配置和内容一致性。上游修复后，升级依赖时应移除对应补丁并重新验证表单禁用切换。

### 2. 配置环境变量

在项目根目录配置 `.env` 或 `.env.development`：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-supabase-anon-key

# 使用在途地图时配置
VITE_AMAP_KEY=your-amap-key
VITE_AMAP_SECURITY_JS_CODE=your-amap-security-code
```

> 前端只应使用 Supabase `anon` key。不要把 `service_role` key、AI Provider 密钥或其他服务端凭证放进 Vite 环境变量；权限安全必须由 RLS、数据库函数和 Edge Functions 在服务端边界保证。

### 3. 启动开发环境

```bash
pnpm dev
```

主仓与 Vue 业务子仓统一使用 `sass-embedded`。Sass 全局注入由 `scripts/scss-globals.mjs` 维护：普通组件只注入共用混合宏，平台全局样式与 Element Plus 主题源码继续加载配置过的主题变量；子仓不要另行复制注入规则。

开发性能排查应分别测量服务器启动、首次页面加载和实际文件热更新。使用具体 hooks 时直接导入对应的 `@/hooks/core/**` 或 `@/hooks/component/**` 文件，避免统一导出入口把无关控件带入当前页面的加载链路。

### 4. 质量检查与构建

```bash
pnpm check
pnpm build
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `npm run dev:cloudbase` | 本地启动前端，连接 `.env.cloudbase` 配置的 CloudBase 后端 |
| `pnpm check:fast` | 运行 UI、复用、权限与数据库静态审计、类型、ESLint 和单元测试 |
| `pnpm check` | 在快速检查基础上增加 Stylelint |
| `pnpm check:ci` | 运行完整静态检查、快照校验、生产构建与核心视觉回归 |
| `pnpm lint:stylelint:fix` | 自动修复可安全处理的样式规范问题 |
| `pnpm test:e2e` | 运行完整 Playwright 端到端测试 |
| `pnpm test:e2e:core` | 运行 1440 桌面与 390 移动端核心页面视觉回归 |
| `pnpm test:e2e:install` | 安装 CI 所需的 Playwright Chromium |
| `pnpm snapshot:check` | 校验 AI 项目快照是否与当前代码一致 |
| `pnpm build` | 构建生产版本 |
| `pnpm build:analyze` | 生成构建体积分析 |
| `pnpm repo:pull` | 同步拉取主仓及全部 Git 子仓 |
| `pnpm repo:publish -- "feat: 提交说明"` | 构建 docs，提交并推送主仓及有改动的子仓 |

统一发布命令会先检查分支和上游状态，构建所有有改动子仓的 `docs`，再构建主仓 `docs`。提交和推送始终按照“子仓在前、主仓在后”的顺序执行，并在结束时确认主仓与全部子仓均无未提交内容。若拉取后子仓版本领先于主仓记录，`repo:pull` 会保留新的 `gitlink`，确认后执行一次 `repo:publish` 即可提交主仓指针。

## 项目结构

```text
art-supabase-pro/
├─ src/
│  ├─ api/                         # 统一 API 与 Supabase Provider
│  ├─ components/core/             # 表格、表单、弹窗、抽屉、选择器等核心组件
│  ├─ hooks/                       # 通用组合式能力
│  ├─ store/                       # Pinia 状态管理
│  ├─ views/
│  │  ├─ dashboard/                # 运营工作台与 AI 运行中心
│  │  ├─ data-center/              # 数据字典、附件、SQL 与 Supabase AI
│  │  ├─ system/                   # 用户、角色、菜单、租户、参数、AI 配置
│  │  └─ workflow/                 # 审批工作台、流程设计与监控
│  └─ utils/                       # 通用工具
├─ modules/
│  ├─ art-supabase-doc/            # 官方 VitePress 文档站
│  ├─ art-supabase-fms/            # FMS 财务管理应用
│  ├─ art-supabase-hr/             # HR 人力资源应用
│  ├─ art-supabase-scm/            # SCM 供应链管理子仓
│  ├─ art-supabase-site/           # 亿企工场独立官网
│  ├─ art-supabase-smis/           # SMIS 安全生产应用
│  ├─ art-supabase-tms/            # TMS 智慧运输应用
│  └─ art-supabase-vms/            # VMS 车辆管理应用
├─ supabase/
│  ├─ functions/                   # Edge Functions
│  └─ migrations/                  # 历史说明；当前数据库变更直接执行并验证
├─ tests/                          # 单元、浏览器、SQL 集成与 PowerShell 测试
└─ screenshots/                    # README 产品截图
```

测试目录的用途、SQL 执行边界和提交原则见 [tests/README.md](tests/README.md)。

`docs/` 是主应用和业务子仓当前的静态发布产物，统一发布命令会重建它； `modules/art-supabase-doc/docs/` 则是文档站的源文件，两者都不能按临时目录删除。测试源码、测试夹具和视觉基准需要版本控制；本机 IDE 状态、数据库缓存、运行日志、覆盖率、测试报告、认证会话和一次性排查证据放在忽略目录中，不提交。取消文件跟踪只影响后续提交，不会删除远端 Git 历史；历史瘦身需要单独协调，不能通过强推混入普通清理。

## 安全与权限原则

- 所有业务数据按租户隔离，数据库层启用 RLS。
- 普通用户可以使用租户范围内、业务数据安全的只读 AI；具备对应业务 `Add` 权限时，也可通过 AI 创建本租户的主数据。
- 其他 AI 业务修改、配置、发布、流程状态变更与受控写入仅允许平台超级管理员，且必须同时经过 UI 和服务端权限校验。
- AI 历史、运行日志、生成物与反馈可作为审计数据保存，不得绕过业务写权限。

## 开源与贡献

项目采用 [木兰宽松许可证第 2 版（MulanPSL-2.0）](LICENSE) 开源。欢迎提交 Issue、Pull Request，也欢迎分享你的 Supabase、TMS、车辆管理和 AI 业务实践。

界面使用 HarmonyOS Sans 字体，版权 © Huawei Device Co., Ltd.；字体文件遵循单独的 [HarmonyOS Sans Fonts License Agreement](public/fonts/HarmonyOS-Sans-LICENSE.txt)。

感谢开源社区对基础界面能力的贡献。
