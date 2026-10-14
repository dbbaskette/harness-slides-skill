// A generated template and matching brand contract for native-emitter tests.
import {readFile,writeFile} from 'node:fs/promises';
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

// unzip reads [ ] as a pattern, so the content-types part name must be escaped.
export const part=async(file,name)=>(await exec('unzip',['-p',file,name.replace(/[[\]]/g,'\\$&')],{maxBuffer:32*1024*1024})).stdout;

// Package-level checks a strict reader would make.
export async function audit(file) {
  const script=`import sys,zipfile,re,posixpath,json
from xml.dom import minidom
z=zipfile.ZipFile(sys.argv[1]);names=set(z.namelist());problems=[]
for n in names:
    if n.endswith('.xml') or n.endswith('.rels'):
        try: minidom.parseString(z.read(n))
        except Exception as e: problems.append('malformed '+n+': '+str(e))
types=z.read('[Content_Types].xml').decode()
seen=re.findall(r'PartName="/([^"]+)"',types)
problems+=['duplicate override '+p for p in set(seen) if seen.count(p)>1]
problems+=['override without part '+p for p in seen if p not in names]
for n in names:
    if not n.endswith('.rels'): continue
    folder=posixpath.dirname(posixpath.dirname(n))
    for tag in re.findall(r'<Relationship\\b[^>]*>',z.read(n).decode()):
        if 'TargetMode="External"' in tag: continue
        t=re.search(r'Target="([^"]*)"',tag).group(1)
        path=t[1:] if t.startswith('/') else posixpath.normpath(posixpath.join(folder,t))
        if path not in names: problems.append('dangling '+n+' -> '+path)
print(json.dumps(sorted(problems)))`;
  return JSON.parse((await exec('python3',['-c',script,file])).stdout);
}

// An SVG path of absolute M, L, C and Z commands, as DrawingML path commands in thousandths of a viewBox unit.
export function svgCommands(d) {
  const tokens=d.match(/[MLCZ]|-?\d*\.?\d+/g),out=[],arity={M:2,L:2,C:6,Z:0},tag={M:'moveTo',L:'lnTo',C:'cubicBezTo',Z:'close'};
  for(let i=0,command;i<tokens.length;) {
    if(/[MLCZ]/.test(tokens[i]))command=tokens[i++];else if(!command)throw new Error(`Unsupported SVG path: ${d}`);
    out.push([tag[command],...tokens.slice(i,i+arity[command]).map(v=>Math.round(Number(v)*1000))]);i+=arity[command];
  }
  return out;
}
const custGeom=(commands,size)=>`<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${size}" h="${size}">${commands.map(([tag,...v])=>{
  const points=[];for(let i=0;i<v.length;i+=2)points.push(`<a:pt x="${v[i]}" y="${v[i+1]}"/>`);return tag==='close'?'<a:close/>':`<a:${tag}>${points.join('')}</a:${tag}>`;}).join('')}</a:path></a:pathLst></a:custGeom>`;

// The custom-geometry paths of an XML fragment, as [{w,h,commands}], so they can be compared with the SVG they came from.
export function geometry(xml) {
  return [...xml.matchAll(/<a:path w="(\d+)" h="(\d+)">(.*?)<\/a:path>/gs)].map(([,w,h,body])=>({w:Number(w),h:Number(h),
    commands:[...body.matchAll(/<a:(moveTo|lnTo|cubicBezTo)>(.*?)<\/a:\1>|<a:close ?\/>/gs)].map(m=>m[1]?[m[1],...[...m[2].matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)" ?\/>/g)].flatMap(p=>[Number(p[1]),Number(p[2])])]:['close'])}));
}

// A brand with a native template and a vector icon library built from the SVGs in fixtures/native-icons.
// Each icon is a disc with a custom-geometry drawing on it and its label in a table below, indexed by the real indexer.
export async function iconBrand(dir,options) {
  const {renderPptxScene}=await import('../scripts/lib/pptx-render.mjs'),{pptxTool}=await import('../scripts/lib/presentation-tools.mjs');
  const source=new URL('./fixtures/native-icons/',import.meta.url),catalog=JSON.parse(await readFile(new URL('catalog.json',source),'utf8'));
  const icons=await Promise.all(catalog.files.map(async(file,i)=>{const svg=await readFile(new URL(file,source),'utf8'),[,,,width]=svg.match(/viewBox="(\S+) (\S+) (\S+) (\S+)"/).map(Number);
    return {label:catalog.labels[i],name:file.replace(/\.svg$/,''),size:width*1000,commands:svgCommands(svg.match(/ d="([^"]+)"/)[1])};}));
  const generated=join(dir,'icon-library-generated.pptx'),path=join(dir,'icon-library.pptx'),index=join(dir,'icon-index.json'),catalogFile=join(dir,'icon-catalog.json');
  await renderPptxScene({version:2,title:'Icons',mode:'new',canvas:{width:960,height:540},slides:[{id:'icon_page',title:'Icons',sources:['brief:test'],elements:[
    ...icons.flatMap((icon,i)=>[{id:`${icon.name}_disc`,type:'shape',shape:'ellipse',x:120+120*i,y:90,width:80,height:80,fill:'#2867B2'},{id:`${icon.name}_drawing`,type:'shape',shape:'rect',x:136+120*i,y:106,width:48,height:48,fill:'#FFFFFF'}]),
    {id:'icon_labels',type:'table',x:100,y:200,width:120*icons.length,height:40,rows:[icons.map(i=>i.label)]}]}]},generated);
  const script=`import sys,zipfile,json,re
src,dst,shapes=sys.argv[1],sys.argv[2],json.loads(sys.argv[3])
with zipfile.ZipFile(src) as a, zipfile.ZipFile(dst,'x',zipfile.ZIP_DEFLATED) as b:
    for i in a.infolist():
        data=a.read(i)
        if i.filename=='ppt/slides/slide1.xml':
            text=data.decode()
            for name,geometry in shapes.items():
                text,count=re.subn(r'(<p:sp>(?:(?!</p:sp>).)*?name="'+name+r'".*?)<a:prstGeom prst="rect">.*?</a:prstGeom>',lambda m:m.group(1)+geometry,text,count=1,flags=re.S)
                if count!=1: raise SystemExit('no shape '+name)
            data=text.encode()
        b.writestr(i,data)`;
  await exec('python3',['-c',script,generated,path,JSON.stringify(Object.fromEntries(icons.map(i=>[`${i.name}_drawing`,custGeom(i.commands,i.size)])))]);
  await writeFile(catalogFile,JSON.stringify({source:{sha256:hash(await readFile(path))},catalogPages:[{slide:1,labels:catalog.labels}]}));
  const listing=await pptxTool('icon-index',[path,catalogFile]);await writeFile(index,JSON.stringify(listing));
  const c=await brand(dir,options);c.design.slides.icon={size:54,library:{path,index}};
  for(const file of [path,index])c.sources.push({path:file,kind:'icon library',sha256:hash(await readFile(file))});
  c.revision=contractRevision(c);
  return {contract:c,library:{path,index},icons:icons.map(icon=>({...icon,entry:listing.entries.find(e=>e.label===icon.label)}))};
}

// A diagram whose cards carry icons and whose arrows meet a standalone icon, then one icon in each style. Takes library IDs by label.
export function iconComposition(id) {
  const card=(name,icon,text,extra={})=>({type:'box',id:`${name}_card`,children:[{type:'icon',id:`${name}_icon`,icon,...extra},{type:'text',id:`${name}_text`,text}]});
  return {version:1,title:'Requests are queued before they are stored',slides:[
    {id:'pipeline_slide',title:'Requests wait in a queue before they are stored',sources:['brief:test'],notes:'The queue absorbs bursts.',
      canvas:{type:'stack',direction:'row',gap:'none',children:[card('client',id.Gateway,'API gateway'),{type:'spacer',weight:.4},{type:'icon',id:'queue_icon',icon:id.Queue,color:'accentAqua'},{type:'spacer',weight:.4},card('store',id.Database,'Database')]},
      connect:[{id:'edge_in',from:'client_card',to:'queue_icon',label:'enqueue'},{id:'edge_out',from:'queue_icon',to:'store_card',route:'elbow'}]},
    {id:'styles_slide',title:'Each icon style keeps its drawing',sources:['brief:test'],
      canvas:{type:'grid',columns:3,children:[card('solid',id.Database,'Solid',{color:'accentAqua'}),card('ring',id.Gateway,'Outline',{color:'headingPrimary',style:'outline'}),card('bare',id.Queue,'Plain',{color:'headingPrimary',style:'plain'})]}}]};
}
