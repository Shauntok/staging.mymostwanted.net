"use client";

import {useEffect, useState, type FormEvent} from "react";
import Image from "next/image";
import {useRouter} from "next/navigation";
import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";

type GateState = "loading" | "signed-out" | "enroll" | "challenge" | "recovery" | "error";
const copy = {
  "zh-CN": {title:"后台双重验证",loading:"正在检查安全状态…",signedOut:"请先登录后台账号。",signIn:"登录",intro:"Owner/Admin 必须使用 TOTP 验证后才能进入后台。恢复码只会显示一次，请离线保存。",scan:"用认证器扫描二维码，或手动输入密钥。不要截图或发送给他人。",secret:"手动设置密钥",code:"6 位认证器代码",continue:"验证并继续",challenge:"输入认证器中的 6 位代码。",verify:"验证代码",useRecovery:"改用一次性恢复码",recoveryCode:"一次性恢复码",verifyRecovery:"验证恢复码",invalid:"代码无效、已过期或已使用，请重试。",setupError:"暂时无法启动验证设置。请重新登录或稍后再试。",recoveryUnavailable:"Supabase Auth 的恢复码功能目前不可用。请稍后再试；后台仍保持关闭。",recovery:"请生成新的恢复码，并离线保存后再进入后台。",recoveryReset:"恢复码已验证。为了撤销丢失设备上的旧密钥，请先在新认证器中设置 TOTP。",issue:"生成恢复码",complete:"二次验证已启用。请先保存这些恢复码。",copy:"复制恢复码",download:"下载文本副本",copied:"已复制恢复码。请移动到安全的离线位置。",clear:"我已离线保存，继续进入后台"},
  en: {title:"Staff two-factor authentication",loading:"Checking secure access…",signedOut:"Sign in with your staff account first.",signIn:"Sign in",intro:"Owner and Admin accounts must verify with TOTP before entering management. Recovery codes are shown once; keep them offline.",scan:"Scan the QR code with an authenticator app, or enter the secret manually. Do not share or screenshot it.",secret:"Manual setup secret",code:"6-digit authenticator code",continue:"Verify and continue",challenge:"Enter the 6-digit code from your authenticator.",verify:"Verify code",useRecovery:"Use a one-time recovery code",recoveryCode:"One-time recovery code",verifyRecovery:"Verify recovery code",invalid:"That code is invalid, expired or already used. Try again.",setupError:"Could not start TOTP setup. Sign in again or try later.",recoveryUnavailable:"Supabase Auth recovery codes are currently unavailable. Try again later; staff access remains closed.",recovery:"Generate a fresh set of recovery codes and save them offline before entering management.",recoveryReset:"Recovery code verified. To revoke the lost device's old secret, set up TOTP on a new authenticator first.",issue:"Generate recovery codes",complete:"Two-factor authentication is enabled. Save these recovery codes first.",copy:"Copy recovery codes",download:"Download text copy",copied:"Codes copied. Move them to a secure offline location.",clear:"I saved these offline; continue to staff area"},
  ms: {title:"Pengesahan dua faktor kakitangan",loading:"Memeriksa akses selamat…",signedOut:"Log masuk dengan akaun kakitangan dahulu.",signIn:"Log masuk",intro:"Akaun Owner dan Admin mesti mengesahkan TOTP sebelum masuk ke pengurusan. Kod pemulihan dipaparkan sekali sahaja; simpan di luar talian.",scan:"Imbas kod QR dengan aplikasi pengesah atau masukkan rahsia secara manual. Jangan kongsi atau ambil tangkap layar.",secret:"Rahsia persediaan manual",code:"Kod pengesah 6 digit",continue:"Sahkan dan teruskan",challenge:"Masukkan kod 6 digit daripada aplikasi pengesah.",verify:"Sahkan kod",useRecovery:"Gunakan kod pemulihan sekali guna",recoveryCode:"Kod pemulihan sekali guna",verifyRecovery:"Sahkan kod pemulihan",invalid:"Kod tidak sah, tamat tempoh atau telah digunakan. Cuba lagi.",setupError:"Persediaan TOTP tidak dapat dimulakan. Log masuk semula atau cuba kemudian.",recoveryUnavailable:"Kod pemulihan Supabase Auth tidak tersedia buat masa ini. Cuba kemudian; akses kakitangan kekal ditutup.",recovery:"Jana set kod pemulihan baharu dan simpan di luar talian sebelum masuk ke pengurusan.",recoveryReset:"Kod pemulihan disahkan. Untuk membatalkan rahsia lama pada peranti yang hilang, sediakan TOTP pada aplikasi pengesah baharu dahulu.",issue:"Jana kod pemulihan",complete:"Pengesahan dua faktor diaktifkan. Simpan kod pemulihan dahulu.",copy:"Salin kod pemulihan",download:"Muat turun salinan teks",copied:"Kod disalin. Simpan di lokasi luar talian yang selamat.",clear:"Saya telah menyimpan kod di luar talian; teruskan"}
} as const;

export function StaffMfaGate() {
  const {locale} = usePreferences();
  const t = copy[locale];
  const router = useRouter();
  const [state, setState] = useState<GateState>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [code, setCode] = useState("");
  const [usingRecovery, setUsingRecovery] = useState(false);
  const [recoveringFactor, setRecoveringFactor] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {data: {user}} = await supabase.auth.getUser();
        if (!user) { if (alive) setState("signed-out"); return; }
        const [factorResult, {data: assurance}] = await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        const all = factorResult.data?.all ?? [];
        if (!alive) return;
        if (assurance?.currentLevel === "aal2") {
          const {data: claimsData, error: claimsError} = await supabase.auth.getClaims();
          if (claimsError) { setState("error"); setMessage(t.setupError); return; }
          const amr = claimsData?.claims?.amr;
          const hasTotpProof = Array.isArray(amr) && amr.some((entry) =>
            typeof entry === "object" && entry !== null && "method" in entry && (entry.method === "totp" || entry.method === "mfa/totp")
          );
          if (!hasTotpProof) {
            setRecoveringFactor(true);
            setState("enroll");
            return;
          }
          const {data: recovery, error} = await supabase.auth.mfa.recoveryCodes.getStatus();
          if (!alive) return;
          if (error && error.code !== "mfa_factor_not_found") { setState("error"); setMessage(t.recoveryUnavailable); return; }
          if (!recovery || recovery.remaining < 1) { setState("recovery"); return; }
          router.refresh(); return;
        }
        const verified = all.find((factor) => factor.factor_type === "totp" && factor.status === "verified");
        if (verified) { setFactorId(verified.id); setState("challenge"); return; }
        const unfinished = all.find((factor) => factor.factor_type === "totp" && factor.status === "unverified");
        if (unfinished) {
          const removed = await supabase.auth.mfa.unenroll({factorId: unfinished.id});
          if (removed.error) { setState("error"); setMessage(t.setupError); return; }
        }
        setState("enroll");
      } catch {
        if (alive) { setState("error"); setMessage(t.setupError); }
      }
    }
    void load();
    return () => { alive = false; };
  }, [router, t.recoveryUnavailable, t.setupError]);

  async function startEnrollment() {
    setBusy(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const {data, error} = await supabase.auth.mfa.enroll({factorType:"totp", friendlyName:"MMWR staff authenticator"});
      if (error || !data?.totp) throw error ?? new Error("No TOTP setup response");
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setTotpSecret(data.totp.secret);
    } catch { setMessage(t.setupError); }
    finally { setBusy(false); }
  }

  async function finishSecondFactor() {
    const supabase = createSupabaseBrowserClient();
    if (recoveringFactor) {
      const {data: factorData, error: listError} = await supabase.auth.mfa.listFactors();
      if (listError) { setMessage(t.setupError); return; }
      for (const factor of factorData?.totp ?? []) {
        if (factor.id === factorId || factor.status !== "verified") continue;
        const {error} = await supabase.auth.mfa.unenroll({factorId:factor.id});
        if (error) { setMessage(t.setupError); return; }
      }
      const {data, error} = await supabase.auth.mfa.recoveryCodes.regenerate();
      if (error || !data?.codes?.length) { setMessage(t.recoveryUnavailable); return; }
      setRecoveryCodes(data.codes);
      setRecoveringFactor(false);
      setQrCode(""); setTotpSecret(""); setCode(""); setState("recovery");
      return;
    }
    const {data, error} = await supabase.auth.mfa.recoveryCodes.getStatus();
    if (error && error.code !== "mfa_factor_not_found") { setMessage(t.recoveryUnavailable); return; }
    setQrCode(""); setTotpSecret(""); setCode("");
    if (!data || data.remaining < 1) setState("recovery");
    else router.refresh();
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (usingRecovery) {
        if (code.trim().length < 8 || code.length > 64) { setMessage(t.invalid); return; }
        const {error} = await supabase.auth.mfa.recoveryCodes.verify({code});
        if (error) { setMessage(t.invalid); setCode(""); return; }
        setRecoveringFactor(true); setUsingRecovery(false); setCode(""); setState("enroll");
        return;
      }
      if (!factorId || !/^\d{6}$/.test(code)) { setMessage(t.invalid); return; }
      const {data: challenge, error: challengeError} = await supabase.auth.mfa.challenge({factorId});
      if (challengeError || !challenge) throw challengeError ?? new Error("No TOTP challenge");
      const {error} = await supabase.auth.mfa.verify({factorId, challengeId:challenge.id, code});
      if (error) { setMessage(t.invalid); setCode(""); return; }
      await finishSecondFactor();
    } catch { setMessage(t.invalid); }
    finally { setBusy(false); }
  }

  async function generateRecoveryCodes() {
    setBusy(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const {data: status, error: statusError} = await supabase.auth.mfa.recoveryCodes.getStatus();
      if (statusError && statusError.code !== "mfa_factor_not_found") throw statusError;
      const result = status && status.remaining === 0
        ? await supabase.auth.mfa.recoveryCodes.regenerate()
        : await supabase.auth.mfa.recoveryCodes.generate({friendlyName:"MMWR staff recovery codes"});
      if (result.error || !result.data?.codes?.length) throw result.error ?? new Error("No recovery codes returned");
      setRecoveryCodes(result.data.codes);
    } catch { setMessage(t.recoveryUnavailable); }
    finally { setBusy(false); }
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    try { await navigator.clipboard.writeText(recoveryCodes.join("\n")); setMessage(t.copied); }
    catch { setMessage(t.recoveryUnavailable); }
  }

  function downloadCodes() {
    if (!recoveryCodes) return;
    const formatted = recoveryCodes.map((value) => value.match(/.{1,4}/g)?.join("-") ?? value);
    const blob = new Blob([`MMWR one-time recovery codes\n\n${formatted.join("\n")}\n`], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "mmwr-recovery-codes.txt"; anchor.click();
    URL.revokeObjectURL(url);
  }

  function continueToStaffArea() {
    setRecoveryCodes(null);
    router.refresh();
  }

  return <section className="auth-panel mfa-panel" aria-labelledby="staff-mfa-title">
    <p className="eyebrow">MMWR · STAFF SECURITY</p><h1 id="staff-mfa-title">{t.title}</h1>
    {state === "loading" && <p role="status" className="auth-intro">{t.loading}</p>}
    {state === "signed-out" && <p className="auth-message" role="alert">{t.signedOut} <Link href="/account">{t.signIn}</Link></p>}
    {state === "error" && <p className="auth-message" role="alert">{message}</p>}
    {state !== "loading" && state !== "signed-out" && state !== "error" && <p className="auth-intro">{t.intro}</p>}
    {state === "enroll" && recoveringFactor && <p className="auth-intro">{t.recoveryReset}</p>}
    {state === "enroll" && !qrCode && <button className="button button-primary" disabled={busy} onClick={startEnrollment}>{busy ? t.loading : t.continue}</button>}
    {state === "enroll" && qrCode && <div className="mfa-enrollment">
      <p>{t.scan}</p>
      {qrCode.startsWith("data:image/svg+xml") && <Image className="mfa-qr" src={qrCode} alt="TOTP setup QR code" width={240} height={240} unoptimized/>}
      <p><strong>{t.secret}</strong><br/><code>{totpSecret}</code></p>
      <form className="auth-form" onSubmit={verifyCode}>
        <label>{t.code}<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required/></label>
        <button className="button button-primary" disabled={busy || code.length !== 6}>{busy ? t.loading : t.continue}</button>
      </form>
    </div>}
    {state === "challenge" && <div className="mfa-enrollment">
      {usingRecovery ? <p>{t.recoveryCode}</p> : <p>{t.challenge}</p>}
      <form className="auth-form" onSubmit={verifyCode}>
        <label>{usingRecovery ? t.recoveryCode : t.code}<input inputMode={usingRecovery ? "text" : "numeric"} autoComplete="one-time-code" value={code} onChange={(event) => setCode(usingRecovery ? event.target.value.slice(0, 64) : event.target.value.replace(/\D/g, "").slice(0, 6))} required/></label>
        <button className="button button-primary" disabled={busy || (usingRecovery ? code.trim().length < 8 : code.length !== 6)}>{busy ? t.loading : usingRecovery ? t.verifyRecovery : t.verify}</button>
      </form>
      <button className="button button-quiet" type="button" onClick={() => {setUsingRecovery(!usingRecovery); setCode(""); setMessage("");}}>{usingRecovery ? t.verify : t.useRecovery}</button>
    </div>}
    {message && state !== "error" && <p className="auth-message" role="alert">{message}</p>}
    {state === "recovery" && <>
      <p className="auth-message" role="status">{recoveryCodes ? t.complete : t.recovery}</p>
      {!recoveryCodes && <button className="button button-primary" disabled={busy} onClick={generateRecoveryCodes}>{busy ? t.loading : t.issue}</button>}
      {recoveryCodes && <div className="recovery-codes"><ol>{recoveryCodes.map((value) => <li key={value}><code>{value.match(/.{1,4}/g)?.join("-") ?? value}</code></li>)}</ol><div className="consent-actions"><button className="button button-outline" type="button" onClick={copyCodes}>{t.copy}</button><button className="button button-outline" type="button" onClick={downloadCodes}>{t.download}</button><button className="button button-primary" type="button" onClick={continueToStaffArea}>{t.clear}</button></div></div>}
    </>}
  </section>;
}
