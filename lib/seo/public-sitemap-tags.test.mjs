import assert from "node:assert/strict";
import test from "node:test";
import {countPublicSitemapTagIds,listPublicSitemapTagIds} from "./public-sitemap-tags.mjs";

function makeTagId(index){
  return `00000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
}

function fakeSupabase(total,serverMaxRows=1_000){
  const ids=Array.from({length:total},(_,index)=>makeTagId(index+1));
  const calls=[];
  return {
    calls,
    rpc(name,args,options){
      calls.push({name,args,options});
      if(options?.head)return Promise.resolve({count:ids.length,error:null});
      return {
        async range(start,end){
          const requestedEnd=Math.min(end+1,start+serverMaxRows);
          return {data:ids.slice(start,requestedEnd).map(tag_id=>({tag_id})),error:null};
        },
      };
    },
  };
}

test("sitemap tag count uses an exact head request without downloading all IDs",async()=>{
  const supabase=fakeSupabase(1_001);
  assert.equal(await countPublicSitemapTagIds(supabase),1_001);
  assert.deepEqual(supabase.calls,[{
    name:"public_sitemap_tag_ids",
    args:{},
    options:{count:"exact",head:true},
  }]);
});

test("sitemap tag pages stay under the API cap and cover more than 1,000 IDs without gaps",async()=>{
  const supabase=fakeSupabase(1_001);
  const pages=await Promise.all([
    listPublicSitemapTagIds(supabase,0,500),
    listPublicSitemapTagIds(supabase,500,500),
    listPublicSitemapTagIds(supabase,1_000,500),
  ]);
  const ids=pages.flat().map(tag=>tag.tag_id);
  assert.equal(ids.length,1_001);
  assert.equal(new Set(ids).size,1_001);
  assert.equal(ids[0],makeTagId(1));
  assert.equal(ids.at(-1),makeTagId(1_001));
  assert.deepEqual(supabase.calls.map(({name,args})=>({name,args})),[
    {name:"public_sitemap_tag_ids",args:{}},
    {name:"public_sitemap_tag_ids",args:{}},
    {name:"public_sitemap_tag_ids",args:{}},
  ]);
});

test("sitemap tag page rejects unsafe ranges and invalid IDs",async()=>{
  const supabase=fakeSupabase(1);
  assert.equal(await listPublicSitemapTagIds(supabase,-1,500),null);
  assert.equal(await listPublicSitemapTagIds(supabase,0,501),null);
  const invalid={rpc(){return {range:async()=>({data:[{tag_id:"private"},{tag_id:makeTagId(1)}],error:null})};}};
  assert.equal(await listPublicSitemapTagIds(invalid,0,500),null);
  const failed={rpc(){return {range:async()=>({data:null,error:new Error("unavailable")})};}};
  assert.equal(await listPublicSitemapTagIds(failed,0,500),null);
  assert.deepEqual(await listPublicSitemapTagIds(fakeSupabase(0),0,500),[]);
});
