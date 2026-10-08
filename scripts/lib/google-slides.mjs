import { request, gcloudToken } from '../google-drive-deck.mjs';
import { validateScene, themeFor, color } from './scene.mjs';
import { digest } from './common.mjs';
const validId = id => { if (!/^[A-Za-z0-9_-]+$/.test(id??'')) throw new Error('Provide a native Google presentation ID'); return id; };
const rgb = hex => Object.fromEntries(['red','green','blue'].map((k,i)=>[k,parseInt(hex.slice(1+i*2,3+i*2),16)/255]));
const size=(w,h)=>({width:{magnitude:w,unit:'PT'},height:{magnitude:h,unit:'PT'}});
const transform=(x,y)=>({scaleX:1,scaleY:1,shearX:0,shearY:0,translateX:x,translateY:y,unit:'PT'});
const idsIn=value=>{const ids=new Set();const visit=v=>{if(!v||typeof v!=='object')return;if(v.objectId)ids.add(v.objectId);for(const x of Object.values(v))if(typeof x==='object')Array.isArray(x)?x.forEach(visit):visit(x);};visit(value);return ids;};
const canonical=value=>value===undefined?null:Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export async function googleSession(deps={}) {
  if (deps.tokenProvider) return deps;
  const token=await gcloudToken(); return {...deps,tokenProvider:async()=>token};
}
export async function snapshotDeck(id,deps={}) {
  validId(id); const deck=await(await request(`https://slides.googleapis.com/v1/presentations/${id}`,{},deps)).json();
  if(deck.presentationId!==id||!deck.revisionId||!Array.isArray(deck.slides))throw new Error('Native slide inventory was not confirmed');
  return deck;
}
export async function copyGoogleDeck(id,name,deps={}) {
  validId(id); if (!name?.trim()) throw new Error('Name the working copy');
  const response=await request(`https://www.googleapis.com/drive/v3/files/${id}/copy?supportsAllDrives=true&fields=id,name,webViewLink`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})},deps);
  const created=await response.json(); if(!created.id)throw new Error('Copy response was unconfirmed. Inspect Drive before retrying.');
  return {id:created.id,name:created.name,url:created.webViewLink??`https://docs.google.com/presentation/d/${created.id}/edit`};
}
export function compileGoogleScene(scene,deck,{localImages=false}={}) {
  validateScene(scene); const t=themeFor(scene),requests=[],limitations=[],existing=idsIn(deck);
  validId(deck?.presentationId); if(!deck.revisionId||!Array.isArray(deck.slides))throw new Error('Use a full native snapshot with a revision');
  const pt=d=>d?.unit==='PT'?d.magnitude:d?.unit==='EMU'?d.magnitude/12700:NaN;
  if(Math.abs(pt(deck.pageSize?.width)-scene.canvas.width)>1||Math.abs(pt(deck.pageSize?.height)-scene.canvas.height)>1)throw new Error('Scene and native template canvas differ');
  const solid=v=>({rgbColor:rgb(color(v,t))}),props=(s,e)=>({pageObjectId:s.id,size:size(e.width,e.height),transform:transform(e.x,e.y)});
  function text(e,cellLocation) {
    const selector=cellLocation?{cellLocation}:{};
    return [{insertText:{objectId:e.id,...selector,insertionIndex:0,text:e.text}},
      {updateTextStyle:{objectId:e.id,...selector,textRange:{type:'ALL'},style:{fontFamily:t.font,fontSize:{magnitude:e.fontSize??(e.role==='title'?t.titleSize:t.bodySize),unit:'PT'},bold:e.bold??false,foregroundColor:{opaqueColor:solid(e.color??'text')}},fields:'fontFamily,fontSize,bold,foregroundColor'}},
      {updateParagraphStyle:{objectId:e.id,...selector,textRange:{type:'ALL'},style:{alignment:({left:'START',center:'CENTER',right:'END'})[e.align??'left'],lineSpacing:125,spaceAbove:{magnitude:0,unit:'PT'},spaceBelow:{magnitude:0,unit:'PT'}},fields:'alignment,lineSpacing,spaceAbove,spaceBelow'}}];
  }
  for(const s of scene.slides) {
    const native=deck.slides.find(p=>p.objectId===s.id);
    if(native) {
      if(scene.mode==='new')throw new Error('New mode cannot replace existing slides');
      const owned=new Set((native.pageElements??[]).map(e=>e.objectId));
      for(const list of ['replace','protect'])if(!Array.isArray(s[list])||s[list].some(id=>!owned.has(id))||new Set(s[list]).size!==s[list].length)throw new Error(`${list} must enumerate owned top-level objects`);
      if(s.replace.some(id=>s.protect.includes(id)))throw new Error('Cannot replace protected content');
      for(const objectId of s.replace)requests.push({deleteObject:{objectId}});
    } else {
      if(scene.mode==='redesign')throw new Error('Redesign retains original slide count and IDs');
      if(existing.has(s.id))throw new Error('Slide ID collides with an existing object');
      if(s.layoutId&&!deck.layouts?.some(l=>l.objectId===s.layoutId))throw new Error('Unknown native layout');
      requests.push({createSlide:{objectId:s.id,...(s.layoutId?{slideLayoutReference:{layoutId:s.layoutId}}:{})}});
    }
    for(const e of s.elements) {
      if(existing.has(e.id))throw new Error('New object ID collides with a native object');
      if(e.type==='image') {
        if(!/^https:\/\//.test(e.src)&&!(localImages&&e.src.startsWith('/')))throw new Error('Google image objects need HTTPS or an explicit local image sidecar transport');
        if((e.fit??'contain')==='cover')throw new Error('Google cover crops require native crop controls; no silent approximation');
        requests.push({createImage:{objectId:e.id,url:e.src,elementProperties:props(s,e)}});
        requests.push({updatePageElementAltText:{objectId:e.id,title:e.alt,description:e.alt}});
      } else if(e.type==='chart') {
        const c=e.sheetsChart;
        if(!c?.spreadsheetId||!Number.isInteger(c.chartId))throw new Error('Editable Google charts need sheetsChart:{spreadsheetId,chartId}; no image fallback');
        validId(c.spreadsheetId);
        if(e.colors||e.labelSize)limitations.push({object:e.id,detail:'Linked Google charts retain Sheets source styling; apply brand colors and typography in the source spreadsheet and inspect the native chart'});
        requests.push({createSheetsChart:{objectId:e.id,spreadsheetId:c.spreadsheetId,chartId:c.chartId,linkingMode:'LINKED',elementProperties:props(s,e)}});
      } else if(e.type==='line') {
        const lineProps=props(s,e);lineProps.transform={...lineProps.transform,scaleX:e.flipH?-1:1,scaleY:e.flipV?-1:1,translateX:e.x+(e.flipH?e.width:0),translateY:e.y+(e.flipV?e.height:0)};requests.push({createLine:{objectId:e.id,lineCategory:'STRAIGHT',elementProperties:lineProps}});
        requests.push({updateLineProperties:{objectId:e.id,lineProperties:{lineFill:{solidFill:{color:solid(e.color??'accent'),alpha:1}},weight:{magnitude:e.weight??2,unit:'PT'},endArrow:e.arrow?'FILL_ARROW':'NONE'},fields:'lineFill,weight,endArrow'}});
      } else if(e.type==='table') {
        requests.push({createTable:{objectId:e.id,rows:e.rows.length,columns:e.rows[0].length,elementProperties:{pageObjectId:s.id}}});
        requests.push({updatePageElementTransform:{objectId:e.id,applyMode:'ABSOLUTE',transform:transform(e.x,e.y)}});
        for(const [index,width] of (e.columnWidths??e.rows[0].map(()=>e.width/e.rows[0].length)).entries())requests.push({updateTableColumnProperties:{objectId:e.id,columnIndices:[index],tableColumnProperties:{columnWidth:{magnitude:width,unit:'PT'}},fields:'columnWidth'}});
        if(e.padding!==undefined)limitations.push({object:e.id,detail:'Google table cell padding uses native editor defaults; custom padding is supported in PPTX only'});
        requests.push({updateTableRowProperties:{objectId:e.id,rowIndices:e.rows.map((_,i)=>i),tableRowProperties:{minRowHeight:{magnitude:e.height/e.rows.length,unit:'PT'}},fields:'minRowHeight'}});
        e.rows.forEach((row,rowIndex)=>row.forEach((value,columnIndex)=>{if(value)requests.push(...text({...e,text:value,bold:rowIndex===0,color:rowIndex===0?(e.headerColor??e.color??'text'):(e.color??'text')}, {rowIndex,columnIndex}));requests.push({updateTableCellProperties:{objectId:e.id,tableRange:{location:{rowIndex,columnIndex},rowSpan:1,columnSpan:1},tableCellProperties:{tableCellBackgroundFill:{solidFill:{color:solid(rowIndex===0?(e.headerFill??'muted'):(e.bodyFill??'background')),alpha:1}},contentAlignment:'MIDDLE'},fields:'tableCellBackgroundFill,contentAlignment'}});}));
      } else {
        requests.push({createShape:{objectId:e.id,shapeType:e.type==='text'?'TEXT_BOX':e.shape==='ellipse'?'ELLIPSE':'RECTANGLE',elementProperties:props(s,e)}});
        requests.push({updateShapeProperties:{objectId:e.id,shapeProperties:{shapeBackgroundFill:e.fill?{solidFill:{color:solid(e.fill),alpha:1}}:{propertyState:'NOT_RENDERED'},outline:{propertyState:'NOT_RENDERED'},contentAlignment:'MIDDLE',autofit:{autofitType:'NONE'}},fields:'shapeBackgroundFill,outline,contentAlignment,autofit.autofitType'}});
        if(e.text)requests.push(...text(e));
      }
    }
  }
  return {presentationId:deck.presentationId,requests,writeControl:{requiredRevisionId:deck.revisionId},sceneDigest:digest(scene),templateDigest:digest(deck),limitations,localImages:scene.slides.flatMap(s=>s.elements.filter(e=>e.type==='image'&&!/^https:/.test(e.src)).map(e=>e.src)),notesPending:scene.slides.filter(s=>s.notes!==undefined).map(s=>s.id),status:'unreviewed draft'};
}
export async function applyGoogleScene(scene,deck,deps={}) {
  const plan=compileGoogleScene(scene,deck),current=await snapshotDeck(plan.presentationId,deps);
  if(current.revisionId!==deck.revisionId)throw new Error('Native deck changed; refresh, rebuild and inspect before applying');
  try{await(await request(`https://slides.googleapis.com/v1/presentations/${plan.presentationId}:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:plan.requests,writeControl:plan.writeControl})},deps)).json();}
  catch(error){throw new Error(`${error.message} Outcome may be uncertain. Inspect Slides before retrying; no automatic retry.`);}
  let after=await snapshotDeck(plan.presentationId,deps);
  const notes=compileGoogleNotes(scene,after);
  if(notes.requests.length){
    try{await(await request(`https://slides.googleapis.com/v1/presentations/${plan.presentationId}:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:notes.requests,writeControl:notes.writeControl})},deps)).json();}
    catch(error){throw new Error(`${error.message} Content was sent; notes may be uncertain. Inspect before retrying.`);}
    after=await snapshotDeck(plan.presentationId,deps);
  }
  verifyGoogleSceneReadback(scene,after);
  verifyGooglePreservation(scene,deck,after);
  return {presentationId:after.presentationId,revisionId:after.revisionId,url:`https://docs.google.com/presentation/d/${after.presentationId}/edit`,limitations:plan.limitations,status:'native content and geometry read back; visual review required'};
}

// Verify content as well as kind. The API can refactor size/transform pairs.
export function verifyGoogleSceneReadback(scene,after) {
  validateScene(scene);
  const t=themeFor(scene),pt=d=>d?.unit==='PT'?d.magnitude:d?.unit==='EMU'?d.magnitude/12700:NaN,close=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=1;
  const fail=detail=>{throw new Error(`Update sent but native ${detail} readback failed; inspect native deck`);};
  const content=o=>(o?.textElements??[]).map(e=>e.textRun?.content??'').join('').replace(/\n$/,'');
  const checkText=(native,expected)=>{if(content(native)!==(expected.text??''))fail('text content');const runs=(native?.textElements??[]).filter(x=>x.textRun?.content?.trim()).map(x=>x.textRun);for(const r of runs)if(r.style?.fontFamily!==t.font||!close(pt(r.style?.fontSize),expected.fontSize??(expected.role==='title'?t.titleSize:t.bodySize)))fail('text typography');};
  for(const s of scene.slides){if(s.notes!==undefined&&(!notesShape(after,s.id)?.shape||content(notesShape(after,s.id)?.shape?.text)!==s.notes))fail('speaker notes');for(const e of s.elements){const item=after.slides.find(x=>x.objectId===s.id)?.pageElements?.find(x=>x.objectId===e.id),kind=({text:'shape',shape:'shape',line:'line',table:'table',image:'image',chart:'sheetsChart'})[e.type];if(!item?.[kind])fail('object type');
    const tr=item.transform??{},w=pt(item.size?.width),h=pt(item.size?.height),tx=tr.unit==='EMU'?tr.translateX/12700:tr.translateX,ty=tr.unit==='EMU'?tr.translateY/12700:tr.translateY;
    if(e.type==='table'){
      if(!close(tx,e.x)||!close(ty,e.y))fail('table position');const table=item.table;if(table.rows!==e.rows.length||table.columns!==e.rows[0].length)fail('table dimensions');
      const widths=e.columnWidths??e.rows[0].map(()=>e.width/e.rows[0].length);widths.forEach((width,i)=>{if(!close(pt(table.tableColumns?.[i]?.columnWidth),width))fail('table column width');});
      let totalHeight=0;e.rows.forEach((row,ri)=>{const r=table.tableRows?.[ri];totalHeight+=pt(r?.rowHeight);row.forEach((value,ci)=>{const cell=r?.tableCells?.find(c=>c.location?.rowIndex===ri&&c.location?.columnIndex===ci)??r?.tableCells?.[ci];checkText(cell?.text,{...e,text:value});});});if(!Number.isFinite(totalHeight)||totalHeight>e.height+1)fail('table overflow');
    }else{
      const sx=tr.scaleX??1,sy=tr.scaleY??1,contain=['image','chart'].includes(e.type),fit=Math.min(e.width/w,e.height/h),expected=contain?{x:e.x+(e.width-w*fit)/2,y:e.y+(e.height-h*fit)/2,width:w*fit,height:h*fit}:e;
      if(tr.shearX||tr.shearY||!close(tx+Math.min(0,w*sx),expected.x)||!close(ty+Math.min(0,h*sy),expected.y)||!close(Math.abs(w*sx),expected.width)||!close(Math.abs(h*sy),expected.height))fail(`element geometry (${e.id})`);
      if(e.type==='image'&&(item.title!==e.alt||item.description!==e.alt))fail('image accessibility');if(e.type==='chart'&&(item.sheetsChart.spreadsheetId!==e.sheetsChart?.spreadsheetId||item.sheetsChart.chartId!==e.sheetsChart?.chartId))fail('chart source link');
      if(e.text)checkText(item.shape.text,e);if(e.type==='line'&&(Math.sign(sx)!==(e.flipH?-1:1)||Math.sign(sy)!==(e.flipV?-1:1)))fail('line direction');
    }
  }
  }
  return {status:'content, geometry, notes, image alt text and chart links verified; native visual review required'};
}

function notesShape(deck,slideId){const slide=deck.slides.find(s=>s.objectId===slideId),page=slide?.slideProperties?.notesPage,id=page?.notesProperties?.speakerNotesObjectId;return page?.pageElements?.find(e=>e.objectId===id);}
export function compileGoogleNotes(scene,deck){
  validateScene(scene);validId(deck.presentationId);if(!deck.revisionId)throw new Error('Notes need a fresh native revision');
  const requests=[];for(const slide of scene.slides.filter(s=>s.notes!==undefined)){
    const item=notesShape(deck,slide.id);if(!item?.shape)throw new Error('Read back the native speaker notes object before writing notes');
    const current=(item.shape.text?.textElements??[]).map(e=>e.textRun?.content??'').join('').replace(/\n$/,'');
    if(current.length)requests.push({deleteText:{objectId:item.objectId,textRange:{type:'ALL'}}});
    if(slide.notes)requests.push({insertText:{objectId:item.objectId,insertionIndex:0,text:slide.notes}});
  }
  return {presentationId:deck.presentationId,requests,writeControl:{requiredRevisionId:deck.revisionId},sceneDigest:digest(scene)};
}
export function verifyGooglePreservation(scene,before,after){
  if(before.presentationId!==after.presentationId)throw new Error('Native preservation needs the same working-copy presentation');
  const replaced=new Set(scene.slides.flatMap(s=>s.replace??[]));
  for(const slide of before.slides){const page=after.slides.find(s=>s.objectId===slide.objectId);if(!page)throw new Error('Native slide preservation failed');
    const targeted=scene.slides.find(s=>s.id===slide.objectId&&s.notes!==undefined);
    const metadata=s=>{const copy=structuredClone(s.slideProperties);if(targeted){const item=notesShape({slides:[s]},s.objectId);const own=copy?.notesPage?.pageElements?.find(e=>e.objectId===item?.objectId);if(own?.shape)delete own.shape.text;}return canonical(copy);};
    if(digest(metadata(slide))!==digest(metadata(page))||digest(canonical(slide.pageProperties))!==digest(canonical(page.pageProperties)))throw new Error('Native slide metadata preservation failed');
    for(const e of slide.pageElements??[])if(!replaced.has(e.objectId)){const item=page.pageElements?.find(x=>x.objectId===e.objectId);if(!item||digest(canonical(e))!==digest(canonical(item)))throw new Error('Native preserved content/style changed');}
  }
  return {preserved:true,slides:before.slides.length};
}
