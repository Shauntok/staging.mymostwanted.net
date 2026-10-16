import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {createClient} from "@supabase/supabase-js";
import {createPublicThumbnailHandler} from "./delivery.mjs";

const enabled=process.env.MMWR_TEST_LOCAL_THUMBNAIL_DELIVERY==="true";

test("local Supabase Storage serves a synthetic private derivative only through the guarded handler",{skip:!enabled},async t=>{
  const url=process.env.SUPABASE_URL;
  const secretKey=process.env.SUPABASE_SECRET_KEY;
  const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.ok(url&&secretKey&&publishableKey,"explicit local URL and server/client keys are required");
  const parsedUrl=new URL(url);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(parsedUrl.hostname),"thumbnail Storage test must use loopback");
  assert.notEqual(process.env.NODE_ENV,"production");

  const suffix=randomUUID().replaceAll("-","").slice(0,16);
  const bucket=`mmwr-thumb-${suffix}`;
  const userId=randomUUID();
  const jobId=randomUUID();
  const leaseToken=randomUUID();
  const objectPath=`${userId}/${jobId}/${leaseToken}.webp`;
  const bytes=await sharp({create:{width:3,height:2,channels:4,background:{r:43,g:126,b:166,alpha:1}}}).webp().toBuffer();
  const admin=createClient(url,secretKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const anon=createClient(url,publishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  let bucketCreated=false;
  let eligible=true;
  let storageReads=0;

  t.after(async()=>{
    if(bucketCreated){
      const removed=await admin.storage.from(bucket).remove([objectPath]);
      if(removed.error)throw new Error("Local thumbnail test object cleanup failed.");
      const deleted=await admin.storage.deleteBucket(bucket);
      if(deleted.error)throw new Error("Local thumbnail test bucket cleanup failed.");
      const inventory=await admin.storage.listBuckets();
      if(inventory.error||inventory.data?.some(item=>item.id===bucket))throw new Error("Local thumbnail test bucket remains after cleanup.");
    }
  });

  const inventory=await admin.storage.listBuckets();
  assert.equal(inventory.error,null,"local Storage inventory must be available");
  assert.equal(inventory.data?.some(item=>item.id===bucket),false,"unique synthetic test bucket must not already exist");
  const created=await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:512*1024,allowedMimeTypes:["image/webp"]});
  assert.equal(created.error,null,"private synthetic bucket must be created");
  bucketCreated=true;
  const uploaded=await admin.storage.from(bucket).upload(objectPath,bytes,{contentType:"image/webp",cacheControl:"0",upsert:false});
  assert.equal(uploaded.error,null,"synthetic derivative must upload without overwrite");

  const handler=createPublicThumbnailHandler({
    isEnabled:()=>true,
    resolvePath:async()=>eligible?objectPath:null,
    download:async path=>{
      storageReads+=1;
      const result=await admin.storage.from(bucket).download(path);
      if(result.error||!result.data)return null;
      return {bytes:Buffer.from(await result.data.arrayBuffer()),size:result.data.size};
    },
  });

  const delivered=await handler(new Request("https://mmwr.example.test/thumbnail"),{
    params:Promise.resolve({postId:"10000000-0000-4000-8000-000000000001",position:"0"}),
  });
  assert.equal(delivered.status,200);
  assert.equal(delivered.headers.get("cache-control"),"private, no-store, max-age=0");
  assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),bytes);

  const direct=await anon.storage.from(bucket).download(objectPath);
  assert.ok(direct.error||!direct.data,"anonymous Storage access must not read a private derivative");

  eligible=false;
  const revoked=await handler(new Request("https://mmwr.example.test/thumbnail"),{
    params:Promise.resolve({postId:"10000000-0000-4000-8000-000000000001",position:"0"}),
  });
  assert.equal(revoked.status,404);
  assert.equal(storageReads,1,"revocation must be checked before the next Storage read");
});
