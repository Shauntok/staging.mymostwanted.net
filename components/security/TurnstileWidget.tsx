"use client";

import Script from "next/script";
import {useCallback,useEffect,useRef} from "react";

type WidgetOptions={
  sitekey:string;
  action:string;
  theme:"auto"|"light"|"dark";
  appearance:"interaction-only"|"always"|"execute";
  callback:(token:string)=>void;
  "expired-callback":()=>void;
  "error-callback":()=>void;
};
type TurnstileApi={render:(container:HTMLElement,options:WidgetOptions)=>string;reset:(id:string)=>void;remove:(id:string)=>void};
declare global {interface Window {turnstile?:TurnstileApi}}

export function TurnstileWidget({siteKey,action,resetKey,nonce,onToken,onError}:{siteKey:string;action:string;resetKey:number;nonce:string|null;onToken:(token:string)=>void;onError:()=>void}){
  const container=useRef<HTMLDivElement>(null);const widgetId=useRef<string|null>(null);const lastReset=useRef(resetKey);
  const onTokenRef=useRef(onToken);const onErrorRef=useRef(onError);
  useEffect(()=>{onTokenRef.current=onToken;onErrorRef.current=onError;},[onToken,onError]);

  const renderWidget=useCallback(()=>{
    const api=window.turnstile;const element=container.current;
    if(!api||!element||widgetId.current)return;
    try{
      widgetId.current=api.render(element,{
        sitekey:siteKey,action,appearance:"interaction-only",theme:"auto",
        callback:(token)=>onTokenRef.current(token),
        "expired-callback":()=>onTokenRef.current(""),
        "error-callback":()=>{onTokenRef.current("");onErrorRef.current();},
      });
    }catch{onErrorRef.current();}
  },[siteKey,action]);

  useEffect(()=>()=>{
    if(widgetId.current&&window.turnstile){window.turnstile.remove(widgetId.current);widgetId.current=null;}
  },[]);

  useEffect(()=>{
    if(lastReset.current===resetKey)return;
    lastReset.current=resetKey;onTokenRef.current("");
    if(widgetId.current&&window.turnstile)window.turnstile.reset(widgetId.current);
  },[resetKey]);

  return <>
    <div ref={container} aria-live="polite"/>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" nonce={nonce??undefined} onReady={renderWidget} onError={()=>onErrorRef.current()}/>
  </>;
}
