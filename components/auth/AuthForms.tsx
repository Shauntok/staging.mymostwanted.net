"use client";

import {useActionState, useEffect, useState} from "react";
import {
  requestEmailVerificationAction,
  requestPasswordResetAction,
  setNewPasswordAction,
  signInAction,
  signOutAction,
  signUpAction,
  verifyEmailAction,
} from "@/app/account/actions";
import type {AuthActionState} from "@/app/account/actions";
import {usePreferences} from "@/components/shell/PreferencesProvider";

type AuthMode = "signin" | "signup" | "forgot" | "reset" | "verify" | "resend";
const initial: AuthActionState = {key: ""};

const text = {
  "zh-CN": {
    signinTitle:"登录 MMWR",signupTitle:"创建账号",forgotTitle:"找回密码",resetTitle:"设置新密码",verifyTitle:"确认邮箱",resendTitle:"重发验证邮件",signinIntro:"登录后可阅读完整公开内容并使用 Reaction。邮箱验证只在投稿前要求。",signupIntro:"创建账号后即可登录阅读；完成邮箱验证后即可投稿。",email:"邮箱地址",password:"密码",newPassword:"新密码",username:"用户名",signin:"登录",signup:"创建账号",forgot:"忘记密码？",noAccount:"还没有账号？",hasAccount:"已有账号？",createOne:"立即注册",backSignin:"返回登录",sendReset:"发送找回链接",confirmPassword:"更新密码",confirmEmail:"确认并验证邮箱",sendVerification:"发送验证邮件",signOut:"退出登录",signedInIntro:"你已登录。邮箱验证状态决定你是否可以投稿；阅读完整公开内容与 Reaction 不受邮箱验证状态影响。",profileSetupRequired:"账号已创建，请完成用户名设置后继续。",emailVerifyHelp:"为了避免邮件扫描器自动完成验证，打开邮件链接后，请在此页主动点击确认。链接 30 分钟内有效且只能使用一次。",resendHelp:"验证链接过期或未收到邮件？登录账号后可重新发送。每小时最多发送 3 次。",accountCreatedVerify:"账号已创建。请查收验证邮件；完成确认后即可投稿。",accountCreatedEmailPending:"账号已创建，但验证邮件暂时未能发送。登录后可重试；请稍后再试。",verificationSent:"验证邮件已发送，请检查收件箱与垃圾邮件。",verificationInvalid:"验证链接无效、已过期或已使用。请登录后重新发送。",emailVerified:"邮箱验证完成。你现在可以投稿。",emailAlreadyVerified:"此账号的投稿邮箱已验证。",verificationRateLimited:"暂时无法发送。请检查验证状态，稍后再试。",resetSentGeneric:"如果该邮箱对应有效账号，我们已发送找回说明。",passwordTooShort:"密码至少需要 10 个字符。",resetLinkInvalid:"找回链接无效或已过期，请重新申请。",passwordUpdateFailed:"密码更新失败，请重新打开有效的找回链接。",usernameFormat:"用户名需为 3–24 位英文字母、数字或下划线。",signupFormat:"请填写有效邮箱，密码至少 10 个字符。",signupUnavailable:"无法完成注册。请检查资料、稍后重试，或使用另一个邮箱。",usernameUnavailable:"该用户名已被使用或无法保存。请更换用户名。",invalidCredentials:"邮箱或密码不正确。",signInUnavailable:"目前无法登录，请稍后再试。",profilePending:"账号资料尚未就绪，请联系网站支持。",accountRestricted:"此账号目前无法登录。",serviceUnavailable:"服务暂时不可用，请稍后重试。",emailSendUnavailable:"目前无法发送验证邮件。请稍后再试。",signInFirst:"请先登录账号后重发验证邮件。",passwordUpdated:"密码已更新。请使用新密码登录。",pending:"处理中…"
  },
  en: {
    signinTitle:"Sign in to MMWR",signupTitle:"Create an account",forgotTitle:"Reset your password",resetTitle:"Set a new password",verifyTitle:"Confirm your email",resendTitle:"Resend verification email",signinIntro:"Sign in to read full public posts and use Reactions. Email verification is required only before submitting.",signupIntro:"You can sign in and read after creating an account. Verify your email before submitting.",email:"Email address",password:"Password",newPassword:"New password",username:"Username",signin:"Sign in",signup:"Create account",forgot:"Forgot password?",noAccount:"New to MMWR?",hasAccount:"Already have an account?",createOne:"Create one",backSignin:"Back to sign in",sendReset:"Send reset instructions",confirmPassword:"Update password",confirmEmail:"Confirm and verify email",sendVerification:"Send verification email",signOut:"Sign out",signedInIntro:"You are signed in. Email verification controls submission; it does not limit reading full public posts or using Reactions.",profileSetupRequired:"Your account is ready. Set a username to continue.",emailVerifyHelp:"To prevent email scanners from verifying automatically, open the link and then confirm on this page. The link expires in 30 minutes and works once.",resendHelp:"Link expired or missing? Sign in to request another. Up to 3 emails per hour.",accountCreatedVerify:"Your account is ready. Check your email; verification enables submissions.",accountCreatedEmailPending:"Your account is ready, but the verification email could not be sent. Sign in and retry later.",verificationSent:"Verification email sent. Check your inbox and spam folder.",verificationInvalid:"This link is invalid, expired or already used. Sign in to request another.",emailVerified:"Email verified. You can now submit.",emailAlreadyVerified:"The submission email for this account is already verified.",verificationRateLimited:"The email could not be sent. Check your verification status or try later.",resetSentGeneric:"If an account uses this email, reset instructions have been sent.",passwordTooShort:"Use at least 10 characters for your password.",resetLinkInvalid:"This reset link is invalid or expired. Request a new one.",passwordUpdateFailed:"The password could not be updated. Reopen a valid reset link.",usernameFormat:"Username must be 3–24 English letters, numbers or underscores.",signupFormat:"Enter a valid email and a password of at least 10 characters.",signupUnavailable:"Sign-up could not be completed. Check the details, try later or use another email.",usernameUnavailable:"That username is taken or could not be saved. Choose another.",invalidCredentials:"Email or password is incorrect.",signInUnavailable:"Sign-in is unavailable right now. Try again later.",profilePending:"Account setup is incomplete. Contact site support.",accountRestricted:"This account cannot sign in right now.",serviceUnavailable:"This service is temporarily unavailable. Try again later.",emailSendUnavailable:"Verification email could not be sent. Try again later.",signInFirst:"Sign in before requesting a verification email.",passwordUpdated:"Password updated. Sign in with your new password.",pending:"Working…"
  },
  ms: {
    signinTitle:"Log masuk ke MMWR",signupTitle:"Cipta akaun",forgotTitle:"Tetapkan semula kata laluan",resetTitle:"Tetapkan kata laluan baharu",verifyTitle:"Sahkan e-mel anda",resendTitle:"Hantar semula e-mel pengesahan",signinIntro:"Log masuk untuk membaca hantaran awam penuh dan menggunakan Reaction. Pengesahan e-mel hanya diperlukan sebelum menghantar hantaran.",signupIntro:"Anda boleh log masuk dan membaca selepas mendaftar. Sahkan e-mel sebelum menghantar hantaran.",email:"Alamat e-mel",password:"Kata laluan",newPassword:"Kata laluan baharu",username:"Nama pengguna",signin:"Log masuk",signup:"Cipta akaun",forgot:"Lupa kata laluan?",noAccount:"Belum mempunyai akaun?",hasAccount:"Sudah mempunyai akaun?",createOne:"Daftar sekarang",backSignin:"Kembali ke log masuk",sendReset:"Hantar arahan tetapan semula",confirmPassword:"Kemas kini kata laluan",confirmEmail:"Sahkan dan sahkan e-mel",sendVerification:"Hantar e-mel pengesahan",signOut:"Log keluar",signedInIntro:"Anda telah log masuk. Pengesahan e-mel menentukan kelayakan menghantar hantaran; ia tidak mengehadkan bacaan penuh atau Reaction.",profileSetupRequired:"Akaun anda sedia. Tetapkan nama pengguna untuk meneruskan.",emailVerifyHelp:"Untuk mengelakkan pengimbas e-mel mengesahkan secara automatik, buka pautan dan kemudian sahkan pada halaman ini. Pautan tamat dalam 30 minit dan hanya boleh digunakan sekali.",resendHelp:"Pautan tamat tempoh atau belum diterima? Log masuk untuk meminta pautan baharu. Maksimum 3 e-mel sejam.",accountCreatedVerify:"Akaun anda sedia. Semak e-mel; pengesahan membolehkan hantaran.",accountCreatedEmailPending:"Akaun anda sedia tetapi e-mel pengesahan belum dapat dihantar. Log masuk dan cuba lagi kemudian.",verificationSent:"E-mel pengesahan dihantar. Semak peti masuk dan folder spam.",verificationInvalid:"Pautan ini tidak sah, tamat tempoh atau telah digunakan. Log masuk untuk meminta pautan baharu.",emailVerified:"E-mel disahkan. Anda kini boleh menghantar hantaran.",emailAlreadyVerified:"E-mel akaun ini telah disahkan untuk hantaran.",verificationRateLimited:"E-mel tidak dapat dihantar. Semak status pengesahan atau cuba lagi kemudian.",resetSentGeneric:"Jika akaun menggunakan e-mel ini, arahan tetapan semula telah dihantar.",passwordTooShort:"Kata laluan mestilah sekurang-kurangnya 10 aksara.",resetLinkInvalid:"Pautan tetapan semula tidak sah atau tamat tempoh. Minta pautan baharu.",passwordUpdateFailed:"Kata laluan tidak dapat dikemas kini. Buka semula pautan yang sah.",usernameFormat:"Nama pengguna mesti 3–24 huruf Inggeris, nombor atau garis bawah.",signupFormat:"Masukkan e-mel yang sah dan kata laluan sekurang-kurangnya 10 aksara.",signupUnavailable:"Pendaftaran tidak dapat diselesaikan. Semak maklumat, cuba lagi atau gunakan e-mel lain.",usernameUnavailable:"Nama pengguna telah digunakan atau tidak dapat disimpan. Pilih yang lain.",invalidCredentials:"E-mel atau kata laluan tidak betul.",signInUnavailable:"Log masuk tidak tersedia sekarang. Cuba lagi kemudian.",profilePending:"Persediaan akaun belum lengkap. Hubungi sokongan laman.",accountRestricted:"Akaun ini tidak boleh log masuk sekarang.",serviceUnavailable:"Perkhidmatan sementara tidak tersedia. Cuba lagi kemudian.",emailSendUnavailable:"E-mel pengesahan tidak dapat dihantar. Cuba lagi kemudian.",signInFirst:"Log masuk sebelum meminta e-mel pengesahan.",passwordUpdated:"Kata laluan dikemas kini. Log masuk dengan kata laluan baharu.",pending:"Sedang diproses…"
  }
} as const;

export function AuthForms({mode, signedIn = false, passwordUpdated = false, verified = false, redirectTo = "/"}: {mode: AuthMode; signedIn?: boolean; passwordUpdated?: boolean; verified?: boolean; redirectTo?: string}) {
  const {locale} = usePreferences();
  const words = text[locale];
  const [signInState, signInForm, signingIn] = useActionState(signInAction, initial);
  const [signUpState, signUpForm, signingUp] = useActionState(signUpAction, initial);
  const [resetRequestState, resetRequestForm, requestingReset] = useActionState(requestPasswordResetAction, initial);
  const [passwordState, passwordForm, settingPassword] = useActionState(setNewPasswordAction, initial);
  const [verificationState, verificationForm, verifying] = useActionState(verifyEmailAction, initial);
  const [resendState, resendForm, resending] = useActionState(requestEmailVerificationAction, initial);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (mode !== "verify") return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    setToken(fragment.get("token") ?? "");
  }, [mode]);

  const title = mode === "signup" ? words.signupTitle : mode === "forgot" ? words.forgotTitle : mode === "reset" ? words.resetTitle : mode === "verify" ? words.verifyTitle : mode === "resend" ? words.resendTitle : signedIn ? words.emailAlreadyVerified : words.signinTitle;
  return <section className="auth-panel" aria-labelledby="auth-title">
    <p className="eyebrow">MMWR · ACCOUNT</p>
    <h1 id="auth-title">{title}</h1>
    {mode === "signin" && !signedIn && <p className="auth-intro">{words.signinIntro}</p>}
    {mode === "resend" && <p className="auth-intro">{words.signedInIntro}</p>}
    {mode === "signup" && <p className="auth-intro">{words.signupIntro}</p>}
    {mode === "verify" && <p className="auth-intro">{words.emailVerifyHelp}</p>}
    {mode === "resend" && <p className="auth-intro">{words.resendHelp}</p>}
    {passwordUpdated && <p className="auth-message" role="status">{words.passwordUpdated}</p>}
    {mode === "signin" && !signedIn && <form action={signInForm} className="auth-form">
      <input type="hidden" name="next" value={redirectTo}/>
      <label>{words.email}<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
      <label>{words.password}<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
      <button className="button button-primary" disabled={signingIn}>{signingIn ? words.pending : words.signin}</button>
      {signInState.key && <p role="alert" className="auth-message">{words[signInState.key as keyof typeof words] ?? words.serviceUnavailable}</p>}
      {signInState.key === "profileSetupRequired" && <a href="/account/complete-profile">{words.profileSetupRequired}</a>}
    </form>}
    {mode === "signup" && <form action={signUpForm} className="auth-form">
      <label>{words.username}<input name="username" type="text" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" required/></label>
      <label>{words.email}<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
      <label>{words.password}<input name="password" type="password" autoComplete="new-password" minLength={10} required maxLength={256}/></label>
      <button className="button button-primary" disabled={signingUp}>{signingUp ? words.pending : words.signup}</button>
      {signUpState.key && <p role={signUpState.ok ? "status" : "alert"} className="auth-message">{words[signUpState.key as keyof typeof words] ?? words.serviceUnavailable}</p>}
      {signUpState.key === "profileSetupRequired" && <a href="/account/complete-profile">{words.profileSetupRequired}</a>}
    </form>}
    {mode === "forgot" && <form action={resetRequestForm} className="auth-form">
      <label>{words.email}<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
      <button className="button button-primary" disabled={requestingReset}>{requestingReset ? words.pending : words.sendReset}</button>
      {resetRequestState.key && <p role="status" className="auth-message">{words[resetRequestState.key as keyof typeof words] ?? words.serviceUnavailable}</p>}
    </form>}
    {mode === "reset" && <form action={passwordForm} className="auth-form">
      <label>{words.newPassword}<input name="password" type="password" autoComplete="new-password" minLength={10} required maxLength={256}/></label>
      <button className="button button-primary" disabled={settingPassword}>{settingPassword ? words.pending : words.confirmPassword}</button>
      {passwordState.key && <p role={passwordState.ok ? "status" : "alert"} className="auth-message">{words[passwordState.key as keyof typeof words] ?? words.serviceUnavailable}</p>}
    </form>}
    {mode === "verify" && !verificationState.ok && <form action={verificationForm} className="auth-form">
      <input type="hidden" name="token" value={token} readOnly/>
      <button className="button button-primary" disabled={verifying || token.length !== 64}>{verifying ? words.pending : words.confirmEmail}</button>
      {verificationState.key && <p role="alert" className="auth-message">{words[verificationState.key as keyof typeof words] ?? words.serviceUnavailable}</p>}
    </form>}
    {mode === "verify" && <form action={resendForm} className="auth-form auth-resend">
      <button className="button button-outline" disabled={resending}>{resending ? words.pending : words.sendVerification}</button>
      {resendState.key && <p role={resendState.ok ? "status" : "alert"} className="auth-message">{words[resendState.key as keyof typeof words] ?? words.serviceUnavailable}</p>}
    </form>}
    {mode === "resend" && <form action={resendForm} className="auth-form">
      {!verified && <button className="button button-primary" disabled={resending}>{resending ? words.pending : words.sendVerification}</button>}
      {verified && <p className="auth-message" role="status">{words.emailAlreadyVerified}</p>}
      {resendState.key && <p role={resendState.ok ? "status" : "alert"} className="auth-message">{words[resendState.key as keyof typeof words] ?? words.serviceUnavailable}</p>}
    </form>}
    {mode === "resend" && <form action={signOutAction} className="auth-form"><button className="button button-outline">{words.signOut}</button></form>}
    {mode === "signin" && !signedIn && <div className="auth-links"><a href="/account/forgot-password">{words.forgot}</a><span>{words.noAccount} <a href="/account/signup">{words.createOne}</a></span></div>}
    {mode === "signup" && <div className="auth-links"><span>{words.hasAccount} <a href="/account">{words.backSignin}</a></span></div>}
    {(mode === "forgot" || mode === "reset") && <div className="auth-links"><a href="/account">{words.backSignin}</a></div>}
    {(mode === "verify" || mode === "resend") && <div className="auth-links"><a href="/account">{words.backSignin}</a></div>}
  </section>;
}
