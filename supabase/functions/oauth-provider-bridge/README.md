# 微信、企业微信、飞书 OAuth 适配

`oauth-provider-bridge` 把三家身份平台的非标准响应转换为 Supabase Custom OAuth Provider
要求的标准 `token` 与 `userinfo` 响应。函数不创建业务用户、不读写数据库，也不保存上游
access token；完成一次身份查询后只签发一个有效期 10 分钟的桥接令牌。

## 部署前配置

函数默认从 Supabase Edge 环境自带的服务端主密钥通过 HKDF 派生一个限定用途的签名子密钥，
不会使用主密钥查询数据库，也不会返回或记录它，因此部署后无需增加 Secret 即可运行。

生产环境也可以生成一个至少 32 字节的独立随机密钥，并在 Supabase Dashboard 的
**Edge Functions → Secrets** 中保存为 `OAUTH_BRIDGE_SIGNING_SECRET` 来覆盖派生密钥：

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToBase64String($bytes)
$secret
```

企业微信的 AgentId 可以保存为 `WECOM_AGENT_ID` Function Secret，也可以直接写在该
Custom Provider 的 Authorization URL 查询参数中。

如果本机已安装 Supabase CLI，可用下面的命令重新部署：

```powershell
supabase functions deploy oauth-provider-bridge --project-ref ckbftoopuyophiebamwy --use-api --no-verify-jwt
```

该函数必须允许未携带 Supabase 用户 JWT 的请求，因为授权页由浏览器访问，Token 端点由
Supabase Auth 服务访问。函数自身会校验固定回调地址、上游客户端凭证和桥接令牌签名。

## 固定地址

项目回调地址：

```text
https://ckbftoopuyophiebamwy.supabase.co/auth/v1/callback
```

函数根地址：

```text
https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge
```

## Supabase Custom Providers

三个 Provider 都选择 **Manual configuration → OAuth2**，关闭 PKCE，打开
`Email optional`，最后启用 Provider。

### 微信开放平台网站应用（PC 扫码）

| 字段 | 值 |
| --- | --- |
| Name | 微信 |
| Identifier | `custom:wechat` |
| Client ID | 微信开放平台网站应用 AppID |
| Client Secret | 对应 AppSecret |
| Authorization URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/wechat/authorize` |
| Token URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/wechat/token` |
| UserInfo URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/wechat/userinfo` |
| Scopes | `snsapi_login` |
| PKCE | 关闭 |
| Email optional | 开启 |

微信开放平台网站应用必须已审核并拥有“微信登录”权限；回调域配置为
`ckbftoopuyophiebamwy.supabase.co`。公众号测试号不能获得网站应用 PC 扫码权限。

### 微信公众号测试号（仅微信内网页授权）

沿用 `custom:wechat`，但把 Authorization URL 改为：

```text
https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/wechat/authorize?mode=official-account
```

Scopes 填 `snsapi_userinfo`。在测试号“网页授权获取用户基本信息”中把授权回调域配置为
`ckbftoopuyophiebamwy.supabase.co`。此模式需要在微信客户端中打开，不是电脑端扫码登录。

### 企业微信自建应用（PC 扫码）

| 字段 | 值 |
| --- | --- |
| Name | 企业微信 |
| Identifier | `custom:wecom` |
| Client ID | 企业 CorpID |
| Client Secret | 自建应用 Secret |
| Authorization URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/wecom/authorize` |
| Token URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/wecom/token` |
| UserInfo URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/wecom/userinfo` |
| Scopes | 留空 |
| PKCE | 关闭 |
| Email optional | 开启 |

在企业微信管理后台完成以下设置：

1. 创建自建应用，记录 CorpID、AgentId、Secret，并配置应用可见范围。
2. “企业微信授权登录 → Web 网页”回调域填 `ckbftoopuyophiebamwy.supabase.co`。
3. “网页授权及 JS-SDK”可信域名同样填写该域名。
4. 若没有设置 `WECOM_AGENT_ID` Secret，可把 Authorization URL 写成
   `.../wecom/authorize?agent_id=你的AgentId`。

### 飞书企业自建应用

| 字段 | 值 |
| --- | --- |
| Name | 飞书 |
| Identifier | `custom:feishu` |
| Client ID | 飞书 App ID（`cli_...`） |
| Client Secret | 飞书 App Secret |
| Authorization URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/feishu/authorize` |
| Token URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/feishu/token` |
| UserInfo URL | `https://ckbftoopuyophiebamwy.supabase.co/functions/v1/oauth-provider-bridge/feishu/userinfo` |
| Scopes | `contact:user.base:readonly contact:user.email:readonly` |
| PKCE | 关闭 |
| Email optional | 开启 |

在飞书开放平台的应用安全设置中添加固定回调地址，并申请用户基本信息和邮箱权限。应用必须
发布到测试版本或正式版本，登录用户必须在应用可用范围内。

## 应用侧配置

系统管理 → 网站配置 → 登录渠道中保持下面的 Provider：

| 渠道 | Provider |
| --- | --- |
| 微信 | `custom:wechat` |
| 企业微信 | `custom:wecom` |
| 飞书 | `custom:feishu` |

新账号首次使用第三方身份前，先登录个人中心完成账号绑定。Supabase Authentication 设置中
还需要启用 Manual Linking；绑定完成后才可从登录页直接进入。

## 安全要求

- 不要把任何 AppSecret 写进仓库、前端环境变量、网站配置或聊天截图。
- 泄露过的微信测试号 AppSecret 必须先重置再使用。
- 三个 Supabase Custom Provider 的 Client Secret 只保存在 Supabase Auth 配置中。
- 如果设置 `OAUTH_BRIDGE_SIGNING_SECRET`，它只保存在 Edge Function Secrets 中，并应定期轮换。
