export const ADMIN_DASHBOARD_WIDGET_IDS = [
  "dashboard_summary",
  "reports",
  "submissions",
  "post_editor",
  "notifications",
  "analytics",
  "sanctions",
  "recent_operations",
  "storage_usage",
  "clarifications",
] as const;

export const OWNER_DASHBOARD_WIDGET_IDS = [
  ...ADMIN_DASHBOARD_WIDGET_IDS.slice(0, 6),
  "posts",
  "homepage_tags",
  "sanctions",
  "staff_access",
  "risk_lexicon",
  "security_email",
  "ip_blocks",
  "recent_operations",
  "storage_usage",
  "hot_settings",
  "clarifications",
  "reaction_icons",
  "account_deletion_reviews",
  "campaign_crm",
] as const;

export const DEFAULT_ADMIN_DASHBOARD_WIDGET_IDS: string[] = [
  ...ADMIN_DASHBOARD_WIDGET_IDS,
];

export const DEFAULT_OWNER_DASHBOARD_WIDGET_IDS: string[] = [
  ...OWNER_DASHBOARD_WIDGET_IDS,
];
