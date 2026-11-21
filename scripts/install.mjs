#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile, symlink, readlink, lstat, rename, rm, open, realpath } from 'node:fs/promises';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hash, digest } from './lib/common.mjs';
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const roots=['SKILL.md','LICENSE','NOTICE.md','package.json','package-lock.json','bootstrap','guidance','references','scripts','examples'];
async function files(root) {
  const out=new Map();
  async function visit(name){const path=join(root,name),s=await lstat(path);if(s.isSymbolicLink())throw new Error(`Package symlink: ${name}`);if(s.isDirectory()){for(const item of (await readdir(path)).sort())await visit(`${name}/${item}`);}else if(s.isFile())out.set(name,await readFile(path));else throw new Error('Unsupported package member');}
  for(const name of roots)await visit(name);out.set('SKILL.md', await readFile(join(root, 'bootstrap/SKILL.md')));return out;
}
async function state(path){try{const s=await lstat(path);return s.isSymbolicLink()?{link:await readlink(path)}:{other:true};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
// Where a skill link leads, in terms of this installation: its pointer, one of its version folders, or somewhere else.
// The link is compared as written and with its folder resolved, since a home folder is often reached through a link.
async function leads(target,link,shared){
  const written=resolve(dirname(target),link),places=[written];
  try{places.push(join(await realpath(dirname(written)),basename(written)));}catch{/* A link into a removed folder is judged as written. */}
  const bases=[shared];try{bases.push(await realpath(shared));}catch{/* Nothing is installed here yet. */}
  for(const base of bases)for(const place of places){
    if(place===join(base,'current'))return 'current';
    if(place.startsWith(join(base,'versions')+sep))return 'version';
  }
  return 'elsewhere';
}
async function repoint(target,current){const temp=`${target}.${randomUUID()}.tmp`;await symlink(current,temp);try{await rename(temp,target);}finally{await rm(temp,{force:true});}}
// After the pointer has moved, the other version folders are no longer used by anything this tool hands out. Only real
// folders directly inside this installation's own versions folder are removed; a link is never followed or removed.
async function removeOthers(shared,id){
  const versions=join(shared,'versions'),removed=[],kept=[];
  const own=await lstat(versions);if(!own.isDirectory()||own.isSymbolicLink())return {removed,kept:[{path:versions,reason:'not a real folder; older versions were left in place'}]};
  for(const entry of (await readdir(versions,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.name===id)continue;const path=join(versions,entry.name);
    if(entry.isSymbolicLink()){kept.push({path,reason:'a link, left alone'});continue;}
    if(!entry.isDirectory())continue;
    try{await rm(path,{recursive:true});removed.push(entry.name);}catch(error){kept.push({path,reason:String(error.message).split('\n')[0]});}
  }
  return {removed,kept};
}
async function safeParent(path){await mkdir(path,{recursive:true});const resolved=await realpath(path);const stat=await lstat(resolved);if(!stat.isDirectory()||(stat.mode&0o022)!==0||typeof process.getuid==='function'&&stat.uid!==process.getuid())throw new Error(`Unsafe installer directory: ${path}`);return resolved;}
export async function install({source=packageRoot,shared=process.platform==='darwin'?join(homedir(),'Library','Application Support','Harness Slides'):join(homedir(),'.local','share','harness-slides'),targets,home=homedir(),dryRun=false,dependencies=false,run=promisify(execFile)}={}) {
  source=resolve(source);shared=resolve(shared);
  targets??=['.agents/skills','.claude/skills','.cursor/skills'].map(path=>join(home,path,'harness-slides'));
  targets=targets.map(p=>resolve(p));
  if(new Set(targets).size!==targets.length||targets.some(p=>p===shared||p.startsWith(shared+'/')||shared.startsWith(p+'/')))throw new Error('Install destinations overlap');
  const payload=await files(source),checks=Object.fromEntries([...payload].map(([name,bytes])=>[name,hash(bytes)])),contentDigest=digest(checks),version=JSON.parse(payload.get('package.json')).version;
  const id=`${version}-${contentDigest.slice(0,20)}`,versioned=join(shared,'versions',id),current=join(shared,'current');
  const previous=await state(current);
  if(previous&&(!previous.link||!/^versions\/[\w.-]+$/.test(previous.link)))throw new Error('Unrecognized shared pointer; preserve it');
  // A skill link is made, kept, or moved off one of this installation's own version folders. Anything else there is
  // someone else's: it is left exactly as it is and reported, and the other harnesses are still installed.
  const plan=async()=>{const steps=[];for(const target of targets){const s=await state(target);steps.push({target,link:s?.link,action:!s?'create':s.link===undefined?'skip':{current:'keep',version:'repoint',elsewhere:'skip'}[await leads(target,s.link,shared)]});}return steps;};
  const foreign=steps=>steps.filter(step=>step.action==='skip').map(({target,link})=>({target,reason:`${link===undefined?'a file or folder that this installer did not make':`a link to ${link}`}; left alone. Move it aside and install again to use Harness Slides there`}));
  if(dryRun){const steps=await plan();return {status:'dry run',shared,runtime:current,versionId:id,targets,skipped:foreign(steps),contentDigest,runtimeVersion:version};}
  await safeParent(shared);const lock=await open(join(shared,'.install-lock'),'wx',0o600),created=[],moved=[];
  try{
    await safeParent(join(shared,'versions'));
    const existing=await state(versioned);
    if(existing){for(const [name,sha] of Object.entries(checks))if(hash(await readFile(join(versioned,name)))!==sha)throw new Error('Retained runtime was modified; preserve it and repair the installation');}
    else {
      const stage=join(shared,'versions',`.stage-${randomUUID()}`);await mkdir(stage);
      try{for(const [name,bytes] of payload){await mkdir(dirname(join(stage,name)),{recursive:true});await writeFile(join(stage,name),bytes,{flag:'wx',mode:0o644});}await writeFile(join(stage,'.harness-install.json'),JSON.stringify({version,contentDigest,checks}),{flag:'wx'});await rename(stage,versioned);}
      finally{await rm(stage,{recursive:true,force:true});}
    }
    // Prepare discovery links before replacing the single active pointer.
    const steps=await plan();
    for(const {target,link,action} of steps){
      if(action==='create'){await safeParent(dirname(target));await symlink(current,target);created.push(target);}
      else if(action==='repoint'){await repoint(target,current);moved.push({target,link});}
    }
    if(JSON.stringify(await state(current))!==JSON.stringify(previous))throw new Error('Installer pointer changed concurrently');
    const temp=join(shared,`.pointer-${randomUUID()}`);await symlink(`versions/${id}`,temp);try{await rename(temp,current);}finally{await rm(temp,{force:true});}
    // Only now, with the pointer on the new version, do the others go. One that cannot be removed is reported, not fatal.
    const {removed,kept}=await removeOthers(shared,id).catch(error=>({removed:[],kept:[{path:join(shared,'versions'),reason:String(error.message).split('\n')[0]}]}));
    // PPTX building and font measurement need the engine's packages. They live beside the verified files, not among them.
    const manual=`cd "${current}" && npm ci --omit=dev --ignore-scripts`;let installed='skipped';
    if(dependencies){
      if(await state(join(versioned,'node_modules','.package-lock.json')))installed='present';
      else try{await run('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:current,timeout:300000,maxBuffer:16*1024*1024});installed='installed';}
      catch(error){installed=`failed: ${error.code==='ENOENT'?'npm was not found':String(error.message).split('\n')[0]}`;}
    }
    const skipped=foreign(steps);
    // runtime is the stable address: it is the path to record and run helpers from, and it survives the next update.
    return {status:'installed',shared,runtime:current,versionId:id,targets,contentDigest,runtimeVersion:version,dependencies:installed,removedVersions:removed,...(moved.length?{repointed:moved.map(m=>m.target)}:{}),...(kept.length?{keptVersions:kept}:{}),...(skipped.length?{skipped}:{}),...(installed==='installed'||installed==='present'?{}:{next:`For PPTX authoring: ${manual}`})};
  }catch(error){
    for(const target of created)if((await state(target))?.link===current)await rm(target);
    for(const {target,link} of moved)if((await state(target))?.link===current)await repoint(target,link).catch(()=>{});
    throw error;
  }
  finally{await lock.close();await rm(join(shared,'.install-lock'));}
}
async function main(){const {values:v}=parseArgs({options:{home:{type:'string'},shared:{type:'string'},'dry-run':{type:'boolean'},'skip-dependencies':{type:'boolean'},help:{type:'boolean'}}});if(v.help){console.log('Usage: node scripts/install.mjs [--home DIR] [--shared DIR] [--dry-run] [--skip-dependencies]');return;}console.log(JSON.stringify(await install({home:v.home,shared:v.shared,dryRun:v['dry-run'],dependencies:!v['skip-dependencies']}),null,2));}
// Compared with links resolved, so the installer also runs when it is reached through the installed pointer or a skill link.
if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(resolve(process.argv[1])).catch(()=>resolve(process.argv[1]))).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
