import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const port=await getAvailablePort();
const baseUrl=`http://127.0.0.1:${port}`;
const serverEnv={...process.env};
for(const key of Object.keys(serverEnv)){
  if(/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|AWS_|R2_|SMTP_|RESEND_)/i.test(key))serverEnv[key]="";
}
Object.assign(serverEnv,{
  NODE_ENV:"production",
  PORT:String(port),
  HOSTNAME:"127.0.0.1",
  MMWR_VALIDATION_DIST_DIR:".next-validation-ci",
  VERCEL_ENV:"preview",
  ALLOW_SEARCH_INDEXING:"false",
  NEXT_PUBLIC_SITE_URL:"",
  MMWR_IP_BLOCK_ENABLED:"false",
  MMWR_IP_BLOCK_HMAC_SECRET:"",
  MMWR_IP_BLOCK_TRUSTED_CLIENT_IP_HEADER:"",
  HOT_RANKING_ENABLED:"false",
  FIRST_PARTY_ANALYTICS_ENABLED:"false",
  VALID_READS_ENABLED:"false",
  NEXT_PUBLIC_VALID_READS_ENABLED:"false",
});

const child=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","-H","127.0.0.1","-p",String(port)],{
  cwd:root,
  env:serverEnv,
  stdio:["ignore","ignore","ignore"],
  windowsHide:true,
});

try{
  await waitForReady(child,baseUrl);
  const locales=[
    {prefix:"/zh-cn",htmlLang:"zh-CN"},
    {prefix:"/en",htmlLang:"en"},
    {prefix:"/ms",htmlLang:"ms"},
  ];
  const sampleRoutes=[
    "",
    "/submit",
    "/admin",
    "/account",
    "/submissions",
    "/report",
    "/areas?state=Johor",
    "/clarifications",
    "/clarifications/123e4567-e89b-42d3-a456-426614174000",
    "/hot",
    "/latest",
    "/posts/123e4567-e89b-42d3-a456-426614174000",
    "/tags",
    "/tags/123e4567-e89b-42d3-a456-426614174000",
    "/search",
  ];

  for(const locale of locales){
    for(const route of sampleRoutes){
      const pathname=`${locale.prefix}${route}`;
      const response=await fetch(new URL(pathname,baseUrl),{signal:AbortSignal.timeout(20_000)});
      assert.equal(response.status,200,`${pathname} should return HTTP 200`);
      assertSecurityHeaders(response.headers,pathname);
      const html=await response.text();
      assertNoindex(html,pathname);
      assertHtmlLang(html,locale.htmlLang,pathname);
      assertSingleMainLandmark(html,pathname);
      if(route==="")assertNonceCsp(response.headers,html,pathname);
      console.log(`PASS ${pathname}: 200, security headers, noindex, lang=${locale.htmlLang}`);
    }
  }

  const robots=await fetch(new URL("/robots.txt",baseUrl),{signal:AbortSignal.timeout(20_000)});
  assert.equal(robots.status,200,"/robots.txt should return HTTP 200");
  const robotsText=await robots.text();
  assert.match(robotsText,/User-Agent:\s*\*/i,"robots.txt should include a global rule");
  assert.match(robotsText,/Disallow:\s*\//i,"robots.txt should block crawling while indexing is closed");
  assert.doesNotMatch(robotsText,/^Sitemap:/im,"robots.txt must not advertise a sitemap while indexing is closed");
  assertSecurityHeaders(robots.headers,"/robots.txt");
  console.log("PASS /robots.txt: global disallow, no sitemap, security headers");

  const sitemap=await fetch(new URL("/sitemap.xml",baseUrl),{redirect:"manual",signal:AbortSignal.timeout(20_000)});
  assert.equal(sitemap.status,404,"/sitemap.xml should fail closed while indexing is disabled");
  assertSecurityHeaders(sitemap.headers,"/sitemap.xml");
  console.log("PASS /sitemap.xml: 404 while indexing is disabled");
}finally{
  await stopChild(child);
}

async function getAvailablePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  const address=server.address();
  assert(address&&typeof address!=="string","Could not reserve a loopback port");
  const {port:availablePort}=address;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return availablePort;
}

async function waitForReady(process,origin){
  const deadline=Date.now()+60_000;
  while(Date.now()<deadline){
    if(process.exitCode!==null)throw new Error(`Local production server exited early (${process.exitCode})`);
    try{
      const response=await fetch(origin,{redirect:"manual",signal:AbortSignal.timeout(1_500)});
      if(response.status>0)return;
    }catch{
      await new Promise(resolve=>setTimeout(resolve,350));
    }
  }
  throw new Error("Local production server did not become ready within 60 seconds");
}

function assertSecurityHeaders(headers,pathname){
  assert.equal(headers.get("x-content-type-options"),"nosniff",`${pathname} should send nosniff`);
  assert.equal(headers.get("x-frame-options"),"DENY",`${pathname} should deny framing`);
  assert.equal(headers.get("referrer-policy"),"strict-origin-when-cross-origin",`${pathname} should set Referrer-Policy`);
  assert.equal(headers.get("permissions-policy"),"camera=(), microphone=(), geolocation=(), browsing-topics=()",`${pathname} should restrict browser capabilities`);
  assert.match(headers.get("strict-transport-security")??/^$/, /max-age=31536000/,`${pathname} should send production HSTS`);
  assert.ok(headers.get("content-security-policy"),`${pathname} should send CSP`);
}

function assertNoindex(html,pathname){
  const robotsMeta=html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0]??"";
  assert.ok(robotsMeta,`${pathname} should render a robots meta tag`);
  assert.match(robotsMeta,/\bcontent=["'][^"']*\bnoindex\b/i,`${pathname} should render noindex`);
}

function assertHtmlLang(html,expected,pathname){
  const root=html.match(/<html\b[^>]*>/i)?.[0]??"";
  assert.match(root,new RegExp(`\\blang=["']${expected}["']`,"i"),`${pathname} should render lang=${expected}`);
}

function assertSingleMainLandmark(html,pathname){
  const count=[...html.matchAll(/<main\b/gi)].length;
  assert.equal(count,1,`${pathname} should render exactly one main landmark`);
}

function assertNonceCsp(headers,html,pathname){
  const csp=headers.get("content-security-policy")??"";
  const nonce=csp.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce,`${pathname} CSP should include a nonce`);
  assert.ok(html.includes(`nonce="${nonce}"`),`${pathname} HTML should apply the CSP nonce to inline content`);
}

async function stopChild(process){
  if(process.exitCode!==null)return;
  process.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve=>process.once("exit",resolve)),
    new Promise(resolve=>setTimeout(()=>{
      if(process.exitCode===null)process.kill("SIGKILL");
      resolve();
    },5_000)),
  ]);
}
