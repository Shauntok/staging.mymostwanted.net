export type ResendVerificationAccount = {
  user:{id:string;email:string|null}|null;
  profile:{accountState:string|null;verifiedAt:string|null}|null;
};
export type ResendVerificationDependencies = {
  verifyTurnstile:(token:string,action:"mmwr_email_verification_resend")=>Promise<"valid"|"invalid"|"unavailable">;
  authenticate:()=>Promise<ResendVerificationAccount>;
  issueAndSend:(userId:string,email:string)=>Promise<boolean>;
};
export function resendVerificationEmail(
  token:string,
  dependencies:ResendVerificationDependencies
):Promise<{key:string;ok?:boolean}>;
