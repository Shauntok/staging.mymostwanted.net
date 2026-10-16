import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {createClient} from "@supabase/supabase-js";
import {createPublicThumbnailHandler} from "./delivery.mjs";

const enabled=process.env.MMWR_TEST_LOCAL_THUMBNAIL_DATABASE==="true";
const postId="10000000-0000-4000-8000-000000000099";

function localSql(sql){
  const npmCli=process.env.npm_execpath;
  if(typeof npmCli!=="string"||npmCli.length===0)throw new Error("Run the opt-in local database test through npm.");
  const result=spawnSync(process.execPath,[npmCli,"exec","--","supabase","db","query","--local","--output-format","json",sql],{
    encoding:"utf8",
    timeout:30000,
    windowsHide:true,
    env:process.env,
  });
  if(result.error||result.status!==0)throw new Error("Local thumbnail database status query failed.");
  const jsonStart=result.stdout.indexOf("{");
  const jsonEnd=result.stdout.lastIndexOf("}");
  if(jsonStart<0||jsonEnd<jsonStart)throw new Error("Local thumbnail database status response was invalid.");
  const parsed=JSON.parse(result.stdout.slice(jsonStart,jsonEnd+1));
  if(!Array.isArray(parsed.rows))throw new Error("Local thumbnail database status rows were invalid.");
  return parsed.rows;
}

test("local Supabase routes thumbnail lookups through the default-off database gate without writes",{skip:!enabled},async()=>{
  const url=process.env.SUPABASE_URL;
  const secretKey=process.env.SUPABASE_SECRET_KEY;
  assert.ok(url&&secretKey,"explicit local Supabase URL and server key are required");
  const parsedUrl=new URL(url);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(parsedUrl.hostname),"thumbnail database test must use loopback");
  assert.notEqual(process.env.NODE_ENV,"production");

  const flags=localSql("select enabled from private.runtime_flags where flag = 'public_thumbnails'");
  assert.equal(flags.length,1,"local thumbnail gate must exist");
  assert.equal(flags[0].enabled,false,"the local thumbnail feature gate must remain OFF during this test");

  const supabase=createClient(url,secretKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  let resolverCalls=0;
  let storageCalls=0;
  const handler=createPublicThumbnailHandler({
    // The test invokes the in-process handler to exercise its real database
    // resolver; the Next route's environment gate is not changed.
    isEnabled:()=>true,
    resolvePath:async(id,position)=>{
      resolverCalls+=1;
      const {data,error}=await supabase.rpc("mmwr_public_thumbnail_path",{
        p_post_id:id,p_position:position,
      });
      if(error)throw error;
      return data;
    },
    download:async()=>{
      storageCalls+=1;
      throw new Error("Storage must not be queried while the database gate is closed.");
    },
  });

  const response=await handler(new Request("https://mmwr.example.test/thumbnail"),{
    params:Promise.resolve({postId,position:"0"}),
  });
  assert.equal(response.status,404);
  assert.equal(response.headers.get("cache-control"),"private, no-store, max-age=0");
  assert.equal(await response.text(),"");
  assert.equal(resolverCalls,1,"the handler must consult the actual local database resolver");
  assert.equal(storageCalls,0,"closed eligibility must prevent Storage reads");
});
