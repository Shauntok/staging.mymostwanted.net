export type ReportIdentity = {
  user: {id:string}|null;
  accountState?: string|null;
  profileError?: unknown;
};

export type ReportCreateInput = {
  p_submitter_id:string;
  p_kind:"report"|"feedback";
  p_post_id:string|null;
  p_reason:string;
  p_message:string;
};

export type ReportCreateResult = {
  data:unknown;
  error:null|{code?:string;message?:string};
};

export type SubmitReportDependencies = {
  siteUrl:string|null|undefined;
  authenticate:()=>Promise<ReportIdentity>;
  verifyTurnstile:(token:string,action:"mmwr_report")=>Promise<"valid"|"invalid"|"unavailable">;
  createReport:(input:ReportCreateInput)=>Promise<ReportCreateResult>;
};

export function submitReportRequest(
  request:Request,
  dependencies:SubmitReportDependencies
):Promise<{status:number;body:Record<string,unknown>;headers:Record<string,string>}>;
