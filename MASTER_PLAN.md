# MMWR 实施总计划与上线清单

> **Codex 执行约定：** 本计划按阶段推进。每个阶段完成后更新复选框、记录实现证据与未完成项。涉及用户账号、真实投稿、密钥、第三方账号和 Production 的操作必须由用户逐步完成；不得自行假设已发布。以 [HANDOFF.md](HANDOFF.md) 为产品决策权威，以 [USER_MANUAL.md](USER_MANUAL.md) 为操作目标。

**目标：** 构建可审计、可恢复、三语的 MMWR 网站及 Owner/Admin 工作台，并达到安全与 SEO 上线门槛。

**架构方向：** 先盘点现有项目，再基于 Next.js + Supabase + Vercel 落地。按 Development / Staging / Production 隔离配置；用户附件由 Supabase Storage 托管，Cloudflare R2 存放独立加密备份。前台内容、后台操作、分析和广告商业数据按服务端权限分区。

**配套规格：** HANDOFF.md。**用户操作手册：** USER_MANUAL.md。

### 当前发布状态（2026-10-16）

Vercel Staging Preview READY（部署 `dpl_31sRhWfBGVqRJE7Tgwsc3XkyrKfd`，`target=null`），来自 `staging` 分支旧提交 `10fcb1750d16b402a487c96d586d617946631066`；项目启用 SSO。Staging Supabase ref `jjgwiipawyoizwalanha` 的 106 个迁移此前与远端 ledger 核对一致，Resend Staging 域名已验证。发现 Turnstile API 未初始化后，已在本地修改为将请求 CSP nonce 传给 Next Script；本地完整 `npm test`、ESLint、TypeScript、`security:smoke` 与 production build 均通过，尚待更新 Staging Preview 并验证挑战。真实 ClamAV 与本地 Supabase 恢复测试按默认规则跳过，且本轮未跑 DB lint/pgTAP、真实登录流程或发信。

**Production 阻塞状态：** 当前 Vercel Production Supabase URL 与 `NEXT_PUBLIC_SITE_URL` 仍指向 Staging；没有独立 Production Supabase/Storage/Secrets、正式域名绑定或 Production 部署。Auth Site URL/callback/Auth SMTP、合成账号/权限/TOTP验收、Phase 7 R2 备份及完整隔离恢复、RPO/RTO/密钥保管、法务、公开索引 SEO、GSC/Bing 与回滚演练均未完成。所有高风险开关保持 OFF。本轮未创建付费资源、未发送邮件、未建真实账号、未改 DNS。上线清单状态以本节和 HANDOFF 的 2026-10-16 快照为准；下面的旧日期条目保留为历史证据，不代表现况。

Staging 浏览器验收补充：地区页正常加载；账号页曾显示安全验证进行中且登录按钮禁用，Turnstile 尚未在线通过。当前 Preview origin 是 `staging-mymostwanted-net-git-staging-shauntoks-projects.vercel.app`。2026-10-16 只读核对 Cloudflare widget 后确认，允许主机已同时包含该 Preview hostname 与 `staging.mymostwanted.net`；Vercel Preview 的公开 Site Key 与该 widget 一致，因此主机名和 Site Key 不匹配不构成原因。浏览器进一步确认 `window.turnstile` 未定义，Turnstile `api.js` 标签缺少当前请求的 CSP nonce；应用 CSP 使用 `strict-dynamic`。已在本地修复，将代理生成的 nonce 显式传给所有 Turnstile 脚本；仍须在 Staging 重新部署后确认 API 初始化、验证码回调与 Siteverify。Cloudflare 控制台显示尚未调用 Siteverify；之前没有提交验证码表单，因此该提示不能单独证明故障原因。不要关闭挑战或绕过 server-side Siteverify。

Supabase Production 项目创建尝试被 Free plan 的两项目上限拒绝，未创建新项目，也未变更任何现有项目。官方计费说明表示此上限按用户汇总其担任 Owner/Admin 的 Free 组织，暂停项目不计入；当前 `ourlittleage` 与 `mmwr-staging` 均为活动项目。创建前工具报价为 $0，但受项目上限阻挡。可选后续是：将 `Shauntok's Org` 升级到 Pro 并承担该组织所有项目的订阅/计算费用，或另建独立付费组织仅承载 Production。按官方 Pro $25/月、Micro 计算 $10/月与 $10/月计算额度估算，独立组织单个 Micro 项目约 $25/月；若同一组织继续承载三个 Micro 计算项目，约 $45/月。此为估算，不含超额用量/税，现有项目实际计算规格待账单页核对。见 [Supabase 计费说明](https://supabase.com/docs/guides/platform/billing-on-supabase) 与 [计算费用](https://supabase.com/docs/guides/platform/manage-your-usage/compute)。等待 Owner 选择付费组织及确认月度费用后再建 Production。

## 全局约束

- MMWR 正式英文品牌名固定；三语仅翻译 UI。Light/Dark 同一设计系统；视觉配色遵循用户确认的参考图（浅冰蓝/白/青蓝/海军蓝），Dark 使用同一品牌色的深海军蓝与亮青适配方案。
- 所有广告位、自动翻译、视频、草稿、VIP/评论、广告商 Portal 默认关闭或不属于 V1。
- RLS、Owner/Admin 2FA、内部证据隔离、审计、安全 Headers、年龄门、Consent 与备份为必备能力。
- SEO 与 Security 均为 Launch Gate。不得把待审/内部资料交给爬虫。
- 任何部署状态用“本地完成 / Staging 验证 / Production 配置 / Production 验证”准确标记。
- 遇到功能规格冲突，优先采用对话中用户最后明确确认的值，并更新本计划/HANDOFF；不得擅自发明细节。

---

## Phase 0 — 交接、仓库盘点与小时代迁移评估

- [x] 检查仓库位置、分支、工作区改动、README、AGENTS.md、部署目标、测试和现有功能，不覆盖已有工作。
- [x] 找到小时代仓库；建立迁移矩阵，记录搜索、广告、反馈、字眼检测、权限、后台、分享、草稿等现状/依赖/安全差异和建议。
- [x] 记录实际技术栈与版本；确认 MMWR 尚无数据模型迁移，记录依赖及不可从旧项目照搬的迁移边界。
- [x] 绘制架构、信任边界、角色矩阵、数据分类与生命周期；列出 Dev/Staging/Production 环境变量名称，不记录真实密钥。
- [x] 记录未决产品/合规决定：边界数据许可、上传限制、客服 Telegram、域名、数据保存天数、法律文本审阅等。

**验收：** 有现状报告、迁移矩阵、数据流和风险/未决清单。没有未调查便复制旧代码。

**完成记录（2026-09-28；本地架构续记 2026-09-30）：** 现状与依赖见 [docs/architecture/PHASE0_ARCHITECTURE.md](docs/architecture/PHASE0_ARCHITECTURE.md)，小时代源码评估见 [docs/OUR_LITTLE_AGE_MIGRATION_MATRIX.md](docs/OUR_LITTLE_AGE_MIGRATION_MATRIX.md)。只读审阅了旧仓库源码和文档；未打开旧项目环境文件、真实资料或生产输出，未复制旧代码。仍需核实的决定包括边界数据许可、法务审阅、邮件/域名、扫描主机供应商/容量与分析保留期限；ClamAV 的队列、worker 和内部 broker 已实现本地初版，但未实际运行/验证或配置。

**Phase 0 本地现况刷新（2026-10-05）：** 架构快照已更新以反映当前仓库，而不是把 2026-09-28 的空白脚手架状态当成现状。只读核对当前磁盘 104 个迁移版本与本地 Supabase 迁移账本完全一致，最新为 `20261005160001`；`npm run test:local` 已通过 26 个 pgTAP 文件 / 644 条断言，DB lint 无 schema errors。当前架构文档准确区分本地 Auth/Turnstile/Analytics/备份组件与未配置的托管服务；本地验证不改变 Phase 2–8 的 Staging、政策或上线验收状态。

## Phase 1 — 设计系统、国际化与基础页面

- [x] 创建当前 UI 使用的三语文案（简体中文/English/Bahasa Melayu），品牌名固定；日期、数字与表单错误文案随对应功能页面一并实现（当前尚无日期数据或真实表单）。
- [x] 建立统一 Light/Dark Tokens、响应式导航、覆盖式 Left Drawer、Logo 两形态、组件焦点/键盘/屏幕阅读支持。
- [x] 首页骨架按地图、Latest 8、Hot Ranked 8、12 个 Smart Mix Tags、广告可选位顺序搭建。
- [x] 加入 18+ Gate：通过后 30 天；未成年人路径不记通过 Cookie。实现年龄 Gate 与 Cookie Consent 不互相绕过。
- [x] 建立 Footer 的 Legal、Privacy、投稿规则、申诉/更正/撤下、Cookie 设置入口；草拟内容须标明待马来西亚律师审阅。

**验收：** 三语言 UI 与主题全站一致；手机/桌面导航工作；18+ Gate 每条状态路径可验证；无默认打开的可选功能。

**完成记录（2026-09-28）：** 当前所有 UI 页面均提供简体中文、English 和 Bahasa Melayu 文案；日期格式与表单验证文案将在这些功能出现时接入。已完成首页布局、18+ Gate、Cookie Consent、法律草稿页和主要导航 noindex 状态页；页眉、页脚和年龄 Gate 暂用原创猫头鹰 SVG 符号，并新增同款浏览器应用图标；后续由用户的最终品牌设计替换。首页按批准的视觉参考搭建浅冰蓝色导航/公告/搜索区、中央州界地图卡片及 Latest/Hot Ranked 列表区；地图采用 geoBoundaries / UNHCR、HDX（ADM1，2019）简化州界路径，按 CC BY 3.0 IGO 标示来源，并支持州与联邦直辖区选择，但没有地点数据、Pins、统计或地区筛选。覆盖式左侧抽屉、键盘焦点边界、焦点返回与 18+ Gate 焦点恢复已实现并通过代码独立审查；未运行构建或测试。内容、账号与投稿仍为空/未完成；法律草稿须律师审核。此为本地代码进度，不代表 Staging 或 Production 验证。

## Phase 2 — 数据模型、认证、RLS 与附件存储

**本地当前复验（2026-10-05）：** 在本地 Supabase 数据库运行 `npm run test:local`，Node 套件通过（2 项真实 ClamAV 按默认配置跳过）；pgTAP 26 个文件 / 644 条断言通过；`supabase db lint --local` 无 schema 错误。`supabase migration list --local` 最新为 `20261005160001`，磁盘包含 104 个迁移文件；本地 8 个 `private.runtime_flags` 均为 false。另通过 `npm run lint`（0 错误/警告）、`npx tsc --noEmit`、`git diff --check` 与隔离目录 production build（38 条路由）；Advisor 无问题。固定 digest 的 ClamAV 临时 daemon 测试为 15/15，通过后已停止并清理容器/端口。生产依赖审计为 0 项漏洞；完整审计有 5 项开发 lint 工具链 high 报告，强制建议的 Next 14 降级不适用于当前 Next 16，未执行。该结果不等同于真实 Supabase Storage 上传/Worker 集成；投稿及附件入口继续关闭。未访问托管 Supabase、Staging、Production 或 GitHub Actions，也未启用任何开关。仍不替代浏览器、Owner UI 与 Staging 验收。

**真实 ClamAV daemon 本地验证（2026-10-05，续）：** 使用本机已有、按 SHA-256 固定的 `clamav/clamav` 1.4.6 镜像及最新签名库，临时容器端口仅绑定 `127.0.0.1:3310`；`MMWR_TEST_REAL_CLAMD=true npm run test:scanner` 为 7/7 通过，真实 clamd 对合成 PNG 返回 clean、对规范 EICAR 样本返回病毒命中；Worker 的隔离/签名类检查也同时通过。测试后容器已停止并由 `--rm` 移除，端口确认关闭。没有运行 Dockerized evidence-scanner worker、Supabase broker/Storage 链路、投稿或上传；所有功能开关仍关闭。此项证明本机 Worker 到真实 clamd 的扫描协议，不证明上传、隔离桶、服务集成或 Staging/Production 验收。

**本地验证记录（2026-10-04，续）：** 本机 Docker/Supabase 的隔离数据库已从空库重建并应用当前迁移链；本轮本地迁移清单与磁盘迁移全数一致，最新到 `20261005110000_mmwr_report_audit_append_only.sql`。`supabase test db --local` 的 13 个 pgTAP 文件、277 项断言全部通过，夹具在事务内回滚。新增 Analytics 边界测试验证路线 PV 白名单及 `submit`/私密路由拒绝、服务端写 RPC 权限、60 次/分钟限额、员工读取需近期 TOTP、默认关闭的 Valid Read/Hot、历史提交汇总隐藏和 48 小时/30 天/13 个月清理。Phase 7 新增 12 项 Node 测试，本地合成 Worker 成功/篡改路径均通过，另发现并修复两个流处理错误。`supabase db lint --local` 退出码 0、无 schema/error 级问题，仍有 7 条未读取锁变量提示；Supabase Advisor 无问题。`npm run lint`、`npx tsc --noEmit` 和隔离生产构建均通过，构建生成 38 条路由；lint 保留 2 条既有警告，简中 7 个关键路由返回 200。以上均为本地结果，不代表完整 RLS/浏览器/外部服务或 Staging/Production 验收；未连接托管 Supabase、Vercel 或真实服务器，所有收集开关保持关闭。

**最新本地复验（2026-10-04）：** 恢复码邮件策略的新增 pgTAP 用例发现账号删除迁移重建 `private.security_events` 类型约束时漏掉 `recovery_code_redeemed`；新增前向迁移 `20261004120232_restore_recovery_code_security_event_type.sql` 恢复白名单。搜索/Smart Mix 行为测试又发现 `published_previews.content_type` 未授权给调用公开 Smart Mix 的两种读者角色；新增 `20261004121425_grant_public_content_type_for_smart_mix.sql`，只补该安全公开列，不授予整表读取。内容权限测试现覆盖批准/待审别名、规范名称返回、私密正文排除、服务端模糊建议、Smart Mix 公开标签和 anon/authenticated 调用。数据库从空库重置并对齐当前全量迁移链；`supabase test db --local` **21 个文件 / 452 项断言通过**，`npm run lint` 无错误（2 条既有警告），`npx tsc --noEmit` 通过。所有夹具回滚；无托管 Supabase、SMTP 或真实服务器调用。

- [x] 定义 users/roles、posts/cases、aliases、evidence、tags、locations、reports、notifications、audit logs、revisions、reactions 等核心模型和状态机；Analytics、Campaign、Backup 模型由各自阶段再细化。
- [ ] 每个迁移包含索引/约束/可回滚策略；将配置从代码硬编码中分离。用最小权限角色进行读写授权。**迁移回滚文档覆盖（2026-10-05）：** 逐文件比对确认当前 104 个迁移均在 `docs/operations/` 六份回滚指南中有精确文件名条目，未发现缺项；[`INITIAL_MIGRATION_ROLLBACK.md`](docs/operations/INITIAL_MIGRATION_ROLLBACK.md) 覆盖 22 个早期迁移，新增 [`PHASE4_MIGRATION_ROLLBACK.md`](docs/operations/PHASE4_MIGRATION_ROLLBACK.md) 记录私有缩略图派生迁移与证据保留边界。现增加 `npm run check:migration-rollback-coverage` 并纳入 `npm test`：递归扫描迁移和回滚指南、要求逐个迁移文件名以代码标记精确出现；两项 fixture 测试覆盖成功及遗漏检测。自动覆盖检查不代表所有恢复步骤经过数据库演练。**运行配置盘点（2026-10-05）：** 静态提取应用 `process.env` 引用并与 `.env.example` 对照，所有部署运行变量均有样板条目；未列出的 `MMWR_TEST_CLAMD_PORT`、`MMWR_TEST_REAL_CLAMD` 是选择加入的扫描器测试参数，`MMWR_VALIDATION_DIST_DIR` 是仅本地隔离构建辅助变量，已在样板加注避免进入共享部署配置。此项不代表配置无硬编码的完整审计；配置/密钥审查与逐角色最小权限验证仍未完成。**运行环境变量样板回归（2026-10-06）：** 新增 `scripts/runtime-env-coverage.mjs` 与 `npm run check:runtime-env-example`，并纳入默认 `npm test`；测试覆盖 `process.env` 的静态属性/字面索引、解构和本地别名引用，平台提供的 `NODE_ENV`、`VERCEL_ENV`、`CI` 与 npm 执行路径明确豁免。初次盘点发现 6 个静态名称没有独立样板键，已在 `.env.example` 以注释形式补齐 ClamAV 内部地址、备份 CLI 可选路径、ClamAV 测试端口和隔离 build 目录；未赋值、未开启。动态系统环境 passthrough 不纳入应用配置检查；此静态覆盖仍不替代密钥配置或完整配置审计。
  **客户端 View 授权回归（2026-10-05）：** 扩展 `client_table_grant_inventory.test.sql`：任何获 anon/authenticated `SELECT` 权限的应用 View 必须带 `security_invoker=true`；客户端不得直接读取 Materialized View。当前本地 public/private schema 没有任何 View 或 Materialized View；新增的 pgTAP 检查纳入完整本地套件，26 个文件 / 638 条断言通过，db lint 无 schema errors。该约束防止未来新增 View 意外绕过底表 RLS；不替代完整 Data API 角色矩阵及托管验证。
- [ ] 建立邮箱密码注册、验证、登录、重置密码；未验证用户能阅读及 Reaction，投稿要求邮箱验证。
- [ ] 逐表启用 Supabase RLS；验证访客、普通用户、暂停用户、Admin、Owner 各能读写的精确数据范围。Service Role 仅服务端。
- [ ] Owner/Admin TOTP 2FA、恢复码一次性展示、强制启用门、仅工作人员后台适用的 15 分钟闲置 / 8 小时绝对 Session 时限、敏感动作重验证、登录/2FA rate limit 与登录异常记录；时限实现仍待用户 UI 验收及 Staging 验证。**应用层会话证明回归（2026-10-05）：** 抽出纯 claim 校验 helper 并加入 `npm run test:staff-session`，验证只接受结构有效的 AAL2、TOTP AMR、用户 UUID 与 session UUID；覆盖错误 AAL、缺失/伪造 AMR、无效 UUID、非对象 claim。2/2 测试通过并加入默认 `npm test`。**工作人员心跳请求边界回归（2026-10-05）：** 抽出请求信封校验 helper 并加入 `npm run test:staff-session-request`，要求请求同源、无 query/body/content-type 且 Content-Length 为空或 0；拒绝跨源及带载荷请求，3/3 通过并进入默认 `npm test`。数据库 15 分钟闲置 / 8 小时绝对超时仍由既有 pgTAP 覆盖；这些增量不替代后台 UI 与 Staging 验收。
- [ ] 实现私有证据 Storage、公开/内部隔离、签名 URL；内部证据权限仅 Admin/Owner 可看、Owner 才可切换可见性。记录内部证据访问审计。
  - 本地受控读取增量（2026-09-30）：审核详情加入仅扫描状态为 clean、visibility 为 internal_only 的附件预览入口。访问要求 Admin/Owner + AAL2 + 10 分钟内 TOTP，Admin 看不到高风险投稿；部署变量与私有数据库开关双重默认关闭。数据库为单次 30 秒 grant，使用后才由服务端 Secret Key RPC 读取对象路径，并签发 60 秒 Supabase Storage URL；浏览器只收到短时 URL，不返回原始对象路径。每次授权写入不可变审计，pending/quarantined/rejected/public-thumbnail/帖子附件均不允许通过该入口读取。近期 TOTP/账号处罚检查现以墙钟 `clock_timestamp()` 计算，动态授权 helper 和其稳定调用者已统一标为 `VOLATILE`；grant 在用户限速锁之后复核角色、TOTP、账号限制、证据资格与开关，消费时再检查账号限制。Staging 清单补充超时锁等待、签发后停权和到期边界检查。Owner 切换附件可见性仍关闭。
  - Owner 可见性本地实现（2026-09-30）：新增 `20260930130000_owner_evidence_visibility.sql`，新登记附件默认 `public_thumbnail`（“准备公开”），但仍在私有隔离桶中；公开投影只考虑关联正式帖、扫描 clean 且可见性为 `public_thumbnail` 的证据，待审投稿本身不会公开附件。审核详情 Owner 面板只列活动投稿中的 clean 附件，可在 `public_thumbnail` 与 `internal_only` 间切换；操作要求 Owner、近期 TOTP、必填理由及行锁后再次授权检查，变更写入不可变审计。Admin 不能切换；扫描状态与投稿状态不符时数据库拒绝。应用环境变量 `OWNER_EVIDENCE_VISIBILITY_ENABLED` 与私有数据库开关双重默认关闭。初始状态只对新登记附件生效，不回写既有附件。上传、预览、公开读取仍关闭；迁移未应用，数据库权限、锁等待、审计与投影行为未验证，不得启用。
- [ ] 上传图像/音频/PDF/白名单文档：扩展名、MIME、魔数校验、可调大小/数量、防病毒/隔离、路径随机化；V1 视频关闭。依用户决定，缺少已扫描通过的图片只产生普通风险提示，不拦截投稿、不判断证据真伪。
- [ ] 建立 7 天账号删除冷静期与取消机制；到期解除身份关联，保留已发布内容和必要审计/法律保留。
  - 政策已确认（2026-10-04）：账号删除时删除该账号全部 `private.username_history` 行；旧用户名不保留、不预留，可按当前 Profile 唯一约束再次注册。新增前向迁移 `20261004190000_mmwr_delete_username_history_on_account_deletion.sql` 将 Auth FK 改为 `ON DELETE CASCADE`，身份 pgTAP 改为检查历史用户名随 Auth 删除清除。迁移/测试未执行；账号删除 gates 仍 OFF。

**本地进度（2026-09-28）：** 已完成并独立审查 [PHASE2_DATA_MODEL.md](docs/architecture/PHASE2_DATA_MODEL.md)，覆盖角色、数据分类与核心生命周期；本地 Supabase CLI 2.118.0 与安全默认配置已建立。身份、角色、内容、投稿和 Reaction 迁移已经编写并通过两轮独立静态审查；身份 22 项、内容 53 项、Auth 21 项和 Staff MFA 9 项 pgTAP 断言已编写，但因当前机器没有 Docker 而未执行。Staff gate 已实现 TOTP enrollment/challenge、原生一次性恢复码 UI 和恢复后的 TOTP 替换流程；迁移已移除不能提升 Auth AAL 的旧自建恢复码存储。Supabase Auth 原生恢复码目前是实验 API，本地配置启用十个 16 字符码、五次失败锁定 15 分钟；需在 Staging 验证所用托管 Auth 版本支持此能力。后台数据授权要求 AAL2 和 `mfa/totp` 签名因子证明；恢复码 AAL2 只能进入换认证器流程。新增 Owner 角色变更 RPC：要求 Owner、10 分钟内 TOTP 再验证、有效目标账号和原因；不允许修改自己的角色或撤销最后 Owner，并记录审计。首次 Owner 只能通过 [一次性手动初始化脚本](supabase/operations/bootstrap_first_owner.sql) 创建，没有公开 bootstrap RPC。新增 Owner 专用人员管理界面与账号查找 RPC：仅匹配有效账号用户名，输入至少 3 个字符、最多返回 25 项，只输出用户名/用户 ID/后台角色，不返回邮箱或投稿资料；角色变更要求逐次 TOTP challenge、填写原因，并委托现有 RPC 校验 Owner、近期 TOTP、不可自我变更及最后 Owner 保护。迁移与界面仅存在本地，尚未执行或验证。账号删除新增 7 天 `deletion_pending` 状态、用户确认与取消 RPC、站内倒计时/取消入口及申请/取消审计；`ACCOUNT_DELETION_ENABLED` 默认为 false。Supabase Auth 不允许删除仍拥有 Storage 对象的用户，而上传附件可能是应保留的证据，因此到期后的对象所有权处理、不可逆清理 Worker 和其部署尚未实现。启用开关前必须落实证据保留方案及受保护的定时清理，并验证删除时的会话失效边界。新增独立私有隔离桶迁移：每个文件最多 10 MiB、每投稿最多 5 个对象、限定图片/音频/PDF/Office 文档 MIME 与扩展名，并检查声明 MIME 与扩展名匹配；仅投稿人可向自己的活动投稿路径写入。唯一 SELECT 例外只供 Storage 在上传响应中返回刚写入对象的元数据，不能列举、查询、下载或预览对象，也无公开访问和覆盖策略。新登记 RPC 将对象记为 `pending` 且 `public_thumbnail`（准备公开），但仍处于私有隔离桶；Owner 可见性切换另有默认关闭的迁移和 UI。客户端仍可伪造 MIME；文件魔数检查、恶意软件扫描、签名读取、访问审计、投稿界面和清理流程尚未实现，因此用户附件功能仍关闭。公开预览摘要限 200 字符，首次发布时间与恢复上架时间分开；Reaction 计数考虑并发下架与 Auth 删除。投稿转正式帖尚未实现。未连接任何托管 Supabase 项目；本地代码和静态审查不代表数据库策略已执行验证或 Phase 2 完成。

**Auth 实施进度（2026-09-28）：** 邮箱/密码登录注册、唯一用户名初始化/修复入口、密码重置 PKCE 回调、Next.js 16 Supabase Proxy、应用自有邮箱确认 UI/SMTP 发送模块和一次性 token/RPC 迁移已写入。新增 `20260928042227_mmwr_app_email_verification_and_profile_provisioning.sql` 与 21 项 pgTAP 断言，两轮静态安全复核发现的注册密码首尾空格不一致及邮箱变更/验证并发锁顺序问题均已修复。保持 Supabase 原生邮箱确认关闭；MMWR 应用使用随机 256-bit token、只存 SHA-256 哈希、30 分钟有效、每小时最多发 3 次且用户须在打开邮件后主动确认；Auth 邮箱改变会清除旧验证标记和未用 token。投稿 RPC 已改为检查 MMWR 验证时间。Owner/Admin 的 TOTP enrollment/challenge gate、原生一次性恢复码生成/验证 UI 和恢复后的 TOTP 替换流程已经写入；恢复码使用 Supabase Auth 实验 API，local Auth 已设十码、16 字符、五次失败/15 分钟锁定，托管 Staging 兼容性未验证。尚未运行构建、浏览器或数据库测试；需先有 Docker 兼容运行环境才能本地重置数据库并执行 pgTAP。首次 Owner、Storage/签名文件、投稿转正式帖、账号删除等仍在后续任务。

**账号删除补充进度（2026-09-28）：** 新增 7 天 `deletion_pending` 状态、显式确认的申请动作、截止时间/取消界面与申请/取消安全事件；数据库 `private.runtime_flags.account_deletion` 和应用 `ACCOUNT_DELETION_ENABLED` 都默认关闭。Supabase Auth 删除仍拥有 Storage 文件的用户会失败，而附件可能需作为证据保留；到期清理 Worker、文件所有权处理和会话失效验证尚未完成，因此不得启用此功能。

**验收：** RLS 策略矩阵全部通过；越权访问负向验证无泄漏；私有附件 URL 与对象路径不能匿名访问；角色开关不只靠 UI 隐藏。

## Phase 3 — 投稿、内容审核、申诉与管理后台

**首轮本地续进记录（2026-10-05，后由下方复验更新）：** 当次本地 Supabase 按 99 个迁移文件重建并对齐至 `20261005130200_reviewed_publication_final_authorization.sql`；完整 `supabase test db --local` 通过 **25 个文件 / 595 条断言**。为之前未覆盖的 Turnstile Siteverify helper 新增 `npm run test:turnstile`，15/15 用例验证默认关闭/缺配置、输入长度、站点 URL、Action/hostname、请求无缓存与幂等键、网络/HTTP/JSON 故障；只 stub `fetch`，没有联系 Cloudflare。TypeScript 与该模块 ESLint 通过。高风险功能保持关闭；此证据不代表 Cloudflare Auth CAPTCHA、真实 Turnstile、UI 或 Staging 验收。

**反馈分享 URL 验证（2026-10-05）：** 将 Report API 的 Telegram 草稿站点 URL 规范化/拒绝规则抽为纯模块并新增 `npm run test:report-share`，27/27 覆盖 HTTPS origin 规整、HTTP/凭据/IP/单标签名/本地与保留后缀拒绝；包含 RFC 2606 示例域 `.example.com/.net/.org` 及其子域。报告 Route 使用相同模块；没有发送 Telegram 或访问外部服务。全仓 lint、TypeScript 和 38 路由 production build 通过。反馈闭环依然需要 Staging MFA/RLS/RPC/审计、每环境 Turnstile 和已确认的官方 Telegram 联系入口，不能据本地单测标为上线完成。

**反馈 API 请求封套本地测试（2026-10-05）：** 将报告 API 的同源 Origin、JSON media type、JSON 解析与 32 KiB 声明/流式字节上限收敛到纯解析器 `lib/reports/request-envelope.mjs`，并由 API Route 复用。新增 `npm run test:report-envelope`，14/14 覆盖同源与跨源、Content-Type、空/坏 JSON、恰好 32 KiB、超限 Content-Length 和缺少 Content-Length 的流式超限。全仓 ESLint、TypeScript、Turnstile 15/15、分享 URL 27/27 和 38 路由 production build 通过。没有新增报告记录、调用 Cloudflare 或连接托管环境；Staging 的 MFA/RLS/RPC/审计、真实 CAPTCHA 与报告写入仍未验收。

**Phase 3 离线验证复跑（2026-10-05）：** 使用仓库内 Supabase CLI 重新执行本地 pgTAP：25 个文件 / 595 条断言通过；之后新增并本地应用 `20261005130300_remove_unused_plpgsql_lock_targets.sql`，当前本地 migration ledger 与 100 个磁盘迁移一致。该前向迁移把 7 个只用 `FOUND` 的行锁查询改为 `PERFORM`，保留筛选、锁模式、函数权限和控制流。新增 `npm test` 汇总 8 组 Node 套件，并由 `npm run test:local` 串行运行 Node、完整本地 pgTAP 与数据库 lint；当前工作树复验通过（111 项 Node 测试通过，真实 ClamAV opt-in 2 项按默认模式跳过，pgTAP 25/595，lint 无 schema 错误）。覆盖备份、账号删除 Worker、公开分页、地图、扫描器、Turnstile、举报分享 URL 和请求封套。`supabase db lint --local` 退出码 0 且没有 schema 错误或 unused-variable 警告，`git diff --check` 通过；本地七项 `private.runtime_flags` 均为 false，Supabase Advisors 最近一次检查未发现问题。Phase 3 剩余 4 项仍分别依赖投稿政策/入口与 Staging、真实服务配置、官方 Telegram 联系入口，以及处罚/IP 封锁的 Staging 验收；没有业务数据写入或托管环境访问。

**本地全阶段回归补验（2026-10-05）：** 再次运行 `npm run test:local`，Node 111 项通过、2 项 opt-in ClamAV 测试按默认模式跳过；pgTAP 25 个文件 / 595 条断言通过，数据库 lint 无 schema 错误。`npm run lint`、`npx tsc --noEmit` 与 `git diff --check` 通过。使用隔离输出目录重新构建 Next.js production build，38 条路由成功生成；构建工具自动改写的 `tsconfig.json` 已恢复为构建前内容。只读查询确认本地 7 个高风险运行时开关全部为 false。此次复验不改变 Phase 勾选比例，也不代表 Staging/Production 或真实第三方服务验收。

**本地验证续记（2026-10-04）：** 本地 Supabase 迁移链通过 `supabase test db --local`，21 个 pgTAP 文件 / 455 条断言全部通过；迁移链在本地数据库与磁盘对齐至 `20261005120000_mmwr_dashboard_reset_current_admin_defaults.sql`。其中包含 Phase 3 投稿关闭边界、报告、处罚/解封权限、后台布局角色隔离与 Owner 重置、后台 Session 精确 15 分钟闲置 / 8 小时绝对到期、Owner/Admin/普通用户审计行隔离、所有 73 张应用表的 RLS/直接权限清点、公开内容修订与投影、通知、Clarification、账号删除、证据扫描、Owner IP、角色/MFA 与风险提示测试。`scanner/worker.test.mjs` 的 5 项隔离 Node 集成测试通过本机合成 Storage/API/ClamAV 协议服务器验证 worker 分支；另有两项 opt-in 实机测试通过 SHA-256 固定的 ClamAV 1.4.6：完整 Worker 将合成 PNG 判为 clean，同一 daemon 通过 `INSTREAM` 检出标准 EICAR 测试签名。为避免错误证据，未把“PNG 魔数 + EICAR 文本”的伪造文件当作感染样本；ClamAV 将其判为 clean。另用 digest 固定的 ClamAV 和 Node 22 镜像启动 Compose：Worker 在项目网络收到 ClamAV `PONG`、ClamAV 无宿主机发布端口，Worker 为只读根文件系统且移除全部 capabilities；Compose 仅验证启动/就绪，没有领取或扫描任务，也未连接 Supabase。实机与 Compose 临时资源均已停止、移除。以上仅验证本地引擎、样本及配置的容器网络边界，不证明 Supabase Storage/API 或 Staging 集成。测试发现并修复非私有桶 URL 被归类为通用错误的问题。`npm run lint`（0 errors / 2 existing warnings）、TypeScript、38 路由独立生产构建和 HTTP 安全默认值检查见 [`docs/operations/PHASE3_EXIT_AUDIT.md`](docs/operations/PHASE3_EXIT_AUDIT.md) 与 [`HANDOFF.md`](HANDOFF.md)。以上仅为本地证据；未连接托管 Supabase、Staging 或 Production，也未运行账号删除 Worker、邮件、Turnstile 或真实代理封锁。Phase 3 UI 验收与后续获授权 Staging 验收仍未完成，高风险功能保持关闭。

**附件扫描本地进度（2026-09-30）：** 用户已选自建 ClamAV；附件使用 Supabase Storage 私有隔离桶，Cloudflare R2 仅用于独立加密备份。新增迁移 `20260930082648_mmwr_evidence_scan_jobs.sql`：证据登记事务会将 pending 证据放入 private outbox；两个仅 `service_role` 可执行的窄 RPC 以十分钟租约领取单件任务（Worker 操作预算：下载最多 120 秒、ClamAV 两步各最多 120 秒、claim/result 各最多 30 秒；原五分钟租约不足，2026-10-03 调整）、校验租约回写有限结果，并追加不可改写的审计记录。新增内部 Next.js broker API，仅在 `EVIDENCE_SCANNER_ENABLED=true` 且专用至少 32 字节 token 配置后工作；broker 只为该私有桶内的已领取对象签发 120 秒下载 URL，Supabase Secret Key 不提供给 worker。新增 Node 22 worker 与 `docker-compose.scanner.yml`，worker 不落盘，限制读取 10 MiB，按登记 MIME 检查文件魔数，经 ClamAV `INSTREAM` 扫描；ClamAV TCP 不向宿主机发布。Compose 现在要求运维显式提供按 SHA-256 digest 固定的 ClamAV 镜像与 Node 22 基础镜像，避免 `stable` 或大版本标签静默漂移；`CLAMD_HOST`/`CLAMD_PORT` 由 Compose 仅在 worker 容器内设置为私有服务地址 `clamav:3310`，不作为公网或部署入口。worker 只在非 production 本地开发进程允许 loopback HTTP；打包容器运行于 production，worker broker/Storage origin 必须 HTTPS。暂存重试最多五次，超时/耗尽与感染结果均 fail closed 到隔离，审计只留固定原因码、SHA-256 与引擎/签名版本，不记文件内容或对象路径。**上传、普通用户附件读取及投稿仍关闭，扫描开关默认 OFF；本地代码尚未执行迁移、启动 Docker、配置 token 或连接任何外部服务。** PostgreSQL 语法/执行、ClamAV 容器行为及隔离边界须在本地容器和 Staging 再验证后才可考虑启用。

**扫描器内部结果 API 静态加固（2026-10-01）：** 结果回报现在要求 `application/json`、最多 4 KiB、完整且无额外键的七字段对象，并在调用数据库前验证任务/租约为 UUIDv4、摘要与版本字段形状、outcome/reason 配对及 clean/infected 摘要必填规则。Claim/Result 所有响应（含关闭、未授权和错误路径）统一 `no-store, private`、`nosniff`、`noindex`。Staging 清单已补充相应正/负向检查。仅完成源码与 worker/schema 的对照复核；未运行测试、启动 worker/容器或连接数据库，扫描功能继续默认关闭。

**扫描器启动就绪保护（2026-10-03）：** 静态复核发现 Worker 可能在 ClamAV 尚未就绪时领取任务；扫描错误会消耗有限的五次尝试额度。现要求 Worker 在请求 claim 前先用 clamd 协议 `PING` 并收到 `PONG`，否则等待后重试且不领取队列任务。Staging 清单增加 ClamAV 启动/不可用时 attempt/lease 不变、恢复后可正常领取的检查。仅修改本地 Worker 和验收文档，未启动容器或执行验证；扫描仍 OFF。

**扫描器 socket 关闭挂起修正（2026-10-03）：** 复核 ClamAV 异常响应时发现 socket 在回复前正常关闭会清除 120 秒超时，却不拒绝待处理的回复 Promise；写入返回背压期间遇到正常关闭也可能一直等待。Worker 现于关闭事件拒绝未完成的回复及发送等待，使 PING/VERSION/INSTREAM 按错误路径结束，而非卡住占用租约。Staging 清单增加连接关闭与背压场景。仅修改 Worker 与验收文档；未运行扫描器或验证，功能继续 OFF。

**扫描任务租约时钟竞态修正（2026-10-03）：** 静态复核发现 `claim` 和 `finish` 使用事务起始时刻 `now()`；claim 在先处理耗尽任务并等待证据行后才派租约，finish 也可能在锁等待期间接受实际已过期的租约。未应用迁移现改用 `clock_timestamp()`：claim 在先前处理/行锁等待后采样完整十分钟租约；finish 按 scan job → evidence 顺序取得两行锁，再检查 lease 是否仍有效；错误重试时间也从同一锁后墙钟采样。Staging 清单增加 claim 延迟、finish 等锁越过 expiry、状态/审计不变及固定锁顺序检查。未运行 SQL/测试或应用迁移；扫描继续 OFF。若迁移未来已应用，只能通过前向迁移修正。

**扫描器优雅停止期限（2026-10-03）：** Compose 默认强制停止等待期短于 Worker 最长单件扫描预算；若部署/重启刚好发生在扫描中，Docker 可能在 Worker 完成当前任务前 SIGKILL，使有效租约空等至过期。`evidence-scanner` 现在配置 8 分钟 `stop_grace_period`，长于最多 7 分钟的 claim + 下载/ClamAV/result 操作预算并留 60 秒余量，仍短于数据库 10 分钟租约。Worker 收到 SIGTERM 后若仍在 `PING`，会在之后退出而不再领取任务；已领取的任务则继续完成或走有界失败路径。Staging 验收覆盖两种情况。此为 Compose/Worker/文档本地改动，未启动容器或运行验证，功能保持 OFF。

**Phase 3 迁移回滚准备（2026-09-30 / 2026-10-03）：** [`docs/operations/PHASE3_MIGRATION_ROLLBACK.md`](docs/operations/PHASE3_MIGRATION_ROLLBACK.md) 逐项记录 35 个 `20260930*.sql` Phase 3 迁移与 11 个 `20261001` 后续更正文件（共 46 个，其中包含跨阶段 Analytics/Hot 支持项及一个空文件，不代表全属 Phase 3）；新增覆盖备份 Run Ledger 邮件类别生产者；同时记录重复说明跨字段匹配、举报写入权限收紧、Owner IP 指纹响应最小化、staff session 限制与证据会话绑定迁移的替换对象、审计/队列/内容数据风险、调度任务处理和安全恢复方向。重点标记用户已选的告警政策：不得回滚恢复密码失败告警来源；账号处罚、帖子修订、队列和安全审计均不应通过简单 DROP 丢弃。此文档是本地预案，不是可执行 down migration；迁移未应用，未实际回滚。数据库应用、快照和恢复仍须由正确的 Staging 操作及验收完成。

**Phase 3 附件面板静态复核（2026-09-30）：** Owner 附件可见性面板的加载状态从 effect 内同步更新改为异步请求完成后提交，避免 React Hooks 静态规则错误，并在投稿切换或组件卸载时丢弃过时响应。Phase 3 后台、附件、报告和安全面板定向检查以及全仓 ESLint、`npx tsc --noEmit`、`npm run build` 均通过；Next.js 编译、TypeScript 和 34 个静态页面生成成功。未运行测试或数据库操作。附件功能与投稿保持关闭。

**后台会话时限本地增量（2026-10-01）：** 用户已确认 Owner/Admin 后台会话 15 分钟无操作 / 8 小时绝对上限，普通用户会话不受影响。新增 `20261001051200_staff_session_limits.sql`，用 Supabase Auth `session_id` 绑定的私有活动租约约束 `private.has_staff_role`；AAL2 + TOTP 后台页面/Server Action 和可见页面上的近期用户操作会更新租约，JWT 自动刷新与后台轮询不会延长。活动 API 同源且无请求体；过期只注销当前 Auth session，并显示本地化提示。后续源码复核补齐手势本身触发续期，并令定时器和 PostgREST 请求共用 15 秒节流：仅在近期续期成功时跳过重复请求，续期失败时后台数据请求失败关闭；独立静态审查未发现余项。迁移未应用，SQL/ACL、双时限、并发和浏览器行为尚未验证；依用户安排等 UI 检查后再进入测试阶段。详情见 Phase 3 Staging 验收及回滚文件。Phase 3 不因此标为完成。

**后台会话期限源码/验收清单交叉核对（2026-10-04）：** 对照活动 API、Server helper、浏览器 Supabase fetch、`20261001051200_staff_session_limits.sql` 与 Staging 清单：续期限制在本地化/非本地化 `/admin` 的可信前台手势；PostgREST 请求等待同一活动检查；活动故障失败关闭；数据库租约按 Auth session 绑定并以 15 分钟闲置/8 小时绝对界限拒绝过期会话。此次只做源码与清单静态对读，没有发现边界描述冲突；未执行浏览器、SQL、迁移或并发验证，不能据此视为会话期限已验收。

**内部证据会话绑定本地增量（2026-10-01）：** `20261001055854_staff_evidence_session_binding.sql` 将 30 秒一次性预览授权绑定到签发它的 Auth session，并以 FK 随该 session 删除；没有可安全推断的旧授权会失效，追加式访问审计保留。签发在限流锁后复查当前角色、近期 TOTP 和租约；仅 service_role 的消费端先消费再只读复查同一 session 的用户归属、15 分钟闲置 / 8 小时上限及既有证据/账号/高风险 Owner 边界，不续期租约，也不返回 session ID 给浏览器。两个预览开关仍默认 OFF。验收/回滚清单已补入旧授权失效、不同 session 隔离和消费不续期检查；未执行迁移、测试、构建或浏览器验证。

**Phase 3 用户手册政策一致性修正（2026-10-01）：** `USER_MANUAL.md` 不再暗示公开内容可提交更正申请；明确投稿补充、内容更正/撤下及永久封禁申诉当前未开放，也不能通过举报/反馈表单或 Telegram 分享草稿提交此类请求。并说明 Owner/Admin 15 分钟闲置 / 8 小时最长会话的活动判定、后台轮询不续期及过期后只退出当前会话。此为文档措辞调整，不开放表单或数据收集。

**Phase 3 验收资料交叉核对（2026-09-30 / 2026-10-01）：** 历史核对逐一覆盖本地 `20260930*.sql` Phase 3 迁移，并为 `20261001010000_submission_duplicate_cross_field.sql`、`20260930161241_staff_dashboard_recent_operations.sql` 与 `20260930162040_staff_dashboard_storage_summary.sql` 补入 Staging 验收和回滚策略。所有本地 Phase 3 前向迁移文件名均列于相应清单中。文档覆盖检查不代表 PostgreSQL 已执行或 Staging 已验证。环境样板另注明 `NODE_ENV`/`VERCEL_ENV` 由运行平台提供，扫描器 `CLAMD_HOST`/`CLAMD_PORT` 只由 Compose 在私有容器网络内部设置。普通风险提示有开关关闭/开启、未结案状态、跨字段精确匹配及不能阻断发布的专项验收；近期操作记录有角色/TOTP、高风险隔离、数据最小化与布局版本验收；Storage 汇总有桶范围、字段最小化、只读聚合与供应商计费区分验收。

**普通重复信号状态刷新静态复核（2026-10-01）：** 检查最新跨字段匹配函数时发现，在风险扫描已启用的情况下，投稿在仍未结案的状态之间移动也会重复刷新匹配同行。由于匹配规则只关心是否仍处于未结案集合，该更新没有改变风险结果。已在尚未应用的 `20261001010000_submission_duplicate_cross_field.sql` 增加状态集合边界判断：同属未结案或同属结案的切换只刷新当前投稿，不刷新同行；跨边界时仍刷新匹配开放投稿。说明字段变化继续由对应来源触发器处理。Staging 验收要求同时确认信号结果不变且同行 `updated_at` 不被无谓更新。迁移未应用，SQL 与并发行为未验证。

- [x] 本地不可提交投稿 UI 草稿：单页分区、强制选择马来西亚州属/联邦直辖区、社交链接 HTTPS 白名单校验、最终预览和版本化声明；不自动保存。新加坡仅属于独立地图/地区浏览，不进入马来西亚投稿地区选项。此项仅代表草稿代码存在，仍待用户视觉验收。
- [ ] 正式投稿流程仍关闭：完成用户提交入口、Turnstile/服务端限速、服务端证据校验与保存，并经用户政策确认和 Staging 验收后才能开放；图片证据为选填，缺少已扫描通过的图片只产生一般风险提示，不阻断投稿，也不判断证据真伪。
  - 2026-10-03 写入边界静态核对 / 2026-10-04 用例对齐：默认关闭迁移撤销 authenticated 对 `create_submission`、补充资料与证据登记 RPC 的执行权，并移除证据桶投稿人上传策略；后续仅重定义私有函数，没有重新授权。`content_access.test.sql` 已更新为检查三个投稿写 RPC 均无 authenticated 执行权，并以 `42501` 拒绝断言覆盖已验证、未验证、他人及暂停账号；测试计划仍为 53。测试未运行，迁移未应用，数据库运行状态尚未验证。
  - 本地界面草稿已完成：`/submit` 提供单页分区填写、地区选择、固定 HTTPS 社交域名校验、声明版本和最终预览；组件没有 Server Action/API、表单提交、文件选择/上传或浏览器持久化。用户明确选了不可提交草稿；真实人物资料不得输入，正式投稿仍关闭。当前声明和社交域名仍是原型值，须在政策定稿后确认。2026-09-30 本地 ESLint、`npx tsc --noEmit` 和 Next.js 生产构建均通过；构建生成 34 个静态页面，未运行自动化测试或浏览器验收。数据库验证受本机无 Docker/Postgres 阻塞。
  - 2026-10-03 文案政策对齐：图片证据现在标为选填；缺少已扫描通过的图片只显示一般风险提示，不再暗示正式投稿必须附图或会因此被阻断。文件上传继续关闭。
- [ ] 完成 Turnstile 与速率限制：登录、注册、密码重置、邮箱验证重发和反馈/举报已有本地集成；最终投稿入口、每环境配置和 Staging 验证仍未完成。邮件验证先于投稿。异常行为、重复模板、缺证据等做风险标记，机器扫描不拦提交。
  - 2026-10-03 文案政策对齐：账号登录、注册、邮箱验证、公开帖子登录墙、验证邮件、操作手册、交接说明及架构角色表不再暗示验证后即可投稿；均明确投稿入口仍未开放，未来启用时邮箱验证才作为资格条件。Phase 3 UI 验收清单也加入三语账号与邮件状态检查。账号阅读与 Reaction 说明保持不变。
  - 本地安全告警来源（2026-09-30）：依用户决定，唯一异常登录告警来源为 Admin/Owner 恢复码五次/15 分钟失败阈值。原计数表在 Supabase Auth 原生恢复码迁移中已删除，因此 `20260930111623_recovery_code_bruteforce_email_alerts.sql` 改为使用 MFA Verification Auth Hook；只处理 `recovery_code` factor，邮件策略关闭时不保留计数、不入队，其他因子返回 `continue`。该迁移也移除 Critical Security Email 基础迁移中的 `staff_sign_in_anomaly` 邮件触发器，只创建恢复码失败事件的邮件触发器；普通登录异常事件仍可内部留档，但不发登录告警邮件；先前已排队但未发送的此类邮件标记为 `skipped` 并记入投递审计。静态复核按 Supabase Auth Hooks 官方 Postgres Hook 授权要求发现并补充 `20260930180000_recovery_code_hook_public_schema_usage.sql`：授予 `supabase_auth_admin` 对 `public` schema 的 USAGE，使其能解析专用 Hook 函数；该函数的 EXECUTE 仍只授予 `supabase_auth_admin`，不授予该角色直接读写计数/审计/邮件队列表。启用 Hook 前须确认托管 Supabase 方案支持（官方文档列为 Teams/Enterprise），并在 Staging 核对 Auth 版本确实调用恢复码路径；Hook 内错误返回 `continue`，不更改 Auth 的实际验证/锁定结果。此前密码失败 Auth Hook 已移除。不使用 IP/设备变化判定，也不采集指纹。Critical Security Email 默认关闭，迁移未应用、Postgres 未运行，故 Hook/触发器/队列行为未执行验证。
- [x] 本地投稿风险词库与提示：Owner 可维护规则和级别；高风险必须 Owner 审，普通内容可由 Admin 发布。投稿仍关闭；迁移、RPC 权限和风险矩阵待 Staging 验证。
  - 本地增量（2026-09-30）：新增 `20260930075028_owner_submission_risk_lexicon.sql` 与 Owner 专用三语工作台词库。Owner 可创建/修改/停用规则并设普通或高风险；每次变更要求近期 TOTP 和必填原因，前后快照写入不可变私有审计。新增 `20260930083720_mmwr_submission_risk_matching.sql`：私有开关 `submission_risk_scanning` 默认 OFF；Owner 可用近期 TOTP 和理由变更，配置也写入不可变审计。启用后只对之后新建投稿的标题作字面匹配，命中高风险词条标为 `high` 并只让 Owner 看见/收到紧急通知；普通提示标为 `ordinary`。向现有投稿补充资料时也会检查该段新资料，若升级为高风险则通知 Owner。语言字段用于词条管理；因为投稿尚无语言字段，匹配检查所有启用词条。无模型/外部 API，无真假判断、拦截、自动拒绝或旧投稿回扫。投稿创建权限仍撤销、界面仍关闭；迁移未执行，风险提示组件不能视为可用，须待数据库/权限验证及人工校准后再决定是否打开。该记录当时 Owner Dashboard 有 12 个工具；截至当前，Admin 有 9 项、Owner 有 16 项（含 Phase 5 `hot_settings`）。
  - 本地增量（2026-09-30 至 2026-10-01）：新增 `20260930120000_mmwr_submission_ordinary_risk_signals.sql` 与后续匹配/并发前向迁移，包括 `20261001010000_submission_duplicate_cross_field.sql`。用户确认：只比较仍未结案的投稿（收到/审核中/需要补充资料）；完全相同的规范化说明只标为一般风险、不拦截；没有已扫描通过的图片也只标为一般风险、不判断证据真伪。最新迁移把主体说明（`original_source`）与补充说明纳入同一比较池：同字段或跨字段，只要转小写、折叠空白并去除首尾空格后完全相同，就给双方添加 `duplicate_open_description`；标点或其他非空白字符不同则不匹配。数据库不保存额外说明副本或持久文本指纹；advisory lock 仅用于事务内并发协调。没有已扫描通过的 JPEG/PNG/WebP 时标记 `missing_clean_image`；有通过扫描的图片后解除。扫描开关默认 OFF；关闭时不扫描文本并清除活动信号，开启时仅计算未结案投稿。信号不改变状态、不升级为高风险、不拦截投稿；扫描结果不判断图片真实性。审核队列及详情提供三语风险标签和人工判断提示。高风险 Owner 隔离规则不变。投稿入口及风险扫描仍关闭；迁移未执行，SQL、RLS、RPC、并发及 Staging 行为未验证，本 Phase 项仍未完成。未运行数据库测试。
  - 复核补正（2026-09-30）：静态检查发现，投稿重新进入处理中时，主体说明重复项会刷新，但与补充说明重复的其他开放投稿没有在状态改变时重算。新增前向迁移 `20260930150000_refresh_open_addendum_duplicates_on_status_change.sql`，投稿状态进入或离开开放集合后，只刷新该投稿的相同补充说明且仍开放的对方记录；无额外说明持久化。新增 Staging 重开/结案往返验证步骤。SQL 尚未执行或验证。
  - 状态刷新范围修正（2026-09-30）：再次静态复核发现旧状态触发器在结案时会重算所有有活动重复信号的投稿，工作量随无关记录增长。新增前向迁移 `20260930160000_scope_submission_duplicate_status_refresh.sql`，以一次触发器替换限定到主体或补充说明规范化完全相同、仍开放的对方记录，并只在记录进入/离开开放集合时刷新；同时移除前一迁移的独立补充说明触发器，避免重复刷新。新增大批无关合成记录的范围验收步骤；PostgreSQL 行为尚未验证。
  - 组合更新范围补正（2026-09-30）：进一步静态检查发现，如果同一条 UPDATE 同时修改 `original_source` 和 `status`，主体说明输入触发器仍会执行 20260930133000 中遗留的全局开放重复信号刷新，绕过 20260930160000 的范围限制。新增前向迁移 `20260930170000_scope_duplicate_refresh_for_combined_updates.sql`，移除输入变更触发器里的旧状态分支，由专用的状态触发器统一刷新新旧主体说明与补充说明的匹配开放对方。验收清单增加大量无关活动信号下的组合关闭/重开步骤；PostgreSQL 行为尚未验证。
  - 关闭开关扫描成本修正（2026-09-30）：静态复核发现普通风险扫描开关关闭时，主体/补充说明和证据输入触发器仍会检查对应记录并取得事务 advisory lock，虽不会产生可见活动信号。新增前向迁移 `20260930190000_skip_ordinary_risk_matching_when_disabled.sql`，非开关事件在关闭时提前返回；开关关闭仍清理活动信号，重新开启仍全量重算未结案投稿。Staging 验收与回滚预案已补充。迁移尚未应用或通过 PostgreSQL 验证。当前工作树全仓 ESLint、`npx tsc --noEmit`、Next.js 生产构建均通过；构建生成 34 个页面，未运行自动化测试。
  - 开关与状态触发器并发顺序静态修正（2026-10-03）：跨字段重复检查的状态触发器现先调用共享 advisory-lock 刷新函数，再读取开关；运行时开关触发器在来源表 `submissions`、`submission_addenda`、`evidence_metadata` 取得 `SHARE ROW EXCLUSIVE` 后，才获取同一事务 advisory lock 并重算开放集合。这样不论开关切换还是输入先取得写锁，都不会漏掉已提交的变化；OFF 时状态触发器只清理本条陈旧信号并跳过文本/同行比较。仅更新尚未应用的本地迁移 `20261001010000_submission_duplicate_cross_field.sql`，并将锁顺序与两事务竞态加入 Staging 清单；未运行测试或 PostgreSQL 验证。
- [x] 本地审核编辑器支持标题/Tag/版式和中性措辞，保留原文、修订 diff、编辑者、原因、时间；对象名称、地区、风险和证据不可由编辑器改动。迁移、并发、权限与公开缓存待验收。
  - 本地增量（2026-09-30）：新增 `20260930075708_staff_post_revision_editor.sql` 与三语公开内容修订 Widget。审核员只可编辑公开标题、摘要、正文措辞/排版、公开标签；对象名称、地区、证据、风险级别和发布状态无法在该编辑器中更改。每次变更以理由、操作者和时间保存完整前后快照，界面逐字段呈现修订前后差异；高风险帖子仅 Owner 可查询和修改。已发布投影在事务内同步。并发复核发现两个旧表单可能在行锁串行后互相覆盖，现由详情返回 `updated_at` 版本令牌，保存时锁后比较；过期表单以 `40001` 冲突拒绝，三语 UI 提示重新载入。锁后同时复核 staff 角色和 TOTP。Staging 清单新增双会话陈旧编辑、锁等待、风险角色和投影同步检查。该 Widget 纳入 Admin 与 Owner 工作台，规则词库仍只属于 Owner；该记录当时 Owner 可用 Widget 共 12 个，截至当前 Admin 有 9 项、Owner 有 16 项（含 Phase 5 `hot_settings`）。迁移尚未应用；未验证 SQL/RLS/MFA、并发更新和公开读端缓存，不能视为已上线。
- [x] 本地公开生命周期状态隔离与 Emergency Hide、恢复/重新上架、永久移出公开面的状态机已实现；公开投影同步、noindex、重定向和缓存头代码已具备。数据库/CDN 全链路待 Staging 验证；“永久移除”不删除内部原文和证据，一年后清理及法律保全流程尚未实现。
  - 本地增量（2026-09-30）：新增 Owner 内容生命周期面板与 `owner_list_post_lifecycle` 安全列表 RPC；列表仅返回标题、名称、地区、状态和上架时间，公开 schema 使用 Invoker wrapper，实际读取留在未暴露的 private schema。Owner 列表支持 3–120 字符的标题/名称/地区子串搜索，单次最多返回 100 条。Owner 隐藏/恢复/移除动作现在在数据库端要求 Owner + AAL2/TOTP + 最近 10 分钟 TOTP + 必填理由并记审计，前端逐次挑战 TOTP。动作在行锁后复核权限与 TOTP，且用同一个锁后墙钟时间更新帖子、恢复上架时间和 moderation audit，避免等待时间造成时间戳早于实际变更。详情查询只对单个 URL UUID 请求布尔状态：仅“永久移除”返回 true；隐藏和不存在均返回 false，不披露帖子字段。隐藏后显示中性 noindex 页面，永久移除后返回 locale-aware 首页 308；帖子详情响应设置 `private, no-store`。sitemap 当前不含帖子详情，公开投影触发器在状态改变时同步移除/恢复。两项迁移尚未应用；CDN 响应头、redirect、数据库行为和恢复后的 SEO/indexing 全链路仍待 Staging 验证，故本项仍未完成。另核对 HANDOFF 中承诺的“永久移除后一年清理”尚没有数据库清理队列、Storage 删除器或法律保全规则；公开下架不会清除内部原文与证据，需在律师审阅保留政策和例外后实现、默认关闭并单独验收。
- [x] 本地 Feedback/Report Center 前台与受限 API：必须登录、搜索当前公开帖、私密保存记录、打开 Telegram 通用分享草稿；用户手动发送。每账号每小时最多 5 次。
  - 本地隐私收紧（2026-09-30）：工作人员举报列表 RPC 不返回提交者 UUID，前端类型也不保留该字段；Staging 验收要求检查网络响应同样没有 UUID，而非只确认 UI 不显示。详见 [`docs/operations/PHASE3_STAGING_ACCEPTANCE.md`](docs/operations/PHASE3_STAGING_ACCEPTANCE.md)。
  - 限额时钟修正（2026-09-30）：静态复核发现举报 RPC 以事务开始时间计算每小时五次窗口并作为 `submitted_at` 默认值，遇到用户行锁等待时会使用过期窗口。新增前向迁移 `20260930200000_report_rate_limit_wall_clock.sql`，在账号串行锁、权限和举报目标检查后采样一次 `clock_timestamp()`，同一时间用于滚动小时计数与记录时间戳；既有 RPC 参数、用户级锁、条目上限与 `authenticated` 授权不变。Staging 清单增加锁等待及并发额度检查。迁移尚未应用或 PostgreSQL 验证。
  - 审阅审计时间修正（2026-09-30）：工作人员更新举报状态会等待举报行锁并在锁后重验 TOTP，但原审计默认时间是事务开始时间。新增前向迁移 `20260930210000_report_review_audit_wall_clock.sql`，在锁后重验授权后采样 `clock_timestamp()`，用同一值更新状态并写追加式审计。Staging 验收增加锁等待、有效 TOTP 与过期 TOTP 两种结果检查。迁移尚未应用或 PostgreSQL 验证。
- [ ] 完成 Feedback/Report 上线闭环：应用私有表和审阅迁移、在 Staging 验证 MFA/RLS/RPC 与审计、确认 Telegram 官方联系入口，并完成每环境 Turnstile 配置及其他风控验证。
- [ ] 完成处罚和 Owner IP 封锁的数据库/Staging 验证；永久封禁申诉、更正与撤下入口依用户决定保持关闭，等待政策确认。
  - 本地补足 Data API 路径（2026-09-30）：新增 `20260930112609_owner_ip_block_data_api_guard.sql`，注册 PostgREST `db_pre_request`，为直连 Data API 的 anon/authenticated 请求读取显式配置的可信代理头，以 Supabase Vault 中与 Next.js 相同的 HMAC 密钥生成指纹并复用活动封锁表。应用端 `MMWR_IP_BLOCK_TRUSTED_CLIENT_IP_HEADER` 与数据库角色 `app.settings.mmwr_ip_block_trusted_client_ip_header` 必须使用相同白名单头（`x-vercel-forwarded-for`、`cf-connecting-ip` 或 `x-mmwr-client-ip`）；数据库配置缺失或不匹配时 fail closed。可信 `service_role` 服务端请求不代表终端访客，数据库钩子明确豁免该角色，防止没有浏览器 IP 的服务端任务被误挡；Next.js Proxy 仍会在进入应用前通过受限布尔 RPC 检查用户指纹。此角色边界依据 Supabase secret key 的 `service_role` 映射和 PostgREST 在 pre-request 前的 request-role impersonation 文档，并须由 Staging 验证。数据库角色开关默认 `false`；启用前必须同时配置 Next.js 开关、Vault 密钥、两侧完全一致的可信头和数据库角色开关，并在 Staging 验证代理头来源、anon/authenticated 直连请求确实被拦、服务端调用正常、未知角色 fail closed 及 IPv4/IPv6 指纹一致性。数据库撤销 anon/authenticated 对此 RPC 的执行权，避免将它作为封锁状态探测接口。该钩子只覆盖 Data API，不覆盖 Supabase Auth、Storage 或 Realtime；这些服务目前不用于公开证据读取/上传，相关覆盖仍须纳入上线验收。迁移未应用或验证，IP 封锁保持 OFF。Phase 3 手工验收步骤见 [`docs/operations/PHASE3_STAGING_ACCEPTANCE.md`](docs/operations/PHASE3_STAGING_ACCEPTANCE.md)。参考 [Supabase Data API pre-request](https://supabase.com/docs/guides/api/securing-your-api)、[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[PostgREST authentication](https://postgrest.org/en/stable/references/auth.html)。
- [x] 本地后台 Dashboard、角色权限 Widget Registry、个人布局、Owner 重置 Admin 布局及版本化默认布局已实现；UI 验收与数据库权限/并发验证待完成。
- [x] 本地站内通知、普通/重要/紧急分级、状态流、90 天清理与独立 Critical Security Email 生产者已实现；邮件策略、Hook、Cron 和发送配置保持关闭，待 Staging 验证。
  - 本地增量（2026-09-30 至 2026-10-01）：新增私有通知表和三语工作台 Widget。新投稿通知 Admin/Owner；高风险投稿仅通知 Owner 并标为紧急；举报通知为重要、普通反馈为普通。每个工作人员的状态需依序由未读→已读→处理中→已处理，状态改动要求近期 TOTP 并写入追加式审计。通知只保存固定系统文案，不复制用户报告正文或证据。迁移创建每日清理 90 天前通知的 Supabase Cron。Critical Security Email 本地发送器与仅 Owner 收件人解析已完成，新增 Owner MFA+理由控制、固定文案邮件、私有队列/追加式投递审计及默认关闭的独立调度端点；等待策略行锁后复核 Owner/TOTP，过期证明不会改变策略或清空队列。恢复码失败是唯一的异常登录邮件来源；备份 run ledger 按固定代码区分普通失败 `backup_failed` / `backup_failure` 与完整性证据失败 `backup_validation_failed` / `backup_validation_failure`；后者仅用于已存密文摘要/字节、解密认证/预期明文摘要/大小或取回清单内容不符。导出/API/网络/存储暂时错误、密钥配置错误及普通 OS I/O 仍是普通失败。两类邮件均为固定文案且不含异常/manifest/path/key 数据，并受邮件开关控制；严重 Production 事件类别尚无生产者。仍须应用迁移并验证 Auth Hook/邮件/Supabase Cron 与 Staging；本项仍未完成，邮件保持 OFF。
  - 本地增量（2026-09-30）：复核发现 90 天仅由通知列表读取 RPC 限制，状态变更 RPC 仍可操作尚未被每日 Cron 清除的旧通知；新增前向迁移 `20260930123000_staff_notification_expiry_write_guard.sql`，令通知状态写入也检查 90 天期限，并明确拒绝 NULL/未知状态。后续并发复核又发现行锁等待期间 TOTP 可能过期或通知跨越 90 天；现于锁后重取时间并重验 staff/TOTP，避免等待前的证明/期限被沿用。新增 Phase 3 Staging 验收步骤覆盖账号隔离、状态递进、锁等待期过期、Cron 与独立通知/邮件队列；迁移未执行，相关数据库/权限/Cron 行为仍待 Staging 验证。
  - 告警来源补充（2026-09-30）：依用户决定，仅以恢复码失败阈值作为异常登录告警来源；不使用 IP/设备变化判定或采集指纹。`20260930111623_recovery_code_bruteforce_email_alerts.sql` 增加仅记录五次/15 分钟计数的短期表和 Supabase MFA Verification Hook，只有邮件策略打开时才累计；达到阈值仅记一条无 IP/设备字段的安全事件并入固定类别队列。该迁移替换通用登录异常邮件触发器，只保留恢复码失败事件的邮件触发器；`staff_sign_in_anomaly` 仍可内部审计但不会发信，遗留的待发/租约邮件会转为 `skipped` 并写入投递审计。密码失败 Auth Hook 已由后续迁移移除。Hook 只返回 `continue`，Auth 保持自己的单次恢复码消费及锁定行为；邮件队列/SMTP 失败不会改变认证结果。Supabase 官方将托管 MFA Hook 列为 Teams/Enterprise 能力；公开 Hook payload 文档只列 `totp` / `phone`，上游 Auth 恢复码实现则传入 `recovery_code`，所以 Staging 必须先确认订阅能力、精确 Auth 版本确实调用恢复码路径及本地/托管锁定配置一致。邮件策略、Hook 配置和发送环境默认关闭；迁移未应用或执行验证。

**关键安全邮件来源文案校正（2026-10-03）：** Owner 的三语关键安全邮件面板及交接资料区分异常登录与其他事件：恢复码失败是唯一的异常登录邮件来源；`20261001040905_mmwr_backup_run_ledger.sql` 的本地备份账本在首次失败时按固定代码将普通失败映射到 `backup_failure`，将明确完整性证据失败映射到 `backup_validation_failure`；后者不包括导出/API/网络/存储暂时错误、密钥配置错误或普通 OS I/O。备份 Worker 现把取回的 manifest 原始文本交给统一解析器，因此无效 JSON 语法也按清单完整性失败分类；Phase 3/7 Staging 验收显式要求验证该路径。严重 Production 事件类别尚无生产者；所有邮件与备份开关仍 OFF，迁移、SMTP 和投递均未验证。此前状态说明将所有备份事件都写为未接入，现已按源码修正。

**封禁登录提示本地增量（2026-09-30）：** 正确凭据对应 `banned` 账号时，登录动作会注销刚建立的会话并显示三语永久封禁说明；申诉 Telegram 链接已从环境配置与界面移除，登录提示固定显示“申诉渠道尚未开放”。用户选择在政策确认前保持封禁申诉、更正及撤下入口关闭。该段记录首次补上登录反馈时的范围；申诉记录、数据库应用与 Staging 验证仍未完成。

**后台账号状态授权本地增量（2026-09-30）：** 新增迁移 `20260930065849_active_account_staff_access_guard.sql`，收紧共享的 `private.has_staff_role` 与后台身份发现函数，只有 `profiles.account_state = 'active'` 的 Admin/Owner 才会通过数据库后台角色校验。因此已暂停、永久封禁或待删除的人员不能依赖已有 AAL2 会话继续调用依赖此 helper 的 staff RPC / RLS 策略。该迁移尚未应用；目前不能声称已在数据库运行验证。它不提供处罚记录、到期解除或会话撤销机制。

**处罚审计时间修正（2026-09-30）：** `staff_apply_account_sanction` 与 `staff_lift_account_sanction` 会等待锁后复验权限/TOTP/期限，但事件表原默认时间为事务开始时刻。新增 `20260930220000_sanction_audit_wall_clock.sql`，仅把追加式处罚事件的 `occurred_at` 默认改为 `clock_timestamp()`；不更改现有事件、权限或期限规则。Staging 验收增加成功写入事件时间检查。迁移尚未应用或 PostgreSQL 验证。

**追加式审计事件时间修正（2026-09-30）：** 复核发现安全、内容管理、后台角色、举报读取、投稿审核及证据扫描等部分追加式审计表仍用事务开始时间作为 `occurred_at` 默认值；事务等待锁后才写入的事件可能显得早于实际操作。新增 `20260930230000_audit_event_wall_clock.sql`，仅调整上述六张审计表的默认值为 `clock_timestamp()`；不改已有数据或权限。Staging 验收增加合成事务延迟插入与锁等待检查。迁移尚未应用或 PostgreSQL 验证。

**处罚管理本地增量（2026-09-30）：** 新增迁移 `20260930070547_staff_account_sanctions.sql` 与 `/admin` 三语处罚面板。Admin 可对有效普通账号记录警告、暂停投稿或临时暂停账号；Owner 也可永久封禁，且 Admin 不能处罚其他后台人员，任何角色都不能处罚 Owner 或自己。临时期限选项为 1/3/7/30 天或自定义时间；数据库在授权时按到期时间即时失效，无需定时任务。每次写入/解除都要求近期 TOTP 和 1–500 字理由，写入带 Actor/Target/时间的私有追加式记录；数据库阻止 UPDATE/DELETE/TRUNCATE，仅允许 Auth 删除时将用户外键匿名化。并发复核后，处罚创建会在目标行与 advisory lock 等待后重验角色/TOTP/到期时间及目标角色；解除会在相关锁后重验权限、TOTP、事件是否已解除及处罚是否自然到期。暂停账号仍可读公开内容，但投稿、Reaction 与 Staff 授权会被拒绝。永久封禁会将 Profile 设为 `banned`，沿用现有登录提示；根据用户之后的政策决定，申诉渠道保持关闭。投稿、补充资料、附件登记与 Reaction 的写 RPC 均加入处罚检查；投稿和证据上传当前仍由上一迁移撤销执行权限并保持 OFF。本地界面/迁移尚未连接数据库、应用或验证，不能视为 Phase 3 已完成或 Staging 可用。

**申诉/更正/撤下政策决定（2026-09-30）：** 用户已选择在政策确认前保持永久封禁申诉、内容更正及撤下请求入口关闭。不要开放新的入口或收集资料；当前固定显示渠道尚未开放的中性提示，环境配置不能重新开启链接。`/requests` 仅为 noindex 法律草稿页，没有表单、邮箱或聊天收件人。复核三语处罚面板、账号删除说明与反馈/举报文案时，移除了“配置官方客服后可开放申诉”的暗示及将通用 Telegram 分享草稿描述为官方请求渠道的用语。未新增申诉记录、收集表单或处理工作流。

**Owner IP 封锁本地增量（2026-09-30）：** 用户批准只支持单个 IPv4/IPv6 地址；服务端以独立 HMAC 密钥生成指纹，原始 IP 不进入数据库，活动指纹在解除或到期时清除；审计保留事件/操作者/理由/时间但不含 IP 或指纹。新增 Owner 专用工作台、近期 TOTP/RPC、必填理由、必填到期时间、追加式审计、5 分钟过期清理和受限指纹检查 RPC。并发复核后，添加封锁会在 fingerprint advisory lock 及过期清理后重验 Owner/TOTP/到期时间；解除封锁会在行锁后重验 Owner/TOTP 和自然到期状态，避免等待期间的旧授权或把自然到期误记为手动解除。网站拦截只有在 `MMWR_IP_BLOCK_ENABLED=true`、配置受信任的 `x-vercel-forwarded-for` / `cf-connecting-ip` / `x-mmwr-client-ip` 头、独立至少 32 字节 HMAC 密钥、Supabase URL 及服务端 `SUPABASE_SECRET_KEY` 后才运行；启用后 Next.js Proxy 对每个匹配请求执行布尔 RPC，检查失败返回 503，命中返回不说明原因的 403。`20260930112609_owner_ip_block_data_api_guard.sql` 为 anon/authenticated 直连 Supabase Data API 增加 PostgREST 检查，可信 service_role 后端调用豁免；并撤销 anon/authenticated 对指纹查询 RPC 的权限，避免公开状态探测。数据库角色开关默认 false，密钥从 Vault 安全读取。网站开关与数据库开关均需分别配置。该钩子只覆盖 Data API，不覆盖 Supabase Auth、Storage 或 Realtime；仍须验证可信转发头、角色豁免边界、IPv4/IPv6 HMAC 一致性与请求延迟。所有开关默认关闭，不配置线上密钥。迁移尚未应用或在本地 PostgreSQL/Staging 验证；不能用于真实流量处置。参考 [Supabase Data API pre-request 文档](https://supabase.com/docs/guides/api/securing-your-api)。

**Owner IP 封锁响应最小化（2026-10-01）：** 静态审查发现 Owner 列表 RPC 会把完整 64 个十六进制字符的 HMAC 指纹发送到浏览器，尽管界面只展示末 8 位。新增 `20261001033843_owner_ip_block_fingerprint_suffix_only.sql` 重建列表 RPC，只返回 `fingerprint_suffix` 末 8 位；私有活动封锁表仍保留完整 HMAC 供匹配，审计不新增指纹，访问仍要求 Owner + 近期 TOTP。前端类型同步改为后缀字段；Staging 验收现要求检查 RPC/网络响应没有完整摘要。迁移未应用，SQL、权限和响应 payload 未验证，IP 封锁继续保持关闭。

**Owner IP 可信入口验收增补（2026-10-04）：** 对照 Vercel 与 Cloudflare 官方请求头文档后，Phase 3 Staging 清单现要求按真实 ingress 拓扑逐项验证客户端地址头：包括自定义域名、可直达的 Vercel 部署主机、已启用的代理/Worker 路径，以及伪造请求头和绕过代理的负向场景。仅配置 allowlist 变量不构成可信来源证明；未完成 Staging 验证前，Next.js 与数据库 IP 拦截开关继续 OFF。该增补只完善验收要求，没有配置环境或连接服务。

**后台工作台布局本地增量（2026-09-30 至 2026-10-03）：** `/admin` 使用按角色的 Widget Registry；Admin 可用举报审核、投稿审核、公开内容修订、今日概览、站内通知、分析概览、账号处罚、近期操作记录和 Storage 用量，共 9 项；Owner 另可用公开内容管理、首页标签设置、后台人员管理、投稿风险词库、关键安全邮件、IP 封锁和 Phase 5 `hot_settings`，共 16 项。Phase 3 的迁移链在 Hot 设置之前形成 15 项 Owner 默认；`20261001045652_owner_hot_threshold_setting.sql` 后增加第 16 项。个人布局可用鼠标/触控拖拽或上移/下移按钮排序，也可隐藏/重新添加并保存，至少保留一个可见工具。拖拽把手仅供指针操作，键盘排序通过上移/下移按钮完成；拖拽只更新待保存的本地布局顺序，Staging 的持久化与浏览器交互验收尚未运行。Owner 可用近期 TOTP、必填原因将全部 Admin 布局恢复到当前官方版本默认值；此操作逐版本写入私有追加式历史，Owner 自己的布局不被重置。近期操作 RPC 仅返回时间、固定事件/操作码和操作者用户名；需有效后台身份及近期 TOTP。Admin 结果排除 Owner 专属事件及高风险帖子/投稿活动，Owner 可见 Owner 专属类别；响应不含理由、目标 ID、举报/投稿正文、证据路径、IP 指纹或安全事件详情。Storage RPC 只汇总私有证据桶 `mmwr-evidence-quarantine` 的对象数和有合法 `metadata.size` 的总字节，不列文件名/路径/元数据，且不代表供应商账单实际用量。分析概览和今日概览中的页面浏览数字受 `FIRST_PARTY_ANALYTICS_ENABLED` 与 `NEXT_PUBLIC_FIRST_PARTY_ANALYTICS_ENABLED` 双重默认关闭开关控制。今日概览迁移 `20260930080627_staff_dashboard_summary_metrics.sql` 返回待审投稿、Owner 专属高风险待审数、马来西亚时区今日发布数；Admin 查询不会获得高风险数量。迁移尚未应用，RPC、布局版本和权限边界未在 PostgreSQL/Staging 验证；故 Dashboard 项保留未完成，Phase 3 仍未完成。热门帖子仍待 Phase 5 数据实现。

**分析 OFF 边界修正（2026-09-30）：** 今日概览 RPC 只提供投稿与发布计数，不再读取页面浏览聚合。服务器只有在两个 First-party Analytics 开关都开启时才调用分析 RPC，关闭时页面浏览值不会进入 Dashboard 组件数据；开启后今日值按 UTC 日期从现有分析 RPC 汇总。分析迁移尚未应用，数据库和 Staging 权限/行为仍待验证。

**修订历史数据最小化（2026-10-03）：** 修订历史 RPC 向后台返回操作者用户名（账号删除后为空），不再把内部用户 UUID 发给浏览器，与近期操作流的数据边界一致。切换修订对象时先清除旧选择，并在详情与历史均成功读取后才显示编辑器，避免失败时显示不完整或上一对象的数据。数据库迁移与 UI 尚未运行验证。

**验收：** 角色状态矩阵和内容生命周期逐项验证；高风险帖子不能由 Admin 单独发布；隐藏/删除后任何公开 API、搜索、地图、SEO 和缓存不返回其正文/附件。用户先按 [`docs/operations/PHASE3_UI_REVIEW.md`](docs/operations/PHASE3_UI_REVIEW.md) 检查本地 UI 并确认修改；之后执行必要的本地测试/构建，再优先使用 Vercel 托管的隔离 Staging 完成浏览器端到端及数据库 gate 验收，不把本地预览作为唯一验收环境。用户预计近期完成 Vercel 与域名注册；服务实际就绪前不假定配置已完成。该 UI 预览不代表功能、迁移或服务已验收。

**Phase 3 当前出口状态（2026-10-04）：** 本地草稿、审核工作台、生命周期管理、报告/反馈、权限控制与 Clarification UI 均有代码和对应验收文档；投稿提交仍按用户决定关闭，申诉/更正/撤下入口仍等待政策确认。当前工作树的本地回归已复跑：pgTAP 21 个文件 / 455 项断言、备份 12/12、扫描器 5/5、地图 4/4、分页 2/2、Lint、TypeScript 和 38 路由隔离构建均通过。Phase 3 UI 验收仍待产品负责人检查；随后可按反馈修改并复跑受影响检查。Auth/Kong 本地健康检查通过，但 Auth 报告 Turnstile 已启用且运行时有非空 Secret，但来源和有效性未验证，前端 Site Key 缺失；Auth CAPTCHA 端到端及所有托管 Staging/Production 验收仍未完成。Phase 3 各工作流当前证据和后续 gate 见 [`docs/operations/PHASE3_EXIT_AUDIT.md`](docs/operations/PHASE3_EXIT_AUDIT.md)。所有高风险功能维持关闭。

**局部进度（2026-09-29）：** `/submissions` 现通过受限 RPC 显示当前账号的投稿状态、时间与安全审核回复，未登录时登录后返回该页。此项只完成“我的投稿状态页”读取面；投稿表单、补充资料和附件仍未开放。文件魔数检查、恶意软件扫描及受控读取尚未完成，因此不得接受真实投稿；依用户后续决定，缺少已扫描通过图片仅产生普通风险提示，不作为投稿阻断条件。新增 `/admin` 投稿审核队列本地界面及迁移 `20260928150020_mmwr_staff_submission_queue.sql`：限 Owner/Admin + AAL2 + 10 分钟内 TOTP；队列最多 50 条，只显示标题/状态/风险/时间，不暴露投稿者 ID；读取详情和审核历史时记录审计，历史最多显示 50 条。高风险记录对 Admin 完全隐藏、仅 Owner 可读和处理。只允许转到审核中、需要补充资料、拒绝或关闭，强制填写内部审核说明，可选安全回复；该阶段当时尚未提供批准/发布；后续本地审核发布流程见下方 2026-09-30 记录。数据库 RPC 撤销旧的未要求近期 TOTP 的投稿详情/修改函数执行权限；私密审计表无客户端直读权限，变更同时写入审核历史和审计。附件上传/下载仍关闭。新迁移尚未应用；无 Supabase/Docker 环境执行 RLS/MFA/RPC 验证。当前页和迁移未运行构建、测试或浏览器验证。

**投稿审核队列响应竞态修正（2026-10-03）：** 打开投稿时先前分别提交详情与历史响应；快速切换或保存后切换时，较早的历史请求可能覆盖当前详情的审核历史。现以单调请求序号丢弃过期响应，阻止并发打开按钮，并在详情与历史一致取得后才显示编辑器；审核保存后刷新历史也会核对当前投稿 ID 与请求序号，路由卸载时让未完成响应失效。详情/历史读取错误不会带出另一条投稿的内容。仅静态修正并更新 Staging 验收项，未运行测试或数据库验证。

**投稿审核证据预览文案对齐（2026-10-03）：** 队列原先宣称附件永不显示/读取，与默认关闭但保留给 clean、internal-only 证据的受控短时预览实现矛盾。现三语说明预览默认关闭，若单独开启只显示受控合格附件，投稿上传仍关闭。未启用任何开关；UI 与 Staging 行为待验收。

**Phase 3 投稿转正式帖本地增量（2026-09-30）：** 新增 `20260930140000_reviewed_submission_publication.sql` 与三语后台审核发布面板。结构化 intake 私表为对象名称、锁定地区、允许的社交资料链接和用户声明留存字段；投稿表单仍为不可提交草稿，没有对用户开放的创建/上传 RPC。发布资料和标签的 Staff 读取及发布写入均受数据库开关保护；Owner/Admin 读取需要 AAL2/TOTP 并写工作人员审计。发布 RPC 行锁后复核活动 staff 身份、近期 TOTP、投稿状态、地区及活动 Tag。Admin 不能处理/发布高风险投稿，只有 Owner 可以发布高风险；审核员只能选允许公开的原投稿社交 URL，服务器会再次核对白名单。原始投稿保留，审核员填写公开标题、200 字摘要、正文、标签、风险级别及原因；原子写入帖子、公开投影、发布关联、`submission_reviews`、staff audit 与 moderation audit。新投稿发布能力另受 `MMWR_SUBMISSION_PUBLICATION_ENABLED` 和默认关闭的 `submission_publication` 数据库开关双重限制；数据库开关没有 UI 可开启入口，当前均 OFF。详情页只在公开预览存在时读取经过 HTTPS 域名白名单检查的已选社交链接。未编写投稿 intake 创建接口，也未移动或公开证据；现有上传/扫描/证据开关保持关闭，因此没有现存投稿可实际发布。迁移、RLS、TOTP、并发锁、公开投影和详情显示均未执行验证；正式入口仍需在前述证据链可用并经 Staging 验收后才可考虑开启。

**旧帖发布 RPC 本地权限加固（2026-09-30）：** 审查迁移链时发现早期 `public.publish_post` 只依赖后台 AAL2/角色校验，未要求 10 分钟内 TOTP，且锁等待后不复验后台身份。新增 `20260930240000_harden_legacy_post_publish.sql` 保留普通内容发布能力，但要求近期 TOTP、最多 500 字理由、目标帖行锁后重新检查权限/风险/区域/状态；Admin 仍只可发布普通内容，Owner 可发布高风险内容。成功时以同一锁后 `clock_timestamp()` 更新帖子时间并写 `moderation_events`，失败不写状态或审计。该旧帖路径不绕过仍默认关闭的投稿发布双重开关。Staging 清单与回滚预案已加入权限、锁等待和时间检查；迁移未应用，数据库/Postgres 未验证。

审核发布并发保护已补强：审核资料读取会返回投稿 `updated_at` 与最新补充说明 ID；发布在锁定投稿行后重新读取版本标记，若原文/状态版本或补充说明已变化则以可识别的冲突结果拒绝且不写入帖子，界面要求重新载入并复核。父投稿行锁与补充说明追加流程串行化。版本标记仅作为本次审核的乐观并发令牌，不保存文本副本或说明指纹。该 SQL 锁等待与资料变更场景仍须 Staging 验收。

**邮箱重发防滥用本地增量（2026-09-29）：** 登录后重发投稿邮箱验证邮件的服务端动作现在也要求 Turnstile Siteverify，使用独立的 `mmwr_email_verification_resend` action；令牌缺失/无效、Turnstile 配置缺失或验证服务不可用时均停止发送。页面在 `/account` 与邮件确认页的重发入口展示同一个 Turnstile 挑战；现有数据库每小时最多 3 次限制仍保留。未配置 Turnstile 密钥，因此本地流程未端到端验证，也未运行构建或浏览器检查。

**反馈/举报本地进度（2026-09-28，2026-10-01 权限修正）：** 新增三语 `/report` 页面并加入导航抽屉。必须登录且账号状态为 active；举报须通过现有公开搜索建议选择仍公开的帖子，反馈不关联帖子。`/api/reports` 校验同源 Origin、JSON 类型、请求体大小、UUID、原因与文字长度后写入举报/反馈记录；原 `create_my_user_report(text, uuid, text, text)` 曾授予 authenticated，但随后新增 `20261001031242_require_server_report_creation.sql` 撤销该入口和所有旧 RPC 执行权，替换为仅 `service_role` 可执行的五参数写入 RPC。应用仅在有效用户、active 账号与 Turnstile `mmwr_report` 均验证后，以 server-only Supabase Secret Key 客户端调用，并传递从已验证会话取得的用户 ID，不接收请求体身份字段。数据库仍在用户锁后执行每账号滚动每小时 5 条限制，失效举报目标不写入。RLS 私有表不向客户端开放读取。表单已接入 Cloudflare Turnstile：客户端生成单次挑战令牌，服务端通过 Siteverify 校验 action 和环境主机名；缺少站点密钥、秘密密钥或可信 HTTPS 站点地址时拒绝提交。CSP 仅放行挑战脚本与 iframe 所需来源。登录、注册和密码重置也已接入 Turnstile，分别校验 `mmwr_login`、`mmwr_signup`、`mmwr_password_reset` action；登录目前对每次提交都执行挑战验证，但尚未实现按异常信号额外触发的挑战规则。正式投稿仍是不可提交 UI 草稿，因此投稿 Turnstile 及提交端点不实现、不开放。提交成功后返回参考编号，并在配置 HTTPS `NEXT_PUBLIC_SITE_URL` 时打开 Telegram 通用分享草稿；只预填站点链接与参考编号，不包含用户说明/敏感内容，也不自动发送。Owner/Admin 后台队列代码已接入 `/admin`：现有 2FA gate 后可读最多 50 条记录、查看帖子关联和用户说明、变更审核状态；RPC 再次要求 staff 角色与十分钟内 TOTP 证明，队列每次读取记录逐条写 `opened` 审计，状态变更强制原因并记录操作者/前后状态。后台不显示提交者 UUID。相关迁移尚未应用；Supabase 未连接，因此不可宣称举报已实际保存或 MFA/RLS 审核已验证。Turnstile 密钥也未配置，Staging 端到端校验未做。当前没有真实 Telegram 客服目标，联系对象由用户在 Telegram 中自行选择。此入口不自动隐藏帖子。页面 noindex。

**反馈/举报请求边界本地复核（2026-09-30）：** `/api/reports` 原 6 KiB 总请求体限制小于表单可接受的消息与 Turnstile 令牌最大值，在极端但合法的多字节/JSON 转义输入下会提前拒绝。现改为仍有界的 32 KiB，足以容纳两个已限制字段的最坏 JSON 表示；Staging 验收清单已同步。数据库内容限长、同源校验、Turnstile、每账号限额与 Telegram 不自动发送规则不变。已通过定向 ESLint、`npx tsc --noEmit`、`npm run build`（Next.js 编译成功并生成 34 个静态页面）与 `git diff --check`；未运行测试、迁移或 Staging 操作。

**反馈/举报写入边界修正（2026-10-01）：** 静态审查发现原公开 RPC 仍允许 `authenticated` 直接写入，从而绕过 `/api/reports` 的 Turnstile。新增 `20261001031242_require_server_report_creation.sql` 撤销旧四参数 RPC 的全部执行权，并创建仅授予 `service_role` 的替代 RPC。API 只有在同源/字段、有效登录、active 账号及 `mmwr_report` Turnstile 均通过后，才从已验证会话取 `user.id` 并调用服务端 Secret Key 客户端；请求体不接收提交者 ID。数据库显式检查 `service_role`，每账号滚动小时限额仍在锁后用墙钟判断，限额时返回专用错误由 API 映射为 429，其他数据库故障为 503，失效目标不写入。页面三语区分限流提示。验收和回滚文档已同步：Staging 必须确认 authenticated 不能执行新旧写入 RPC、Turnstile 失败不触及写入端点、secret 不进入浏览器包。迁移未应用；SQL/RPC 权限、浏览器包及 Staging 均未验证。

**反馈/举报 Telegram 草稿语言（2026-10-03）：** `/api/reports` 依据当前 UI locale 生成中文、英文或马来文的中性参考文字；草稿仍只包含公开站点主页与参考编号，不包括用户说明、选中帖子、身份或证据，也不会自动发送。Phase 3 Staging 清单要求合成数据下验证三种语言及相同的数据边界；没有运行浏览器、测试或服务验证。

**Telegram 外链 HTTPS 边界修正（2026-10-03）：** 举报反馈 API 现在只会把经过 Turnstile 主机校验的 `NEXT_PUBLIC_SITE_URL` 中 HTTPS 公共 origin 放入 Telegram 分享链接；本地 HTTP、IP 字面量及本地/保留域名不会外发，仍可返回中性参考文字供用户复制。Turnstile 缺少可信站点地址时仍在服务端写入前 fail closed；三语回退文案及 Staging 验收同步更新。未运行测试或外部验证。

**举报帖子搜索取消边界修正（2026-10-03）：** 报告中心的搜索建议请求在查询变更/选择结果/切换表单时会中止；现在 JSON 解析完成后再次核对 AbortSignal，避免已取消的旧请求恢复过期建议。Staging 验收增加延迟旧查询响应检查。未运行浏览器或测试。

**Phase 3 用户手册状态校正（2026-10-04）：** `USER_MANUAL.md` 开头旧摘要称“投稿表单仍未开放”、并沿用生成 34 个静态页面的 2026-09-30 验证记录，容易把 `/submit` 不可提交 UI 草稿与正式投稿混为一谈，也会把旧构建页数误当作当前证据。现明确正式投稿、附件上传/读取及有效阅读/Hot 尚未启用；`/submit` 只是不可提交草稿；摘要将构建/HTTP 记录限定为 2026-10-04 Clarification 局部验证，不暗示 Phase 3 全面 UI、pgTAP 或数据库验收已经完成。只改文档，未运行测试。

**Phase 3 UI 与本地验证进度（2026-10-04）：** 用户表示已检查的整体界面满意，标签页是唯一尚未看到完整数据场景的页面；用户确认因没有示例数据而看不到部分真实运行画面，并授权继续推进。`/tags` 目录、标签球、搜索筛选与 `/tags/<UUID>` 页面代码已经存在；当前本地 `/zh-cn/tags` 调用 `public_tag_directory()` 因 Supabase 未连接而显示服务不可用，不能据此判断带公开标签数据时的实际表现。遵守不伪造公开帖子/标签的规则，不添加演示记录。用户确认继续后，已运行本地 ESLint（0 errors、3 warnings）、`npx tsc --noEmit`、Next.js 16.3.6 production build（38/38 页面）及三语 42 个主要路由 HTTP 冒烟检查（42/42 返回 200）；详情见 HANDOFF。仓库没有 JavaScript `test` 脚本；4 份 pgTAP SQL 套件因 Docker/Podman 缺失而未运行。该结果不包含真实帖子数据、数据库权限、浏览器交互或 Staging/Production 验证；继续按真实服务尚未连接处理。

## Phase 4 — 地图、列表、Tags、搜索与分享

- [x] 接入 geoBoundaries 固定版本 2020 ADM2 的 159 条 District 边界并公开署名；独立 Putrajaya 几何缺失，因此按用户决定将 Putrajaya 合并到 Kuala Lumpur 公开地图/计数，私有原地区行和帖子关联保留。Singapore 不受影响。投稿、搜索及其它地区目录关联仍需按 Phase 4 端到端核对。
- [ ] 完成可拖/缩放/磁吸地区地图：District 线仅在地区浏览页的已选 State 地图显示；首页地图始终仅显示州属轮廓；地图 UI 已获用户认可。District 目录/地区计数迁移已应用本地，`district_catalog.test.sql` 覆盖目录及 Putrajaya 合并边界；新增 `npm run test:maps`，静态验证 15 个 GeoJSON 文件、159 个唯一且坐标有效的边界、KL/布城合并及 Tangkak/Ledang 名称对应。District 帖子 Pin 已接入公开 District 数量，仅在有公开帖时出现且可进入对应 District；选中 District 后，地图旁现显示最多 3 条该 District 最新公开帖紧凑预览，链接到帖子详情，只用公开标题/主名称/摘要。公开投影没有获批图片 URL，因此未伪造图像缩图。2026-10-05 新增已选州属地图缩放（1–12 倍）、中心固定缩放、放大后有边界约束的指针拖动与复位控制；辅助函数测试覆盖缩放范围、平移边界和变换，地图测试 7/7、TypeScript、定向 ESLint 通过。完整本地套件也通过；地区地图真实浏览器目视验收因本机浏览器策略拒绝导航而未完成，本机无真实帖子，Pin/预览仍无法目视验收，地区 UI 用户验收未完成。首页地图计数清单/点击直达调整暂缓，待地区页 UI 验收后再决定。
- **本机浏览器验收补充（2026-10-06）：** 在 664×672 的简中本机预览中，地区列表选择 Kelantan 后 URL、选中州标题和州地图同步；州地图含 District boundary path。放大可启用缩小/复位，复位后恢复默认视图；首页地图有 16 个州/联邦直辖区路径且没有 District boundary path。浏览器控制台没有 error。Supabase 未连接，因此地区列表帖子计数、District 目录和最新帖子区显示明确的不可用状态；真实数据 Pin/帖子预览及更广泛的键盘/读屏验收仍未完成，用户视觉验收和 Staging 也未完成。
- [ ] 统一所有列表页每页 12、桌面/手机两卡一行；卡片自动布局 1/2/3+ 图片、`+N` 角标、3–5 行摘要、地区、Tags、阅读/Reaction/时间。**Search / PublicPostGrid 样式隔离修复（2026-10-06）：** 排查发现 SearchBox 与 SearchExperience 共用 CSS Module，遗留的 `.results article`、`.results h3`、`.results time` 后代选择器越界命中 Search 内嵌的 `PublicPostGrid` 卡片、澄清关联标题和发布时间。移除旧搜索结果卡片样式，保留 SearchBox 表单/建议和相似名称建议布局；新增 `components/search/search-grid-style.test.mjs` 并接入 `npm test`。回归在修改前按预期失败，修复后通过。全套 `npm test`、ESLint、TypeScript、Next 16.3.8 build（36 路由）、三语 `npm run security:smoke`（36 路由与 robots/sitemap）及 `git diff --check` 均通过。未连接数据库；用户视觉验收仍待进行。**公开帖子列表复用复核（2026-10-06）：** Latest、Home、Hot、Search、Areas、Tags 与 Clarifications 的真实公开帖子卡片均由 `PublicPostGrid` 渲染；公共分页查询限制为每页最多 12 条。组件统一提供 1–3 张安全缩略图、超出图片数的 `+N`、摘要、地区、标签、公开时间和 Reaction 数，桌面/窄屏均采用双列。相似姓名建议与无数据演示占位不属于真实帖子结果卡。此次为源码核对，未声称浏览器视觉验收；此复用证据不替代地图、缩略图生命周期和 Staging 验收。**本地实现进度（2026-10-05）：** 私有缩略图派生、受控投递、计数投影及列表拼贴已接入本地代码和迁移；默认 scanner suite 13 项通过、2 项 opt-in ClamAV 跳过，使用本地固定 digest ClamAV 后 scanner suite 15/15 通过；`npm run test:local` 通过 155 Node 项（153 通过、2 项默认跳过）、26 个 pgTAP 文件 / 635 条断言及数据库 lint；Advisor 无问题。新增 pgTAP 用例证明内部可见切换与帖子隐藏会立即阻断缩略图解析。合成全量备份与隔离恢复计划测试现包含私有缩略图桶及 WebP 对象，并验证私有桶配置进入清单；全量 Supabase Storage 隔离恢复仍未演练。ESLint、TypeScript、隔离 production build（38 条路由）通过；生产预览的 gate-OFF HTTP 检查返回空 404、`no-store` 和 `nosniff`。清单仍未完成：无投稿到 Storage 的完整合成端到端链路，也未完成删除与实际备份恢复 lifecycle、限流/孤儿清理、UI 验收或 Staging。缩略图及原始附件仍保持关闭；不得把原始附件签名或直接作为匿名缩略图。约束与剩余验收见 [`PHASE4_THUMBNAIL_DESIGN.md`](docs/architecture/PHASE4_THUMBNAIL_DESIGN.md)。
- [ ] 首页 Latest 8、Hot Ranked 8、Tags 12 个；其余“查看全部”走专属页。首页 Tags 的固定 Smart Mix 已应用本地并由内容权限测试验证只读公开投影、公开计数及访客/登录读取。新增 13 个合成 Tag、91 个帖子组成的 pgTAP 数据集，验证 Smart Mix 热门/近期/低曝光分段及去重、Most Posts 排序、Manual 顺序与热度补位、无公开帖/重复 ID 拒绝及 12 个槽位上限；单文件 80/80、完整 pgTAP 25 文件 / 610 断言通过。本地合成测试不代表 UI 验收；City/Tag 列表和托管验证仍未完成。
- **首页配额保护（2026-10-06）：** Latest 与 Hot 查询由共享配置限制为 8 篇；Tags 查询原先将 RPC 上限写死为 12，现改用 `HOME_TAG_COUNT`。Home 渲染层也会对三组列表分别按共享配置截断，避免意外多返回时超出槽位。新增回归检查并纳入 `npm test`。完整 `npm test`、ESLint、TypeScript、Next.js production build（36 路由）与 `git diff --check` 通过。此为本地代码校验，不替代真实内容 UI 或 Staging 验收。
- [ ] 在 Supabase Staging 应用并验证 Owner Tag 排序 Manual/Most Posts/Smart Mix（设置 UI、授权 RPC 与首页排序逻辑已本地编写）；确认首页默认 Smart Mix；完成 `/tags` 球面标签布局、每次进入随机抽样、自动旋转、完整列表名称排序及实时过滤的端到端验证。标签数不超过 50 时全部展示；超过 50 时随机抽取 30–50 个。球面位置使用等面积 Fibonacci 候选点，再以最大化与已选点最小球面距离的方式分配，降低标签聚集。

**标签目录本地进度（2026-09-28 至 2026-10-05 更新）：** `/tags` 有三语目录页、名称排序、即时筛选及公开帖数量。球体最多显示 50 个公开 Tag：50 个以内全部显示，超过 50 个时每次进入随机抽取 30–50 个；抽样使用 partial Fisher–Yates shuffle。球面点先由等面积 Fibonacci 采样生成候选，再用 maximin（每次选取距离已有点最远的候选点）分散标签，标签有经纬度锚点，随球面投影自动随机慢速旋转，转到背面时隐藏。球体为半透明蓝色，不显示陆地；球外有稀疏星点和缓慢旋转的渐变轨道，移除球面椭圆反光。四个手动方向按钮已移除；保留鼠标/触控拖动，快速松手后以指数摩擦减速，再沿惯性方向恢复自动随机慢转。自动自转不依赖标签数量；启用 `prefers-reduced-motion: reduce` 时自动旋转与惯性动效暂停，并即时响应设置变化。公开数量由 `public_tag_directory()` 只读 RPC 从 `published_previews` 已发布安全投影聚合，函数使用 invoker 权限，只授予 anon/authenticated 执行，不读取私有标签或未发布帖子。目录可进入 `/tags/<UUID>` 专属结果页；结果页按 Tag ID 筛选公开投影并按最近上架时间分页，每页 12 篇。服务当前不可用时显示明确提示。Tag 目录迁移 `20260928101500_mmwr_public_tag_directory.sql` 已应用到本地 Supabase 并经 pgTAP 覆盖；页面仍按 SEO gate 保持 noindex，托管环境未验证。此次更新已通过针对文件 ESLint、TypeScript、本地浏览器自动旋转及拖动预览；真实标签数据分布、键盘/读屏与托管环境验证仍未完成。

**标签球空间分配算法回归（2026-10-05）：** 将抽样与空间布局从 React 页面提取到 `components/tags/sphere-layout.mjs`，保持既有等面积 Fibonacci 候选与 maximin 选点行为，并为随机源增加可注入参数供稳定测试使用。新增 `npm run test:tags` 与 3 项测试，验证 50 个以内全展示、超过 50 个随机选 30–50 个、抽样不重复、经纬度范围有效及单位球上的最小间距。测试先在实现不存在时以断言失败，提取后通过。`npm run test:local` 通过：26 个 pgTAP 文件 / 637 断言、DB lint 无 schema errors，Node 套件通过（两项默认跳过的真实 ClamAV 测试除外）；TypeScript、针对文件 ESLint 和隔离 production build（38 条路由）通过，构建生成的 tsconfig 类型路径已恢复。该项仅补足算法可验证性；真实标签数据分布、键盘/读屏、UI 和 Staging 仍待验收，不代表 Phase 4 完成。

**标签球键盘焦点稳定性（2026-10-06）：** 新增球体自转条件 helper 与回归测试。球面标签获得键盘焦点时暂停自动自转并清除惯性，焦点离开球面链接后恢复随机慢速自转；鼠标悬停不改变自转，拖动和 `prefers-reduced-motion` 仍沿用原行为。新行为测试先对占位 helper 失败，再改为实现后通过；`npm run test:tags` 5/5、相关 ESLint 与 `npx tsc --noEmit` 通过。浏览器页面受当前本机 localhost 浏览策略阻止，尚无目视键盘/屏幕阅读器验收；此修正缩小了焦点丢失风险，不代表完整无障碍验收。

**地区帖数无障碍标签（2026-10-06）：** 州属列表链接和地图 District Pin 的 accessible name 现在会一起读出地区、按当前语言格式化的数量及公开帖子单位；数量不可用时州属链接读出不可用状态。新增中/英/马来文和计数缺失纯逻辑测试，`npm run test:maps` 9/9、相关 ESLint、TypeScript 通过。实际读屏体验仍待浏览器目视验收。

**首页 Owner Tag 排序本地进度（2026-09-29）：** Owner 后台新增首页 Tag 排序面板，提供 Manual / Most Posts / Smart Mix 三种模式；手动可将最多 12 个当前公开 Tag 排序置顶，其余名额由公开帖子量补齐。每次保存需输入变更原因并重新完成 TOTP challenge。新增 `home_tag_settings` 只含公开排序偏好并允许 anon/authenticated 读取；管理员写入通过安全 RPC，只允许 Owner、AAL2 且 TOTP 最近 10 分钟有效，拒绝重复或已不公开的 Tag，并将前后设置、操作者、原因写入私有审计表。首页公开 RPC 按配置排序，默认保持既定 Smart Mix。迁移 `20260929115622_owner_home_tag_sorting.sql` 已应用到本地 Supabase；`content_access.test.sql` 覆盖排序模式、12 项上限、Owner/TOTP 写权限与审计，完整 pgTAP 已通过。Staging/Production 未部署或验证。Owner UI 仅在后台已有 Owner + MFA gate 后渲染。当前仍缺 Owner UI 浏览器/键盘/读屏验收和 Staging 验证；因此 Phase 4 不勾完成。

**Latest 本地进度（2026-09-28）：** 首页读取 8 篇，`/latest` 以服务端分页每页读取 12 篇；查询只取 `published_previews` 已授权公开的安全字段，分页多读 1 行判断是否有下一页。三语卡片展示公开主名称、标题、摘要、地区、标签和公开时间；不展示私有证据字段或虚构阅读/Reaction 计数，标题可打开安全详情页。公开投影尚无图片 URL，因此暂用装饰性 MMWR 色块，批准的媒体拼贴仍未实现。Supabase 未配置/迁移未执行，数据读取未运行验证，页面保持 noindex。Hot Ranked 仍默认关闭；有效阅读、防刷、评分、同意证明和 Owner 门槛已有本地代码，待测试及 Staging 验收后才可展示真实热度，任何时候都不以最新顺序冒充 Hot。

**Hot Ranked 本地进度（2026-09-28，2026-10-01 更新）：** `/hot` 与首页 Hot 区已接入默认关闭的自然热榜查询；候选 Valid Read 要求同意、10 秒前台阅读和 50% 正文滚动，服务端检查签名同意证明、公开状态、速率限制和帖子级日去重。Hot 采用 1h/6h/24h 权重与默认 100 门槛；Owner 可经 TOTP/原因调整门槛。现在只会显示明确关闭/不可用状态或有效数据库返回，不用最新顺序冒充热门。实现未测试、迁移未应用、功能未启用。

**Hot 专属页分页本地增量（2026-10-04）：** 首页仍只请求和展示 8 篇；`/hot` 现在支持每页 12 篇、确定性热度/发布时间/ID 排序、前后页和全局名次。新迁移 `20261004120000_hot_ranked_posts_pagination.sql` 将公开 RPC 改为有界 offset、最多 13 行（12 篇 + 下一页哨兵），保持 anon/authenticated 的只读公开函数授权及所有默认关闭门槛。页面说明翻页期间新阅读可能改变动态名次。回滚步骤和验收点已补入 Phase 5 文档。

**Hot 分页本地回归（2026-10-05）：** 新增 `supabase/tests/hot_pagination.test.sql`，用事务内合成的已发布帖子和阅读数验证分页顺序、页间连续/不重叠、末页与空页、13 行哨兵上限及 limit/offset 边界，10/10 断言通过。完整 `npm run test:local` 通过：Node 套件全过（2 个真实 ClamAV 选择加入项按默认配置跳过）、26 个 pgTAP 文件 / 620 项断言通过、数据库 lint 无 schema 错误。测试结束后只读确认本地分析与 Hot 开关仍 OFF、合成帖子为 0；101 个磁盘迁移与本地 migration ledger 一致。没有启用任何持久功能门或触及托管环境；真实浏览器排名、有效阅读数据和 Staging 验收仍未完成。

- **搜索页面本地进度（2026-09-28）：** `/search` 已按查询词执行服务端只读搜索；迁移 `20260928112500_mmwr_public_search.sql` 的函数仅返回 `published_previews` 已授权公开字段，并只用状态为 `approved` 且仍关联当前公开预览帖的 `private.aliases` 做隐藏匹配；绝不返回别名文本、来源、投稿原文、证据或审核资料。搜索最少 2 字、最长 120 字，每页最多 12 项并分页。排序优先主名称精确、批准别名精确、标题/地区/Tag 精确，再依次按主名称/别名/标题/地区/Tag 部分匹配、公开摘要匹配。相似名称按各自公开记录列出，不自动合并。函数用受限 `SECURITY DEFINER` 跨越 private schema，仅输出当前公开预览字段；页面保持 noindex。新增 `20260928133100_mmwr_public_search_rate_limit.sql`：限流暂定每来源地址每分钟 20 次、每小时 200 次，搜索与自动补全共用额度；server-only 环境密钥用于生成 HMAC 标识，私有表不记录原始 IP 或查询词，并在有效搜索请求时清除最后活动早于 48 小时的记录。搜索及限流 RPC 均仅授予服务端 Supabase Secret Key 角色。搜索调用依赖每环境配置 `SUPABASE_SECRET_KEY` 和至少 32 字节的 `SEARCH_RATE_LIMIT_HMAC_SECRET`；任何一项缺失时服务不可用并按失败关闭处理。Vercel 前有 Cloudflare 代理时，须在 Staging 验证来源地址是否保留客户端区分度，并在 Production 配置可信代理地址传递与边缘限速，否则本地每地址额度会汇总到代理地址。新增 `20260928133200_mmwr_similar_name_recommendations.sql`：至少 4 字符的搜索词可查询最多 5 个独立相似名称；在数据库内部使用当前公开主名称和已审核别名匹配，别名、相似度分数、证据、来源及审查资料均不返回。当前结果名单和模糊推荐分开显示，并警示名称相似不代表同一人/公司。推荐 RPC 和 trigram 索引尚未迁移/实测；Staging 须核对 Supabase 扩展启用与数据量增长下的查询性能。两项搜索迁移尚未应用，站点无真实记录且未配置密钥；没有执行数据库验证、性能验证、构建或浏览器检查。文字 Autocomplete 已实现：输入停顿约 500 毫秒后最多返回 5 条当前公开内容，支持键盘选择；接口只发公开名称、标题、地区，不暴露别名或证据。当前缺少安全公开图片 URL，故无缩略图。

**搜索页面本地交互复核（2026-10-05）：** 在本机 `/zh-cn/search` 页面确认搜索框及建议区域可访问；输入后建议请求进入服务端，并在服务不可用时显示可读的降级提示。按 Enter 后中文查询正确 URL 编码为 `/zh-cn/search?q=…`，页面保留查询并显示独立的服务不可用状态。当前浏览器所连开发预览没有可用的搜索服务配置/公开数据，因此没有验证真实建议、键盘选中或真实数据浏览结果；未伪造公开记录或录入密钥。此检查只覆盖无数据故障路径，不替代 Staging 搜索验收。

**搜索排序本地回归（2026-10-05）：** 在 `content_access.test.sql` 加入仅事务内使用的第二条公开夹具：其精确标题匹配查询词，而原有夹具是精确主名称匹配。新增测试先发现夹具过早发布导致既有单帖断言受影响，调整发布时点后，`npx supabase test db --local supabase/tests/content_access.test.sql` 的 82 项断言全部通过；确认公开搜索把精确主名称排在精确标题之前。现有 SQL 还按主名称/批准别名/标题/地区/Tag 的匹配级别排序并以最新公开时间作后续顺序；相似名称由独立推荐 RPC 返回，不自动混入结果。随后完整 `npm run test:local` 通过：Node 147 项（145 通过、2 项真实 ClamAV 测试按默认设置跳过）、pgTAP 26 文件/622 项、DB lint 无 schema 错误。真实浏览器搜索建议与列表、键盘流程以及 Staging 密钥/限流/代理 IP/查询性能仍待验证。

**公开详情/登录墙本地进度（2026-09-28，2026-09-29 更新）：** 新增 `/posts/<UUID>`，正文上方只展示 `published_previews` 授权字段：主名称、标题、摘要、地区、Tag、最近公开时间。匿名访问仅取公开投影，不显示缩略图（当前数据结构无公开 URL）。登录后通过 `read_published_post_body(uuid)` 取全文；函数只向 authenticated 授权，数据库内校验账号为 active/suspended、帖子当前 published、地区 active 且公开投影仍存在；待删除、隐藏、移除内容不给正文。新增迁移同时撤销旧 `read_post_full_body(uuid)` 接口的执行权限；旧函数只检查登录状态，缺少账号状态检查，不能继续保留为备用入口。React 以文本段落渲染，不注入 HTML。登录/注册/资料修复回跳仅接受标准帖子 UUID 及 `#full-content`，不接收外站或任意站内路径。点击详情登录墙的登录/注册入口时，本地只把滚动位置与保存时间写进该浏览器标签的 sessionStorage；认证回到同一帖子、正文授权成功且仍在 `#full-content` 时最多恢复一次，并立即清除，过期 10 分钟或无效记录会被丢弃，不上传服务端。详情暂时 noindex；搜索与 Latest 卡片已链接详情。新增迁移 `20260928124500_mmwr_published_post_reading.sql` 尚未应用；没有真实内容或可运行 Supabase，因此 RPC、权限撤销、Auth 回跳、续读恢复和布局均未执行验证。附件、Reaction 交互、搜索节流/索引及 SEO 正文策略仍待后续阶段。

**详情分享本地进度（2026-09-29）：** 详情页提供复制链接、浏览器 Web Share API，以及 WhatsApp、Telegram、Facebook 和 X 直接分享链接；入口和状态文案支持三语。分享文本仅取已批准标题、公开主名称、地区及最多 400 字符的公开摘要；目标 URL 是不带查询参数/片段的详情路径。外站链接在新标签打开并使用 `noopener noreferrer`。Instagram、Messenger、TikTok、Threads、Snapchat、WeChat 等依赖手机系统 Share Sheet（若浏览器/设备提供）或复制链接；不声称每个平台均有直发入口。二维码在浏览器中本地生成，可显示并下载 SVG。新增分享卡片生成器：只使用批准标题、公开主名称、地区、最多 400 字符摘要、站点域名与公开详情二维码；可选择 4:5 帖子图或 9:16 Story，下载 PNG，并在浏览器支持时调用系统分享图片。链接优先采用格式合法的 HTTPS `NEXT_PUBLIC_SITE_URL` 作为公开 origin；没有有效公开 HTTPS origin 时（包括 localhost、私有地址或 HTTP 预览）提示配置并停用外部分享、QR 与图片生成，避免下载含不可公开访问地址的素材。没有加入追踪参数，也未记录分享点击/回流。剪贴板不可用时提供可选择的 URL 回退。其他平台直达适配与 Campaign 分享来源/回流分析仍未实现。生成器代码尚未做构建、浏览器或平台端验证。

**Reaction 本地进度（2026-09-28）：** 详情页已加入三语的“有帮助/谢谢/支持”单选 Reaction；再次点当前选项可取消，改点另一项会替换。已登录但邮箱未验证的 active 用户可使用，暂停账号不可操作；访客只读真实分类型计数并可进入登录流程。Latest、地区、Tag 和搜索结果卡片已读取 `public.reaction_counts` 的真实总数，查询失败时不显示数字。数据库迁移 `20260928133300_mmwr_post_reactions.sql` 添加类别、带账号/帖子状态校验的原子切换 RPC 和仅公开计数/当前用户选择状态的读取 RPC。迁移未应用，因此现阶段页面会如实显示详情 Reaction 服务不可用，列表计数在计数表不可读时不显示；没有执行构建、数据库或浏览器验证。Owner 管理自定义品牌图标/上传 SVG/PNG 的界面仍待实现，当前使用临时文字符号。
- [ ] 选择性改造小时代搜索；本地迁移已应用，精确主名称、已批准别名私下匹配、规范名称回传、待审别名/私密正文排除，以及服务端模糊建议最短长度和排除项均由 pgTAP 覆盖；新增回归断言确认精确主名称排在精确标题之前。匹配优先级在本地 SQL 已实现；Autocomplete 目前显示名称/标题/地区，无安全公开图片 URL 时不显示缩略图。真实浏览器建议/选择流程、完整公开结果交互、Staging 密钥与限流/代理 IP/查询性能验证尚待完成。
- [x] 本地实现登录墙前 5 行摘要预览；安全回跳仅允许标准帖子 UUID 与 `#full-content`，阅读位置短暂存于当前标签页 `sessionStorage` 并最多恢复一次，全文仍由服务端授权。Staging 的 Auth 回跳与正文权限验证仍待完成。
- [ ] Reaction 一人一帖一枚，可换/取消；交互/迁移已应用本地并由内容权限测试覆盖换选、取消、账号删除与权限边界，仍待 Staging 验证。Owner 内置 1:1 图标选择已在本地实现；上传 SVG/PNG、扩展库/排列管理及完整 UI/数据库验证仍待完成。
- [x] 详情页提供复制、可用时的系统 Share Sheet，以及 WhatsApp / Telegram / Facebook / X 直接分享链接；仅使用审核公开文本与规范详情 URL，不附追踪参数。
- [x] 提供详情 URL 的本地二维码显示与 SVG 下载；不向外部 QR 服务发送链接。
- [x] 提供仅含已批准公开文字、站点域名与二维码的 4:5 帖子图 / 9:16 Story PNG 生成、下载；浏览器支持时可系统分享图片。
- [ ] 补充 Messenger / Instagram / TikTok / Threads / Snapchat / WeChat 等平台适配与 campaign-safe 分享回流统计；只用公开内容。新增官方 Snapchat Share Sheet 链接适配；Instagram、TikTok、Threads、Messenger、微信使用支持时的设备系统分享菜单与复制链接，不加载第三方 SDK 或要求账户凭证。独立分享目标函数拒绝非 HTTPS、本机/私网、带查询或片段的源 URL，不添加 UTM/回流标记，仅使用详情页已批准公开文字。新的 4 项 Node 测试与完整 `npm run test:local` 通过，组件 ESLint / TypeScript 通过；没有加入分享追踪/归因事件。直接平台协议兼容性和浏览器/手机 UI 仍需验收；回流统计待隐私授权及 Phase 5 事件门槛。

**地图与地区浏览进度（2026-09-29）：** 将 geoBoundaries 固定版本 ADM1 的 16 个马来西亚行政分区生成为独立可聚焦/可键盘选择的路径，并按 zh-CN / English / Bahasa Melayu 显示区域名称；另以独立地图路径加入 Singapore，地区页也加入独立地区入口，不并入或更改马来西亚州属列表。Malaysia 各分区与 Singapore 共用悬停上浮、选中颜色、聚焦、缩放和平移逻辑及最高 24 倍缩放。选区入口进入 noindex `/areas?state=...`；地区页用 `public_posts_for_area()` 按所选地区及已配置子地区从 `published_previews` 返回安全公开字段，按上架时间每页 12 篇。新增 City 目录 RPC 只返回所选州属/独立地区之已启用 City ID 与名称；City 帖子读取使用 City ID 加父级区域校验，避免同名 City 跨州混合。迁移 `20260928133000_mmwr_public_area_posts.sql`、`20260928133448_add_singapore_browsable_region.sql` 与 `20260928143658_mmwr_public_city_browsing.sql` 仅本地编写，尚未应用；数据库没有地区层级种子，City 列表和地区过滤无法运行验证。报告数量、Pin、可信 City/行政区边界及实际地区投稿仍未完成；地区页只显示配置目录，不伪造地图边界或名称。地图界限数据年份为 2019 且仅供示意。`Kedeh` / `Negeri` 的源名称展示为 Kedah / Negeri Sembilan，几何未改。**地区边界来源复核：** geoBoundaries 当前 MYS ADM2 API 标注 2020 年、CC BY 3.0、来源 `geoBoundaries, citypopulation.de`，元数据报 160 单元；下载的简化 GeoJSON 实际只有 159 个 feature，属性仅含名称/ID/国家代码/ADM 级别，没有父州关系。数据属于 Districts，不等同于完整 City 名录。该候选许可允许进一步评估，但数量不一致、父州映射、名称与统一地区目录的吻合度须先解决并记录固定版本/署名，不能直接接入。MyGeoportal 官方行政空间资料包含半岛 District/Jajahan 与 Sabah/Sarawak District 图层；官方 FAQ 说明空间格式须向 PGN 正式申请，因此公开可查询端点不能据此视为可再发布许可。具体证据和来源见 [`docs/geo-boundary-source-review.md`](docs/geo-boundary-source-review.md)。当前不引入新边界文件，不改变地图现有图形。无构建或地图浏览器验证。

**地图拖动兼容性增量（2026-09-29）：** 放大后的地图 SVG 现由 Pointer Events 统一处理鼠标、触控笔与单指触屏拖动，并捕获活动指针，因此指针越过 SVG 边缘时不会中断；完整地图未放大时不拦截触屏纵向页面滚动。地图边界/地区数据仍按上文状态等待核验。无浏览器/触屏实测、构建或自动化验证。

**地区浏览旗帜 UI 与边界来源复核（2026-10-04）：** 地区列表已将圆点替换为州属/联邦直辖区及新加坡旗帜，并加入可展开的素材署名；用户已查看并认可旗帜效果。地图与 District 数据仍不代表获准：新增只读检查发现 MyGeoportal 两个官方 District/Jajahan 图层各有 94 与 70 条记录，记录年份为 2019、2018/2023，来源字段分别为 JUPEM、JTSS/JTU，而样本分享政策值为空；官方数据清单注明开放须遵从数据提供方决定。164 条不能直接视为完整覆盖，也不能与 DOSM 2020 报告的地区数直接比较。详见 [`docs/geo-boundary-source-review.md`](docs/geo-boundary-source-review.md)。没有下载或导入几何；District 边界、目录映射和发布授权仍未完成。此次只读页面预览，未运行网站测试；测试保留至用户完成最终 UI 检查后统一进行。

**列表呈现续进（2026-10-04）：** Hot 排名结果复用公开帖子卡片，补齐与 Latest/地区列表一致的公开时间、Reaction 总数、摘要、地区与标签，并为读屏保留可访问的排名说明；搜索结果手机布局改为每行两卡，并缩短摘要避免卡片过长。卡片媒体仍为品牌占位样式，因为当前公开安全投影没有公开图片 URL；没有把私有证据或未扫描附件接入公开列表。代码尚未做 UI 验收或测试；Phase 4 仍未完成。

**Phase 3 回滚清单覆盖核对（2026-10-04，旧文件名快照）：** 之前的只读快照曾统计 `20260930`、`20261001` 与 `20261003` 前缀 48 个文件。其后将空白占位文件 `20261001044205_owner_reaction_icons.sql` 移到后续 Phase 4 文件名后，当前 Phase 3 范围变为 47 个迁移；以当前值为准，见下方复核记录。旧快照只证明当时文件名覆盖，不验证 SQL 语义、可回滚性或环境应用状态。

**Phase 3 验收/回滚清单工作树快照核对（2026-10-04，IP 请求头更正迁移之前）：** 该次核对按当时文件名计算 `20260930`、`20261001` 与 `20261003` 范围的 47 个迁移，回滚清单 47/47 覆盖；Staging 验收列出其中 44 个，未列出的三个 `20261001044447_exclude_submission_analytics_route.sql`、`20261001044906_valid_read_event_pipeline.sql`、`20261001050300_analytics_page_view_rate_limit_retention.sql` 属 Phase 5 分析管线。早前 48 文件记录包含后来移至 Phase 4 文件名的空白占位迁移 `20261001044205_owner_reaction_icons.sql`。这是历史文件名快照，不是当前清单；2026-10-04 新增 IP 请求头更正迁移后的当前总数与覆盖情况见下方最新记录。该核对不验证 SQL、回滚可执行性或环境状态。

**地区边界候选增量复核（2026-09-29，历史快照）：** 除 geoBoundaries MYS ADM2 外，记录了 PLANMalaysia 托管的 `Data_Sempadan_Daerah` FeatureServer 候选。其字段包含州/地区名称及代码，当时只读统计返回 129 条，属性涵盖 13 州与 3 个联邦直辖区；该数量和 ADM2 候选定义不同，不能据此认定完整或与产品 City 名录一致。该服务无已核实的公开再发布许可，因此它不是当前接入来源；当前实施状态见 2026-10-05 更新及 [`docs/geo-boundary-source-review.md`](docs/geo-boundary-source-review.md)。

**地区数据在线元数据复核（2026-10-04，历史快照）：** 记录当时 geoBoundaries 的 MYS ADM1、SGP ADM0 及 MYS ADM2 元数据。MYS ADM2 API 报 160 个 District、固定文件有 159 个要素且无父州字段；因此它不能代表完整 City 清单。该快照发生在用户明确选择 159 个 District 并本地接入之前；许可字段及当前实现状态见 2026-10-05 更新和 [`docs/geo-boundary-source-review.md`](docs/geo-boundary-source-review.md)。

**地图/地区浏览决定（2026-10-04，迁移应用前的历史快照）：** 用户先提出首页地图展示州属公开帖子数量并直达地区页，随后明确要求撤回首页改动、恢复原地图且暂不处理首页。本轮只更新独立地区浏览页：地区列表显示数据库可得的公开计数，选择州属后提供轮廓、District 信息区与公开帖子浏览。当时 District 目录仍依赖尚未应用的本地迁移；用户随后追加授权使用 geoBoundaries 固定版 159 个 ADM2 边界，并将 Putrajaya 从可浏览根地区列表移除、并入 Kuala Lumpur 地图与公开计数。迁移现已应用于本地；当前实现状态见下方最新记录。

**District 边界与 Putrajaya/Kuala Lumpur 合并（2026-10-04，历史实现快照）：** 地区浏览页选中州属时从固定 geoBoundaries MYS ADM2 简化文件绘制 District 分界；首页只显示州属轮廓。地图旁署名标注 geoBoundaries / citypopulation.de、CC BY 3.0、2020 和固定 159 要素文件。比对 160 项来源目录后，文件缺少 Putrajaya 独立 District 几何；现有 ADM1 州界中的布城轮廓并入吉隆坡组合地图。Tangkak/Ledang 为名称差异，边界目录统一使用 Tangkak。该条目末尾的“迁移未应用”已被 2026-10-05 本地验收取代：迁移已应用，最新完整验证与未完成项见下方 2026-10-05 更新。

**District 空态文案与本地预览复核（2026-10-05）：** 更正地区页 District 面板的空态：新加坡明确说明马来西亚 ADM2 数据不适用、但可继续浏览新加坡公开帖子；其他无子地区结果不再误称数据库未连接；服务连接失败仍使用独立错误状态。`20261005100000_mys_district_map_and_putrajaya_merge.sql` 已应用于本地 Supabase；`npx supabase migration list --local` 显示本地迁移链已对齐，`district_catalog.test.sql` 覆盖目录、公开计数与 Putrajaya/Kuala Lumpur 合并。`npm run test:local` 通过（Node 套件通过、25 个 pgTAP 文件 / 610 项断言、数据库 lint 无 schema 错误）；定向 ESLint、TypeScript 与隔离生产构建也通过，构建生成 38 条路由。隔离生产预览显式连接本地 Supabase：`/zh-cn/areas?state=Singapore` 与 `?state=Kelantan` 均 HTTP 200，新加坡呈现预期说明。预览已关闭；无公开帖子或 Pin 可供数据态目视验收，未写入帖子/夹具，也未连接或查询托管环境。Phase 4 地区 UI 完整验收仍未完成。

**地区边界和许可记录同步（2026-10-05）：** 现行实现已按用户选择纳入 15 个本地地图文件共 159 条 geoBoundaries ADM2 District；目录/合并迁移在本地，当前复核 `npm run test:maps` 通过 4/4。上一轮完整 `npm run test:local`、`npm run lint`、TypeScript 与 `git diff --check` 已通过，之后没有改动应用代码。修订 [`docs/geo-boundary-source-review.md`](docs/geo-boundary-source-review.md)，标注过期历史结论，并补录官方资料：geoBoundaries 通用网站说明 CC BY 4.0，但其 API 的 `boundaryLicense` 表示原始来源许可；当前 MYS ADM2 专属字段为 CC BY 3.0 且链接 City Population 条款。MyGeoportal FAQ 将当前 FGD 申请与共享限制在指定类别/政府服务范围，DA0080 释放仍由数据提供机构决定；MyGDI 指南还载有第三方转交与商业增值产品协议条款。此记录不是法律结论，City Population 条款对该几何的适用范围仍需核实；官方 MyGeoportal/PLANMalaysia 图层未导入。未访问托管项目或修改任何运行开关。

**Owner Reaction 内置图标管理本地进度（2026-10-05）：** `/admin` Owner 工作台新增 Reaction 图标小组件，可为固定的「有帮助 / 谢谢 / 支持」三种反应各选一种内置图形；公开详情只取安全图标 ID，读取失败回退品牌默认图标。保存要求 Owner、近期 TOTP 和必填原因，并在私有审计表记录前后设置。匿名 RPC 验证最初抓到的实际问题来自 Phase 3 PostgREST IP 预请求钩子：调用前解析私有 schema 时 anon 缺少 `USAGE`，导致所有匿名 Data API 请求在到达公开函数前失败。前向迁移 `20261004190409_owner_ip_block_anon_prerequest_schema_usage.sql` 仅补 `private` schema 的 name-resolution 权限；表权限仍关闭，`private` 仍不在 Data API 暴露列表。原公开 Reaction RPC 保持 invoker 权限。真实本地 PostgREST 在钩子启用、IP 拦截保持关闭时，Reaction 图标和公开 Tag 目录请求均 HTTP 200；Owner/Admin/普通成员、公开读、近期 TOTP、白名单、审计与布局权限的 19 条 pgTAP 通过，IP 钩子 14 条通过。未进行 Owner 浏览器 UI 验收，未验证 Staging/Production；图形上传、远程 SVG、反应类型编辑及计数控制仍不包含在本功能内。检查清单见 [`docs/operations/PHASE4_REACTION_ICON_REVIEW.md`](docs/operations/PHASE4_REACTION_ICON_REVIEW.md)。

**下载水印计划核对（2026-10-04）：** Master Plan 已规定登录用户未来可查看公开证据原件并下载 MMWR 水印副本；访客只看缩略图。另规定公开分享图片含 MMWR 标识与域名/二维码。水印副本生成、原始媒体下载边界及附件服务目前都未实现/启用。不要改写或覆盖证据原件；当前只开放仅由已批准公开字段生成的分享卡片 PNG。文本内容没有通用“下载+水印”能力的既定计划。

**验收：** 移动端两栏可读、键盘可用、边界/地点匹配；跨区域/无图/超多图布局稳定；搜同名不错误合并对象；内部证据从无公开路径可达。

**Phase 4 缩略图 HTTP 与本地 Supabase 回归（2026-10-05）：** 将公开投递 handler 提取为可注入依赖的模块，加入 `npm run test:public-thumbnails` 并纳入全套 Node suite。12 项合成断言覆盖 no-store WebP、安全响应头、隐藏/撤销后下次请求拒绝、ID/slot 校验、无效对象和依赖故障不泄露内容。显式 Storage 冒烟实际使用本地 Supabase 私有桶上传/读取合成 WebP，验证匿名直接下载被拒并清理测试桶成功。另一项只读数据库冒烟确认 `public_thumbnails` 本地 flag 为 false，通过 handler 调用真实 `mmwr_public_thumbnail_path` RPC，返回无缓存 404 且没有 Storage 读取。正向 RPC 到对象投递链路仍未运行；没有打开任何功能门。更新后的 `npm run test:local` 通过：26 个 pgTAP 文件 / 637 条断言，数据库 lint 无 schema 错误；默认跳过两个缩略图 opt-in 测试、备份 Storage 恢复测试及 2 个真实 ClamAV 测试。隔离 production build 生成 38 条路由，TypeScript、目标文件 ESLint 与 diff 检查通过。投稿到卡片的清洁扫描器/数据库/Storage 完整隔离链路、孤儿清理、删除/恢复、UI 与 Staging 验收仍未完成，所有上传/扫描/缩略图开关维持关闭。

**搜索列表卡片统一增量（2026-10-06）：** `/search` 的公开结果改用共享 `PublicPostGrid`，沿用其它列表页的安全卡片、可用时的受控缩略图拼贴、Reaction 展示与分页；澄清标识和独立“可能相似的名称”区块仍保留。搜索读取已有安全公开投影和缩略图计数；缩略图仍须其现有运行开关及 Owner/扫描/公开条件满足。TypeScript、定向 ESLint、完整本地 `npm run test:local` 通过（26 个 pgTAP 文件 / 644 项断言，数据库 lint 无 schema errors）；生产模式构建生成 36 条路由。本地公开帖子为零、缩略图开关 OFF，因此只有代码和既有安全边界获得自动验证，卡片/真实图片目视及 Staging 验收未完成。

**公开列表统一续进度（2026-10-06）：** 搜索结果已接入共享 `PublicPostGrid` 后，真实澄清目录也改为复用相同卡片，保持桌面/手机两列、受控缩略图拼贴、Reaction/公开元数据及分页；澄清卡片另外呈现原帖关联信息。关联原帖不再公开时，标题、名称与地区都不从澄清列表投影返回。新增 4 项 pgTAP 隐私断言覆盖此边界。完整本地 `npm run test:local` 通过：Node 套件无失败（真实 ClamAV 两项默认跳过）、26 个 pgTAP 文件 / 648 项断言、数据库 lint 无 schema errors；TypeScript、目标 ESLint、生产构建（36 条路由）及 diff 检查通过。八个本地 runtime flags 均为 false。由于本地没有真实公开帖子，卡片数据态/图片拼贴仍待目视验收；这项统一工作不代表 Phase 4 整体完成。

**Phase 4 公共缩略图失败回退（2026-10-06）：** `PublicPostGrid` 先前在某个派生图请求失败时只隐藏失败的 `<img>`，2/3 张拼贴会留下空格，整张图也不回到设计规定的常规无图态。现以纯布局 helper 管理图格：健康状态最多 3 图并保留 `+N`；任一图失败时整个卡片恢复既有 MMWR 无图占位，避免残缺拼贴且不影响帖子或扫描状态。回归测试先在旧行为上失败后通过；缩略图专项 14 通过/2 个本地 Supabase opt-in 跳过，完整 `npm test`、全仓 ESLint、TypeScript，以及隔离 Next production build（36 路由）通过。未打开缩略图门或访问数据库；真实图像失败时浏览器目视表现仍待有合成数据和 Storage 服务时验收。

**Phase 4 公开缩略图限流（2026-10-06）：** 新增前向迁移 `20261006100000_mmwr_public_thumbnail_rate_limit.sql`：私有 RLS 表只保存代理 IP 的 keyed HMAC，不落原始地址；服务端限额为每分钟 180 次、每小时 3,000 次，48 小时无活动哈希在后续检查时清理。投递 handler 在资格查询/Storage 读取前先消费限额；超限返回带 `Retry-After` 的 429，可信客户端地址缺失、代理配置无效或数据库故障均 fail closed。复用搜索已存在的可信代理头与 HMAC 密钥配置，并采用缩略图专属 HMAC 域分隔。Node 缩略图专项 20 通过、2 个本地 Supabase opt-in 跳过；覆盖代理地址校验/HMAC、先限流再读、超限及依赖不可用。新增 pgTAP 覆盖私有表权限、Server-only RPC、阈值与畸形哈希，但本机 Docker 数据库未运行，本轮没有执行该 SQL 测试或 DB lint。完整 `npm test`、全仓 ESLint、TypeScript、隔离 production build（36 路由）、迁移回滚覆盖（105/105）均通过。迁移回滚注记已加入 Phase 4 指南；thumbnail gate 仍 OFF，未访问托管服务。仍需 Docker 恢复后运行迁移/pgTAP/DB lint，再验证 Staging 代理覆盖可信头及实际流量阈值；上线开关不能因本地 Node 测试而打开。

## Phase 5 — 阅读计数、Hot、First-party Analytics 与 Campaign

- [ ] 第一方 Page View 与 Owner 授权的 Valid Read/Hot 默认口径已记入 [`docs/architecture/PHASE5_ANALYTICS_CONTRACT.md`](docs/architecture/PHASE5_ANALYTICS_CONTRACT.md)。V1 不采集 Unique Visitor、Session、分享归因与广告事件。数据口径仍须隐私审阅；广告计费与托管数据保留不得启用。
- [ ] 建事件服务与限速/异常事件过滤。用户明确要求刷新每次 +1；异常 Bot/脚本应从公开有效阅读和 Hot 中扣除。不得将个人 IP 暴露给后台非授权或导出。
- [ ] Hot Score、100 默认门槛、三时间窗自然评分和 Owner 门槛编辑已写入本地默认关闭实现；本地 pgTAP 已覆盖评分权重、100 门槛、分页、Owner/TOTP 修改、审计与默认关闭。客户端自报停留/滚动无法证明真实阅读，须先重设计证据模型或由 Owner 明确接受并准确命名较弱指标；浏览器 UI、Staging 与指标完整性审查仍未完成。自然算法与 Featured Session 分层，Featured 保持关闭。
- [ ] 自建 First-party Analytics + GA4；本阶段目前只授权路线 Page View 汇总，Valid Read/Hot、唯一访客、Session、地区、来源、设备、Tag/City/Search、分享/回流及广告事件保持关闭。GA4 现须同时显式打开 `NEXT_PUBLIC_GA4_ENABLED`、配置 Measurement ID 并取得 Analytics 同意；默认不加载，因为 GA4 标准报告包含访客/Session 维度。First-party 本地 API 只累计每日路线类别总数，不保存逐次事件、URL 查询、用户 ID、原始 IP 或访客标识，由双环境开关默认关闭并以 HMAC 限流。本地数据库迁移、白名单、默认关闭状态和清理函数已通过 pgTAP 边界测试；浏览器同意撤销、有效 PV 端到端及托管配置仍待后续验证。
- [ ] Admin Analytics 仅运营型数据；Owner 可读商业资料和客户金额。服务端 API/RLS 强制。目前有 7/30/90 日公开路线浏览汇总面板、默认关闭的 Hot 排名及 Owner 门槛面板代码；本地 pgTAP 已验证页面摘要需近期 TOTP、submit 历史类别被隐藏、Hot 默认关闭。Owner 门槛修改、后台 UI 角色/交互和浏览器行为仍需单独验收。自定义日期、环比、同比、地区与来源尚未实现。
- [ ] 本地设计不保存原始 Valid Read 事件；48 小时去重材料、30 天小时 Valid Read 汇总、13 个月路线每日汇总已有清理函数，并由合成过期行测试本地清除边界。上述托管保留周期仍待隐私审阅及 Staging 清理作业验证；不继承证据/IP 的 1 年策略。
- [ ] Campaign CRM 的 Owner 私有报价管理 UI、隔离表、近期 TOTP/理由写入和变更字段审计已在本地实现（客户名称、MYR 报价、Flat Fee/CPM/CPC、拟议广告位置、日期、文字素材说明、状态）；不存联系方式/上传素材，不投放、不追踪、不计费。迁移已应用本地，`owner_campaign_crm.test.sql` 随 452 项 pgTAP 通过。仍须 UI 验收，再进入独立 Staging 门槛；广告商无登录 Portal。界面审阅清单见 [`docs/operations/PHASE5_UI_REVIEW.md`](docs/operations/PHASE5_UI_REVIEW.md)。
- [ ] Campaign 报价导出尚未实现：PDF/CSV/打印控件保持隐藏。Master Plan 曾记录导出已存在，但实际 Owner CRM UI 没有这些控制；导出字段、MMWR/白牌品牌方式与公式注入处理需要 UI 验收后确认再实现。不得导出帖子/用户资料/IP/证据字段。
- [ ] 广告位均默认 OFF，排期/素材发布需 Owner 显式确认；“Sponsored”标志、关闭自动收回空间、Cookie 同意控制追踪。
- [ ] Featured/Boost 默认 OFF，Owner 设置数小时至 48 小时、到期自动停止并审计/披露。

**Page View 同意服务端校验修正（2026-10-05）：** 发现先前 Page View API 仅依赖前端判断同意，且浏览器用 `credentials: omit` 省略签名 Cookie；在双环境采集门启用时，直接 API 请求可绕过 Analytics 同意。现 API 在计算限流 HMAC 或调用数据库前，要求同源请求同时携带有效 HMAC 签名同意凭证及当前 `mmwr_consent.analytics=true`；浏览器 Page View 请求改为仅发送同源凭证。新增真实签名验证测试，覆盖缺失/过期凭证、撤回后的 false 偏好与畸形 Cookie；先失败再修复。`npm run test:local` 通过，pgTAP 26 文件 / 620 断言通过，Node 测试全部通过（2 项真实 ClamAV 测试按默认设置跳过），TypeScript、定向 ESLint、数据库 lint 与隔离 production build（38 条路由）通过。测试后只读确认 runtime flags 与 Valid Read/Hot 开关均 OFF；未写入分析数据或连接托管环境。真实浏览器同意/撤回顺序及 Staging 仍待验收。
**Phase 5 本地化私密路线排除修正（2026-10-05）：** 复核发现页面实际使用 `/zh-cn`、`/en`、`/ms` 路由前缀，而 GA4 的私密路线排除此前只匹配未本地化路径，可能将本地化帐号、管理、认证、投稿、投稿状态及举报页面归为 `other_public`。新增共享路线分类器，先剥离受支持的语言前缀，再排除私密/API 路径，只发送粗粒度公开页面类别；加入 8 个私密路线及公开类别回归断言，旧实现上先红后绿。`npm run test:local` 通过：Node 146 项中 144 通过、2 项真实 ClamAV 按默认模式跳过；pgTAP 26 文件 / 620 断言及数据库 lint 通过。TypeScript、定向 ESLint 与隔离 production build（39 条路由）通过。Page View / Valid Read / Hot / GA4 开关保持关闭，未发送或写入分析事件；托管浏览器流程和 Staging 仍待验收。

**指标默认值与本地实现（2026-09-29，2026-10-04 更新）：** Owner 授权隐私保守默认值，详见契约。Phase 5 当前只允许路线级 Page View 作为一般分析指标：后台默认最近 30 天，可选 7/30/90 天；路线每日汇总保留 13 个月，限速 HMAC 保留 48 小时。First-party 路线 PV 仅在 Analytics 同意及双环境开关开启后聚合；刷新计一次。Valid Read/Hot 保留为默认关闭的独立本地草案（10 秒可见阅读、50% 滚动、48 小时 per-post 去重、三时间窗评分及 100 默认门槛）；本地 pgTAP 已验证关闭时拒绝采集/排行，但尚未验证其完整浏览器事件流。因客户端可伪造停留、滚动及去重 token，不能把此类记录称为已核验阅读；先维持所有 Valid Read/Hot 门关闭，并按契约中的完整性阻断项处理。Owner 门槛设置不会打开采集或公开榜单。Unique Visitor、Session、分享/回流与广告事件 V1 不采集。路线汇总 13 个月、限速/去重材料 48 小时及 Valid Read 小时记录 30 天的清理边界已由本地合成数据验证；托管隐私审阅与 Staging 清理仍未完成，Phase 5 不勾完成。
  - 本地实现增量（2026-10-01）：新增 `20261001044906_valid_read_event_pipeline.sql`，以默认关闭的 settings、小时级帖子计数、UTC 日/帖子作用域 HMAC 去重材料（48 小时）、严格参数形状、当前公开状态复核及独立速率限制接收 Valid Read；定时清理材料（48 小时）、小时汇总（30 天）和路线日汇总（13 个月）。Hot RPC 以 `3×1h + 2×6h + 1×24h` 评分，至少 100 次/24 小时才入榜，且只返回已发布公开预览。新增 HttpOnly HMAC consent attestation，`/hot` 与首页 Hot 只在全套服务端/客户端/数据库开关开启后查询。Owner TOTP + 原因调整门槛的面板及审计 RPC 已加入 Owner Dashboard；不能启用采集/热榜。迁移未执行，本地功能尚未测试或 UI 验收，所有开关仍为 false。

**投稿路线类别后端排除修复（2026-10-01）：** First-party 页面浏览 API、数据库 RPC 写入白名单和后台汇总现统一排除 `submit`。本地增量迁移 `20261001044447_exclude_submission_analytics_route.sql` 隐藏旧 `submit` 汇总而保留历史聚合行；同一行为现已在本地数据库测试中确认。UI 和托管环境仍未验收。Phase 5 默认关闭与测试顺序见 [`docs/operations/PHASE5_ACCEPTANCE.md`](docs/operations/PHASE5_ACCEPTANCE.md)。

**投稿路线分析排除修复（2026-09-29）：** 复核发现 GA4 与 First-party 共用的公开路线判定漏排除 `/submit`，与已确认“投稿页面不发送 Analytics”不一致。现已将 `/submit` 与 `/submissions`、`/report`、`/account`、`/admin`、`/auth` 一并从两个分析通道排除；未新增事件字段或更改同意规则。该组件单文件 ESLint 与全项目 TypeScript 检查通过；尚未做浏览器/网络面板验证。

**Page View 保留清理静态修正（2026-10-01）：** 用户确认为此阶段仅把路线级 Page View 作为一般分析指标，默认报表窗口 30 天（可选 7/30/90 天）、每日路线聚合 13 个月、限速 HMAC 48 小时；Valid Read/Hot、访客/Session、分享归因及广告追踪保持关闭。复核发现既有每日清理任务漏删 Page View 限速摘要，新增 `20261001050300_analytics_page_view_rate_limit_retention.sql` 将其加入现有清理函数；摘要在 48 小时后合格清除，但因任务每日运行，实际删除最多延后一日。回滚计划见 [`docs/operations/PHASE5_MIGRATION_ROLLBACK.md`](docs/operations/PHASE5_MIGRATION_ROLLBACK.md)。迁移未应用，调度任务/数据库行为未测试或连接托管环境。

**验收：** 同一数据范围在 First-party 与 GA4 定义清楚；事件重复/恶意流量不可操纵 Hot/广告报告；导出与角色测试无商业数据泄漏。

**本地风险门（2026-10-04）：** 静态审查确认当前 Valid Read 接口接收浏览器自报的可见秒数、滚动比例和去重 token；签名同意凭证只证明同意状态，不证明阅读行为。验收文档现将其列为独立完整性阻断项；Valid Read / Hot 继续关闭，除非重设计证据模型或由 Owner 明确接受并准确命名较弱指标。此项不能仅靠回放浏览器测试解除。

**Owner Campaign CRM 本地实现（2026-10-04）：** Owner Dashboard 新增私有 Campaign 报价面板；字段限客户名、MYR 报价金额、Flat Fee/CPM/CPC 报价方式、拟议位置、可选日期、文字素材说明和草稿/已报价/已确认/已结束/已取消状态。字段没有广告商联系方式、素材文件或真实广告位；没有 impression/viewability/click 事件、广告发布或自动计费。私有表无客户端直接表权限；读写 RPC 均要求 Owner 和近期 TOTP，修改另要求理由；追加式审计只保存操作者、动作、字段名、原因与时间。面板按客户、位置和日期筛选，最多显示最近 100 条。CSV/PDF/打印导出控件暂不提供，等待 Owner 单独确认导出格式、品牌及保留政策。新增迁移 `20261004180000_mmwr_owner_campaign_crm.sql`，同时把 CRM 加入 Owner 布局并保持 Admin allowlist 不变。币种采用 MYR。静态审查发现 `auth.users` 的 RESTRICT 外键会阻断账号删除，现改为删除账号时仅将 Campaign creator/audit actor 置空并保留商业记录；审计触发器仍只允许该身份清空，其余更新/删除/截断均拒绝。CRM 商业记录保留期限需在接收真实客户资料前确认。迁移未应用，尚未执行本地测试、构建、浏览器、SQL、UI 或 Staging 验收；广告开关与 Page View/Valid Read/Hot 收集状态不变。

**Phase 5 Campaign CRM 范围再次确认（2026-10-04）：** 用户确认按上述 Owner 私有报价记录方案继续：客户名称、报价/预算金额、计费口径（仅 Flat Fee/CPM/CPC 报价）、拟议广告位、日期、文字素材说明和状态；不收联系方式、不上传素材、不提供广告商门户、不投放广告、不追踪曝光/点击，也不自动计费。此确认锁定本地实施边界，不代表真实客户数据保留期已获批，也不跳过 UI 验收；页面与迁移仍未验收/应用。

**Phase 3 账号删除人工审核队列布局补齐（2026-10-04）：** Owner review widget 原本已在前端 registry，但 Dashboard 数据库函数仍只接受 18 个 Owner widget；新增 `20261004170000_mmwr_owner_deletion_review_dashboard_widget.sql` 将上限/default/save allowlist 调整到 19，Admin 保持原值。Phase 5 CRM 迁移再扩到 20。两个迁移按文件顺序接续。均未应用；本地界面、RPC、权限、迁移执行顺序未测试或验证。

**Phase 3 Owner deletion review queue pagination（2026-10-04）：** Owner 账号删除人工审核队列现提供每页 50 条的稳定 keyset 分页，数据库最多返回 51 条供 UI 判断是否有下一页；旧的零参数 RPC 仍兼容并限制为首个有界结果集。新增 `20261004170001_owner_account_deletion_review_pagination.sql` 与部分索引。游标保留 Postgres 原始时间戳字符串，避免 JavaScript `Date` 毫秒精度截断微秒而造成翻页重复/遗漏。Owner/近期 TOTP 不通过及游标格式错误会明确报错；列表不暴露 UUID，也不提供处理动作。Phase 3 UI 清单、Staging 验收、退出审计和回滚指南已同步；当时日期范围迁移清单为 52 个文件，后续以锁后 claim 时间修正增加到 53 个。尚未运行测试、构建、SQL、浏览器或 Staging 验收；账号删除申请/清理开关仍关闭。

**Phase 3 账号删除 claim 锁后时钟修正（2026-10-04）：** 静态复核发现到期 claim 在锁定 Profile 行之前采样 `v_now`，锁等待会消耗 30 分钟 processing lease，并可能把 `updated_at` 记在实际决策之前。新增前向迁移 `20261004170002_mmwr_account_deletion_claim_post_lock_clock.sql`：每个候选取得行锁后重新核验到期/旧 lease，证据核查后再取墙钟写入新 claim 与 `updated_at`，权限仍限 service_role、两道数据库 gate 与原有证据保护逻辑。同步 Staging 增加锁等待后 lease 起算用例。未运行 SQL/自动化测试/构建/浏览器或远端服务操作；两个账号删除开关仍关闭。

**Phase 3 Auth 删除结果分类修正（2026-10-04）：** 静态复核发现将所有 thrown transport failure 都标为确定 `auth_cleanup_failed` 会掩盖“请求可能已到 Auth、但响应丢失”的不确定结果。Worker 现将返回的 Auth error response 记为 `auth_cleanup_failed`，而 thrown transport exception/timeout 记为 `auth_cleanup_uncertain`，两者都不自动重试且不记录 provider 错误或账号 ID。新增前向迁移 `20261005000000_account_deletion_uncertain_auth_failure.sql` 扩展 service-only review RPC 的固定 reason allowlist；更新 Worker 汇总字段为 `authOutcomesSentForReview`，并更新 Staging/rollback/exit audit/交接文档。迁移未应用，未运行 Worker、测试、构建、SQL、浏览器或远端服务；清理开关仍 OFF。

**Phase 3 账号删除 Worker 请求时限（2026-10-04）：** `account-deletion:once` Supabase client 的每个 HTTP 请求现使用 20 秒 AbortSignal 时限，避免 claim/Auth/人工审核 RPC 因网络等待无限占住一次性 Worker。Auth 请求超时可能发生在服务端已接受操作之后，故仍按人工审核处理并注明 provider 状态可能不确定；Staging 验收要求分别检查确定未送达和响应丢失情形。单批最多 20 个账号，按串行流程提供明确请求上限；尚未执行 Worker/测试或验证 AbortSignal 与部署运行时行为。清理开关仍 OFF。

**Phase 3 Auth 删除一次性尝试检查点（2026-10-04）：** 用户已确认 Auth 删除失败不得自动循环重试。新增 `20261004170003_mmwr_account_deletion_attempt_checkpoint.sql` 和 service-role-only `begin_account_deletion_auth_attempt` RPC：在外部 Auth 调用前锁定 Profile、复查双数据库 gate、claim lease 和证据，再持久记录 attempt 时间。Worker 只有 checkpoint 成功才调用 Auth。检查点后中断且 lease 过期时，claim 转入 Owner 队列的 `auth_cleanup_uncertain` 固定原因，不会再次调用 Auth；checkpoint 前中断仍可安全重领。确定失败则用 `auth_cleanup_failed` 入队；不确定的 provider 结果不声称有事务原子性。Owner 队列新增三语原因文案。Staging/rollback/UI 清单和证据政策已同步；Phase 3 日期范围清单曾为 54 项，之后新增 username_history 清理前向迁移后为 55 项。迁移未应用，未运行 Worker、测试、构建、SQL 或浏览器；账号删除 gate 仍关闭。

**Phase 3 用户名历史删除政策（2026-10-04）：** 用户确认 Auth 账号删除时同步删除其全部历史用户名；不保留、不预留旧名称，重用仍受 Profile 当前用户名唯一约束控制。新增 `20261004190000_mmwr_delete_username_history_on_account_deletion.sql` 将 `private.username_history.user_id` 的 Auth 外键改为 `ON DELETE CASCADE`；`identity_roles.test.sql` 现在验证用户删除级联清除历史行。Staging 删除检查也加入有/无历史用户名的合成账号。迁移与 pgTAP 均未执行；账号删除申请/清理门保持关闭。

**Phase 3 Auth 删除历史审计身份匿名化（2026-10-04）：** 对照 Master Plan 中“解除身份关联，保留必要审计”的已确认规则，新增前向迁移 `20261004200000_anonymize_retained_staff_audit_actors.sql`：Hot 门槛审计、Reaction 图标审计、Clarification 关系创建者与提案/决定者引用均改为 Auth 删除时 `ON DELETE SET NULL`，保留原审计、关系、决定、理由与时间；决定提案约束允许决定者匿名后仍保存完整决定记录。Clarification 关系的两个不可变字段触发器只放行创建者从非空变为 NULL 且其他列完全不变的 FK 清理，其他编辑仍须 Owner rebind RPC。Staging 验收、退出审计、回滚指南及 Phase 2 数据模型已同步。迁移未应用/测试；账号删除 gates 保持 OFF，UI 与本地数据库验收待排定。

**Phase 3 Auth 外键最终链静态盘点（2026-10-04）：** 全部迁移源中找到 57 处 `auth.users` 外键声明；其中六处初始 `ON DELETE RESTRICT` 已由后续迁移覆盖：用户名历史依用户决定级联删除，Hot 门槛/Reaction 图标/Clarification 相关五个保留审计或关系的身份引用改为可空化。静态盘点未发现最终迁移链仍有意阻断 Auth 账号删除的外键，但不证明数据库实际已应用或约束匹配源码。Phase 3 Staging 清单现要求查询目标环境全部入站 Auth 外键，并对迁移账本与每种最终删除动作逐项核对；账号删除 gates 继续关闭。

**Phase 3 保留 Owner 设置审计防改写（2026-10-04）：** 复核账号删除身份匿名化后，发现 Hot 门槛与 Reaction 图标两张 Owner 设置审计表没有 UPDATE/DELETE/TRUNCATE 防护。新增 `20261004210000_preserve_owner_audit_append_only.sql`：共享触发器拒绝对两张表执行 UPDATE、DELETE 或 TRUNCATE，只允许 Auth 外键删除所需的 `actor_user_id` 非空转 NULL，并以 JSONB 等值比较确保其他列完全不变。Staging 清单补入负向变更/截断与 Auth 删除匿名化正向用例，回滚清单已更新。迁移未应用，触发器与 FK 触发顺序未执行验证；账号删除、Analytics 与 Hot 门槛仍默认关闭。

**Phase 3 SQL 权限源码清点（2026-10-04）：** 当前全部迁移源码静态匹配 73 个建表名与 `ENABLE ROW LEVEL SECURITY`，没有找到禁用 RLS 的语句；68 个 private 表均有 `REVOKE ALL ON TABLE`，5 个 public 表均有至少一个 policy 声明；另解析 349 条函数定义为 274 个不同的 schema-qualified identity signatures，均找到对应的显式 `REVOKE ALL ON FUNCTION`；244 个 `SECURITY DEFINER` 函数体均显式设置空或 `pg_catalog` `search_path`。这只是源码覆盖清点，不证明迁移状态、策略/函数体正确性、最终 ACL/默认权限、角色继承或运行时授权；数据库 RLS/RPC 验收仍待 Phase 3 UI 检查后执行。详情见 [`docs/operations/PHASE3_EXIT_AUDIT.md`](docs/operations/PHASE3_EXIT_AUDIT.md)。

**Phase 3 Worker 汇总输出语义（2026-10-04）：** CLI 使用 `authOutcomesSentForReview`，涵盖 Worker 已转入人工审核的确定 Auth error response 与不确定 thrown transport outcome；不包括 claim RPC 内部转审的证据账号。`claim records returned` 仅指 claim RPC 交给 Worker 的账号数，避免把 Worker 局部计数误读为队列总转审数。未运行 Worker/测试。

**Owner Hot 阈值与自然评分本地回归（2026-10-06）：** 新增 Owner 阈值 RPC 测试 26 项，覆盖 anon/Admin/普通成员拒绝、Owner 新鲜 AAL2/TOTP、范围/理由校验、审计、no-op、采集门锁定、旧 TOTP 与直接审计表修改拒绝；扩充 `hot_pagination.test.sql` 至 14 项，验证 `3×1h + 2×6h + 1×24h` 评分、100 默认门槛、24 小时计数、相同分数时发布时间/ID 顺序及分页。两份测试和全套本地 `npm run test:local` 通过：27 个 pgTAP 文件 / 678 项断言，Node 测试通过（两项真实 ClamAV 测试默认跳过），数据库 lint 无 schema errors。开关仍为关闭。该测试不证明客户端自报停留/滚动是真实阅读，不解除 Valid Read/Hot 完整性阻断。

## Phase 6 — SEO、性能、合规与安全验证（上线门槛）

- [ ] SSR/预渲染公开内容；metadata、canonical、hreflang、OG、Robots、动态 Sitemap、分页策略、公开 State/City/Tag/Latest/Hot 页面。
- [ ] Article/CreativeWork 结构化数据须只描述对应 HTML 中实际可见的内容；不为爬虫绕过登录授权。当前匿名 SSR 只提供公开摘要，完整正文仅在有效登录后由服务端读取，因此结构化数据只能涵盖公开标题/摘要，不得把未发送给访客的正文伪标为已索引 paywall section。只有未来经产品/法务确认要索引登录限制正文，且非特权地向 Googlebot 和匿名访客都提供同一内容时，才按 Google paywalled-content 要求标注 `.class` section；否则索引范围保持公开摘要。
- **澄清页 Article 数据（2026-10-06）：** 将 route 内联 JSON-LD 提取为纯序列化器，保留公开标题/摘要、三语 `inLanguage`、格式有效的发布日期及搜索索引门打开时的 canonical/citation；citation 必须是同 origin HTTPS，避免意外附上第三方来源。未加入当前无公开批准来源的 author/image，也不包含注册限制正文或内部字段。4 项序列化测试（含注入字符、无效日期/URL、跨域引用和缺字段）通过。Google 当前 Article 文档允许无必填字段，并建议仅添加适用于该页面的准确信息；上线 Rich Results 验证仍待索引/Staging 门槛。
- [ ] 页面 5 行预览/登录墙/内部附件按真实访问控制设计；如索引完整正文不符合搜索平台规则，改为只索引可公开片段，不给 Bot 特权。
- [ ] 缓存、隐藏/删除、恢复、别名/Canonical、sitemap 和 Search Console 移除流程；内部/待审/拒绝/后台/历史版本全 noindex 且不入 sitemap。
- [ ] Core Web Vitals、图片尺寸/格式/懒加载、地图降级和无障碍检查。
- **主 landmark 修正（2026-10-06）：** `SiteChrome` 已提供全站 `<main>`，此前 14 个页面组件再各自嵌套 `<main>`，构成无效的重复主 landmark。把页面内部根容器改为普通容器；在 `security:smoke` 增加渲染 HTML 的唯一 `<main>` 断言，并把公开帖子、澄清和 Tag 详情加入样本。先观察到 `/zh-cn/submit` 的断言因 2 个 main 失败；修复后 15 条路由 × 3 种语言（45 项）均通过，同时保留既有安全头、noindex 和 lang 检查。该抽查不替代键盘/读屏和完整辅助技术验收；本地数据库仍不可用，真实数据态未覆盖。
- **Phase 6 键盘交互本机抽查（2026-10-06）：** 在本机回环预览用 Tab 到达导航与地区列表，并按 Enter 选中 Kelantan；键盘按 Enter 可放大地图并复位；搜索框可输入 `Johor` 并按 Enter 提交到 `?q=Johor`。搜索结果显示本地公开搜索服务不可用（Supabase 未连接），故只确认操作与查询路由，不代表真实结果状态、屏幕阅读器、全站键盘或 Staging 验收。临时预览已收尾，未连接托管环境或修改功能门。
- **Phase 6 Tags 预览辅助技术树检查（2026-10-06）：** 当前本地服务未运行时，原浏览器页显示连接失败；启动本机 Next.js 预览后，`/zh-cn/tags?preview=tags` 正常加载。浏览器辅助技术树确认导航链接、带标签的搜索框、球体区域名称、30 个预览标签及全部目录内容可读；预览用球面文字按装饰内容隐藏，避免与目录重复朗读，演示标签清楚标注为示例且不提供数据库写入/帖子链接。此项检查仅覆盖简中预览模式的可访问名称与内容树，不代表实时数据库标签交互、完整键盘或读屏验收；托管环境未连接。
- **Phase 6 Tag 球首屏 hydration 修复（2026-10-06）：** 本地浏览器稳定复现 SVG 网格路径的 hydration mismatch，普通 Tags 与 30 标签预览均出现。延后自动转动未能消除问题，已撤回该改动；根因是投影网格把未量化的浮点坐标直接写入 SVG `d` 属性并以未量化深度裁切，服务端与浏览器的微小数值差会产生不一致路径。现坐标与裁切深度统一量化至 1e-6。新增 2 项几何稳定性回归；球体专项 12/12、全量 `npm test` 与全仓 ESLint、TypeScript、36 路由隔离生产构建和 `security:smoke` 45 项通过；4 项需要独立本地恢复栈或真实 ClamAV 的集成测试按默认设置跳过。冷启动浏览器复验普通及 30 标签预览均不再显示 Next.js issue。验证仍不覆盖 pgTAP、实时数据库标签、Staging/Production。
- [ ] CSP、HSTS（Production）、安全 Headers、CSRF/XSS/SQLi/开放重定向、防暴力/爬虫滥用、Rate Limit、Turnstile、WAF、依赖漏洞与密钥扫描。
- **图片加载源码抽查（2026-10-06）：** 当前三个应用图片入口均使用 Next Image；公开缩略图声明宽高、响应式 `sizes`、lazy loading、async decoding 与 no-referrer，标记为装饰图片；地区旗帜也标记为装饰，TOTP QR 明确提供替代文字。此源码抽查未测网络加载、CLS/LCP、屏幕阅读器表现或故障 UI，不替代 Core Web Vitals/浏览器验收。
- [ ] 全量 RLS、敏感操作重认证、TOTP 2FA、恢复码、Audit Log、Security Critical Email 行为检查。
- [ ] Legal / Privacy / Terms / 投稿政策 / 申诉更正撤下 / Cookie Notice 由 Owner 安排马来西亚律师审阅；法律文本未获审阅时不声称合规完成。

**验收：** 所有 Launch Checklist 安全与 SEO 项 PASS；发现 P0/P1 风险、内容泄漏、索引泄漏或无法恢复的数据问题即阻止 Launch。

**本地推进记录（2026-10-04）：** 共用的 noindex 页面 metadata helper 现在会在 Production HTTPS 域名和 `ALLOW_SEARCH_INDEXING=true` 两项门槛同时满足时，为当前语言路径生成 canonical 及 en-MY / zh-CN / ms-MY / x-default hreflang；其他环境不输出线上域名。Latest、Hot、Tag 与地区筛选参数路径继续 noindex；此改动不开放索引，也不增加 sitemap 页面。尚未执行构建、爬虫检查或 Staging/Production 验证。

**公开故事详情 SEO 本地推进（2026-10-04）：** 故事详情页现与 Clarification 一样，只有 Production HTTPS 域名和显式 `ALLOW_SEARCH_INDEXING=true` 同时成立时才输出可索引 robots、规范 URL 与三语 hreflang；其他环境仍 noindex。根 Sitemap 改为按每 10,000 条当前公开投影分片，只列首页、澄清目录及当前 `published_previews` 内的故事/澄清详情；未发布/隐藏记录不进入查询结果，筛选页与后台页仍不列入。此实现不会更改环境开关。尚未执行构建、路由输出、数据库或爬虫验证；仅是本地源码进度。

**正文访问与结构化数据对齐（2026-10-05）：** 源码核对确认，未登录访问者与爬虫得到相同的公开摘要和登录墙；完整正文仅由服务端向符合身份条件的已登录用户提供。详情页 `CreativeWork` JSON-LD 只包含公开标题/摘要，不把登录后正文标成爬虫可读的付费内容。当前结构没有把隐藏正文送给 Bot，也没有对爬虫与同权限访客差别渲染。真实 Production SSR/索引开关及爬虫检查仍未执行；若未来调整公开正文策略，必须先保持访问控制并重新核对搜索引擎规则，不以结构化数据代替授权。

**Phase 6 注册墙 structured data 策略复核（2026-10-06）：** 依据 Google 当前 paywalled-content 说明，`hasPart` / `isAccessibleForFree=false` 是给希望将注册墙后的正文纳入索引、且页面实际具有相应 `.class` 内容区块的场景；Google 同时要求 structured data 代表页面给读者可见的内容，并说明若不希望正文在响应时交给浏览器，应选择不把正文发送给浏览器的 paywall 实现。当前 `getPublishedPostDetail` 仅在合格登录后调用服务端正文 RPC，匿名响应和爬虫 HTML 都只有公开摘要/登录墙；故事 `CreativeWork` 序列化器刻意只取标题、摘要、语言与 canonical，clarification `Article` 只取公开字段。`npm run test:seo` 19/19 通过，覆盖公开字段限定、注入字符转义、有效 canonical 与 clarification 日期/citation；没有浏览器 body，也没有数据库/SSR 在线测试。故已把本清单收窄为当前安全的一致策略：公开摘要结构化标注、不向 Bot 特权提供正文、不声明匿名 HTML 中不存在的付费正文区块。若要改变可见正文/索引范围，须先有产品及法务确认并重新设计访问边界。参见 [Google paywalled content markup](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content) 与 [general structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)。

**Phase 6 本地生产预览安全与索引门检查（2026-10-04）：** 使用隔离 `.next-validation` 构建启动临时生产预览，核对 `nosniff`、拒绝 iframe、Referrer/Permissions 策略、Production HSTS 及 nonce CSP 都返回；首页、投稿草稿、后台和账号/投稿/举报/地区/澄清/Hot/Latest/Tag/Search 页面共 13 个简中路径返回 200，10 个受保护/筛选页面均包含 noindex。未配置索引授权时，`robots.txt` 为全站 `Disallow: /`，分片 sitemap 返回空 urlset；这是当前安全默认状态，不是公开数据 sitemap 的完整性验证。临时生产预览已停止；未启用索引或联系搜索引擎/托管服务。

**Phase 6 Next 补丁与依赖审计复核（2026-10-05）：** Next.js 与 `eslint-config-next` 同步从 16.3.6 升至 16.3.8；`npm run test:local` 通过（Node 套件、26 个 pgTAP 文件 / 637 条断言、数据库 lint），TypeScript、ESLint 与隔离 production build（36 个路由）通过。`npm audit --omit=dev` 为 0 项；完整审计仍报 5 项 high，均沿开发用 lint 链 `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`。审计建议的自动修复会把 `eslint-config-next` 降级到 14.2.35，与 Next 16 不兼容；npm registry 当前没有更高的 `braces` 修复版，故未强行覆盖或移除 Next lint 插件。此次补丁不代表依赖漏洞门槛通过；待上游发布兼容修复后再复测。构建后仅恢复了 Next 自动改写的 `tsconfig.json`，没有触碰托管环境或打开功能门。

**Robots 本地收紧（2026-09-30）：** `robots.txt` 现同时排除 `/api` 及其 locale 前缀，避免搜索爬虫发现应用 API 路由；精确 `/auth` 与子路径也纳入限制。该规则仅为爬虫指引，不构成访问控制，API 仍须由服务端授权和 `X-Robots-Tag` 保护。生成仍要求可信 Production HTTPS origin 与显式 `ALLOW_SEARCH_INDEXING=true`；sitemap 只列三语首页，其他 noindex 路由不列入。尚未做 Production SSR/robots 抓取或搜索引擎验证。

**部分离线安全审查与本地修复（2026-09-29）：** Codex Security 已封存部分源码扫描（快照 `1de763ec9b6e8cad19d66d648e5397ecc3f0f809`），确认 3 项中等风险：已登录用户可绕过邮件流程自行创建验证 token、UI 关闭时仍可直接调用投稿创建 RPC、搜索限流依赖未经配置验证的 `X-Forwarded-For`。搜索分页上限候选因影响尚未证实而未列为发现。该审查没有逐一阅读完整 174 文件，也未接触本地/托管数据库运行状态、Staging/Production、SMTP、WAF、外部网络或真实代理头，结论仅适用于本地源码快照。

本地补充迁移 `20260929140124_mmwr_security_default_off_email_verification.sql` 将撤销旧客户端邮箱 token 创建权，并将新建随机 token 的 RPC 限定于服务端 `service_role`；数据库按 Auth 用户 ID/当前邮箱复核，保留原 30 分钟、单次使用、每小时 3 次规则。它还撤销客户端调用创建投稿、补充资料、登记证据 RPC 的权限，并移除证据隔离桶投稿人上传策略，以数据库权限实现整个投稿写入面默认 OFF；只读投稿状态及工作人员审核操作保留。邮件 Server Action 改为使用仅服务端 `SUPABASE_SECRET_KEY` 调用新 RPC。搜索 rate-limit 要求 `SEARCH_TRUSTED_CLIENT_IP_HEADER` 指定允许的可信头；缺少或无效时 fail closed。该变量必须等 Vercel/Cloudflare Staging 代理行为验证后再设置。

另将本地 `supabase/config.toml` 的 `auth.minimum_password_length` 从 6 调整为 10，与注册/重设密码 Server Action 对齐。Supabase 文档建议至少 8 位，10 位符合本项目现有校验；该本地设置不能改变托管项目 Auth 策略，托管策略仍需在 Staging/Production 配置和验证。

后续只读权限清点：本地迁移中 31 个 public/private 表名均找到 `ENABLE ROW LEVEL SECURITY` 声明；48 个 public 与 38 个 private 函数声明均匹配到显式 `REVOKE`（按函数名做静态脚本清点，含重定义）。这只能说明迁移文本中存在对应语句，不等价于验证最终合并后的 ACL、策略语义、角色继承、迁移顺序或运行中的 RLS；没有执行 SQL、Supabase Advisors 或 pgTAP。Staging 的实际角色/权限验证仍是上线门槛。

这些源码层修复**仍待迁移审核、应用并在 Development/Staging 中验证**；Production 需要之后由用户逐步配置。Security 与 SEO 的 Phase 6 勾选项维持未完成，不能将本次局部审查或本地代码修改记为上线门槛通过。本地 `npx tsc --noEmit`、`npx eslint .` 与 `git diff --check` 通过；未执行测试、构建、Supabase Advisors 或数据库查询。

**局部进度（2026-09-28）：** Next.js 全路由响应现配置基础 CSP nonce（Production 不允许 `unsafe-eval`，按已配置 Supabase URL 最小化图片/媒体/连接来源）、`nosniff`、禁止 iframe、严格来源策略和关闭摄像头/麦克风/定位/Topics 的 Permissions-Policy；HSTS 仅在 Production 响应启用。nonce 由 Proxy 每请求生成，根布局启用动态渲染。Turnstile 与 GA4 所需来源已加入 CSP；R2 尚未启用。CSP 兼容性仍待 Development、Preview/Staging 和 Production 验证，这不代表 Security Launch Gate 已通过。

**SEO 本地基线（2026-09-28）：** 根 metadata 默认 `noindex`；robots 和 sitemap 仅在 Vercel Production 且 `ALLOW_SEARCH_INDEXING=true`、并配置 HTTPS `NEXT_PUBLIC_SITE_URL` 时启用。该条件现由同一个服务端校验器管理：只接受 HTTPS origin，不接受凭据、路径、查询或片段。当前 sitemap 只列首页；未完成的页面不进入 sitemap，robots 另禁止后台、账户、认证、投稿状态与投稿入口抓取。首页仅在索引开关打开时输出 `Organization` / `WebSite` JSON-LD；公开帖详情已加入基于 `published_previews` 安全字段的动态 canonical、Open Graph 与 X 分享 metadata；不会读取全文/身份/证据，详情仍为 `noindex`。Production 环境变量和真实爬虫结果尚未验证；普通帖子 CreativeWork 与澄清页 Article 的本地 JSON-LD 已接入并有序列化测试；Rich Results 和真实爬虫验证仍未完成，SEO Launch Gate 未通过。

**已保存语言的首屏语义增量（2026-09-29）：** 原先根布局从语言偏好 Cookie 初始化服务端 `<html lang>` 和根页面描述/Open Graph locale；无 Cookie 时先用 English，再由客户端浏览器语言偏好初始化。2026-09-30 起，首页稳定 URL 的首屏语言改由路径段决定，根 `/` 按偏好/Accept-Language 跳转。全站 URL 路由已在本地继续实现，实际 SSR 与爬虫行为尚未验证，不代表多语言 SEO 完成。

**SEO 默认拒绝索引修正（2026-09-30）：** 根布局的 robots 默认固定为 `noindex, nofollow`；首页独立生成 metadata，只有 Vercel Production、`ALLOW_SEARCH_INDEXING=true` 且配置有效 HTTPS origin 时才允许索引和跟随链接。新路由若未明确覆盖 robots，会继续 noindex。根布局不再向子路由提供首页 canonical；localized homepage 各自有 canonical 和三语 alternate。其他未完成页面保持 noindex；索引门槛关闭时 sitemap 为空，打开时只列三个语言首页。本地静态检查完成后仍需检查 SSR head、索引开关关闭/开启行为和真实爬虫结果；SEO Launch Gate 仍未通过。

**当前 App 路由 SEO 清点（2026-09-30）：** 根 `/` 按保存的偏好跳转；Proxy 将所有页面路径在浏览器端规范化为 `/en/...`、`/zh-cn/...` 或 `/ms/...`，并在服务器内部重写到既有页面模块。Locale-aware Next links 和客户端搜索建议保留语言前缀。API、认证回调、Next.js 内部路径和静态资源不本地化。首页 canonical、hreflang 与 sitemap 仅在 Production 索引门槛打开时出现；其他页面依然 noindex，帖子详情仍由动态 metadata 控制。`robots.ts` 同时限制旧版与 locale 前缀下的账号/后台等敏感页面，抓取和 sitemap 仍受同一 Production 门槛控制。静态清点不能替代读取 SSR `<head>`、实际浏览器首屏或 Search Console 检查。全站路径实现已在本地，验证和后续 SEO gate 仍未通过；详见 [`docs/architecture/PHASE6_LOCALE_ROUTING.md`](docs/architecture/PHASE6_LOCALE_ROUTING.md)。

**三语 URL 迁移进度（2026-09-30）：** `/` 按保存偏好、浏览器首选支持语言、English 默认的顺序跳转到 `/en`、`/zh-cn` 或 `/ms`。Proxy 对全站有效 locale 前缀进行验证，并通过覆盖客户端同名头的内部请求头传给根布局，控制首屏 SSR、`<html lang>`、metadata 与语言选择器，同时同步保存 Cookie；其他现有页面通过内部 rewrite 保持模块位置。Locale-aware Next links、搜索建议跳转、文章 canonical/Open Graph URL 及邮箱验证页 token 识别已同步适配。locale 页面预取跳过 Supabase 会话刷新；API、静态资源与 auth callback 保持原路径。首页 canonical/hreflang 和 sitemap 仍受 Production 索引 gate 控制，其他页面保持 noindex；`robots.ts` 加入 locale 前缀下敏感页面限制。修复内部 rewrite 后 Proxy 再次重定向造成的 locale 子页面循环；本地 HTTP 检查 `/zh-cn/submit`、`/en/hot` 与根 `/submit` 均最终返回 200，后者会先重定向到 `/en/submit`。生产构建、全仓 ESLint 通过；未运行自动化测试、视觉浏览器检查或爬虫验证。阶段方案与限制见 [`docs/architecture/PHASE6_LOCALE_ROUTING.md`](docs/architecture/PHASE6_LOCALE_ROUTING.md)。

**公开浏览页三语 metadata 增量（2026-09-30）：** Latest、Hot、地区、Tag 目录/详情、搜索页现在依据 Proxy 提供的路径 locale 输出对应语言的 title、description、Open Graph 与 Twitter metadata。Production HTTPS origin 与 `ALLOW_SEARCH_INDEXING=true` gate 均有效时才输出 absolute canonical/OG URL；否则不生成指向 localhost 的 URL。Latest/Tag/City 页码 canonical 保留规范化页码；地区 canonical 保留有效州名与符合 UUID 格式的 City ID。相关页面仍明确 `noindex,nofollow`、未列入 sitemap；帖子详情仍只使用安全公开投影构建 Open Graph。此次未加入 Article/NewsArticle 结构化数据，以免把待审核的用户陈述包装成编辑性新闻信号。TypeScript、相关文件 ESLint 和 diff check 通过；未运行构建、测试、浏览器、SSR head 或爬虫检查。SEO Launch Gate 不变。

**公开列表页索引门与 Sitemap 本地推进（2026-10-05）：** 新增可索引 metadata helper；Latest、Hot、Tags 目录/详情及地区目录/有公开帖的 State/District 页仅在 Production HTTPS origin 与 `ALLOW_SEARCH_INDEXING=true` 同时成立时允许索引。Hot 还要求所有排名开关开启且有公开排名结果；列表页只索引第一页；无公开帖/无效 District/服务不可用的筛选页保持 `noindex`。Sitemap 在原有公开帖子/澄清详情之外加入三语地区目录、存在公开帖的 State/District、含公开帖的 Tag、Latest 与有结果的 Hot；每个 sitemap shard 最多读取 5,000 个帖子和 5,000 个 Tag，各输出三语 URL，保留低于 50,000 URL 限额的余量。`tsc`、ESLint、38 路由 production build、135 项 Node 测试（2 项真实 ClamAV 选择加入测试跳过）、pgTAP 25 文件 / 610 断言与 DB lint 通过。本机 Production gate 关闭时，HTTP 检查确认 `robots.txt` 全站禁止、sitemap 为空，地区/最新/标签预览页 `noindex`。开启索引门的本地 HTTP 检查被运行审查拒绝；未打开任何环境门，也未验证 Staging/Production、爬虫或 Search Console，Phase 6 上线门仍未通过。

**Phase 6 Sitemap 标签分页上限修正（2026-10-05）：** 复核发现 Sitemap 原先从 `public_tag_directory()` 一次读取标签行；该 RPC 会因多语言标签产生重复 ID，而 Supabase 本地 PostgREST `max_rows=1000` 会截断结果，导致标签 URL 总数可能少报、漏收。新增仅从 `published_previews.public_tag_ids` 返回去重 UUID 的 `public_sitemap_tag_ids()`，权限限于 `anon` / `authenticated`；改为 exact head count；随后发现帖子查询同样受 1,000 行上限影响，故帖子和标签均以每片 500 项独立分页，不超过 API 上限。新增回归测试涵盖 >1,000 帖子和标签时的无缝分片、标签去重和权限。2026-10-05 本机 `npm run test:local` 全部通过：Node 套件通过（2 项需要真实 ClamAV daemon 的可选测试按默认配置跳过）、pgTAP 26 文件 / 637 断言、Supabase DB lint 无 schema errors；`npx tsc --noEmit`、ESLint、`git diff --check` 及隔离 production build（38 条路由）通过。构建新增的 tsconfig 类型路径已恢复。只在本机应用该 additive migration，未连接或变更托管数据库；anon 本地 PostgREST 的精确计数 HEAD 与分页 RPC 均返回 HTTP 200（本地公开投影为空，0 行）；没有打开 Production 索引门。浏览器 SSR、实际爬虫与 Staging/Production 仍待各自授权及验收，Phase 6 上线门未通过。

**公开摘要结构化数据安全复核（2026-10-05）：** 帖子访客响应包含审核公开标题、主名称、公开摘要及登录提示；完整正文只向通过服务端身份/访问判定的用户返回。帖子 JSON-LD 改由独立序列化器生成 `CreativeWork`，仅允许可见标题、公开摘要、locale 与 HTTPS canonical，限制长度、过滤控制字符并转义 `<`；5 项 Node 测试覆盖字段白名单、脚本终止符、三语 locale 与 canonical 校验，已加入完整 `npm test`。没有将登录提示冒充受限正文标记：Google 的注册墙结构化数据要求 `hasPart.cssSelector` 对应实际 HTML 中受限内容块；当前匿名响应不含完整正文，所以只标注真实可见摘要，避免给爬虫额外内容或错误声明。全套本地测试、TS、ESLint 与 38 路由生产构建通过；没有执行 Rich Results Test、索引门开启的 SSR 或托管爬虫验证。

**Phase 6 依赖与密钥审计（2026-10-05）：** `npm audit` 报告 5 项 high 级别依赖发现，均沿开发依赖链 `eslint-config-next@16.3.6 → @next/eslint-plugin-next@16.3.6 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`。GitHub Reviewed Advisory GHSA-vfj7-8cjw-p6xm 将 `braces <=3.0.3` 列为受影响版本，当前没有修复版本；上游 issue #73 也记录尚无修复发布。npm 的 `--force` 建议会将 `eslint-config-next` 降至 14.2.35，与本项目 Next 16 工具链不兼容，因此没有采用。`npm audit --omit=dev --audit-level=high` 通过并报告生产依赖 0 项漏洞。新增 `scripts/security/scan-secrets.mjs`，使用固定摘要的官方 Gitleaks 8.30.1 镜像，只读扫描完整 Git 历史与排除生成目录/本机环境文件后的工作树；扫描报告中的 secret/match 内容不输出。2026-10-05 本机扫描两处均为 0 发现。Phase 8 CI 加入生产依赖 high/critical 审计和此密钥扫描，并获取完整 Git 历史；托管 runner 尚未执行。开发工具链漏洞仍待兼容补丁，全量依赖审计仍未清洁。未改 package 或 lockfile。

**Phase 6 首页 canonical 本地回归修复（2026-10-05）：** 本地 SSR 验收发现索引门关闭时，`app/[locale]/page.tsx` 仍返回相对 canonical；根布局 `metadataBase` 将其展开成 `http://localhost:3000/...`。现抽出首页 metadata 生成器：无受信任 Production HTTPS origin 时仅返回 `noindex,nofollow`，不生成 canonical 或 hreflang；合法 origin 才产生三语绝对 URL。回归测试先在旧实现缺失 helper 时失败，随后覆盖三种语言的关闭门、开启门及 HTTP/含凭证/含路径等无效 origin。直接请求 `/en`、`/zh-cn`、`/ms` 现均为 200、语言正确、noindex 且无 canonical/hreflang；`robots.txt` 为全站 Disallow，sitemap 空。也核对地区、Tag、账号、后台、报告错误页的 SSR locale/noindex 与旧路径 query 保留。全量 `npm run test:local` 通过：Node 147 项中 145 通过、2 项真实 ClamAV 按默认模式跳过；pgTAP 26 文件 / 620 断言及数据库 lint 通过。TypeScript、针对文件 ESLint、隔离 production build（39 条路由）通过。未开启 Production 门，未访问 Staging/Production 或爬虫/Search Console。

**Phase 6 robots 分片 Sitemap 首次修正（2026-10-05，已由下方动态方案取代）：** 本机检查发现 `generateSitemaps()` 实际使用分片路由，而 `robots.txt` 曾指向不存在的根路径。曾让 robots 列出构建时已知的 `/sitemap/<id>.xml`，但生产预览证明新增长出的分片仍会 404；该实现已移除，不作为当前状态。

**Phase 6 动态 Sitemap 索引与分片路由（2026-10-05）：** 为消除构建时固定分片 ID，根 `/sitemap.xml` 现按请求从当前公开投影计算 Sitemap Index；`/sitemap/<id>` 是通用动态路由，会重新计算当前分片数并仅读取对应上限内的帖子/去重 Tag。robots 在索引门打开时指向根索引；门关闭时全站 Disallow、没有 Sitemap 声明，索引和分片端点均返回 no-store 404。XML 序列化保留三语 hreflang/lastmod 并转义 URL；新增 6 项 sitemap XML/编号测试，先观察缺少模块时失败再实现通过。全量 `npm run test:local` 通过、pgTAP 26 个文件 / 637 条断言、DB lint 无 schema errors；TypeScript、相关 ESLint、`git diff --check` 与隔离 production build（36 个静态页面、Sitemap 路由均为动态）通过。生产预览确认 robots 与端点在默认关闭索引门下 fail closed。没有为测试打开索引门，也没有托管环境/爬虫验证或公开帖子数据，因此打开门后的实时 sitemap 内容仍待 Staging 验收；Phase 6 SEO 门槛未完成。

**Phase 6 当前工作树本地索引门复核（2026-10-05）：** 重启本地开发预览后，`/zh-cn`、`/zh-cn/areas`、`/zh-cn/tags`、`/zh-cn/tags?preview=tags`、`/zh-cn/latest`、`/zh-cn/hot` 与 `/zh-cn/search` 均返回 HTTP 200、简中标题和 `noindex,nofollow`，没有输出 canonical；`/robots.txt` 返回 `Disallow: /`，索引关闭时 `/sitemap.xml` 返回 404 `Not found`。本机 `npm run test:local` 通过：Node 测试套件无失败（两项真实 ClamAV 测试按默认设置跳过）、pgTAP 26 文件 / 644 断言、数据库 lint 无 schema errors。只核对本地安全默认状态，没有打开索引门或连接 Staging/Production；索引启用分支、真实公开数据 Sitemap、爬虫与 Search Console 仍未验收，Phase 6 保持未完成。

**Phase 6/7 PostgreSQL 17.11 升级兼容本地预检（2026-10-05）：** Supabase 2026-09-25 公告指出 PostgreSQL 15.19/17.11 对 ltree、pgcrypto 旧式 PGP cipher、btree_gist 浮点索引和自定义 operator estimator 有升级注意项（[官方说明](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)）。本机 Supabase 是 PostgreSQL 17.6、UTF8/ICU；只读 catalog 查询未发现 ltree 索引、btree_gist 浮点索引或非 extension 管理的自定义 estimator operator，仓库迁移/备份源码搜索也未发现 pgcrypto PGP 加解密调用。当前本地无上述对象证据；Staging/Production 在未来升级或恢复前仍须按官方检测查询各自目录及实际数据，不能沿用本地结论。

**Phase 6 开发依赖漏洞复核（2026-10-06）：** 重新审计当前 lockfile 与 npm 上游版本：生产依赖 `npm audit --omit=dev --audit-level=high` 为 0 项；完整树仍有 5 项 high，唯一脆弱链为 Next 16.3.8 的 `eslint-config-next → @next/eslint-plugin-next → fast-glob 3.3.1 → micromatch 4.0.8 → braces 3.0.3`。GitHub Reviewed Advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 现仍列 `braces <=3.0.3` 且无 patched version；npm registry 的最新 `braces` 为 3.0.3，Next 与 ESLint config 最新均为 16.3.8。`npm audit fix --force` 会降级到 Next 14.2.35，无法与 Next 16 工具链兼容。未降级、未引入未发布 fork/覆盖、未改依赖；待上游修复或兼容的 Next ESLint 依赖链发布后复核。此项为开发期 lint 链，不影响生产依赖审计结果，但仍是 Phase 6 完整依赖审计的未关闭项。

**Phase 6 本地 Git 历史与工作树密钥扫描（2026-10-06）：** CI 已调用 `scripts/security/scan-secrets.mjs`，但本地尚未留有当前工作树扫描结果。本轮运行该脚本，Gitleaks 使用仓库固定镜像 digest，只读挂载 Git 历史和非生成工作树，扫描器仅输出规则/文件/行/提交摘要，不输出凭据内容；结果为 0 findings。此证据只覆盖当前本地 checkout 历史和文件，不代表未检出的其他 refs、托管日志或用户 Secret Manager。

**Phase 6 本地生产安全与 noindex 回归自动化（2026-10-06）：** 新增 `npm run security:smoke`，在隔离的本地 production build 上通过回环地址启动临时 Next.js 服务，明确清空 Supabase、邮件和对象存储连接值，并强制索引及 IP-block 门关闭。隔离 production build 通过（36 路由）；脚本通过简中首页、投稿/后台/账号/投稿状态/举报/地区/澄清/Hot/Latest/Tags/Search 共 12 个页面的 HTTP 200、全局安全响应头、noindex 检查，首页 CSP nonce 与 HTML 一致。另确认 `/robots.txt` 全站 Disallow 且不声明 sitemap，索引门关闭时 `/sitemap.xml` 返回 404。CI 已在 production build 后接入该脚本。此前 2026-10-04 的人工检查记录将 sitemap 描述为空 XML，与当前路由不符；本轮以实际实现的 fail-closed 404 为准。这里只验证默认关闭状态，不测试索引开启后的公开 sitemap 投影、完整抓取质量或搜索引擎行为；不代表 Phase 6 通过。

**Phase 6 本地生产安全 smoke 复核（2026-10-06）：** 扩展 `npm run security:smoke`，按简中/英语/马来语逐一检查 12 个代表路由，总计 36 项：HTTP 200、安全响应头、noindex 与正确 `<html lang>` 全部通过；三语首页 CSP nonce 与 HTML 一致。关闭索引时 robots 全局 Disallow 且不发布 sitemap，`/sitemap.xml` 返回 404。验证使用既有隔离构建与 loopback 临时服务，没有访问 Supabase 或开启索引/运行功能门。此结果仅验证本地 fail-closed 响应，不替代开启态投影审核、真实屏幕阅读器/键盘测试、Staging/Production 或搜索引擎验收。

**Phase 6 生产安全 smoke 复跑（2026-10-06）：** 对当前隔离 `.next-validation-ci` production build 再运行 `npm run security:smoke`；简中、英文、马来文 15 条路由各自全部返回 200，45 个页面响应均满足安全 Headers、noindex、正确 `html lang` 与唯一 `<main>`；首页 CSP nonce 与内联 HTML 匹配，封闭索引时 `robots.txt` 全站 Disallow、无 sitemap 声明，`/sitemap.xml` 返回 404。此轮只检查索引关闭和安全默认态，不证明开启索引后的 sitemap 投影、线上配置或爬虫行为。

**Phase 6 永久移除 URL 行为复核（2026-10-06）：** 当前普通帖子和澄清页在永久移除后会 308 跳转至对应语言首页；`USER_MANUAL.md` 也记录了该行为。MASTER_PLAN 的上线要求是原 URL 去内容并从索引撤下，但没有明确指定 HTTP 状态。Google Search Central 对没有相似替代内容的删除页面建议直接返回 404 或 410；将这类 URL 统一跳首页可能被视为错误页面跳转，而非内容迁移。[官方说明](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)。由于现有用户手册记录了另一种产品行为，路线状态码需要产品决策；此复核没有改动路由。Staging 与 Search Console 仍未验证。

## Phase 7 — 备份与灾难恢复

**Phase 7 本地 psql 目标适配器（2026-10-05）：** 新增 `backup/supabase-psql-target.mjs`，提供 loopback URL 模式及绑定 `supabase_db_<project_id>` 的 Docker-local 模式；目标预检只读检查 `public/private/supabase_migrations` 是否存在非扩展应用对象。Docker-local 模式经 stdin 传入 SQL、使用本机 `supabase_admin` 角色；两种模式均运行无 shell 的 `psql`、环境变量传密码（仅 URL 模式）、抑制 SQL 错误输出、使用单组件事务与 `ON_ERROR_STOP`；data-only 组件在同一 psql session 暂停触发器。备份专项 `npm run test:backup` 通过 40 项、2 项 opt-in 默认跳过。已在独立空白 Supabase Postgres stack 经协调器导入合成加密备份的全部 8 个组件并读回核验。真实 MMWR 导出集的 managed roles/Auth/Storage schema 兼容仍未验证；不连接托管环境，恢复开关继续 OFF。新增本地门槛 `npm run test:local` 通过（26 个 pgTAP 文件 / 637 项断言、数据库 lint 无 schema 错误），ESLint、TypeScript 与 diff 检查通过。

**Phase 7 数据库恢复执行协调器（2026-10-05）：** 新增 `backup/restore-database-run.mjs`，仅在独立 `MMWR_BACKUP_RESTORE_ENABLED=true` 时允许恢复；要求 source/target 不同、目标显式 `isolated`，并由目标适配器只读确认 project ref 相符且目标为空白。加密 manifest 与八个数据库组件会先下载并逐一校验密文 hash/大小、AES-GCM 标签及明文 hash/大小，再按角色、应用 schema、Auth/Storage schema、应用/Auth/Storage data 和迁移历史顺序执行。完整性错误时零写入；写入中的首个失败停止且不重试、不自动删数据，并明确标识半恢复目标。协调器及目标适配器的合成测试通过，并已在独立本地 Supabase Postgres stack 完成合成八组件恢复；真实 MMWR 导出兼容性仍未验证，也没有完成 DB+Storage 一体演练；所有恢复/备份门仍关闭，Phase 7 未验收。

**Phase 7 数据库隔离恢复合成演练（2026-10-05）：** 新增 Docker-local psql 目标 `createDockerPsqlRestoreTarget()` 与选择加入的 `backup/supabase-database-target.local.test.mjs`。它只接受与 project ID 一致的 `supabase_db_<project_id>` 容器，SQL 经 stdin 传入，不挂载宿主机敏感路径。实际在第二套 Supabase 项目 `mmwrrestoretarget001` 的独立空白 Postgres volume 中，经协调器还原合成加密备份的 8 个组件：角色、应用/Auth/Storage schema，以及应用/Auth/Storage/migration data；回读四张合成表各 1 行且角色存在。第一次演练暴露 `postgres` 角色无法写入 Auth/Storage schema，修复后改由容器本地 `supabase_admin` 执行；失败目标和成功目标均在核实 project ID 与合成角色后由 Supabase CLI 停止并删除专属数据卷。此测试未导入真实 MMWR dump、未启动 Auth/Storage 服务、未恢复实际 Storage 对象，也不是 DB+Storage 联合恢复。测试默认跳过，需新建 ID 符合 `mmwrrestoretarget` + 3 个字母数字的空白本地项目才可运行；所有运行 gate 维持 OFF，Phase 7 仍未验收。

**Phase 7 Windows 端到端恢复阻断复核（2026-10-05）：** 本地导出器在 Windows 默认直接启动 npm 的 Unix shim，导致 Supabase CLI 无法启动。现改为在 Windows 默认通过当前 Node 运行仓库锁定的 Supabase CLI 脚本；显式 `SUPABASE_CLI_PATH` 仍优先。回归测试先确认旧行为失败，修正后备份导出套件 3/3 通过。重跑完整隔离集成后，真实导出与加密成功，数据库恢复在应用 schema 两个组件后被 `database_auth_schema` 中 Supabase 已预置对象拦截（固定错误类别 `object_already_exists`）；尚未写 Auth 数据或任何 Storage 对象。专用 `mmwrrestoretarget002` 栈已 `stop --no-backup`，Docker 容器与数据卷核对均为空；系统临时目录中的 CLI 配置目录仍在，因为本机命令策略拒绝删除。完整 `npm run test:local` 通过：Node 套件、26 个 pgTAP 文件 / 637 条断言、数据库 lint 无 schema 错误。这个结果确认托管 schema 的恢复策略仍需设计，不能跳过冲突继续写入；Phase 7 及全部备份/恢复 gates 保持未验收/OFF。

**Phase 7 托管数据备份来源复核（2026-10-04）：** 重新核对当前 Supabase 官方文档后，分清了两条不同路径：CLI 逻辑备份文档说明 `auth`/`storage` 的自定义触发器和 RLS 等定制需要单独恢复，当前仍没有本项目完整 Auth/Storage 数据产物的 Staging 证据；Beta 的 Restore-to-New-Project 则明确包含 Auth 用户数据，但不复制 Storage 对象和桶配置，只能在启用物理备份的付费计划使用，并会把数据库作为 binary restore 还原，内含的 pg_cron/pg_net 等任务会立即启动。Worker 因此继续强制要求各 Auth/Storage 组件且对不完整逻辑导出 fail closed；平台物理还原只能作为之后需要 Owner 选择、成本确认与隔离副作用评估的候选，不能声称完整恢复。只读官方文档，未连接数据库、运行 CLI 或做环境操作。来源：[CLI 备份与恢复](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、[Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)、[Storage schema](https://supabase.com/docs/guides/storage/schema/design)。

本地准备：[`docs/architecture/PHASE7_BACKUP_DESIGN.md`](docs/architecture/PHASE7_BACKUP_DESIGN.md) 定义独立 Worker 边界、Supabase CLI 导出组成、加密清单、隔离恢复与默认关闭的保留清理护栏。`backup/crypto.mjs` 提供流式 AES-256-GCM 文件信封加解密；`backup/manifest.mjs` 验证必需导出组件、对象映射、总量与数据库导出时间窗；`backup/retention.mjs` 只产出留存/删除候选、不执行删除；`backup/r2.mjs` 提供 OFF-by-default 的 R2 对象适配器；`backup/supabase-storage-source.mjs` 提供分层分页、限时签名下载和单件及整份 Storage 清单复核；`backup/supabase-cli-export.mjs` 通过 Supabase CLI 导出 roles/schema/data 及 migration history，密码仅经受限子进程环境提供；全量 Worker 仍要求 `database_auth_schema`、`database_auth_data`、`database_storage_schema`、`database_storage_data` 四个经验证产物，对不完整逻辑导出 fail closed。Beta 平台物理还原是另一个候选，不复制 Storage 对象/桶配置，且数据库中的调度任务可立即启动，故需 Owner 选择与隔离副作用评估，不能替代未验证的 R2 全量恢复。`backup/worker.mjs` 编排导出、加密上传、读回逐件完整性检查和加密清单。对象完整性成功只代表密文、认证标签、明文 hash/大小校验通过；各 CLI dump 来自不同读取时间点，Storage 仅在复制前后复核清单，尚无数据库与 Storage 的共同事务快照，不能宣称原子一致或可恢复性已证明。`backup/status.mjs` 将最小化状态写入适配窄 RPC；`backup/run-scheduled.mjs` 与 `npm run backup:once` 只提供默认关闭的单次定时运行入口，不代替实际调度；`backup/restore-plan.mjs` 仍只生成只读恢复清单；新增的 `backup/restore-storage-run.mjs` 可从一个已验证的加密备份恢复 Storage 对象，但没有数据库恢复协调器或完整 DB+Storage 一体化恢复。新增本地迁移 `20261001040905_mmwr_backup_run_ledger.sql`，提供私有运行表、追加式状态审计、service-role 状态写入、首次失败时依据固定 failure code 区分 `backup_failure` 与仅用于完整性证据失败的 `backup_validation_failure` 两类固定 Owner 邮件来源及需近期 TOTP 的 Admin/Owner 状态读取；后台只读备份状态面板也已本地完成，并说明上述一致性边界。以上不代表数据库已迁移或服务已连接；仍未接入调度器、后台手动触发、告警投递、真实 R2 备份/恢复或数据库恢复，状态面板、入口及迁移尚未验证。

**Phase 7 本地续进（2026-10-04）：** Worker 现先写入初始 `running` 状态，再检查 Worker 专用密钥、磁盘目录/预算和构建 R2/数据库/Storage adapter；这些前置错误在状态账本可用时应转为固定 `backup_failed`，且不得导出数据库或上传对象。Supabase URL、服务凭证或状态 RPC/数据库本身不可用时无法保证写入账本，流程在准备数据源前失败并只输出通用 CLI 错误。Staging 验收清单已加入无导出/无上传检查。此为本地实现与验收准备，未运行 Worker、测试或服务连接，Phase 7 仍受 Auth/Storage 导出完整性门槛阻断。

**Phase 7 本地合成验证续记（2026-10-04）：** 新增 `backup/backup-core.test.mjs` 与 `npm run test:backup`，12 项 Node 测试不连接任何服务，验证加密/篡改失败、清单路径与组件校验、7/4/6 留存 dry-run、大小边界、只读隔离恢复计划及完整注入式 Worker 成功/失败路径。Worker 回归测试发现并修复两个流处理错误：Storage source 和对象存储适配器都返回异步 Node Readable，Worker 原先重复包流/未等待对象读取，导致真实备份会在首个对象校验时失败。修正后合成运行加密上传并读回验证 8 个数据库组件、1 个 Storage 对象及 manifest；被篡改的读回密文产生固定 `backup_validation_failed`，缺少 Storage 总字节预算则在数据库导出和对象写入前 fail closed；临时工作目录成功/失败均清除。本测试不执行真实 Supabase CLI 导出、Storage/R2 网络、调度、账本数据库写入、保留删除或恢复；Phase 7 的 Auth/Storage 导出兼容性阻断及隔离恢复仍未通过。

- [ ] 自动任务每日凌晨备份数据库 + Storage 至独立 Cloudflare R2；Owner 可发起手动备份。凭证服务端保存、备份加密、传输加密。
- [ ] 保留策略：7 daily + 4 weekly + 6 monthly；清理规则本身不得清除未过期备份。
- [ ] 完整性校验、清单/文件数/大小/hash、后台备份状态；失败/连续失败/校验错误生成紧急通知并 Email Owner。
- [ ] 编写并演练恢复：从数据库和 Storage 同时恢复到隔离环境；校验 RLS、记录、附件关联、权限；明确 RPO/RTO（用户确认或标为待设）。
- [ ] 记录恢复操作 Audit Log；确保恢复目标不覆盖生产数据，直到用户明确授权。

**Phase 7 Storage 元数据恢复边界复核（2026-10-05）：** 查阅 Supabase 官方 Storage ownership/schema 文档及当前安装的 Storage SDK 清单类型后确认：Storage API 使用 service key 写对象不会设置 `owner_id`；`storage.objects` 按官方建议只读、对象写入应通过 Storage API；Storage 列表不返回 owner，API 重上传也会生成新时间戳。因此当前支持的隔离恢复路径无法保留源对象的 owner/time 元数据。没有改用直接 SQL 写系统表、模拟用户身份或打开任何恢复门。需等待 Supabase 提供受支持的元数据保留流程，或在 Owner 审阅完 MMWR 的访问、删除与审计影响后明确接受恢复语义，Phase 7 才可完成恢复验收。具体来源与风险见 [`docs/architecture/PHASE7_BACKUP_DESIGN.md`](docs/architecture/PHASE7_BACKUP_DESIGN.md)。

**验收：** 至少一轮隔离恢复演练成功；仅看到 R2 对象或“备份成功”通知不算通过。

**Phase 7 导出组件实现（2026-10-05）：** Supabase CLI 导出器现在通过独立 `--schema auth` / `--schema storage` 命令请求 Auth 与 Storage 的 schema/data，并将四种产物纳入全量 Worker 清单；CLI 子进程注入测试验证八种组件类型、显式 schema 参数及数据库密码不进入参数。Auth 或 Storage 的 schema 定义若为空，导出器会 fail closed；空数据文件仍允许。manifest 测试逐一移除四种 Auth/Storage 组件并确认每种缺失都会被拒绝。Supabase CLI 2.118.0 的 Auth dry-run 确认显式 schema include 参数存在且没有 Auth 排除项。`npm run test:backup` 14/14 通过；完整 `npm test` 通过，两项真实 ClamAV 测试按默认设置跳过。真实数据库 dump 命令未执行，Auth/Storage 实际表行覆盖、SQL 兼容性及隔离恢复仍未验证；所有备份运行门保持 OFF。

**Phase 7 Storage 对象恢复组件（2026-10-05）：** 新增 `backup/restore-storage-run.mjs`，把已成功且完整性验证过的备份状态、R2 对象读取、manifest GCM 解密验证、Storage 对象下载/摘要核验、逐件解密及本地隔离目标恢复串起来；manifest 没有外部明文摘要时仍必须通过 AES-GCM 认证，Storage 明文需同时匹配 manifest 大小/SHA-256。仅在显式 `isolated`、source/target/adapter project ref 一致时继续，并在所有 Storage 对象解密完成后才进入目标预检/写入。目标适配器 `backup/supabase-storage-target.mjs` 私下持有 service key，仅接受 HTTPS 或非 production loopback URL，完整分页桶与嵌套对象清单，按大小界限上传并禁止覆盖。目标恢复拒绝清单外桶、冲突配置和非空桶；写入中断不做自动清理，避免删除可能有用的数据。12 项纯本地注入测试覆盖恢复往返、认证篡改、R2 摘要、隔离绑定、零写入预检、桶策略、分页和上传限制；另有显式 opt-in 的真实本地 Storage 冒烟用例，成功验证唯一合成私有桶的上传、嵌套列举、回读和清理。另在独立临时 Supabase 栈完成了 Storage-only 加密合成备份恢复：manifest 与对象经 AES-GCM、密文摘要、明文大小/hash 核验后恢复到空私有桶，实际 API 桶配置、嵌套对象列举和回读验证均通过；演练数据卷已移除。完整本地门槛通过：`npm run test:local`、备份专项 27 通过 / 1 本地冒烟默认跳过、26 个 pgTAP 文件 / 637 条断言、DB lint 无 schema 错误；lint、TypeScript、diff 检查通过。当前开发 Supabase 因清单外已有桶而在写入前拒绝，未修改原开发 Storage。该演练使用合成 R2 适配器，没有访问真实 R2；数据库恢复、空白目标上的 DB+Storage 联合演练和一致性/RPO/RTO 仍未验证，Phase 7 未通过验收，Worker/R2/恢复开关保持 OFF。新增本地冒烟测试开关与 project-ref 标签已在 `.env.example` 注明，禁止用于部署。

**Phase 7 实际本地 CLI 导出覆盖核对（2026-10-05）：** 本地 Supabase CLI 2.118.0 对 PostgreSQL 17.6 成功输出 Auth/Storage schema 与 data-only SQL；命令输出仅在进程内捕获，没有保留 SQL 文件或显示行值。Auth/Storage 分别有 27/10 个表定义、26/9 条 COPY 目标；CLI 过滤掉 `auth.schema_migrations` 与 `storage.migrations` 的数据，当前本地分别有 82/73 行。Supabase 官方 Auth troubleshooting 说明缺失 `auth.schema_migrations` 状态可能导致重跑非幂等 migration（[官方说明](https://supabase.com/docs/guides/troubleshooting/an-invalid-response-was-received-from-the-upstream-server-error-when-querying-auth-RI4Vl-)）。所以“schema/data artifact 存在”不代表覆盖完整或可恢复；必须先明确目标 Supabase 版本如何处置两张服务管理迁移表，再做隔离恢复。没有数据库写入、R2/托管连接或运行备份 Worker，Phase 7 保持未完成。

**Phase 7 managed-ledger 导出修正（2026-10-05）：** 在既有 Supabase CLI Auth/Storage dump 后，导出器现额外调用版本兼容的 `pg_dump`，且 `--table` 严格限定 `auth.schema_migrations` 与 `storage.migrations`，再分别合并到 Auth/Storage data artifact；不执行未过滤的 dump。密码只通过受限子进程环境传递。PostgreSQL 17.6 本地只读复核显示两张表各自含 82/73 行且都产生 COPY 段；新增测试先因缺少这两次调用而失败，再在实现后通过。Auth/Storage 当前已知数据遗漏已在导出逻辑中补上，但合并 SQL 的恢复兼容性和迁移启动行为还没有隔离 restore 证据，因此 Phase 7 仍未完成，Worker 与运行门继续 OFF。Staging 验收条件已改为检查精确表清单、客户端版本兼容和真实隔离恢复；未访问托管环境、R2、或写入本地业务数据。

**Phase 7 managed-ledger 临时恢复复核（2026-10-05）：** 在临时本地数据库先准备 CLI 会导出的 `auth`/`storage` schema，再导入严格白名单两表的 schema 与 data-only SQL；恢复后行数为 Auth 82、Storage 73，随后删除临时库。第一次尝试因仅表级 dump 不包含 `CREATE SCHEMA` 而失败并清理；按实际恢复顺序补齐 schema 后通过。此项只验证迁移账本数据，不是完整八组件恢复或 Auth/Storage 服务验收；Phase 7 仍未完成，备份 Worker 与所有运行门保持 OFF。

**Phase 7 全量恢复前置检查（2026-10-05）：** 完整本地 CLI 导出已生成，但不能在同一 Supabase 数据库的临时库完整导入，因为 `pg_cron` 只允许在配置的 `postgres` 库安装。无网络的独立 Supabase Postgres 镜像也不是完整 Supabase 项目：缺少 `supabase_realtime_admin` 等预置角色，角色恢复失败，未执行全量 schema/data 导入。临时数据库与容器已清理；下一次须用隔离且完整 provision 的 Supabase 栈验证。临时导出 SQL 留在系统临时目录，因本地命令策略拒绝删除，需用户手动移除本次任务回复中所列的精确目录。源数据库与远端未更改，Phase 7 仍未完成且运行门关闭。

**Phase 7 真实本地 DB+Storage 联合恢复兼容性复核（2026-10-05）：** 新增本地 Docker `pg_dump` 通道，仅限非 production、本机数据库 URL 与固定 `supabase_db_<id>` 容器；Docker 通道保留短本地密码兼容，托管/主机通道仍要求至少 12 位。修正目标空表预检：改用始终返回结果行的 `EXISTS` 查询，避免空 Auth/Storage 表产生空 XML 而误报失败。psql 失败现可只返回固定脱敏类别，不保留原始 SQL/行值。专项相关单测 15/15 通过。选择加入的完整栈演练已成功实际导出并加密当前本地数据库，但恢复在应用前两组件后于 `database_auth_schema` 失败，安全分类为 `object_already_exists`；目标栈已有预建 Auth 表结构。这个证据确认发生对象名冲突，但原始表名/SQL 仍被隐藏。部分目标已通过精确隔离项目 `mmwrrestoretarget001` 执行 `supabase stop --no-backup` 删除。Storage 恢复尚未运行；这不是成功的联合恢复。下一步须先设计并验证对 Supabase 预建 Auth/Storage schema 与迁移账本的安全兼容策略；Phase 7 未验收，备份/恢复 gate 继续关闭，未连接托管环境。

**Phase 7 主数据去重与隔离恢复（2026-10-05）：** 本地复核发现 Supabase CLI 不带 schema 范围的主 `data.sql` 会重复导出 Auth/Storage 表，与独立 Auth/Storage 组件重叠。先新增失败回归，再把主数据导出限制为 `public,private`；CLI 实际导出确认 70 个 COPY 目标包含应用数据且不再包含 `auth`/`storage`，14/14 备份测试与定向 ESLint 通过。随后在第二套端口隔离、同版本本地 Supabase 栈（PostgreSQL 17.6）恢复角色已由平台预置的数据库逻辑组件：业务 schema/data、Auth 与 Storage 数据、应用迁移账本及严格白名单导出的 Auth/Storage 迁移账本。108 个 COPY 表逐表核对全部一致（447/447 行）；Auth/Storage migration ledger 为 82/73 行，70 个 public/private 表均启用 RLS；重启 Auth/Storage 服务后健康端点均为 HTTP 200。半成品恢复目标仅在本地隔离环境通过 Supabase CLI 停止并清除其专用 volume，原开发数据库未被修改。此结果仍不证明真实 Worker 加密/R2 导出，也未恢复 Storage 二进制对象、审计生产服务/Auth 用户登录、回滚/跨版本兼容或端到端应用权限；所有运行门维持 OFF，Phase 7 保持未完成。

**Phase 4/7 私有缩略图进入备份清单（2026-10-05）：** 扩展 `backup/backup-core.test.mjs` 的合成全量 Worker、manifest 与只读隔离恢复计划夹具，加入独立私有 `mmwr-public-thumbnail-derivatives` 桶和 `.webp` 对象。测试证明 Worker 会下载并加密该对象，manifest 会保留桶的 `public=false`、512 KiB 上限及 `image/webp` 白名单，并把对象路径纳入隔离恢复计划；`npm run test:backup` 14/14 通过。随后 `npm run test:local` 全量通过：155 项 Node 测试中 153 通过、2 项 opt-in ClamAV 默认跳过；pgTAP 26 个文件 / 635 项、数据库 lint 无错误；ESLint、TypeScript、`git diff --check` 通过。此为 adapter 注入的本地合成验证，不是 Supabase Storage 真实 API 或完整恢复演练；桶/对象创建与恢复、全量八组件导入和高风险备份运行开关仍未执行。

**Phase 7 本地 Storage API 对象烟测（2026-10-05）：** 在当前本地 Supabase 临时创建私有、限制 `image/webp` 与 512 KiB 的唯一测试桶，上传一份合成 WebP 字节，实际检查 Storage API 桶配置、嵌套对象列表/大小、短时签名下载、逐字节内容与 `info` 元数据；全部通过。最后删除对象和桶，并重新查询确认没有遗留测试桶；8 个本地 runtime flags 仍为 false。该烟测直连本地 Storage API，不启动默认关闭的备份 Worker、不修改 Worker gate，也不证明备份 source adapter、加密归档或隔离恢复。

**Phase 7 恢复目标数据空态保护（2026-10-05）：** 扩展本地恢复目标只读预检：除 `public`、`private` 与 `supabase_migrations` 不得已有应用对象外，还会逐表检查 Supabase 管理的 `auth` / `storage` schemas 是否含数据；仅允许保留 Auth/Storage 自身迁移账本，以支持已初始化的本地平台栈。目标适配器 9 项 Node 测试通过，SQL 在当前本地 PostgreSQL 17.6 上执行并按预期把已有 MMWR 开发库判为不可恢复目标（只读，没有数据库写入）。这是预检保护，不构成真实备份恢复兼容性证据；恢复和备份 gates 继续关闭。

**Phase 7 联合恢复对象字节覆盖补强（2026-10-05）：** 更新 opt-in 全量本地恢复用例，使它先在仅限 loopback 的源 Supabase Storage 中创建唯一合成私有桶及嵌套对象，再从同一份加密备份恢复数据库和 Storage，并比较目标对象路径与逐字节内容；测试结束后清理源端对象/桶。本轮在隔离目标实际执行：导出与加密成功，但数据库恢复在 `database_auth_schema` 因预建 Auth 对象冲突（`object_already_exists`）停止，未进入 Storage 字节回读；测试已清理源端合成对象/桶，隔离目标已通过 Supabase CLI 停止并移除专属 volume。该演练失败，备份/恢复 gates 继续关闭。

**Phase 7 当前本地完整加密 DB + Storage 恢复（2026-10-05）：** 修复托管 schema 兼容策略后，Opt-in 集成演练从真实本地 Supabase CLI 导出并生成同一份加密备份，将数据库和合成私有桶/对象恢复到新建隔离 Supabase 项目 `mmwrrestoretarget003`。核验：应用地区 175 行、应用迁移 103 行、Auth/Storage 迁移账本 82/73 行、1 个自定义 Auth trigger、1 条 MMWR Storage policy、Auth/Storage 服务健康，以及合成对象路径和内容逐字节一致；source 测试桶/对象已清理，所有 runtime flags OFF。旧的 Auth schema 冲突只对之前的全量平台 schema 导入路径成立；本地当前版本下，保留平台 schema、只还原 MMWR 定制和数据的方式已验证。**仍有保真阻塞：** 对象经 Storage API 重传后 `storage.objects.owner_id` 为 NULL 且更新时间重新生成；MMWR 删除保护与缩略图保护会读取 owner/path，需进一步验证所有证据引用、权限和恢复后保护语义。演练后已按精确 project ID 停止隔离栈，并确认目标容器和 Docker volumes 全部清除，源开发数据库仍运行。该结果仅适用于本地 Supabase CLI 2.118.0 / PostgreSQL 17；R2、跨版本、原子 DB+Storage 时间点一致性、Auth 登录与应用授权、Staging/RPO/RTO 均未验证。Phase 7 仍未完成，备份/恢复 gates 保持 OFF。详见 `docs/architecture/PHASE7_BACKUP_DESIGN.md` 与 `docs/operations/PHASE7_STAGING_ACCEPTANCE.md`。

**Phase 6 / 7 当前本地验证复跑（2026-10-05）：** `npm run test:local` 通过，含 26 个 pgTAP 文件 / 637 条断言及 Supabase db lint（无 schema errors）；默认执行中 3 个需要 opt-in 隔离服务的备份用例和 2 个真实 ClamAV 用例按配置跳过。`npm run lint`、`npx tsc --noEmit` 通过；`npm audit --omit=dev` 报告 0 vulnerabilities。`git diff --check` 通过，只有工作树 CRLF 转换提示。该结果是本地检查，不包括 GitHub CI、Staging 或 Production 验证。

**Phase 7 恢复后缩略图删除保护回归（2026-10-06）：** 扩展 `supabase/tests/account_deletion_worker.test.sql`，新增已恢复的 orphan thumbnail 合成对象：其 Storage `owner_id` 为空、对象路径仍以 uploader UUID 开头，且没有关联 `evidence_metadata`。回归确认旧 worker 的领取阶段会把账号带到最后授权检查点，而最后检查再次按对象路径发现缩略图并拒绝 Auth 删除、转入 `evidence_owned` Owner review。定向 pgTAP 30/30 通过；完整 `npm run test:local` 通过：27 个 pgTAP 文件 / 681 项断言，Node 测试无失败（3 项隔离 DB/Storage 恢复及 2 项真实 ClamAV 测试按默认设置跳过），数据库 lint 无 schema errors。测试事务回滚后本地 8 个 runtime flags 均为 false。此证据只覆盖恢复对象 owner 缺失时的账号删除安全兜底，不验证 restored object 读取权限、已关联 evidence/thumbnail 的完整映射、时间戳保真、R2、跨版本或 Staging；Phase 7 仍未完成。

**Phase 7 联合恢复引用完整性检查（2026-10-06）：** 数据库目标适配器新增只读交叉检查，要求每条 `private.evidence_metadata` 的原始证据路径在 `mmwr-evidence-quarantine` 存在、非空 thumbnail 路径在 `mmwr-public-thumbnail-derivatives` 存在，并在 `uploaded_by` 有值时验证两条路径仍以对应 UUID 开头；opt-in DB+Storage 恢复用例现会准备一条合成投稿证据记录、在两个私有桶放入对应合成对象，恢复后核对路径、字节与交叉引用，并在测试清理钩子中删除合成数据库记录和对象。`npm run test:backup` 48 项通过、3 项隔离恢复默认跳过；当前改动后的 `npm test` 通过，目标 ESLint、语法与 diff 检查通过。最新 `npm run test:local` 的 Node 阶段通过，但 Supabase CLI 的 pgTAP 阶段因 Docker Desktop 引擎未启动、`127.0.0.1:54322` 拒绝连接而中止；此前一次完整本地运行曾通过 27 个 pgTAP 文件 / 681 条断言及 DB lint。开发库证据与缩略图引用为 0，live 查询通过仍是空集结果；新加入的非空联合恢复夹具本轮未实际运行。Docker 引擎恢复后仍需在明确隔离目标运行 opt-in 演练。备份/恢复门继续 OFF，Phase 7 仍未完成。

**Phase 7 备份恢复套件复核（2026-10-06）：** 本轮在当前工作树重新运行 `npm run test:backup`：51 项中 48 通过、0 失败、3 项需显式启用的本地隔离恢复测试跳过。新增只读证据/缩略图引用检查的适配器测试通过，但不等同于对非空数据执行恢复。当前 `docker info` 无法连接 Docker Desktop Linux engine，因此没有尝试重启/创建 Supabase 栈；联合 DB+Storage 夹具仍待引擎可用后执行。未连接托管服务，所有备份/恢复 gates 保持 OFF。

**Phase 7 本机 Docker 启动故障诊断（2026-10-06）：** 本机 Docker Desktop GUI/backend 进程存在，但 `docker-desktop` WSL 发行版为 Stopped，Linux engine pipe 缺失。按已授权的本地测试需求执行 Docker Desktop `start`（返回已在运行）、`wsl --shutdown` 和 `restart`；重启未成功，backend 日志报告 Secrets Engine 无法重命名 `%LOCALAPPDATA%\docker-secrets-engine\engine.sock` 为 `.stale`（系统提示无法访问文件），WSL 发行版仍为 Stopped。只读确认该路径是 Windows reparse-point，未能读取该 socket 的 ACL；没有删除/改名它、没有清理 Docker 数据、没有选择恢复出厂设置。需先在本机恢复 Docker Desktop Secrets Engine/WSL 启动，再执行 opt-in 隔离恢复；期间未访问任何托管环境或改动数据库/功能门。

**当前工作树回归复核（2026-10-06）：** Docker 不可用期间，重新运行完整 `npm test`，全部默认 Node 测试组通过；7 个显式 opt-in 的本地 Supabase/Storage 与真实 ClamAV 集成用例按默认配置跳过。`npm run lint` 与 `npx tsc --noEmit` 通过。该复核不覆盖 pgTAP/数据库 lint、完整 production build、非空 DB+Storage 联合恢复或 Staging/Production；未改功能门或服务环境。

## Phase 8 — 三环境与逐步上线

**Phase 8 CI 工作流静态校验（2026-10-05）：** 用本机已有 YAML parser 解析 `.github/workflows/ci.yml`，并断言 push/PR 触发、`contents: read` 权限、concurrency、固定 SHA 且带版本注释的 Actions、ClamAV 固定 digest、密钥扫描/生产依赖审计/lint/TypeScript/本地 Supabase 与 pgTAP/db lint/production build 步骤、ClamAV `always()` 清理，以及无部署动作或 GitHub secrets 引用。解析和断言通过；未运行 GitHub-hosted workflow，也未改文件或连接外部服务。

- [ ] 建立 GitHub 仓库/保护分支/CI；只将代码与非敏感示例变量提交。不要把密钥、真实证据、个人数据放 Git。新增 `.github/workflows/ci.yml` 本地 CI 定义：只读仓库权限，固定 SHA 的官方 checkout/setup-node，checkout 不保留凭据并获取完整 Git 历史，依 `.nvmrc` 安装锁定 Node，运行 Gitleaks 历史/工作树扫描、high/critical 生产依赖审计、ESLint、TypeScript、本地 Supabase + pgTAP/db lint 与隔离 production build；无 secrets、无部署步骤，并抑制本地 Supabase 启动输出以免把本地密钥写进 Actions 日志。**本机复跑（2026-10-05）：** Supabase 本地服务启动、lint、TypeScript、`npm run test:local`、隔离 production build 均通过；Node 测试 140 项通过、默认模式下 2 项真实 ClamAV 测试跳过，pgTAP 25 文件 / 610 断言通过，数据库 lint 无错误。生产依赖审计报告 0 项 high 级别漏洞；Gitleaks 扫描 29 个 Git 历史提交与工作树，0 发现；开发 lint 工具链仍有未修复上游公告，详见 Phase 6。工作流尚未推送或在 GitHub 执行，仓库/分支保护与托管 CI 结果仍未验收。
  **真实扫描器 CI 增量（2026-10-05）：** 工作流现额外启动固定 SHA-256 的 ClamAV 1.4.6 daemon，仅绑定 `127.0.0.1`，通过 clamd PING 等待签名库就绪后运行真实 daemon 的扫描器测试，并用 `always()` 步骤停止临时容器。本机使用相同镜像、同一 readiness helper、临时回环端口复跑 7/7 通过；运行后容器移除且端口关闭。GitHub-hosted runner 尚未运行此工作流；超时/镜像拉取与托管 Actions 结果仍未验证。
  **依赖更新监视准备（2026-10-05）：** 新增 `.github/dependabot.yml`，每周检查 npm 与 GitHub Actions 更新，单生态最多 5 个开放更新 PR。此文件需进入 GitHub 默认分支后才会开始托管监视；本地尚不能证明 Dependabot 已运行或已处理当前开发依赖公告。
  **本地回归更新（2026-10-05）：** 当前工作树重新运行 `npm run test:local`，155 个 Node 用例中 153 通过、2 项真实 ClamAV 按默认模式跳过；26 个 pgTAP 文件 / 635 条断言通过，数据库 lint 无 schema 错误。另用 CI 固定 digest 的临时 daemon 重跑扫描器，15/15 通过，容器和 `127.0.0.1:3310` 监听均已清理。全仓 ESLint（0 错误/警告）、TypeScript、38 路由隔离 production build 与 `git diff --check` 通过；Supabase Advisor 无问题；`npm audit --omit=dev` 为 0 漏洞。完整开发依赖审计仍报 5 项 high，均经 ESLint/Next lint 开发链传递引入；自动修复建议降级 Next lint 配置至 14.2.35，与当前 Next 16 不兼容，暂未强制更改。当前 102 个迁移文件，最新 `20261005150000` 已在本地迁移链；8 个本地 runtime flags 全部 false。没有运行 GitHub Actions 或访问 Staging/Production。
- [ ] 建立 Development、Staging、Production 三份独立 Supabase/Vercel/Storage/Secrets。Staging 用合成数据、密码/访问控制、robots noindex；不能复制真实敏感证据。
- [ ] 用户将安排域名购买；注册域名不是首轮受保护 Staging 的前置条件，可先使用稳定的 Vercel HTTPS 主机名，或只为 Staging 配置专用子域名。自有正式域名与 Production DNS 在 Staging 验收及回滚准备完成后再逐步设置；不得提前切流。用户已授权在服务就绪后部署到网上测试。优先建立受访问控制且 noindex 的 Vercel Staging/Preview，连接独立 Supabase Staging 与合成数据；明确 Staging 主机名、Auth 回跳、环境变量和部署目标后再操作。准备步骤见 [`docs/operations/VERCEL_STAGING_PREPARATION.md`](docs/operations/VERCEL_STAGING_PREPARATION.md)。注册域名或部署 Staging 不代表 Production 切流授权。
- [ ] 每个 Supabase Auth 环境关闭原生邮箱确认，并将本站 PKCE `/auth/callback` URL 加入精确 Redirect URL allowlist；MMWR 投稿权限由自有邮箱验证流程控制。不得为了原生确认方便而阻止未验证用户阅读或 Reaction。
- [ ] 确认迁移版本、回滚策略、备份基线、生产环境变量、域名与 DNS 计划；先部署 Staging 验证。
- [ ] Codex 在准备好清单、截图/步骤、验证条件后暂停，让用户逐一操作：GitHub → Supabase → Vercel → SMTP → Cloudflare/R2 → GA4 → Search Console/Bing → Domain/DNS → Production 验证。每步等用户反馈完成，再发下一步。
- [ ] GA4 事件/同意检查，Search Console 与 Bing Webmaster 验证，提交 sitemap；仅在正式域名准备后启用公开索引。
- [ ] Production 首次上线采用可回滚流程；用户最后授权切流后验证 HTTPS、DNS、邮件、存储、地图、SEO、WAF、备份。说明最终状态与仍未完成配置。

**完成交付要求：** HANDOFF、MASTER_PLAN、USER_MANUAL 已按实际实现更新；环境变量模板/架构说明/运行部署说明已就位；所有失败和未完成项有负责人/后续动作；Codex 在任何未完成第三方配置前停下并带用户逐步操作。

---

## Launch Checklist（上线前必须全部核对）

### 环境与发布

- [ ] Dev / Staging / Production 项目、数据库、Storage、域名、密钥分离；Staging 有访问限制和 noindex。
- [ ] GitHub 有保护分支、CI 与迁移回滚方案；仓库无 Secret、备份、真实证据或用户数据。
- [ ] Production DNS/HTTPS/证书/域名状态由用户核实，回滚方案可用。

### 安全与访问控制

- [ ] Supabase 每张敏感表 RLS 开启并按角色/所有权验证；匿名/API/普通用户无法读内部投稿、证据、商业资料。
- [ ] Owner/Admin 强制 TOTP 2FA；离线恢复码一次性展示、服务端安全存储；工作人员后台 15 分钟闲置 / 8 小时绝对 Session 与敏感操作重新验证须通过 Staging 验收。
- [ ] Rate Limit、Turnstile、WAF、异常登录/爬虫规则已配置且不误挡 Google/Bing 正常抓取。
- [ ] Turnstile 每环境 sitekey/secret 由用户录入 Secret Manager；Staging 验证 Siteverify 单次令牌、预期 action/hostname、密钥缺失/服务超时 fail closed 及 CSP 兼容性。
- [ ] 搜索 RPC 无 anon/authenticated 执行权限；每环境的 Supabase Secret Key 与独立 HMAC 限流密钥已安全配置；Staging 验证每分钟/每小时限额和 Vercel/Cloudflare 代理下的来源 IP 识别。
- [ ] CSP、安全 Headers、CSRF/XSS/SQLi/开放重定向、上传校验、私有 Signed URL、依赖漏洞与 Secret 扫描通过。
- [ ] 内部证据仅后台角色可读、仅 Owner 改可见性；阅读动作审计；无缩略图、搜索、分享图、日志或导出泄漏。
- [ ] Emergency Hide/封禁/解封/申诉/Incident Response 已演练；Audit Log 记录操作者、原因、前后状态。
- [ ] 数据处理、真实人物内容、隐私告知、投稿和撤下流程已交马来西亚律师审阅；未审项目明示未完成。

### SEO 与隐私

- [ ] SSR 页面、metadata、canonical、hreflang、robots、sitemap、结构化资料均检查。
- [ ] 仅审核通过且公开帖子、允许的 Tag/City 页进入索引；内部/待审/后台/账号/历史版本 noindex 且不入 sitemap。
- [ ] 注册墙被结构化标记，无 cloaking；若搜索引擎不支持该呈现，索引仅公开预览片段。
- [ ] 隐藏时立刻 noindex/移 sitemap；恢复后重新发布流程正确；永久删除时公开 URL 去内容并移除索引。
- [ ] 18+ Gate、Cookie Consent 生效；Analytics/Advertising 未获得选择同意前不加载非必要追踪。
- [ ] Search Console 与 Bing Webmaster 账号验证、站点所有权和 sitemap 提交由用户确认。

### 备份与恢复

- [ ] 数据库 + Storage 每日备份写入独立 R2；7 日/4 周/6 月轮替正确。
- [ ] Owner 手动备份、完整性校验、失败通知和 Critical Owner Email 均已验证。
- [ ] 有加密、最小权限、密钥轮换、备份不可轻易被 Production 凭证删除等保护。
- [ ] 隔离环境完整恢复演练成功，RPO/RTO 已记录，生产恢复不会未经确认覆盖数据。

### 产品与运营

- [ ] 投稿、预览、终审声明、字眼辅助扫描、Owner 高风险复核、Admin 审核、版本对比全通。
- [ ] 地图边界与地区名单来源/许可核实，点选、Pin、统计、City 列表一致；用户已选择并授权本地接入 geoBoundaries 2020 ADM2 的 159 条 District feature，署名区注明 geoBoundaries、City Population 与 CC BY 3.0，缺失的独立 Putrajaya District 按用户决定并入 Kuala Lumpur 组合显示；目录/迁移、地区地图线及静态空间检查已在本地完成。仍需处理“City”与“District”语义差异、159/160 上游元数据差异和 City Population 来源许可适用范围；MyGeoportal/PLANMalaysia 官方替代数据没有获得使用授权且没有导入。完整证据见 [`docs/geo-boundary-source-review.md`](docs/geo-boundary-source-review.md)。
- [ ] 搜索只返回公开内容；相似名称清晰分开；姓名拼写相近不误归同一对象。Staging 应应用 `20260928133200_mmwr_similar_name_recommendations.sql`，检查 pg_trgm 可用、索引选择及实际数据量查询性能。
- [ ] 登录墙登录/注册回原页与原位置；邮箱未验证可阅读/Reaction，不能投稿。
- [ ] 账号删除 7 日取消路径、处罚权限、Telegram 草稿和申诉流程核对。
  - 账号删除申请/取消 UI 与七天数据库状态已在本地实现。2026-10-04 用户确认：到期时账号只要仍有关联证据对象，就暂停自动删除并进入 Owner 人工审核。依此新增默认 OFF 的清理 Worker、数据库安全 claim、Owner 只读审核队列和账号状态提示；仅无对象且无证据元数据的账号才会尝试 Auth 删除。Auth 删除失败也转人工审核，不自动循环。迁移未应用、Worker 未运行、未配置调度、无本地合成数据验证或 Staging/Production 验证；证据的删除/转移/保留决策仍需后续单独确认。详见 [`docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md`](docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md)。
- [ ] 反馈/举报私有保存、每账号限额、Owner/Admin 的 2FA 审阅授权和处理审计验证；确认 Telegram 联系入口由用户手动选择，且不会自动发送或泄露用户填写的内容。
- [ ] 角色权限确认 Admin 看运营分析但看不到客户、报价、收入和预算；Owner 控制广告及商业资料。
- [ ] 广告、自动翻译、视频、VIP/评论、草稿等默认 OFF；广告 OFF 时不留空白版位。
- [ ] 三语言 UI、Light/Dark、手机双栏列表、键盘与读屏访问、性能回归通过。

### 状态记录

- Launch decision：`未批准 / 可进入 Production 验证 / 已由用户批准上线`
- Codex 本地验证：
- Staging 验证：
- 用户完成的第三方服务配置：
- 尚未解决的 P0/P1：
- Production 验证证据：
- 最终操作者/日期：

## Codex 必须停下并逐步引导用户的边界

在应用代码、迁移、配置项、Checklist、服务验证步骤准备好之前，不要求用户先配第三方。完成本地实现和 Staging 准备后，停下来简明汇报当前已完成和待用户操作，然后每次只带用户完成一项：GitHub → Supabase → Vercel → SMTP → Cloudflare/R2 Backup → GA4 → Google Search Console/Bing → 正式域名/DNS → Production 端到端验证。不得索要密码/API Secret；让用户粘贴进各服务 Secret Manager。每完成一项，确认状态及证据，再继续下一项。正式上线必须等用户最后明确确认。

**Phase 3 高风险开关静态复核（2026-10-01）：** 本地样板中账号删除、Analytics 双开关、IP 封锁、证据扫描/预览/可见性、投稿发布及关键安全邮件均明确为关闭；相应数据库 runtime flag 和 Authenticator IP 检查设置在迁移中也以关闭初始化。服务端入口仅在环境变量精确为 `true` 时启用。此复核只证明样板与迁移源码的默认值，不代表任何数据库或 Staging 当前状态；详见 HANDOFF。

**Phase 3 发布开关与目录状态并发修正（2026-10-03）：** 静态复核发现审核发布 RPC 对数据库发布开关、地区和 Tag 只作普通读取，可能在读取后、写入公开帖前被并发关闭或停用。现于仍未应用的 `20260930140000_reviewed_submission_publication.sql` 对资料读取、Tag 列表和发布事务中的发布开关复核使用 `FOR SHARE`，并在同一发布事务内锁定结构化 intake/活动地区与被选中的活动 Tag；Tag 按 UUID 排序获取锁。由 PostgreSQL 行锁规则，相关 `UPDATE`/`DELETE` 会等持锁事务结束；若停用先提交，发布须拒绝且不产生任何写入。Staging 验收和回滚表已记录双顺序竞态及固定锁顺序。此次为源代码与验收文档修正，未运行测试/PostgreSQL、未应用迁移、未连接外部环境；仍须按既定顺序先完成 UI 验收，再执行本地测试和 Staging 验收。

**Phase 3 关键安全邮件并发修正（2026-10-03）：** 静态复核发现邮件完成 RPC 的过期判断可能在等待 outbox 行锁之前评估，Owner 关闭开关也可能与入队/领取或恢复码计数并发；另有分开的 `INSERT DO NOTHING` 与 `SELECT FOR UPDATE` 在清理或成功恢复并发删除计数行时漏计的风险。现于仍未应用的队列与恢复码迁移中：finish 在获取 outbox 行锁后再次以 `clock_timestamp()` 检查五分钟租约；入队、领取及恢复码 Hook 在读取开关时对同一 runtime-flag 行加共享锁，与 Owner OFF 的排他锁串行化；恢复码计数以原子 upsert 取得并返回当前行，再于锁后采样 `clock_timestamp()`；OFF 获胜时等待中的生产者不新增计数/事件/待发项或领取任务，生产者获胜时 OFF 等待后清空待发项及所有短期恢复码计数，因此之后重开从空窗口开始。已经返回 dispatcher 的 claim 仍属在途，不能由开关撤回。Staging 清单包含过期锁等待、计数重置与双顺序开关并发验收。仅静态源码与文档修正，未运行 SQL/测试或连接邮件服务；关键邮件策略和 dispatcher 仍保持关闭。

**Clarification V1 本地实现（2026-10-03）：** 用户确认沿用现有帖子模型，并增加独立 `story/clarification` 类型与一对一私有关系表；原帖与澄清帖分别保留 UUID、版本、Reaction 和生命周期。Admin/Owner 工作台、三语 `/clarifications` 目录与详情、反向提示、搜索/标签徽标、Telegram 本机草稿入口及审计/Owner 撤下流程已写入本地。公开澄清发布数据库开关初始 OFF；`.env.example` 中 Telegram URL 为空；投稿入口、附件上传/公开读取和 Production 索引均不因此启用。普通 Latest/Hot/首页 Tag 统计/地区列表仍限原帖；若 Owner 隐藏原帖但保留澄清，投影与登录正文会显示中性不可用提示，不再暴露原帖链接/标识或澄清原始文字。Phase 3 UI review、Staging acceptance 与迁移回滚资料已补入 Clarification 专项检查；它们仍是计划，不代表检查已执行。源码复核另明确拒绝 Owner 撤下决议 RPC 的 NULL 决议值，避免 SQL 三值逻辑误将它作为未决记录写入审计；创建/修订澄清时也按 UUID 顺序共享锁住活动标签，防止与标签停用并发接受已失效标签；主要写入时间改为在行锁与权限重验后采样，避免长锁等待令事件时间早于实际提交动作；Admin 撤下提议现在也会锁定 Mother/关系并锁后复核角色与 TOTP。相应 Staging 负向与并发步骤已补入。迁移未应用；尚未执行任何测试、构建、数据库/浏览器验证；本地 UI 待用户验收后再进入验证阶段。本功能不表示申诉、更正或法律撤下渠道开放，也不代表 Staging/Production 就绪。

**Clarification 原帖隐藏时的界面隐私修正（2026-10-03）：** 若 Owner 选择保留澄清但隐藏原帖，目录卡片和详情页改为仅显示三语中性不可用状态，不渲染数据库的占位标题/名称/地区、摘要、标签、正文、Reaction 或分享控件；详情 metadata 改用本地化通用文案并省略结构化文章数据。Phase 3 Staging 验收清单新增逐项呈现检查。该代码与文档仍待用户 UI 验收；未运行测试、构建、数据库或浏览器验证。

**澄清目录易读性与本地演示卡片（2026-10-03）：** 目录中文标题改为「真相页」，英文/马来文标题与导航同步更新；三语副标题说明内容是经审核的补充信息，不代表官方裁定或争议的最终结论。Development 页面加入一张无真实人物、企业、事件、地区、计数或虚构详情链接的静态演示卡片，醒目标为“本地界面演示 · 非真实帖子”；卡片只在非 Production 的第一页呈现，不写入数据库、不进入 metadata/sitemap。仍待用户 UI 检查；未运行测试、构建或浏览器验收。

**Phase 3 回滚清单文件核对（2026-10-03）：** 静态比对当前 `20260930`、`20261001` 与 Clarification 两份 `20261003` 迁移文件和 [`PHASE3_MIGRATION_ROLLBACK.md`](docs/operations/PHASE3_MIGRATION_ROLLBACK.md)，48 个范围内文件各有一条说明，无漏项或范围外行。此为文件名清单核对，不验证 SQL 或回滚步骤；迁移仍未应用。

**Phase 3 默认关闭项源码核对（2026-10-03）：** `.env.example` 将账号删除、IP 封锁、附件扫描/后台预览/Owner 可见性、投稿发布、关键安全邮件和 Clarification 发布开关设为 `false`，Telegram URL 留空；对应数据库初始化将 account deletion、submission risk、staff evidence preview、Owner evidence visibility、submission publication、critical security email 与 clarification publication 设为 `false`，PostgREST authenticator 的 IP-block 开关同样初始化为 `false`。只核对模板和迁移源码，未读取任何环境 Secret 或数据库状态，也未应用迁移。

**澄清页 UI 验收与本地验证（2026-10-04）：** 用户认可 `/zh-cn/clarifications` 当前标题、说明和本地演示卡片，并要求继续。当前全仓 ESLint 退出码 0（3 项既有 warning），`npx tsc --noEmit` 通过，Next.js 16.3.6 production build 编译并生成 38/38 页面；本地澄清页请求返回 HTTP 200，含「真相页」与演示标记。构建使用独立 `.next-validation` 输出目录以保留开发服务器；目录已加入 Git/ESLint 忽略。无 `npm test` 脚本；pgTAP 文件存在，但本机没有 Docker/Podman，因此未能启动本地 Supabase/PostgreSQL 或运行 SQL 测试，迁移未应用。当前没有 Supabase 项目链接/本地连接变量或 Vercel CLI；Staging/Production 均未连接。进入下一步需要本地容器环境和用户完成的隔离 Supabase/Vercel Staging 配置；不得把当前构建结果当作数据库或线上验收。

**投稿关闭策略与旧 pgTAP 对齐（2026-10-04）：** 更新 `supabase/tests/content_access.test.sql`，移除“已验证用户可投稿/补充资料”的过时成功预期；权限断言改为 authenticated 无 `create_submission`、`append_submission_information`、`register_submission_evidence` 执行权，并以 SQLSTATE `42501` 验证不同账号无法调用关闭中的写 RPC。测试计划数维持 53。因缺少本地 PostgreSQL/Docker/Podman，这些 pgTAP 断言尚未运行。

**Clarification 迁移静态安全复核（2026-10-04）：** 静态审查 `20261003130000_mmwr_clarification_system.sql` 与 `20261003131500_mmwr_clarification_dashboard_widget.sql`，未确认可报告的安全漏洞。已检查私有表权限、发布默认关闭、公开投影脱敏、Staff/Owner RPC 授权与 TOTP 检查，以及角色限定的 Dashboard widget 列表。扫描范围虽绑定整个 `supabase/migrations`（76 个文件），实际源码审查按既定范围只读这两份澄清迁移，其他 74 份未覆盖，因此结果标为部分覆盖；没有独立扫描代理。未应用迁移、连接数据库、运行 SQL 测试或核对 Staging/Production 状态。完整边界见 Codex Security 扫描报告。

**公开投稿结构化资料本地续进（2026-10-04）：** 公开帖子详情页仅在受索引总开关控制时输出中性的 `CreativeWork` JSON-LD；不使用 `Article` / `NewsArticle`，避免将未经证实的用户陈述包装成编辑性新闻。字段只来自公开投影中的审核标题、公开摘要、当前语言和规范 URL；不输出登录墙正文、个人资料、证据或未经核实的发布时间。索引总开关关闭或内容不可用时不输出结构化资料。详情页仍保持 noindex，此改动不开放搜索索引，也不改变 Sitemap。尚未执行验证；Schema Markup 与真实爬虫检查留待 UI 验收后统一执行。

**Owner IP 自我封锁防护（2026-10-04）：** Owner 创建封锁动作先验证后台权限与近期 TOTP，再要求当前请求存在可解析的可信客户端 IP；来源缺失或无效时不写数据库，也不写审计。目标指纹匹配当前访问地址时拒绝创建。三语后台提示和 Phase 3 Staging 清单已同步；此为本地 fail-closed 修正，没有运行测试或应用迁移，IP 封锁保持关闭。

**Owner IP 配置状态文案校准（2026-10-04）：** 后台 readiness 字段改为 `configured`，只表达所需环境值齐全，不再命名为已就绪；中/英/马来文说明明确它不能证明代理头可信或无法绕过。配置项齐全状态改用警示色，Phase 3 UI 检查清单同步要求验看这项文案和视觉状态。未运行 UI/浏览器验证，拦截仍 OFF。

重命名后的静态引用复核发现 `getTrustedClientIpAddress()` 仍读取旧的 `ready` 字段，已改为读取 `configured`；Proxy、后台动作与请求头解析器现统一使用新字段名。源码引用检查未发现旧字段残留。未运行测试或浏览器验证。

**Owner IP 多值转发头 fail-closed 修正（2026-10-04）：** `getTrustedClientIpAddress()` 现在只接受配置头中的单个合法地址，遇到逗号分隔的代理链、缺失或非法地址时返回不可用，不再猜测第一个值。新增未应用迁移 `20261004160000_owner_ip_block_reject_header_chains.sql`，在 PostgREST/Data API 检查中同样拒绝缺失或逗号分隔的 IP 头，再调用既有单地址 inet/HMAC/封锁逻辑；它只允许从已知旧 hook 安全替换，否则停止迁移。Phase 3 Staging 与回滚清单已补入多值头 503、无数据/审计副作用和 hook 恢复步骤；迁移清单总数更新为 48。没有运行 SQL、测试、构建、浏览器或托管环境操作；Next.js 与数据库 IP 封锁开关仍 OFF。

**Owner IP 写入 RPC 自我封锁绕过修正（2026-10-04）：** 静态复核发现旧三参数 `owner_add_ip_block` 可由已认证 Owner 直接调用，绕过 Next.js Server Action 的当前地址比较。新增未应用迁移 `20261004050521_owner_ip_block_database_self_block_guard.sql`，撤销旧 private/public 三参数 RPC 的客户端执行权，要求短时服务端 HMAC proof 绑定 actor、目标指纹、理由、到期与签发时间；数据库在 advisory lock 及清理之后重新核验权限/proof，并从当前 PostgREST 请求头重新计算调用者指纹，防止签发后地址改变或 proof 重放造成自我封锁。Server Action 仅向 PostgREST 转发已验证的 ingress 地址，不向 Auth、Storage 或浏览器传递该值。验收/回滚文档增加直接旧 RPC 拒绝、proof 正负向、锁等待和头部隔离检查；Phase 3 迁移清单更新为 49 项。未运行 SQL、测试、构建、浏览器或托管服务操作，IP 封锁保持关闭。

**账号删除证据保护流程（2026-10-04）：** 用户确认：七天到期时，只要账号名下仍有任意证据对象，就暂停自动删除并要求 Owner 人工审核。新增未应用迁移 `20261004053425_mmwr_safe_account_deletion_worker.sql` 与一次性 `account-deletion:once` Worker：环境 cleanup gate 和数据库 cleanup flag 均默认 OFF，数据库还要求申请 gate 开启；只领取已过七天的普通账号，使用 30 分钟 claim lease，并在返回 Auth UUID 前检查 Storage `owner_id`、上传 UUID 路径及 `evidence_metadata.uploaded_by`。存在对象/元数据或 Auth 删除失败时账号转入 `deletion_review_required`，证据与元数据不变，Owner 只读审核队列要求 Owner 身份和近期 TOTP；没有移交、删除或自动重试入口。Storage 上传检查以 Profile 共享锁与删除 claim 串行化，非 active 账号不能继续上传。回滚/验收文档与三语账号提示已更新，Phase 3 迁移盘点为 50 项。当前未运行测试、构建、浏览器或 SQL，未应用迁移、未连接/操作托管环境、未运行 Worker 或配置调度；先完成 Phase 3 UI 验收，再进入本地验证和获批的隔离 Staging 验收。详见 [`docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md`](docs/operations/ACCOUNT_DELETION_EVIDENCE_POLICY.md)。

**本地整站验证续记（2026-10-04）：** 用户确认当前 UI 满意后，修复两处 TypeScript 错误、三个加载 effect lint 错误，以及地区图 CSS Module 未绑定造成州形状无样式的问题；District 线现已在地区浏览页本地可视。重新验证：`npm run lint` 0 errors、2 warnings；`npx tsc --noEmit` 通过；独立 `.next-validation` 目录的 `npm run build` 通过并生成 38/38 路由；编译后的本地生产预览三语主要页面 48/48 返回 HTTP 200。另核对本地四项安全响应头、简体中文 `<html lang>`、默认 noindex、`robots.txt` 与 sitemap 路由均符合本地预期；District 数据文件为 15 个、159 features。Lint 剩余两条警告位于 StaffSubmissionQueue 清理逻辑与 staff-session 导航。`package.json` 没有 JS test 脚本；SQL pgTAP 因本机没有 Docker 可执行文件而未运行。全量 `npm audit` 发现 dev-only 工具链中的 `braces <= 3.0.3` 高危公告（由 `eslint-config-next` 链路引入），上游尚无修复版本；`npm audit --omit=dev` 为 0 vulnerabilities。`npm audit fix --force` 会把 ESLint 配置降到 14.2.35，未采用。跟踪 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/ghsa-vfj7-8cjw-p6xm)，等上游兼容版本后更新。未连接 Supabase/Vercel 或任何真实服务器；迁移、RLS/权限和数据库行为仍须待本地 PostgreSQL/隔离 Staging 环境验证。

### 本地测试继续：Clarification 与应用检查（2026-10-04）

新增澄清权限 pgTAP：检查发布开关默认关闭、Owner/Admin 权限差异、近期 TOTP、追加式审计、工作人员草稿/发布流程，以及匿名读取时仅返回脱敏澄清投影和已发布原帖关联。测试使用合成账号/帖子并在事务结束时回滚。整套本地测试现为 **7 个文件、157 条断言，全部通过**。本地数据库 lint 退出码 0，有 7 条未读取锁结果变量提示；Supabase Advisor 无问题；本地迁移链已应用至 District/布城合并迁移。应用层 `npm run lint` 通过（2 条既有警告），TypeScript 检查通过，隔离目录 production build 成功并生成 38 条路由。仅本地验证；没有连接托管 Supabase、Vercel、Staging 或 Production。UI 人工验收、其余 RLS 边界矩阵、外部服务集成及部署检查仍未完成。

**本地测试续进：账号删除与举报审核（2026-10-04）：** 新增账号删除 Worker 与举报反馈 pgTAP，覆盖默认关闭、七天取消边界、Service Role 权限、证据转 Owner 人工复核、Auth 删除一次性检查点、超时不重试、Owner/Admin 队列隔离、Turnstile 后的服务端写入边界、每小时五次限额和 MFA 审核。测试发现 `private.user_report_audit` 缺少数据库层不可变保护；新增 `20261005110000_mmwr_report_audit_append_only.sql`，禁止修改/删除/截断，只允许 Auth 删除时将 `actor_user_id` 置空且其余审计字段不变。回滚及 Staging 清单已同步。重建本地数据库应用该迁移后，整套 pgTAP 为 **9 个文件、202 条断言，全部通过**；所有测试夹具事务回滚。账号删除 Worker/真实 Auth 删除未运行，未连接托管环境。

**本地测试续进：Owner IP 封锁边界（2026-10-04）：** 新增 `owner_ip_block.test.sql`，在回滚事务内创建合成 Vault HMAC 密钥，验证旧 RPC/客户端探测权限关闭、伪造 proof、逗号代理链和自我封锁均被拒绝，并验证有效的非自身地址只写一条封锁与审计记录。真实访客拦截开关保持 OFF。全套本地 pgTAP 现为 **10 个文件、215 条断言，全部通过**；报告审计不可变迁移已应用到本地测试库，所有测试夹具回滚。Phase 3 回滚清单涵盖 60 个迁移文件；未连接或改动托管数据库。
**Phase 3 安全审查修正与本地针对性验证（2026-10-04）：** 完成一次 7 个风险面、411 文件清单中部分源码已读的静态审查，报告 3 项本地来源发现；覆盖标为 partial，不代表全仓或托管验证。发现的 Auth CAPTCHA 缺口已改为 Supabase Auth 原生 Turnstile 校验，登录、注册和找回密码向 Auth 传递一次性 challenge token，避免同一 token 被应用预先消费；本地 `[auth.captcha]` 默认启用且从根 `.env` 读取服务端密钥。Latest/tag/地区/城市公共列表在共享数据加载器限制到最多 1,000 页、每页最多 12 条，超界不查询数据库。新增 `20261004131427_clarification_audit_actor_anonymization.sql`，仅允许保留的澄清审计在 Auth 删除时将 actor FK 置空且其他字段完全不变；pgTAP 保留任意编辑/删除拒绝并验证 Auth 删除后审计留存。对应 Clarification pgTAP 本地 21/21 通过，分页纯逻辑测试 2/2、针对文件 ESLint、`npx tsc --noEmit` 均通过。新迁移已应用到本地测试数据库；Auth/Kong 容器当前没有运行，Turnstile Secret 也未配置，故 Auth 原生 CAPTCHA 集成尚未运行验证。未做全站测试/验收、未连接托管服务；扫描与修复详情及验收边界见 `HANDOFF.md`、Phase 3 rollback/Staging 清单。

**Phase 3 当前工作树本地回归复跑（2026-10-04）：** 本地 pgTAP 全套 21 个文件 / 455 项断言通过；备份 12/12、公开分页 2/2、District 地图数据 4/4、扫描器默认模式 5/5 通过（两项真实 ClamAV 检查按需运行，本轮跳过）。ESLint 0 错误、2 条既有警告；TypeScript 通过；以独立输出目录构建成功并生成 38 条路由；数据库 lint 退出码 0、保留 7 条未读取锁变量警告；`http://127.0.0.1:3000/zh-cn` 返回 200。`tsconfig.json` 已还原为构建前形态，隔离构建目录加入本地忽略。未连接托管 Supabase、Vercel、Staging 或 Production。UI 最终验收仍待产品负责人查看；本地 Supabase 重启后 Auth/Kong 均健康（Auth health HTTP 200）；Auth 报告 Turnstile 已启用，但运行时 Secret 是未展开的字面表达式 `env(TURNSTILE_SECRET_KEY)`，没有注入真实服务端密钥；前端 Site Key 缺失，故 CAPTCHA 端到端仍未实测。Vector 日志容器因 Docker 网络不可达而不健康。所有高风险功能维持关闭。

**Phase 5 本地默认关闭路径 smoke check（2026-10-04）：** 向本地 `/api/analytics/page-view` 与 `/api/analytics/valid-read` 各发送一次合成 JSON 请求；两个入口均在功能开关关闭时返回 HTTP 204，并在创建 Supabase 客户端前直接退出，因此没有写入事件。该检查只验证默认关闭边界，不启用分析、不验证授权收集流程，也不代表 Staging/Production 行为。
**Phase 3 当前工作树本地验证复跑（2026-10-04）：** 当前分支 `codex/mmwr-plan` 的 21 个 pgTAP 文件 / 455 条断言通过；备份 12/12、扫描器隔离测试 5/5（两项实机 ClamAV 在无 daemon 的默认模式下跳过）、地图 4/4、分页 2/2 通过。ESLint 0 errors / 0 warnings，TypeScript 通过，隔离 Next.js production build 成功生成 38 条路由；构建自动修改的 `tsconfig.json` 已按构建前字节内容恢复。14 条本机页面与 robots/sitemap 路由均返回 HTTP 200，并包含 `nosniff` 和 `X-Frame-Options: DENY`。默认关闭的 Page View / Valid Read API 合成请求均返回 204。仅本地验证，无托管环境访问或业务写入；高风险开关仍关闭。当前剩余人工门为 Phase 3 UI 验收与必须由用户/法律顾问确定的保留政策；Turnstile、Telegram 和 Staging 还需相应服务配置。

**报告提交链路本地测试（2026-10-05）：** 新增 `lib/reports/submit.test.mjs`，验证登录身份、active 状态、Turnstile fail-closed、反馈与帖子举报两类载荷、写入顺序、忽略请求体伪造 submitter ID、错误信息最小化、Telegram 草稿隐私、每小时限额映射及缺少站点配置时拒绝提交。Next.js `/api/reports` 现由薄适配器调用可注入依赖的纯 orchestration；`npm run test:report-submit` 为 13/13。随后统一投稿草稿、工作人员发布和公开详情的社交链接白名单，匹配数据库 HTTPS 校验规则并新增 5 个边界测试。更新后的 `npm run test:local` 通过 111 个 Node 测试、2 个 opt-in ClamAV 测试跳过、25 个 pgTAP 文件 / 595 项断言及数据库 lint。TypeScript、ESLint 0 errors / 0 warnings 和隔离生产构建 38 条路由也通过。真实 Auth/Turnstile、报告页面交互与 Staging 尚未验证。

**Phase 3 社交链接主机名边界修正（2026-10-05）：** 复核发现仅做域名后缀匹配会放过 `https://attacker@www.facebook.com/...`、百分号编码 authority 和空/非法 DNS 标签。新增 `20261005140000_reject_malformed_social_url_authorities.sql`，在保留既有 HTTPS、平台白名单与 RPC 权限的前提下，先校验 ASCII DNS 标签格式与长度；浏览器共享校验同步拒绝同类输入。前后端测试都先在旧实现上失败，再随修正通过；新增 Node 回归和 3 条 pgTAP 断言。迁移仅应用到本地 Supabase。最新 `npm run test:local` 通过 **112 个 Node 测试**（2 项真实 ClamAV 测试按默认模式跳过）、**25 个 pgTAP 文件 / 598 条断言**及数据库 lint；ESLint 与 TypeScript 通过。本地 101 个迁移与数据库对齐，7 个高风险 runtime flags 仍全部关闭。Staging 未配置或访问。

**本地阶段验证续进（2026-10-05）：** 将最后三个待测迁移 `20261005130000` 至 `20261005130200` 应用到本地 Supabase；没有操作托管数据库。最新本地重置按当前磁盘迁移重建，补入 `20261004190409_owner_ip_block_anon_prerequest_schema_usage.sql`。完整 pgTAP 为 **25 个文件、595 条断言，全部通过**。另以真实本地 PostgREST 验证 anon 请求在 private pre-request hook 保持启用时可以执行公开 Reaction 图标与 Tag 目录 RPC；两者返回 HTTP 200，私有 schema 不对 REST 暴露，IP 执行门仍 OFF。Node 测试：备份 12/12、分页 2/2、地图 4/4、扫描器默认模式 5/5（2 项真实 ClamAV 检查按设计跳过）、账号删除 Worker 14/14；本轮 opt-in ClamAV 模式 7/7。ESLint 与 TypeScript 通过；独立输出目录的 Next.js production build 最近一次生成 38 条路由，`tsconfig.json` 构建前内容已恢复。数据库 lint 退出码 0，仍有 7 条未读取锁变量警告，Supabase Advisor 无问题。没有连接托管 Supabase、Staging、Production，没有发邮件或运行一次性 Worker；高风险开关保持关闭。Phase 的复选框完成比例未因本地验证而改变，人工 UI/政策验收及外部环境门仍按原状态处理。Phase 3 回滚表覆盖当前 67 个 Phase 3 迁移，Staging 清单加入匿名 Data API 预请求钩子检查；UI 验收文档更新为本地数据库已连接但无帖子/投稿/举报数据。此前 21 个 Phase 3 路由/语言组合匿名 HTTP 检查仍为 200，包含 noindex、html lang 与安全响应头。

**Phase 3 继续本地回归（2026-10-05）：** 修复 `/account` 与 `/account/verify` 两处邮件验证重发表单漏传 Turnstile Site Key 的问题，令已配置挑战能正常渲染并提交；新增 3 项属性回归测试覆盖登录、重发入口及空白 Site Key 规范化。第二个入口的回归测试先在旧实现上失败，再修复通过。全量 `npm run test:local` 通过：115 个 Node 测试、2 个 opt-in ClamAV 测试默认跳过；pgTAP 25 个文件 / 598 条断言及数据库 lint 通过。`npm run lint`、`npx tsc --noEmit`、`git diff --check` 均通过；隔离 Next.js production build 生成 38 条路由，`tsconfig.json` 已恢复构建前工作区内容。未做真实 Auth/Turnstile、浏览器交互或 Staging 验证；托管服务和高风险开关未触碰。Phase 完成勾选数不因此变化。

**邮箱验证重发页面 fail-closed 冒烟检查（2026-10-05）：** 隔离生产构建中匿名访问 `/zh-cn/account/verify` 返回 HTTP 200，HTML 显示验证邮箱标题与缺少 Site Key 的不可用提示，重发按钮保持禁用且页面不含合成 Site Key。仅验证未配置时的安全渲染，不代表真实 Turnstile、登录身份或邮件发送已验证。

**邮箱验证重发 Server Action 本地测试（2026-10-05）：** 将重发逻辑抽成依赖可注入的服务端流程并由现有 Action 调用；Supabase 会话/资料查询、service-role token RPC 与邮件发送仍由服务器适配器提供。16 项测试覆盖 CAPTCHA 必须先通过、无用户/邮箱、非 active 与已验证账户拒绝重复发送、仅使用会话身份、小时限额结果和 provider 异常脱敏。`npm run test:email-verification-resend` 为 16/16；全量 `npm run test:local` 通过 131 Node 项（两项真实 ClamAV 默认跳过）、pgTAP 25 文件 / 598 断言及数据库 lint；TypeScript、ESLint、隔离生产构建 38 路由通过。没有发送邮件或连接外部服务；所有 Phase 3 入口与高风险开关保持原关闭状态。

**Phase 2 数据库权限回归护栏（2026-10-05）：** `supabase/tests/client_table_grant_inventory.test.sql` 新增两项 pgTAP，防止 public/private 应用范围内的 SECURITY DEFINER 函数向 PUBLIC 授予 EXECUTE，并要求显式固定空 search_path。本地只读清点显示 178 个相关函数均使用空 search_path，没有 PUBLIC EXECUTE 漏项，因此只加回归断言，没有数据库或迁移改动。全量 `npm run test:local` 通过：26 个 pgTAP 文件 / 640 项断言、全部 Node 测试组和数据库 lint；3 项隔离 Supabase 备份/恢复及 2 项真实 ClamAV 测试按 opt-in 规则跳过，Storage/thumbnail 冒烟默认关闭。仅本地验证，托管服务未连接，高风险门保持关闭。
Phase 2 RLS 角色范围护栏（2026-10-05）：client_table_grant_inventory.test.sql 增加 pgTAP，保证 public/private 应用表的 RLS policy 不会改为对不受限的 PUBLIC 角色生效。只读检查当前 pg_policies 无 PUBLIC policy；目标测试 10/10，全量本地 npm run test:local 的 pgTAP 为 26 文件 / 641 断言，DB lint 无 schema errors。仅新增测试断言，没有数据库/迁移改动，未连接托管环境。
Phase 2 私有函数权限待审（2026-10-05）：本地 private schema 对 anon/authenticated 均有 USAGE，分别有 4/61 个函数授予 EXECUTE；supabase/config.toml 的本地 API schemas 仅包含 public 与 graphql_public，因此 private RPC 当前不对本地 Data API 暴露。托管配置未查询；函数授权的调用链与必要性仍需审计，不在未验证依赖时撤权。
Phase 2 私有 schema 暴露回归（2026-10-05）：新增 scripts/supabase-api-schemas.test.mjs 并纳入默认 npm test，保障当前本地 Data API 配置继续暴露 public/graphql_public 且不暴露 private；额外覆盖解析 search_path 与检测误加 private 配置的反例。专项 3/3，全量本地 pgTAP 26 文件 / 641 断言及数据库 lint通过。此项不代表托管环境配置或 private 函数授权调用链已验证。
Phase 2 本地私有 IP-block hook 权限最小化（2026-10-05）：迁移 `20261005160001_mmwr_restrict_ip_hook_function_grants.sql` 撤销 anon/authenticated/service_role/authenticator 对内部旧 checker 的直接 EXECUTE，撤销 authenticator 对 pre-request wrapper 的 EXECUTE 及 private schema USAGE；请求角色仍保留调用 hook 所需授权。根据 PostgREST 官方说明，`db-pre-request` 在切换到 JWT 请求角色后执行；本地 API 根请求以 anon、合成 authenticated JWT、service_role 均返回 HTTP 200。`owner_ip_block.test.sql` 现以 15 条断言保护这些 ACL 边界；完整 `npm run test:local` 通过（26 文件 / 643 pgTAP 断言、Node suites、DB lint），rollback coverage 为 104/104，Supabase Advisor 无问题。IP-block runtime gates 仍关闭；此结果仅限本地，不代表托管授权或外部代理链已验证。
Phase 7 恢复对象账号删除保护（2026-10-05）：`account_deletion_worker.test.sql` 增加合成 Storage 记录，模拟通过 Storage API 使用 service role 恢复后 `owner_id IS NULL`、对象路径仍带原 uploader UUID 的情况。完整本地 `npm run test:local` 通过 26 个 pgTAP 文件 / 644 条断言；该对象仍将对应账号转入人工复核，证明当前 MMWR 删除保护可由受限路径前缀与 `evidence_metadata.uploaded_by` 防止漏删。仍需在隔离应用验证所有恢复证据/缩略图引用、私有对象访问权限及跨版本行为；Storage API 生成的新 object timestamp 和 owner_id 尚未恢复为原值，R2、Staging、RPO/RTO 也未验证，因此 Phase 7 保持未完成，所有运行门关闭。
**Phase 6 生产依赖公告修复与回归（2026-10-06）：** 本地 `npm audit --omit=dev --audit-level=high` 新发现生产传递依赖 `source-map-js@1.2.1` 的 High 公告；npm 的常规修复预演只将其更新到 `1.2.2` 并更新少量平台可选包，因此已应用到 lockfile。复核后生产依赖审计为 0 项；完整审计仍有 5 项 High，全部来自 `eslint-config-next@16.3.8 → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`。GitHub Reviewed Advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/ghsa-vfj7-8cjw-p6xm) 仍列无修复版本；`npm audit fix --force` 会把配置降级到与 Next 16 不兼容的 14.2.35，未采用。修复后 `npm test`、`npm run lint`、`npx tsc --noEmit`、Next 16.3.8 production build（36 路由）及 `git diff --check` 通过。Docker engine/本地数据库不可用，本轮没有新的 pgTAP 或 DB lint 结果；Phase 6 依赖安全门与 Phase 7 非空 DB+Storage 隔离恢复仍未完成。未访问托管服务或更改功能门。

**Phase 6 依赖公告现况复核（2026-10-06）：** 当前 `npm audit --json` 仍报告相同 5 项 High，全部限于 Next ESLint 开发工具链；`npm audit --omit=dev --audit-level=high` 仍为 0 项。npm registry 目前的 `braces` / `braces@3` 最高版本为 3.0.3，`next` 与 `eslint-config-next` 最新均为 16.3.8；GitHub Reviewed Advisory 仍将 `<=3.0.3` 列为受影响版本且没有 patched version。未发现可安全应用的兼容升级，故未强制降级或添加未经维护的 fork/override。生产依赖门保持通过，开发依赖全量审计门仍未通过。

### Phase 4 Admin Storage 用量可见性（2026-10-06）

新增只读 Admin/Owner + 近期 TOTP 汇总：隔离证据桶与私有缩略图衍生桶分别显示对象数和登记字节数，不返回对象名称、路径或单项元数据，也不将登记大小称作供应商账单。数据库迁移与 pgTAP 已编写但因本机 Docker Desktop 未运行而未应用/执行；Node 解析测试与回滚文档覆盖已经加入。此面板只提供用量观测，不替 Owner 决定容量预算、超额策略或孤儿清理/保留政策。缩略图、投稿和扫描功能继续关闭。

### Phase 6 闭索引生产构建 Smoke 复跑（2026-10-06）

使用当前工作树重新构建的 36 条路由生产产物，运行 `npm run security:smoke`；简中、英文、马来文 15 个样例路径各返回 HTTP 200，共 45 个请求，均检查了 CSP、安全响应头、`noindex`、页面语言和单一 main landmark。首页 nonce CSP 与内联 HTML 匹配；关闭索引时 `robots.txt` 全站禁止抓取且不公布 sitemap，`/sitemap.xml` 返回 404。此验证仅覆盖本地预览的闭索引行为，不证明开启公开索引的输出、托管配置或搜索引擎验收。

**Phase 6 Sitemap 计数故障 fail-closed 修正（2026-10-06）：** 发现公开帖子或去重标签的计数查询失败会被当成 0，仍生成只有基础链接的 Sitemap Index，造成公开目录静默不完整。分页器现在仅在两个计数都是非负安全整数时返回分片；任一计数未知或无效时，索引和分片均不发布（路由返回 no-store 404）。真实确认 0 条时仍输出基础分片。新增回归覆盖未知、负数、超出安全整数及正常空目录；相关 10 项 Sitemap 单元测试、TypeScript 与定向 ESLint 通过。仅完成本地代码/单元验证，索引开放态公开数据和 Staging 抓取质量仍未验收，Phase 6 Launch Gate 保持未完成。

**Phase 4 Tags 球体标签读屏名称（2026-10-06）：** 球体中的可交互 Tag 链接原先只将可见标签名作为无障碍名称；现增加三语标签名 + 当前公开帖子数，确保链接和完整目录对同一公开计数均可感知。新增纯函数测试覆盖中文、英语、马来语格式、完整可见标签名及非法数值/未知语言 fail closed。`npm run test:tags`、TypeScript、定向 ESLint 通过。此为代码/自动化验证，不能代替真实键盘、NVDA/VoiceOver 等读屏及真实标签数据的 UI 验收；Staging 未验证。

**Phase 6 Sitemap 分片读取完整性检查（2026-10-06）：** 分片数据源此前把 RPC/查询错误与合法空结果都转成 `[]`，因此数据库读取失败时仍可能生成缺少公开帖子或标签的 Sitemap。现在 Tag 与帖子分片查询错误、无效/重复 Tag UUID、帖子公开投影任一行格式异常均返回失败；生成器再按当前计数核对每个已读分片的预期行数，不完整时整片返回 no-store 404。新增回归覆盖空数据与查询失败、畸形记录、页长度缺失/越界。SEO 单元测试 25/25、TypeScript、定向 ESLint、`git diff --check` 通过。仅本地验证；Docker 不可用，因此没有数据库集成测试，索引开放态与 Staging 仍待验收。

**Phase 6 Sitemap 动态入口查询故障处理（2026-10-06）：** Sitemap Index 的首页分片还会查询 Latest、开启时的 Hot、州属公开计数及各有帖州属的 District 列表；此前这些动态查询失败时会被当作空结果并静默省略对应 URL。现将 unavailable 与确实 empty 分开：Latest、已开启 Hot、州属计数或任一 District 查询未成功时，整个首分片 fail closed；索引关闭的 Hot 仍按既定默认规则跳过。新增来源可用性回归。SEO 测试 27/27、TypeScript、定向 ESLint、`git diff --check` 通过。此为本地验证，Docker/数据库集成、索引开放态和 Staging 抓取仍未验证。

**Phase 6 Sitemap 修正后的闭索引生产复验（2026-10-06）：** 使用 `.next-validation-ci` 隔离目录完成 Next.js production build（36 条动态路由），随后运行 `npm run security:smoke`；简中/英语/马来语 15 条代表路径各自通过 HTTP 200、安全响应头、noindex、正确 `html lang` 与唯一 main 检查，共 45 个页面请求。`robots.txt` 仍全站 Disallow 且不公布 sitemap，`/sitemap.xml` 在索引关闭时返回 404。构建期间 Next 自动改动 `tsconfig.json` include 路径，已用运行前字节内容恢复。此复验只证明本地安全默认态与可构建性；Docker Engine 未运行，索引开启态数据源、DB 集成与 Staging 爬取仍未验收。

**当前工作树 Node/静态检查复跑（2026-10-06）：** 完整 `npm test` 所有配置套件通过，只有 2 项需要真实本地 ClamAV daemon 的 opt-in 测试按默认规则跳过；全仓 `npm run lint` 通过。结合此前当前工作树 TypeScript、SEO 27/27、36 路由隔离 production build 与三语 45 请求闭索引 smoke 均通过。当前 Docker Engine pipe 不存在，因此没有运行 `test:db` 或 `supabase db lint`；托管/Staging 未连接。

**Phase 4 Tags 关键词过滤读屏播报（2026-10-06）：** Tags 搜索会即时更新可见结果数，但原界面没有 aria-live 状态供读屏及时获知变化。现在查询词存在时会礼貌播报本地化结果数量，视觉布局不变；未筛选时状态区域保持空，避免页面初始重复播报。新增 helper 回归覆盖中/英/马来文、英语单复数、数字格式、非法数量/语言。`npm run test:tags` 10/10、TypeScript、相关 ESLint、`git diff --check` 通过。自动化检查不替代真实键盘与读屏验收。

**当前工作树 Tags 与依赖门复验（2026-10-06）：** 新增的关键词过滤读屏播报包含在 Tags 测试 10/10 中；本轮完整 `npm test` 通过（两项真实 ClamAV 测试按 opt-in 默认跳过），全仓 ESLint 与 TypeScript 通过。依赖审计确认生产依赖 high/critical 为 0；完整开发依赖审计仍有 5 个 High，均来自 Next 16 ESLint 工具链间接依赖 `braces@3.0.3`；强制修复会降级不兼容的 ESLint Next 配置，未应用。Docker Engine 当前不可用，pgTAP/DB lint 未运行；托管环境未连接。

**Phase 7 Storage 恢复全局关闭门补齐（2026-10-06）：** 审查发现 `restore-database-run.mjs` 检查默认关闭的 `MMWR_BACKUP_RESTORE_ENABLED`，但 Storage 恢复协调器遗漏同一 gate；若未来调用者没有另加保护，Storage helper 会在显式隔离校验后直接读取备份并写入隔离桶。现在入口先检查共享 gate，关闭时在 R2 读取、Storage 目标盘点与限额配置前即拒绝。新增回归证实 gate 关闭时零备份读取、零目标调用；测试先在旧实现失败。`npm run test:backup` 52 项（49 通过、3 项 Supabase 本地 opt-in 跳过）、定向 ESLint 与 TypeScript 通过。未打开 gate、未连接 Supabase/R2，Phase 7 仍未验收。

Phase 7 gate 修复补充：选择加入的 `MMWR_TEST_LOCAL_STORAGE_RESTORE=true` 集成测试现在仅在一次合成恢复调用周围临时设置 `MMWR_BACKUP_RESTORE_ENABLED=true`，并在 `finally` 恢复原环境值；默认测试和应用环境仍关闭。相关备份测试重跑通过；未执行该 Storage API smoke。

**Phase 7 恢复目标绑定收紧（2026-10-06）：** Supabase Storage 恢复适配器现在只接受 loopback 本机 URL；托管 Supabase 项目 URL 和任意自定义远程域名在 SDK 客户端创建前拒绝，不再把“隔离环境”仅交由调用方声明。新增回归测试按旧实现先失败，再验证拒绝远程主机且从未创建客户端。备份专项 50 通过、3 个本地 Supabase opt-in 用例跳过。当前实现仍只支持本机恢复；Staging 需另行设计远程目标身份验证，真实 DB+Storage 恢复、R2、调度、保留删除、RPO/RTO、通知及托管验证仍未完成。没有打开任何运行门或连接外部环境。

**Phase 7 目标限制后的全工作树回归（2026-10-06）：** 完整 `npm test` 退出码 0、全仓 `npm run lint` 与 `npx tsc --noEmit` 通过；默认组跳过 3 个本地 Supabase 恢复集成及 2 个真实 ClamAV 用例，迁移回滚覆盖为 106/106。Docker Engine 不可用，未运行 pgTAP/DB lint 或真实本地 Supabase 整套恢复；没有触碰托管服务或运行门。

**Phase 4/6 分页导航读屏名称（2026-10-06）：** Posts 列表共享组件与独立 Hot 列表的分页区域此前只用当前页文本作为 landmark 名称。现提供清楚的中/英/马来语“帖子分页导航”名称，并标出当前页；添加纯 helper 三语单测并纳入默认 `npm test`。完整 `npm test`、全仓 ESLint、TypeScript 均通过；默认跳过 3 个本地 Supabase 恢复集成及 2 个真实 ClamAV 用例。尚未做实际键盘/读屏或 Staging 验收，此项仅完成代码与自动化回归。

**Phase 4/6 分页状态校正（2026-10-06）：** 分页 landmark 仅在有公开结果且上一页或下一页链接可用时显示，消除空目录、不可用状态及单页目录里的无效导航。共用帖子列表与 Hot 列表使用同一状态判断，新增边界测试纳入 `npm test`。完整 `npm test`、全仓 ESLint 与 TypeScript 通过；默认跳过 3 个本地 Supabase 恢复集成和 2 个 ClamAV 实机测试。实际浏览器/读屏与 Staging 验收仍待完成。
