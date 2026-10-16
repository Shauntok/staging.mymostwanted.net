import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const SOURCE_DIRECTORIES=["app","components","lib","scripts","backup","account-deletion","scanner"];
const SOURCE_ROOT_FILES=["proxy.ts","next.config.ts"];
const SOURCE_EXTENSIONS=new Set([".ts",".tsx",".js",".jsx",".mjs",".cjs"]);
const IGNORED_PLATFORM_ENV=new Set(["NODE_ENV","VERCEL_ENV","CI","npm_execpath","npm_node_execpath"]);
const IGNORED_DIRECTORIES=new Set([".git",".next",".next-validation","node_modules","out","build","coverage"]);

function addMatches(target,source,pattern,group=1){
  for(const match of source.matchAll(pattern))if(match[group])target.add(match[group]);
}

function addDestructuredNames(target,source,assignmentPattern){
  for(const match of source.matchAll(assignmentPattern)){
    for(const property of match[1].split(",")){
      const name=property.trim().match(/^([A-Za-z_$][\w$]*)/);
      if(name)target.add(name[1]);
    }
  }
}

export function extractRuntimeEnvNames(source){
  const names=new Set();
  addMatches(names,source,/\bprocess\s*\.\s*env\s*\.\s*([A-Za-z_$][\w$]*)/g);
  addMatches(names,source,/\bprocess\s*\.\s*env\s*\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\]/g);
  addDestructuredNames(names,source,/\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*process\s*\.\s*env\b/g);

  const aliases=new Set();
  addMatches(aliases,source,/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\s*\.\s*env\b(?!\s*[.\[])/g);
  addMatches(aliases,source,/\b([A-Za-z_$][\w$]*)\s*=\s*process\s*\.\s*env\b(?!\s*[.\[])/g);
  for(const alias of aliases){
    const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    addMatches(names,source,new RegExp(`\\b${escaped}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`,"g"));
    addMatches(names,source,new RegExp(`\\b${escaped}\\s*\\[\\s*['"]([A-Za-z_$][\\w$]*)['"]\\s*\\]`,"g"));
    addDestructuredNames(names,source,new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*${escaped}\\b`,"g"));
  }
  return names;
}

function isSourceFile(name){
  return SOURCE_EXTENSIONS.has(name.slice(name.lastIndexOf(".")))
    && !/\.(?:test|spec)\./.test(name)
    && !name.endsWith(".d.ts");
}

async function listSourceFiles(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    if(entry.isDirectory()){
      if(!IGNORED_DIRECTORIES.has(entry.name))files.push(...await listSourceFiles(resolve(directory,entry.name)));
    }else if(entry.isFile()&&isSourceFile(entry.name))files.push(resolve(directory,entry.name));
  }
  return files;
}

function parseExampleNames(source){
  const names=new Set();
  for(const line of source.split(/\r?\n/)){
    const match=line.match(/^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if(match)names.add(match[1]);
  }
  return names;
}

export async function collectRuntimeEnvExampleGaps(projectRoot=process.cwd()){
  const root=resolve(projectRoot);
  const exampleNames=parseExampleNames(await readFile(resolve(root,".env.example"),"utf8"));
  const referencedNames=new Set();
  for(const directory of SOURCE_DIRECTORIES){
    const absolute=resolve(root,directory);
    for(const file of await listSourceFiles(absolute)){
      for(const name of extractRuntimeEnvNames(await readFile(file,"utf8")))referencedNames.add(name);
    }
  }
  for(const file of SOURCE_ROOT_FILES){
    const absolute=resolve(root,file);
    try{
      for(const name of extractRuntimeEnvNames(await readFile(absolute,"utf8")))referencedNames.add(name);
    }catch(error){if(error?.code!=="ENOENT")throw error;}
  }
  return [...referencedNames].filter(name=>!exampleNames.has(name)&&!IGNORED_PLATFORM_ENV.has(name)).sort();
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const gaps=await collectRuntimeEnvExampleGaps();
  if(gaps.length){
    console.error(`Runtime environment variables missing from .env.example: ${gaps.join(", ")}`);
    process.exitCode=1;
  }else console.log("Runtime environment references are covered by .env.example or platform-provided variables.");
}
