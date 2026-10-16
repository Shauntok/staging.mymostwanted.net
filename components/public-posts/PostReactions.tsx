"use client";

import {useEffect,useState} from "react";
import Link from "@/components/shell/LocalizedLink";
import {ReactionGlyph,type ReactionIconId} from "@/components/public-posts/ReactionGlyph";
import type {PublicReactionSummary} from "@/lib/published-post-detail";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {togglePostReactionAction} from "@/app/posts/actions";
import styles from "./PostReactions.module.css";

const copy={
  "zh-CN":{title:"Reaction",unavailable:"Reaction 暂时不可用。",guest:"登录后可对这篇内容回应。",signin:"登录后回应",restricted:"当前账号暂不能使用 Reaction。",helpful:"有帮助",thanks:"谢谢",support:"支持",unavailableError:"提交未成功，请稍后再试。"},
  en:{title:"Reactions",unavailable:"Reactions are temporarily unavailable.",guest:"Sign in to react to this post.",signin:"Sign in to react",restricted:"This account cannot use reactions right now.",helpful:"Helpful",thanks:"Thanks",support:"Support",unavailableError:"Your reaction was not saved. Please try again."},
  ms:{title:"Reaksi",unavailable:"Reaksi tidak tersedia buat sementara waktu.",guest:"Log masuk untuk memberikan reaksi pada hantaran ini.",signin:"Log masuk untuk bereaksi",restricted:"Akaun ini tidak boleh menggunakan reaksi sekarang.",helpful:"Berguna",thanks:"Terima kasih",support:"Sokongan",unavailableError:"Reaksi anda tidak disimpan. Cuba lagi kemudian."},
} as const;

const kinds=["helpful","thanks","support"] as const;
const defaults={helpful:"spark",thanks:"heart",support:"hands"} satisfies Record<(typeof kinds)[number],ReactionIconId>;

function parseIcons(value:unknown):Record<(typeof kinds)[number],ReactionIconId>|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  const allowed:ReactionIconId[]=["spark","heart","thumbs_up","hands","check","lightbulb"];
  if(kinds.some(key=>typeof row[key]!=="string"||!allowed.includes(row[key] as ReactionIconId)))return null;
  return {helpful:row.helpful as ReactionIconId,thanks:row.thanks as ReactionIconId,support:row.support as ReactionIconId};
}

export function PostReactions({postId,reactions,signedIn,canReact,locale,showError=false}:{postId:string;reactions:PublicReactionSummary[]|null;signedIn:boolean;canReact:boolean;locale:"zh-CN"|"en"|"ms";showError?:boolean}){
  const t=copy[locale];
  const [icons,setIcons]=useState<Record<(typeof kinds)[number],ReactionIconId>>(defaults);
  useEffect(()=>{let active=true;void (async()=>{try{const {data,error}=await createSupabaseBrowserClient().rpc("public_reaction_icon_settings");const parsed=parseIcons(data);if(!error&&parsed&&active)setIcons(parsed);}catch{/* Built-in defaults stay available if the public settings endpoint is unavailable. */}})();return()=>{active=false;};},[]);
  return <section className={styles.panel} id="reactions" aria-labelledby="reaction-heading">
    <h2 id="reaction-heading">{t.title}</h2>
    {showError&&<p className={styles.message} role="status">{t.unavailableError}</p>}
    {reactions===null?<p className={styles.message} role="status">{t.unavailable}</p>:<>
      <ul className={styles.list}>{kinds.map(key=>{
        const reaction=reactions.find(row=>row.reaction_type===key);
        const count=reaction?.reaction_count??0;
        const selected=reaction?.selected_by_viewer??false;
        return <li key={key}>{canReact?<form action={togglePostReactionAction}>
          <input type="hidden" name="postId" value={postId}/><input type="hidden" name="reactionType" value={key}/>
          <button type="submit" aria-pressed={selected} disabled={!reaction} className={selected?styles.selected:undefined}><span className={styles.icon}><ReactionGlyph iconId={icons[key]}/></span><span>{t[key]}</span><b>{new Intl.NumberFormat(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY").format(count)}</b></button>
        </form>:<button type="button" disabled aria-pressed={selected} className={selected?styles.selected:undefined}><span className={styles.icon}><ReactionGlyph iconId={icons[key]}/></span><span>{t[key]}</span><b>{new Intl.NumberFormat(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY").format(count)}</b></button>}</li>;
      })}</ul>
      {!signedIn?<p className={styles.message}>{t.guest} <Link href={`/account?next=${encodeURIComponent(`/posts/${postId}`)}`}>{t.signin} →</Link></p>:!canReact?<p className={styles.message}>{t.restricted}</p>:null}
    </>}
  </section>;
}
