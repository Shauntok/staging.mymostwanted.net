import {createHash} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {createPublicThumbnail} from "./thumbnails.mjs";

const MAX_FILE_BYTES=10*1024*1024;
const CHUNK_BYTES=64*1024;
const apiOrigin=process.env.MMWR_SCANNER_API_ORIGIN;
const storageOrigin=process.env.MMWR_SUPABASE_STORAGE_ORIGIN;
const token=process.env.EVIDENCE_SCANNER_TOKEN;
const publicThumbnailsEnabled=process.env.MMWR_PUBLIC_THUMBNAILS_ENABLED==="true";
const clamdHost=process.env.CLAMD_HOST??"clamav";
const clamdPort=Number(process.env.CLAMD_PORT??"3310");

if(!apiOrigin||!storageOrigin||!token||Buffer.byteLength(token,"utf8")<32||!Number.isInteger(clamdPort)||clamdPort<1||clamdPort>65535){
  throw new Error("Scanner configuration is incomplete.");
}

const apiBase=new URL(apiOrigin);
const storageBase=new URL(storageOrigin);
if(!isAllowedOrigin(apiBase)||!isAllowedOrigin(storageBase)||!isBareOrigin(apiBase)||!isBareOrigin(storageBase)){
  throw new Error("Scanner origins must be bare HTTPS origins (localhost is allowed for local development).");
}

function isAllowedOrigin(url){
  if(url.protocol==="https:")return true;
  // The packaged worker sets NODE_ENV=production, so loopback HTTP is limited
  // to an explicitly non-production local development process.
  return process.env.NODE_ENV!=="production"
    &&url.protocol==="http:"
    &&(url.hostname==="localhost"||url.hostname==="127.0.0.1");
}

function isBareOrigin(url){return !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==="/";}

function apiUrl(path){
  const url=new URL(path,apiBase);
  if(url.origin!==apiBase.origin)throw new Error("Invalid scanner API origin.");
  return url;
}

async function apiPost(path,body){
  const response=await fetch(apiUrl(path),{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(30_000),
    headers:{authorization:`Bearer ${token}`,"content-type":"application/json","cache-control":"no-store"},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  if(!response.ok)throw new Error(`Scanner API returned ${response.status}.`);
  return response.json();
}

async function apiUploadThumbnail(job,bytes){
  const response=await fetch(apiUrl("/api/internal/evidence-scanner/thumbnail"),{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(30_000),
    headers:{
      authorization:`Bearer ${token}`,
      "content-type":"image/webp",
      "cache-control":"no-store",
      "x-mmwr-scan-job-id":job.id,
      "x-mmwr-scan-lease-token":job.leaseToken,
    },
    body:bytes,
  });
  if(!response.ok)throw new Error("Thumbnail storage failed.");
}

function validateSignedUrl(value){
  const url=new URL(value);
  if(url.origin!==storageBase.origin||!isAllowedOrigin(url)||url.username||url.password||url.hash
    ||!url.pathname.startsWith("/storage/v1/object/sign/mmwr-evidence-quarantine/")){
    throw Object.assign(new Error("The signed object URL is outside the configured private bucket."),{reasonCode:"invalid_file_signature"});
  }
  return url;
}

async function downloadBounded(signedUrl){
  const response=await fetch(signedUrl,{redirect:"error",signal:AbortSignal.timeout(120_000),cache:"no-store"});
  if(!response.ok||!response.body)throw Object.assign(new Error("Storage download failed."),{reasonCode:"storage_unavailable"});
  const declaredSize=Number(response.headers.get("content-length"));
  if(Number.isFinite(declaredSize)&&declaredSize>MAX_FILE_BYTES)throw Object.assign(new Error("File exceeds the scanner size limit."),{reasonCode:"unsupported_file_type"});
  const parts=[];
  let total=0;
  for await(const part of response.body){
    const chunk=Buffer.from(part);
    total+=chunk.length;
    if(total>MAX_FILE_BYTES)throw Object.assign(new Error("File exceeds the scanner size limit."),{reasonCode:"unsupported_file_type"});
    parts.push(chunk);
  }
  if(total===0)throw Object.assign(new Error("Empty evidence files are not supported."),{reasonCode:"invalid_file_signature"});
  return Buffer.concat(parts,total);
}

function hasOoxmlEntries(bytes){
  const start=Math.max(0,bytes.length-65_557);
  let eocd=-1;
  for(let i=bytes.length-22;i>=start;i--){
    if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){eocd=i;break;}
  }
  if(eocd<0)return false;
  const entries=bytes.readUInt16LE(eocd+10);
  const centralOffset=bytes.readUInt32LE(eocd+16);
  if(entries>10_000||centralOffset>=bytes.length)return false;
  let offset=centralOffset;
  let foundContentTypes=false;
  let foundDocument=false;
  for(let i=0;i<entries;i++){
    if(offset+46>bytes.length||bytes.readUInt32LE(offset)!==0x02014b50)return false;
    const nameLength=bytes.readUInt16LE(offset+28);
    const extraLength=bytes.readUInt16LE(offset+30);
    const commentLength=bytes.readUInt16LE(offset+32);
    const flags=bytes.readUInt16LE(offset+8);
    if((flags&1)!==0)return false;
    if(offset+46+nameLength+extraLength+commentLength>bytes.length)return false;
    const name=bytes.toString("utf8",offset+46,offset+46+nameLength);
    if(name==="[Content_Types].xml")foundContentTypes=true;
    if(name==="word/document.xml")foundDocument=true;
    offset+=46+nameLength+extraLength+commentLength;
  }
  return foundContentTypes&&foundDocument;
}

function matchesMimeSignature(mime,bytes){
  const type=mime.toLowerCase();
  if(type==="image/jpeg")return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==="image/png")return bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(type==="image/webp")return bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(type==="application/pdf")return bytes.subarray(0,5).toString("ascii")==="%PDF-";
  if(type==="audio/mpeg")return bytes.subarray(0,3).toString("ascii")==="ID3"||(bytes.length>=2&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
  if(type==="audio/wav"||type==="audio/x-wav")return bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WAVE";
  if(type==="audio/mp4")return bytes.length>=12&&bytes.toString("ascii",4,8)==="ftyp";
  if(type==="application/msword")return bytes.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
  if(type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document")return bytes.length>=4&&bytes.readUInt32LE(0)===0x04034b50&&hasOoxmlEntries(bytes);
  return false;
}

function connectClamd(){
  const socket=net.createConnection({host:clamdHost,port:clamdPort});
  const operationTimeout=setTimeout(()=>socket.destroy(new Error("ClamAV operation timed out.")),120_000);
  operationTimeout.unref();
  let result=Buffer.alloc(0);
  let replySettled=false;
  let resolveReply;
  let rejectReply;
  const reply=new Promise((resolve,reject)=>{resolveReply=resolve;rejectReply=reject;});
  void reply.catch(()=>{});
  socket.once("close",()=>{
    clearTimeout(operationTimeout);
    if(!replySettled){
      replySettled=true;
      rejectReply(new Error("ClamAV closed before returning a response."));
    }
  });
  socket.on("data",chunk=>{
    if(replySettled)return;
    result=Buffer.concat([result,chunk]);
    if(result.length>4096){replySettled=true;rejectReply(new Error("ClamAV response is too large."));socket.destroy();return;}
    if(result.includes(0)||result.includes(10)){replySettled=true;resolveReply(result.toString("utf8").replace(/[\0\r\n]/g,""));}
  });
  socket.on("error",error=>{if(!replySettled){replySettled=true;rejectReply(error);}});
  return new Promise((resolve,reject)=>{
    socket.once("connect",()=>resolve({
      socket,
      send:async bytes=>{
        if(!socket.write(bytes))await new Promise((res,rej)=>{
          const cleanup=()=>{
            socket.off("drain",onDrain);
            socket.off("error",onError);
            socket.off("close",onClose);
          };
          const onDrain=()=>{cleanup();res();};
          const onError=error=>{cleanup();rej(error);};
          const onClose=()=>{cleanup();rej(new Error("ClamAV closed while receiving data."));};
          socket.once("drain",onDrain);
          socket.once("error",onError);
          socket.once("close",onClose);
        });
      },
      readResult:()=>reply,
    }));
    socket.once("error",reject);
  });
}

async function clamdCommand(command){
  const {socket,send,readResult}=await connectClamd();
  try{await send(Buffer.from(`z${command}\0`));return await readResult();}finally{socket.destroy();}
}

async function scanWithClamd(bytes){
  const {socket,send,readResult}=await connectClamd();
  try{
    await send(Buffer.from("zINSTREAM\0"));
    for(let offset=0;offset<bytes.length;offset+=CHUNK_BYTES){
      const chunk=bytes.subarray(offset,Math.min(offset+CHUNK_BYTES,bytes.length));
      const length=Buffer.alloc(4);length.writeUInt32BE(chunk.length);
      await send(length);await send(chunk);
    }
    await send(Buffer.alloc(4));
    const response=await readResult();
    if(response.endsWith(": OK")||response==="stream: OK")return "clean";
    if(response.includes(" FOUND"))return "infected";
    throw new Error("ClamAV returned an unexpected result.");
  }finally{socket.destroy();}
}

async function processJob(job){
  let outcome="error";
  let reasonCode="scanner_error";
  let digest=null;
  let engineVersion=null;
  let signatureVersion=null;
  try{
    const signedUrl=validateSignedUrl(job.signedUrl);
    const bytes=await downloadBounded(signedUrl);
    digest=createHash("sha256").update(bytes).digest("hex");
    if(!matchesMimeSignature(job.mimeType,bytes)){
      outcome="unsupported";reasonCode="invalid_file_signature";
    }else{
      const version=await clamdCommand("VERSION");
      const versionMatch=/^(ClamAV [^/\r\n]+)/.exec(version);
      engineVersion=versionMatch?.[1]?.slice(0,100)??null;
      const dbVersion=version.split("/")[1];
      signatureVersion=dbVersion?.slice(0,100)??null;
      outcome=await scanWithClamd(bytes);
      reasonCode=outcome==="clean"?"scan_clean":outcome==="infected"?"malware_detected":"scanner_error";
      if(outcome==="clean"&&publicThumbnailsEnabled&&job.publicThumbnailEligible===true){
        try{
          const thumbnail=await createPublicThumbnail(bytes,job.mimeType);
          await apiUploadThumbnail(job,thumbnail);
        }catch{
          // A safe thumbnail is optional; its failure never changes the malware verdict.
        }
      }
    }
  }catch(error){
    outcome=error?.reasonCode==="unsupported_file_type"||error?.reasonCode==="invalid_file_signature"?"unsupported":"error";
    reasonCode=error?.reasonCode??"scanner_unavailable";
  }
  await apiPost("/api/internal/evidence-scanner/result",{
    jobId:job.id,leaseToken:job.leaseToken,outcome,reasonCode,sha256:digest,engineVersion,signatureVersion,
  });
}

let stopping=false;
process.on("SIGINT",()=>{stopping=true;});
process.on("SIGTERM",()=>{stopping=true;});

console.info("MMWR evidence scanner worker started.");
while(!stopping){
  try{
    // Do not lease work while clamd is still starting or unavailable. Failed
    // scans consume retry attempts, so claim only after the daemon answers.
    const clamdStatus=await clamdCommand("PING");
    if(stopping)break;
    if(clamdStatus!=="PONG"){
      await delay(10_000);
      continue;
    }
    const response=await apiPost("/api/internal/evidence-scanner/claim");
    if(response.job)await processJob(response.job);
    else if(!stopping)await delay(5_000);
  }catch{
    await delay(10_000);
  }
}
