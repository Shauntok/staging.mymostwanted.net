import assert from "node:assert/strict";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import test from "node:test";

const scriptPath=fileURLToPath(new URL("./check-migration-rollback-coverage.mjs",import.meta.url));

async function makeProject(files){
  const root=await mkdtemp(path.join(os.tmpdir(),"mmwr-migration-rollback-"));
  for(const [relativePath,content] of Object.entries(files)){
    const filePath=path.join(root,relativePath);
    await mkdir(path.dirname(filePath),{recursive:true});
    await writeFile(filePath,content,"utf8");
  }
  return root;
}

function check(root){
  return spawnSync(process.execPath,[scriptPath,"--root",root],{encoding:"utf8"});
}

test("rollback coverage accepts migration filenames listed across nested rollback guides",async()=>{
  const root=await makeProject({
    "supabase/migrations/20261001000000_first.sql":"select 1;",
    "supabase/migrations/archive/20261002000000_second.sql":"select 2;",
    "docs/operations/PHASE2_ROLLBACK.md":"`20261001000000_first.sql`\n",
    "docs/operations/archive/PHASE3_MIGRATION_ROLLBACK.md":"`20261002000000_second.sql`\n",
    "docs/operations/PHASE3_STAGING_ACCEPTANCE.md":"not a rollback guide\n",
  });
  try{
    const result=check(root);
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.match(result.stdout,/2\/2 migration files.*2 rollback guides/);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test("rollback coverage fails and names every migration missing an exact guide entry",async()=>{
  const root=await makeProject({
    "supabase/migrations/20261001000000_first.sql":"select 1;",
    "supabase/migrations/20261002000000_second.sql":"select 2;",
    "docs/operations/PHASE2_ROLLBACK.md":"`20261001000000_first.sql` and `prefix-20261002000000_second.sql.backup`\n",
  });
  try{
    const result=check(root);
    assert.equal(result.status,1,result.stdout+result.stderr);
    const output=result.stdout+result.stderr;
    assert.match(output,/20261002000000_second\.sql/);
    assert.doesNotMatch(output,/20261001000000_first\.sql/);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
