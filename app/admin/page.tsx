import type {Metadata} from "next";
import type {ReactNode} from "react";
import {AuthForms} from "@/components/auth/AuthForms";
import {StaffDashboard} from "@/components/auth/StaffDashboard";
import {StaffAreaStatus} from "@/components/auth/StaffAreaStatus";
import {StaffMfaGate} from "@/components/auth/StaffMfaGate";
import {OwnerStaffManagement} from "@/components/auth/OwnerStaffManagement";
import {OwnerHomeTagSettings} from "@/components/home/OwnerHomeTagSettings";
import {OwnerPostLifecycle} from "@/components/auth/OwnerPostLifecycle";
import {StaffReportQueue} from "@/components/reports/StaffReportQueue";
import {StaffSubmissionQueue} from "@/components/submissions/StaffSubmissionQueue";
import {StaffSanctionManager} from "@/components/auth/StaffSanctionManager";
import {StaffNotifications} from "@/components/auth/StaffNotifications";
import {StaffAnalyticsSummary,type StaffAnalyticsRow} from "@/components/analytics/StaffAnalyticsSummary";
import {OwnerHotSettings} from "@/components/analytics/OwnerHotSettings";
import {StaffDashboardSummary,type DashboardMetrics} from "@/components/analytics/StaffDashboardSummary";
import {StaffRecentOperations,type StaffRecentOperation} from "@/components/auth/StaffRecentOperations";
import {StaffStorageUsage,type StaffStorageUsageSummary} from "@/components/auth/StaffStorageUsage";
import {StaffBackupRuns,type StaffBackupRun} from "@/components/auth/StaffBackupRuns";
import {OwnerSubmissionRiskLexicon} from "@/components/auth/OwnerSubmissionRiskLexicon";
import {OwnerCriticalSecurityEmail} from "@/components/auth/OwnerCriticalSecurityEmail";
import {OwnerIpBlockManager} from "@/components/auth/OwnerIpBlockManager";
import {parseStaffStorageUsage} from "@/lib/admin/storage-usage.mjs";
import {StaffClarificationManager} from "@/components/clarifications/StaffClarificationManager";
import {OwnerReactionIconSettings} from "@/components/auth/OwnerReactionIconSettings";
import {OwnerAccountDeletionReviews} from "@/components/auth/OwnerAccountDeletionReviews";
import {OwnerCampaignManager} from "@/components/auth/OwnerCampaignManager";
import {StaffPostRevisionEditor} from "@/components/auth/StaffPostRevisionEditor";
import {ADMIN_DASHBOARD_WIDGET_IDS,DEFAULT_ADMIN_DASHBOARD_WIDGET_IDS,DEFAULT_OWNER_DASHBOARD_WIDGET_IDS,OWNER_DASHBOARD_WIDGET_IDS} from "@/lib/admin/dashboard-widget-ids";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {getOwnerIpBlockConfig} from "@/lib/security/owner-ip-blocks";

export const metadata: Metadata = {title: "Staff area", robots: {index: false, follow: false}};

type AdminPageState =
  | {kind: "signin" | "denied" | "mfa" | "unavailable"}
  | {kind: "owner" | "admin"; userId: string; analyticsState: "off" | "unavailable" | "empty" | "ready"; analyticsRows: StaffAnalyticsRow[]; dashboardMetrics:DashboardMetrics; recentOperations:StaffRecentOperation[]; recentOperationsState:"unavailable"|"ready"; storageUsage:StaffStorageUsageSummary|null; storageUsageState:"unavailable"|"ready"; backupRuns:StaffBackupRun[]; backupRunsState:"unavailable"|"ready"; widgetIds:string[]; layoutReady:boolean};

const operationTypes=new Set([
  "post_moderated","post_revised","report_reviewed","submission_reviewed","account_sanctioned",
  "notification_updated","evidence_reviewed","role_updated","owner_ip_block_updated",
  "evidence_visibility_updated","risk_rules_updated","homepage_tags_updated",
]);
const operationActions=new Set([
  "publish","hide","restore","remove","revised","status_changed","warning","submission_suspension",
  "account_suspension","permanent_ban","lift","read","in_progress","resolved","viewed","granted",
  "revoked","first_owner_bootstrap","created","lifted","expired","internal_only","public_thumbnail","updated",
]);

function parseRecentOperations(value:unknown):StaffRecentOperation[]{
  if(!Array.isArray(value))return [];
  return value.flatMap((item):StaffRecentOperation[]=>{
    if(!item||typeof item!=="object")return [];
    const row=item as Record<string,unknown>;
    const timestamp=typeof row.occurred_at==="string"?Date.parse(row.occurred_at):NaN;
    if(!Number.isFinite(timestamp)||typeof row.event_type!=="string"||!operationTypes.has(row.event_type)
      ||typeof row.action!=="string"||!operationActions.has(row.action)
      ||(row.actor_username!==null&&typeof row.actor_username!=="string"))return [];
    return [{occurred_at:new Date(timestamp).toISOString(),event_type:row.event_type,action:row.action,
      actor_username:typeof row.actor_username==="string"?row.actor_username.slice(0,100):null}];
  }).slice(0,30);
}

function parseBackupRuns(value:unknown):StaffBackupRun[]{
  if(!Array.isArray(value))return [];
  return value.flatMap((item):StaffBackupRun[]=>{
    if(!item||typeof item!=="object")return [];
    const row=item as Record<string,unknown>;
    const startedAt=typeof row.started_at==="string"?Date.parse(row.started_at):NaN;
    const completedAt=row.completed_at===null?null:typeof row.completed_at==="string"?Date.parse(row.completed_at):NaN;
    const artifactCount=Number(row.artifact_count),encryptedBytes=Number(row.encrypted_bytes);
    if(typeof row.run_id!=="string"||!/^backup_[0-9]{8}T[0-9]{6}Z_[a-f0-9]{16}$/.test(row.run_id)
      ||(row.trigger_kind!=="scheduled"&&row.trigger_kind!=="owner_manual")
      ||(row.status!=="running"&&row.status!=="succeeded"&&row.status!=="failed")
      ||(row.phase!=="database_export"&&row.phase!=="storage_backup"&&row.phase!=="manifest_verification"&&row.phase!=="complete"&&row.phase!=="failed")
      ||typeof row.integrity_verified!=="boolean"||!Number.isSafeInteger(artifactCount)||artifactCount<0
      ||!Number.isSafeInteger(encryptedBytes)||encryptedBytes<0||!Number.isFinite(startedAt)
      ||(completedAt!==null&&!Number.isFinite(completedAt))
      ||(row.failure_code!==null&&row.failure_code!=="backup_failed"))return [];
    return [{runId:row.run_id,triggerKind:row.trigger_kind,status:row.status,phase:row.phase,
      integrityVerified:row.integrity_verified,artifactCount,encryptedBytes,
      failureCode:row.failure_code,startedAt:new Date(startedAt).toISOString(),
      completedAt:completedAt===null?null:new Date(completedAt).toISOString()}];
  }).slice(0,50);
}

async function getAdminPageState(): Promise<AdminPageState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (!user) return {kind: "signin"};

    const {data: staff, error: staffError} = await supabase.rpc("has_staff_identity");
    if (staffError || staff !== true) return {kind: "denied"};

    const {data: claimsData} = await supabase.auth.getClaims();
    const amr = claimsData?.claims?.amr;
    const hasTotpProof = Array.isArray(amr) && amr.some((entry) =>
      typeof entry === "object" && entry !== null && "method" in entry && (entry.method === "totp" || entry.method === "mfa/totp")
    );
    if (claimsData?.claims?.aal !== "aal2" || !hasTotpProof) return {kind: "mfa"};

    const {data: recoveryCodes, error: recoveryError} = await supabase.auth.mfa.recoveryCodes.getStatus();
    if (recoveryError || !recoveryCodes || recoveryCodes.remaining < 1) return {kind: "mfa"};
    const {data: isOwner, error: ownerError} = await supabase.rpc("has_staff_role",{p_role:"owner"});
    if (ownerError) return {kind: "unavailable"};
    let role:"owner"|"admin";
    if(isOwner===true)role="owner";
    else{
      const {data:isAdmin,error:adminError}=await supabase.rpc("has_staff_role",{p_role:"admin"});
      if(adminError||isAdmin!==true)return {kind:"denied"};
      role="admin";
    }
    const allowedIds=role==="owner"?OWNER_DASHBOARD_WIDGET_IDS:ADMIN_DASHBOARD_WIDGET_IDS;
    let widgetIds=[...(role==="owner"?DEFAULT_OWNER_DASHBOARD_WIDGET_IDS:DEFAULT_ADMIN_DASHBOARD_WIDGET_IDS)];
    let layoutReady=false;
    const {data:layoutData,error:layoutError}=await supabase.rpc("staff_get_dashboard_layout");
    if(!layoutError&&layoutData&&typeof layoutData==="object"&&!Array.isArray(layoutData)){
      const payload=layoutData as Record<string,unknown>;
      if(payload.role===role&&Array.isArray(payload.widget_ids)){
        const uniqueIds=[...new Set(payload.widget_ids.filter((id):id is string=>typeof id==="string"&&allowedIds.some(allowed=>allowed===id)))];
        if(uniqueIds.length>0){widgetIds=uniqueIds;layoutReady=true;}
      }
    }
    const analyticsEnabled=process.env.FIRST_PARTY_ANALYTICS_ENABLED==="true"&&process.env.NEXT_PUBLIC_FIRST_PARTY_ANALYTICS_ENABLED==="true";
    let dashboardMetrics:DashboardMetrics={pending:0,highRisk:null,publishedToday:0,pageViewsTodayUtc:null,analyticsEnabled,unavailable:true};
    const {data:summaryData,error:summaryError}=await supabase.rpc("staff_dashboard_summary");
    const summary=Array.isArray(summaryData)?summaryData[0]:summaryData;
    if(!summaryError&&summary&&typeof summary==="object"){
      const values=summary as Record<string,unknown>;
      const pending=Number(values.pending_submission_count);
      const highRisk=values.high_risk_submission_count===null?null:Number(values.high_risk_submission_count);
      const publishedToday=Number(values.published_today_count);
      if(Number.isSafeInteger(pending)&&pending>=0&&(highRisk===null||Number.isSafeInteger(highRisk)&&highRisk>=0)&&Number.isSafeInteger(publishedToday)&&publishedToday>=0){
        dashboardMetrics={pending,highRisk,publishedToday,pageViewsTodayUtc:null,analyticsEnabled,unavailable:false};
      }
    }
    let analyticsState:"off"|"unavailable"|"empty"|"ready"="off";
    let analyticsRows:StaffAnalyticsRow[]=[];
    if(analyticsEnabled){
      const hasAnalyticsWidget=widgetIds.includes("analytics");
      const {data,error}=await supabase.rpc("staff_analytics_daily_page_views",{p_days:hasAnalyticsWidget?90:7});
      if(error){
        dashboardMetrics={...dashboardMetrics,pageViewsTodayUtc:null};
        if(hasAnalyticsWidget)analyticsState="unavailable";
      }
      else if(Array.isArray(data)){
        const rows=(data as {view_date:string;route_key:string;page_views:number|string}[]).map(row=>({view_date:row.view_date,route_key:row.route_key,page_views:Number(row.page_views)})).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.view_date)&&Number.isSafeInteger(row.page_views)&&row.page_views>=0);
        const todayUtc=new Date().toISOString().slice(0,10);
        const todayTotal=rows.filter(row=>row.view_date===todayUtc).reduce((total,row)=>total+row.page_views,0);
        dashboardMetrics={...dashboardMetrics,pageViewsTodayUtc:Number.isSafeInteger(todayTotal)?todayTotal:null};
        if(hasAnalyticsWidget){analyticsRows=rows;analyticsState=analyticsRows.length?"ready":"empty";}
      }else{
        dashboardMetrics={...dashboardMetrics,pageViewsTodayUtc:null};
        if(hasAnalyticsWidget)analyticsState="unavailable";
      }
    }
    let recentOperations:StaffRecentOperation[]=[];
    let recentOperationsState:"unavailable"|"ready"="unavailable";
    if(widgetIds.includes("recent_operations")){
      const {data,error}=await supabase.rpc("staff_list_recent_operations",{p_limit:20});
      if(!error&&Array.isArray(data)){
        recentOperations=parseRecentOperations(data);
        recentOperationsState="ready";
      }
    }
    let storageUsage:StaffStorageUsageSummary|null=null;
    let storageUsageState:"unavailable"|"ready"="unavailable";
    if(widgetIds.includes("storage_usage")){
      const {data,error}=await supabase.rpc("staff_get_storage_usage_summary");
      if(!error){
        storageUsage=parseStaffStorageUsage(data);
        if(storageUsage)storageUsageState="ready";
      }
    }
    const {data:backupRunData,error:backupRunError}=await supabase.rpc("staff_list_backup_runs",{p_limit:10});
    const backupRunsState: "unavailable"|"ready"=backupRunError||!Array.isArray(backupRunData)?"unavailable":"ready";
    const backupRuns=backupRunsState==="ready"?parseBackupRuns(backupRunData):[];
    return {kind:role,userId:user.id,analyticsState,analyticsRows,dashboardMetrics,recentOperations,recentOperationsState,storageUsage,storageUsageState,backupRuns,backupRunsState,widgetIds,layoutReady};
  } catch {
    return {kind: "signin"};
  }
}

export default async function AdminPage() {
  const state = await getAdminPageState();
  if (state.kind === "signin") return <div className="auth-page"><AuthForms mode="signin" redirectTo="/admin" turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}/></div>;
  if (state.kind === "denied") return <StaffAreaStatus denied/>;
  if (state.kind === "mfa") return <div className="auth-page"><StaffMfaGate/></div>;
  if (state.kind === "unavailable") return <StaffAreaStatus/>;
  if (state.kind !== "owner" && state.kind !== "admin") return <StaffAreaStatus/>;
  const widgets:{id:string;content:ReactNode}[]=[
    {id:"dashboard_summary",content:<StaffDashboardSummary metrics={state.dashboardMetrics} isOwner={state.kind==="owner"}/>},
    {id:"recent_operations",content:<StaffRecentOperations rows={state.recentOperations} state={state.recentOperationsState}/>},
    {id:"storage_usage",content:<StaffStorageUsage summary={state.storageUsage} state={state.storageUsageState}/>},
    {id:"reports",content:<StaffReportQueue/>},
    {id:"submissions",content:<StaffSubmissionQueue isOwner={state.kind==="owner"} ownerVisibilityConfigured={process.env.OWNER_EVIDENCE_VISIBILITY_ENABLED==="true"} publicationConfigured={process.env.MMWR_SUBMISSION_PUBLICATION_ENABLED==="true"}/>},
    {id:"post_editor",content:<StaffPostRevisionEditor/>},
    {id:"notifications",content:<StaffNotifications/>},
    {id:"analytics",content:<StaffAnalyticsSummary state={state.analyticsState} rows={state.analyticsRows}/>},
    {id:"sanctions",content:<StaffSanctionManager isOwner={state.kind==="owner"}/>},
    {id:"clarifications",content:<StaffClarificationManager isOwner={state.kind==="owner"}/>},
  ];
  if(state.kind==="owner"){
    const ipBlockConfig=getOwnerIpBlockConfig();
    widgets.push(
    {id:"posts",content:<OwnerPostLifecycle/>},
    {id:"homepage_tags",content:<OwnerHomeTagSettings/>},
    {id:"staff_access",content:<OwnerStaffManagement currentUserId={state.userId}/>},
    {id:"risk_lexicon",content:<OwnerSubmissionRiskLexicon/>},
    {id:"security_email",content:<OwnerCriticalSecurityEmail/>},
    {id:"ip_blocks",content:<OwnerIpBlockManager configurationPresent={ipBlockConfig.configured} enforcementEnabled={ipBlockConfig.enabled&&ipBlockConfig.configured}/>},
    {id:"hot_settings",content:<OwnerHotSettings/>},
    {id:"reaction_icons",content:<OwnerReactionIconSettings/>},
    {id:"account_deletion_reviews",content:<OwnerAccountDeletionReviews/>},
    {id:"campaign_crm",content:<OwnerCampaignManager/>},
    );
  }
  return <><StaffDashboard isOwner={state.kind==="owner"} widgets={widgets} initialWidgetIds={state.widgetIds} layoutReady={state.layoutReady}/><StaffBackupRuns runs={state.backupRuns} state={state.backupRunsState}/></>;
}
