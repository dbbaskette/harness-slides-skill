// Real native construction; --fixture replaces only LibreOffice/Poppler. The
// fixture mode measures orchestration/reuse, never native conversion latency.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir,platform,release,cpus} from 'node:os';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {compileCompositionFile} from '../scripts/lib/compose-file.mjs';
import {previewComposition} from '../scripts/lib/compose-preview.mjs';
import {encodePng} from '../scripts/lib/contact-sheet.mjs';
const fixture=process.argv.includes('--fixture'),root=await mkdtemp(join(tmpdir(),'harness-render-bench-')),count=12,calls=[];
const png=encodePng({width:32,height:18,rgb:Buffer.alloc(32*18*3,200)});
const deps=fixture?{run:async(command,args)=>{
  calls.push([command,...args]);if(args[0]==='-v'||args[0]==='--version')return {stdout:'fixture v1'};
  if(command==='fc-list')return {stdout:resolve('package.json')};
  if(command==='pdfinfo')return {stdout:`Pages: ${count}`};
  if(command==='pdftoppm'){await writeFile(args.at(-1)+'.png',png);return {stdout:''};}
  if(command==='soffice'){await writeFile(join(args[args.indexOf('--outdir')+1],'deck.pdf'),'%PDF-1.7 fixture');return {stdout:''};}
  throw new Error(`Unexpected command ${command}`);
}}:{};
try{
  const source=join(root,'composition.json'),compiled=join(root,'compiled'),comp={version:1,title:'Render benchmark',slides:Array.from({length:count},(_,i)=>({id:`bench_slide_${i}`,title:`Service ${i+1} receives requests`,sources:['fixture'],canvas:{type:'text',id:`bench_body_${i}`,text:`Service ${i+1}: synthetic benchmark content.`}}))};
  await writeFile(source,JSON.stringify(comp));await compileCompositionFile({file:source,output:compiled});
  const measure=async(file,name)=>{const before=performance.now(),result=await previewComposition({file,output:join(root,name),renderer:'local'},deps);return {milliseconds:Math.round((performance.now()-before)*100)/100,deckSha256:result.deckSha256,reused:result.reused};};
  const cold=await measure(compiled,'cold'),warm=[];for(let i=0;i<3;i++)warm.push(await measure(compiled,'warm-'+i));
  calls.length=0;comp.slides[0].canvas.text='Service 1: revised benchmark content.';await writeFile(source,JSON.stringify(comp));const changed=join(root,'changed');await compileCompositionFile({file:source,output:changed});const revision=await measure(changed,'revision');
  console.log(JSON.stringify({mode:fixture?'native construction with synthetic renderer transport; not native rendering performance':'real LibreOffice/Poppler',node:process.version,os:`${platform()} ${release()}`,cpu:cpus()[0]?.model,slides:count,cold,warm,medianWarmMs:warm.map(s=>s.milliseconds).sort((a,b)=>a-b)[1],oneSlideRevision:revision,...(fixture?{revisionRasterizedPages:calls.filter(c=>c[0]==='pdftoppm'&&c[1]==='-f').map(c=>Number(c[2]))}:{})},null,2));
}finally{await rm(root,{recursive:true,force:true});}
