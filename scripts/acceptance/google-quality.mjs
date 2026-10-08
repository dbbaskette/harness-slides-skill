// Synthetic, repeatable live benchmark. Creates local fixtures only; no authentication or network calls.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {renderPptxScene} from '../lib/pptx-render.mjs';
import {saveJson,digest} from '../lib/common.mjs';
import {validateScene} from '../lib/scene.mjs';
const title=(id,text)=>({id:id+'_title',type:'text',role:'title',text,x:30,y:22,width:660,height:55,fontSize:24,bold:true});
const text=(id,value,x,y,width,height,extra={})=>({id,type:'text',text:value,x,y,width,height,fontSize:16,...extra});
const slide=(id,heading,elements)=>({id,title:heading,sources:['brief:synthetic-acceptance'],notes:'Synthetic acceptance fixture. These are invented examples, not measured product results.',elements:[title(id,heading),...elements,text(id+'_footer','SYNTHETIC ACCEPTANCE • HARNESS SLIDES',30,369,660,25,{fontSize:10,color:'#596273'})]});
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),n=Buffer.alloc(4),h=Buffer.alloc(4);n.writeUInt32BE(data.length);h.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,h]);}
function illustration(){const width=400,height=220,raw=Buffer.alloc(height*(1+width*3));for(let y=0;y<height;y++)for(let x=0;x<width;x++){let c=[236,243,253];const nodes=[[70,110],[200,110],[330,110]];if(y>105&&y<115&&x>70&&x<330)c=[74,112,169];for(const [nx,ny] of nodes)if((x-nx)**2+(y-ny)**2<35**2)c=[40,103,178];const i=y*(1+width*3)+1+x*3;raw.set(c,i);}const head=Buffer.alloc(13);head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=2;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',head),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
export function benchmarkScene({image,spreadsheetId,chartId}){
 const s={version:2,title:'Content-led native Google acceptance',mode:'rework',canvas:{width:720,height:405},theme:{font:'Arial',text:'#172B4D',accent:'#2867B2',muted:'#ECF3FD'},slides:[
 slide('accept_compare','Choose the control model that fits the work',[
 {id:'compare_left',type:'shape',shape:'rect',x:30,y:100,width:315,height:225,fill:'muted'},
 {id:'compare_right',type:'shape',shape:'rect',x:375,y:100,width:315,height:225,fill:'muted'},
 text('compare_left_heading','Local workspace',45,110,285,45,{bold:true,fontSize:20}),text('compare_left_body','Keep assets and revisions together.\nReview an editable PowerPoint export.',45,165,285,130),
 text('compare_right_heading','Native Google',390,110,285,45,{bold:true,fontSize:20}),text('compare_right_body','Collaborate in Slides.\nRefresh charts from a linked Sheet.',390,165,285,130)]),
 slide('accept_table','Long labels stay readable in native cells',[
 {id:'accept_native_table',type:'table',x:30,y:100,width:660,height:234,columnWidths:[210,450],fontSize:16,headerFill:'accent',headerColor:'#FFFFFF',bodyFill:'#ECF3FD',rows:[['Capability','Acceptance evidence'],['Unequal column widths','210 pt and 450 pt columns preserve their allocation.'],['A deliberately longer row label','Text remains editable without hiding evidence.']] }]),
 slide('accept_chart','A linked chart includes signed and zero values',[
 {id:'accept_linked_chart',type:'chart',chartType:'bar',series:[{name:'Synthetic change',labels:['Negative','Zero','Positive'],values:[-8,0,24]}],source:'brief:synthetic-acceptance',sheetsChart:{spreadsheetId,chartId},x:30,y:90,width:660,height:235},text('chart_caveat','Invented values: −8, 0 and 24 units. Refresh after changing the source.',30,326,660,37,{fontSize:14})]),
 slide('accept_diagram','The workspace passes an editable draft to review',[
 {id:'diagram_source',type:'shape',shape:'rect',text:'Workspace',x:50,y:140,width:180,height:100,fill:'accent',color:'#FFFFFF',fontSize:20,bold:true,align:'center'},
 {id:'diagram_target',type:'shape',shape:'rect',text:'Native draft',x:460,y:140,width:180,height:100,fill:'muted',fontSize:20,bold:true,align:'center'},
 {id:'diagram_edge',type:'line',x:240,y:189,width:210,height:1,arrow:true,weight:2},text('diagram_label','Compile → inspect',250,115,190,45,{align:'center'}),text('diagram_caveat','Nodes and the connecting line can be edited individually.',50,280,620,45)]),
 slide('accept_image','A local image carries a useful description',[
 {id:'accept_local_image',type:'image',src:image,alt:'Synthetic illustration: three blue workflow nodes connected from left to right.',x:30,y:105,width:400,height:220},text('image_annotation','Reusable asset',455,116,235,45,{bold:true,fontSize:20}),text('image_explanation','Insert local bytes through the authenticated connector. Preserve alt text in the native object.',455,175,235,145)])]};validateScene(s);return s;
}
export async function prepareBenchmark(output){const root=resolve(output);await mkdir(root,{mode:0o700});const image=join(root,'workflow.png');await writeFile(image,illustration(),{flag:'wx'});await writeFile(join(root,'chart.csv'),'Category,Synthetic change\nNegative,-8\nZero,0\nPositive,24\n',{flag:'wx'});await writeFile(join(root,'brief.md'),'# Synthetic acceptance\nAll claims describe fixture behavior. Numeric data are invented: negative -8, zero 0, positive 24; refresh changes positive to 32. Preserve the imported cover and its notes. Edit the table cell, diagram label and coordinated node/line geometry. Inspect every final native slide.\n',{flag:'wx'});const baseline={version:2,title:'Harness Slides synthetic acceptance baseline',mode:'new',canvas:{width:720,height:405},slides:[slide('protected_cover','Content-led slide quality',[text('protected_copy','One consistent theme.\nEach slide earns its own composition.',30,140,660,140,{fontSize:28})])]};await renderPptxScene(baseline,join(root,'baseline.pptx'));return {root,image,baseline:join(root,'baseline.pptx'),csv:join(root,'chart.csv')};}
// The native IDs come from authorized imports; this never creates a parallel login flow.
if(process.argv[1]===new URL(import.meta.url).pathname){const [action,output,spreadsheetId,chartId]=process.argv.slice(2);if(action==='prepare')console.log(JSON.stringify(await prepareBenchmark(output)));else if(action==='scene'){const scene=benchmarkScene({image:join(resolve(output),'workflow.png'),spreadsheetId,chartId:Number(chartId)});await saveJson(join(output,'scene.json'),scene);await saveJson(join(output,'design-report.json'),{schema:1,sceneDigest:digest(scene),intentionalOverlaps:[],choices:scene.slides.map((s,i)=>({id:s.id,component:['comparison','table','chart','diagram','image'][i],intent:{takeaway:s.title,relationship:['compare','lookup','magnitude','handoff','illustrate'][i],rationale:'Content-specific synthetic acceptance composition.',evidence:s.sources}}))});console.log(JSON.stringify({slides:scene.slides.length}));}else throw new Error('Use prepare NEW_DIR or scene DIR SPREADSHEET_ID CHART_ID');}
export function benchmarkEdits(scene,deck){
 const next=structuredClone(scene),requests=[];
 function replace(id,value,cellLocation){requests.push({deleteText:{objectId:id,...(cellLocation?{cellLocation}:{}),textRange:{type:'ALL'}}},{insertText:{objectId:id,...(cellLocation?{cellLocation}:{}),insertionIndex:0,text:value}});const object=next.slides.flatMap(s=>s.elements).find(e=>e.id===id);if(cellLocation)object.rows[cellLocation.rowIndex][cellLocation.columnIndex]=value;else object.text=value;}
 replace('accept_chart_title','The linked chart refreshes after a source edit');next.slides.find(s=>s.id==='accept_chart').title='The linked chart refreshes after a source edit';
 replace('chart_caveat','Invented values: −8, 0 and 32 units. Positive changed from 24 to 32.');next.slides.flatMap(s=>s.elements).find(e=>e.type==='chart').series[0].values[2]=32;
 replace('accept_native_table','The edited cell remains native text.',{rowIndex:2,columnIndex:1});replace('diagram_target','Reviewable draft');replace('diagram_label','Compile → review');
 const target=next.slides.flatMap(s=>s.elements).find(e=>e.id==='diagram_target');target.x=500;
 const edge=next.slides.flatMap(s=>s.elements).find(e=>e.id==='diagram_edge');edge.width=250;
 for(const e of [target,edge]){const native=deck.slides.flatMap(s=>s.pageElements??[]).find(x=>x.objectId===e.id);if(!native)throw new Error('Read native edit targets first');const pt=d=>d.unit==='EMU'?d.magnitude/12700:d.magnitude;requests.push({updatePageElementTransform:{objectId:e.id,applyMode:'ABSOLUTE',transform:{scaleX:e.width/pt(native.size.width),scaleY:e.height/pt(native.size.height),shearX:0,shearY:0,translateX:e.x,translateY:e.y,unit:'PT'}}});}
 requests.push({refreshSheetsChart:{objectId:'accept_linked_chart'}});return {scene:next,plan:{presentationId:deck.presentationId,requests,writeControl:{requiredRevisionId:deck.revisionId}}};
}
