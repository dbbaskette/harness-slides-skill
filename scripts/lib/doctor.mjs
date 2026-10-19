import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
export async function diagnose({format,env=process.env,run=promisify(execFile)}={}){
  if(format&&!['pptx','google-slides'].includes(format))throw new Error('Doctor --format is pptx or google-slides');
  const prepared=resolve('.harness-slides','test-python','bin','python'),testPython=env.HARNESS_IMAGE_TEST_PYTHON??(existsSync(prepared)?prepared:'python3');
  const commands={python3:{path:'python3',args:['--version']},soffice:{path:env.HARNESS_SOFFICE??'soffice',args:['--version']},pdftoppm:{path:env.HARNESS_PDFTOPPM??'pdftoppm',args:['-v']},pdfinfo:{path:env.HARNESS_PDFINFO??'pdfinfo',args:['-v']},gcloud:{path:'gcloud',args:['--version']},pillow:{path:testPython,args:['-c','import PIL; print(PIL.__version__)']}};
  const tools={};for(const [name,{path,args}] of Object.entries(commands))try{const r=await run(path,args,{timeout:10000});tools[name]={path,available:true,version:(r.stdout||r.stderr).split('\n')[0]};}catch{tools[name]={path,available:false};}
  const routes={authoring:{requires:['python3']},localNativeReview:{requires:['python3','soffice','pdftoppm','pdfinfo']},googleNativeReview:{requires:['python3','gcloud','pdftoppm','pdfinfo'],authorization:'not checked; use --google-check'},imageWorkerTests:{requires:['python3','pillow']}};
  for(const route of Object.values(routes)){route.missing=route.requires.filter(name=>!tools[name].available);route.ready=route.missing.length===0;}
  return {node:process.version,tools,routes,selectedReview:format==='google-slides'?'googleNativeReview':format==='pptx'?'localNativeReview':null,next:'Use test:setup for isolated Python test dependencies. Local review needs LibreOffice and Poppler; Google review needs authorized Drive access and Poppler.'};
}
