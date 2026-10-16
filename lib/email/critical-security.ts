import "server-only";

import nodemailer from "nodemailer";

const descriptions={
  brute_force_attack:"Repeated staff recovery-code failures reached the alert threshold.",
  backup_failure:"A critical backup failure was recorded.",
  backup_validation_failure:"A backup integrity check failed.",
  production_security_incident:"A severe production security alert was recorded.",
} as const;
type AlertType=keyof typeof descriptions;

export function isPermanentCriticalSecurityEmailRejection(error:unknown){
  if(!error||typeof error!=="object")return false;
  const code=(error as {responseCode?:unknown}).responseCode;
  return typeof code==="number"&&code>=500&&code<600;
}

export async function sendCriticalSecurityEmail(address:string,alertType:AlertType,occurredAt:string){
  const {SMTP_HOST,SMTP_USER,SMTP_PASSWORD,SMTP_FROM}=process.env;
  const SMTP_PORT=Number(process.env.SMTP_PORT);
  if(!SMTP_HOST||!SMTP_USER||!SMTP_PASSWORD||!SMTP_FROM||!Number.isInteger(SMTP_PORT)||SMTP_PORT<1||SMTP_PORT>65535){
    throw new Error("Critical security email SMTP is unavailable.");
  }
  if(!Object.hasOwn(descriptions,alertType)||address.length>320||!address.includes("@")){
    throw new Error("Critical security email request is invalid.");
  }
  const date=new Date(occurredAt);
  if(!Number.isFinite(date.getTime()))throw new Error("Critical security email timestamp is invalid.");

  const transporter=nodemailer.createTransport({
    host:SMTP_HOST,port:SMTP_PORT,secure:SMTP_PORT===465,requireTLS:SMTP_PORT!==465,
    auth:{user:SMTP_USER,pass:SMTP_PASSWORD},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,
  });
  await transporter.sendMail({
    from:SMTP_FROM,
    to:address,
    subject:"MMWR critical security alert",
    text:`${descriptions[alertType]}\n\nRecorded at: ${date.toISOString()}\n\nSign in to the MMWR staff area using your usual secure route to review operational status. Do not reply to this message.\n\nThis message contains no report content, evidence, IP address or account data.`,
    html:`<div style="font-family:Arial,sans-serif;line-height:1.7;color:#17283d;max-width:560px;margin:auto"><p style="letter-spacing:.14em;font-size:12px">MMWR · SECURITY</p><h1 style="font-size:22px">Critical security alert</h1><p>${descriptions[alertType]}</p><p>Recorded at: <time>${date.toISOString()}</time></p><p>Sign in to the MMWR staff area using your usual secure route to review operational status. Do not reply to this message.</p><p>This message contains no report content, evidence, IP address or account data.</p></div>`,
  });
}
