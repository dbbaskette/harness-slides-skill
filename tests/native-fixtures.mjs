// A generated template and matching brand contract for native-emitter tests.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {hash} from '../scripts/lib/common.mjs';
import {renderPptxScene} from '../scripts/lib/pptx-render.mjs';

const exec=promisify(execFile);

// A template with two sample slides, optionally with a title placeholder on its layout.
export async function template(dir,{title=true}={}) {
  const base=join(dir,'generated.pptx'),file=join(dir,title?'template.pptx':'template-plain.pptx');
  const sample=id=>({id,title:'Sample',sources:['brief:test'],notes:'Sample notes',elements:[{id:`${id}_text`,type:'text',x:40,y:40,width:300,height:40,text:'Sample slide'}]});
  await renderPptxScene({version:2,title:'Template',mode:'new',canvas:{width:960,height:540},slides:[sample('sample_one'),sample('sample_two')]},base);
  const script=`import sys,zipfile
src,dst,add=sys.argv[1:]
ph='<p:sp><p:nvSpPr><p:cNvPr id="90" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="609600" y="406400"/><a:ext cx="10972800" cy="838200"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>'
with zipfile.ZipFile(src) as a, zipfile.ZipFile(dst,'x',zipfile.ZIP_DEFLATED) as b:
    for i in a.infolist():
        data=a.read(i)
        if add=='1' and i.filename=='ppt/slideLayouts/slideLayout1.xml': data=data.replace(b'</p:spTree>',ph.encode()+b'</p:spTree>')
        b.writestr(i,data)`;
  await exec('python3',['-c',script,base,file,title?'1':'0']);
  return file;
}
export async function brand(dir,options) {
  const path=await template(dir,options),sha256=hash(await readFile(path));
  const colors={canvasPrimary:'#FFFFFF',canvasSecondary:'#F0F2F5',inkDeep:'#202124',inkSecondary:'#555555',headingPrimary:'#2867B2',accentAqua:'#0091DA'},role=(size,bold=false,colorRole='inkDeep')=>({size,bold,colorRole});
  const c={schema:1,identity:{id:'acme',variant:'light'},medium:{kind:'slides',delivery:'reading'},sources:[{path,sha256}],
    design:{fontFamily:'Arial',colors,nativeTemplate:{path,sha256,layoutPart:'ppt/slideLayouts/slideLayout1.xml',masterPart:'ppt/slideMasters/slideMaster1.xml'},slides:{canvas:{width:960,height:540},titleBox:{x:48,y:32,width:864,height:66},contentBox:{x:48,y:126,width:864,height:360},reservedBottom:486,
      spacing:{column:30,inset:18},typography:{title:role(28,true,'headingPrimary'),body:role(24),bodyReference:role(20),label:role(20,true),caption:role(14,false,'inkSecondary'),metric:role(64,true,'accentAqua'),quote:role(30)},
      chart:{seriesRoles:['headingPrimary','accentAqua'],axisFontPt:18},table:{headerFillRole:'headingPrimary',headerTextRole:'canvasPrimary',fontPt:20,paddingPt:12}}},
    language:{organization:{toneStatus:'unspecified'},authorVoice:{status:'unselected'}}};
  c.revision=contractRevision(c);return c;
}
