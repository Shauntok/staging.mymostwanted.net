import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

async function collectFiles(directory,accept){
  const entries=await readdir(directory,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const fullPath=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await collectFiles(fullPath,accept));
    else if(entry.isFile()&&accept(entry.name))files.push(fullPath);
  }
  return files.sort();
}

export async function auditMigrationRollbackCoverage(root){
  const migrationsPath=path.join(root,"supabase","migrations");
  const operationsPath=path.join(root,"docs","operations");
  const [migrationFiles,rollbackFiles]=await Promise.all([
    collectFiles(migrationsPath,name=>name.toLowerCase().endsWith(".sql")),
    collectFiles(operationsPath,name=>name.toLowerCase().endsWith(".md")&&/rollback/i.test(name)),
  ]);
  const guideContents=await Promise.all(rollbackFiles.map(file=>readFile(file,"utf8")));
  const missing=[];

  for(const migrationPath of migrationFiles){
    const migrationName=path.basename(migrationPath);
    if(!guideContents.some(content=>content.includes(`\`${migrationName}\``)))missing.push(migrationName);
  }

  return {migrationCount:migrationFiles.length,guideCount:rollbackFiles.length,missing};
}

function parseRootArgument(args,defaultRoot){
  const index=args.indexOf("--root");
  if(index<0)return defaultRoot;
  const root=args[index+1];
  if(!root||root.startsWith("--"))throw new Error("--root requires a project directory.");
  return path.resolve(root);
}

const defaultRoot=fileURLToPath(new URL("..",import.meta.url));
try{
  const result=await auditMigrationRollbackCoverage(parseRootArgument(process.argv.slice(2),defaultRoot));
  if(result.migrationCount===0||result.guideCount===0){
    console.error("Rollback coverage could not be evaluated: migrations or rollback guides are missing.");
    process.exitCode=1;
  }else if(result.missing.length){
    console.error(`Missing rollback entries: ${result.missing.join(", ")}`);
    process.exitCode=1;
  }else{
    console.log(`Rollback coverage: ${result.migrationCount}/${result.migrationCount} migration files found in ${result.guideCount} rollback guides.`);
  }
}catch(error){
  console.error(`Rollback coverage could not be evaluated: ${error instanceof Error?error.message:"unknown error"}`);
  process.exitCode=1;
}
