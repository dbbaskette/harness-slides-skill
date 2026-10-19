import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {existsSync} from 'node:fs';
async function markdown(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','.git','.harness-slides'].includes(entry.name))continue;const path=resolve(dir,entry.name);if(entry.isDirectory())out.push(...await markdown(path));else if(entry.name.endsWith('.md'))out.push(path);}return out;}
const broken=[];for(const file of await markdown('.')){const content=await readFile(file,'utf8');for(const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const target=match[1].replace(/^<|>$/g,'').split('#')[0];if(!target||/^[a-z]+:/i.test(target)||/[<>]|\s/.test(target))continue;if(!existsSync(resolve(dirname(file),decodeURIComponent(target))))broken.push(`${file}: ${target}`);}}
if(broken.length){console.error(broken.join('\n'));process.exitCode=1;}else console.log('Local Markdown links resolve.');
