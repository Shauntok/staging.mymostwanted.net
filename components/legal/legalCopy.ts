import type { Locale } from "@/lib/i18n/catalog";

export type LegalPageId = "privacy" | "terms" | "rules" | "requests";
type Section = { heading: string; paragraphs: string[] };
type Document = { title: string; intro: string; sections: Section[] };
type LegalCopy = {
  draft: string;
  pending: string;
  navigation: string;
  cookieSettings: string;
  documents: Record<LegalPageId, Document>;
};

export const legalRoutes: { id: LegalPageId; href: string }[] = [
  { id: "privacy", href: "/privacy" },
  { id: "terms", href: "/terms" },
  { id: "rules", href: "/rules" },
  { id: "requests", href: "/requests" },
];

export const legalCopy: Record<Locale, LegalCopy> = {
  "zh-CN": {
    draft: "法律信息草案",
    pending: "草案 — 上线前须由马来西亚律师审阅。本文尚未获法律批准，不应作为已生效的法律承诺。",
    navigation: "法律信息页面",
    cookieSettings: "Cookie 设置",
    documents: {
      privacy: {
        title: "隐私说明",
        intro: "本页概述拟议的数据处理方式，供审阅。账号及联系请求流程尚未连接。",
        sections: [
          { heading: "可能涉及的数据", paragraphs: ["当前界面可能保存年龄确认、语言、主题和 Cookie 选择。计划中的账号与投稿功能可能涉及邮箱、用户名、投稿内容、附件及处理记录；这些流程尚未连接。", "公开内容与内部审核资料须分开处理。不得在公开页面展示内部证据或无关个人资料。"] },
          { heading: "拟议用途与可见范围", paragraphs: ["拟用于提供网站偏好、账号访问、投稿审核、内容安全、请求处理及必要的操作记录。投稿不保证公开；只有经审核并被选为公开的内容才可能对访客显示。", "实际数据流程、访问权限和法律依据仍须在功能完成后核对，并由马来西亚律师审阅。"] },
          { heading: "Cookie 与服务提供方", paragraphs: ["必要 Cookie 支持年龄确认和偏好。分析与广告 Cookie 由你在 Cookie 设置中选择；相关服务和广告投放尚未在本说明中确认为已启用。", "未来的认证、存储、邮件、分析和备份服务提供方尚需按实际配置核实；此草案不指定服务商。"] },
          { heading: "保留、联系与请求", paragraphs: ["各类资料的准确保留期限和删除例外仍待确定及法律审阅，本页不提供统一期限承诺。", "更正、隐私或撤下请求请先阅读请求说明。最终人工联系渠道及账号内请求流程尚未连接；当前页面不能接收请求。"] },
        ],
      },
      terms: {
        title: "使用条款",
        intro: "以下是供审阅的使用原则草案；它不是已获批准的正式条款。",
        sections: [
          { heading: "访问资格", paragraphs: ["本站拟面向年满 18 岁人士。请如实完成年龄确认，并以负责任的方式访问内容。"] },
          { heading: "投稿责任", paragraphs: ["请只提交你有合理依据支持的资料，并尽可能说明来源与证据。不要提交威胁、骚扰、未成年人身份、住址、身份证号码或无关第三方个人资料。", "投稿者应避免把指控写成已证实的事实。提交功能和账号流程目前尚未连接。"] },
          { heading: "审核与处理", paragraphs: ["计划中的投稿会先经人工审核；提交不保证刊登。平台可依据审核结果要求补充资料、拒绝、修订中性表述、暂停展示或移除内容。", "更正、申诉和撤下的申请路径见请求说明；最终处理流程和联系渠道尚待确定。"] },
        ],
      },
      rules: {
        title: "社区规则",
        intro: "这些规则是拟议的社区标准，仍待马来西亚律师审阅。",
        sections: [
          { heading: "保护个人与未成年人", paragraphs: ["不得发布住址、身份证号码、未成年人身份或与事件无关的第三方个人资料。不得威胁、骚扰、煽动伤害或鼓励围攻。"] },
          { heading: "证据与表述", paragraphs: ["清楚区分亲历、所见资料和推测；说明来源并提供可核对的证据。使用准确、中性的语言，不把未经证实的指控说成定论。", "团队拟审核来源、隐私与事实表述，并可能要求补充资料。自动提示不能代替人工核查。"] },
          { heading: "发现问题时", paragraphs: ["如发现错误、隐私风险或应撤下的内容，请参阅请求说明中的更正、隐私和撤下类别。请求入口与最终人工联系渠道尚未连接，本页不接收举报。"] },
        ],
      },
      requests: {
        title: "更正、申诉与撤下请求",
        intro: "本页说明拟议的请求类别。账号内请求流程和最终人工联系渠道尚未连接，当前无法从本站提交请求。",
        sections: [
          { heading: "可提出的事项", paragraphs: ["更正：指出具体内容及你认为有误的部分，并提供可核查资料。申诉：说明你与内容的关系及希望复核的决定。", "隐私：指出可能公开了不应展示的个人资料。撤下：指出内容及撤下原因，特别说明紧急安全或隐私风险。"] },
          { heading: "拟议处理方式", paragraphs: ["团队拟核对内容、证据及风险；可能要求补充资料，并由有权限的人员决定更正、暂时隐藏、保留或撤下。具体时限及通知方式尚未确定。", "请勿在公开页面张贴身份证件、住址或额外敏感资料。"] },
          { heading: "当前状态", paragraphs: ["账号与联系请求工作流未连接；最终人工联系目的地尚待确认。这里没有可用的表单、邮箱或聊天收件人。渠道启用后，本页须更新并再次进行法律审阅。"] },
        ],
      },
    },
  },
  en: {
    draft: "Draft legal information",
    pending: "Draft — review by Malaysia counsel is required before Production use. This text is not legally approved or an operative legal commitment.",
    navigation: "Legal information pages",
    cookieSettings: "Cookie settings",
    documents: {
      privacy: {
        title: "Privacy notice",
        intro: "This draft describes proposed data handling for review. Account and contact request workflows are not connected.",
        sections: [
          { heading: "Data that may be involved", paragraphs: ["The current interface may save age confirmation, language, theme, and cookie choices. Planned account and submission features may involve email addresses, usernames, submitted content, attachments, and handling records; those workflows are not connected.", "Public material and internal review material must be kept separate. Internal evidence and unrelated personal details must not appear on public pages."] },
          { heading: "Proposed purposes and visibility", paragraphs: ["Proposed uses include site preferences, account access, submission review, content safety, request handling, and necessary action records. Submission would not guarantee publication; only reviewed content selected for publication may be visible to visitors.", "Actual data flows, access permissions, and legal basis must be checked after implementation and reviewed by Malaysia counsel."] },
          { heading: "Cookies and providers", paragraphs: ["Necessary cookies support age confirmation and preferences. You can choose analytics and advertising cookies in Cookie settings; this notice does not claim that related services or advertising are live.", "Future authentication, storage, email, analytics, and backup providers must be confirmed against the actual configuration. No provider is named in this draft."] },
          { heading: "Retention, contact, and requests", paragraphs: ["Exact retention periods and exceptions for each data type remain to be decided and legally reviewed. This page makes no blanket retention promise.", "Read the Requests page for correction, privacy, and removal categories. The final human contact channel and account request workflow are not connected; this page cannot receive requests."] },
        ],
      },
      terms: {
        title: "Terms of use",
        intro: "These proposed use principles are for review and are not approved terms.",
        sections: [
          { heading: "Who may access", paragraphs: ["The site is intended for people aged 18 or older. Confirm your age honestly and access content responsibly."] },
          { heading: "Responsible submissions", paragraphs: ["Submit only material you have reasonable grounds to support, and explain sources and evidence where possible. Do not submit threats, harassment, a minor's identity, home addresses, identity numbers, or unrelated third-party personal details.", "Avoid presenting an unverified allegation as an established fact. Submission and account workflows are not connected yet."] },
          { heading: "Review and moderation", paragraphs: ["Planned submissions would receive human review; submitting would not guarantee publication. Following review, the platform may request more information, decline material, edit wording for neutrality, pause display, or remove content.", "The Requests page outlines proposed correction, appeal, and removal categories. The final process and contact channel remain unresolved."] },
        ],
      },
      rules: {
        title: "Community rules",
        intro: "These proposed community standards still require review by Malaysia counsel.",
        sections: [
          { heading: "Protect people and minors", paragraphs: ["Do not publish home addresses, identity numbers, a minor's identity, or unrelated third-party personal details. Threats, harassment, calls for harm, and coordinated targeting are prohibited."] },
          { heading: "Evidence and wording", paragraphs: ["Distinguish firsthand knowledge, source material, and inference. Identify sources and provide evidence that can be checked. Use accurate, neutral language; do not present unverified accusations as proven.", "The team proposes to review sources, privacy, and factual wording and may ask for more information. Automated prompts cannot replace human review."] },
          { heading: "When something is wrong", paragraphs: ["See the Requests page for correction, privacy, and removal categories if you find an error or safety concern. The request entry point and final human contact channel are not connected; this page cannot receive reports."] },
        ],
      },
      requests: {
        title: "Correction, appeal, and removal requests",
        intro: "This page outlines proposed request categories. The account request workflow and final human contact channel are not connected, so requests cannot currently be submitted through this site.",
        sections: [
          { heading: "Types of request", paragraphs: ["Correction: identify the content and the part you believe is wrong, with material that can be checked. Appeal: explain your connection to the content and the decision you want reviewed.", "Privacy: point out personal details that may not belong in public. Removal: identify the content and reasons for removal, including any urgent safety or privacy concern."] },
          { heading: "Proposed handling", paragraphs: ["The team proposes to review the content, evidence, and risks; it may ask for more information. An authorised reviewer may then decide to correct, temporarily hide, retain, or remove material. Timing and notification methods are not settled.", "Do not post identity documents, home addresses, or additional sensitive details on a public page."] },
          { heading: "Current status", paragraphs: ["Account and contact request workflows are not connected; the final human contact destination remains to be confirmed. No working form, email address, or chat recipient is provided here. This page must be updated and reviewed again before a channel opens."] },
        ],
      },
    },
  },
  ms: {
    draft: "Maklumat undang-undang draf",
    pending: "Draf — semakan oleh peguam di Malaysia diperlukan sebelum digunakan dalam Production. Teks ini belum diluluskan dari segi undang-undang dan bukan komitmen undang-undang yang berkuat kuasa.",
    navigation: "Halaman maklumat undang-undang",
    cookieSettings: "Tetapan kuki",
    documents: {
      privacy: {
        title: "Notis privasi",
        intro: "Draf ini menerangkan pengendalian data yang dicadangkan untuk semakan. Aliran kerja akaun dan permintaan hubungan belum disambungkan.",
        sections: [
          { heading: "Data yang mungkin terlibat", paragraphs: ["Antara muka semasa mungkin menyimpan pengesahan umur, pilihan bahasa, tema dan kuki. Ciri akaun dan penyerahan yang dirancang mungkin melibatkan alamat e-mel, nama pengguna, kandungan, lampiran dan rekod pengendalian; aliran kerja tersebut belum disambungkan.", "Bahan awam dan bahan semakan dalaman mesti diasingkan. Bukti dalaman dan butiran peribadi yang tidak berkaitan tidak boleh muncul pada halaman awam."] },
          { heading: "Tujuan dan keterlihatan yang dicadangkan", paragraphs: ["Kegunaan yang dicadangkan termasuk pilihan laman, akses akaun, semakan penyerahan, keselamatan kandungan, pengendalian permintaan dan rekod tindakan yang perlu. Penyerahan tidak menjamin penerbitan; hanya kandungan yang disemak dan dipilih untuk diterbitkan boleh dilihat pelawat.", "Aliran data sebenar, hak akses dan asas undang-undang perlu disemak selepas pelaksanaan dan diteliti oleh peguam di Malaysia."] },
          { heading: "Kuki dan penyedia", paragraphs: ["Kuki perlu menyokong pengesahan umur dan pilihan anda. Anda boleh memilih kuki analitik dan pengiklanan dalam Tetapan kuki; notis ini tidak menyatakan perkhidmatan berkaitan atau iklan telah aktif.", "Penyedia masa depan bagi pengesahan, storan, e-mel, analitik dan sandaran perlu disahkan mengikut konfigurasi sebenar. Tiada penyedia dinamakan dalam draf ini."] },
          { heading: "Penyimpanan, hubungan dan permintaan", paragraphs: ["Tempoh penyimpanan tepat dan pengecualian bagi setiap jenis data masih perlu diputuskan dan disemak dari segi undang-undang. Halaman ini tidak menjanjikan satu tempoh untuk semua data.", "Baca halaman Permintaan untuk kategori pembetulan, privasi dan penyingkiran. Saluran hubungan manusia terakhir dan aliran kerja permintaan akaun belum disambungkan; halaman ini tidak boleh menerima permintaan."] },
        ],
      },
      terms: {
        title: "Syarat penggunaan",
        intro: "Prinsip penggunaan yang dicadangkan ini adalah untuk semakan dan belum menjadi syarat yang diluluskan.",
        sections: [
          { heading: "Kelayakan akses", paragraphs: ["Laman ini ditujukan kepada individu berumur 18 tahun ke atas. Sahkan umur dengan jujur dan akses kandungan secara bertanggungjawab."] },
          { heading: "Penyerahan bertanggungjawab", paragraphs: ["Hantar hanya bahan yang mempunyai asas munasabah untuk disokong, serta jelaskan sumber dan bukti jika boleh. Jangan hantar ancaman, gangguan, identiti kanak-kanak, alamat rumah, nombor pengenalan atau butiran peribadi pihak ketiga yang tidak berkaitan.", "Jangan nyatakan dakwaan yang belum disahkan sebagai fakta yang terbukti. Aliran kerja penyerahan dan akaun belum disambungkan."] },
          { heading: "Semakan dan penyederhanaan", paragraphs: ["Penyerahan yang dirancang akan melalui semakan manusia; penghantaran tidak menjamin penerbitan. Selepas semakan, platform boleh meminta maklumat tambahan, menolak bahan, mengubah ungkapan agar neutral, menggantung paparan atau menyingkirkan kandungan.", "Halaman Permintaan menerangkan kategori pembetulan, rayuan dan penyingkiran yang dicadangkan. Proses akhir dan saluran hubungan belum ditentukan."] },
        ],
      },
      rules: {
        title: "Peraturan komuniti",
        intro: "Piawaian komuniti yang dicadangkan ini masih memerlukan semakan peguam di Malaysia.",
        sections: [
          { heading: "Lindungi individu dan kanak-kanak", paragraphs: ["Jangan terbitkan alamat rumah, nombor pengenalan, identiti kanak-kanak atau butiran peribadi pihak ketiga yang tidak berkaitan. Ancaman, gangguan, seruan untuk mencederakan dan serangan beramai-ramai adalah dilarang."] },
          { heading: "Bukti dan ungkapan", paragraphs: ["Bezakan pengalaman sendiri, bahan sumber dan andaian. Nyatakan sumber dan sediakan bukti yang boleh disemak. Gunakan bahasa yang tepat dan neutral; jangan nyatakan tuduhan yang belum disahkan sebagai terbukti.", "Pasukan bercadang menyemak sumber, privasi dan ungkapan fakta serta mungkin meminta maklumat lanjut. Petunjuk automatik tidak menggantikan semakan manusia."] },
          { heading: "Apabila terdapat masalah", paragraphs: ["Lihat halaman Permintaan untuk kategori pembetulan, privasi dan penyingkiran jika anda menemui kesilapan atau risiko keselamatan. Pintu masuk permintaan dan saluran hubungan manusia terakhir belum disambungkan; halaman ini tidak boleh menerima laporan."] },
        ],
      },
      requests: {
        title: "Permintaan pembetulan, rayuan dan penyingkiran",
        intro: "Halaman ini menerangkan kategori permintaan yang dicadangkan. Aliran kerja permintaan akaun dan saluran hubungan manusia terakhir belum disambungkan, jadi permintaan tidak boleh dihantar melalui laman ini pada masa ini.",
        sections: [
          { heading: "Jenis permintaan", paragraphs: ["Pembetulan: kenal pasti kandungan dan bahagian yang anda anggap salah, bersama bahan yang boleh disemak. Rayuan: terangkan hubungan anda dengan kandungan dan keputusan yang ingin disemak.", "Privasi: tunjukkan butiran peribadi yang mungkin tidak wajar dipaparkan. Penyingkiran: kenal pasti kandungan dan sebabnya, termasuk risiko keselamatan atau privasi yang mendesak."] },
          { heading: "Pengendalian yang dicadangkan", paragraphs: ["Pasukan bercadang menyemak kandungan, bukti dan risiko serta mungkin meminta maklumat lanjut. Penyemak yang diberi kuasa boleh memutuskan untuk membetulkan, menyembunyikan sementara, mengekalkan atau menyingkirkan bahan. Tempoh dan kaedah pemberitahuan belum ditetapkan.", "Jangan siarkan dokumen pengenalan, alamat rumah atau butiran sensitif tambahan pada halaman awam."] },
          { heading: "Status semasa", paragraphs: ["Aliran kerja permintaan akaun dan hubungan belum disambungkan; destinasi hubungan manusia terakhir masih perlu disahkan. Tiada borang, alamat e-mel atau penerima sembang yang berfungsi disediakan di sini. Halaman ini mesti dikemas kini dan disemak semula sebelum saluran dibuka."] },
        ],
      },
    },
  },
};
