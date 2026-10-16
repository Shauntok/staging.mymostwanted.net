import "server-only";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import type {PublicPost} from "@/lib/public-posts";
import {isAllowedSubmissionSocialUrl} from "@/lib/submissions/social-links.mjs";

const fields = "post_id,approved_title,primary_name,public_excerpt,last_listed_at,public_tag_labels,public_area_name";
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicReactionType="helpful"|"thanks"|"support";
export type PublicReactionSummary={reaction_type:PublicReactionType;reaction_count:number;selected_by_viewer:boolean};
export type PublishedPostDetail = PublicPost & {fullBody: string | null; signedIn: boolean;canReact:boolean;reactions:PublicReactionSummary[]|null;clarificationPostId:string|null;publicSocialLinks:{platform:"facebook"|"instagram"|"tiktok"|"telegram";url:string}[]};
export type PublishedPostResult = {post: PublishedPostDetail | null; unavailable: boolean;permanentlyRemoved:boolean};

export async function getPublishedPostDetail(postId: string): Promise<PublishedPostResult> {
  if (!idPattern.test(postId)) return {post: null, unavailable: false,permanentlyRemoved:false};
  try {
    const supabase = await createSupabaseServerClient();
    const {data: preview, error: previewError} = await supabase
      .from("published_previews")
      .select(fields)
      .eq("post_id", postId.toLowerCase())
      .eq("content_type", "story")
      .maybeSingle();
    if (previewError) return {post: null, unavailable: true,permanentlyRemoved:false};
    if (!preview) {
      const {data:removed,error:removedError}=await supabase.rpc("post_is_permanently_removed",{p_post_id:postId.toLowerCase()});
      if(removedError)return {post:null,unavailable:true,permanentlyRemoved:false};
      return {post:null,unavailable:false,permanentlyRemoved:removed===true};
    }

    const {data: {user}} = await supabase.auth.getUser();
    let canRead = false;
    let canReact = false;
    if (user) {
      const {data: profile, error: profileError} = await supabase
        .from("profiles")
        .select("account_state")
        .eq("id", user.id)
        .maybeSingle();
      canRead = !profileError && (profile?.account_state === "active" || profile?.account_state === "suspended");
      canReact = !profileError && profile?.account_state === "active";
    }

    let fullBody: string | null = null;
    if (canRead) {
      const {data, error} = await supabase.rpc("read_published_post_body", {p_post_id: postId.toLowerCase()});
      if (error) return {post: null, unavailable: true,permanentlyRemoved:false};
      fullBody = typeof data === "string" ? data : null;
      if (fullBody === null) return {post: null, unavailable: false,permanentlyRemoved:false};
    }

    const {data:reactionData,error:reactionError}=await supabase.rpc("public_reaction_breakdown",{p_post_id:postId.toLowerCase()});
    const reactionRows=!reactionError&&Array.isArray(reactionData)?(reactionData as {reaction_type:PublicReactionType;reaction_count:number|string;selected_by_viewer:boolean}[]).map(reaction=>({
      reaction_type:reaction.reaction_type,
      reaction_count:Number(reaction.reaction_count),
      selected_by_viewer:reaction.selected_by_viewer===true,
    })).filter(reaction=>["helpful","thanks","support"].includes(reaction.reaction_type)&&Number.isSafeInteger(reaction.reaction_count)&&reaction.reaction_count>=0):null;
    const reactions=reactionRows&&new Set(reactionRows.map(reaction=>reaction.reaction_type)).size===3?reactionRows:null;
    const {data:clarificationRows,error:clarificationError}=await supabase.rpc("public_clarification_for_story",{p_son_post_id:postId.toLowerCase()});
    const clarificationCandidate=Array.isArray(clarificationRows)?clarificationRows[0]:null;
    const clarificationPostId=!clarificationError&&clarificationCandidate&&typeof clarificationCandidate.clarification_post_id==="string"&&idPattern.test(clarificationCandidate.clarification_post_id)?clarificationCandidate.clarification_post_id:null;
    const {data:socialRows,error:socialError}=await supabase.from("published_social_links").select("platform,url").eq("post_id",postId.toLowerCase());
    const publicSocialLinks=!socialError&&Array.isArray(socialRows)?socialRows.flatMap((row:unknown)=>{
      if(!row||typeof row!=="object")return[];const item=row as Record<string,unknown>;
      if(!isAllowedSubmissionSocialUrl(item.platform,item.url))return[];
      return[{platform:item.platform as "facebook"|"instagram"|"tiktok"|"telegram",url:item.url}];
    }):[];
    return {post: {...preview as PublicPost, fullBody, signedIn: canRead,canReact,reactions,clarificationPostId,publicSocialLinks}, unavailable: false,permanentlyRemoved:false};
  } catch {
    return {post: null, unavailable: true,permanentlyRemoved:false};
  }
}

