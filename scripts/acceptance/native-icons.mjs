// Prepare the native icon and diagram deck for the manual Google import check. Local files only; no authentication or network calls.
// The brand, icon library and composition are the synthetic fixtures the automated test uses, so the deck is the one that test proves.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {iconBrand,iconComposition} from '../../tests/native-fixtures.mjs';
import {compileCompositionFile,renderCompositionDir} from '../lib/compose-file.mjs';
import {hash} from '../lib/common.mjs';

export async function prepareIconAcceptance(output) {
  if(!output)throw new Error('Usage: node scripts/acceptance/native-icons.mjs prepare NEW_DIR');
  const dir=resolve(output);await mkdir(dir,{mode:0o700});
  const {contract,icons}=await iconBrand(dir),id=Object.fromEntries(icons.map(i=>[i.label,i.entry.id])),comp=iconComposition(id);
  const brand=join(dir,'brand-contract.json'),file=join(dir,'composition.json'),compiled=join(dir,'compiled'),deck=join(dir,'deck.pptx');
  await writeFile(brand,JSON.stringify(contract,null,2)+'\n',{flag:'wx'});await writeFile(file,JSON.stringify(comp,null,2)+'\n',{flag:'wx'});
  await compileCompositionFile({file,brand,output:compiled});
  const result=await renderCompositionDir({file:compiled,output:deck}),structure=JSON.parse(await readFile(join(compiled,'structure.json'),'utf8'));
  const label=Object.fromEntries(icons.map(i=>[i.entry.id,i])),slideOf=Object.fromEntries(comp.slides.map((s,i)=>[s.id,i+1]));
  // What must survive the import, by slide number, since Google assigns its own object IDs.
  const expected={deck,deckSha256:hash(await readFile(deck)),
    icons:structure.icons.map(i=>({slide:slideOf[i.slide],node:i.id,icon:i.icon,label:label[i.icon].label,style:i.style??'solid',shapes:i.style==='plain'?1:2,pathCommands:label[i.icon].commands.length})),
    connectors:structure.connectors.map(c=>({slide:slideOf[c.slide],id:c.id,from:c.from,to:c.to})),
    attached:result.native.flatMap((n,i)=>n.attached.map(edge=>({slide:i+1,edge}))),
    notes:comp.slides.filter(s=>s.notes).map(s=>({slide:slideOf[s.id],text:s.notes}))};
  await writeFile(join(dir,'expected.json'),JSON.stringify(expected,null,2)+'\n',{flag:'wx'});
  return {output:dir,deck,expected:join(dir,'expected.json'),slides:result.slides,icons:expected.icons.length,connectors:expected.connectors.length,next:'Import deck.pptx into Google Slides and follow docs/verification/2026-10-14-native-icons-google-import.md'};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  const [action,output]=process.argv.slice(2);
  try{if(action!=='prepare')throw new Error('Usage: node scripts/acceptance/native-icons.mjs prepare NEW_DIR');console.log(JSON.stringify(await prepareIconAcceptance(output),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
