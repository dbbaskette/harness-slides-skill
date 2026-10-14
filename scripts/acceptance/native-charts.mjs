// Prepare the native chart deck for the manual Google import check. Local files only; no authentication or network calls.
// The brand and composition are the synthetic fixtures the automated test uses, so the deck is the one that test proves.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chartBrand,chartComposition} from '../../tests/native-fixtures.mjs';
import {compileCompositionFile,renderCompositionDir} from '../lib/compose-file.mjs';
import {hash} from '../lib/common.mjs';

export async function prepareChartAcceptance(output) {
  if(!output)throw new Error('Usage: node scripts/acceptance/native-charts.mjs prepare NEW_DIR');
  const dir=resolve(output);await mkdir(dir,{mode:0o700});
  const contract=await chartBrand(dir),comp=chartComposition();
  const brand=join(dir,'brand-contract.json'),file=join(dir,'composition.json'),compiled=join(dir,'compiled'),deck=join(dir,'deck.pptx');
  await writeFile(brand,JSON.stringify(contract,null,2)+'\n',{flag:'wx'});await writeFile(file,JSON.stringify(comp,null,2)+'\n',{flag:'wx'});
  await compileCompositionFile({file,brand,output:compiled});
  const result=await renderCompositionDir({file:compiled,output:deck}),scene=JSON.parse(await readFile(join(compiled,'scene.json'),'utf8'));
  // What must survive the import, by slide number, since Google assigns its own object IDs.
  const charts=scene.slides.flatMap((s,i)=>s.elements.filter(e=>e.type==='chart').map(e=>{
    const used=e.chartType==='pie'?e.series[0].labels.length:e.series.length;
    return {slide:i+1,node:e.id,kind:e.chartType,...(e.title?{title:e.title}:{}),...(e.units?{units:e.units}:{}),categories:e.series[0].labels,
      series:e.series.map(x=>({name:x.name,values:x.values})),colors:e.colors.slice(0,used),source:e.source};}));
  const expected={deck,deckSha256:hash(await readFile(deck)),charts,
    parts:result.native.flatMap((n,i)=>n.charts.map(c=>({slide:i+1,node:c.id,chart:c.part,workbook:c.workbook}))),
    notes:comp.slides.filter(s=>s.notes).map(s=>({slide:comp.slides.indexOf(s)+1,text:s.notes}))};
  await writeFile(join(dir,'expected.json'),JSON.stringify(expected,null,2)+'\n',{flag:'wx'});
  return {output:dir,deck,expected:join(dir,'expected.json'),slides:result.slides,charts:charts.length,next:'Import deck.pptx into Google Slides and follow docs/verification/2026-10-14-native-charts-google-import.md'};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  const [action,output]=process.argv.slice(2);
  try{if(action!=='prepare')throw new Error('Usage: node scripts/acceptance/native-charts.mjs prepare NEW_DIR');console.log(JSON.stringify(await prepareChartAcceptance(output),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
