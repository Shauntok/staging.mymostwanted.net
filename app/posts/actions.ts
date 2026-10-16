"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";

const postIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reactionTypes=new Set(["helpful","thanks","support"]);

export async function togglePostReactionAction(formData:FormData):Promise<void>{
  const rawPostId=formData.get("postId");
  const rawReactionType=formData.get("reactionType");
  if(typeof rawPostId!=="string"||!postIdPattern.test(rawPostId)||typeof rawReactionType!=="string"||!reactionTypes.has(rawReactionType))return;
  const postId=rawPostId.toLowerCase();
  let succeeded=false;
  let signedOut=false;
  let restricted=false;
  try{
    const supabase=await createSupabaseServerClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){signedOut=true;}
    else {
      const {data:profile,error:profileError}=await supabase.from("profiles").select("account_state").eq("id",user.id).maybeSingle();
      if(profileError||profile?.account_state!=="active")restricted=true;
      else {
        const {data,error}=await supabase.rpc("toggle_my_post_reaction",{p_post_id:postId,p_reaction_type:rawReactionType});
        const result=Array.isArray(data)?data[0]:data;
        succeeded=!error&&(result as {accepted?:boolean}|null)?.accepted===true;
      }
    }
  }catch{
    succeeded=false;
  }
  if(signedOut)redirect(`/account?next=${encodeURIComponent(`/posts/${postId}`)}`);
  if(restricted)redirect(`/posts/${postId}?reaction=unavailable#reactions`);
  if(!succeeded)redirect(`/posts/${postId}?reaction=unavailable#reactions`);
  revalidatePath(`/posts/${postId}`);
  redirect(`/posts/${postId}#reactions`);
}
