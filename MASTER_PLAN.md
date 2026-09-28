# MMWR 实施总计划与上线清单

> **Codex 执行约定：** 本计划按阶段推进。每个阶段完成后更新复选框、记录实现证据与未完成项。涉及用户账号、真实投稿、密钥、第三方账号和 Production 的操作必须由用户逐步完成；不得自行假设已发布。以 [HANDOFF.md](HANDOFF.md) 为产品决策权威，以 [USER_MANUAL.md](USER_MANUAL.md) 为操作目标。

**目标：** 构建可审计、可恢复、三语的 MMWR 网站及 Owner/Admin 工作台，并达到安全与 SEO 上线门槛。

**架构方向：** 先盘点现有项目，再基于 Next.js + Supabase + Vercel 落地。按 Development / Staging / Production 隔离配置；用户附件由 Supabase Storage 托管，Cloudflare R2 存放独立加密备份。前台内容、后台操作、分析和广告商业数据按服务端权限分区。

**配套规格：** HANDOFF.md。**用户操作手册：** USER_MANUAL.md。

## 全局约束

- MMWR 正式英文品牌名固定；三语仅翻译 UI。Light/Dark 同一设计系统。
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

**完成记录（2026-09-28）：** 现状与依赖见 [docs/architecture/PHASE0_ARCHITECTURE.md](docs/architecture/PHASE0_ARCHITECTURE.md)，小时代源码评估见 [docs/OUR_LITTLE_AGE_MIGRATION_MATRIX.md](docs/OUR_LITTLE_AGE_MIGRATION_MATRIX.md)。只读审阅了旧仓库源码和文档；未打开旧项目环境文件、真实资料或生产输出，未复制旧代码。依赖边界数据许可、法务审阅、邮件/域名、上传扫描和分析保留等决定仍为未决，不阻碍先完成独立的 Phase 1 前端基础。

## Phase 1 — 设计系统、国际化与基础页面

- [x] 创建当前 UI 使用的三语文案（简体中文/English/Bahasa Melayu），品牌名固定；日期、数字与表单错误文案随对应功能页面一并实现（当前尚无日期数据或真实表单）。
- [x] 建立统一 Light/Dark Tokens、响应式导航、覆盖式 Left Drawer、Logo 两形态、组件焦点/键盘/屏幕阅读支持。
- [x] 首页骨架按地图、Latest 6、Hot Ranked 6、12 个 Smart Mix Tags、广告可选位顺序搭建。
- [x] 加入 18+ Gate：通过后 30 天；未成年人路径不记通过 Cookie。实现年龄 Gate 与 Cookie Consent 不互相绕过。
- [x] 建立 Footer 的 Legal、Privacy、投稿规则、申诉/更正/撤下、Cookie 设置入口；草拟内容须标明待马来西亚律师审阅。

**验收：** 三语言 UI 与主题全站一致；手机/桌面导航工作；18+ Gate 每条状态路径可验证；无默认打开的可选功能。

**完成记录（2026-09-28）：** 当前所有 UI 页面均提供简体中文、English 和 Bahasa Melayu 文案；日期格式与表单验证文案将在这些功能出现时接入。已完成首页空骨架、18+ Gate、Cookie Consent、法律草稿页和主要导航 noindex 状态页。覆盖式左侧抽屉、键盘焦点边界、焦点返回与 18+ Gate 焦点恢复已实现并通过代码独立审查；未运行构建或测试。地图、内容、账号与投稿目前仍为占位；法律草稿须律师审核。此为本地代码进度，不代表 Staging 或 Production 验证。

## Phase 2 — 数据模型、认证、RLS 与附件存储

- [x] 定义 users/roles、posts/cases、aliases、evidence、tags、locations、reports、notifications、audit logs、revisions、reactions 等核心模型和状态机；Analytics、Campaign、Backup 模型由各自阶段再细化。
- [ ] 每个迁移包含索引/约束/可回滚策略；将配置从代码硬编码中分离。用最小权限角色进行读写授权。
- [ ] 建立邮箱密码注册、验证、登录、重置密码；未验证用户能阅读及 Reaction，投稿要求邮箱验证。
- [ ] 逐表启用 Supabase RLS；验证访客、普通用户、暂停用户、Admin、Owner 各能读写的精确数据范围。Service Role 仅服务端。
- [ ] Owner/Admin TOTP 2FA、恢复码一次性展示与哈希存储、强制启用门、短后台 Session、敏感动作重验证、登录/2FA rate limit 与登录异常记录。
- [ ] 实现私有证据 Storage、公开/内部隔离、签名 URL；内部证据权限仅 Admin/Owner 可看、Owner 才可切换可见性。记录内部证据访问审计。
- [ ] 上传图像/音频/PDF/白名单文档：扩展名、MIME、魔数校验、可调大小/数量、防病毒/隔离、路径随机化；V1 视频关闭；至少一张图片才允许提交。
- [ ] 建立 7 天账号删除冷静期与取消机制；到期解除身份关联，保留已发布内容和必要审计/法律保留。

**本地进度（2026-09-28）：** 已完成并独立审查 [PHASE2_DATA_MODEL.md](docs/architecture/PHASE2_DATA_MODEL.md)，覆盖角色、数据分类与核心生命周期；本地 Supabase CLI 2.118.0 与空迁移骨架已建立。`supabase/config.toml` 显式关闭新表自动暴露、关闭种子导入并启用本地 TOTP。当前机器没有 Docker 命令，因此尚未创建/执行 schema、RLS 或数据库策略测试；未登录或连接任何托管 Supabase 项目。核心 schema/RLS 是下一步，不表示 Phase 2 或 Supabase 已完成。

**验收：** RLS 策略矩阵全部通过；越权访问负向验证无泄漏；私有附件 URL 与对象路径不能匿名访问；角色开关不只靠 UI 隐藏。

## Phase 3 — 投稿、内容审核、申诉与管理后台

- [ ] 单页分区投稿、地区强制选择、社交链接白名单、最终预览与检查、版本化用户声明；不做草稿/自动保存。
- [ ] 接入 Turnstile 与速率限制；邮件验证先于投稿。异常行为、重复模板、缺证据等做风险标记，机器扫描不拦提交。
- [ ] 移植/重建词库风险提示；Owner 可维护规则和级别。高风险必须 Owner 审；普通内容 Admin 可发布。
- [ ] 审核编辑器支持标题/Tag/版式和中性措辞；保留原文、修订 diff、编辑者、原因、时间。核心事实/证据不能被后台暗改。
- [ ] 建立前台状态词与后台风险分类隔离；Emergency Hide、恢复/重新上架和永久删除的状态机，同步搜索索引、sitemap、noindex、缓存清除。
- [ ] 独立 Feedback/Report Center：必须登录、搜索选帖、站内保存记录、Telegram 草稿跳转，用户手动发送；V1 简单记录。
- [ ] 实现处罚分权、自动到期、永久封禁申诉入口、IP封锁仅 Owner、原因强制、审计不可篡改。
- [ ] 后台统一 Dashboard、基于权限的 Widget Registry、管理员个人布局、Owner 重置 Admin 默认布局、版本化默认布局。
- [ ] 站内通知：普通/重要/紧急，状态流与 90 天清理。Critical Security Email 单独触发，普通运营提醒只在站内。

**验收：** 角色状态矩阵和内容生命周期逐项验证；高风险帖子不能由 Admin 单独发布；隐藏/删除后任何公开 API、搜索、地图、SEO 和缓存不返回其正文/附件。

## Phase 4 — 地图、列表、Tags、搜索与分享

- [ ] 导入可信 State/City 边界，审阅数据来源/许可证；三联邦直辖区单列。国家行政资料同一数据源用于投稿、地图、搜索。
- [ ] 实现可拖/缩放/磁吸地图：Malaysia → State → City 实际边界；Pin 自有品牌、计数、最近 2–3 帖缩略图，City 点击直达列表。
- [ ] 统一所有列表页每页 12、桌面/手机两卡一行；卡片自动布局 1/2/3+ 图片、`+N` 角标、3–5 行摘要、地区、Tags、阅读/Reaction/时间。
- [ ] 首页 Latest 6、Hot Ranked 6、Tags 12 个；其余“查看全部”走专属页。City/Tag 默认最新且无额外 City Tag 筛选。
- [ ] 实现 Owner Tag 排序 Manual/Most Posts/Smart Mix；首页稳定 Smart Mix；`/tags` 3D 球每次进入重抽 30–50、慢速旋转、全部列表名称排序及实时过滤。
- [ ] 选择性改造小时代搜索；建立精确/别名/模糊分级，Autocomplete 最多建议合理数量并带小图/标题/地区，结果页最多 5 个相似名称独立提示；只索引公开内容。
- [ ] 登录墙前 5 行预览，安全保存 `returnTo` 与阅读位置；拒绝开放重定向。完整证据和正文由服务端授权。
- [ ] Reaction 一人一帖一枚，可换/取消；Owner 管理自定义 1:1 图标。
- [ ] 设计 Story 9:16/Post 4:5 生成模板和文字回退；支持本地常用社媒/系统分享/QR/复制，带 campaign-safe tracking；只用公开内容。

**验收：** 移动端两栏可读、键盘可用、边界/地点匹配；跨区域/无图/超多图布局稳定；搜同名不错误合并对象；内部证据从无公开路径可达。

## Phase 5 — 阅读计数、Hot、First-party Analytics 与 Campaign

- [ ] 定义 Page View、有效阅读、Unique Visitor、Session、分享点击/回流、广告 Impression/Viewable Impression/Click 的规范与数据口径。
- [ ] 建事件服务与限速/异常事件过滤。用户明确要求刷新每次 +1；异常 Bot/脚本应从公开有效阅读和 Hot 中扣除。不得将个人 IP 暴露给后台非授权或导出。
- [ ] Hot Score 1h+6h+24h，默认有效阅读门槛 100 可由 Owner 调整；自然算法与 Featured Session 分层。
- [ ] 自建 First-party Analytics + GA4；记录地区仅粗粒度、来源、设备、Tag/City/Search、分享/回流及广告效果。GA4/广告脚本尊重同意状态。
- [ ] Admin Analytics 仅运营型数据；Owner 可读商业资料和客户金额。服务端 API/RLS 强制。支持 7/30/90 日/自定义、环比、同比、Top Posts、地区与来源。
- [ ] 细粒度原始事件配置短期保留，日/月聚合长期保存；区分证据/IP 的 1 年策略。
- [ ] Campaign CRM 支持 Flat Fee/CPM/CPC、客户/报价/预算/位置/日期/素材/状态；广告商无登录 Portal。
- [ ] PDF + Excel/CSV Campaign 报告可按客户/位置/日期、品牌或白牌导出；检查导出无用户资料/IP/内部证据。
- [ ] 广告位均默认 OFF，排期/素材发布需 Owner 显式确认；“Sponsored”标志、关闭自动收回空间、Cookie 同意控制追踪。
- [ ] Featured/Boost 默认 OFF，Owner 设置数小时至 48 小时、到期自动停止并审计/披露。

**验收：** 同一数据范围在 First-party 与 GA4 定义清楚；事件重复/恶意流量不可操纵 Hot/广告报告；导出与角色测试无商业数据泄漏。

## Phase 6 — SEO、性能、合规与安全验证（上线门槛）

- [ ] SSR/预渲染公开内容；metadata、canonical、hreflang、OG、Robots、动态 Sitemap、分页策略、公开 State/City/Tag/Latest/Hot 页面。
- [ ] Article/CreativeWork 结构化数据；注册限制正文按 Google 规范标注受限区域，不 cloaking。爬虫与访客获取同一份文章正文，只是用户授权体验不同。
- [ ] 页面 5 行预览/登录墙/内部附件按真实访问控制设计；如索引完整正文不符合搜索平台规则，改为只索引可公开片段，不给 Bot 特权。
- [ ] 缓存、隐藏/删除、恢复、别名/Canonical、sitemap 和 Search Console 移除流程；内部/待审/拒绝/后台/历史版本全 noindex 且不入 sitemap。
- [ ] Core Web Vitals、图片尺寸/格式/懒加载、地图降级和无障碍检查。
- [ ] CSP、HSTS（Production）、安全 Headers、CSRF/XSS/SQLi/开放重定向、防暴力/爬虫滥用、Rate Limit、Turnstile、WAF、依赖漏洞与密钥扫描。
- [ ] 全量 RLS、敏感操作重认证、TOTP 2FA、恢复码、Audit Log、Security Critical Email 行为检查。
- [ ] Legal / Privacy / Terms / 投稿政策 / 申诉更正撤下 / Cookie Notice 由 Owner 安排马来西亚律师审阅；法律文本未获审阅时不声称合规完成。

**验收：** 所有 Launch Checklist 安全与 SEO 项 PASS；发现 P0/P1 风险、内容泄漏、索引泄漏或无法恢复的数据问题即阻止 Launch。

## Phase 7 — 备份与灾难恢复

- [ ] 自动任务每日凌晨备份数据库 + Storage 至独立 Cloudflare R2；Owner 可发起手动备份。凭证服务端保存、备份加密、传输加密。
- [ ] 保留策略：7 daily + 4 weekly + 6 monthly；清理规则本身不得清除未过期备份。
- [ ] 完整性校验、清单/文件数/大小/hash、后台备份状态；失败/连续失败/校验错误生成紧急通知并 Email Owner。
- [ ] 编写并演练恢复：从数据库和 Storage 同时恢复到隔离环境；校验 RLS、记录、附件关联、权限；明确 RPO/RTO（用户确认或标为待设）。
- [ ] 记录恢复操作 Audit Log；确保恢复目标不覆盖生产数据，直到用户明确授权。

**验收：** 至少一轮隔离恢复演练成功；仅看到 R2 对象或“备份成功”通知不算通过。

## Phase 8 — 三环境与逐步上线

- [ ] 建立 GitHub 仓库/保护分支/CI；只将代码与非敏感示例变量提交。不要把密钥、真实证据、个人数据放 Git。
- [ ] 建立 Development、Staging、Production 三份独立 Supabase/Vercel/Storage/Secrets。Staging 用合成数据、密码/访问控制、robots noindex；不能复制真实敏感证据。
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
- [ ] Owner/Admin 强制 TOTP 2FA；离线恢复码一次性展示、服务端安全存储；后台短 Session 与敏感操作重新验证。
- [ ] Rate Limit、Turnstile、WAF、异常登录/爬虫规则已配置且不误挡 Google/Bing 正常抓取。
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
- [ ] 地图边界与地区名单来源/许可核实，点选、Pin、统计、City 列表一致。
- [ ] 搜索只返回公开内容；相似名称清晰分开；姓名拼写相近不误归同一对象。
- [ ] 登录墙登录/注册回原页与原位置；邮箱未验证可阅读/Reaction，不能投稿。
- [ ] 账号删除 7 日取消路径、处罚权限、Telegram 草稿和申诉流程核对。
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
