import {execFile} from "node:child_process";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {promisify} from "node:util";

const execFileAsync=promisify(execFile);
const image="ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f";
const repository=resolve(process.cwd());
const temporaryDirectory=await mkdtemp(join(tmpdir(),"mmwr-secret-scan-"));
const historyConfig=join(temporaryDirectory,"history.toml");
const workingTreeConfig=join(temporaryDirectory,"working-tree.toml");

await writeFile(historyConfig,`title = "MMWR Git history scan"\n[extend]\nuseDefault = true\n`,{encoding:"utf8",mode:0o600});
await writeFile(workingTreeConfig,`title = "MMWR working tree scan"\n[extend]\nuseDefault = true\n[[allowlists]]\ndescription = "Ignore generated and machine-local files excluded from version control"\npaths = [\n  '''(^|/)(\\.git|node_modules|\\.next[^/]*|\\.vercel|coverage|out)/''',\n  '''(^|/)supabase/\\.temp/''',\n  '''(^|/)\\.env\\.local$''',\n  '''(^|/)\\.env\\.(development|test|production)\\.local$''',\n]\n`,{encoding:"utf8",mode:0o600});

async function scan(command,configPath){
  const args=[
    "run","--rm","--read-only","--tmpfs","/tmp:rw,nosuid,nodev,size=64m",
    "--mount",`type=bind,source=${repository},target=/repo,readonly`,
    "--mount",`type=bind,source=${configPath},target=/scan-config.toml,readonly`,
    "--workdir","/repo",image,command,
    "--config","/scan-config.toml","--redact=100","--no-banner",
    "--report-format","json","--report-path","-","/repo",
  ];
  let stdout="";
  let exitCode=0;
  try{
    ({stdout}=await execFileAsync("docker",args,{windowsHide:true,maxBuffer:32*1024*1024}));
  }catch(error){
    if(typeof error?.code!=="number")throw new Error("Gitleaks container could not run; scanner output was suppressed.");
    exitCode=error.code;
    stdout=error.stdout??"";
  }
  if(exitCode!==0&&exitCode!==1)throw new Error(`Gitleaks ${command} scan failed with exit code ${exitCode}; scanner output was suppressed.`);
  let parsed;
  try{parsed=JSON.parse(stdout);}catch{throw new Error(`Gitleaks ${command} scan returned invalid output; scanner output was suppressed.`);}
  if(!Array.isArray(parsed))throw new Error(`Gitleaks ${command} scan returned an unexpected report; scanner output was suppressed.`);
  return parsed.map(finding=>({rule:finding.RuleID??"unknown",file:finding.File??"unknown",line:finding.StartLine??0,commit:finding.Commit??undefined}));
}

try{
  const historyFindings=await scan("git",historyConfig);
  const workingTreeFindings=await scan("dir",workingTreeConfig);
  const findings=[...historyFindings.map(finding=>({scope:"history",...finding})),...workingTreeFindings.map(finding=>({scope:"working-tree",...finding}))];
  process.stdout.write(`Gitleaks scanned Git history and the non-generated working tree: ${findings.length} finding(s).\n`);
  for(const finding of findings)process.stdout.write(`${JSON.stringify(finding)}\n`);
  if(findings.length>0)process.exitCode=1;
}finally{
  await rm(temporaryDirectory,{recursive:true,force:true});
}
