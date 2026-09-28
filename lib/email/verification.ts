import "server-only";

import nodemailer from "nodemailer";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[character] ?? character);
}

function getSiteBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Verification email origin must use HTTPS.");
  }
  return url.origin;
}

export async function sendSubmissionEmailVerification(address: string, token: string) {
  const {SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM} = process.env;
  const SMTP_PORT = Number(process.env.SMTP_PORT);
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !Number.isInteger(SMTP_PORT) || SMTP_PORT < 1 || SMTP_PORT > 65535) {
    throw new Error("Transactional email is not configured for this environment.");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_PORT !== 465,
    auth: {user: SMTP_USER, pass: SMTP_PASSWORD},
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const link = `${getSiteBaseUrl()}/account/verify#token=${encodeURIComponent(token)}`;
  const safeLink = escapeHtml(link);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: address,
    subject: "Verify your MMWR email address",
    text: `Confirm your email address to enable MMWR submissions. This link expires in 30 minutes and can only be used once.\n\n${link}\n\nOpening the link will not verify you automatically; confirm on the MMWR page. If you did not create this account, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#20211f;max-width:560px;margin:auto"><p style="letter-spacing:.14em;font-size:12px">MMWR</p><h1 style="font-size:24px;font-weight:500">Verify your email address</h1><p>Confirm your email address to enable submissions on MMWR. The link expires in 30 minutes and can only be used once.</p><p><a href="${safeLink}" style="display:inline-block;background:#c34f32;color:#fff;padding:12px 18px;text-decoration:none">Review verification</a></p><p>Opening this link will not verify you automatically. You will confirm on the MMWR page.</p><p>If you did not create this account, ignore this email.</p></div>`,
  });
}
