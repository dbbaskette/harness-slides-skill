#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile, symlink, readlink, lstat, rename, rm, open, realpath } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { hash, digest } from './lib/common.mjs';
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const roots=['SKILL.md','LICENSE','NOTICE.md','package.json','package-lock.json','bootstrap','guidance','references','scripts','examples'];
async function files(root) {
  const out=new Map();
  async function visit(name){const path=join(root,name),s=await lstat(path);if(s.isSymbolicLink())throw new Error(`Package symlink: ${name}`);if(s.isDirectory()){for(const item of (await readdir(path)).sort())await visit(`${name}/${item}`);}else if(s.isFile())out.set(name,await readFile(path));else throw new Error('Unsupported package member');}
  for(const name of roots)await visit(name);out.set('SKILL.md', await readFile(join(root, 'bootstrap/SKILL.md')));return out;
}
async function state(path){try{const s=await lstat(path);return s.isSymbolicLink()?{link:await readlink(path)}:{other:true};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function safeParent(path){await mkdir(path,{recursive:true});const resolved=await realpath(path);const stat=await lstat(resolved);if(!stat.isDirectory()||(stat.mode&0o022)!==0||typeof process.getuid==='function'&&stat.uid!==process.getuid())throw new Error(`Unsafe installer directory: ${path}`);return resolved;}
export async function install({source=packageRoot,shared=process.platform==='darwin'?join(homedir(),'Library','Application Support','Harness Slides'):join(homedir(),'.local','share','harness-slides'),targets,home=homedir(),dryRun=false}={}) {
  source=resolve(source);shared=resolve(shared);
  targets??=['.agents/skills','.claude/skills','.cursor/skills'].map(path=>join(home,path,'harness-slides'));
  targets=targets.map(p=>resolve(p));
  if(new Set(targets).size!==targets.length||targets.some(p=>p===shared||p.startsWith(shared+'/')||shared.startsWith(p+'/')))throw new Error('Install destinations overlap');
  const payload=await files(source),checks=Object.fromEntries([...payload].map(([name,bytes])=>[name,hash(bytes)])),contentDigest=digest(checks),version=JSON.parse(payload.get('package.json')).version;
  const id=`${version}-${contentDigest.slice(0,20)}`,runtime=join(shared,'versions',id),current=join(shared,'current');
  const previous=await state(current);
  if(previous&&(!previous.link||!/^versions\/[\w.-]+$/.test(previous.link)))throw new Error('Unrecognized shared pointer; preserve it');
  for(const target of targets){const s=await state(target);if(s&&s.link!==current)throw new Error(`Existing unrelated skill: ${target}. Preserve or move it before installing.`);}
  if(dryRun)return {status:'dry run',shared,runtime,targets,contentDigest};
  await safeParent(shared);const lock=await open(join(shared,'.install-lock'),'wx',0o600),created=[];
  try{
    await safeParent(join(shared,'versions'));
    const existing=await state(runtime);
    if(existing){for(const [name,sha] of Object.entries(checks))if(hash(await readFile(join(runtime,name)))!==sha)throw new Error('Retained runtime was modified; preserve it and repair the installation');}
    else {
      const stage=join(shared,'versions',`.stage-${randomUUID()}`);await mkdir(stage);
      try{for(const [name,bytes] of payload){await mkdir(dirname(join(stage,name)),{recursive:true});await writeFile(join(stage,name),bytes,{flag:'wx',mode:0o644});}await writeFile(join(stage,'.harness-install.json'),JSON.stringify({version,contentDigest,checks}),{flag:'wx'});await rename(stage,runtime);}
      finally{await rm(stage,{recursive:true,force:true});}
    }
    // Prepare discovery links before replacing the single active pointer.
    for(const target of targets){await safeParent(dirname(target));if(!await state(target)){await symlink(current,target);created.push(target);}}
    if(JSON.stringify(await state(current))!==JSON.stringify(previous))throw new Error('Installer pointer changed concurrently');
    const temp=join(shared,`.pointer-${randomUUID()}`);await symlink(`versions/${id}`,temp);try{await rename(temp,current);}finally{await rm(temp,{force:true});}
    return {status:'installed',shared,runtime,targets,contentDigest,next:`For PPTX authoring: cd "${runtime}" && npm ci --omit=dev --ignore-scripts`};
  }catch(error){for(const target of created)if((await state(target))?.link===current)await rm(target);throw error;}
  finally{await lock.close();await rm(join(shared,'.install-lock'));}
}
async function main(){const {values:v}=parseArgs({options:{home:{type:'string'},shared:{type:'string'},'dry-run':{type:'boolean'},help:{type:'boolean'}}});if(v.help){console.log('Usage: node scripts/install.mjs [--home DIR] [--shared DIR] [--dry-run]');return;}console.log(JSON.stringify(await install({home:v.home,shared:v.shared,dryRun:v['dry-run']}),null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
