#!/usr/bin/env node
// Maintainer operation: pin this generic runtime into a private brand package.
import { readdir, readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hash, digest } from './lib/common.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function syncBrandEngine(brandRoot) {
  brandRoot=resolve(brandRoot);const target=join(brandRoot,'scripts','engine'),payload=[];
  for(const name of ['SKILL.md','LICENSE','NOTICE.md','package.json','package-lock.json','scripts/harness-slides.mjs','scripts/google-drive-deck.mjs','scripts/install.mjs'])payload.push(name);
  for(const folder of ['references','examples','scripts/lib'])for(const item of(await readdir(join(root,folder))).sort())if((await lstat(join(root,folder,item))).isFile())payload.push(`${folder}/${item}`);
  const checks={};
  for(const name of payload){const bytes=await readFile(join(root,name));checks[name]=hash(bytes);await mkdir(join(target,name,'..'),{recursive:true});await writeFile(join(target,name),bytes,{mode:0o644});}
  let sourceCommit=null;try{sourceCommit=(await promisify(execFile)('git',['-C',root,'rev-parse','HEAD'])).stdout.trim();}catch{}
  const pin={format:'harness-slides-engine-v1',version:JSON.parse(await readFile(join(root,'package.json'))).version,sourceCommit,contentDigest:digest(checks),files:checks};
  await writeFile(join(target,'engine-source.json'),JSON.stringify(pin,null,2)+'\n');
  return {target,files:payload.length,contentDigest:pin.contentDigest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)syncBrandEngine(process.argv[2]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
