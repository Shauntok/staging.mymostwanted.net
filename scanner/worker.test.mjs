import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {once} from "node:events";
import {spawn} from "node:child_process";
import {createServer as createHttpServer} from "node:http";
import net from "node:net";
import sharp from "sharp";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const projectRoot=fileURLToPath(new URL("../",import.meta.url));
const workerPath=fileURLToPath(new URL("./worker.mjs",import.meta.url));
const token="scanner-local-test-token-that-is-long-enough";
const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x01,0x02]);
const eicar=Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
const eicarPng=Buffer.concat([png,eicar]);

async function listen(server){
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  return server.address().port;
}

async function closeServer(server){
  if(!server?.listening)return;
  await new Promise(resolve=>server.close(resolve));
}

async function scanWithRealClamd(bytes){
  const socket=net.createConnection({host:"127.0.0.1",port:Number(process.env.MMWR_TEST_CLAMD_PORT??"3310")});
  try{
    await once(socket,"connect");
    const reply=new Promise((resolve,reject)=>{
      let result="";
      socket.on("data",chunk=>{
        result+=chunk.toString("utf8");
        if(result.includes(String.fromCharCode(0)))resolve(result.split(String.fromCharCode(0))[0]);
      });
      socket.once("error",reject);
    });
    socket.write(Buffer.from([122,...Buffer.from("INSTREAM"),0]));
    const length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);
    socket.write(length);socket.write(bytes);socket.write(Buffer.alloc(4));
    return await reply;
  }finally{socket.destroy();}
}

function sendJson(response,value){
  response.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
  response.end(JSON.stringify(value));
}

async function runWorker({bytes=png,mimeType="image/png",clamdVerdict="clean",signedPath,declaredSize,realClamd=false,thumbnailsEnabled=false,thumbnailEligible=false,thumbnailUploadStatus=200}={}){
  let claimCount=0;
  let downloadCount=0;
  const clamdCommands=[];
  const posts=[];
  let resolveResult;
  const resultReceived=new Promise(resolve=>{resolveResult=resolve;});
  const job={
    id:randomUUID(),
    leaseToken:randomUUID(),
    mimeType,
    publicThumbnailEligible:thumbnailEligible,
    signedUrl:"",
  };
  const thumbnailUploads=[];

  const apiServer=createHttpServer(async(request,response)=>{
    if(request.headers.authorization!==`Bearer ${token}`){
      response.writeHead(401);response.end();return;
    }
    if(request.method==="POST"&&request.url==="/api/internal/evidence-scanner/claim"){
      claimCount++;
      sendJson(response,{job:claimCount===1?job:null});
      return;
    }
    if(request.method==="POST"&&request.url==="/api/internal/evidence-scanner/result"){
      let raw="";
      for await(const chunk of request)raw+=chunk.toString("utf8");
      const value=JSON.parse(raw);
      posts.push(value);
      sendJson(response,{ok:true});
      resolveResult(value);
      return;
    }
    if(request.method==="POST"&&request.url==="/api/internal/evidence-scanner/thumbnail"){
      const chunks=[];
      for await(const chunk of request)chunks.push(Buffer.from(chunk));
      thumbnailUploads.push({
        bytes:Buffer.concat(chunks),
        contentType:request.headers["content-type"],
        jobId:request.headers["x-mmwr-scan-job-id"],
        leaseToken:request.headers["x-mmwr-scan-lease-token"],
      });
      response.writeHead(thumbnailUploadStatus,{"content-type":"application/json","cache-control":"no-store"});
      response.end(JSON.stringify({accepted:thumbnailUploadStatus===200}));
      return;
    }
    response.writeHead(404);response.end();
  });
  const apiPort=await listen(apiServer);

  const storageServer=createHttpServer((request,response)=>{
    downloadCount++;
    if(!request.url.startsWith("/storage/v1/object/sign/mmwr-evidence-quarantine/")){
      response.writeHead(404);response.end();return;
    }
    response.writeHead(200,{
      "content-type":"application/octet-stream",
      "content-length":String(declaredSize??bytes.length),
      "cache-control":"no-store",
    });
    response.end(bytes);
  });
  const storagePort=await listen(storageServer);
  job.signedUrl=`http://127.0.0.1:${storagePort}${signedPath??"/storage/v1/object/sign/mmwr-evidence-quarantine/synthetic-object"}?token=not-a-real-token`;

  const clamdServer=realClamd?null:net.createServer(socket=>{
    let buffer=Buffer.alloc(0);
    let mode="command";
    const scanned=[];
    const consume=()=>{
      if(mode==="command"){
        const end=buffer.indexOf(0);
        if(end<0)return;
        const framedCommand=buffer.subarray(0,end).toString("utf8");
        // ClamAV's z-prefixed commands are NUL-framed; the prefix selects
        // compressed replies and is not part of the command name.
        const command=framedCommand.startsWith("z")?framedCommand.slice(1):framedCommand;
        buffer=buffer.subarray(end+1);
        clamdCommands.push(command);
        if(command==="PING"){socket.end("PONG\0");return;}
        if(command==="VERSION"){socket.end("ClamAV 1.2.3/main.cvd:20261004/daily.cvd:123\0");return;}
        if(command!=="INSTREAM"){socket.destroy();return;}
        mode="stream";
      }
      while(mode==="stream"&&buffer.length>=4){
        const length=buffer.readUInt32BE(0);
        if(buffer.length<4+length)return;
        buffer=buffer.subarray(4);
        if(length===0){
          mode="done";
          const detected=Buffer.concat(scanned).includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
          const verdict=clamdVerdict==="infected"||detected?"stream: Eicar-Synthetic FOUND\0":"stream: OK\0";
          socket.end(verdict);
          return;
        }
        scanned.push(buffer.subarray(0,length));
        buffer=buffer.subarray(length);
      }
    };
    socket.on("data",chunk=>{buffer=Buffer.concat([buffer,chunk]);consume();});
  });
  const clamdPort=realClamd?Number(process.env.MMWR_TEST_CLAMD_PORT??"3310"):await listen(clamdServer);

  const child=spawn(process.execPath,[workerPath],{
    cwd:projectRoot,
    env:{
      ...Object.fromEntries(["PATH","SystemRoot","WINDIR","TEMP","TMP"].flatMap(name=>process.env[name]===undefined?[]:[[name,process.env[name]]])),
      NODE_ENV:"test",
      MMWR_SCANNER_API_ORIGIN:`http://127.0.0.1:${apiPort}`,
      MMWR_SUPABASE_STORAGE_ORIGIN:`http://127.0.0.1:${storagePort}`,
      EVIDENCE_SCANNER_TOKEN:token,
      MMWR_PUBLIC_THUMBNAILS_ENABLED:thumbnailsEnabled?"true":"false",
      CLAMD_HOST:"127.0.0.1",
      CLAMD_PORT:String(clamdPort),
    },
    stdio:["ignore","pipe","pipe"],
  });
  let output="";
  child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
  child.stdout.on("data",chunk=>{output+=chunk;});
  child.stderr.on("data",chunk=>{output+=chunk;});
  let childExit;
  const exited=new Promise(resolve=>child.once("exit",(code,signal)=>{childExit={code,signal};resolve(childExit);}));

  try{
    let resultTimeout;
    const result=await Promise.race([
      resultReceived,
      new Promise((_,reject)=>{resultTimeout=setTimeout(()=>reject(new Error(`Scanner worker timed out. ${output}`)),5000);}),
    ]).finally(()=>clearTimeout(resultTimeout));
    child.kill("SIGTERM");
    let stopTimeout;
    await Promise.race([
      exited,
      new Promise((_,reject)=>{stopTimeout=setTimeout(()=>reject(new Error(`Scanner worker did not stop. ${output}`)),2000);}),
    ]).finally(()=>clearTimeout(stopTimeout));
    return {result,posts,claimCount,downloadCount,clamdCommands,thumbnailUploads,childExit};
  }finally{
    if(child.exitCode===null)child.kill("SIGKILL");
    await Promise.all([closeServer(apiServer),closeServer(storageServer),closeServer(clamdServer)]);
  }
}

test("scanner worker reports a clean signed PNG with digest and fixed engine metadata",async()=>{
  const run=await runWorker();
  assert.equal(run.result.outcome,"clean");
  assert.equal(run.result.reasonCode,"scan_clean");
  assert.equal(run.result.sha256,createHash("sha256").update(png).digest("hex"));
  assert.equal(run.result.engineVersion,"ClamAV 1.2.3");
  assert.equal(run.result.signatureVersion,"main.cvd:20261004");
  assert.deepEqual(run.clamdCommands,["PING","VERSION","INSTREAM"]);
  assert.equal(run.posts.length,1);
  assert.deepEqual(Object.keys(run.result).sort(),[
    "engineVersion","jobId","leaseToken","outcome","reasonCode","sha256","signatureVersion",
  ]);
  assert.equal(JSON.stringify(run.result).includes("synthetic-object"),false);
});

test("scanner uploads only a sanitized derivative for clean and eligible image evidence",async()=>{
  const source=await sharp({create:{width:1200,height:800,channels:3,background:{r:40,g:120,b:180}}}).png().toBuffer();
  const run=await runWorker({bytes:source,thumbnailsEnabled:true,thumbnailEligible:true});

  assert.equal(run.result.outcome,"clean");
  assert.equal(run.result.sha256,createHash("sha256").update(source).digest("hex"));
  assert.equal(run.thumbnailUploads.length,1);
  assert.equal(run.thumbnailUploads[0].contentType,"image/webp");
  assert.equal(run.thumbnailUploads[0].jobId,run.result.jobId);
  assert.equal(run.thumbnailUploads[0].leaseToken,run.result.leaseToken);
  assert.equal(run.thumbnailUploads[0].bytes.toString("ascii",0,4),"RIFF");
  assert.equal(run.thumbnailUploads[0].bytes.toString("ascii",8,12),"WEBP");
  assert.notDeepEqual(run.thumbnailUploads[0].bytes,source);
  assert.deepEqual(Object.keys(run.result).sort(),[
    "engineVersion","jobId","leaseToken","outcome","reasonCode","sha256","signatureVersion",
  ]);
});

test("scanner does not generate thumbnails while the feature flag or eligibility is off",async()=>{
  const source=await sharp({create:{width:2,height:2,channels:3,background:{r:40,g:120,b:180}}}).png().toBuffer();
  const disabled=await runWorker({bytes:source,thumbnailsEnabled:false,thumbnailEligible:true});
  const internalOnly=await runWorker({bytes:source,thumbnailsEnabled:true,thumbnailEligible:false});
  assert.equal(disabled.result.outcome,"clean");
  assert.equal(internalOnly.result.outcome,"clean");
  assert.equal(disabled.thumbnailUploads.length,0);
  assert.equal(internalOnly.thumbnailUploads.length,0);
});

test("thumbnail decode failure does not turn a clean malware scan into an error",async()=>{
  const source=Buffer.concat([png,Buffer.alloc(16,0x01)]);
  const run=await runWorker({bytes:source,thumbnailsEnabled:true,thumbnailEligible:true});
  assert.equal(run.result.outcome,"clean");
  assert.equal(run.result.reasonCode,"scan_clean");
  assert.equal(run.thumbnailUploads.length,0);
});

test("thumbnail upload failure does not turn a clean malware scan into an error",async()=>{
  const source=await sharp({create:{width:2,height:2,channels:3,background:{r:40,g:120,b:180}}}).png().toBuffer();
  const run=await runWorker({bytes:source,thumbnailsEnabled:true,thumbnailEligible:true,thumbnailUploadStatus:503});
  assert.equal(run.result.outcome,"clean");
  assert.equal(run.result.reasonCode,"scan_clean");
  assert.equal(run.thumbnailUploads.length,1);
});

test("scanner worker quarantines a synthetic malware match",async()=>{
  const run=await runWorker({bytes:eicarPng,clamdVerdict:"infected"});
  assert.equal(run.result.outcome,"infected");
  assert.equal(run.result.reasonCode,"malware_detected");
  assert.equal(run.result.sha256,createHash("sha256").update(eicarPng).digest("hex"));
});

test("scanner worker rejects a MIME/signature mismatch without sending bytes to ClamAV",async()=>{
  const run=await runWorker({bytes:Buffer.from("not a PNG")});
  assert.equal(run.result.outcome,"unsupported");
  assert.equal(run.result.reasonCode,"invalid_file_signature");
  assert.deepEqual(run.clamdCommands,["PING"]);
  assert.equal(run.downloadCount,1);
});

test("scanner worker refuses a signed URL outside the private evidence bucket",async()=>{
  const run=await runWorker({signedPath:"/storage/v1/object/sign/public/example.png"});
  assert.equal(run.result.outcome,"unsupported");
  assert.equal(run.result.reasonCode,"invalid_file_signature");
  assert.equal(run.downloadCount,0);
  assert.deepEqual(run.clamdCommands,["PING"]);
});

test("scanner worker rejects an oversized object from its declared length",async()=>{
  const run=await runWorker({declaredSize:10*1024*1024+1});
  assert.equal(run.result.outcome,"unsupported");
  assert.equal(run.result.reasonCode,"unsupported_file_type");
  assert.equal(run.clamdCommands.length,1);
});

const realClamdEnabled=process.env.MMWR_TEST_REAL_CLAMD==="true";

test("scanner worker receives a clean verdict from a real local ClamAV daemon",{skip:!realClamdEnabled},async()=>{
  const run=await runWorker({realClamd:true});
  assert.equal(run.result.outcome,"clean");
  assert.equal(run.result.reasonCode,"scan_clean");
  assert.match(run.result.engineVersion??"",/^ClamAV 1\.4\.6/);
  assert.equal(run.posts.length,1);
});

test("real local ClamAV detects the canonical EICAR test signature",{skip:!realClamdEnabled},async()=>{
  const verdict=await scanWithRealClamd(eicar);
  assert.match(verdict,/Eicar-Test-Signature FOUND/);
});
