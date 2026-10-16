export type TurnstileVerification="valid"|"invalid"|"unavailable";

export function verifyTurnstile(token:string,expectedAction:string):Promise<TurnstileVerification>;
