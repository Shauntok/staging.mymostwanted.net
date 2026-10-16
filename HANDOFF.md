# MMWR 项目交接说明（HANDOFF）

> 交给 Codex 作为项目的产品决策基线。先检查目标仓库、分支、README、AGENTS.md、小时代项目位置和现有实现，再开始实现。本文记录的是已确认需求，不代表功能已经存在或已部署。

## 1. 项目目标

### 当前本地与托管状态（2026-10-16）

当前代码分支 `codex/mmwr-plan`，本地 HEAD `15bbc51a0cc85d1883c88807647dc993afee6b38`；该提交已推送到 GitHub `staging`，Vercel Preview 部署 `dpl_4i6VMZ39XFUTVPfXUC2QYFGBs4Rp` 为 READY。修复后的 `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run security:smoke`、`npm run build` 与 `git diff --check` 均通过。Security smoke 覆盖简中/英语/马来语 45 个代表页面、安全响应头、默认 noindex、语言标记及 robots/sitemap 关闭态；完整 Node 测试按默认设置跳过 2 个真实 ClamAV 用例和 3 个本地 Supabase 恢复 opt-in 用例。本轮没有运行 `test:db` 或 Supabase DB lint。

Vercel 项目 `staging-mymostwanted-net` 的最新 Preview 部署 `dpl_4i6VMZ39XFUTVPfXUC2QYFGBs4Rp` 为 READY、`target=null`，提交 `15bbc51a0cc85d1883c88807647dc993afee6b38`；项目启用了 SSO 访问保护。Staging Supabase 项目 ref 为 `jjgwiipawyoizwalanha`，本地与远端迁移账本此前核对均为 106 个迁移；Resend 的 Staging 发信域已验证。浏览器只读检查确认地区页可加载。账号页登录按钮仍禁用，Turnstile 未通过端到端验收。2026-10-16 只读核对确认 Cloudflare widget 已允许实际 Vercel Preview hostname `staging-mymostwanted-net-git-staging-shauntoks-projects.vercel.app` 和 `staging.mymostwanted.net`，Vercel Preview 的公开 Site Key 与 widget 一致。发现旧部署的 Turnstile API 未挂到 `window`，脚本标签缺少 CSP nonce；新部署的标签现在有 nonce，但 `window.turnstile` 仍未定义且未创建 challenge iframe，因此 nonce 修复尚未解决全部问题。Cloudflare 控制台显示尚未调用 Siteverify；没有提交验证码表单，此提示不能单独说明故障原因。白名单无需改动。需继续检查第三方脚本实际加载/执行路径；不要关闭挑战或绕过 Siteverify。还未完成 Supabase Auth Site URL/精确 callback/Auth SMTP、合成账号与权限边界验收、Owner/Admin TOTP、全流程邮件验证及完整浏览器验收。没有发送测试邮件或创建测试账号。

Production 尚未就绪：Vercel Production 环境目前指向 Staging Supabase URL，Production `NEXT_PUBLIC_SITE_URL` 仍是 Staging 域名；未建立独立 Production Supabase/Storage/Secrets，未配置 Production 域名/DNS，也未进行 Production 部署。Supabase Free plan 项目创建因账号已达两个活动项目上限被拒；现有 `ourlittleage` 与 `mmwr-staging` 均未暂停。将 `Shauntok's Org` 升级到 Pro 或另建付费组织均会产生费用，已在 MASTER_PLAN 记录官方计费估算；需 Owner 选组织并确认费用后才能创建 Production。Phase 7 独立 R2 加密备份、完整非空 DB+Storage 隔离恢复、恢复元数据与权限验收、RPO/RTO 及密钥保管规则均未通过；法务审阅、公开索引 SEO、GSC/Bing 所有权与上线后的运维演练也未完成。所有高风险运行开关仍 OFF。正式环境和 DNS 切流须在这些门槛通过后逐步由用户确认。

更早的本地架构与 Phase 3 细节仍保留在下方历史记录中；不得把历史的“未连接托管服务”描述当作当前状态。详情见 [`PHASE3_EXIT_AUDIT.md`](docs/operations/PHASE3_EXIT_AUDIT.md) 与 [`PHASE7_STAGING_ACCEPTANCE.md`](docs/operations/PHASE7_STAGING_ACCEPTANCE.md)。

建设 **MMWR / Malaysia Most Wanted Ranking**（中文展示名：**马来西亚人渣排行榜**）的三语社区网站。用户可阅读经过人工审核公开的投稿；投稿入口当前保持关闭，未来开放后须先验证邮箱；Owner/Admin 在独立后台审核、管理内容与风险。项目涉及真实人物与企业的负面投稿，准确性、隐私、证据隔离、申诉/更正/撤下与审计能力必须先于增长功能。

默认技术方向：**Next.js + Supabase + Vercel**。V1 投稿附件放 Supabase Storage；Cloudflare R2 用于独立异地备份，不作为 V1 前台附件主存储。没有目标仓库时，先做现状盘点和技术决策记录，再提出待用户选择事项；不要虚构当前代码状态。

## 2. 交付与执行规则

1. 实现前检查仓库和 `AGENTS.md`，绘制当前模块与部署状态；识别“小时代”仓库/代码所在位置。未找到旧项目时，把迁移项标成“待提供源仓库”，继续独立实现不依赖旧代码的部分。
2. 先交付可运行的 Development，再 Staging，再 Production。三套环境的数据库、密钥、Storage、域名、分析数据彼此隔离。
3. `MASTER_PLAN.md` 是实施顺序和 Launch Checklist 的权威来源；`USER_MANUAL.md` 是设计目标操作手册，功能上线后须按实机行为校准。完成时更新这两份及 HANDOFF 中状态。
4. Security 与 SEO 都是上线门槛。不可用“已写代码”冒充“配置完成”“Production 验证完成”。
5. 所有第三方配置由 Codex 在代码、配置清单、验证步骤都准备好之后，**逐步带用户本人完成**。一次只指导当前服务并等用户确认，再进入下一服务。流程至少覆盖 GitHub → Supabase → Vercel → SMTP → Cloudflare/R2 → GA4 → Search Console/Bing → Domain/DNS → Production 验证。不可要求用户在聊天中贴出 Secret；用平台 Secret Manager。
6. 不自动发布/切换 Production、不伪造注册账户或 DNS 等外部验证。Codex 完成实现、文档和本地门槛后，停下来说明可检查结果与下一步配置。
7. “小时代”仅选择性迁移。先做功能/安全/依赖/数据模型评估，记录可复用、不适用、重写、待确认；不得整包复制，不得因此削弱本文件规则。

### 历史本地验证快照（2026-10-05）

当前工作树最新全量 `npm run test:local` 通过：所有 Node 测试组通过，真实 ClamAV 两项按默认设置跳过；默认关闭的本地 thumbnail / Storage 冒烟也按 opt-in 规则跳过；pgTAP **26 个文件 / 644 项断言通过**，DB lint 无 schema errors。TypeScript、ESLint、`git diff --check` 和隔离生产构建均通过；104 个磁盘迁移与本地 migration ledger 对齐至 `20261005160001`；八个 `private.runtime_flags` 均为 false。夹具在事务中回滚；未连接托管 Supabase、SMTP、Vercel Staging 或 Production，也未发送邮件或运行备份 Worker。近期还修正了 `/robots.txt` 指向失效 sitemap 的问题，并将公开 sitemap 改为按请求生成的索引与分片；生产预览仅验证索引门关闭时的 fail-closed 状态，开启门的公开投影仍待 Staging 验收。社交链接校验拒绝 URL credentials、百分号编码 authority 与格式错误的 DNS 标签。修复了 `/account` 与 `/account/verify` 两个邮件重发入口漏传 Turnstile Site Key 的问题，新增 3 项属性回归测试覆盖页面属性和站点密钥规范化，另有 16 项 Server Action 流程测试覆盖 CAPTCHA、当前会话身份、active/verified 状态、限额与错误最小化；隔离生产构建中未配置 Site Key 的 `/zh-cn/account/verify` 返回 200，显示关闭提示并禁用重发按钮。页面交互、无障碍与 Phase 3 UI 仍待用户验收。详情见 [`PHASE3_EXIT_AUDIT.md`](docs/operations/PHASE3_EXIT_AUDIT.md)。

2026-10-05 回滚文件覆盖审计：101 个当前迁移文件均在 `docs/operations/` 的迁移恢复指南中被逐名覆盖；新增 [`INITIAL_MIGRATION_ROLLBACK.md`](docs/operations/INITIAL_MIGRATION_ROLLBACK.md) 记录 22 个先前未纳入后期 Phase 3/5/7 指南的早期迁移。此为静态文件名检查，不是数据库回滚演练；Staging / Production 未查询或更改。

2026-10-05 Phase 7 备份导出续进：由于 Supabase CLI 会过滤 Auth/Storage 的迁移账本数据，导出器新增仅限 `auth.schema_migrations`、`storage.migrations` 的 `pg_dump` 并合并到各自数据文件。PostgreSQL 17.6 本地只读核对及隔离表恢复均得到 82/73 行；备份专项测试 14/14 通过。全量数据库恢复尚未通过：`pg_cron` 约束目标库，单独 Postgres 容器不具备完整 Supabase 平台角色；需完整隔离 Supabase 栈重试。没有触碰托管环境、R2 或业务数据；备份 Worker 与运行开关保持 OFF。完整恢复预检生成的本地明文 SQL 导出仍在操作系统临时目录，因为本机策略拒绝删除；准确路径只在本次任务回复中提供，处理前勿分享该目录内容。

2026-10-05 Phase 7 主数据去重与隔离恢复：`data.sql` 现仅导出 `public,private`，避免 Auth/Storage 与独立组件重复；新增参数回归由 14/14 备份测试覆盖。第二套隔离本地 Supabase 2.118.0 / PostgreSQL 17.6 栈接受应用 schema/data、Auth/Storage data、migration history 与补充 managed ledgers；108 个 COPY 表、447 行全部与导出计数一致，Auth/Storage migration ledger 为 82/73，应用 70 张表全启用 RLS，Auth/Storage 服务重启健康检查均为 HTTP 200。隔离栈已停止并清掉专属 Docker volume。此证据不包含真实 Worker/R2 加密备份恢复、Storage 二进制对象、跨版本兼容、实际登录或应用授权；Phase 7 继续未完成且所有备份门保持 OFF。

2026-10-05 Phase 7 Storage 恢复组件：新增 `backup/restore-storage.mjs` 和 Supabase 目标适配器 `backup/supabase-storage-target.mjs`。恢复要求显式 isolated、project ref 与来源不同；写入前复核明文文件大小/hash、对象路径和目标桶清单，只接受缺失或配置一致且为空的目标桶。创建桶沿用 public/MIME/size policy，上传禁止覆盖，逐件下载回核 SHA-256/字节数；适配器递归分页列举对象、限制上传大小，并不暴露 service key。失败不会自动删除目标内容，会提示可能处于部分恢复状态。7 项注入式测试覆盖恢复预检、分页、策略、no-upsert 和回读；`npm run test:local` 全通过（26 个 pgTAP 文件 / 637 条断言、数据库 lint 无 schema 错误），lint、TypeScript 与 diff 检查通过。测试没有连接 Supabase Storage；真实对象解密/上传与数据库+Storage 联合恢复仍未演练，本模块不能视作恢复通过，备份、R2 与恢复门仍关闭。

2026-10-05 Phase 7 Storage 恢复组件补充：此前记录的“没有实际 Supabase Storage target adapter / 未连接 Storage”已由本轮更新；现已增加目标适配器与 project ref 绑定。8 项注入式测试通过，显式 opt-in 的本地 Storage API 冒烟测试成功创建并清理唯一合成私有桶，验证上传、嵌套列举和回读摘要。完整恢复预检在当前开发 Storage 发现清单外已有桶，按安全规则零写入拒绝。尚无空白隔离目标上的 Storage 恢复和 DB+Storage 联合演练，Phase 7 仍未通过；备份、R2 与恢复门保持关闭。

2026-10-05 Phase 7 加密对象恢复流程：补上 `backup/restore-storage-run.mjs`，从标记为 succeeded 且 integrity-verified 的备份摘要读取加密 manifest 和 Storage 对象；先比对对象存储 SHA-256/字节数、再验证 AES-GCM，所有 Storage 对象均解密并核对 manifest 后，才调用隔离目标恢复组件。数据库恢复尚未接入。新增 4 项合成密文测试覆盖成功恢复、run/目标保护、密文篡改和 manifest GCM 篡改；当前开发 Storage 含清单外已有桶，完整恢复仍在写入前安全拒绝。测试没有访问 R2，未执行空白 Supabase 项目恢复；Phase 7 继续未完成、运行门保持关闭。

2026-10-05 Phase 7 独立 Storage 恢复演练：在独立临时 Supabase 栈中使用合成密钥、合成加密 manifest/Storage 对象与注入的对象存储，真实完成 manifest GCM 验证、对象解密、私有桶创建、对象上传、嵌套列举和字节回读；测试清理已确认桶/对象不存在，之后独立容器与专属数据卷已停止/移除。此为 Storage-only 演练，不含真实 R2、数据库恢复、实际备份快照一致性或 DB+Storage 协同；Phase 7 仍未通过。自动审查以策略拦截了临时配置/log 目录删除；该唯一 `mmwr-phase7-restore-*` 目录仍在系统 `%TEMP%`，待后续人工清理。

2026-10-05 GitHub 依赖更新准备：新增 `.github/dependabot.yml`，配置每周检查根目录 npm 与 GitHub Actions 更新、各自最多 5 个开放 PR。该配置目前只在本地工作树；须推送到仓库默认分支并由 GitHub 读取后，才能确认托管 Dependabot 是否开始工作。CI 也仍未在 GitHub 上执行。

2026-10-05 搜索排序本地回归：`supabase/tests/content_access.test.sql` 增加事务内精确标题匹配夹具与搜索排序断言；`npx supabase test db --local supabase/tests/content_access.test.sql` 82/82 通过，确认精确主名称在精确标题之前。现有精确别名、候选私密性和相似名称隔离也由既有断言覆盖。服务不可用状态已在开发预览实看；有真实返回数据时的浏览器键盘/建议交互、Staging 搜索密钥、限流代理来源和性能仍未验证。

2026-10-05 Phase 2 工作人员会话 claim 校验：`lib/admin/staff-session-claims.mjs` 将 AAL2/TOTP/user UUID/session UUID 结构判定从 Supabase RPC 包装器中抽出，新增两项 Node 回归并接入 `npm test`；旧模块不存在时新测试先因缺少 helper 失败，提取后 `npm run test:staff-session` 2/2 通过。登录 claim 错误时仍在任何 service-role RPC 前返回 `not_staff`。这不证明浏览器后台交互或 Staging 身份令牌行为；现有 15 分钟/8 小时数据库时限测试仍在 `staff_session_limits.test.sql`。

2026-10-05 Phase 2 工作人员心跳请求边界：抽出 `getStaffSessionRequestError` 纯 helper 并在 `/api/admin/staff-session-activity` 路由复用，拒绝缺失/不匹配 Origin、query、body、Content-Type 和非零 Content-Length；对应 Node 回归先因 helper 缺失失败，再补实现，`npm run test:staff-session-request` 3/3 通过，`npx tsc --noEmit` 与相关 ESLint 检查通过，并加入默认 `npm test`。这只验证请求信封策略，不代替浏览器会话续期与 Staging 验收。

## 3. 已确认产品决策

### 品牌、语言与视觉

- 所有语言下品牌名固定 **MMWR / Malaysia Most Wanted Ranking**；中文模式可显示「马来西亚人渣排行榜」。只翻译 UI，不翻译正式品牌名。
- UI：简体中文、English、Bahasa Melayu；正文允许自然混用中英马来语，不要求作者标注语言。V1 正文默认原文显示。
- 自动翻译架构可预留但 **默认 OFF**，不接付费翻译/AI API。
- 视觉配色以用户确认的参考图为准：Light 使用浅冰蓝画布、淡青网格、白色表面、青蓝强调和深海军蓝正文；Dark 使用深海军蓝画布、亮青强调和高对比浅色正文。两种主题共用布局与组件。用户手选优先于系统偏好，偏好保存在必要 Cookie。
- Logo 做完整标识（Symbol + MMWR + 中文名）和独立 Symbol；不直接用 Emoji/Lucide 代替品牌 Logo。Pin、Reaction 建立自有视觉语言。
- 主导航：首页、Latest、Hot、Tags、搜索、突出但克制的发布按钮、账号；汉堡菜单打开覆盖式左抽屉，包含地区、反馈/举报、我的投稿、VIP（默认隐藏或 Coming Soon）、语言、主题、规则与法律页。

### 18+、Cookie、账号

- 首次访问显示 18+ Gate；背后网站可隐约显示但全页 Blur/Dark Overlay。明确选择“已满 18 岁”后保存 30 天；选择未满 18 岁只显示“你无法访问本站”，不保存通过状态，每次重新进入都再次要求确认。
- 必要 Cookie（登录、年龄确认、语言、主题）不可关闭；Analytics 与 Advertising 可选。提供“接受全部 / 仅必要 / 自定义”，Footer 可再次打开设置。GA4/广告追踪须尊重用户选择。
- 账号为邮箱 + 密码，不接社交登录。为保留未验证用户仍可登录、看完整正文、使用 Reaction 的决定，Supabase Auth 原生邮箱确认必须关闭；MMWR 用自己的单次验证链接管理 `submission_email_verified_at`，每个链接 30 分钟有效、仅可使用一次、每小时最多申请 3 次。投稿数据库入口只检查 MMWR 的验证标记，不能检查 Supabase Auth 的原生确认字段。邮箱通过服务端 SMTP 发送；邮件链接放在 URL fragment，打开链接后须用户主动按确认。SMTP 未配置时不能假报发送成功。
- 注册必须设置全站唯一用户名，之后允许更改；后台保留旧名、新名与更改时间。系统生成默认头像；V1 不开放更换/上传头像。没有公开个人主页、不搜索用户、帖子不显示投稿者用户名/头像。未来评论若开启，才在评论身份中显示用户名与头像。
- 申请删除账号即暂停普通使用，进入 7 天冷静期；只能使用“取消删除”入口，期间可取消。到期仅在 Storage 中没有用户所有对象、没有用户 UUID 上传路径对象、且没有其证据元数据时尝试删除 Auth 账号；若存在任意对象/元数据或 Auth 删除失败，则保持账号受限并转入 Owner 人工审核，不自动删除/转移证据。两个应用开关与数据库开关都默认 OFF。已公开帖子保留但解除前台与投稿账号关联；用户若要求处理已公开内容，因申诉、更正与撤下渠道尚未开放，不得引导其提交请求或将通用 Telegram 分享草稿描述成官方收件渠道。向用户清楚提示当前渠道未开放。

### 前台内容、地区、地图、列表

- 首页顺序：互动马来西亚地图 → Latest 最新 8 篇（View All 进 `/latest`）→ Hot Ranked 8 篇（View All 进 `/hot`）→ 12 个 Smart Mix Tags（含公开帖数量、查看更多）→ 广告/其他模块（广告默认关闭）。
- 所有主列表 `/latest`、`/hot`、City、Tag 每页 12 篇，桌面与手机一行两卡、六行；默认最新排序的页面为 Latest/City/Tag。Hot 使用热度排序。
- 每个帖子卡片统一自适应媒体拼贴：1 图铺满、2 图双格、3+ 显示前 3 图，第 3 张右下角 `+N`；少图不得留空或崩版。所有列表卡片同一组件。缺少已扫描通过的图片仅产生普通审核提示，不阻断投稿。标题/对象名下方为轻量地区、3–5 行摘要、Tag；底部阅读数、Reaction 数、相对发布时间。超过 30 天显示具体日期。
- 详情顺序：标题 → 单一主对象名 → 地区/时间/阅读量 → 图片证据 → 正文 → Tag → Reaction。详情只显示一个主名称，别名/店名/网名保留后台和搜索索引，不堆在前台。
- 首页地图保留现有交互式州界示意浏览；首页按州计数清单及直达地区页的调整暂缓，等待地区浏览页验收后再继续决定。
- 首页地图保留 Malaysia 互动浏览且始终只显示州属轮廓；按用户 2026-10-04 决定，Putrajaya 不再单独显示，合入 Kuala Lumpur 地图和公开州级数据范围，原私有区域 ID/帖子关系不改写。geoBoundaries 固定版 159 个 District 边界仅在地区浏览页选中州属后显示；目录/合并迁移已应用本地，公开 District 计数、Pin 和最多 3 条最新 District 帖子预览均已实现。当前没有真实公开帖子可供 Pin/预览目视验收；地区 UI 验收和 Staging 验证仍未完成。首页帖子计数清单与直达调整暂缓。
- State 底图仍是 2019 概略州界；District 线来自 geoBoundaries 2020 ADM2 CC BY 3.0 固定文件，边界只供浏览示意。ADM2 源文件含 159 个要素而元数据报 160，缺少的是 Putrajaya 独立 District 几何；现有 Putrajaya ADM1 州界轮廓仍包含在 Kuala Lumpur 组合图形里；Tangkak/Ledang 名称已标准化。MyGeoportal 官方候选几何仍未导入，覆盖完整性和再发布许可未确认。来源记录见 [`docs/geo-boundary-source-review.md`](docs/geo-boundary-source-review.md) 与 [`public/maps/ATTRIBUTION.md`](public/maps/ATTRIBUTION.md)。
- 放大地图后的平移应支持鼠标、触控笔和单指触屏拖动，沿水平/垂直任一方向均可；指针捕获保证拖出 SVG 边缘后仍连续。处于完整地图、默认缩放时，触屏页面滚动保持正常。该交互已写入本地代码，尚未作触屏实测。
- 首页 Tag 固定展示 12 个，默认 Smart Mix（大/小、近期活跃/低曝光混排且稳定；不是每次刷新乱跳），后台可切换 Manual / Most Posts / Smart Mix，可 Pin/手排或一键数量排序。
- `/tags` 顶部为可拖动、惯性旋转、静止时缓慢自转的 3D Tag 球。每次进入/刷新重抽 30–50 个 Smart Mix 标签，字体大小体现公开帖数量；不显示方向按钮，支持鼠标/触屏拖动，尊重系统“减少动态效果”设置；可展开所有标签，按名称排序并实时过滤搜索。SVG 网格路径使用固定坐标精度，避免 SSR 与浏览器浮点序列化差异造成首屏 hydration mismatch；本机普通与 30 标签预览复验无 issue。Tag V1 平铺单层，可多 Tag/篇，不限数量，由审核团队决定；无自定义颜色/图标。
- District 与 Tag 页默认最新发布；District 页不再附加 Tag 筛选器，Tag 分类通过独立 Tags 入口进行。

### 搜索、阅读墙、证据、投稿

- 搜索可借鉴小时代现有引擎并改进，强调准确而不是把相似姓名当成同一人。匹配权重：主名称精确 > 别名精确 > 相似名称 > 标题/正文；结果默认最新优先。支持主名/别名/网名/店名/社交账号、标题正文、State/City、Tag。
- 输入时显示实时 Autocomplete（对象名/标题/地区/小缩略图；优先第一张公开证据图，无公开图用默认图）；结果页单独显示最多 5 个“猜你想找/相似名称”，需用户确认，不混淆对象。所有搜索/autocomplete/推荐只读已审核且当前公开内容。
- 外部 Google/Bing 索引公开帖子。访客进入详情页看到标题、主名、地区、公开证据缩略图及正文前约 5 行；之后 Blur + 登录继续阅读墙。登录/注册后安全返回同帖原阅读位置。验证邮箱不是阅读门槛。
- SEO 可索引正文的处理须符合搜索引擎对注册限制内容的标记要求；不得 cloaking、不得给爬虫伪造不同文本、不得堆砌词语。全篇受限正文标明注册墙/结构化数据。若无法满足搜索平台规范，先调整公开预览与索引范围并记录决策。
- 未登录者只可看证据缩略图；点大图/PDF/录音提示登录。已登录可看公开证据原件/Lightbox/PDF/音频，并下载有 MMWR 水印副本。影片 V1 不开放。所有上传需 MIME/文件签名/扩展名白名单、大小及数量可配置、恶意文件扫描/隔离。附件存 Supabase Storage；公开证据与内部证据分开私有策略，不可猜路径访问。
- 附件初始为“准备公开”。Admin 与 Owner 可查看内部证据，查看动作记 Audit Log；只有 Owner 可切换公开/仅内部。内部证据永不被前台、搜索、SEO、分享图、Analytics 导出读取。
- 投稿为单页分区完整表单、无 V1 草稿/自动保存（以后可参考小时代）。对象资料、地区、正文、社交资料、附件、补充说明、预览、最终检查和确认。地区必填；支持图片/录音/PDF/白名单文件，视频关闭。正文不设人为字数上限，附件实际限制需防滥用且 Owner 可调。缺少已扫描通过的图片仅标记普通风险，不阻断投稿、不判断证据真伪。`/submit` 目前只提供用户确认的不可提交 UI 草稿：数据只在当前页面内存、不自动保存/上传/提交，禁止输入真实资料。
- 标题和社交账号为选填；表单用易懂提示鼓励填写。没有标题时以对象名称作为主要标题。没有已扫描通过图片时显示普通审核提示，不能单独据此判假或阻止提交。
- 同一对象的多次投稿仍是独立帖子；后台可由人工关联，避免系统把同名对象自动合并。公开对象档案页尚未定案。
- 限制陌生 URL/可点击链接；允许的社交链接使用 Owner 可维护的域名白名单（如 Facebook、TikTok、Instagram、Telegram）。提交前预览 + 最终检查弹窗；用户勾选柔和声明“内容基于其所知/亲历/证据”，保存条款版本、时间、账号及必要审计信息。前台说明团队可能整理标题/Tag/排版，不改核心事实和证据含义。

### 审核、处罚、通知、内容保障

- 用户提交后进入机器字眼/内容风险扫描，扫描只辅助人工、不拦投稿、不判断真假。重复/Spam、威胁/辱骂、未成年人、个人敏感信息、诈骗话术、外链等作为内部风险信号。借鉴小时代词库/检测机制，Owner 可维护规则。
- 普通投稿 Admin 可编辑标题、Tag、排版和中性措辞后批准发布；不可擅改核心事实、金额、日期、人物关系、证据含义。原文/版本、编辑者、原因和时间完整留存。
- “我的投稿”显示待审核、审核中、需要补充资料、已批准、已拒绝、已发布、修改申请审核中等状态。补资料时，投稿者只能追加说明和证据，不能改已提交的对象名、地区、正文等字段；拒绝时显示具体原因和后台补充说明。投稿状态变化 V1 不发邮件。
- 公开后作者只能提交修改申请和理由，由 Admin/Owner 审核后更新。Admin 不可直接永久删除公开帖子，只能提交删除建议，由 Owner 批准或驳回。
- 高风险命中必须 Owner 审核才能发布。高风险红标永久只在后台显示；前台只按事实显示“资料有限/尚未充分验证/内容正在复核”等合适状态，不公开内部风险标签。公开后新举报/新风险只触发后台复核通知，默认不自动下架。
- Owner 有 Emergency Hide：立刻从所有公开列表、搜索、autocomplete、Tag/City/Hot/Latest、sitemap 移除；原 URL 显示中性“此内容目前暂时不可查看”；加 noindex。后台证据和版本均保留。Owner 恢复后以“重新上架”标记永久显示，当天视为重新发布参与 Latest/Hot，并恢复索引；保留原首次发布时间与全程审计。Owner 永久删除后前台完全消失，URL 跳首页，站内和外部索引移除；后台原文/证据/IP/审查记录按 1 年保留策略期满清理。
- 涉及真实人物的发布必须具备来源/证据审查、隐私最小化、未经证实指控的中性表述、申诉/更正/下架通道、纠错记录、法律升级流程；禁止曝光住址、身份证、未成年人身份或无关第三方个人资料。自动检测不替代事实核验。上线前 Legal 文本由马来西亚律师审阅。
- 独立反馈/举报中心（不在帖子卡片旁边）。需登录。可举报帖子（搜索并选择帖子）、提交反馈/建议；网站保存账号、帖子、理由、内容、时间及后续内部记录，然后打开 Telegram 并填好草稿，用户自己确认发送。V1 只记录，不做复杂工单流。借鉴小时代的反馈模块。
- 评论系统可参考小时代并预留完整底层结构，但全站 V1 默认关闭；未来 VIP 讨论区可复用该基础。预建评论能力不代表首发开放评论。
- 处罚：Admin 可警告、暂停投稿、临时暂停账号；Owner 另可永久封禁和 IP 封锁。临时选项 1/3/7/30 天或自定义，到期自动解除；暂停账号仍可登录、阅读完整内容，但不能投稿或 Reaction。永久封禁者不能登录，提示封禁；申诉、更正与撤下入口按用户决定保持关闭，等待政策确认。理由、执行者、时间、解封及所有动作进 Audit Log。
- Admin/Owner 有统一综合后台首页，第一排：待审核、高风险、今日发布、今日访问；还含举报、热门、Storage、操作记录等。Widgets 按角色提供、布局可拖拽/保存。Admin 与 Owner 可自定义；Owner 可一键把所有 Admin 布局恢复官方默认版本，但不影响 Owner 自己。内部通知中心分普通/重要/紧急，生命周期未读→已读→处理中→已处理，历史保留 90 天；Audit Log 按独立保留策略。

### Reaction、分享、热度、广告与分析

- Reaction 每用户每帖仅 1 个，可更换/取消。尽量使用 MMWR 自定义图标；Owner 可用内置库或上传 SVG/PNG，强制 1:1 统一显示尺寸，可增删排序。
- 阅读量每次实际页面刷新 +1 的需求；但公开有效阅读、原始事件和风控过滤分别建模，识别明显 Bot/脚本/恶意重复时，从公开数与 Hot 计数扣除。原始数据不得泄露个人 IP。有效阅读最低门槛默认 100、Owner 可调。Hot Score 综合 1h + 6h + 24h；公开热榜自然排序与付费/人工置顶分离。
- Owner 可开 Featured/Boost Session，时长由数小时至最多 48 小时，默认 OFF；必须标识赞助/置顶影响，不篡改自然 Hot Score，并记录操作者、付款/商业关联、起止、展示和到期审计。
- 分享入口考虑 WhatsApp、Telegram、Facebook、Messenger、Instagram、TikTok、X、Threads、Snapchat、WeChat；手机支持系统 Share Sheet、复制链接、下载图片、QR。A 图片主视觉模板优先，条件不满足回退文字模板，可调整；Story 9:16 与 Post 4:5 两种；内容限标题、对象名称、地区、公开正文前 5 行、MMWR 标识、域名/QR。不得包含内部证据/后台资料。追踪分享来源与回流访问。

### 当前详情分享增量（2026-09-29）

详情页本地现提供复制链接、可用时的系统 Share Sheet，以及 WhatsApp、Telegram、Facebook、X 直接分享入口。分享文本限定为批准标题、公开主名称、地区和最多 400 字符公开摘要；链接不带查询/片段或追踪参数。外站链接以新标签打开并设置 `noopener noreferrer`。二维码由本站前端本地生成，可显示并下载 SVG，不把帖子链接发送给外部 QR 服务。另新增 4:5 帖子卡片及 9:16 Story 图片生成：图片只包含已批准标题、公开主名称、地区、最多 400 字符公开摘要、站点域名和二维码；可下载 PNG，并在浏览器支持时交由系统分享。分享链接优先采用合法 HTTPS `NEXT_PUBLIC_SITE_URL`；没有有效公开 HTTPS 地址（如 localhost、私有地址或 HTTP 预览）时会明确提示，并停用外部分享、QR 与图片生成功能，避免把不可访问的地址打包进素材。Messenger、Instagram、TikTok、Threads、Snapchat、WeChat 依赖系统分享菜单或复制链接，暂未独立适配；Campaign 分享点击/回流统计仍未完成。分享代码和三语文案尚未进行构建、浏览器或平台端验证；不能视为上线或分享分析已完成。

### Tags 球无障碍增量（2026-09-29）

`/tags` 球体新增四个中文、英文、马来文可访问名称的方向控制按钮；键盘用户可旋转球体并选取公开标签，完整列表仍提供不依赖 3D 的检索和导航。随机选取 30–50 项采用 partial Fisher–Yates 均匀抽样，球体渲染直接使用选中记录，避免重复查找。检测到系统 `prefers-reduced-motion: reduce` 时暂停自动旋转，设置变化时即时响应；全站导航、按钮、页面和地图的 CSS 动画/过渡也会在减少动态效果偏好下停用。尚未进行键盘/读屏实测、构建或浏览器验证。

### 登录墙续读本地增量（2026-09-29）

详情登录/注册点击前，把当前 `scrollY` 与时间戳暂存于当前浏览器标签的 sessionStorage。认证回到相同帖子、正文已由服务端授权且地址含 `#full-content` 时，最多恢复一次并立刻删除存储；超过 10 分钟、数值无效或 Storage 不可用时不恢复。不上传阅读位置、不跨标签/设备同步。代码尚未经 Auth/Supabase 联调、浏览器或自动化验证。

### 已保存语言的首屏增量（2026-09-29）

全站页面 URL 现由 Proxy 规范化为 `/en/...`、`/zh-cn/...`、`/ms/...`，服务器内部 rewrite 保留现有页面模块。根 `/` 会按已保存偏好、浏览器首选支持语言、English 默认的顺序跳转。路径 locale 决定页面语言、`<html lang>` 和页面 metadata，并同步保存 Cookie；locale-aware Next links 和语言切换保留当前路径及 query/hash。API、静态文件、Next.js 内部资源和邮箱认证 callback 不加 locale 前缀。过往无前缀页面 URL 兼容跳转至对应 locale 地址。该变更只建立 UI 语言 URL，不会翻译用户帖文。

2026-09-30 SEO 局部修正：根布局默认 `noindex, nofollow`；未声明 robots 的新路由也默认 noindex。`/` 按已保存偏好、浏览器首选支持语言、English 默认的顺序跳转到 `/en`、`/zh-cn` 或 `/ms`。全部页面路径有 locale URL，并由 Proxy 在内部 rewrite；首页路径以 URL 决定首屏语言，在 Production 索引门槛打开时生成各自 canonical/hreflang，sitemap 仍只列三个首页 URL。帖子详情与其他页面继续 noindex，文章 canonical/Open Graph 采用对应 locale URL。locale 前缀下的后台、账号、投稿等敏感路径也进入 robots 限制；robots 还屏蔽 `/api` 与精确 `/auth` 路径。此规则只约束爬虫，不替代 API 授权；API 仍由服务端权限和 `X-Robots-Tag` 保护。`npx tsc --noEmit`、定向 ESLint、`git diff --check` 通过；尚未验证实际 SSR head、浏览器切换或爬虫输出；索引开关仍默认关闭，SEO Launch Gate 未通过。

同日逐项清点页面 metadata：除三个 locale 首页按环境门槛决定索引外，其他页面显式 noindex，帖子详情由动态 metadata 控制；sitemap 仅包含三个 locale 首页，robots 抓取仍受同一 Production 门槛控制。静态清点未发现漏标路由，但未检查浏览器渲染后的 `<head>`。全站 locale URL 与导航保留已在本地实现。2026-09-30 修正了 Proxy 内部 rewrite 二次运行时把 locale 子页重定向回自身的问题；本地 HTTP 检查 `/zh-cn/submit`、`/en/hot` 和 `/submit` 的最终状态均为 200。生产构建、全仓 ESLint 通过；仍未检查浏览器渲染后的 `<head>`、搜索引擎爬虫或完成 locale SEO 验证。

三语 URL 迁移方案与当前完成边界记录于 [`docs/architecture/PHASE6_LOCALE_ROUTING.md`](docs/architecture/PHASE6_LOCALE_ROUTING.md)。

### 公开浏览页三语 metadata（2026-09-30）

Latest、Hot、地区、Tag 目录/详情、搜索页依据受信任的 locale 路径输出三语 title、description、Open Graph 和 Twitter metadata。仅当可信 Production HTTPS origin 与 `ALLOW_SEARCH_INDEXING=true` gate 同时有效时生成 absolute canonical/OG URL，避免 Preview 指向 localhost；分页页面的 canonical 保留有效页码，地区页只保留白名单州名及 UUID 格式 City ID。相关页面继续 `noindex,nofollow`，sitemap 仍只有经 Production gate 控制的三个首页地址。没有给用户提交的内容添加 Article/NewsArticle 结构化标签。`npx tsc --noEmit`、定向 ESLint 与 `git diff --check` 通过；未运行构建、自动化测试、浏览器、SSR head 或爬虫验证。
- 自建 First-party Analytics + GA4 双轨。自建是 Campaign 商业数据主来源，GA4 作趋势/交叉验证；定义需区分。记录访问、去重访客、Page Views、Session、阅读/有效阅读、来源、设备、粗粒度地区、搜索、Tag/City 热度、分享平台/回流、广告展示/可视展示/点击/CTR。页面加载刷新事件和 Campaign 事件按可审计定义防刷；展示 viewability 定义为广告至少 50% 可见持续 1 秒。不得公开个人 IP。
- 分析后台支持 7/30/90 日/自定义区间、环比、同比、Top Posts、来源、分享、地区与趋势。原始细粒度事件按配置短周期保留，日/月聚合长期保留；与内容/IP/证据 1 年保存完全分开。
- Owner 可自定义 Analytics Dashboard。Admin 能看运营指标（Top Posts、来源、分享、地区、搜索/设备/流量趋势），不能读客户资料、报价、预算、收入、收费方式、商业金额。数据权限须在 API/RLS 保障，不只是隐藏 UI。
- 广告管理是轻量客户档案 + Campaign：客户资料、报价、预算、日期、投放位/素材、状态（询价→已报价→已确认→排期→投放→结束/取消）、表现/报告；Flat Fee、CPM、CPC 均支持。仅 Owner 可见商业数据。无广告商登录门户（默认关闭/不做 V1）。报告按客户/广告位/日期生成，PDF + Excel/CSV；可选择品牌版或白牌版。只输出适合客户的 Campaign 指标。
- 广告位预留 Navbar 下、地图下、Grid 横跨整行/双卡、侧边、帖子正文中；**全部默认 OFF**。关闭时不留空框。素材/广告显示清楚标“广告 / Sponsored”，样式与自然帖子区分。借鉴小时代后台开关/排期/展示逻辑，前台卡片依本项目设计。追踪须服从广告 Cookie Consent。
- VIP 未来方向为按月订阅并保留 VIP 讨论区概念；首发仅可留隐藏入口/基础结构，不实现订阅收费或讨论区。VIP 是否免广告、价格、权益和支付方式未定。

## 4. 默认 OFF / 不属于首发

| 功能 | V1 默认状态 | 说明 |
|---|---|---|
| 所有广告位、广告展示与广告追踪 | OFF | 能力与后台配置可完成；Owner 显式启用后才投放 |
| 帖子自动翻译/AI 正文翻译 | OFF | 不接付费 API |
| VIP、评论、其它付费互动 | OFF/隐藏 | 可预留入口，不可做成已上线承诺 |
| 广告商自助 Portal | OFF/不做 V1 | 报告由 Owner 导出 |
| 视频上传 | OFF | 图片/音频/PDF/白名单文档可用 |
| 投稿草稿/自动保存 | OFF | 以后参考小时代实现 |
| Featured/Boost Session | OFF | Owner 手动开启，最多 48 小时 |
| 非必要 Analytics/Advertising Cookie | 默认拒绝直至同意 | 用户可自定义或仅必要 |
| Dev/Staging 被搜索引擎索引 | OFF | noindex 且尽可能访问控制 |

**不得关闭的基础保护**：RLS/服务端授权、Owner/Admin 强制 TOTP 2FA、Turnstile/风控入口、速率限制、私有内部证据、审计日志、安全 Headers、备份校验、年龄门、Consent 管理。未配置生产密钥时应 fail closed 或只在 Development 明确提示，绝不以关闭保护换可用。

## 5. 安全与 SEO 硬门槛

- Supabase 所有表启用 RLS，按 user/role/data scope 验证；Service Role 只在可信服务端。Owner/Admin 必须 TOTP 2FA + 离线一次性恢复码；未完成 2FA 不能进入正式后台。短后台 Session、敏感动作重新验证、登录/2FA 失败限速、异常登录记录。
- Turnstile 放注册、异常登录、最终投稿、举报反馈等入口；配合 IP/账号/设备行为 rate limits、重复内容检测、spam bot 对策、WAF 和异常 UA/爬虫治理。避免正常搜索引擎被无差别拦截；内部/登录内容不暴露 AI 抓取。
- CSP、安全 Headers、CSRF/XSS/SQLi/开放重定向防护、输入/输出编码、安全文件下载、私有 Storage + 短期签名 URL、MIME/魔数双验证、恶意文件扫描、敏感信息清理。所有 Secret 只进 Vercel/Supabase 等服务器端环境变量。
- Admin Audit Log 不可由一般 Admin 删除/篡改。Owner 高危动作记原因、操作者、时间、对象与前后状态。紧急隐藏入口可用且演练过；攻击与泄露响应流程明确。
- Backups：数据库 + Supabase Storage 全量；每日凌晨自动任务 + Owner 手动一键；独立 Cloudflare R2；保留最近 7 天每日、最近 4 周每周、最近 6 个月每月；展示时间/大小/状态/完整性；失败和校验异常进入紧急通知并邮件提醒 Owner。必须演练恢复，而非只验证“上传成功”。
- 邮件：SMTP 用于验证、密码重置等账号必要信件；V1 投稿状态不发邮件。Critical Security 邮件的预留类别包括达到阈值的工作人员恢复码连续失败、备份失败/校验失败及严重 Production 异常。恢复码失败是唯一的异常登录邮件来源；本地备份 run ledger 在首次失败时按固定代码将普通失败 `backup_failed` 映射为固定 Owner 邮件 `backup_failure`，只将密文摘要/字节、解密认证/预期明文摘要/大小或取回清单内容完整性证据失败 `backup_validation_failed` 映射为 `backup_validation_failure`。导出/API/网络/存储暂时错误、密钥配置错误与普通 OS I/O 仍属普通失败；邮件不含异常、manifest、path 或 key 数据。严重 Production 异常尚无事件生产者。邮件策略关闭与队列入队/领取和恢复码计数通过同一运行时开关行锁串行化；关闭时清除短期恢复码计数，但已返回运行中 dispatcher 的邮件无法撤回，立即切断还需停止 dispatcher。备份功能和 Critical Security Email 均未部署/验收且保持关闭；一般登录异常与后台通知只在站内。
- SEO：SSR/可抓取内容、翻译 UI hreflang、canonical、metadata、Open Graph、robots、动态 sitemap、公开 State/City/Tag 页面、文章结构化资料、注册墙标记、Core Web Vitals、图片优化、分页规范、删除/隐藏/恢复 noindex 和 sitemap 流程、GSC/Bing 验证。待审/拒绝/内部证据/账号/后台/历史版本永不公开索引。

### 安全审查与本地修复（2026-09-29）

Codex Security 对扫描快照完成并封存了一次**部分、离线源码审查**，记录 3 项中等风险：旧邮箱验证 token RPC 允许登录用户自行选定哈希；投稿页面虽关闭，数据库仍授权已验证用户直接调用投稿 RPC；搜索限流将未经信任配置的 `X-Forwarded-For` 首项作为客户端身份。投稿和邮箱问题仅在相应迁移已部署时可达；搜索身份绕过还取决于 Vercel/Cloudflare 入口是否保留攻击者提供的前缀。扫描没有覆盖全部 174 个文件，也未检查 Production、托管 Supabase、SMTP、WAF、备份或真实代理行为，不能作为全仓/上线安全通过证明。

本地新增迁移 `20260929140124_mmwr_security_default_off_email_verification.sql`：撤销旧的客户端 token 创建权限；新建只授予 `service_role` 的 token 创建路径，服务器生成随机 token，数据库按用户 ID 与当前 Auth 邮箱复核，并保留每小时 3 次、30 分钟有效、单次消费。投稿默认 OFF 现也由数据库执行：撤销创建/补充投稿资料/登记证据的客户端 RPC，并移除证据隔离桶的投稿人上传策略；只读投稿状态及工作人员审核功能不受此写入关闭影响。`app/account/actions.ts` 现在只由服务端 Supabase Secret Key 调用新建 RPC；绝不可将该 Secret Key 暴露到浏览器。Supabase 本地 Auth 的最低密码长度现与应用规则一致为 10 位；托管项目的密码长度/复杂度及泄露密码保护仍须用户在 Staging/Production 设置并验证。

2026-10-03 重新追踪完整迁移链：默认关闭迁移之后对 `private.create_submission` 的后续 `CREATE OR REPLACE` 保留撤权状态，未发现后续给 `authenticated` 重新授权的语句；公开包装 RPC 也继续无执行权。因此当前源码迁移链不支持已验证用户绕过 UI 写入投稿。2026-10-04 已将 `supabase/tests/content_access.test.sql` 调整为无创建/补充/证据登记执行权及 `42501` 拒绝预期，测试计划仍为 53；测试和数据库执行结果尚未验证。

搜索限流现在要求显式设置 `SEARCH_TRUSTED_CLIENT_IP_HEADER`，只接受 `x-vercel-forwarded-for`、`cf-connecting-ip` 或 `x-mmwr-client-ip`；未配置、无效或缺少地址时 fail closed，搜索显示不可用而不是取消限流。新环境变量保持未设置。必须在 Staging 验证所选代理确实覆盖/认证该头后再配置，并配合边缘限流。上述迁移尚未应用，代码和权限实际行为尚未在 Development/Staging/Production 验证；未完成全仓审查、RLS/MFA 审查、WAF、依赖漏洞扫描、恢复演练之前，Security Launch Gate 仍未通过。

之后的只读迁移清点中，31 个 public/private 表名均找到启用 RLS 的 SQL 声明，48 个 public 与 38 个 private 函数声明均能匹配到函数名级显式撤权语句。该脚本清点不能验证最终 ACL、策略条件、角色继承或实际 RLS 运行结果；没有执行 Supabase Advisor、SQL 或 pgTAP，不能据此宣布数据库权限审计通过。本地 `npx tsc --noEmit`、`npx eslint .` 和 `git diff --check` 均通过；未运行测试或构建。

2026-10-04 Phase 3 迁移文档历史快照核对（新增 IP 请求头更正前）：当时 47 个 `20260930`、`20261001` 与 `20261003` 范围文件全部列入迁移回滚清单；Staging 清单未逐项列出的三个 Analytics 文件 `20261001044447_exclude_submission_analytics_route.sql`、`20261001044906_valid_read_event_pipeline.sql`、`20261001050300_analytics_page_view_rate_limit_retention.sql` 属 Phase 5。空白 `20261001044205_owner_reaction_icons.sql` 后迁为 Phase 4 文件 `20261004150000_owner_reaction_icons.sql`。这段是历史快照；之后的 Phase 3 清单数已随 IP guard 更正和自我封锁 RPC 更正继续更新，见本文件后续记录。以上为静态文档核对，不代表 SQL、回滚或环境已验证。

2026-10-04 新增 [`docs/operations/PHASE3_EXIT_AUDIT.md`](docs/operations/PHASE3_EXIT_AUDIT.md)，按工作流区分本地实现、UI验收、数据库/浏览器验证与政策/第三方环境 gate，并固定“UI验收 → 本地验证 → 经授权的隔离 Staging → 按清单验收”的顺序。该审计是计划性整理，不是功能完成、测试通过或任何托管环境已验证的证明。

账号删除处理已按用户 2026-10-04 的决定在本地推进：七天到期后，仅在 Storage `owner_id`、UUID 路径及该用户证据元数据均无关联时尝试删除 Auth 账号；存在任何记录或 Auth 删除失败时，转入 `deletion_review_required`，保持账号限制和文件原状，由 Owner 只读队列显示用户名、申请时间和原因。Owner 尚无解除/删除操作；证据处理及留存政策仍待后续确认。`ACCOUNT_DELETION_ENABLED`、`ACCOUNT_DELETION_CLEANUP_ENABLED` 与数据库申请/清理开关都默认 OFF；迁移未应用，Worker 未运行、无定时任务，也未完成本地合成数据验证。详见 [`docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md`](docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md)。

**第二次静态安全审查（2026-10-03）：** Codex Security 对本地工作区快照封存了第二份**覆盖不完整的离线源码审查**：297 个文件中仅关闭了 5 个重点审查面，剩余仓库文件仍未审查；没有运行程序、测试、构建、网络请求或访问托管环境。记录 1 项中等风险、高置信的条件性发现：若启用 First-party Analytics、Valid Reads 与 Hot，访客可提交自行伪造的阅读秒数、滚动比例和去重 Token，影响有效阅读汇总与公开热榜；同源、同意证明、可信 IP、每 IP 限速、去重及默认关闭开关能限制影响，但不能证明阅读行为真实。相关采集和排名开关必须保持 OFF，修正并单独验收前不得启用。Staff/Auth 与证据扫描审查未确认低权限绕过；证据扫描结果 API 将专用 Worker Token 视为扫描器信任边界。备份重点审查另记录清单重复验证临时路径冲突和 Storage 下载无流式字节上限，均待 Phase 7 专门修正/验证；数据库导出器与 Worker 的组件契约缺口已在 Phase 7 设计文档明确记为 fail-closed 阻断。该报告不是全仓安全通过证明；安全上线门槛仍未通过。

## 6. 未决事项处理

具体国家/地区边界数据来源与许可、每类附件技术最大值、区域法律文本、真实域名、Telegram 客服目标、SMTP 服务、R2 区域/成本、IP/原始事件保存天数、GA4 consent mode 与指标口径等必须在仓库/服务配置可见后逐项明确。Owner/Admin 后台会话时限已由用户确认：15 分钟无操作、8 小时绝对上限，只限制工作人员后台，不缩短普通用户会话。永久移除后一年清理的法律保全/例外规则须由马来西亚律师审阅，且到期清理执行器尚未实现。Codex 不猜值；先给安全合理默认并把需要用户动作列入配置清单。影响责任/法律的决定需用户本人和马来西亚律师确认。

## 7. 当前实现状态（2026-09-28）

### 永久封禁登录反馈本地增量（2026-09-30）

登录凭据校验成功后若 Profile 为 `banned`，服务端会注销刚建立的会话并返回本地化封禁说明。申诉 Telegram 链接不再由环境变量控制；三语界面固定显示“申诉渠道尚未开放”，直到政策另行确认并修改实现。此项是最初的登录反馈进度；处罚面板及权限检查的后续本地增量详见本文件“Phase 3 账号处罚本地增量”。正式申诉处理保持关闭；有效会话撤销边界、Owner IP 封锁全入口覆盖与数据库/Staging 验证仍待完成。

新增迁移 `20260930065849_active_account_staff_access_guard.sql`，使共用数据库角色检查及后台身份发现只认可 `account_state = 'active'` 的工作人员。依赖 `private.has_staff_role` 的后台 RPC/RLS 在应用该迁移后会拒绝 suspended、banned、deletion_pending 账号，即使旧会话仍有效；迁移尚未应用或运行验证，不代表当前数据库已经生效。该变更不撤销 Auth 会话，也不替代处罚生命周期。

**Owner/Admin 后台会话时限本地增量（2026-10-01）：** 用户确认 15 分钟闲置 / 8 小时绝对上限，只作用于工作人员后台会话。迁移 `20261001051200_staff_session_limits.sql` 用 Auth `session_id` 绑定私有租约实现该边界；首次通过 AAL2 + TOTP 的 staff 活动开始计时，闲置/绝对过期对该 Auth session 为终态，JWT 刷新不能重启计时。`private.has_staff_role` 在 RPC/RLS 路径统一检查租约；Next Proxy 覆盖后台页面/Server Action，浏览器在可见后台页面收到真实指针、键盘、触摸或滚轮操作时，通过单次计时器续期（15 秒节流），无需等待 RPC；近期操作后的 PostgREST 请求仍先等待同源活动端点。隐藏页面、普通用户路线、自动刷新和无人操作的轮询不续期。错误 fail closed，不采集 IP/设备资料。过期只注销当前 Auth session 并显示本地化提示。相关代码与迁移仍为本地草稿，未运行 SQL、测试、浏览器或 Staging 验收；待用户先检查 UI 后开始验证。操作清单及回滚限制见 `docs/operations/PHASE3_STAGING_ACCEPTANCE.md` 与 `docs/operations/PHASE3_MIGRATION_ROLLBACK.md`。

**内部证据授权会话绑定（2026-10-01）：** 新前向迁移 `20261001055854_staff_evidence_session_binding.sql` 为一次性证据授权增加必填 Auth session FK（删除 session 时级联删除授权）；迁移失效化所有无法追溯签发 session 的旧短期授权，保留不可变访问审计。签发显式验证 AAL2/TOTP/session claim，依赖租约感知 staff helper，并在限流锁后重查；service-only 消费先记录一次性消费，再只读检查这个 session 仍属于 actor、其租约双时限及原有角色/账号/处罚、证据状态、Owner 高风险、开关和审计关联。其他活跃 session 不能代替签发 session；消费不调用 touch、不初始化/延长租约。浏览器响应和日志不新增 session ID/对象路径；`STAFF_EVIDENCE_PREVIEW_ENABLED` 和 `staff_evidence_preview` 保持默认 OFF。Phase 3 验收/回滚已同步；未执行 SQL、测试、构建、浏览器或外部环境操作，仍待 UI 检查后验证。

**Phase 3 用户手册政策一致性修正（2026-10-01）：** `USER_MANUAL.md` 明确投稿补充资料、公开内容更正/撤下及永久封禁申诉目前没有开放入口；不得把举报/反馈表单或 Telegram 分享草稿当作请求渠道。同时说明后台会话时限的活动判定，后台刷新/轮询不续期，过期只退出当前 Auth 会话。未新增请求资料收集。

### Phase 3 反馈/举报中心本地进度

已新增三语 `/report` 页面和导航抽屉入口。用户必须登录且账号为 active；举报时通过当前公开搜索建议查找并选择目标帖子，反馈则不关联帖子。服务端限制同源 JSON 请求、32 KiB 请求体、UUID/原因/说明长度；只有在有效登录、active 账号及 Turnstile `mmwr_report` 均通过后，才从已验证会话读取用户 ID，并通过 Secret Key 服务端客户端调用仅授予 `service_role` 的五参数写入 RPC。请求体不接受提交者 ID。数据库按账号串行计数，每账号每小时最多 5 条，举报目标必须仍然公开。32 KiB 总请求体仍受消息与 Turnstile 令牌字段上限约束，并容纳其多字节及 JSON 转义表示。私有 `private.user_reports` 启用 RLS 且撤销所有客户端直接权限；客户端不能读取或枚举举报记录。提交成功后显示参考编号，并可打开 Telegram 通用分享草稿（只带公开站点主页和参考号，草稿语言随 UI 语言变化；用户填写的举报内容不会预填或自动发送）。

迁移 `20260928133400_mmwr_feedback_reports.sql` 尚未应用，Supabase 未连接，真实持久化未验证。新增迁移 `20260928133500_mmwr_staff_report_review.sql` 与后台队列：只有经现有后台 gate 验证 2FA 的 Owner/Admin 能列出最多 50 条记录或修改为处理中/已处理/不采取行动；每次打开队列逐条写入审计，每次状态更改必须填写原因并写入状态前后值和操作者。列表 RPC 不返回投稿用户 UUID；私有记录和审计表均无客户端直读权限。两项迁移尚未应用，权限仍须 Staging 验证。报告/反馈表单已加入 Turnstile 客户端挑战和服务端 Siteverify 校验，并验证 `mmwr_report` action 与 `NEXT_PUBLIC_SITE_URL` 主机名；CSP 仅为挑战脚本和 iframe 开放 Cloudflare 域名。缺少 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` 或 HTTPS 站点地址时提交 fail closed。此外，登录、注册、密码重置也已接入 Turnstile，并分别校验 `mmwr_login`、`mmwr_signup`、`mmwr_password_reset` action。未配置、令牌失效或 Siteverify 不可用时均阻止请求。邮箱验证重发也通过 `mmwr_email_verification_resend` action 进行 Turnstile Siteverify，并保留数据库每小时 3 次限额；最终投稿表单尚未开放；须逐环境配置并在 Staging 验证。正式 Telegram 客服目标仍待用户提供/确认；仅在 `NEXT_PUBLIC_SITE_URL` 为可公开访问的 HTTPS 地址时生成 Telegram 外链。若地址为本地 HTTP、IP 字面量或本地/保留域名，则只提供可复制的参考文本、不生成不可公开访问的链接；Turnstile 仍要求配置可信站点地址，缺少时提交 fail closed。此入口不处理紧急法律/隐私申请，不会因为举报自动隐藏帖子。当前本地实现状态不等于 Staging 或 Production 可用。`20260930200000_report_rate_limit_wall_clock.sql` 将举报限额窗口和 `submitted_at` 改为锁等待后同一 `clock_timestamp()` 采样；Staging 清单增加账号行锁等待与并发超额请求检查。另新增 `20260930210000_report_review_audit_wall_clock.sql`，令举报状态与追加式审计使用锁后同一墙钟时间，并覆盖锁等待期间 TOTP 过期时不写入状态或审计。相关迁移尚未应用或 PostgreSQL 验证。

2026-10-03 举报中心搜索建议并发静态复核：请求原已绑定 AbortController，但 JSON 解析后没有再次检查取消状态；查询快速变化时，晚到的解析结果仍可能恢复旧建议。现于提交建议状态前检查 `signal.aborted`，并在 Staging 验收增加延迟响应和切换反馈表单的检查。未运行浏览器或测试。

2026-10-03 投稿草稿证据文案修正：原三语 UI 标注“至少需要一张图片”，与“没有已扫描通过图片只作普通风险提示、不拦截投稿”的已确认规则冲突。现将图片证据设为选填，并把当前上传关闭状态、未来缺图风险提示和文件安全验证门槛分别说明；投稿仍不可提交。

### Phase 3 投稿审核队列本地增量

`/admin` 现加入三语投稿审核队列 UI；它只在已通过 Owner/Admin 后台 2FA gate 的页面中呈现，数据库端仍独立执行角色、AAL2 与十分钟内 TOTP 检查。队列最多 50 条，仅展示标题、状态、风险级别与时间；查看详情才读取投稿来源和审核字段，并逐次记入私有审计。审核历史最多显示 50 条；每次打开历史也写入审计。Admin 无法列出、打开或处理高风险投稿；Owner 可以处理。处理状态只包括审核中、要求补充资料、拒绝和关闭；每次更改须填写内部说明，安全回复为选填，并同步写入 `submission_reviews` 和追加式工作人员审计。该队列首次实现的范围不包含发布；审核转正式帖的后续本地增量见下一节。新增内部附件预览仅能列出扫描 clean 且 `internal_only` 的投稿附件；使用一次性服务端授权票据，由服务端签署 60 秒 URL，数据库及部署开关都默认关闭。另新增 Owner 可见性管理面板：只列活动投稿中的 clean 附件，Owner 以近期 TOTP 和必填理由切换“准备公开”/“仅内部”，并追加不可变审计；应用变量与数据库开关均默认关闭。新登记附件默认 `public_thumbnail`（准备公开），但仍在私有隔离桶中；待审投稿不会出现在公开投影，公开投影还要求正式发布关联及 clean 扫描结果。两项功能及迁移尚未在 Staging 验证，不能启用。旧审核入口撤权仍由前一迁移执行，以免绕过近期 TOTP 检查。

2026-10-03 投稿审核队列并发静态复核：快速切换投稿或在保存审核结果期间切换对象，可能让迟到的详情/历史响应写进新的选择。现以请求序号和当前投稿 ID 作响应边界，队列读取中禁用重复打开，且在详情与历史匹配读取后才展示审核面板；保存后的历史刷新和路由卸载也会丢弃过期结果。Staging 验收新增延迟响应切换、失败重试、离开页面与保存/切换并发检查。未运行测试、浏览器或数据库验证。

2026-10-03 投稿审核附件文案对齐：审核队列说明现准确表达证据预览默认关闭；若单独启用，只能通过受控短时链接查看已扫描通过且标为内部的附件；投稿上传仍关闭。没有启用环境或数据库开关，Staging 仍待验收。

2026-09-30 静态复核修正 Owner 可见性面板加载：请求状态在异步 RPC 完成后更新，且投稿切换/卸载时忽略旧请求。Phase 3 后台、附件、报告和安全面板定向 ESLint、全仓 ESLint、`npx tsc --noEmit` 及 `npm run build` 通过；Next.js 编译并生成 34 个静态页面。未运行测试或数据库操作。

新增本地迁移 `20260930120000_mmwr_submission_ordinary_risk_signals.sql`：以默认关闭的 `submission_risk_scanning` 为总开关，对未结案投稿生成普通风险信号。此前的 `20260930133000_submission_duplicate_primary_descriptions.sql` 补上了主体说明匹配；后续状态/开关前向修正继续限定只刷新受影响的开放同行。最新 `20261001010000_submission_duplicate_cross_field.sql` 将主体说明和补充说明纳入同一比较池，完全相同的规范化文本无论在同字段或跨字段出现，都会给两条仍未结案投稿添加 `duplicate_open_description`。规范化折叠大小写和空白，标点差异仍不匹配。只保存私有固定信号代码，不存说明副本或持久文本指纹；比较锁仅在事务内存在。缺少扫描通过的 JPEG/PNG/WebP 会产生一般风险信号，有通过扫描的图片后解除。扫描开关关闭时不生成活动信号、不比较私有投稿文本；开启时只计算未结案投稿，关闭时清除活动信号。审核列表和详情显示中/英/马来文原因标签。信号不拦投稿、不判断真伪、不改变高风险 Owner 隔离。PostgreSQL 并发行为尚未实测；迁移未应用，投稿入口和扫描开关仍关闭，Staging 验收仍是上线前置条件。

2026-09-30 追加状态边界修正：先补上“关闭投稿重新打开后刷新相同补充说明的其他开放投稿”，再新增 `20260930160000_scope_submission_duplicate_status_refresh.sql`，使状态进入/离开开放集合时仅刷新相同主体或补充说明的开放对方投稿，避免每次结案都重算所有活动重复信号。该迁移替换并移除上一迁移的独立 addendum 状态触发器。随后发现同一 SQL 同时修改主体说明与状态时，源说明触发器仍可能触发旧的全局刷新循环；新增 `20260930170000_scope_duplicate_refresh_for_combined_updates.sql` 移除此分支，状态刷新只由范围受限的专用状态触发器处理。回滚/验收文档增加相应说明；迁移未应用，数据库行为未验证。

2026-09-30 关闭开关扫描成本修正：静态复核发现普通风险总开关关闭时，输入触发器仍会查询比较主体/补充说明并取得事务 advisory lock，虽然最终不会显示活动信号。新增前向迁移 `20260930190000_skip_ordinary_risk_matching_when_disabled.sql`，在非开关事件进入风险处理前检查开关；关闭时立即返回，不比较私有投稿文本、不刷新风险行。开关本身的迁移触发器继续工作：关闭时清空活动信号，开启时重算全部未结案投稿。Staging 验收及回滚预案已补充该行为。迁移尚未应用，SQL/PostgreSQL 行为待验收。2026-09-30 当前工作树复核：`npm run lint -- .`、`npx tsc --noEmit` 和 `npm run build` 均通过；构建生成 34 个页面。未运行测试、SQL/PostgreSQL、Supabase Advisor 或 Staging 验收。

2026-09-30 审计时间复核：新增 `20260930230000_audit_event_wall_clock.sql`，将 `security_events`、`moderation_events`、`role_change_audit`、`user_report_audit`、`submission_staff_audit` 和 `evidence_scan_audit` 的 `occurred_at` 默认值统一改为 `clock_timestamp()`。这与先前举报状态、处罚事件墙钟修正一致，避免锁等待期间创建的追加式审计记录使用过早的事务开始时间。Staging 验收与回滚预案已加入对应条目。未应用迁移，未在 PostgreSQL 验证。

### Phase 3 投稿审核发布本地增量（2026-09-30）

新增迁移 `20260930140000_reviewed_submission_publication.sql` 和 `/admin` 审核发布面板，建立私有结构化 intake、不可变投稿/帖子关联、仅在当前帖子有公开预览时可读的公开社交资料投影，以及原子 `publish_reviewed_submission` RPC。发布资料和标签的 Staff 读取、发布写入均受数据库 flag 保护；审核详情需有效 Owner/Admin、AAL2 和近期 TOTP；发布时在投稿行锁后重新检查 staff/TOTP、未结案状态、活动地区、活动标签和风险权限。Admin 不可发布高风险投稿；Owner 可以。原始说明与补充资料不变，审核员明确填写公开标题、摘要、正文、标签、风险等级、公开资料链接选择和理由。单次事务建立帖子/公开投影、选中的 HTTPS 白名单社交链接、投稿发布关联、审核历史、工作人员审计和 moderation 审计。`MMWR_SUBMISSION_PUBLICATION_ENABLED` 与 `submission_publication` DB flag 双重关闭；数据库 flag 没有前端开启入口，保持默认 false。投稿创建/上传没有开放，intake 表暂时没有用户写入 RPC；没有现成投稿能经此流程发布。没有移动或公开附件，扫描/上传/后台证据预览/Owner 可见性开关保持关闭。迁移未应用，Postgres、RLS、MFA、锁等待、权限矩阵、投影和详情社交链接均未验证；需先完成证据与 Staging 验收，才可考虑任何启用。

并发保护补充：发布面板还携带读取时的投稿 `updated_at` 和最新补充说明 ID；发布 RPC 锁定投稿行后再次核对两者，任一变化都会返回 `submission source changed` 冲突，不创建帖子或审计写入。审核面板以中/英/马来文提示重新载入复核。标记只作本次审核的乐观版本令牌，不产生持久文本副本或文本指纹。需在 Staging 验证打开审核面板后追加说明、以及并发锁等待两种场景。

Phase 3 发布 RPC 静态复核发现旧 `public.publish_post` 仍可由 authenticated 调用，但仅检查 AAL2/角色、没有近期 TOTP，也不会在帖子行锁后重验授权。新增 `20260930240000_harden_legacy_post_publish.sql` 保留旧普通帖发布能力，同时要求近期 TOTP 和有效理由，锁后重验后台身份/TOTP、帖子状态/地区/风险权限，并用同一个锁后墙钟时间更新帖子和追加 moderation audit。Admin 仍不能发布高风险帖；Owner 可以。新投稿发布流程仍使用独立默认关闭的双 gate。`supabase/tests/content_access.test.sql` 中两处成功发布场景已改用动态当前 TOTP 时间；本地未运行数据库测试。迁移、MFA/RLS 和并发行为未验证。

**近期 TOTP 与账号限制时钟复核（2026-09-30）：** 找到近期 TOTP 辅助函数使用事务开始时间的问题；现在用 `clock_timestamp()` 计算 10 分钟窗口、拒绝未来时间戳，并声明为 `VOLATILE`。所有直接调用 TOTP、工作人员角色或账号处罚动态检查的数据库函数及其公开 wrapper 已同步改为 `VOLATILE`，避免规划器按事务固定结果处理。账号处罚到期比较也改用墙钟，并使角色辅助函数随处罚即时变化。证据授权在 per-user advisory lock 等待后重新验证角色、近期 TOTP、账号限制、证据资格和开关；一次性票据消费时再次拒绝已暂停账号。Staging 验收清单新增锁等待超过 TOTP 有效期、票据签发后暂停账号、处罚到期边界和未来时间戳检查。上述迁移仍未应用，未连接或运行 PostgreSQL，也没有做真实环境验证。

### Phase 2 Auth 补充进度

邮箱/密码登录注册、Profile 初始化和修复、应用级邮箱验证与重发、Supabase Auth PKCE 密码重置回调、Next.js Supabase Proxy、服务端 SMTP 模块已写入。Auth 邮箱变更会清除 MMWR 投稿邮箱验证状态和未用 token；随机 256-bit 验证值只存 SHA-256 哈希，30 分钟过期，每小时最多发 3 次，打开邮件后仍需用户主动确认。新增迁移 `20260928042227_mmwr_app_email_verification_and_profile_provisioning.sql` 与 21 项 pgTAP 断言。两轮静态复核发现并修复注册密码空格不一致及邮箱变更/验证并发锁顺序问题。Owner/Admin TOTP gate 与原生一次性恢复码已写入，恢复码功能依赖 Supabase Auth 实验 API，并启用恢复后的 TOTP 替换流程。另增加 Owner 角色管理 RPC（近期 TOTP 再验证、不得自我变更、不得撤销最后 Owner、强制填写原因并审计）及一次性首次 Owner 手动初始化脚本。新增长为 Owner 专用的后台角色管理界面和账号查找 RPC，仅用至少 3 字符的用户名查询、最多返回 25 个匹配有效账号，并只显示用户 ID、用户名和后台角色；逐次变更均要求 TOTP challenge 与原因，实际授权交给既有数据库 RPC。当前仅为本地代码和新迁移，尚未执行或验证。账号删除请求/取消本地流程已加入：7 天 `deletion_pending` 冷静期、明确勾选确认、截止时间显示、取消入口与审计；`ACCOUNT_DELETION_ENABLED=false` 默认关闭。不可逆到期清理 Worker 暂未开放，因为 Supabase Auth 会拒绝删除仍拥有 Storage 对象的账号，而附件可能属于应保留证据；须先确定对象保留/所有权处理并验证会话失效行为。新增私有证据隔离桶边界：文件上限 10 MiB、每投稿最多 5 个对象、扩展名与声明 MIME 配对、仅活动投稿人可上传；只有上传响应能读取刚写入对象的元数据，不可列举、查询、下载或公开读取。新登记 RPC 将证据标记为 `pending` / `public_thumbnail`（准备公开），但附件仍处于私有隔离桶，待审投稿不会公开；Owner 可见性切换迁移和 UI 也已本地加入并默认关闭。用户仍可伪造 MIME，因此魔数检查、恶意软件扫描和签名读取尚未完成，投稿附件功能仍关闭。尚未运行构建、浏览器或数据库测试，Supabase/SMTP 仍未配置；其余 Phase 2 未完成。

- 本地已建立独立 Next.js 基础项目，并实现首页基础结构、Latest 8、Hot Ranked 8、12 个 Tag 位、三语基础界面、Light/Dark、年龄 Gate 与 Cookie Consent。页眉、页脚和年龄 Gate 暂用原创猫头鹰 SVG 符号，浏览器应用图标也暂用同一设计；后续由用户的最终品牌设计替换。
- Legal/Privacy/社区规则/请求说明已有三语草稿页面，并有 footer/drawer 入口；文案明确待马来西亚律师审阅，且不会接收真实申请。
- Reaction 本地实现了“有帮助/谢谢/支持”三个选项，一账号一帖可更换或取消；active 用户无需邮箱验证即可使用，暂停账号禁用，访客仅能看计数。Latest、地区、Tag、搜索卡片可显示已获授权的真实 Reaction 总数，读取失败时隐藏。反应迁移已应用本地并由内容权限 pgTAP 覆盖。Owner 内置图标迁移 `20261004150000_owner_reaction_icons.sql` 已应用本地：固定图标集合、近期 TOTP、必填原因和审计均有数据库边界。真实 PostgREST 验证发现 anon 预请求钩子缺少 private schema 的 USAGE；Phase 3 前向迁移 `20261004190409_owner_ip_block_anon_prerequest_schema_usage.sql` 已本地应用，只补 schema name-resolution 权限，不授予 private 表读取且 private 不暴露给 Data API。Reaction wrapper 保持 invoker。新增 `owner_reaction_icons.test.sql` 19/19、`owner_ip_block.test.sql` 14/14；完整 pgTAP 为 25 文件 / 595 断言。实际本地 PostgREST 在 hook 开启时 Reaction 图标及 Tag 目录 anon RPC 均 HTTP 200。仍待 Owner 浏览器 UI 与隔离 Staging 验收；无上传、在线 SVG、反应类型或计数编辑。扩展库/排序和 SVG/PNG 上传仍未实现。
- `/submissions` 已改为通过 `my_submission_statuses` RPC 读取当前登录账号自己的投稿状态和安全审核回复；登录后会返回该页。未连接托管 Supabase 时显示不可用状态。投稿创建、标题/正文表单、补充资料和附件仍未开放。`/latest` 已按每页 12 篇从 `published_previews` 安全投影读取已公开帖子，并使用服务端分页；首页读取最新 8 篇。展示字段仅含标题、主名称、公开摘要、地区、标签和公开时间，不含证据文件路径、账号信息或虚构计数；由于公开投影尚未提供公开图片 URL，当前以 MMWR 装饰块占位。`/latest` 和首页这一读取代码尚未接入已验证 Supabase。`/hot` 已有三语热榜说明页和 8 个空白卡位，明确列出 1h/6h/24h 有效阅读、默认 100 门槛、反爬虫过滤及 Featured/Boost 分离；由于事件采集、权重与审计评分尚未实现，不显示帖子或分数。`/search` 已有三语服务端公开搜索页与只读 RPC（迁移 `20260928112500_mmwr_public_search.sql` 尚未应用）。RPC 可用经审核且仍关联当前公开帖子之别名作为隐藏匹配键，结果只输出公开预览字段，不返回别名文本/来源、证据、投稿原文或审核资料；主名称精确匹配优先、支持分页，不会自动合并相似姓名。无结果/服务不可用均有明确状态，页面保持 noindex。搜索限流实现已写入 `20260928133100_mmwr_public_search_rate_limit.sql`：默认每 IP 每分钟 20 次、每小时 200 次；限流与搜索 RPC 仅授予服务端 Secret Key 角色，迁移未应用，需配置独立 `SEARCH_RATE_LIMIT_HMAC_SECRET` 并验证 Vercel/Cloudflare 代理下的来源地址。相似名称独立推荐代码写入 `20260928133200_mmwr_similar_name_recommendations.sql`：仅当查询不少于 4 字符时，以主名称和已审核别名作模糊匹配，另列最多 5 个独立公开对象；卡片只显示主名称、标题与地区，并明确提示名称相似不能证明身份相同。迁移尚未应用，需在 Staging 核对扩展可用性和查询性能。文字 Autocomplete 已接入并仅返回当前公开帖的名称、标题和地区，最多 5 条，支持键盘选择。当前数据没有安全公开图片 URL，因此不带缩略图。详情页已本地实现，但 `20260928124500_mmwr_published_post_reading.sql` 尚未应用。`/areas` 已有 13 州和 3 个联邦直辖区切换与公开帖子只读查询代码，但地区层级迁移与种子数据尚未应用；`/submit`、`/vip` 仍为 noindex 开发中说明页。`/tags` 已有三语真实公开标签目录界面与随机 30–50 个标签球、拖动旋转、慢速旋转、名称排序、即时筛选及公开帖计数；计数只从 `published_previews` 安全投影汇总，新增迁移 `20260928101500_mmwr_public_tag_directory.sql` 尚未应用。没有公开内容时会显示空状态，当前无真实标签数据；标签页未完成部署验证，也暂时保持 noindex。
- 共享导航抽屉现从左侧覆盖打开，支持键盘焦点管理、Escape 关闭与焦点返回；18+ Gate、Cookie 对话框提供焦点边界和可见焦点样式。此处是代码审查结论，尚未做浏览器运行验证。
- Phase 1 当前 UI 的三语草稿已覆盖首页、功能状态页和法律页面；还没有真实日期数据或业务表单，日期/数字格式和验证错误文案会随相应功能实施。
地区浏览依赖 `public_posts_for_area()` 安全公开投影，支持独立 Singapore 地区入口。现有 UI 代码只在地区浏览页显示 159 个州内 District 线；首页始终仅显示州属轮廓。两处都使用 Putrajaya→Kuala Lumpur 合并显示；唯一未提供的几何是独立 Putrajaya District 边界；原 ADM1 布城轮廓作为 KL 组合边界保留。目录数据/合并迁移 `20261005100000_mys_district_map_and_putrajaya_merge.sql` 已应用于本地 Supabase，并由 `district_catalog.test.sql` 覆盖 District 目录、公开地区/子地区计数及 Putrajaya/Kuala Lumpur 合并边界；当前本地迁移清单与磁盘版本一致。托管 Supabase 未查询或修改。真实公开帖子仍由安全投影按数据库结果决定是否显示，空/不可用时不伪造 Putrajaya District 边界、Pins 或帖子数。Singapore 独立浏览，但不属于马来西亚 ADM2 District 数据范围。
- 首页 Latest 区和 `/latest` 现在使用只读服务端查询读取 `published_previews` 白名单字段：首页 8 篇，列表页每页 12 篇；分页只额外读取一条判断下一页，不查询私有帖子/证据表。卡片展示公开名称、标题、摘要、地区、已公开标签与日期；因安全公开投影没有图片 URL/阅读计数，目前用非内容性的 MMWR 装饰块，不伪造图片或数字。暂无托管 Supabase/公开帖，且代码未运行验证。
- Phase 0 现状和选择性迁移证据见 MASTER_PLAN.md 完成记录及项目 docs。未复制小时代的用户/生产数据、凭据或应用代码。
- Supabase、SMTP、Turnstile、Cloudflare/R2、GA4、Search Console、Vercel 和 Production 均未配置或验证。代码完成不代表上线。
- Next.js 已加入基础 CSP nonce 与响应安全头：`nosniff`、`DENY`、`strict-origin-when-cross-origin`、限制浏览器敏感能力；Production 响应添加 HSTS。Production 策略不含 `unsafe-eval`，Supabase 连接源仅按配置的 URL 添加；Turnstile 与 GA4 所需来源已允许。第三方脚本环境兼容性仍待逐环境验证，安全 Launch Gate 尚未通过。
- SEO 当前根 metadata 默认 `noindex`。`robots.txt` / `sitemap.xml` 只有在 Vercel Production、明确设置 `ALLOW_SEARCH_INDEXING=true` 且配置纯 HTTPS origin 的 `NEXT_PUBLIC_SITE_URL` 时启用；该检查同时排除凭据、路径、查询与片段。首页仅在该索引开关开启时输出 `Organization` / `WebSite` JSON-LD。sitemap 目前只列首页，未完成功能页不收录。公开帖子详情已有安全公开投影驱动的动态 canonical、Open Graph 与 X 分享 metadata；不读取全文、身份或证据，详情仍 noindex。Article 结构化资料、Production 配置和真实搜索引擎抓取仍待 Staging/Production 核实。
- 当前本地进度：Supabase CLI 2.118.0 与关闭自动暴露/种子数据的本地配置已提交；身份 22 项、内容 53 项、Auth 21 项、Staff MFA 9 项 pgTAP 断言均已编写但未执行（缺少 Docker）。后台 gate 使用 TOTP 和 Supabase Auth 原生一次性恢复码；实验恢复码 Auth 接口须在 Staging 验证。数据库后台授权要求 AAL2 和 `mfa/totp` 签名因子证明，恢复码 AAL2 仅进入认证器替换流程。Owner 角色变更 RPC 已要求近期 TOTP、记录原因与审计并阻止撤销最后 Owner；首次 Owner 有 guarded 手动脚本，尚未在任何实例执行。新增 Owner 专用人员管理 UI 与最小字段账号搜索 RPC，仅按用户名查询有效账号，最多 25 项，不返回邮箱或投稿资料；每次变更都发起 TOTP challenge 并要求原因，授权仍由数据库 RPC 强制校验。此迁移尚未应用或测试。证据上传隔离桶已限定对象类型、10 MiB/文件、5 个对象/投稿、投稿人路径及 MIME/扩展名匹配；没有任何下载或公开访问策略。登记 RPC 只会将附件记录为 pending/internal；魔数校验、恶意软件扫描、签名读取和前端投稿流程仍未实现，因此附件功能保持关闭。匿名预览摘要限 200 字符；首次发布时间与恢复上架时间分开。投稿转正式帖、账号删除和其余 Phase 2 功能尚未完成，托管 Supabase 未连接。详见 `MASTER_PLAN.md` 的 Phase 2 进度记录。
- 上述 Phase 2 快照记录了申请/取消流程；2026-10-04 的当前账号删除实现与限制见本文件账号删除处理记录和 [`docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md`](docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md)。

### Phase 5 First-party Analytics 本地增量

已加入受 Cookie Consent 控制的 First-party 页面浏览收集器与本地迁移草稿。依用户 2026-10-01 确认，此阶段唯一启用后可采集的一般分析指标为按日/固定公开路线类别汇总的 Page Views；后台报表默认 30 天，可选 7/30/90 天，路线汇总在 13 个月后进入删除窗口，日清理任务最迟下一次运行时移除，限速 HMAC 在 48 小时后进入删除窗口，日清理任务最迟下一次运行时移除。双环境开关 `FIRST_PARTY_ANALYTICS_ENABLED` / `NEXT_PUBLIC_FIRST_PARTY_ANALYTICS_ENABLED` 默认 false；启用后 API 只接受固定路线类别，并将每次公开页面浏览累计进 UTC 每日路线汇总。API 校验同源、JSON 类型及极小请求体；请求不发送认证 Cookie、Referer 或页面查询参数。私有数据库只保存聚合计数，以及用于限速的每环境 HMAC 摘要；原始 IP、逐次事件、用户身份、来源、设备和访客 ID 均不保存。每个哈希每分钟最多 60 次、每小时最多 1,000 次。唯一访客、Session、分享归因和广告指标不采集；Valid Read/Hot 虽有独立本地草案，但其服务端、客户端、数据库开关仍须保持关闭，不能视为已启用。GA4 另加 `NEXT_PUBLIC_GA4_ENABLED=false` 门槛；因其默认报告包含访客/Session 维度，即使填入 Measurement ID 也不会加载，直到另行确认范围。新增本地迁移 `20261001050300_analytics_page_view_rate_limit_retention.sql`，将路线限速摘要加入现有每日清理函数；回滚预案见 `docs/operations/PHASE5_MIGRATION_ROLLBACK.md`。迁移未应用；Supabase 与 HMAC 密钥未配置。`ANALYTICS_TRUSTED_CLIENT_IP_HEADER` 必须在 Staging 验证 Vercel/Cloudflare 代理头后才可设置；该头未配置时 API fail closed。First-party 路线页范围排除 `/submit`、`/submissions`、`/report`、`/account`、`/admin`、`/auth`。未做浏览器/网络面板实测。

### Phase 5 Owner/Admin Analytics 汇总面板本地增量

后台已加入 7/30/90 天公开路线浏览汇总 UI。服务端仅在两个 First-party 开关都启用后读取；数据库汇总 RPC 限制 Owner/Admin、要求现有 `has_staff_role()` 验证的 AAL2，并只返回每日路线聚合，不返回事件、访问者或身份数据。面板按当前语言显示类别计数和比例条。新迁移 `20260928122157_mmwr_staff_analytics_summary.sql` 尚未应用；因收集器仍默认关闭，当前 UI 会显示关闭状态。环比/同比、Top Posts、地区、来源、自定义日期、报表导出与 Staging 验证仍未完成。

Phase 5 指标工作版见 [`docs/architecture/PHASE5_ANALYTICS_CONTRACT.md`](docs/architecture/PHASE5_ANALYTICS_CONTRACT.md)。已确认每次公开导航/刷新均记一个 PV，且 Analytics Consent 与双环境开关都必需。当前每日 PV 仅按路线聚合，不保存逐次浏览、访客或 Session；Rate limit HMAC 只做短期防滥用且不可复用于用户跟踪。有效阅读阈值/去重、访客与 Session 标识、分享归因、广告可见计数/计费及原始数据保留均未定。广告和 Hot 不得因这份工作版而打开。

### 静态代码质量清理（2026-09-29）

账号、投稿、Tag 和后台服务端页面已将 JSX 从 `try/catch` 数据加载路径中移出，保留原来的登录、封禁、待删除、Owner/Admin 与 MFA 分支；相关页面 TypeScript 与定向 ESLint 通过。导航中的站内硬编码链接改用 Next.js `Link`，Consent/Turnstile 的回调 ref 改为 Effect 更新；Auth 表单在提交事件中消费 Turnstile token，邮件验证 fragment 通过外部订阅读取；搜索建议、举报搜索和 Consent 草稿的同步清理移到交互事件，后台队列初始加载改为等待 RPC 返回后更新，Tag 球体随机抽样在下一帧更新。PreferencesProvider 通过 `useSyncExternalStore` 读取浏览器 Cookie/主题偏好，Consent 首次打开状态由偏好快照推导；分享链接从 Next 当前路由及浏览器能力快照生成，可跟随客户端路由变化。本轮修正 Consent 弹窗焦点恢复清理中的 ref 捕获问题，MFA 二维码切换到 Next Image 的非优化数据 URI 显示方式；Server Action 未使用参数以 `_` 前缀约定明确标识。全仓 `npx tsc --noEmit` 与 `npx eslint .` 均通过，ESLint 为 0 个错误、0 个警告；`git diff --check` 通过，Git 提示现有工作文件在 LF/CRLF 间将发生换行转换。此轮没有运行 build、自动化测试或浏览器验证，也未配置任何外部服务。

### Phase 4 首页 Tags Smart Mix 与 Owner 排序本地增量

首页 12 个 Tag 占位符已替换为三语可点击公开标签卡；无标签或服务不可用时显示对应状态。新迁移 `20260928122926_mmwr_home_tag_spotlight.sql` 提供 Invoker 权限的查询，只读取安全公开投影，并稳定混合最多 4 个高公开量、4 个近期活跃的低量、4 个低曝光标签；不足 12 个时用剩余公开标签补齐。同一数据集不随机变序。服务端在渲染首页时与 Latest 查询并行调用，导航链接只包含已公开 Tag UUID。

Owner 后台本地新增首页 Tag 排序面板：Manual / Most Posts / Smart Mix 三种模式，手动可选最多 12 个当前公开 Tag，按用户顺序置顶，不足部分按公开帖量补齐；支持上移/下移/移除，三语显示。保存要求 TOTP challenge 与原因。迁移 `20260929115622_owner_home_tag_sorting.sql` 新建仅公开排序偏好的 singleton 表、Owner/AAL2/十分钟内 TOTP 校验的写 RPC，以及私有只读 Owner 审计表；只允许仍出现在已审核公开投影中的 Tag ID。首页查询依配置排序，默认依旧 Smart Mix。两项首页/目录相关 migration 均未应用，Supabase 未配置，真实 RLS/RPC/审计/排序尚未验证；无构建、测试或浏览器验证。用户须在配置托管 Supabase 时先应用迁移，再于 Staging 验证。

### Phase 3 Owner 内容生命周期本地增量（2026-09-30）

`/admin` 的 Owner 视图新增三语“公开内容紧急管理”面板，展示最近更新的最多 100 条已发布/暂时隐藏帖子；也可按已审核标题、对象名称或地区使用 3–120 字符子串搜索以缩窄结果。仅显示公开标题、对象名称、地区、公开状态和最近上架日期，不展示正文、提交者或证据资料。Owner 可紧急隐藏、恢复上架或永久移除；每项都要求填写原因、逐次 TOTP challenge，永久移除还要求浏览器确认。成功后刷新当前查询列表。当前 UI 会在 Supabase RPC 报错时提示检查迁移和权限。

新增 migration `20260930050551_owner_post_lifecycle_controls.sql`：补强既有生命周期 mutation RPC，使数据库本身也强制 Owner、AAL2/TOTP、十分钟内 TOTP 与最多 500 字理由，并在锁定帖子后重新检查身份/近期 MFA；隐藏/恢复/移除使用锁后同一墙钟时间写帖子时间戳及 moderation audit。新增只向 Owner 返回有限生命周期字段的 RPC。公开投影同步触发器已有即时移除/恢复逻辑；详情 URL 中性页/永久移除跳转及 no-store 响应现在也已有本地代码。Staging 验收清单新增锁等待超过 TOTP 有效期与动作时间戳检查；数据库与 Vercel/CDN 端到端验收仍未完成。一年后清理原文、证据与审核资料的执行器和法律保全规则尚不存在；目前“永久移除”只确保立即退出公开面，不代表内部数据已删除或一年后会自动清理。

无公开投影的详情目前通过按 UUID 精确查询的布尔 RPC 判别：只有永久移除时返回 `true`，暂时隐藏与不存在均不可区分。永久移除会 308 跳到当前语言首页；暂时隐藏显示中性不可用页（noindex）。帖子详情响应在 Proxy 设置 `private, no-store`。该 RPC 仅提供布尔值，不返回帖子资料或可枚举 ID 列表；安全效果尚待本地/托管数据库验证。

另新增 migration `20260930054035_public_post_removed_redirect_state.sql`：用 private schema 的状态检查函数与 public `SECURITY INVOKER` wrapper 供详情页判断是否永久移除；Owner 列表同样改成 public invoker wrapper 与 private Owner-gated reader，避免 public `SECURITY DEFINER` 数据读取函数。两个迁移均未应用；本机无 Docker/Podman，数据库 advisors、RPC 和 RLS 运行验证尚未执行。

迁移和面板仅在本地工作区；未连接托管 Supabase，也未应用迁移或查询数据库。未运行构建、自动化测试或浏览器验证；本轮仅做类型/静态格式验证。需要在本地 Docker 数据库可用时验证 SQL/RLS/RPC，再按 Launch Checklist 逐步配置并验证 Staging；此改动不代表任何外部环境已经更新。

Phase 3 Staging 验收清单现加入合成帖子隐藏、恢复、永久移除的 RPC 授权/审计、投影同步、公开读面、详情路由缓存头、308 重定向、noindex、sitemap/CDN 缓存及内部证据隔离检查；这些步骤尚未执行。

### Phase 3 账号处罚本地增量（2026-09-30）

`/admin` 新增中/英/马来文账号处罚面板。Admin 可记录警告、暂停投稿或 1/3/7/30 天/自定义时长的账号暂停；Owner 另可永久封禁。目标限定为有效普通账号；Admin 不可处置后台人员，任何工作人员不得处置 Owner 或自己。写入和解除均要求近期 TOTP 与必填理由。处罚由私有追加式事件表保存，数据库禁止客户端读表且阻止事件 UPDATE、DELETE、TRUNCATE；Auth 删除账号时仅可由外键将 Actor/Target UUID 匿名化。数据库函数在授权时比较到期时间，因此无需 Cron 才能到期。并发复核后，处罚创建在目标行与 advisory lock 等待后会重验角色、TOTP、目标角色和期限；解除在处罚/用户/advisory 锁后会重验授权、TOTP、到期状态和是否已有解除事件，避免锁等待期间旧授权或并发重复解除。账号暂停仍可读取公开内容，但投稿、Reaction 和 Staff 权限检查会拒绝。永久封禁设置 `profiles.account_state='banned'`，沿用已有封禁登录说明及可选 Telegram 链接。

新增迁移 `20260930070547_staff_account_sanctions.sql`，同时重收紧后台角色 helper，并给现有投稿、补充资料、证据登记及 Reaction 写入函数增加处罚门槛。上一迁移已撤销投稿创建/补充/证据 RPC 客户端执行权限并关闭 Storage 上传策略；本次替换函数不恢复权限，投稿仍保持 OFF。面板使用 Authenticator challenge 再验证，并只通过受限 RPC 查询用户名/最多 100 条历史。

本迁移与前序 `20260930065849_active_account_staff_access_guard.sql` 均尚未应用。当前环境没有 MMWR Supabase 项目连接，也没有 Docker/Podman 可启动本地 Postgres；数据库语法执行、Supabase Advisors、RLS/RPC/MFA 负向用例均待验证。因此本地代码不能用于真实处罚，Phase 3 仍未完成。Owner IP 封锁现有本地面板和迁移，但未在 PostgreSQL 或 Staging 验证；申诉、更正和撤下入口按用户决定保持关闭。账号删除触发器与追加式审计表的匿名化交互只做了代码审阅，仍须在目标数据库验证。

**申诉/更正/撤下入口政策决定（2026-09-30）：** 用户已选择保持关闭，等待政策确认。在政策确认前不得开放新的联系/收件入口，也不得收集申诉、更正或撤下资料。永久封禁提示固定显示渠道尚未开放；重新开放须经政策确认并修改代码，不可通过环境配置启用。

2026-09-30 处罚审计时间校正：新增 `20260930220000_sanction_audit_wall_clock.sql`，使新处罚及解除事件在数据库 insert 时以 `clock_timestamp()` 写入 `occurred_at`，避免申请/解除等待 profile/advisory 锁后，追加式审计仍显示事务开始时间。保留既有事件与处罚策略不变；Staging 锁等待验收已要求核对成功事件时间。迁移尚未应用或在 PostgreSQL 验证。

### Phase 3 Owner IP 封锁本地增量（2026-09-30）

用户批准的边界：只支持单个 IPv4/IPv6；Owner 专属；近期 TOTP、理由和未来到期时间均必需；服务端使用独立 HMAC 密钥；不保存原始 IP。新增 `20260930101500_owner_ip_blocks.sql` 与 Owner Dashboard Widget。活跃表只保存 HMAC 指纹，解除或过期清理时删除；追加式审计只保存随机 block ID、动作、操作者、理由与时间，不含 IP 或指纹。自访问地址的封锁请求会拒绝。添加封锁在 fingerprint advisory lock 和过期清理完成后会重新验证 Owner、TOTP 和未来期限；解除封锁在行锁后复核 Owner/TOTP 与自然到期状态，避免等待期间过期的授权或把自然到期错误记录为手动解除。Proxy 仅当 `MMWR_IP_BLOCK_ENABLED=true`、HMAC 密钥不少于 32 字节、受支持的可信代理头及服务端 Supabase 密钥齐全时检查；每个匹配动态请求会经服务端 `SUPABASE_SECRET_KEY` 调用受限布尔 RPC，失败时返回 503、命中返回中性 403。`20260930112609_owner_ip_block_data_api_guard.sql` 撤销 anon/authenticated 对此 RPC 的执行权，避免其成为公开封锁状态探测接口；并以 PostgREST `db_pre_request` 检查直连 Data API 的 anon/authenticated 请求。复核发现数据库此前固定读取 `X-Forwarded-For`，与应用可选的可信代理头不一致；现改为通过 `app.settings.mmwr_ip_block_trusted_client_ip_header` 显式选择同一白名单头，必须与 `MMWR_IP_BLOCK_TRUSTED_CLIENT_IP_HEADER` 完全一致，迁移默认空值、封锁默认关闭，缺少或无效配置时 fail closed。可信 `service_role` 服务端请求不代表终端访客，钩子将其豁免以免阻断后台工作；浏览器请求仍须经过 Next.js Proxy 或直连 Data API 检查。数据库角色开关默认 false，并需在 Supabase Vault 配置与 Next.js 相同的 HMAC 密钥。实际启用前须在 Staging 验证可信转发头不能由客户端伪造、所有 anon/authenticated 直连请求均经过数据库检查、受信服务端调用正常、IPv4/IPv6 HMAC 与 Next.js 完全一致、错误配置 fail closed，以及未知角色不被豁免。此数据库钩子只覆盖 Data API，不覆盖 Supabase Auth、Storage 或 Realtime；证据上传/公开读取尚未启用，因此这些 API 不应被宣称受封锁保护。所有开关默认关闭；不在本地或线上环境配置实际密钥。迁移未应用；未运行 PostgreSQL/自动化测试。

IPv6 HMAC 输入现将 PostgreSQL 输出为点分十进制的 mapped/compatible IPv4 尾段统一格式；Staging 验收包含 mapped 与 compatible 等价地址向量。跨运行时与实际 PostgREST 请求头仍未执行验证。

Phase 3 本地 SQL 回滚注意事项按迁移汇总见 [`docs/operations/PHASE3_MIGRATION_ROLLBACK.md`](docs/operations/PHASE3_MIGRATION_ROLLBACK.md)。该文档明确为本地预案，不是数据库恢复记录；目前未在 Staging 或 Production 应用迁移或执行回滚。

### Phase 3 工作台布局本地增量（2026-09-30 至 2026-10-03）

`/admin` 现使用角色过滤的 Widget Registry。Admin 有 9 个工具；Owner 有 16 个工具，其中 7 个 Owner 专属工具为公开内容管理、首页标签设置、后台人员管理、投稿风险词库、关键安全邮件、IP 封锁和 Phase 5 Hot 门槛。Phase 3 默认版本在 Hot 门槛迁移之前为 Admin 9 / Owner 15；`20261001045652_owner_hot_threshold_setting.sql` 后当前 Owner 数量为 16。个人可用鼠标/触控拖拽或上移/下移按钮调整工具顺序，也可隐藏或添加可用工具后保存；界面阻止隐藏最后一个工具。拖拽把手仅供指针操作，键盘排序使用上移/下移按钮。拖拽排序仅在保存时持久化，当前尚未进行浏览器/UI 验收。`staff_get_dashboard_layout` 与 `staff_save_dashboard_layout` 分别负责读取/保存，服务端按有效 staff 角色、AAL2/TOTP 身份和允许的 Widget ID 执行校验。

Owner 可在近期 TOTP 验证和必填原因后调用 `owner_reset_admin_dashboard_layouts`：数据库锁定默认版本、删除所有 Admin 个性化布局、追加新的默认版本及操作者/原因/影响数量；Owner 布局不变。锁等待后会重新检查 Owner 与 TOTP，过期或权限撤销时不删除偏好、不追加版本；布局保存等待共享锁后也会确认调用者仍有原角色。权限或近期 TOTP 不通过时 RPC 会返回授权错误，只有成功但没有个性化布局可删除时才返回 0。新迁移 `20260930072726_staff_dashboard_layouts.sql` 将偏好和默认版本历史放在私有 schema，默认版本仅可追加；仅 Auth 用户删除导致的操作者 FK 匿名化可更新历史记录。分析工具继续受两个 Analytics feature flag 控制，默认 OFF。`docs/operations/PHASE3_STAGING_ACCEPTANCE.md` 已加入角色 Widget 清单比对、非法直接 RPC 输入、布局持久化、Owner 重置范围、追加式版本历史、保存/重置并发及锁等待授权检查。迁移尚未应用；Postgres 解析/执行、MFA/RLS/RPC 负向用例和并发重置验证均未进行。无 Supabase/Docker/Podman 环境，不能宣称已持久化或已上线。Phase 3 的投稿风控、内容修订、申诉/IP 封锁、Critical Security Email 的安全事件生产者及各迁移的 Staging 验证仍未完成。

### Phase 3 站内通知本地增量（2026-09-30）

新增三语站内通知 Widget 与迁移 `20260930073911_staff_in_app_notifications.sql`。通知按账号私有保存，触发事件只生成固定系统文案，不复制举报/反馈正文、投稿来源或证据。新投稿发给当前有效的 Admin/Owner；高风险投稿事件只发给 Owner 并标为 Critical；用户举报标为 Important，一般反馈标为 Normal。通知状态由未读→已读→处理中→已处理严格递进，Owner/Admin 更新状态需重新挑战 TOTP，数据库再次检查近期 TOTP 并追加状态审计。通知查询限本人最近 90 天最多 100 条，Supabase Cron 每日运行 90 天清理函数；迁移会启用 `pg_cron` 并登记定时任务。

本地 RPC 复核发现列表读取虽有限 90 天，状态变更此前没有同样的期限检查。新增前向迁移 `20260930123000_staff_notification_expiry_write_guard.sql`，状态写入拒绝 90 天前通知及 NULL/未知状态，并保持只允许账号本人按顺序推进状态。后续并发复核发现请求等待通知行锁期间可能跨越 TOTP 新鲜度或 90 天到期边界；现在锁后重新读取当前时间并复验 staff/TOTP，更新条件也使用锁后时间。`docs/operations/PHASE3_STAGING_ACCEPTANCE.md` 已加入状态逆序/跨账号拒绝、过期 ID 写入拒绝、锁等待跨界、每日清理及通知与 Critical Security Email 分离等验证项。迁移未应用，数据库/MFA/Cron 仍待 Staging 验收。

Critical Security Email 与站内通知分离。发送器、服务器端有效 Owner 收件人解析、默认关闭的 Bearer 保护调度端点、私有队列/逐 Owner 投递和追加式审计已在本地实现；Owner 需近期 TOTP + 必填原因开启数据库策略，服务器仍必须配置 CRITICAL_SECURITY_EMAIL_ENABLED、SMTP 和独立的 32+ 字节 CRITICAL_SECURITY_EMAIL_TOKEN。普通登录失败不会单独发信。新迁移扩展 Dashboard 的 Owner Widget Registry。无 MMWR 数据库连接或本地 Postgres，SQL、Cron、RLS/MFA 和触发器尚未运行验证；需在正确的 MMWR Staging 环境应用迁移后验证。当前未运行自动化测试、构建或浏览器验证。

新增 `20260930111623_recovery_code_bruteforce_email_alerts.sql`：修正先前错误依赖已删除的自建恢复码计数表的问题，改由 Supabase MFA Verification Auth Hook 只统计 Admin/Owner 恢复码因子失败；邮件策略关闭时不收集计数，连续五次/15 分钟达到阈值才写一条安全事件并触发固定暴力攻击告警。该迁移替换基础邮件迁移中的通用 `staff_sign_in_anomaly` 邮件触发器；此类事件仍可内部审计，但不发登录异常邮件，遗留未发送邮件将标为 `skipped` 并保留投递审计。计数表不保存 IP、设备、请求头或验证码，15 分钟清理。Hook 对所有 MFA 因子均会被 Auth 调用，但只处理 `recovery_code`，其他因子和任何 Hook 内错误均返回 `continue`。Auth 的原生消费/限速不由本应用改变。按 Supabase Postgres Hook 文档新增 `20260930180000_recovery_code_hook_public_schema_usage.sql`，显式授予 `supabase_auth_admin` 使用 `public` schema，以便它解析专用 Hook 函数；函数执行权限仍仅限该角色，不授予计数、审计或邮件表直读。Supabase 官方将托管 MFA Verification Hook 列为 Teams/Enterprise 功能，须在 Staging 确认计划能力及实际 Auth 版本会为恢复码调用此 Hook，并确认锁定配置仍为五次/15 分钟。依用户决定，不以 IP/设备变化判定，也不采集此类指纹。队列/SMTP 问题不得改变验证结果。Hook 与邮件策略默认关闭；新迁移尚未应用或验证。

### Phase 3 Owner 投稿风险词库本地增量（2026-09-30）

新增 Owner 专用投稿风险词库面板与迁移 `20260930075028_owner_submission_risk_lexicon.sql`。Owner 可维护多语言词条、普通/高风险级别及启用状态；每次新增或修改要求近期 TOTP 和理由，保存前后快照至追加式私有审计，编辑现有规则等待行锁后会再验证 Owner/TOTP。新迁移 `20260930083720_mmwr_submission_risk_matching.sql` 扩展私有运行开关并默认关闭；Owner 经近期 TOTP + 理由审计后可以开启/关闭，等待配置行锁后再次验证 Owner/TOTP。只有未来新建的投稿标题和之后补充的资料会按所有启用词条作字面匹配。仅生成普通/高风险人工审核提示，不判真伪、不拦截/自动拒绝，也不回扫旧投稿；命中高风险的投稿仍可创建，但只呈现给 Owner 并触发 Owner 紧急站内通知。语言字段用于词条管理；由于投稿没有语言字段，扫描会检查所有启用词条。风险词库/配置审计只能经 Owner + 近期 TOTP RPC 访问，规则不可硬删除。投稿 RPC/界面仍关闭，因此当前不会接受真实投稿。上述迁移尚未执行，SQL、通知顺序、权限边界与误报校准都未验证；该阶段记录时 Owner Widget Registry 为 12 项；截至当前 Admin 有 9 项、Owner 有 16 项（含 Phase 5 Hot 门槛）。

2026-10-01 补齐用户确认的规范化重复说明范围：新增 `20261001010000_submission_duplicate_cross_field.sql`，让主体说明与补充说明组成同一匹配池；精确重复无论出现在同字段还是跨字段都会对未结案两条记录标记普通风险，标点差异仍不匹配。该迁移同时在风险扫描关闭时让状态触发器跳过同行文本匹配，并在非默认环境已打开扫描时仅重算未结案集合。静态审查后在同一尚未应用迁移中加上状态集合边界判断：仍未结案之间切换只刷新当前投稿，不重复刷新匹配同行；原文变更仍由独立触发路径刷新新旧说明同行。Staging 清单增加跨字段并发插入、更新/结案、同属开放状态切换及开关关闭检查。投稿/风险扫描仍关闭，迁移未应用，PostgreSQL/并发/权限未验证。

2026-10-01 文档一致性修正：`USER_MANUAL.md` 的普通重复说明规则已同步为主体说明与补充说明跨字段比较；只对未结案投稿做规范化精确匹配，空白/大小写不同可匹配，标点差异不匹配。此前手册文字与当前迁移及主计划不一致；本次仅修正文档，没有改变代码或开关状态。

2026-10-01 Owner IP 封锁响应数据最小化：Owner 活动封锁列表原本把完整 64 个十六进制字符的 HMAC 指纹发到客户端，UI 仅展示末 8 位。新增 `20261001033843_owner_ip_block_fingerprint_suffix_only.sql`，替换私有 RPC 与 invoker wrapper，只返回 `fingerprint_suffix` 后 8 个十六进制字符；完整 HMAC 仍只留在私有活动表用于匹配，审计不含地址或指纹，Owner + 近期 TOTP 限制保留。更新 Staging 验收和回滚说明。迁移未应用，未运行 PostgreSQL 或 Staging 验证，IP 封锁保持关闭。

### Phase 7 本地恢复设计准备（2026-10-01）

新增 [`docs/architecture/PHASE7_BACKUP_DESIGN.md`](docs/architecture/PHASE7_BACKUP_DESIGN.md)，先固定本地恢复设计边界：独立 Worker；使用 Supabase CLI 过滤过的 roles/schema/data 导出并包含 migration history；Storage 源路径只进入加密 manifest；R2 对象采用客户端认证加密与哈希校验；隔离环境验证后才可考虑 Production 恢复。新增 `backup/crypto.mjs`，提供分块 AES-256-GCM 文件信封加解密；`backup/manifest.mjs` 校验所需数据库组件、Storage 映射和大小/hash；`backup/retention.mjs` 只返回按 calendar-day/week/month 计算的保留点和删除候选，要求显式时区，只接纳成功且完整性通过的全量备份，不执行删除；`backup/r2.mjs` 仅在显式开启后使用环境凭据访问 Cloudflare R2，只提供加密对象上传/读取/列举，没有删除操作。`backup/supabase-storage-source.mjs` 用服务端 Supabase Secret Key 分层分页枚举全部桶与文件夹、使用短时签名 URL 下载并验证签名域名固定为配置项目域名，下载后比对文件大小和最后修改时间。`backup/supabase-cli-export.mjs` 新增 Supabase CLI roles/schema/data 和 migration history 导出；当前 CLI 参考称 `db dump` 排除 auth/storage 管理 schema，但 Supabase 恢复指南声称 Auth 用户数据包含在内。因官方文档冲突，Worker 现要求额外的 Auth/Storage schema 与 data 四类导出产物；当前 exporter 不提供这四项，所以全量运行会 fail closed，不能标为成功。Storage 二进制对象仍需单独复制。`backup/worker.mjs` 新增独立全量备份编排器：默认关闭；要求数据库 roles/schema/data、Auth schema/data、Storage schema/data 及 migration history 八类导出；逐件 Storage 下载后复核源对象未变化，并在复制后重新核对整份 Storage 清单；加密上传后读回核对密文 hash、GCM 认证、明文 hash/大小；最后写入并验证加密 manifest。manifest 记录数据库多次 CLI 导出的时间窗和 Storage 清单复核结果。`integrityVerified: true` 仅表示对象内容可读且校验和匹配；当前数据库导出分别读取，Storage 也与数据库独立采样，所以不代表跨数据库/Storage 的原子一致快照或成功恢复。失败只输出固定错误码，并清理本地临时目录。新增本地迁移 `20261001040905_mmwr_backup_run_ledger.sql`：私有运行表和追加式状态审计、仅 service_role 写入；失败运行首次转为终态时按固定代码将 `backup_failed` / `backup_validation_failed` 映射到固定 Owner 邮件 `backup_failure` / `backup_validation_failure`（仅具体完整性证据失败才用后一类别），队列异常不回滚运行状态；Admin/Owner 近期 TOTP 只读状态 RPC；`backup/status.mjs` 将最小状态映射到该 RPC；`backup/run-scheduled.mjs` 与 `npm run backup:once` 提供默认关闭的单次调度运行入口；`backup/restore-plan.mjs` 只为隔离目标生成只读恢复清单；Admin/Owner 的只读备份状态面板已本地接入，API 数据仍依赖尚未应用的迁移。迁移回滚注意事项见 [`docs/operations/PHASE7_MIGRATION_ROLLBACK.md`](docs/operations/PHASE7_MIGRATION_ROLLBACK.md)。仍缺每日调度、Owner 手动触发、通知投递配置、恢复执行器和隔离环境演练；失败中断可能留下无引用的加密 R2 对象，当前没有清理器。`.env.example` 中 `MMWR_BACKUP_ENABLED=false`。每日/每周/月留存目标沿用既定 7/4/6；RPO/RTO、Worker 托管环境、R2 位置、密钥轮换及 Object Lock/删除策略仍待后续确认。没有连接 Supabase/R2，也没有运行验证。

2026-10-01 举报写入边界静态复核：发现 `/api/reports` 虽强制 Turnstile，但 authenticated 仍可直接调用旧的公开写入 RPC。新增 `20261001031242_require_server_report_creation.sql` 撤销旧 RPC 的所有执行权，并将五参数写入 RPC 限定为 `service_role`；服务端只有在确认登录用户、active 状态和 Turnstile 后才传入会话 `user.id`。限额专用错误返回 429，数据库异常返回 503，失效的举报目标不写入。前端三语加入限流说明。Staging 验收和回滚说明同步更新；没有执行迁移或 Staging。另已按用户确认记录普通风险策略：仅未结案投稿比对；完全相同的规范化说明及缺少已扫描通过图片均为普通风险信号，不拦截投稿，也不判断图片真伪。

2026-10-03 Phase 3 发布事务并发静态修正：本地未应用的审核发布迁移现对发布资料/标签读取及发布事务中的数据库开关持有共享行锁，并在发布事务内锁定 intake/活动地区和选中活动 Tag；多个 Tag 按 UUID 顺序锁定。发布与关闭开关、地区停用或 Tag 停用因此按先取得锁的一方串行化。Staging 清单要求分别验证两种先后顺序，回滚表保留相同锁顺序。此项未运行 PostgreSQL/测试，未应用迁移或连接 Staging/Production；按用户要求仍等 UI 验收后才运行验证。

2026-10-03 用户计划在近期完成 Vercel 与域名注册，并希望服务就绪后在线部署和测试，以提高验证效率。后续优先准备 Vercel 托管的隔离 Staging/Preview，使用独立 Supabase Staging、合成数据、访问限制和 noindex；准备清单见 [`docs/operations/VERCEL_STAGING_PREPARATION.md`](docs/operations/VERCEL_STAGING_PREPARATION.md)。注册服务不等于服务配置完成，也不代表 Production 发布授权。UI 验收之前仍不运行测试；Production 域名切流仍需用户单独明确批准。

2026-10-01 举报写入边界静态复核：发现 `/api/reports` 虽强制 Turnstile，但 authenticated 仍可直接调用旧的公开写入 RPC。新增 `20261001031242_require_server_report_creation.sql` 撤销旧 RPC 的所有执行权，并将五参数写入 RPC 限定为 `service_role`；服务端只有在确认登录用户、active 状态和 Turnstile 后才传入会话 `user.id`。限额专用错误返回 429，数据库异常返回 503，失效的举报目标不写入。前端三语加入限流说明。Staging 验收和回滚说明同步更新；没有执行迁移或 Staging。另已按用户确认记录普通风险策略：仅未结案投稿比对；完全相同的规范化说明及缺少已扫描通过图片均为普通风险信号，不拦截投稿，也不判断图片真伪。

2026-10-01 近期操作工作台本地增量：新增 `20260930161241_staff_dashboard_recent_operations.sql` 与三语 `recent_operations` Widget。仅有近期 TOTP 的有效 Admin/Owner 可读取有限结果；每行只包含时间、固定事件/操作码及操作者用户名，不返回理由、目标 ID、报告/投稿内容、证据位置、IP 指纹或安全事件详情。Admin 不会得到 Owner 专属操作或高风险帖子/投稿操作；Owner 可查看 Owner 专属类别。Admin 默认布局版本升级，Owner 默认和可保存布局加入此工具。迁移为索引与当前默认布局各追加/调整相应元数据，没有更改或删除审计记录。Staging 清单加入角色、近期 TOTP、高风险隔离、字段最小化、数量上限及布局验证；迁移未应用，数据库授权与查询行为未验证。

2026-10-01 Storage 用量工作台本地增量：新增 `20260930162040_staff_dashboard_storage_summary.sql` 与三语 `storage_usage` Widget。仅返回 `mmwr-evidence-quarantine` 的对象数及可解析的 `metadata.size` 合计；只读查询 Supabase Storage 元数据，不改 `storage` schema、不列出文件名/路径/上传者/扫描与可见性状态，不开放 Storage 表权限。文案明确登记元数据大小不等于供应商计费。Admin/Owner 均需有效后台身份和近期 TOTP；Admin 默认布局版本前进到含 Storage 的新版本，Owner 默认和可保存布局新增此工具。Staging 清单加入不同桶隔离、大小聚合、未授权/陈旧 TOTP 拒绝、数据最小化及布局版本验证。迁移未应用，Storage 权限/统计仍未验证。

### Phase 3 公开内容修订本地增量（2026-09-30）

新增 `20260930075708_staff_post_revision_editor.sql` 与三语公开内容修订 Widget。Admin/Owner 可修改公开标题、摘要、正文措辞/排版及标签；对象名称、地区、证据、风险级别与发布状态不可在此编辑。高风险帖子仅 Owner 可读取和修订。每次保存需近期 TOTP 与必填理由，在私有追加式历史内保留完整前后快照、Actor、时间；公开内容变更在同一事务内更新 `published_previews` 投影。并发安全现以详情返回的 `updated_at` 作为版本令牌，保存时锁后比较；陈旧表单返回 `40001`，前端三语提示重新载入。锁后重新检查 staff 角色和近期 TOTP。Staging 清单增加双会话陈旧编辑和锁等待边界。该迁移尚未应用，未做 PostgreSQL、MFA/RLS、并发、公开缓存或浏览器验证；无实际数据时也未能端到端验收。

**修订历史界面及 RPC 收敛（2026-10-03）：** 历史 RPC 仅向授权工作人员返回操作者用户名，不把内部用户 UUID 发到浏览器；账号删除后用户名为空。切换目标时清除旧表单/历史，并等详情和历史都成功读取后再呈现编辑器，避免请求失败时进入半加载编辑状态。数据库/UI 尚未验证。

### Phase 3 今日概览本地增量（2026-09-30）

`20260930080627_staff_dashboard_summary_metrics.sql` 与 Widget 加入首页概览：待审核普通/可见投稿数、Owner 专属高风险待审数、马来西亚时区今日发布数，以及按 UTC 日期统计的已同意页面浏览。Admin 的 RPC 结果在数据库层将高风险计数置空，不靠前端隐藏。Analytics 默认关闭；关闭时仅隐藏页面浏览数字，其他计数仍可见。该阶段早期 Admin/Owner 数量为 7/13，后续近期操作记录和 Storage 用量将 Phase 3 默认增至 9/15；Phase 5 Hot 门槛 Widget 再使 Owner 当前默认数增至 16。迁移尚未应用，SQL/RLS、时区边界和管理员角色矩阵尚未验证。

**Analytics 默认关闭边界修正（2026-09-30）：** 今日概览统计 RPC 不再查询页面浏览聚合。只有两个 Analytics 环境开关同时为 `true` 时，服务端才调用受限分析 RPC；若 Analytics Widget 被隐藏，只读取 7 日聚合用于今日数字；关闭时页面浏览数字不会进入客户端组件数据。今日数字按 UTC 日期计算，分析 RPC 同时要求近期 TOTP。迁移与 Staging 行为尚未验证。


### 附件扫描本地进度（2026-09-30）

用户已选择自建 ClamAV。附件继续存于 Supabase Storage 私有隔离桶；Cloudflare R2 只用于独立加密备份。迁移 `20260930082648_mmwr_evidence_scan_jobs.sql` 新增私有事务 outbox 和 append-only 审计：登记 pending 证据时同事务入队；`public.mmwr_claim_evidence_scan_job()` 和 `public.mmwr_finish_evidence_scan_job(...)` 仅授予 `service_role`，内部实现只租出一件任务十分钟（Worker 操作预算：下载最多 120 秒、ClamAV 两步各最多 120 秒、claim/result 各最多 30 秒；原五分钟租约不足，2026-10-03 调整），结果须持有效 lease token 且匹配固定 outcome/reason code。后台 worker 用独立的至少 32 字节 `EVIDENCE_SCANNER_TOKEN` 访问 `/api/internal/evidence-scanner/claim` 和 `/result`，不会持有 `SUPABASE_SECRET_KEY`；broker 将对象路径留在服务端，为隔离桶对象签发 120 秒 URL。`scanner/worker.mjs` 在内存中最多读取 10 MiB，校验 Storage URL origin/bucket、登记 MIME 与文件魔数，经 ClamAV `INSTREAM` 流式扫描后提交摘要；生产容器只接受 HTTPS API/Storage origins，本地 loopback HTTP 仅允许非 production 开发进程。ClamAV 只在 Compose 私有网络可达，不发布 TCP 端口。Compose 必须配置受信且按 SHA-256 digest 固定的 ClamAV 与 Node 22 镜像，不接受浮动默认标签；`CLAMD_HOST`/`CLAMD_PORT` 由 Compose 仅在 worker 容器内指向私有服务 `clamav:3310`，无需加入宿主机环境文件。五次尝试上限、租约回收与固定错误码让不可用/超限文件停留隔离；审计只写摘要，不记录文件内容或对象路径。`clean` 是扫描状态，与可见性分开；新附件默认 `public_thumbnail`（准备公开），仍只存在私有隔离桶，待审投稿不会进入公开投影。环境样板将 `EVIDENCE_SCANNER_ENABLED=false`；未迁移数据库、未启动容器、未生成/配置 token，也没有触碰 Staging/Production。`docs/operations/PHASE3_STAGING_ACCEPTANCE.md` 新增镜像摘要、生产 origin、EICAR/干净样本、失败/过期租约及附件权限隔离检查。当前仍缺本地 Postgres/Docker 执行迁移和 ClamAV EICAR/干净样本隔离验证；附件上传、读取和投稿继续默认关闭。

2026-10-01 内部 API 静态加固：扫描结果 API 现在要求 `application/json`、4 KiB 上限、精确七字段 schema 与 UUIDv4 job/lease ID；缺字段、多余字段、outcome/reason 不匹配、clean/infected 缺少摘要或其他不合格值会在数据库 RPC 前拒绝。Broker 与结果端点所有状态响应统一 `no-store, private`、`nosniff`、`noindex`。Staging 清单补入相应边界检查。源码已与 worker payload、数据库约束和 UUID schema 对照，未运行测试或容器；功能继续保持 OFF。

2026-10-03 Worker 静态复核发现 ClamAV 尚未就绪时可能先领取扫描任务，令启动期暂时故障消耗有限重试次数。Worker 现在先对 clamd 发送 `PING`，只在收到 `PONG` 后才请求任务；不可用或返回异常时等待并重试，不创建数据库租约。Staging 验收要求证明扫描器等待期间 attempt/lease 不变，ClamAV 恢复后才开始领取。该修正没有运行验证；上传、扫描及证据公开仍关闭。

2026-10-03 Worker socket 静态复核又发现：ClamAV 在回复前正常关闭连接时，先前逻辑会清除绝对超时，但没有结束等待中的回复 Promise；若发送缓冲区正等待 `drain`，正常关闭也未必触发 `error`。现由 socket `close` 明确拒绝未完成回复和背压等待，保证 worker 走有界错误/重试路径。Staging 清单要求覆盖 PING、VERSION、INSTREAM 与背压关闭场景。没有运行容器或测试；功能继续 OFF。

2026-10-03 扫描器租约锁等待复核发现 claim/finish 仍用事务开始时刻 `now()`：claim 处理耗尽任务后若等待证据行，可能发出已缩短的租约；finish 若在 job 行锁等待到租约过期，可能仍按旧时间接收结果。未应用的 `20260930082648_mmwr_evidence_scan_jobs.sql` 现于 claim 的先前等待后用 `clock_timestamp()` 开始完整十分钟 lease；finish 先锁 scan job、再锁 pending evidence，锁后用墙钟检查 lease，过期会无状态/审计写入地返回 `false`；错误重试时点使用相同锁后时间。Staging 验收与回滚清单已同步，锁顺序为 scan job → evidence。未运行 PostgreSQL、测试或迁移；如果该迁移未来已安装，后续修正必须另建前向迁移，不能修改已应用文件。

2026-10-03 容器停止期限复核发现 Docker Compose 默认等待期为 10 秒，远短于扫描器每项有界作业预算；正常更新可能在有效租约内 SIGKILL 正在工作的 Worker。`docker-compose.scanner.yml` 现为 Worker 设置 8 分钟 `stop_grace_period`，长于最多 7 分钟的 claim + 下载/两次 ClamAV/result 总预算并留 60 秒余量，且早于 10 分钟租约到期。Worker 收到 SIGTERM 后若仍在 PING，会在之后退出且不领取新任务；已经领取的作业会完成或走有界失败路径。Staging 应分别在 PING 与合成扫描中发送 SIGTERM，确认停止行为。尚未启动容器或执行验收；扫描仍 OFF。

**Critical Security Email 本地增量（2026-09-30 至 2026-10-03）：** 新迁移 `20260930084757_mmwr_critical_security_email.sql` 新增数据库默认 OFF 的 Owner 策略，启用/关闭必须 Owner、近期 TOTP 和必填原因，并追加审计；等待设置行锁后会重新验证 Owner/TOTP，过期证明不改变策略、不写审计或清空队列。仅当有效且邮箱已确认的 Owner 可收到每人单独发送的邮件。私有队列仅保存固定类别、Owner 用户 ID、调度/重试/租约状态，不保存邮箱地址、IP、用户报告或证据。此前密码失败 Hook 已由 `20260930112131_disable_password_failure_email_alerts.sql` 移除。恢复码告警现由 `20260930111623_recovery_code_bruteforce_email_alerts.sql` 的 MFA Verification Hook 处理；邮件策略关闭时不累计短期失败计数，达到五次/15 分钟时记一条安全事件并入队。该 hook 仅处理 `recovery_code`，其余因子和错误路径均返回 `continue`；短期状态不保存 IP/设备，15 分钟 Cron 清理。Supabase 官方将托管 MFA Hook 列为 Teams/Enterprise，因此须在 Staging 确认订阅能力、Auth 版本的恢复码调用和锁定配置。本地备份 run ledger 按固定代码将普通失败排入 `backup_failure`，仅将密文摘要/字节、解密认证/明文摘要/大小或取回清单完整性证据失败排入 `backup_validation_failure`；两类邮件均不含异常、manifest、path 或 key 细节。严重 Production 异常尚无事件生产者。恢复码失败仍是唯一的异常登录邮件来源。邮件仍需数据库策略、`CRITICAL_SECURITY_EMAIL_ENABLED=true`、至少 32 字节独立 Token、SMTP 与 Supabase Secret Key；所有迁移、Cron、SQL/RLS/MFA、SMTP 与调度器尚未运行验证，不能用于线上操作。`/submit` 本地有用户确认的不可提交 UI 草稿，真实投稿仍关闭。

2026-10-01 高风险默认关闭静态复核：`.env.example` 中账号删除、First-party Analytics 双开关、IP 封锁、证据扫描/预览/可见性、投稿发布及关键安全邮件均明确为 `false`；相关数据库 runtime flag 插入默认 `false`，IP Data API guard 的 Authenticator 开关也默认 `false`。应用只在环境值精确等于 `true` 时启用对应入口。此项只检查本地样板与迁移源码，不代表数据库运行时状态或 Staging 已验证。

2026-10-03 默认关闭复核更新：重新核对 `.env.example` 的 14 个高风险/可选开关，账号删除、GA4/第一方分析、Valid Read/Hot、IP 封锁、证据扫描/预览/可见性、投稿发布、关键安全邮件和备份均为 `false`。当前工作区未发现这些开关的标准 `.env*` 覆盖，调用环境也没有这些进程级覆盖。此为本地样板/当前 shell 检查，不代表已有 Next.js 进程、托管 Vercel 或 Supabase 数据库的运行时值；外部环境尚未连接或验证。

### Phase 5 本地实现续记（2026-10-01）

Owner 已授权采用隐私保守指标默认值。本地新增 Valid Read/Hot 默认关闭管线、同意后 10 秒前台阅读 + 50% 正文滚动的客户端门槛、服务端 HMAC 签名 HttpOnly/SameSite Strict 同意证明、发布状态复核、速率限制、短期 per-post 去重、Owner TOTP/原因阈值设置和审计；Hot 只返回公开预览投影中的已发布帖子，首页及 `/hot` 仅在客户端、服务端与数据库开关都启用时读取。Unique Visitor、Session、分享/回流、广告采集仍不在 V1。所有相关开关为 OFF。新增迁移未应用，代码、RPC、Cron、Cookie 同意撤回和 Widget 角色矩阵均未验证；Owner 需先完成 UI 检查，之后再做自动化/本地数据库验收。托管环境还需隐私/保留期限审阅及后续逐项 Staging 配置；Production 未授权。

### Clarification V1 本地实现（2026-10-03）

用户确认：继续使用现有帖子模型，新增独立 `story` / `clarification` 类型与一对一关系表；一篇澄清最多关联一篇原帖，一篇原帖最多有一篇澄清。Admin/Owner 可在 Staff 工作台起草、修订、发布；发布迁移开关默认 OFF，写入仍要求 Staff 权限、近期 TOTP、原因与数据库事务审计。Owner 专属重新绑定、Admin 撤下建议与 Owner 决议保持分离；隐藏原帖时 Owner 明确选择是否保留澄清。若保留，公开元数据与登录正文会隐藏原帖及澄清中可能泄露原帖信息的字段，只显示中性不可用提示。

公开实现包括三语 `/clarifications` 目录/独立详情、原帖详情的反向提示、搜索建议/结果徽标、Tag 页面与路径跳转、当前公开原帖选择，以及不保存、不提交、不代发的 Telegram 文本草稿。只有严格有效且由 Owner 后续配置的 `PUBLIC_TELEGRAM_SUPPORT_URL=https://t.me/<username>` 才会显示 Telegram 入口；当前样板留空。此入口仅用于澄清请求，不改变申诉/更正/撤下政策。共享帖子 UUID 作为 V1 Case ID。原普通故事的 Latest、Hot、首页标签统计与地区结果保持仅统计 `story`；Tag 目录/搜索可展示两种公开类型。

迁移 `20261003130000_mmwr_clarification_system.sql` 与后台布局迁移 `20261003131500_mmwr_clarification_dashboard_widget.sql` 仅存在本地；没有应用数据库、配置 Telegram、启用发布或索引，也没有接入 Staging/Production。代码和文档处于 UI 检查阶段，尚未执行测试、lint、TypeScript、构建或浏览器验收。证据附件遵循现有隔离规则，投稿和附件能力不因此开放。用户先验收 `/clarifications` 与 Admin/Owner 工作台，反馈完成后再开始自动化/本地数据库/构建验证。

Clarification UI 续记：Owner 可在专用工作台通过近期 TOTP 与必填原因启用/关闭发布开关，默认仍关闭；开关变更单独追加至澄清审计。目录卡片同时显示原帖链接；原帖不可公开时只显示中性不可用提示。该续记仍属于待 UI 验收的本地实现。

2026-10-03 隐私呈现续记：当 Owner 保留澄清但隐藏原帖时，目录卡片和详情页只显示本地化的中性不可用状态，不再渲染澄清占位标题/名称/地区、摘要、标签、正文、Reaction 或分享控件；详情 metadata 使用本地化通用文案，并省略结构化文章数据。此为静态代码改动，仍待 UI 验收及后续验证。

2026-10-03 Clarification 验收资料续记：Phase 3 UI review 现包含澄清目录、详情、双向关联、不可提交请求草稿及后台角色可见性检查；Staging acceptance 覆盖类型/一对一约束、默认关闭发布、Mother/Son 隐私抑制、审计、搜索与普通故事流分离、Telegram 无发送检查；迁移回滚表新增两份 Clarification 迁移说明。以上仅为本地计划资料，迁移未应用，Staging/Production 状态未验证；测试、构建和数据库验证仍按用户要求等待 UI 验收。

澄清撤下决议静态修正（2026-10-03）：Owner 决议 RPC 现在显式拒绝 NULL 与未知 decision，避免 PostgreSQL 的 NULL/三值逻辑让无效决议继续写入未决 Proposal 的审计记录。未应用迁移，也未运行 SQL 测试；Staging 验收清单现要求验证无效值无副作用。

澄清标签并发静态修正（2026-10-03）：Admin/Owner 创建或修订 Clarification 时，先按 Tag UUID 顺序共享锁住所有仍活动的选定标签，再做有效性检查与写入；标签停用若先提交则该写入失败，若写入先持锁则停用等待。该锁顺序及重复/不存在/已停用/NULL 标签负向用例加入 Staging 清单。迁移未应用，SQL 行为未验证。

澄清锁等待时间戳静态修正（2026-10-03）：创建、修订、发布、隐藏、重绑及 Owner 撤下决议会在取得写入所需的行锁并再次确认权限后，才采样本次墙钟事件时间。Staging 清单要求测试锁等待期间 TOTP/Staff 权限过期时无副作用，以及成功事件时间取锁后时间。未运行 SQL 验证，迁移未应用。

澄清 Admin 撤下提议竞态静态修正（2026-10-03）：Admin 提议前现在先锁住仍可处理的 Mother 和关系，再复核 Admin/TOTP 并采样统一事件时间；避免 Owner 同时永久移除或隐藏 Mother 时留下过期提议。未运行 SQL 验证，Staging 清单补入权限过期的锁等待用例。

澄清权限锁后复核补正（2026-10-03）：创建/修订在活动 Tag 共享锁之后再次检查 Staff 角色与近期 TOTP；隐藏 Clarification 在关系行锁后再次检查 Owner/TOTP。Staging 的锁等待场景覆盖这些复核点；仍未执行 SQL 验证。

### 真相页本地 UI 预览（2026-10-03）

用户要求将澄清目录标题改为「真相页」，并用低成本方式增加可查看的内容。三语目录标题/导航和页面 metadata 已更新；说明文案明确其为经审核的澄清与补充信息，不代表官方裁决或所有争议均有最终结论。非 Production 的第一页展示一张独立静态示例卡，醒目标注“本地界面演示 · 非真实帖子”；样例不指向任何真实个人、企业、事件或地区，无虚构数字、数据库写入、详情链接或索引入口。Production 下服务端不启用此卡。用户于 2026-10-04 认可目录 UI。

### 澄清页验收后的本地验证（2026-10-04）

全仓 ESLint 通过（0 error、3 个 warning：搜索文件未使用类型导入、投稿队列 ref cleanup 静态告警、Supabase 客户端内部导航告警）；`npx tsc --noEmit` 通过；Next.js 16.3.6 production build 通过并生成 38/38 页面。构建通过 `MMWR_VALIDATION_DIST_DIR=.next-validation` 使用独立输出，不覆盖仍在运行的开发服务器；该输出已加入 `.gitignore` 与 ESLint 忽略。对本地 `/zh-cn/clarifications` 的 HTTP 冒烟请求为 200，标题与本地演示标记均在响应中。

仓库没有 `npm test` 脚本；Supabase pgTAP SQL 测试未运行，因为本机未安装/运行 Docker 或 Podman（Supabase CLI 无法检查本地容器）。当前没有 Supabase project link、本地数据库连接变量或 Vercel CLI，未应用迁移，未连接 Staging/Production，也未向远端服务写入。Docker/PostgreSQL 验证与隔离 Staging 验收仍待环境就绪。上述验证只覆盖 lint、类型、Next.js 编译/页面生成和一个本地 HTTP 冒烟请求，不代表数据库正确性、完整浏览器验收或线上就绪。

此前 `content_access.test.sql` 仍允许合成的 verified 用户创建投稿/追加资料；此旧用例已按当前投稿关闭政策更新为无执行权限和 `42501` 拒绝断言，并覆盖证据登记 RPC 权限。断言数仍为 53，待 Docker/PostgreSQL 可用后执行 pgTAP。

2026-10-04 地区浏览页面 UI 续记（历史快照，已由下方更新取代）：按用户纠正，已撤回本轮首页地图布局/点击行为的改动，首页恢复原有互动地图；当时地区页只使用州属示意轮廓，District 目录/边界未接入。

2026-10-04 Clarification 安全静态复核：只审查 `20261003130000_mmwr_clarification_system.sql` 与 `20261003131500_mmwr_clarification_dashboard_widget.sql`，未确认可报告的安全漏洞。Codex Security 扫描标为部分覆盖：整个迁移目录有 76 个文件，除上述两份外的 74 份没有审查；没有独立扫描代理。迁移没有应用、数据库没有连接，也没有运行 SQL 测试或 Staging/Production 验证。报告保存在 Codex Security 扫描工作区。

### Phase 3 当前交接状态（2026-10-04）

本轮修正 `USER_MANUAL.md` 开头的状态摘要：明确 `/submit` 是不可提交的 UI 草稿，正式投稿、附件上传/读取与有效阅读/Hot 均未启用；局部 Clarification 验证记录不代表 Phase 3 全面验收。另对照后台会话活动 API、浏览器 Supabase fetch、Staff session helper、迁移和 Staging 检查项，未发现其 15 分钟闲置/8 小时上限规则描述冲突；该静态核对没有验证浏览器/SQL/并发行为。用户于 2026-10-04 表示已检查的整体 UI 满意，只有标签页完整数据画面尚未看到，并说明因当前没有示例数据而无法查看部分运行场景；用户授权继续推进。`/tags` 组件和详情路由已存在，但本地目录因 Supabase 未连接显示服务不可用；不以虚构 Tag/帖子填充。

2026-10-04 本地验证：`npm run lint` 通过，0 errors、3 warnings（Search 未用类型导入、投稿队列 ref cleanup 静态告警、Supabase 客户端内部导航静态告警）；`npx tsc --noEmit` 通过；Next.js 16.3.6 production build 通过并生成 38/38 页面；简中/英文/马来文 14 个主要页面路由共 42 次 HTTP 检查均为 200，另有 `robots.txt` 与 `sitemap.xml` 各为 200。构建使用 `.next-validation` 避免覆盖运行中的开发输出；已清除构建自动加入 `tsconfig.json` 的 `.next-validation` 类型路径。仓库没有 JavaScript test script；4 份 Supabase pgTAP SQL 套件未执行，因 `supabase status` 确认 Docker 与 Podman 均不可用。无数据库链接、迁移应用或 Staging/Production 访问，因此这些本地结果不证明 RLS/RPC、真实数据、TOTP、并发、扫描器、邮件、浏览器交互或线上服务行为。未连接/写入任何外部服务。Staging 服务仍未获准操作，投稿、附件、IP 封锁、关键邮件等高风险功能保持关闭，更正/撤下及永久封禁申诉入口仍关闭。

### Phase 6 本地 metadata 续进（2026-10-04）

`lib/seo/localized-page-metadata.ts` 为采用共用 noindex metadata 的公开列表/地区筛选页增加与当前路径一致的三语 canonical 和 `en-MY`、`zh-CN`、`ms-MY`、`x-default` hreflang。只有 `VERCEL_ENV=production`、`ALLOW_SEARCH_INDEXING=true` 且配置有效 HTTPS 站点域名时才输出完整 URL；本地/预览环境无 canonical/hreflang 外链。Latest、Hot、Tags、地区页仍明确 noindex；未改动索引门、robots、sitemap 或收录任何帖子。这是源代码准备，不是 SEO 验收；尚未运行 lint、类型检查、build、浏览器/爬虫检查或 Staging/Production 验证。

### Phase 5 Valid Read / Hot 完整性阻断（2026-10-04）

`docs/operations/PHASE5_ACCEPTANCE.md` 与 `docs/architecture/PHASE5_ANALYTICS_CONTRACT.md` 现明确记录：客户端自报可见秒数、滚动比例与去重 token 不能证明真实阅读；签名的 Analytics 同意凭证只证明同意状态。Valid Read/Hot 保持关闭，必须先重设计证据模型，或由 Owner 明确接受并准确命名较弱指标。限速与去重不能解除此门槛。此项为静态代码审查记录，没有运行测试或真实流量验证。

### Phase 7 local backup-worker hardening (2026-10-04)

Phase 7 review found that the manifest is intentionally read back twice (once for encrypted artifact verification, again before parsing), but both calls reused fixed `wx` temporary paths; the second call would fail on an existing file. Verification paths now include fresh random suffixes. Storage object backup now enforces a per-object stream cap from `MMWR_BACKUP_MAX_STORAGE_OBJECT_BYTES` (10 MiB example default, configurable to at most 1 GiB), checks listed size before download, meters actual bytes during streaming, and rejects an excessive or mismatched `Content-Length` early. Short, oversized, or inventory-mismatched streams fail closed. This cap is per object and does not bound total workspace usage. Added staging cases cover cap/mismatch/no-length streams, duplicate manifest readback, and cleanup. No tests/build/worker/R2/database operation was run. Backup and notification switches remain OFF; the managed Auth/Storage database export gap still blocks a complete run.

Phase 7 storage budget follow-up（2026-10-04）：除单对象上限外，`backup/worker.mjs` 现要求显式提供 `MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES`，并在开始下载前核对初始目录的总源字节数、在最终目录复查预算与整数溢出。样板保持此变量未设，提醒工作区还需要为加密、回读、解密及数据库导出预留额外磁盘空间；未配置总预算时备份不能运行。验收文档已增加超过预算/最终目录增长的失败检查。没有运行 worker 或测试；备份仍关闭。

Phase 7 预算失败前置顺序（2026-10-04）：worker 现于任何数据库导出或 R2 上传前校验两个字节预算配置；超限的初始 Storage 清单则在 Storage 对象下载前拒绝。这样缺失运维预算不会留下数据库 artifact 上传物。未执行运行验证。

Phase 7 运行状态前置记录（2026-10-04）：备份 Worker 现先写入初始 `running` 状态，再检查 Worker 专用密钥、磁盘目录/预算和构建 R2/数据库/Storage adapter；这些前置错误在状态账本可用时应转为固定 `backup_failed`，且不得导出数据库或上传对象。Supabase URL、服务凭证或状态 RPC/数据库本身不可用时无法保证写入账本，流程在准备数据源前失败并只输出通用 CLI 错误。此项仅为本地实现与 Staging 验收准备，未运行 Worker、测试或服务连接。

### Phase 5 Owner Campaign CRM 报价记录（2026-10-04）

用户确认采用 Owner 私有、只记录客户名称/报价金额/计价方式/拟议广告位置/日期/文字素材说明/状态的范围；不保存联系方式、不投放、不追踪、不自动计费。现新增 Owner Dashboard 面板和 `20261004180000_mmwr_owner_campaign_crm.sql` 私有表/RPC。币种暂按 MYR；Flat Fee/CPM/CPC 都只是报价，状态“已确认”也不触发投放。读写需 Owner + 近期 TOTP，写入需理由，审计不复制客户/报价字段。账号删除时 creator/actor UUID 可空化以保留报价与审计、不阻断 Auth 删除；审计仅允许此空化，其余保持追加式。报价以十进制文本提交并导出，避免 JavaScript 浮点转换改写分位。商业记录保留期限仍须在用于真实客户资料前确认。报表可按客户/位置/日期筛选，并下载 CSV 或打印 PDF（MMWR/白牌）；只导出当前最多 100 条 Campaign 字段。Admin allowlist 不包含此 Widget。迁移未应用；未运行测试、构建、浏览器、SQL 或 Staging 操作。需要先审 UI，再由用户授权验证；分析/广告开关维持原状。

Owner 的 Phase 5 界面检查清单见 `docs/operations/PHASE5_UI_REVIEW.md`。MYR 是此首版表单的临时固定币种假设；若 Owner 希望记录其他币种，可在 UI 审查后调整，再开始验证。

### Phase 3 Owner deletion review layout migration（2026-10-04）

修复 Owner Dashboard 新增账户删除人工审核队列后，数据库布局仍只接受旧 Owner Widget 数量的问题。新迁移 `20261004170000_mmwr_owner_deletion_review_dashboard_widget.sql` 将上限及默认/allowlist 延展至 19，Admin 保持不变。迁移未应用且未运行 SQL 或 UI 验证。

### Phase 6 公开投稿结构化资料准备（2026-10-04）
公开帖子详情页在生产 HTTPS 域名与显式索引总开关都有效、且公开投影可用时输出中性的 `CreativeWork` JSON-LD，不使用 `Article` / `NewsArticle`，避免把未经证实的用户陈述包装成编辑性新闻。内容严格限于页面的审核标题、公开摘要、页面语言和规范 URL；未加入登录墙正文、身份/证据或不可靠的发布时间字段。详情页仍 noindex，Sitemap 未更改，因此这是索引开放后的本地准备，不代表页面可被收录。按当前流程没有运行 lint、类型检查、构建、浏览器或 Schema 验证。

### Phase 3 Owner IP 自我封锁防护（2026-10-04）
Owner 创建 IP 封锁前须有近期 TOTP、有效配置和可解析的可信当前客户端地址；来源缺失或无效时拒绝且不写封锁或审计，目标与当前地址相同则拒绝。三语 UI 增加单独提示，Staging 清单要求确认无状态变化。未运行测试、迁移或托管服务验证；IP 封锁仍 OFF。

### Phase 3 Owner IP 配置状态文案（2026-10-04）
`getOwnerIpBlockConfig()` 的字段现命名为 `configured`，表示必需环境设置存在，不代表 ingress 已验证；后台三语文案明确这一差别，配置齐全但来源未经验证时显示警示色。Phase 3 UI review 清单已同步。未运行浏览器/UI 验收，IP 封锁仍 OFF。
后续静态引用复核发现请求头解析函数仍读取旧 `ready` 字段，现已同步到 `configured`；Proxy、Owner 动作与解析函数的源码引用均已核对，无旧字段残留。未运行测试或浏览器验证。

### Phase 3 Owner IP 多值请求头拒绝（2026-10-04）

Next.js 可信客户端 IP 解析现在仅接受单个地址；逗号分隔的代理链、缺失或非法值均 fail closed。新增 `20261004160000_owner_ip_block_reject_header_chains.sql`，包装 PostgREST 原检查并拒绝多值/缺失头后再运行既有地址/HMAC校验；迁移仅允许替换已知旧 hook，遇到未知 hook 会停止。Phase 3 Staging 和回滚清单已同步，迁移清单之后另加入 20261004 Owner self-block RPC 更正，见下节。

### Phase 3 Owner IP 写入 RPC 自我封锁绕过修正（2026-10-04）

静态复核发现已存在的三参数 `owner_add_ip_block` 可由已认证 Owner 直接调用，绕过 Next.js Server Action 检查。新增 `20261004050521_owner_ip_block_database_self_block_guard.sql`：撤销旧三参数 private/public 函数的客户端执行权，以短时服务端 HMAC proof 绑定 actor、目标指纹、理由、到期时间及签发时间；数据库在 advisory lock 和过期清理之后再次校验 proof、Owner/TOTP，并从当前 PostgREST 请求头重新计算调用者指纹，拒绝目标等于当前地址。Server Action 只把可信来源地址转发给这个专用 Supabase client 的 PostgREST 请求；Auth、Storage 与浏览器不接收此地址。Phase 3 验收和回滚清单已补入直接旧 RPC 拒绝、proof 负向/正向、地址变化与请求头隔离检查。迁移未应用；没有运行 SQL、测试、构建、浏览器或托管服务操作，IP 封锁仍 OFF。

### Phase 3 Owner deletion review pagination（2026-10-04）

Owner 账号删除人工审核列表新增 50 条一页的 keyset 分页，额外读取第 51 条判断是否有下一页；保留原零参数 RPC 的首批有界兼容行为。分页游标传递数据库原始时间戳文本，避免转成 JavaScript `Date` 后丢失 PostgreSQL 微秒精度；Owner/近期 TOTP 失效时显示错误，不伪装成空队列。列表仍只含用户名、申请时间和固定原因，没有 UUID 或审核/删除/移交动作。新增未应用迁移 `20261004170001_owner_account_deletion_review_pagination.sql`；Phase 3 日期范围迁移清单共 52 项。没有运行测试、构建、SQL、浏览器或远端服务操作；删除申请与清理开关仍关闭。

### Phase 3 account-deletion claim post-lock clock correction（2026-10-04）

Static review found that the original claim function sampled its timestamp before locking candidate profiles. A lock wait could consume part of the 30-minute processing lease and make `updated_at` predate the claim decision. Added forward migration `20261004170002_mmwr_account_deletion_claim_post_lock_clock.sql`: it rechecks expiry after the row lock, then samples a fresh wall clock after evidence inspection for the lease/review transition. Service-role access, both database gates, evidence checks, and the bounded claim size remain. Updated the Phase 3 rollback, Staging acceptance, exit audit, and account-deletion policy notes; the Phase 3 migration inventory is now 53. No SQL, tests, build, browser, worker, or remote-service operation was run; deletion gates remain OFF.

### Phase 3 account deletion Auth transport failure handling（2026-10-04）

The one-shot worker previously moved a profile to Owner review when Supabase Auth returned an error object, but a thrown transport exception escaped the per-user branch, left the profile processing, and allowed a later lease reclaim. It now maps a returned Auth error response to `auth_cleanup_failed` and a thrown transport exception/timeout to `auth_cleanup_uncertain`, without logging provider details or user IDs. Forward migration `20261005000000_account_deletion_uncertain_auth_failure.sql` expands the service-only review RPC reason allowlist. Neither outcome is automatically retried. Staging must confirm definite provider rejection versus ambiguous delivery and review-RPC failure. No tests, build, worker, SQL, or remote service was run; cleanup gates remain OFF.

The Worker Supabase client now applies a 20-second AbortSignal timeout to each HTTP request so a claim, Auth deletion, or review RPC cannot wait indefinitely. An Auth timeout can leave provider-side completion uncertain; the review/acceptance docs state this and require reconciliation before any later operation. No runtime behavior was exercised.

### Phase 3 account-deletion at-most-once Auth checkpoint（2026-10-04）

To honor the user's no-automatic-retry rule even if the worker dies before recording an Auth error, added `20261004170003_mmwr_account_deletion_attempt_checkpoint.sql`. A service-role-only RPC locks the profile, rechecks both DB gates, the live 30-minute claim and evidence ownership, then persists an attempt marker before the external Auth delete. The worker will not call Auth unless that RPC returns true. If the worker later stops and the marked lease expires, the claim moves the profile to `auth_cleanup_uncertain` Owner review instead of returning it for another Auth deletion. A crash before the checkpoint can be safely reclaimed. The review UI now has a localized fixed reason. Each Supabase HTTP request has a 20-second abort timeout. Updated acceptance, rollback, UI review, exit audit and account deletion policy; the inventory at that checkpoint was 54, later extended to 55 by the approved username-history cascade migration. No worker, tests, build, SQL, browser or remote service was run; all deletion gates remain OFF.

The one-shot Worker summary now calls its counts `claim records returned`, `accounts deleted`, and `Auth outcomes sent to manual review` (`authOutcomesSentForReview`). The first is only the number of IDs returned by the claim RPC; evidence cases transitioned inside the RPC are not included. The review counter includes definite returned errors and uncertain thrown transport outcomes handled by the Worker, not evidence cases transitioned inside the database claim RPC.

### Phase 3 account-deletion username-history policy (2026-10-04)

The user chose to delete all `private.username_history` rows belonging to an account when its Auth identity is deleted. Historical usernames are not retained or reserved; reuse remains governed by the current Profile username uniqueness constraint. New forward migration `20261004190000_mmwr_delete_username_history_on_account_deletion.sql` changes the Auth FK to `ON DELETE CASCADE`, and `identity_roles.test.sql` now asserts that the history is removed. Staging acceptance covers synthetic accounts with and without history. The Phase 3 migration inventory is now 55 files. No migration or test has run, and both account-deletion gates remain OFF.

### Phase 3 retained staff audit identity unlinking (2026-10-04)

The Master Plan's account-deletion rule says to unlink account identity while retaining necessary audit. New forward migration `20261004200000_anonymize_retained_staff_audit_actors.sql` applies that rule to the five restrictive Auth references in Hot-threshold audit, Reaction-icon audit, Clarification relationship creator, and Clarification removal proposals. It uses `ON DELETE SET NULL`, preserves proposal/decision/reason/time and audit rows, and adjusts the decided-proposal constraint to accept the anonymized actor. The Clarification relationship triggers permit only the exact creator-nullification with all other columns unchanged; normal relation edits remain restricted to the Owner RPC. Phase 3 rollback and Staging acceptance now cover migration order and synthetic deletion cases; static inventory matches all 56 Phase 3-range migrations to rollback rows. This migration remains unapplied; no SQL/tests/build/browser/remote operation was run and account-deletion gates remain OFF. Audit retention duration and evidence-case resolution remain separate policy/legal-review topics.

A follow-up source census found 57 migration declaration occurrences referencing `auth.users`. The six initial `ON DELETE RESTRICT` declarations are covered by the later username-history cascade and retained-actor anonymization migrations; no remaining final-chain Auth reference intended to block deletion was found. Staging acceptance now requires querying actual inbound Auth constraints after migration application, because the source inventory cannot prove deployed schema state. No database or hosted service was queried.

### Phase 3 retained Owner settings audit guards (2026-10-04)

Static review found that the Hot-threshold and Reaction-icon Owner audit tables had no UPDATE/DELETE/TRUNCATE guards. Added forward migration `20261004210000_preserve_owner_audit_append_only.sql`; after the actor FKs are nullable under `20261004200000`, it permits only FK-driven non-null-to-NULL `actor_user_id` changes with every other row field unchanged. All other update/delete/truncate operations raise `42501`. The two audit rows and their values/reasons/times remain intact when an Auth actor is deleted. Staging acceptance and rollback guidance now cover the exact exception and rejected mutations. The Phase 3 rollback inventory is 58 files after the 20261005 Auth-outcome classification correction. Migration remains unapplied; no PostgreSQL/test/build/browser/remote operation was run; all related feature gates remain OFF.

### Phase 3 migration-source RLS inventory (2026-10-04)

A read-only static scan found 73 distinct tables created across the current migrations; every one has an `ENABLE ROW LEVEL SECURITY` statement, with no `DISABLE ROW LEVEL SECURITY` statement found. All 68 `private` table names have an explicit `REVOKE ALL ON TABLE`, and all five `public` tables have at least one policy declaration. The earlier SQL-source signature scan parsed 348 function declarations into 274 distinct qualified identity signatures; the new forward migration adds one declaration of the existing identity, giving 349 declaration occurrences while retaining 274 distinct signatures. Each signature has an explicit `REVOKE ALL ON FUNCTION` statement in migration sources. The earlier scan found 243 `SECURITY DEFINER` functions; the new migration adds one, for 244 declarations in the current source. These inventories do not establish applied schema state, policy correctness, final ACL/default privileges, ownership, inherited privileges, wrapper permissions, function semantics, or runtime behavior. The complete RLS and role matrix remains unverified until post-UI local database and isolated Staging acceptance. The check did not connect to Supabase or run SQL.
### Phase 6 公开故事详情索引与分片 Sitemap 本地增量（2026-10-04）

此处是 2026-10-04 的历史实现快照，已由当前动态 sitemap 设计取代。当前 `/sitemap.xml` 按请求生成索引，`/sitemap/<id>` 按当前公开投影和分片数量生成 XML；`robots.txt` 仅在可信 Production HTTPS origin 与 `ALLOW_SEARCH_INDEXING=true` 同时成立时指向索引。公开详情的三语 hreflang 和 index/follow 也受同一门槛控制。当前生产预览只验证了关闭门后的 Disallow/noindex/no-store 拒绝路径；未开启索引、未验证公开内容数据、Staging、Search Console 或真实爬虫。具体最新实现与测试证据见 `MASTER_PLAN.md` 的 Phase 6 动态 Sitemap 记录。

### Phase 5 Campaign CRM 金额精确显示修正（2026-10-04）

CRM 报价以十进制字符串保存和导出；列表显示原先把最多 12 位整数金额转成 JavaScript `Number`，极大金额的分位可能因此失真。现使用整数部分的 `BigInt` 做本地化分组，并直接拼回数据库返回的两位小数文本，避免浮点舍入。没有改动数据库范围、数据、币种或导出字段；未运行 UI、测试或构建，等 Owner 完成 UI 检查后统一验证。


2026-10-04 District 地图/布城合并续记：用户授权使用 geoBoundaries 固定版 159 个 MYS ADM2 边界，并要求将布城并入 Kuala Lumpur。地图 JSON 共 159 features，按 15 个地区文件提供；ADM2 没有独立 Putrajaya District 边界，原 ADM1 布城轮廓与 KL 组合显示。地区浏览页选州会显示裁剪后的 District 线；首页选州仍只显示州属轮廓；列表、旗帜映射和旧 Putrajaya URL 均改为吉隆坡。新增本地数据库迁移种入 159 个 District，并将旧 Putrajaya 公共计数/列表范围汇入 KL；私有原 area ID 保留用于追溯。迁移未应用，Supabase 未连接。已补三语 UI 来源说明和数据来源文档。已本地打开地区页并目视预览柔佛 District 线与 KL+布城组合轮廓；地区计数/目录服务不可用符合当前 Supabase 未连接状态。完整测试仍留到用户检查完 UI 后；本轮没有运行测试、lint、TypeScript、构建或数据库迁移。
2026-10-04 本地整站验证续记：用户确认当前 UI 满意后，修复两处 TypeScript 错误、三个加载 effect lint 错误和地区地图 CSS Module 类名未绑定问题；地区页现能显示州形状和 District 分界，首页仍只显示州属边界。最新本地检查：lint 0 errors / 2 warnings；TypeScript 通过；独立构建输出 38/38 路由；编译产物三语主要页面 HTTP 48/48；四项安全响应头、`zh-CN` 根语言、默认 noindex、robots 与 sitemap 路由检查通过。geoBoundaries 文件为 15 个、159 个 District。未运行 SQL pgTAP：本机缺少 Docker 命令；项目无 JS test script。全量 `npm audit` 报出 `eslint-config-next` 开发工具链携带的 `braces <= 3.0.3` 高危公告；上游无修复，生产依赖审计为 0 vulnerabilities。强制修复会降级 Next ESLint 配置，因此暂不采用；跟踪 GHSA-vfj7-8cjw-p6xm 并待上游兼容修复。当前没有连接 Supabase/Vercel/真实服务器；不得据此声称 Staging/Production 或数据库验收完成。

### Local Supabase migration and pgTAP verification (2026-10-04)

After the user confirmed firmware virtualization was already enabled, Docker Desktop and the local Supabase stack were available. `supabase db reset --local --no-seed` successfully rebuilt the local database and applied the entire migration chain through `20261005100000_mys_district_map_and_putrajaya_merge.sql`. `supabase test db --local` passes all 6 pgTAP files and 139 assertions. Added local coverage verifies the exact 159 District catalogue, public region/child counts, Putrajaya/Kuala Lumpur merge, wrong-parent post isolation, and Owner-only Campaign CRM including recent TOTP, Admin denial, exact quote storage, lack of contact fields, and append-only audit behavior. During the broader run, stale tests were aligned to the current typed reaction toggle, and the Owner fixture's single `request.jwt.claim.sub` was synchronized with its JWT claims after an anonymous-role test. The existing closed-submission expectations were retained. Backup-run, reaction-icon, and Owner campaign list functions now declare volatility consistent with their time-sensitive staff-session checks. `supabase migration list --local` shows all local migrations applied with no local version divergence. `supabase db lint --local` exits 0 with no schema/error-level findings; it still emits 7 unused row-lock result-variable notices in legacy revoked helpers and a few current lock patterns. `supabase db advisors --local --type all --level warn` reports no issues. The local Next.js server was restarted; nine key Simplified Chinese routes (`/`, `/areas`, `/clarifications`, `/submit`, `/admin`, `/hot`, `/latest`, `/tags`, `/search`) returned HTTP 200. Browser automation did not permit refreshing the existing tab, so the user may refresh manually. This is local verification only: no linked or hosted Supabase, Vercel, Staging, or Production was connected or queried, and pgTAP does not replace the full RLS acceptance matrix or browser/UI review.

### Local verification continuation: Clarification and application gates (2026-10-04)

Added `supabase/tests/clarification_access.test.sql` to exercise the default-closed publication gate, Owner/Admin separation, recent-TOTP Owner gate changes, append-only audit, staff draft/publish flow, and anonymous access to sanitized Clarification projections and parent links. The fixtures use synthetic Auth users and posts inside a transaction that rolls back. Full local pgTAP now passes **7 files / 157 assertions**. `supabase db lint --local` exits 0 and reports seven extra notices for unused lock-result variables; `supabase db advisors --local --type all --level warn` finds no issues. `supabase migration list --local` confirms the current local migration chain is present through `20261005100000_mys_district_map_and_putrajaya_merge.sql`.

Application checks also pass: `npm run lint` exits 0 with two existing warnings in `StaffSubmissionQueue.tsx` and `lib/supabase/client.ts`; `npx tsc --noEmit` exits 0; production build in isolated `.next-validation` succeeds and generates all 38 routes. The build's automatic `tsconfig.json` include changes were removed after completion. This remains local-only: no hosted Supabase, Vercel, Staging, or Production connection was made. Full manual UI acceptance, the remaining RLS edge-case matrix, external provider integration, and deployment validation remain open for their appropriate local/Staging phases.

### Local verification continuation: deletion worker and report audit (2026-10-04)

Added transactional pgTAP coverage for the account-deletion lifecycle and feedback review. Worker tests cover default-off application/cleanup gates, seven-day request cancellation boundary, service-role RPC grants, evidence diversion to Owner review, at-most-once Auth checkpoint, uncertain transport outcomes, and Owner/Admin queue separation. Report tests cover server-only creation after the Turnstile boundary, five-per-hour cap, active-account requirement, MFA-gated Admin review, and audit fields.

Those tests exposed that `private.user_report_audit` had no mutation trigger despite being described as immutable. Added forward migration `20261005110000_mmwr_report_audit_append_only.sql`; it rejects audit edits/deletes/truncation while allowing only Auth-FK actor anonymization with every other field unchanged. Updated Phase 3 rollback and Staging acceptance notes. After a local DB reset applied the added migration, all **9 pgTAP files / 202 assertions pass** with rollback-only synthetic data. The account-deletion Worker and external Auth deletion were not run; hosted migration state remains untouched.

### Local verification continuation: Owner IP-block boundary (2026-10-04)

### Local verification continuation: Owner IP-block boundary (2026-10-04)

Added `supabase/tests/owner_ip_block.test.sql`. It creates a synthetic 64-byte Vault HMAC key within the test transaction and removes it on rollback; checks RLS and RPC grants; rejects forged proofs, comma-separated proxy chains, and blocking the request's current address; then verifies one valid non-self block produces one audit row and the Owner list can read it. The real IP-enforcement switches remain OFF. Full local pgTAP now passes **10 files / 215 assertions** after migration `20261005110000_mmwr_report_audit_append_only.sql`; all test fixtures roll back. The local migration inventory includes 60 Phase 3-scope files. No hosted database was connected or changed.

### Local verification continuation: Phase 5 Analytics data boundaries (2026-10-04)

Added `supabase/tests/analytics_boundaries.test.sql` with 24 pgTAP assertions. It checks that analytics tables have no direct client/Service Role reads; Page View and Valid Read writers are service-only; the route allowlist rejects `submit` and private routes; refreshes increment without visitor deduplication; the Page View limit is 60/minute; staff reporting requires recent TOTP and hides historical `submit` aggregates; Valid Read/Hot default off and reject writes/ranking; and synthetic expired rows are removed at the 48-hour/30-day/13-month boundaries. Full local pgTAP now passes **13 files / 277 assertions**, and fixtures roll back. The local migration inventory matches disk through `20261005110000_mmwr_report_audit_append_only.sql`. `supabase db lint --local` exits 0 with seven unused lock-result notices; Supabase Advisor reports no issues. ESLint passes with two existing warnings, and TypeScript passes.

This does not complete Phase 5. Browser consent withdrawal/PV end-to-end, the Consent Attestation API, Owner Hot threshold UI, Campaign CSV/PDF exports, and real scheduled cleanup remain unverified. The Valid Read integrity blocker remains: a browser can forge dwell time, scroll percentage, and its deduplication token, so Valid Read/Hot must stay disabled and cannot be described as verified reading. All collection and advertising switches remain off. No hosted Supabase, Vercel, Staging, or Production has been connected; continue local application coverage, then present the UI for Owner review before any authorized real-server/Staging validation.

### Local verification continuation: backup core and Worker (2026-10-04)

Added `backup/backup-core.test.mjs` and `npm run test:backup`, with 12 Node tests using generated files and an in-memory object store. Coverage includes streaming AES-256-GCM round-trips/tamper rejection, temporary plaintext cleanup, manifest/path validation, retention dry-run selection, size limits, offline isolated restore plan, default-off behavior, and an injected full Worker run plus corrupted readback. The end-to-end fixture exposed two real stream-handling bugs: the Worker re-wrapped a returned Storage Readable and passed the asynchronous R2 read Promise without awaiting its stream. The Worker now normalizes Node/async-iterable streams and awaits object retrieval. Synthetic runs now verify eight database components, one Storage object, and the encrypted manifest; corruption yields the fixed integrity failure code and cleans the workspace. A missing total Storage budget is also confirmed to fail before database export or remote object writes. `npm run test:backup` passes 12/12. Final application gates also pass: ESLint has 0 errors/2 existing warnings, TypeScript passes, isolated Next.js production build generates all 38 routes, and seven key Simplified Chinese routes return HTTP 200. No real CLI export, Supabase Storage, R2, scheduled job, database status ledger, retention deletion, or restore was used; Phase 7 remains blocked on Auth/Storage export compatibility and a genuine isolated restore drill.

### Phase 7 Auth/Storage export contract (2026-10-05)

The CLI exporter now requests `database_auth_schema`, `database_auth_data`, `database_storage_schema`, and `database_storage_data` via explicit Auth/Storage schema includes; the Worker receives the complete eight-component contract required by the manifest. Isolated subprocess-boundary tests verify the exact schema/data arguments, returned artifact kinds, password only in the child environment, and rejection when either managed schema definition is empty. Manifest coverage now removes each of the four Auth/Storage components in turn and confirms the manifest rejects every omission. Supabase CLI 2.118.0 dry-run confirmed the explicit Auth include is not accompanied by an Auth exclusion. `npm run test:backup` passes 14/14; the complete `npm test` also passes with two real ClamAV tests skipped by default. The local database dump probe was rejected by the command policy (`blocked by policy`), so no dump files were created; real table/row coverage, SQL output, restore compatibility, and isolated recovery remain unverified. Backup flags remain OFF.

### Local verification continuation: Phase 6 production preview security and index gates (2026-10-04)

Started a temporary production server from the isolated `.next-validation` build and then stopped it. Thirteen Simplified Chinese page routes returned HTTP 200; ten account/submission/report/request/filter/detail/search routes exposed noindex. The homepage, submit draft, and admin responses included `nosniff`, frame denial, Referrer-Policy, Permissions-Policy, Production HSTS, and nonce-based CSP. With indexing authorization unset, `robots.txt` correctly returned `Disallow: /` and the generated sitemap shard was an empty `urlset`; this checks the safe default only, not populated public-post sitemap output or the authorized index-enabled branch. No indexing switch, search-engine account, or hosted service was changed.

### Local verification continuation: account sanctions and staff authorization (2026-10-04)

Added `supabase/tests/account_sanctions.test.sql` with 28 rollback-only pgTAP assertions. Synthetic Owner/Admin/member fixtures cover role grants, Admin limits, Owner permanent-ban authority, active suspension duplicate rejection, self-sanction denial, account-state changes, recent-TOTP staff-session lockout after account suspension, Owner lift/restoration, and append-only sanction history. A first draft used the unaffected Admin session to check a different suspended Admin; correcting the fixture identity confirmed the existing authorization function denies the sanctioned session as intended, so no production migration change was needed. The single test passes, then the full local suite passes **14 files / 305 assertions**. All tests remain local; no hosted database, sanction action, real account, or feature gate was touched.

### Local verification continuation: post revision editor boundaries (2026-10-04)

Added `supabase/tests/post_revision_editor.test.sql` with 26 rollback-only assertions. Synthetic published ordinary/high-risk posts and separate Admin/Owner sessions verify Admin visibility/edit limits, Owner high-risk access, required TOTP, trimmed title/excerpt/reason, active-tag rules, no-op rejection, stale version conflict without extra audit, unchanged identity/area/risk/status, synchronized public preview, exact before/after history, UUID-free history projection, and append-only mutation guards. The test and complete local pgTAP suite pass: **15 files / 331 assertions**. The test does not simulate separate-session lock races or CDN behavior; those remain in Staging acceptance. No production migration was needed, and no hosted services or feature switches were touched.

### Local verification continuation: staff notification lifecycle (2026-10-04)

Added `supabase/tests/staff_notifications.test.sql` with 20 rollback-only assertions. Synthetic Admin/Owner/member fixtures verify private table grants, recipient isolation, recent-TOTP access, 90-day list and write cutoff, strict `unread → read → in_progress → resolved` transitions, rejected skip/repeat/unknown transitions, ordered timestamps, and append-only status audit. Expired notifications remain untouched until the scheduled purge; the Cron was not run. The full local pgTAP suite now passes **16 files / 351 assertions**. No hosted environment or feature gate was changed; Staging lock-wait, browser session-expiry, and live Cron behavior remain unverified.

### Local verification continuation: staff dashboard layouts (2026-10-04)

Added `supabase/tests/staff_dashboard_layouts.test.sql` with 29 rollback-only assertions. Synthetic Admin/Owner/member sessions cover private preference/history access, role-specific default/read/save lists, rejection of Owner-only Admin widgets and empty/unknown/duplicate/null layouts, member denial, Owner CRM visibility, reset reason and recent-TOTP requirements, reset attribution/version increment, Admin-only preference removal, Owner layout retention, immediate Admin default visibility, and append-only default history. The test exposed that Owner reset still hardcoded the original seven-widget Admin layout despite later defaults adding three widgets. Added forward migration `20261005120000_mmwr_dashboard_reset_current_admin_defaults.sql`, preserving historic 7/8/9-widget versions while making the reset template and accepted current default the official ten-widget order. Applied it to the local database only and re-ran the full suite: **17 files / 380 assertions pass**. Updated Staging and rollback documentation. A truncate attempt is prevented structurally by the referencing preference foreign key before PostgreSQL reaches the truncate trigger, so the test checks the enabled protection trigger and directly verifies update rejection instead. No hosted environment or feature gate was changed.

### Local verification continuation: Owner-only audit row visibility (2026-10-04)

A read-only catalog review showed two intentional authenticated `SELECT` grants inside the non-exposed `private` schema: `role_change_audit` and `home_tag_settings_audit`. Both tables have RLS and Owner-only read policies; anonymous access and authenticated writes are revoked. Added `supabase/tests/staff_audit_read_rls.test.sql` with 11 rollback-only assertions covering Owner reads, Admin/member row isolation, anon denial, and the grant/policy boundaries. It passes locally. Current full suite is **18 files / 391 assertions**. The local PostgREST config lists only `public` and `graphql_public`; this does not verify hosted API configuration. Updated the exit audit and clarified that local testing is authorized to continue before final UI acceptance. No remote environment was accessed.

The broader table privilege inventory also showed the `service_role` has no direct application-table grants in this schema; service-only operations use scoped security-definer RPCs. Added `supabase/tests/client_table_grant_inventory.test.sql` with six dynamic assertions across every public/private table: RLS enabled, private-table grant exceptions, public-read allowlist, the single profile display-name update column, and no direct service-role table/column grants. The isolated test passes. After it is integrated, the local suite is **19 files / 397 assertions**; hosted grants and PostgREST configuration remain unverified.

### Local verification continuation: staff-session lease enforcement (2026-10-04)

Added `supabase/tests/staff_session_limits.test.sql` with 18 rollback-only assertions. Synthetic Owner/Admin/member sessions verify the activity RPC is service-role only; AAL2/TOTP and staff-role checks are required to create a lease; leases bind to the exact Auth session; active activity advances the idle timestamp; crossing the 15-minute idle or eight-hour absolute boundary returns terminal `expired`, does not revive the lease, and makes `private.has_staff_role` deny the session; ordinary members and cross-user session IDs are rejected; and Auth-session deletion cascades its lease. The isolated test and full suite pass: **20 files / 415 assertions**. Browser foreground renewal, concurrency/lock waits, and actual session logout still require Staging/browser acceptance.

### Local verification continuation: scanner worker protocol tests (2026-10-04)

Added `scanner/worker.test.mjs` and `npm run test:scanner`. Five isolated Node integration tests launch the real worker against synthetic local Storage/API HTTP servers and a mock ClamAV TCP protocol server. They cover a clean signed PNG and minimized result payload, a synthetic malware match, MIME/magic rejection before ClamAV, a signed URL outside the private quarantine bucket, and an oversized declared object. The first run exposed a classification bug: an invalid bucket URL correctly stopped before download but was reported as a generic scanner error; it now returns `unsupported` / `invalid_file_signature`. ClamAV's `z`-framed command prefix is decoded correctly by the mock server, and the child test process inherits only its required local runtime variables rather than the full parent environment. `npm run test:scanner` passes 5/5; `npm run test:backup` passes 12/12; local pgTAP passes **21 files / 455 assertions**; `supabase db lint --local` exits 0 with seven existing unused-lock-variable notices; migration files and the local database are aligned through `20261005120000`; ESLint exits 0 with the two existing warnings; TypeScript passes; isolated Next.js production build generates all 38 routes; 13 distinct local HTTP route checks return 200, including Johor/Selangor maps in Simplified Chinese and Johor maps in English/Malay. No real ClamAV container, scan signature database, mail, external API, hosted Supabase, Staging, or Production was used. Scanner/upload/publication gates stay OFF.

### Local verification continuation: district map data integrity (2026-10-04)

Added `components/maps/district-data.test.mjs` and `npm run test:maps`. The local test confirms the approved 15 district GeoJSON files contain exactly 159 unique named boundaries, polygon coordinates are finite and within broad Malaysia bounds, Kuala Lumpur appears once with no separate Putrajaya, Tangkak retains source name Ledang, and every pin representative point is inside its district polygon. The first pin check exposed centroid points outside Baling and Sandakan; the shared geometry helper now searches for an interior point when needed. It passes 4/4 without network access. This validates the packaged geometry inventory and label positions, not official boundary correctness, parent mapping completeness beyond current fixtures, rendered map interactions or post counts. Those remain subject to the existing UI and Staging review gates.

### Phase 4 district post pins (2026-10-04)

The selected-state area map now places a compact localized count pin at each bundled District polygon interior point when the server-provided public count for that District is greater than zero. Pins link to the corresponding existing District query view in the current locale, and remain clipped to the displayed state shape. Zero-count/unavailable entries render no pin; the public counts remain the database source of truth. This does not add any synthetic public content or expose non-public fields. Full build, TypeScript, and map-data tests pass. Since the local project has no public post fixtures, positive-count placement, visual overlap and click-through cannot be reviewed yet; they remain in the UI/Staging acceptance checklist.

### Local verification continuation: pinned ClamAV runtime (2026-10-04)

The opt-in scanner suite now has two additional checks against the digest-pinned ClamAV 1.4.6 image and its live signature database. The complete worker scanned a synthetic PNG and returned `clean`; a direct `INSTREAM` check against that same daemon detected the canonical EICAR test string. A fabricated PNG consisting of a PNG magic prefix plus EICAR was returned as clean, so it was removed as an infection assertion and is explicitly not treated as malware evidence. Five existing isolated worker tests still cover the synthetic infected verdict and URL/MIME/size boundaries. All seven opt-in scanner tests pass; the default `npm run test:scanner` run passes 5 tests and skips the 2 real-daemon checks as intended. The daemon was exposed only on `127.0.0.1:3310` and has been stopped/removed; no Supabase, hosted service, outbound mail, or real user evidence was involved. This local runtime evidence does not replace real Storage/API, Compose network-isolation, or Staging acceptance; all evidence/upload/publication gates remain OFF.

The actual scanner Compose pair was then built and started with digest-pinned images (`clamav/clamav@sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23`, `node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`) and synthetic placeholder HTTPS origins/token. The scanner container received `PONG` from `clamav` on the project network; Docker inspection confirmed ClamAV TCP ports are not published, while the worker root filesystem is read-only and all Linux capabilities are dropped. This exercised startup/readiness and network wiring only; no job was claimed/scanned and no Supabase endpoint was contacted. The project containers, network and dedicated ClamAV database volume were removed after validation.

### Phase continuation — local PostgREST anonymous-hook boundary (2026-10-05)

The first local PostgREST smoke exposed a cross-cutting failure that pgTAP role simulations did not catch: the configured `private.enforce_owner_ip_block_data_api_single_header` pre-request hook is resolved after PostgREST selects the JWT role, but `anon` lacked `USAGE` on `private`. Anonymous API calls failed with `42501 permission denied for schema private` before reaching any public RPC. Disabling the hook only for diagnosis made the same public RPC return 200; the hook was restored immediately. A forward migration `20261004190409_owner_ip_block_anon_prerequest_schema_usage.sql` grants anon schema name-resolution only. `private` remains absent from PostgREST's exposed schemas, no private-table grants were added, and IP enforcement remains OFF. The experimental public Reaction wrapper changes were removed; its narrow public read remains invoker-rights. The local database was reset from current migration files after confirming zero Auth users, profiles, submissions, published previews, reports and campaigns; seed loading is disabled. With the hook active after reset, anonymous Reaction icon and Tag directory PostgREST RPCs both returned HTTP 200; the private tables remain inaccessible. `owner_ip_block.test.sql` passes 14/14, `owner_reaction_icons.test.sql` 19/19, and the full pgTAP suite passes 25 files / 595 assertions. Node suites pass (backup 12/12, account deletion 14/14, pagination 2/2, maps 4/4, scanner default 5/5); opt-in pinned ClamAV tests pass 7/7. ESLint, TypeScript, local DB lint (0 exit; seven existing unused-lock-variable warnings), and Supabase Advisor (no issues) pass. No hosted Supabase, Staging, Production, email, worker or high-risk gate was touched. See the Phase 3 rollback and Staging acceptance entries for the new migration.
### Phase 3 本地安全审查与修正续记（2026-10-04）

完成一个部分覆盖的静态源码审查（7 个风险面；仓库清单 411 个文件未全部读完），报告 3 项仅适用于本地源码配置的发现：Auth signup 可以绕过网站 CAPTCHA、Latest/tag 深页产生无上限 offset、Clarification append-only 触发器会拒绝账号删除时的 actor 外键匿名化。Auth 发现已改为 Auth 原生 Turnstile 验证：`supabase/config.toml` 开启 Turnstile CAPTCHA 并用 `env(TURNSTILE_SECRET_KEY)` 读取服务端密钥，App 登录/注册/密码找回把一次性 token 传给 Supabase Auth，不再先用 Cloudflare Siteverify 消耗这些 token。报告/邮件验证的独立 Turnstile 校验保留。需在本地根 `.env` 和各隔离托管环境提供同一服务端 secret；本机未配置密钥且 Auth/Kong 容器当前未运行，因此未验证 Auth 运行时或托管设置。

Latest/tag/地区/城市公共列表加入共享页码上限 1,000、页长上限 12，并有 2 个 Node 单元断言验证边界。澄清审计新增 `20261004131427_clarification_audit_actor_anonymization.sql`，只有 `actor_user_id` 非空到 NULL 且其余整行相等的更新被放行；任意行修改、删除、截断仍拒绝。该迁移应用于本地 Supabase 数据库；`clarification_access.test.sql` 21/21 通过，包含真实 Auth fixture 删除和保留审计验证。

针对修改文件 ESLint 通过，`npx tsc --noEmit` 通过，公开分页逻辑测试 2/2 通过。没有跑全站测试、Production build、全部 pgTAP、浏览器 UI 或远端 Supabase；这些测试按用户安排待最终 UI 检查后统一开展。Security 扫描 `71d3479f-e9b2-4426-b541-d3174c9a6fcb` 已封存，含 3 项发现；覆盖为 partial、静态源码模式、未执行测试或访问网络/托管服务。其报告位于 `C:\Users\PC\.codex\state\plugins\codex-security\scans\mmwr\533ba1233039ad3c37f0909cbda39164389eeb33_20261004T125019Z_hkj_r8ek\report.md`。Phase 3 Staging 清单已加入 Auth CAPTCHA 直接调用和公开分页上限检查；Clarification 迁移清单和源级函数计数也已同步。


### Local Supabase Auth stack restart (2026-10-04)

After preserving the local database volumes, stopped and restarted the local Supabase project with the full service set. Kong, Auth, Storage and Postgres report healthy; http://127.0.0.1:54321/auth/v1/health returns HTTP 200. The post-restart pgTAP rerun passes **21 files / 455 assertions**, and the local migration ledger remains aligned through 20261005120000. Auth reports Turnstile enabled, but its runtime Secret is the unresolved literal expression `env(TURNSTILE_SECRET_KEY)`; no real server key is injected, and the frontend Site Key is absent. Auth CAPTCHA was therefore not exercised end to end and no synthetic signup was attempted. The Vector logs container remains unhealthy/restarting because its Docker log source cannot reach the Docker API network; this does not affect the tested database or Auth health endpoint. `npx supabase db advisors --local --type all --level warn` reports no issues; `supabase db lint --local` still emits seven unused-lock-variable warnings. No hosted Supabase, Staging or Production was contacted.
**Phase 5 本地默认关闭路径 smoke check（2026-10-04）：** 向本地 `/api/analytics/page-view` 与 `/api/analytics/valid-read` 各发送一次合成 JSON 请求；两个入口均在功能开关关闭时返回 HTTP 204，并在创建 Supabase 客户端前直接退出，因此没有写入事件。该检查只验证默认关闭边界，不启用分析、不验证授权收集流程，也不代表 Staging/Production 行为。
**Phase 3 当前工作树本地验证复跑（2026-10-04）：** 当前分支 `codex/mmwr-plan` 的 21 个 pgTAP 文件 / 455 条断言通过；备份 12/12、扫描器隔离测试 5/5（两项实机 ClamAV 在无 daemon 的默认模式下跳过）、地图 4/4、分页 2/2 通过。ESLint 0 errors / 0 warnings，TypeScript 通过，隔离 Next.js production build 成功生成 38 条路由；构建自动修改的 `tsconfig.json` 已按构建前字节内容恢复。14 条本机页面与 robots/sitemap 路由均返回 HTTP 200，并包含 `nosniff` 和 `X-Frame-Options: DENY`。默认关闭的 Page View / Valid Read API 合成请求均返回 204。仅本地验证，无托管环境访问或业务写入；高风险开关仍关闭。当前剩余人工门为 Phase 3 UI 验收与必须由用户/法律顾问确定的保留政策；Turnstile、Telegram 和 Staging 还需相应服务配置。
### Local verification continuation (2026-10-05)

Applied the three pending migrations through `20261005130200` to the local Supabase database only. The full pgTAP suite passes **25 files / 595 assertions**. This run exposed a redundant `GRANT USAGE ON SCHEMA pg_temp` in `reviewed_submission_publication.test.sql`; PostgreSQL does not accept that temporary-schema alias in this grant, and the test role already has the required session-temp-schema access. Removing the unnecessary grant fixed the test; the focused file passes 52/52. Existing Node suites pass: backup 12/12, public pagination 2/2, maps 4/4, scanner default mode 5/5 (2 real-ClamAV checks skipped by design), and account-deletion worker 14/14. The opt-in pinned ClamAV suite passed 7/7. Added `npm run test:turnstile` for the application Siteverify helper; all 15 stubbed local cases pass without contacting Cloudflare. Added `npm run test:report-share`; 27/27 verify the Telegram draft origin allowlist through its real pure function, including RFC 2606 reserved example domains. Added `npm run test:report-envelope`; 14/14 cover report request origin, media type, JSON parsing and streamed body limits. ESLint and TypeScript checks pass. An isolated Next.js production build succeeds with 38 routes. Local database lint exits 0 with seven existing unused-lock-variable warnings. No hosted Supabase, Staging, Production, external mail, Turnstile provider, Telegram, or one-shot worker was contacted or run; high-risk flags remain OFF. The 99 local migration files are aligned through `20261005130200`. Phase 3 rollback inventory now covers all 67 current Phase 3 migration files, with matching Staging race checks for the three latest corrections; the UI review record reflects the connected but empty local data state. Anonymous local HTTP checks also passed for 21 route/locale combinations (7 Phase 3 paths in zh-CN, English and Malay), each with noindex, the expected html lang, nosniff and frame denial.

### Local PL/pgSQL lint cleanup (2026-10-05)

Local `supabase db lint` identified seven variables used only as `SELECT ... INTO` targets before `FOUND` checks. Added forward migration `20261005130300_remove_unused_plpgsql_lock_targets.sql`, replacing those targets with `PERFORM` in the two report writer overloads, sanction, three reaction routines, and publication-source reader. The row filters, row-lock modes, `FOUND` branches, function signatures and existing execute privileges are retained; no data or feature flags change. Applied only to local Supabase. The full pgTAP suite still passes 25 files / 595 assertions, migration ledger matches all 100 files through `20261005130300`, and `supabase db lint --local` now exits 0 with no schema errors or unused-variable warnings. The Phase 3 rollback guide and future Staging acceptance checklist include the migration. No hosted environment was queried or changed; no high-risk gate was enabled.
Read-only checks after the migration confirmed all seven current private.runtime_flags entries remain false; local Supabase Advisors report no issues.

### Report submission orchestration (2026-10-05)

The report POST route is a thin adapter over `lib/reports/submit.mjs`; its 13-case local suite covers signed-out/restricted users, invalid or unavailable Turnstile, valid/invalid post reports, write ordering and server-derived identity, provider error minimization, Telegram draft privacy, rate limits, and absent public site configuration. The updated `npm run test:local` passes 111 Node cases, with two opt-in ClamAV cases skipped, 25 pgTAP files / 595 assertions, and database lint. ESLint and TypeScript also pass; the isolated production build produced 38 routes. ESLint and Git ignore generated Next.js custom `.next-*` build directories. This does not verify real Supabase Auth, Cloudflare Siteverify, browser interaction, or Staging. Hosted systems were not contacted and high-risk gates remain OFF.

Anonymous same-origin POSTs to isolated local production and freshly started development servers returned 503 because those processes lacked the Supabase URL/publishable key; they stopped during Auth client setup before CAPTCHA or report creation. The local CLI can report its runtime values, but passing them to another process was blocked by execution policy, so the live Auth gate remains unverified. Process inspection shows port 3000 serves `next start`; its compiled report-route file predates the current route source, consistent with an older build. Fresh `next dev` accepts the same-origin envelope. No synthetic report was written and the Origin check was not weakened. See [`docs/operations/PHASE3_EXIT_AUDIT.md`](docs/operations/PHASE3_EXIT_AUDIT.md) for exact evidence.

### Submission social-link validation alignment (2026-10-05)

The submit preview, staff publication form, and public detail loader now share one pure validator matched to the reviewed-publication SQL allowlist. It rejects deceptive/trailing-dot hosts, wrong-platform links, HTTP, credentials, ports, query/fragment, whitespace, malformed URLs, and values over 500 characters. `npm run test:submission-social-links` passes 5/5; the full local suite includes these tests. The form remains non-submittable and all publishing gates remain OFF.

### Unified local verification command (2026-10-05)

Added `npm test` to run all eight repository Node suites and `npm run test:db` to invoke the repository-local Supabase CLI. `npm run test:local` chains those suites, the full local pgTAP suite, and `supabase db lint --local`. The complete command passes: 93 Node cases pass, two opt-in real-ClamAV checks skip in default mode, pgTAP passes 25 files / 595 assertions, and database lint reports no schema errors. TypeScript and production build remain separate checks. The command makes no hosted calls or business writes.

### Latest local verification and Phase 2 configuration audit (2026-10-05)

The latest `npm run test:local` continuation passes 140 Node cases, with two real-ClamAV daemon checks skipped in default mode; pgTAP passes 25 files / 610 assertions, and local database lint reports no schema errors. Separately, the opt-in real-daemon scanner suite passes 7/7 against the pinned ClamAV image. `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and an isolated production build also pass; the build generates all 38 routes. The local migration ledger is aligned with all 101 migration files through `20261005140000`; all seven high-risk `private.runtime_flags` remain false. A static comparison of application `process.env` references against `.env.example` found no undocumented deployment runtime variables. The two unlisted `MMWR_TEST_*` names are opt-in test-only controls; `MMWR_VALIDATION_DIST_DIR` is a local isolated-build helper and is now explicitly documented as temporary and not for shared deployment. These checks do not complete the broader hard-coded-configuration or least-privilege review. No hosted database, worker, or production setting was touched.

### Phase 4 rich homepage Tag sorting verification (2026-10-05)

Expanded `supabase/tests/content_access.test.sql` with a transaction-scoped synthetic dataset of 13 Tags and 91 published preview fixtures. The new assertions exercise Smart Mix popular/recent/low-exposure segment order and de-duplication, all twelve slots, Most Posts ordering, Manual ordering with Most Posts filling the remaining slots, rejection of non-public and duplicate Tag IDs, and the lower/upper output limits. The focused test passes 80/80; the complete local pgTAP suite passes 25 files / 610 assertions. Fixtures roll back with the test transaction. No application behavior, migration, hosted database, or feature gate was changed.

### Phase 4 public sharing adapters (2026-10-05)

`SharePostControls` now includes Snapchat's documented Share Sheet URL alongside the existing WhatsApp, Telegram, Facebook and X intents. For Instagram, TikTok, Threads, Messenger and WeChat, the localized hint directs users to their device's Web Share menu when available, with public-link copy as fallback; no platform SDK, credentials, or tracking is added. A tested helper rejects non-HTTPS, local/private, query-bearing and fragment-bearing post URLs, caps composer text, and emits no campaign attribution parameters. `npm run test:share-targets` passes 4/4; `npm run test:local` passes 135 Node tests, skips 2 real-ClamAV daemon tests, passes 25 pgTAP files / 610 assertions, and reports no schema lint errors. Targeted ESLint and TypeScript pass. These are local code checks only; mobile/browser platform handoff and share-preview UI remain unverified, and no external sharing provider was contacted.

### Phase 2 real ClamAV daemon test (2026-10-05)

Used the pre-existing SHA-256-pinned `clamav/clamav` 1.4.6 image and current virus signatures for an opt-in local test. The temporary daemon container published only `127.0.0.1:3310`; `MMWR_TEST_REAL_CLAMD=true npm run test:scanner` passed 7/7, including the generated clean PNG through the real daemon and canonical EICAR detection, plus the scanner worker quarantine/validation cases. The container was stopped and auto-removed after the run; port 3310 is closed. No Dockerized evidence-scanner worker, application broker, Supabase Storage, upload, hosted environment, or feature gate was exercised. The complete `npm run test:local` still runs scanner tests in default mode and skips those two opt-in daemon cases unless explicitly enabled.

### Phase 8 local CI workflow source (2026-10-05)

Follow-up static validation: the workflow YAML parses successfully with the locally available YAML parser. Assertions confirm push/PR triggers, read-only `contents` permission, concurrency cancellation, SHA-pinned actions with version comments, pinned ClamAV digest, all planned local test/security/build steps, `always()` ClamAV cleanup, and no deployment operation or GitHub secrets reference. This does not replace execution on GitHub-hosted runners.

Added `.github/workflows/ci.yml` with read-only repository permissions and pinned official checkout/setup-node action commits. Checkout fetches full history for scanning and does not persist its token. Before `npm ci`, the workflow runs `scripts/security/scan-secrets.mjs` with a fixed-digest official Gitleaks container; it scans Git history and non-generated working-tree files read-only, suppresses secret/match data from output, and exits with only rule/path/line metadata if it finds a match. It then audits production dependencies at high severity, runs lint/type-check, starts only the local Supabase services needed by the suite, runs `npm run test:local`, runs the opt-in scanner tests against a SHA-256-pinned ClamAV 1.4.6 container bound only to `127.0.0.1`, and performs an isolated production build. The ClamAV readiness helper speaks the daemon PING protocol, and an `always()` cleanup step stops/removes the container. No credentials or deploy step are configured; local Supabase startup output is suppressed to keep generated local keys out of Actions logs. Local checks passed on 2026-10-05: production dependency audit reports zero high-severity vulnerabilities, Gitleaks found zero in 29 Git history commits and the working tree, lint, TypeScript, isolated production build, 140 Node tests passed with 2 default-mode ClamAV skips, all 610 pgTAP assertions across 25 files, database lint with no schema errors, and the real-daemon scanner suite passed 7/7 using the same digest/helper; the temporary container and port were removed. Full `npm audit` still reports five high-severity findings in the dev-only ESLint/Next lint chain through `braces@3.0.3`; GHSA-vfj7-8cjw-p6xm has no patched release listed, and the suggested force downgrade is incompatible with Next 16, so it remains open. The workflow itself has not been pushed or executed on GitHub; branch protection, hosted-runner execution, and a green hosted CI run remain unverified. No GitHub repository settings or hosted service were accessed or changed.

### Phase 6 public listing metadata and sitemap (2026-10-05)

Public listing metadata now uses the same strict production indexing gate as the home and post routes. Latest, Hot, Tags directory/detail and Areas landing/state/district pages receive canonical and three-language alternates only when eligible; page > 1, unavailable/empty Tag or Hot results, and state/district filters without a public post remain `noindex`. Hot requires all ranking flags and a real public ranking row. The sitemap adds localized Areas/Latest/Tags directory routes, active public Tag IDs, and State/District query routes only when the public aggregate reports posts. Stories, clarifications, and Tags are sharded in independent 5,000-record slices; every record expands to three locale URLs and leaves room for the geographic entries below the 50,000-URL sitemap limit. Local lint, TypeScript, 38-route production build and full local suites passed (135 Node pass, 2 opt-in ClamAV skipped; 25 pgTAP files / 610 assertions; database lint clean). With indexing disabled, local HTTP verified a full robots disallow, empty sitemap and `noindex` for Areas, Latest and tag preview. A gate-open request test was not run: execution review rejected launching the local server with `VERCEL_ENV=production` and `ALLOW_SEARCH_INDEXING=true`. No indexing gate or hosted environment was changed; Production, Staging, Search Console and crawler behavior remain unverified.

### Phase 4 private thumbnail derivatives (2026-10-05)

Implemented bounded JPEG/PNG/WebP-to-WebP derivatives in the scanner, with metadata removed and dimension/pixel/byte limits; only clean scans explicitly marked eligible can upload a lease-bound derivative to the dedicated private bucket. A service-only resolver returns an object path only while the database thumbnail gate is enabled and the post/evidence remain published, clean, and `public_thumbnail`. The same-origin server route checks that resolver on every request, validates/limits the stored WebP response, and returns `nosniff`, sandboxed, same-site, no-store bytes. Public list projection exposes only the eligible image count; list cards request the bounded first three through the same-origin route. App and database flags default OFF. The migration includes the derivative bucket in the final account-deletion evidence ownership check.

Current local evidence: `npm run test:local` passes 155 Node cases (153 pass, 2 opt-in real-ClamAV tests skipped in default mode), 26 pgTAP files / 635 assertions, and database lint with no schema errors. New pgTAP assertions prove that an `internal_only` change and post hiding stop path resolution immediately. Backup worker/manifest/restore-plan fixtures include the private thumbnail bucket and a WebP object; they prove the worker archives the object, its private bucket limits/MIME remain in the manifest, and the isolated restore plan references it. This is synthetic coverage, not a full Supabase Storage restore. The opt-in scanner suite passed 15/15 against the CI-pinned ClamAV digest; the temporary container and loopback port were stopped. Full ESLint, TypeScript, isolated production build (38 routes), and `git diff --check` pass; Supabase Advisor reports no issues. An isolated production HTTP check with the app gate OFF returned an empty 404 with `no-store` and `nosniff`. The local migration chain includes 102 files through `20261005150000_mmwr_public_thumbnail_derivatives.sql`; all eight local runtime flags are false. `npm audit --omit=dev` reports zero vulnerabilities; full audit has five high findings in the development ESLint/Next lint dependency chain, with an offered Next 14 downgrade incompatible with this Next 16 project. No hosted Supabase, Staging, Production, R2, or GitHub Actions were accessed.

The synthetic backup Worker/manifest/restore-plan fixtures also include the private derivative bucket and WebP object; `npm run test:backup` passes 14/14, and the full `npm run test:local` gate passes (155 Node cases: 153 passed, 2 opt-in ClamAV skipped; 26 pgTAP files / 635 assertions; schema lint clean). ESLint, TypeScript, and `git diff --check` pass. These tests use injected backup adapters and do not exercise Supabase Storage's real API.

A separate local-only Storage API smoke check created a temporary private WebP bucket and synthetic nested object, verified bucket privacy/MIME/size settings, object listing and metadata, signed download, and byte-for-byte content, then deleted the object and bucket and confirmed no validation bucket remained. All eight local runtime flags were still false afterward. This did not run the backup source adapter/Worker or test archive encryption and restore.

Still open before Phase 4 acceptance: exercise a complete synthetic upload-to-card path through actual local Storage and the broker, prove hide/remove/visibility revocation at the HTTP route, test orphan cleanup, and perform a full isolated Supabase Storage restore that recreates the private derivative bucket. Add/verify rate controls and complete browser/UI plus Staging checks. Do not enable uploads, scanner, or thumbnails before these checks and explicit future rollout decisions.

### Phase 6 Sitemap tag pagination fix (2026-10-05)

The sitemap previously fetched the complete public tag-directory RPC result in one request. That directory may repeat IDs for localized labels, and PostgREST's configured 1,000-row cap could truncate the result before the application de-duplicated it. Added `public.public_sitemap_tag_ids()` as a public-projection-only, unique UUID source granted to `anon` and `authenticated`; sitemap tag totals now use exact head counts, and both posts and tags use ordered 500-row pages with independent offsets. This keeps page requests under the row cap and prevents gaps across shards. Added unit and pgTAP assertions for >1,000-ID paging, unique results and function grants.

Local verification passed: `npm run test:local` (Node suite passed; two tests requiring a real ClamAV daemon were skipped by default), 26 pgTAP files / 637 assertions, and Supabase DB lint with no schema errors; `npx tsc --noEmit`, ESLint, `git diff --check`, and an isolated production build (38 routes) passed; Next.js generated TypeScript include paths were restored afterward. The additive migration was applied only to the local Supabase instance; anonymous local PostgREST count-HEAD and paged RPC requests both returned HTTP 200 with the empty synthetic dataset. No hosted database, indexing gate, Staging, Production, browser crawler or Search Console was accessed; Phase 6 launch acceptance remains open.

### Phase 4 tag-sphere layout regression coverage (2026-10-05)

Extracted the tag selection and spatial-placement routine from `TagDirectory.tsx` into `components/tags/sphere-layout.mjs` without changing the approved Fibonacci-candidate/maximin strategy. Its random source is injectable so regression tests can use deterministic inputs. Added `npm run test:tags` to the full suite; the three cases check all tags at or below 50, a unique 30–50 sample above 50, valid longitude/latitude and a minimum unit-sphere chord spacing. The tests failed before the layout module existed and pass after extraction. Full `npm run test:local` passed with 26 pgTAP files / 637 assertions and clean DB lint; two opt-in tests requiring a real ClamAV daemon were skipped by default. TypeScript and targeted ESLint passed; an isolated production build generated 38 routes, and its tsconfig include additions were restored. Real database tag distributions, screen-reader/keyboard behavior and Staging acceptance remain open; Phase 4 is not complete.

### Phase 6 public-only structured data (2026-10-05)

Moved public-story JSON-LD serialization into `lib/seo/public-post-structured-data.mjs` and added five tests to `npm test`. The serializer emits only visible public headline/excerpt, language and HTTPS canonical; it rejects credentials, query strings, fragments and malformed URLs, caps/normalizes text and escapes `<` to prevent script termination. The guest response contains a short public summary and login prompt, while full text is omitted until the server authorizes the user; therefore this remains `CreativeWork` describing the public preview and does not claim the unavailable-to-guest body is a Google paywall section. Google's structured-data instructions require the paywall selector to match the actual content section in the page HTML. Full local tests pass (140 Node pass, 2 opt-in real-ClamAV tests skipped; pgTAP 25 files / 610 assertions; DB lint clean); lint, TypeScript and isolated production build generate 38 routes. Rich Results validation, gate-open metadata and hosted crawl remain unverified.

### Phase 4 migration rollback inventory (2026-10-05)

A filename-by-filename check found 103 SQL migrations and six operations rollback guides. One missing entry, `20261005150000_mmwr_public_thumbnail_derivatives.sql`, is now covered in `docs/operations/PHASE4_MIGRATION_ROLLBACK.md`, including its private derivative bucket, default-off gate, evidence retention and account-deletion dependencies. Rechecking the complete set found zero missing migration filenames. This is documentation coverage only; no rollback was executed. The private thumbnail gate remains OFF and hosted environments were not queried or changed.

### Phase 4 thumbnail delivery regression coverage (2026-10-05)

Extracted the public thumbnail HTTP handler into `lib/public-thumbnails/delivery.mjs` so its per-request access check and response boundaries can be tested without a hosted service. Twelve synthetic assertions cover no-store WebP delivery, revocation before the next request, malformed IDs/slots, invalid image data, a disabled gate, and fail-closed database/Storage errors. An explicit local opt-in Storage test created a unique private bucket, uploaded and served a synthetic WebP through the handler, confirmed anon direct download is denied, and verified cleanup. A separate read-only local DB opt-in verified `public_thumbnails=false`, invoked the actual `mmwr_public_thumbnail_path` RPC through the handler, and confirmed a no-store 404 without reading Storage. This covers the safe closed-gate path; the positive database-to-Storage delivery path remains unverified because opening the feature gate is outside scope. The updated `npm run test:local` passes with 26 pgTAP files / 637 assertions and clean database lint; the isolated production build generates 38 routes, TypeScript, targeted ESLint and `git diff --check` pass. Default mode skips both thumbnail opt-in tests, one backup Storage test and two real-ClamAV tests. No submission was created and uploads, scanning, publication and thumbnail delivery gates were not enabled. Broker-to-database integration, lifecycle, orphan cleanup, full isolated Storage restore, browser acceptance and Staging checks remain open.

### Phase 7 database restore coordinator (2026-10-05)

Added `backup/restore-database-run.mjs` and the independent `MMWR_BACKUP_RESTORE_ENABLED=false` gate. The coordinator requires different source/target refs and a read-only adapter preflight that confirms the exact target is isolated and pristine. It downloads and verifies the encrypted manifest and all eight SQL components (stored digest/size, AES-GCM, plaintext digest/size) before writing, then applies them in dependency order. It stops without retry on the first write error and marks the target as possibly partial. Five synthetic tests pass; `npm run test:backup` passes 32 with one default-skipped local Storage opt-in test. This is not a Supabase/Postgres import adapter and has not been run against a disposable DB; no combined DB+Storage restore drill has passed. All backup/restore gates remain OFF.

### Phase 7 loopback psql target adapter (2026-10-05)

Added `backup/supabase-psql-target.mjs` with loopback URL and exact Docker-local project-container targets. It rejects remote endpoints and URL passwords, uses a read-only emptiness check, keeps URL-mode DB passwords in the child environment, streams Docker-mode SQL over stdin, runs each SQL artifact with `ON_ERROR_STOP` in a transaction, and suppresses SQL diagnostics. Eight target tests pass. The read-only preflight SQL was also run against the current local development DB and correctly reported it non-pristine. A fresh, separate Supabase Postgres stack has since passed all eight synthetic encrypted DB components through the coordinator; four table counts and the test role were read back successfully. Actual MMWR export compatibility and joint DB+Storage restoration remain unverified, so restore gates remain OFF.

### Phase 7 disposable database restore drill (2026-10-05)

Started a second local Supabase project with its own database volume and non-conflicting ports. The first attempt exposed that the local `postgres` DB role cannot create objects in managed `auth`/`storage` schemas; that partial synthetic target was stopped and its volume deleted. Updated the Docker-local adapter to use the local `supabase_admin` DB role and stream verified SQL through stdin. A fresh target then accepted all eight synthetic encrypted DB components via the coordinator; read-back confirmed four tables with one row each and the synthetic role. The successful target and dedicated data volume were also stopped and removed. This tests a disposable Supabase Postgres container, not the actual MMWR export, Auth/Storage service startup, Storage bytes, or joint DB+Storage restore. The new opt-in test is skipped by default; all restore gates remain OFF.

### Phase 7 restore-target data emptiness guard (2026-10-05)

Extended the read-only PostgreSQL target preflight to reject rows in Supabase-managed `auth` and `storage` tables, while allowing only the platform's `auth.schema_migrations` and `storage.migrations` ledgers. This complements the existing application-object check and prevents an initialized-but-used target from being treated as pristine. A regression test failed before the change and passes after; all 9 `backup/supabase-psql-target.test.mjs` tests pass. The query was also executed against the current local PostgreSQL 17.6 database and correctly returned non-pristine, with no writes. The full `npm run test:local` then passed: Node suites, 26 pgTAP files / 637 assertions, and database lint with no schema errors; two real-ClamAV tests and the two isolated restore opt-ins remained skipped by default. This does not verify full restore compatibility; backup and restore gates remain OFF.

### Phase 7 actual local DB + Storage restore compatibility check (2026-10-05)

Added a non-production Docker `pg_dump` transport restricted to loopback DB URLs and a project-specific local Supabase DB container. It supports the short default local password while the host/managed transport retains its 12-character minimum. Fixed the pristine-target check so empty Auth/Storage tables return a valid `EXISTS` result. psql failures now expose only a fixed diagnostic category; raw SQL and row values remain suppressed. The focused target/coordinator tests pass 15/15. An opt-in run against a fresh full Supabase stack successfully exported and encrypted the current local database, then failed while applying `database_auth_schema` after two earlier components with safe category `object_already_exists`. The target already had Supabase Auth tables, confirming a managed-schema object collision; the exact object name remains suppressed. The partial isolated stack was stopped with `--no-backup`; zero target containers and volumes remain. No Storage restore was attempted. This is a failed compatibility drill, not restore evidence; Phase 7 remains incomplete and all backup/restore gates remain OFF until a safe managed-schema and migration-ledger compatibility strategy is designed and validated.

Windows follow-up: the local npm Supabase CLI shim could not be spawned with `shell:false` (`ENOENT`). The exporter now invokes the locked CLI JavaScript entry through the current Node executable on Windows unless an explicit native `SUPABASE_CLI_PATH` is set. The new regression assertion failed before the fix and passes after it. A rerun reached the actual export and reproduced the managed Auth schema collision in a separately provisioned `mmwrrestoretarget002` stack; that stack was stopped with `--no-backup`, and no container or volume remains. The `%TEMP%\mmwr-phase7-restore-002` CLI configuration directory remains because the local command policy rejected its removal. The full local suite passed after the change: Node tests, 26 pgTAP files / 637 assertions, and database lint with no schema errors. Do not resume full restore by dropping Supabase-managed schemas; first define and validate how provider-managed schema customizations and migration state are restored safely.

### Phase 7 follow-up: managed-schema-safe local restore (2026-10-05)

The later local restore correction is recorded in `docs/architecture/PHASE7_BACKUP_DESIGN.md`: the main data artifact is now restricted to `public,private`, while pre-provisioned Auth/Storage schemas are retained and only their data plus the explicit migration-ledger tables are restored. On a second isolated local Supabase 2.118.0 / PostgreSQL 17.6 stack, 108 COPY targets and 447 rows matched source readback; Auth/Storage ledgers contained 82/73 rows, all 70 app tables had RLS enabled, and Auth/Storage health endpoints returned HTTP 200 after restart. This resolves the earlier `database_auth_schema` collision for the documented component restore path. It does not prove the encrypted Worker/R2 path, Storage object restoration, point-in-time consistency, cross-version compatibility, or application authorization; backup/restore gates remain OFF and Phase 7 remains incomplete. The older failed-dump entries above are historical and are superseded only for this narrower local restore path.

### Phase 7 combined encrypted restore fixture update (2026-10-05)

The opt-in full local Supabase restore test now creates a uniquely named synthetic private Storage bucket and nested object on a loopback-only source, runs the encrypted database-plus-Storage backup and restore, then checks the restored path and exact object bytes. Test cleanup removes the synthetic source object and bucket. The opt-in run was performed against the isolated `mmwrrestoretarget002` stack: export and encryption succeeded, but database application stopped at `database_auth_schema` with `object_already_exists` before Storage restore and byte readback. The source fixture was cleaned (local inventory returned to 2 buckets / 0 objects), and the partial target stack and dedicated volume were stopped and removed. The focused integration test therefore still fails and Phase 7 remains incomplete; backup and restore gates remain OFF.

### Phase 6 Next patch and dependency audit (2026-10-05)

Updated `next` and `eslint-config-next` together from 16.3.6 to 16.3.8. `npm run test:local` passes (Node suites, 26 pgTAP files / 637 assertions, and database lint); TypeScript, ESLint, and an isolated production build generating 36 routes also pass. `npm audit --omit=dev` reports zero findings. The full audit still reports five high findings in the development-only lint chain `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`. npm's suggested automatic fix downgrades the config to 14.2.35, incompatible with Next 16; the registry has no newer `braces` release, so no forced override or removal of the Next lint plugin was made. This does not pass the dependency security gate; recheck when upstream publishes a compatible fix. No feature gate or hosted service was changed.

### Phase 2 migration rollback coverage guard (2026-10-05)

Added `scripts/check-migration-rollback-coverage.mjs` and two fixture tests. The checker recursively pairs each SQL migration filename with an exact code-formatted occurrence in a `*rollback*.md` guide; it exits nonzero and names uncovered migrations. `npm run check:migration-rollback-coverage` is included in `npm test`, so the local suite and CI definition catch missing rollback-document entries as future migrations are added. The current 103 migrations are found across six rollback guides. This verifies filename coverage only, not the correctness of rollback instructions or a database rollback rehearsal; the Phase 2 item remains open.

**Phase 2 client-readable View grant guard (2026-10-05):** Extended `supabase/tests/client_table_grant_inventory.test.sql` so any application View with `SELECT` granted to `anon` or `authenticated` must use PostgreSQL `security_invoker=true`, and client roles may never read application Materialized Views. A read-only local inventory found no public/private Views or Materialized Views today. Full `npm run test:local` passed with 26 pgTAP files / 638 assertions and clean database lint. This guards future schema changes from silently bypassing base-table RLS; it does not finish the complete role matrix or hosted checks.

### Phase 7 full local encrypted restore and metadata review (2026-10-05)

An opt-in end-to-end run exported the local source through Supabase CLI, encrypted the manifest/database/Storage artifacts, and restored them into isolated Supabase project `mmwrrestoretarget003`. Read-back verified 175 area rows, 103 app migrations, Auth/Storage ledger counts 82/73, one custom Auth trigger, one custom Storage policy, Auth/Storage health, and the synthetic object's path and exact bytes. Source-side synthetic bucket/object cleanup succeeded; all runtime feature flags remained OFF. A read-only target query showed the restored object has `owner_id IS NULL`; API upload regenerates object timestamps. Because MMWR account-deletion and thumbnail/evidence safeguards inspect Storage ownership/path, restoration is not yet proven semantically equivalent. The disposable target was stopped using its exact project workdir; no matching containers or Docker volumes remain, and `supabase_db_mmwr` remains running. R2, hosted scheduling, cross-version compatibility, shared point-in-time consistency, Auth login/application authorization, and RPO/RTO are still open. Keep Phase 7 incomplete until metadata fidelity and restored authorization/protection are resolved.

2026-10-05 Phase 2 数据库权限回归护栏：`supabase/tests/client_table_grant_inventory.test.sql` 新增两项 pgTAP，要求 public/private 应用范围的 SECURITY DEFINER 函数不向 PUBLIC 授予 EXECUTE，且固定空 search_path。本地只读清点发现 178 个此类函数全部使用空 search_path，未发现 PUBLIC EXECUTE；本轮没有数据库或迁移改动。全量 `npm run test:local` 通过：26 个 pgTAP 文件 / 640 项断言、全部 Node 测试组及数据库 lint。按默认 opt-in 规则跳过 3 项隔离 Supabase 备份/恢复和 2 项实机 ClamAV 测试；Storage/thumbnail 冒烟默认关闭。托管环境未连接，高风险开关未启用。
2026-10-05 Phase 2 RLS 角色范围护栏：supabase/tests/client_table_grant_inventory.test.sql 新增 pgTAP，拒绝 public/private 应用表上的 RLS policy 使用不受限的 PUBLIC 角色。本地 pg_catalog.pg_policies 清点未发现此类策略；针对该文件 10/10 通过，全套 npm run test:local 通过（26 个 pgTAP 文件 / 641 项断言，数据库 lint 无 schema errors）。没有数据库或迁移改动，所有测试数据在事务内回滚；托管环境未连接。
2026-10-05 Phase 2 私有函数权限待审：本地 ACL 清点发现 private schema 上 anon/authenticated 均有 USAGE，分别有 4/61 个函数授予 EXECUTE；当前本地 supabase/config.toml 的 API schemas 仅包含 public 与 graphql_public，因此 private 函数不经当前 Data API 暴露。该清点不证明托管配置相同，也未判定这些授权是否为 RLS/helper 调用所需；暂不撤权；私有函数调用链仍待逐一核对，本地 schema 暴露边界已加入 npm test 回归检查。
2026-10-05 Phase 2 私有 schema 暴露回归：新增 scripts/supabase-api-schemas.test.mjs 并接入 npm test，核对本地 [api].schemas 含 public/graphql_public 但不含 private；还覆盖额外 search_path 不算暴露以及把 private 加入配置时拒绝通过。3/3 通过。全量 npm run test:local 通过：26 个 pgTAP 文件 / 641 项断言，数据库 lint 无 schema errors。此测试只保护本地仓库配置，不证明任何托管 Supabase 配置相同；private 函数授权调用链仍待审计。
2026-10-05 Phase 2 私有 IP-block hook 权限最小化：迁移 `20261005160001_mmwr_restrict_ip_hook_function_grants.sql` 撤销所有客户端/服务角色对旧内部 checker 的直接 EXECUTE，并撤销 authenticator 对 pre-request wrapper 和 private schema 的授权；anon/authenticated/service_role 仍可按请求触发 wrapper。PostgREST 官方说明确认 pre-request hook 在 JWT 角色切换后运行。本地 REST 根请求以 anon、合成 authenticated JWT、service_role 都返回 200；pgTAP ACL 保护及 full `npm run test:local` 通过（26 文件 / 643 断言、DB lint 无错误）；回滚覆盖 104/104，Advisor 无问题。runtime gates 仍关闭；没有访问托管环境。托管代理头信任链和真实部署仍未验证。
2026-10-05 Phase 7 恢复对象删除保护回归：扩展 `supabase/tests/account_deletion_worker.test.sql`，以 `owner_id IS NULL` 的 Storage 对象模拟 service-role API 恢复结果，保留 uploader UUID 路径前缀；本地 pgTAP 27/27 通过，确认账号会进入 `evidence_owned` 人工复核，不会被自动删除。全量 `npm run test:local` 通过：26 文件 / 644 断言，DB lint 无 schema errors。恢复仍未保留 Storage `owner_id` 与对象更新时间，其他恢复访问权限、跨版本、R2 和 Staging 仍未验证；Phase 7 保持未完成，所有备份/恢复门关闭。

2026-10-05 Phase 6 索引门本地复核：本地 `/zh-cn`、`/zh-cn/areas`、`/zh-cn/tags`、标签预览、`/zh-cn/latest`、`/zh-cn/hot` 和 `/zh-cn/search` 均返回 HTTP 200、简中页面标题及 `noindex,nofollow`，没有 canonical；`robots.txt` 返回全站 `Disallow: /`，关闭索引门时 `/sitemap.xml` 返回 404 `Not found`。全量 `npm run test:local` 通过：26 个 pgTAP 文件 / 644 项断言、Node 测试无失败（默认跳过两项真实 ClamAV 测试）及数据库 lint 无 schema errors。验证仅限本地安全默认状态；没有打开索引门、访问 Staging/Production 或验证真实爬虫/Search Console，Phase 6 仍未完成。

### Phase 4 地区地图交互增量（2026-10-05）

已选州属的 District 地图现支持 1–12 倍缩放、保持地图中心的缩放变换，以及放大后的指针拖动；平移限制在地图可视边界内，重选州属会重置视图，复位按钮回到适配大小。首页完整地图的现有行为未改。新增三个地图交互辅助函数测试；`npm run test:maps` 7/7、TypeScript、定向 ESLint 通过。随后 `npm run test:local` 全量通过：Node 套件无失败（真实 ClamAV 两项按默认设置跳过）、pgTAP 26 个文件 / 644 项断言、数据库 lint 无 schema errors；本地八个 runtime flags 均为 false，`git diff --check` 通过。开发服务器已停止。浏览器安全策略拒绝打开本机页面，本轮未做目视交互验收；地图 Pin/帖子预览仍缺真实公开帖子供验收，Phase 4 与地区 UI 验收保持未完成。没有连接托管环境、写入业务数据或开启功能门。

2026-10-05 Phase 7 Storage 元数据支持路径复核：Supabase 官方 Storage ownership 文档说明 service key 写入不会设置对象 owner；官方 Storage schema 文档要求将系统对象元数据视为只读、通过 API 执行对象操作；当前 Storage SDK 的对象列表类型也不提供 owner 字段，API 重上传会生成新时间戳。因此支持的 Storage API 恢复仍无法原样还原 owner/time。架构文档与 MASTER_PLAN 已补充来源和边界；未对 storage.objects 做直接 SQL 写入、未冒充用户上传、未启动备份/恢复门或连接托管环境。Phase 7 仍需 Supabase 支持的保真恢复路径，或 Owner 对丢失元数据后的访问/删除/审计影响作出明确接受决定，才可完成验收。

### Phase 4 公开搜索卡片统一（2026-10-06）

搜索结果组件现复用 `PublicPostGrid`，与 Latest、Hot、地区及 Tag 结果列表共享卡片布局，并继承只有符合当前公开投影和开关条件时才从同源受控路由请求私有 WebP 派生图的行为；澄清标签、查询分页及相似名称单独区域保留。验证：`npm run test:local` 通过（26 个 pgTAP 文件 / 644 项断言，Node 测试无失败，数据库 lint 无 schema errors）、TypeScript、目标文件 ESLint、36 路由生产构建和 `git diff --check` 通过；本地公开帖子为零、thumbnail runtime flag false，所以没有真实搜索卡或图像可目视验收。同步修正了 `USER_MANUAL.md` 中地区/标签迁移状态、标签球控制、公开数据为空以及备份现况的过期描述。未更改数据库、托管环境或任何开关。

### Phase 4 澄清列表接入共享卡片（2026-10-06）

真实 `/clarifications` 结果也改为复用 `PublicPostGrid`，统一桌面/手机两列布局、受控缩略图拼贴、Reaction、公开元数据及分页，同时保留澄清类型标记和原帖关联区块。本地演示卡仍与真实结果分开显示并明确标注。新增 4 项 pgTAP 断言：原帖隐藏后，公开澄清目录不再返回关联帖子 ID、标题、名称或地区。验证：`npm run test:local` 通过（26 个 pgTAP 文件 / 648 项断言，Node 测试无失败，真实 ClamAV 两项默认跳过，数据库 lint 无 schema errors）、`npx tsc --noEmit`、目标 ESLint、生产构建（36 条路由）与 `git diff --check` 通过。本地没有真实公开帖子，缩略图与发帖门保持关闭，因此真实列表视觉数据态尚未验收；本地八个 runtime flags 均为 false。未连接托管 Supabase、Staging 或 Production。

### Phase 5 Owner Hot 阈值授权回归（2026-10-06）

新增 `supabase/tests/owner_hot_threshold.test.sql`（26 项 pgTAP）：覆盖 settings/audit RLS 与函数授权、匿名/Admin/普通用户拒绝、Owner 最近 TOTP/AAL2 读取和修改、范围与理由校验、一次有效修改只追加准确审计、no-op 不追加审计、采集/Hot 开启时修改被锁、陈旧 TOTP 与客户端直接改审计行拒绝。扩充 `hot_pagination.test.sql` 至 14 项，直接验证三时间窗权重、100 默认门槛、24 小时计数、同分 ID 顺序与分页。所有身份、阈值变更及临时开启的门都处于测试事务内并回滚。全套 `npm run test:local` 通过：27 个 pgTAP 文件 / 678 项断言，Node 测试通过（两项真实 ClamAV 测试默认跳过），数据库 lint 无 schema errors；此前 TypeScript、ESLint 和 36 路由生产构建亦通过。该覆盖不能证明浏览器自报停留/滚动是真实阅读，Hot 与 Valid Read 仍保持关闭。

### Phase 6 当前开发依赖审计（2026-10-06）

复核 lockfile、npm registry 与 npm audit：`npm audit --omit=dev --audit-level=high` 为 0 项；完整树仍有 5 项 high，均由 `braces@3.0.3` 经 Next 16.3.8 的 ESLint 开发链引入。GitHub Reviewed Advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 当前仍无修复版本，npm registry 最新 `braces` 也是 3.0.3；Next 与 eslint-config-next 最新是 16.3.8。npm 强制修复会将工具链降为 Next 14.2.35。未改变依赖或版本；待发布兼容补丁后再复核。

### Phase 6 本地密钥扫描（2026-10-06）

CI workflow 已运行 `node scripts/security/scan-secrets.mjs`。本地也实际运行一次：Gitleaks 固定镜像 digest、只读挂载 Git 历史与非生成工作树，扫描器输出不含凭据值；结果为 0 findings。此结果仅覆盖当前 checkout 与其 Git 历史，不代表其他未取回 refs、托管日志或 Secret Manager 内容。

### Phase 6 本地生产安全与 noindex 回归自动化（2026-10-06）

新增 `npm run security:smoke` 并加入 GitHub Actions production build 后的步骤。脚本仅在 `127.0.0.1` 临时启动隔离 build，清空外部服务环境值并保持所有功能门/索引门关闭；验证 12 个简中页面的安全头与 noindex、首页 nonce CSP、关闭索引时 robots 全站 Disallow 及 sitemap 404。隔离 production build 36 路由通过，自动 smoke 全部通过。仅为本地回归自动化，不代表 SEO/Security Launch Gate 通过，也未访问任何托管服务。
### Phase 7 orphaned restored-thumbnail deletion guard (2026-10-06)

Extended `supabase/tests/account_deletion_worker.test.sql` with an orphaned object in `mmwr-public-thumbnail-derivatives`: its restored `owner_id` is NULL, its path retains the uploader UUID, and no `evidence_metadata` row remains. The worker may claim the expired account, but `begin_account_deletion_auth_attempt` rechecks the derivative bucket, blocks Auth deletion, and sends the account to `evidence_owned` Owner review. Targeted pgTAP passed 30/30. Full `npm run test:local` passed: 27 pgTAP files / 681 assertions, Node suites with 3 opt-in isolated restore and 2 real ClamAV tests skipped by default, and database lint with no schema errors. All 8 local runtime flags remained false after transactional rollback. This proves this deletion-safety fallback only; restored access, full evidence/thumbnail reference coverage, timestamps, R2, cross-version behavior, and Staging remain open. Phase 7 is incomplete.

### Phase 7 restored application-to-Storage reference check (2026-10-06)

Added a read-only query to the isolated database restore target and invoked it after Storage object byte verification in the opt-in full local DB+Storage restore. It checks that each application evidence path exists in the evidence bucket, each non-null derivative path exists in the thumbnail bucket, and each path with an uploader retains its UUID prefix. The query returns only a boolean and does not expose paths. Strengthened the opt-in integration fixture to create one synthetic submission/evidence record and matching evidence/thumbnail objects in the existing private buckets; after isolated restore it checks each path and exact bytes before the cross-reference query. Random UUID paths avoid collisions; cleanup deletes the synthetic submission transactionally first and then removes each successfully uploaded object. `npm run test:backup` passed 48 tests with 3 opt-in restore tests skipped; the updated `npm test`, targeted ESLint, syntax checks, and `git diff --check` passed. The latest `npm run test:local` Node stage passed, but its pgTAP stage could not connect because Docker Desktop's engine pipe was absent and `127.0.0.1:54322` refused connections; DB lint did not run in that attempt. An earlier full run passed 27 pgTAP files / 681 assertions and DB lint, but predates this latest fixture change. The local query's prior true result was on 0 evidence rows and 0 thumbnail references, so it was vacuous. The new non-empty isolated restore was not executed this turn; it remains the next concrete check when the Docker engine is available. All 8 runtime flags were verified false before Docker stopped; no hosted services or gates were changed.

### Phase 6 local production security smoke recheck (2026-10-06)

Extended `npm run security:smoke` from 12 Simplified Chinese routes to 12 representative routes for each supported locale (36 total), checking HTTP 200, security headers, `noindex`, and the exact rendered `<html lang>` value (`zh-CN`, `en`, `ms`). All checks passed against the existing isolated local production build; each locale homepage CSP nonce matched its rendered inline script. With indexing disabled, `robots.txt` globally disallows crawling and advertises no sitemap, while `/sitemap.xml` returns 404. This checks only the local fail-closed state; it does not verify the enabled sitemap projection, actual keyboard/screen-reader behavior, Staging/Production, or search-engine behavior. No Supabase services or runtime gates were changed.
### Phase 6 production dependency advisory fix and regression (2026-10-06)

The production dependency audit newly found a high-severity advisory in transitive `source-map-js@1.2.1`. A normal, non-forced npm fix updated it to 1.2.2 and refreshed a small number of optional platform packages in the lockfile. `npm audit --omit=dev --audit-level=high` now reports zero vulnerabilities. The full audit still reports five high findings, all in the development lint chain `eslint-config-next@16.3.8 → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`; GitHub Advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/ghsa-vfj7-8cjw-p6xm) still lists no patched release. `npm audit fix --force` would downgrade the Next lint config to incompatible 14.2.35, so it was not used. After the lockfile update, `npm test`, `npm run lint`, `npx tsc --noEmit`, Next 16.3.8 production build (36 routes), and `git diff --check` passed. Docker's local engine/database remains unavailable, so this turn produced no new pgTAP or DB lint evidence. Phase 6's dependency gate and Phase 7's non-empty isolated DB+Storage restore remain incomplete. No hosted services or runtime gates were changed.

### Phase 4 shared public post cards source audit (2026-10-06)

Confirmed from the current source that Latest, Home, Hot, Search, Areas, Tags, and Clarifications render real public-post results through PublicPostGrid. The shared grid enforces the public list page cap of 12 and includes approved thumbnail derivatives with a +N overflow marker, excerpt, area, tags, publication date, and Reaction count; desktop and narrow layouts both use two columns. Similar-name suggestions and explicitly labeled no-data UI placeholders remain separate from public post result cards. This was a source audit, not visual browser acceptance. Phase 4 remains open for map/UI review, thumbnail lifecycle and isolated restore evidence, and Staging validation.

### Phase 4 Search card style isolation (2026-10-06)

SearchBox and SearchExperience share one CSS Module. Legacy `.results article`, `.results h3`, and `.results time` descendant selectors leaked into the embedded `PublicPostGrid`, overriding its shared card box, clarification-related heading, and publication-date styles. Removed stale search-result card rules while preserving the shared search form/suggestion styles and the separately designed similar-name suggestions. Added `components/search/search-grid-style.test.mjs` to `npm test`; it failed before the fix and passed after. Full `npm test`, ESLint, TypeScript, Next 16.3.8 build (36 routes), three-locale `npm run security:smoke` (36 routes plus robots/sitemap), and `git diff --check` passed. This does not replace visual review with real public data; no hosted service or database was touched.

### Phase 2 runtime environment sample coverage (2026-10-06)

Added `scripts/runtime-env-coverage.mjs` and `npm run check:runtime-env-example` to the default `npm test` chain. Its regression tests cover static `process.env` property/literal-index, destructured, and local-alias references. Platform-supplied `NODE_ENV`, `VERCEL_ENV`, `CI`, and npm execution-path variables are explicitly exempted. The first inventory identified six referenced names without a standalone `.env.example` entry; added comment-only entries for internal ClamAV host/port, optional backup CLI executable paths, ClamAV test port, and the isolated build directory. These entries do not set values or enable services. Dynamic OS environment pass-through is intentionally outside this application-config check; it does not prove any secret is configured or that the entire runtime configuration is free of hardcoded values. Full `npm test`, ESLint, TypeScript, and `git diff --check` passed. Docker remains unavailable, so there is no new pgTAP/DB-lint evidence.

### Phase 4 homepage quota consistency (2026-10-06)

Latest and Hot homepage queries already use shared constants for their 8-item quotas. The Tag spotlight RPC had a hardcoded limit of 12, so it now uses the shared HOME_TAG_COUNT setting. HomePage now caps all three lists at their configured display counts, even if a query unexpectedly returns extra rows. Added lib/home-quota.test.mjs to the default npm test chain to keep query and rendering aligned with the shared settings. The focused test, full npm test suite, ESLint, TypeScript, Next.js production build (36 routes), and git diff --check passed. Docker/local Supabase remains unavailable, and no hosted service or feature flag was changed. Phase 4 visual and Staging acceptance remain open.

### Phase 4 local area map browser check (2026-10-06)

Started the local Next.js development server on loopback because the existing localhost preview had no server. At the 664 px responsive width, the Simplified Chinese area page rendered the two-column region list, selected-state panel, map, and attribution disclosures. Following the observed region link switched the URL and selected map to Kelantan; the SVG exposed a District boundary path. Zoom-in enabled zoom-out/reset, and reset returned the SVG to its fitted state. On the homepage, the map rendered 16 state/federal-territory paths and zero District boundary paths. The page showed explicit unavailable states for area counts, the District directory, and public posts because local Supabase is disconnected; no console errors appeared. This is a local UI spot-check only: real-data pins/previews, keyboard/screen-reader review, user acceptance, and Staging remain open. The temporary dev server was stopped after inspection; no hosted service or flags were changed.

### Phase 6 clarification Article structured data (2026-10-06)

Extracted the clarification detail route's inline Article JSON-LD into a tested serializer. It emits only the public approved headline/excerpt, route language, and a datePublished value when it is valid ISO date-time data. Canonical and citation are included only as safe HTTPS URLs; citation is additionally constrained to the same origin. The route uses locale-prefixed clarification/source URLs when the indexing gate provides a production origin. No author, image, registration-only body, or internal evidence is invented or serialized. Four focused tests passed, including script-termination escaping, malformed optional values, and cross-origin citation rejection. The complete SEO suite passed (19/19), as did TypeScript, targeted ESLint, the 36-route production build, and git diff --check. No hosted environment or indexing flag was changed; Rich Results validation and production crawl checks remain gated on Staging/indexing readiness.

### Phase 6 unique main landmark smoke coverage (2026-10-06)

The shared SiteChrome already supplies the page main landmark, but 14 page components also emitted their own nested main elements. Added a production-response assertion requiring exactly one rendered main landmark and expanded smoke coverage to include public post, clarification, and Tag detail routes. The new assertion first failed on /zh-cn/submit with two main elements. Replaced each nested page root with a normal container while preserving language attributes and styling. The isolated production build passed for 36 routes; the updated security smoke passed 45 page responses across zh-CN, English, and Malay with exactly one main landmark, existing noindex/security-header/lang checks, and the robots/sitemap closed-index checks. ESLint, TypeScript, and diff check passed. This does not cover keyboard/screen-reader behavior or real data states. No hosted service, database, or runtime gate was changed.

### Phase 6 local keyboard interaction spot-check (2026-10-06)

Using a loopback development preview, keyboard Tab reached the main navigation and area list; Enter selected Kelantan and updated the selected map. Enter activated map zoom and reset controls. Search accepted `Johor` and Enter submitted to `/zh-cn/search?q=Johor`. The public search service showed its unavailable state because local Supabase was disconnected, so this confirms keyboard operation and query routing only, not real search results, screen-reader behavior, full-site accessibility, or Staging acceptance. The temporary preview was closed; no hosted services or feature gates were changed.

### Phase 7 backup suite recheck (2026-10-06)

Re-ran `npm run test:backup` on the current worktree: 48 passed, 0 failed, and 3 opt-in local isolated-restore tests skipped. The adapter tests cover the new read-only evidence/thumbnail reference query, but do not prove restoration against populated data. `docker info` currently cannot connect to the Docker Desktop Linux engine, so the non-empty DB+Storage restore fixture remains unexecuted; no stack was restarted or created. Backup/restore gates remain OFF, and no hosted service was accessed.

### Current worktree local regression recheck (2026-10-06)

The full default `npm test` chain completed without failures. Seven opt-in integration tests were skipped by default: three isolated backup/restore cases requiring local Supabase, two private-thumbnail cases requiring local Supabase/Storage, and two real ClamAV daemon cases. `npm run lint` and `npx tsc --noEmit` passed. This does not include pgTAP/database lint, a fresh production build, the non-empty DB+Storage restore, or any Staging/Production checks; Docker remains unavailable.

### Phase 6 dependency advisory recheck (2026-10-06)

Current `npm audit --json` still reports five high findings in the Next ESLint development chain, while `npm audit --omit=dev --audit-level=high` reports zero. The npm registry currently lists `braces` and `braces@3` at 3.0.3, and Next / `eslint-config-next` at 16.3.8. GitHub Reviewed Advisory GHSA-vfj7-8cjw-p6xm still marks `<=3.0.3` affected with no patched release. No compatible update is available, so no forced major downgrade or unmaintained fork override was applied. Production dependencies are clear; the full development-tree audit gate remains open.

### Phase 6 image loading source spot-check (2026-10-06)

The three current app image call sites use Next Image. Public thumbnail cards set intrinsic dimensions, responsive `sizes`, lazy loading, async decoding, and `no-referrer`; they are marked decorative. Area flags are also decorative, while the TOTP QR code has alternative text. This is a source check only: it does not measure network behavior, CLS/LCP, screen-reader output, or image failure presentation, so Core Web Vitals and browser accessibility review remain open.

### Phase 7 Docker Desktop startup diagnosis (2026-10-06)

Docker Desktop GUI/backend processes were present, but the `docker-desktop` WSL distro was Stopped and the Linux engine pipe was absent. The authorized `docker desktop start` command reported that Desktop was already running. `wsl --shutdown` followed by a Desktop restart did not recover the engine; the backend log reported that the Secrets Engine could not rename `%LOCALAPPDATA%\docker-secrets-engine\engine.sock` to `.stale` because Windows could not access the file. The socket path is a reparse point and its ACL could not be read. No socket deletion/rename, Docker data cleanup, factory reset, container creation, or hosted access occurred. Restore the local Docker Desktop Secrets Engine/WSL startup before the opt-in isolated DB+Storage restore can run.

### Phase 6 closed-index production smoke recheck (2026-10-06)

Re-ran `npm run security:smoke` against the existing isolated `.next-validation-ci` production build. All 15 sample routes across zh-CN, English, and Malay (45 responses) returned 200 with the expected security headers, noindex, locale `html lang`, and exactly one main landmark. Homepage nonce CSP matched its inline HTML; with indexing disabled, `robots.txt` globally disallowed crawling and advertised no sitemap, and `/sitemap.xml` returned 404. This is closed-index local behavior only; it does not verify the open-index sitemap or any hosted crawler/configuration.

### Phase 4 public thumbnail failure fallback (2026-10-06)

`PublicPostGrid` previously hid only a failed `<img>`, leaving blank cells in 2/3-image collages and no normal placeholder when the sole image failed. Added a pure grid-layout helper and regression tests; a failed derivative now returns the whole card to its existing MMWR no-image state. Healthy collages retain up to three images and the `+N` overflow indicator. The regression failed on the old behavior before implementation. Thumbnail tests passed (14 passed, 2 local Supabase opt-in cases skipped), as did the full default `npm test`, full ESLint, TypeScript, and isolated Next production build (36 routes). No thumbnail gate or database was enabled; visual verification with real thumbnail delivery remains open.

### Phase 4 public thumbnail rate limiting (2026-10-06)

Added forward migration `20261006100000_mmwr_public_thumbnail_rate_limit.sql` with a private RLS-protected counter table that stores keyed HMACs only, a service-role-only RPC, a limit of 180 requests per minute and 3,000 per hour, and lazy cleanup of hashes inactive for 48 hours. The delivery handler checks the limit before public eligibility lookup or private Storage reads; over-limit requests receive 429/`Retry-After`, and missing trusted-proxy configuration or database errors fail closed. It reuses the existing trusted-header and HMAC-secret configuration with a thumbnail-specific HMAC domain. The thumbnail test suite passed 20 tests; 2 local Supabase opt-in tests skipped. The full default `npm test`, full ESLint, TypeScript, isolated Next production build (36 routes), migration rollback coverage (105/105), and diff check passed. New pgTAP coverage checks table and RPC grants, the 180-request boundary, and malformed keys, but could not run because the local Docker database is unavailable; migration application and DB lint are also unverified. Thumbnail gates remain OFF and no hosted service was accessed. After Docker recovers, run the new pgTAP and DB lint, then verify the selected proxy overwrites the configured client-IP header and tune the explicit limits in Staging before considering activation.

### Phase 6 registration-wall structured data policy (2026-10-06)

Rechecked the local story and clarification routes against Google's current paywalled-content and general structured-data guidance. Public Story HTML and `CreativeWork` JSON-LD contain only the public title/summary; the full body is server-read only for an authenticated eligible account. Clarification `Article` markup likewise uses only its approved public fields. Google documents `hasPart` / `isAccessibleForFree=false` for registration-gated content that the publisher wants indexed, with a matching class in the page, and says markup must represent content visible to readers. Since anonymous HTML does not contain the full body and MMWR does not grant bots an auth bypass, do not mark a nonexistent anonymous paywall section or serve a different body to crawlers. The Phase 6 checklist now makes public-summary-only indexing the current policy; any decision to index the full body requires product/legal approval and a design that preserves equal non-privileged delivery. `npm run test:seo` passed 19/19, including public-field-only serialization and URL/date validation. This was a source/unit audit; browser-rendered SSR, database-backed states, Rich Results Test, Search Console and Staging remain unverified. References: [Google paywalled content markup](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content), [general structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

### 2026-10-06 Admin Storage summary follow-up

The staff Storage widget now has a separate read-only count and recorded-size summary for the private evidence quarantine bucket and private thumbnail derivative bucket. It is protected by the existing Admin/Owner and recent-TOTP checks and returns no object names, paths, or per-object metadata. This visibility does not establish a storage cap, billing budget, or orphan-retention policy. Migration `20261006114809_staff_storage_usage_breakdown.sql` and pgTAP coverage are authored but remain unverified because the local Docker database is unavailable; Node parsing coverage and rollback documentation coverage pass. Thumbnail, submission, and scanner gates remain OFF.

### 2026-10-06 Tag globe keyboard-focus behavior

Keyboard focus on an interactive globe tag now pauses random auto-rotation and clears inertial movement so the focused link cannot rotate behind the sphere and become hidden from assistive technology. Rotation resumes when focus leaves the globe links. Pointer hover remains unchanged and does not pause the globe. The sphere motion regression suite passes 5/5 with targeted ESLint and TypeScript checks; a current localhost browser policy blocked visual keyboard/screen-reader verification, so broader Phase 4 accessibility acceptance remains open.

### 2026-10-06 Area count accessible names

State links and clickable District map pins now expose accessible names containing the localized area name, formatted public-post count and its unit; state links explain when the count is unavailable. The focused area/map test group passes 9/9 with targeted ESLint and TypeScript checks. Screen-reader/browser verification remains open.

2026-10-06 Phase 6 Sitemap 故障处理：帖子/标签总数读取失败或返回非法数值时，分页器不再把未知值按零处理；Sitemap Index 与分片端点都 fail closed，避免静默发布不完整目录。已确认的零记录仍会有基础分片。Sitemap 相关单测 10/10、TypeScript、定向 ESLint 通过；索引开启数据和 Staging 仍待验收。

2026-10-06 Phase 4 Tags 无障碍增量：球体可见标签链接的 accessible name 现包含完整标签名和本地化公开帖子数，示例预览仍保持装饰性隐藏。三语辅助名称专项回归、TypeScript、定向 ESLint 通过；真实键盘、读屏和 Staging 验收仍待完成。

2026-10-06 Phase 6 Sitemap 分片完整性：Tag/帖子分片的读取错误不再伪装为空目录，非法或重复 Tag ID、异常公开帖子行及与计数不符的分片长度都会令端点 fail closed。SEO 测试 25/25、TypeScript、定向 ESLint 与差异空白检查通过；Docker Engine 仍不可用，未做数据库集成、托管或 Staging 验证。

2026-10-06 Phase 6 Sitemap 动态目录完整性：首分片依赖的 Latest、已启用 Hot、州属计数和 District 列表查询若暂不可用，现在不再静默漏页，而是停止发布该分片；确实无结果与查询失败分别处理。SEO 单测 27/27、TypeScript、相关 ESLint 和 `git diff --check` 通过。Docker Engine 未运行，本地数据库集成与 Staging/托管数据仍未验证。

2026-10-06 Sitemap 修正后 production build 与安全复验：隔离构建生成 36 条路由；三语 45 个代表页面通过 200、安全头、noindex、lang 与 main 检查，robots 在闭索引时禁止抓取且无 Sitemap 声明，`/sitemap.xml` 为 404。构建自动修改的 `tsconfig.json` 已恢复构建前字节内容。仅本地闭索引验证；Docker/数据库、开放索引数据、Staging 和爬虫结果未验证。

2026-10-06 当前工作树全量 Node/ESLint 复跑：`npm test` 完整通过（仅真实 ClamAV 两项依 opt-in 默认跳过），全仓 `npm run lint` 通过。当前工作树 TypeScript、隔离生产 build（36 路由）及闭索引三语 smoke（45 个页面）也已通过。Docker Engine 未运行，pgTAP/DB lint 未复跑；未连接 Supabase Staging 或 Production。

2026-10-06 Phase 4 Tags 搜索无障碍增量：关键词过滤更新结果时，新增不会改变视觉布局的三语 aria-live 结果数量播报；初始未筛选状态不播报。测试 10/10、TypeScript、组件定向 ESLint、差异空白检查通过。实际浏览器键盘/读屏体验仍未验收。

2026-10-06 标签读屏变更后复验：完整 `npm test` 通过（两项真实 ClamAV opt-in 测试默认跳过），全仓 ESLint 和 TypeScript 通过。`npm audit --omit=dev --audit-level=high` 为 0；完整依赖审计仍有 5 项 Next ESLint 工具链间接 High，未执行会降级 Next 配置的强制修复。Docker Engine pipe 不可用，数据库测试未运行；未连接托管服务。

2026-10-06 Phase 7 恢复门一致性：Storage 恢复协调器现与 DB 恢复协调器共用 `MMWR_BACKUP_RESTORE_ENABLED` 默认关闭 gate，并在任何备份读取或目标 Storage 检查前拒绝关闭态。`npm run test:backup` 49 通过、3 个本地 Supabase opt-in 用例跳过；定向 ESLint、TypeScript 通过。没有打开恢复门或连接外部存储。

Phase 7 gate 修复补充：本地 Storage 恢复 smoke 仅在显式 `MMWR_TEST_LOCAL_STORAGE_RESTORE=true` 且执行合成恢复的短区间打开恢复 gate，完成后恢复环境值；该 smoke 本轮未执行。

2026-10-06 Phase 7 本地 Storage 恢复目标边界：Storage 恢复适配器此前接受任意 HTTPS 主机，只靠调用方传入 `targetEnvironment: "isolated"` 与项目引用判断目标。现仅接受 loopback Supabase URL（`localhost`、`127.0.0.1`、`[::1]`），托管 Supabase 与任意自定义远程域名会在创建 SDK 客户端之前被拒绝；未来远程 Staging 恢复需要另行设计并审核专用目标绑定。回归测试先失败后通过。`npm run test:backup` 为 50 通过、3 个 opt-in 本地 Supabase 集成测试跳过。Docker/R2/托管环境未连接，恢复及备份门仍 OFF。

本轮补充复验：完整 `npm test` 退出码 0；全仓 `npm run lint`、`npx tsc --noEmit` 通过。全套默认 Node 测试中仅 3 个本地 Supabase 恢复集成与 2 个真实 ClamAV 测试按 opt-in 规则跳过；迁移回滚覆盖检查为 106/106。`git diff --check` 退出码 0（Git 提示工作树 LF 将转 CRLF，不是空白错误）。Docker Engine 仍缺失，未运行 `test:db` 或整套恢复。

2026-10-06 Phase 4/6 分页无障碍增量：共用帖子列表与 Hot 列表的分页 landmark 现在使用简中、英语和马来语的清晰导航名称，当前页文字带 `aria-current="page"`；可见布局不变。新增分页标签单测并纳入 `npm test`。完整 `npm test` 与全仓 ESLint 通过，TypeScript 通过；默认跳过 3 个本地 Supabase 恢复集成和 2 个真实 ClamAV 用例。没有真实浏览器/读屏、Staging 验收，Phase 4/6 整体仍未完成。

2026-10-06 Phase 4/6 分页状态修正：共用 Posts 分页与 Hot 分页现在只在有结果且确实存在上一页或下一页时显示；空结果、服务不可用、单页数据和无路由链接时不再出现空分页栏。新增回归覆盖各状态与链接边界。完整 `npm test`、全仓 ESLint、TypeScript 通过；3 个本地 Supabase 集成和 2 个真实 ClamAV 测试默认跳过。没有浏览器/读屏验收或托管服务操作。

2026-10-06 当前清单局部复验：迁移回滚文档覆盖检查为 106/106，运行环境变量均能在 `.env.example` 或平台变量中找到，SEO 回归 27/27 通过。Docker 引擎不可用，未运行数据库集成/DB lint。另复核发现普通帖子与澄清在永久移除后都 308 跳转首页；Google Search Central 建议无相似替代内容时直接返回 404/410。由于 `USER_MANUAL.md` 明确记录跳首页，这项行为等待产品决定；本轮未改路由。参考：[Google Search Central：Crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)。

2026-10-06 Phase 4 地图与标签回归复验：`npm run test:maps` 9/9、`npm run test:tags` 12/12，TypeScript 检查通过。覆盖了 District 边界坐标/名称与数量、地图缩放平移边界、标签球取样/分散/旋转与无障碍名称；不覆盖实时 Supabase 数据、浏览器目视/读屏或 Staging。
