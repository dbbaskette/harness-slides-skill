// File boundary for compositions: read inputs, enforce the design gate, write a new output folder.
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {compileComposition} from './compose.mjs';
import {checkBrandSources,neutralBrandContract} from './brand-contract.mjs';
import {requireSceneDesign} from './design-session.mjs';
import {digest,hash} from './common.mjs';

export async function compileCompositionFile({file,brand,output,fonts,'design-project':designProject}) {
  if(!file||!output)throw new Error('Provide --file composition.json and a new --output directory');
  const bytes=await readFile(file),brandBytes=brand?await readFile(brand):null;
  const contract=brandBytes?JSON.parse(brandBytes):await neutralBrandContract();
  await checkBrandSources(contract);
  const {scene,structure,report}=await compileComposition(JSON.parse(bytes),contract,{fonts:fonts?JSON.parse(await readFile(fonts)):undefined});
  const approved=await requireSceneDesign(scene,designProject);
  if(approved)report.designRevision=approved.revision;
  const assets=[];
  for(const s of scene.slides)for(const e of s.elements)if(e.type==='image'&&!/^https:\/\//.test(e.src)) {
    const path=resolve(dirname(resolve(file)),e.src);
    e.src=path;assets.push({object:e.id,path,sha256:hash(await readFile(path))});
  }
  report.inputs={composition:{path:resolve(file),sha256:hash(bytes)},brand:brand?{path:resolve(brand),sha256:hash(brandBytes)}:{kind:'neutral defaults',revision:contract.revision},assets};
  report.sceneDigest=digest(scene);
  output=resolve(output);await mkdir(output,{mode:0o700});
  try {
    for(const [name,value] of [['scene.json',scene],['structure.json',structure],['compose-report.json',report],['brand-contract.json',contract]])
      await writeFile(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  } catch(error){await rm(output,{recursive:true,force:true});throw error;}
  return {output,slides:scene.slides.length,brandRevision:contract.revision,sceneDigest:report.sceneDigest,measurement:report.measurement,groups:structure.groups.length,connectors:structure.connectors.length};
}
