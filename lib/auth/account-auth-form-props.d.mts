type AuthState = {kind?:string;verified?:unknown}|null;
type AccountAuthFormProps =
  | {mode:"resend";signedIn:true;verified:boolean;staffSessionExpired:boolean;turnstileSiteKey:string|null}
  | {mode:"signin";passwordUpdated:boolean;staffSessionExpired:boolean;redirectTo:string;turnstileSiteKey:string|null};
export function accountAuthFormProps(input:{accountState:AuthState;passwordUpdated?:boolean;staffSessionExpired?:boolean;redirectTo?:string;turnstileSiteKey?:string|null}):AccountAuthFormProps;
export function verificationAuthFormProps(turnstileSiteKey?:string|null):{mode:"verify";turnstileSiteKey:string|null};
