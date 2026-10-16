# Vercel Preview / Staging 准备清单

此清单用于首次受保护的线上 Preview/Staging 准备。正式域名注册不是启动首轮 Staging 的前置条件：如 Vercel 提供的稳定 HTTPS 主机名满足配置需要，可先用它验证；自有域名只需在准备使用自定义 Staging 主机或正式上线前注册。当前仅为本地准备文档；没有连接 GitHub/Vercel/Supabase、配置 Secret、部署或应用迁移。Vercel Preview 需连接独立的 Supabase Staging 和合成资料，不得连接 Production。

## 开始前

- [ ] UI Review 已由用户验收；按约定完成本地构建、静态检查和浏览器验证，并处理结果。
- [ ] 确定可部署的 GitHub 仓库与分支。部署内容必须是已审阅、可重现的工作树；不要把临时文件、备份、用户资料或 Secret 推送到 Git。
- [ ] 创建独立 Supabase Staging 项目，确认项目 ID、区域、Auth 站点地址、邮箱发信来源和 Storage 均不属于 Production；只使用合成账号/资料。
- [ ] 选定一个稳定的 Staging 主机名。临时预览主机可用于首轮部署，但 OAuth/邮件回跳、Turnstile hostname 和公开链接需采用与该环境一致的 HTTPS origin。
- [ ] 为 Vercel Preview 启用可用的访问保护，并另行保持 `ALLOW_SEARCH_INDEXING=false`。`noindex` 不等于访问控制。

## 域名与 DNS 时序

- 可以等到 Staging 服务准备好后再购买正式域名；如果已选定且希望提前锁定名称，也可先注册。购买域名本身不会触发上线或改变网站流量。
- 首轮 Staging 可使用稳定、受保护的 Vercel HTTPS 主机名。确定后，`NEXT_PUBLIC_SITE_URL`、Supabase Auth 回跳、邮件回跳和 Turnstile hostname 必须统一使用该 Staging origin；避免在测试中途更换主机名。
- 若要使用自有域名进行 Staging，只配置专用子域名（例如 `staging.example.com`），并严格按 Vercel 提供的记录设置；不要把正式根域名或 `www` 指向 Staging。
- 正式域名 DNS/Production 环境只在 Staging 验收、上线清单及回滚方案准备完成后逐步配置。公开索引保持关闭，直到正式域名与 Production 检查通过且用户确认切流。

## Vercel 环境变量

先只设置 **Preview/Staging** 环境范围；不要把 Development 或 Production 值复制过去。真实值只在 Vercel/Supabase 的 Secret Manager 中录入，不在聊天、仓库或日志交换。

| 名称 | Preview/Staging 用途 | 配置边界 |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Staging 的精确 HTTPS origin | 不带路径、查询或片段；不可保留示例中的 `localhost`。 |
| `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_URL` | Supabase Staging 项目地址 | 两者都指向同一个 Staging 项目。 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 浏览器端 Supabase publishable key | 此 key 可公开；数据库仍必须依赖 RLS。 |
| `SUPABASE_SECRET_KEY` | 服务端受限写入/查询 | Secret；只用于 server runtime，不得使用 `NEXT_PUBLIC_` 前缀。 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` | Staging 挑战与 Siteverify | 使用 Staging hostname 对应的一组 key；Secret 只存在服务器端。 |
| `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD`、`SMTP_FROM` | 邮箱验证与密码重置 | 使用隔离的 Staging 发信配置与受控测试邮箱；确认发信不能触达真实用户。 |
| `SEARCH_RATE_LIMIT_HMAC_SECRET` | 搜索限流 | 独立于其他环境的随机密钥，至少 32 字节。 |
| `SEARCH_TRUSTED_CLIENT_IP_HEADER` | 搜索限流来源地址 | 初始留空；只有线上验证 Vercel/代理会覆盖所选头后才配置。缺少时搜索按设计 fail closed。 |

`NODE_ENV` 与 `VERCEL_ENV` 由平台提供，不要手动覆盖。Analytics、IP blocking、scanner、evidence preview、submission publication、account deletion、backup、Critical Security Email 和 Hot/Valid Read 的开关一律保持关闭。除实际开启相应 Staging 验证外，不要配置它们的 HMAC、dispatcher、scanner、R2 或数据库备份凭证。`SUPABASE_DB_URL`、`SUPABASE_DB_PASSWORD` 与 R2/备份凭证只属于隔离备份 Worker，不加入网站项目的 Vercel 环境变量。

## Supabase Staging 配套

- [ ] Auth Site URL 与 `NEXT_PUBLIC_SITE_URL` 完全一致；只将精确的 Staging callback `https://<staging-origin>/auth/callback` 加入 Redirect URL allowlist，并保留本地 Development 的独立回跳配置。
- [ ] 关闭 Supabase 原生邮箱确认，依 MMWR 自有验证流程；设置合适的 Staging 测试发信人和收件箱。
- [ ] 核对迁移 ledger、文件顺序与回滚预案；使用 Staging 快照并按 `PHASE3_STAGING_ACCEPTANCE.md` 逐批应用和验收，不从 Vercel Build 自动迁移数据库。
- [ ] 配置最少量合成资料：普通用户、邮箱未验证用户、暂停用户、Admin 与 Owner；后台账号由 Owner/授权操作员手动建立，不复制 Production 身份。
- [ ] 搜索、分析、地图来源、IP 限制和扫描器代理等依赖可信 ingress/外部服务的项目，先保持关闭；只有完成对应来源头、证书、Origin 与安全边界验证后才进入专门验收。

## 首次 Preview 冒烟核对

部署后先确认访问保护生效，再检查：

1. Preview 地址返回 HTTPS；未登录的未授权访问会被访问保护拒绝。
2. 首页、Latest、地区、Tags、Search、Hot、投稿草稿和 Feedback 页面均正常响应；页面语言路由不会自我重定向。
3. sitemap/robots 不允许 Staging 进入索引；敏感页面继续 `noindex`，同时确认访问保护独立生效。
4. 缺少 Supabase、Turnstile 或 SMTP 配置时，相关表单按设计 fail closed，不显示成功，不创建真实数据。
5. 所有高风险/可选功能仍为 OFF；客户端资源/响应中没有 Supabase Secret、SMTP 凭证、HMAC 密钥、证据路径或真实资料。
6. Auth callback、邮箱验证和密码重置只往返 Staging origin 与 Staging Supabase；不测试真实投稿，不启用提交、上传或公开发布。

如上述任何一项不通过，停止扩大测试范围，记录 Preview 部署 ID、提交 SHA、Staging 项目 ID（非密钥）与不含敏感内容的错误摘要，修复后重试。Preview 部署和 Staging 验收不构成 Production 域名切流授权。

## 当前状态

GitHub/Vercel/Supabase Staging 均未连接，本清单未执行。正式域名可在 Staging 阶段之后购买；目前没有任何 DNS 更改。线上服务仍须逐项由用户在相应平台完成配置并反馈结果。
