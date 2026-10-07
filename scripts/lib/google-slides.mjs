import { request, gcloudToken } from '../google-drive-deck.mjs';
import { validateScene, themeFor, color } from './scene.mjs';
import { digest } from './common.mjs';
const validId = id => { if (!/^[A-Za-z0-9_-]+$/.test(id??'')) throw new Error('Provide a native Google presentation ID'); return id; };
const rgb = hex => Object.fromEntries(['red','green','blue'].map((k,i)=>[k,parseInt(hex.slice(1+i*2,3+i*2),16)/255]));
const size=(w,h)=>({width:{magnitude:w,unit:'PT'},height:{magnitude:h,unit:'PT'}});
const transform=(x,y)=>({scaleX:1,scaleY:1,shearX:0,shearY:0,translateX:x,translateY:y,unit:'PT'});
const idsIn=value=>{const ids=new Set();const visit=v=>{if(!v||typeof v!=='object')return;if(v.objectId)ids.add(v.objectId);for(const x of Object.values(v))if(typeof x==='object')Array.isArray(x)?x.forEach(visit):visit(x);};visit(value);return ids;};
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
export function compileGoogleScene(scene,deck) {
  validateScene(scene); const t=themeFor(scene),requests=[],existing=idsIn(deck);
  validId(deck?.presentationId); if(!deck.revisionId||!Array.isArray(deck.slides))throw new Error('Use a full native snapshot with a revision');
  const pt=d=>d?.unit==='PT'?d.magnitude:d?.unit==='EMU'?d.magnitude/12700:NaN;
  if(Math.abs(pt(deck.pageSize?.width)-scene.canvas.width)>1||Math.abs(pt(deck.pageSize?.height)-scene.canvas.height)>1)throw new Error('Scene and native template canvas differ');
  const solid=v=>({rgbColor:rgb(color(v,t))}),props=(s,e)=>({pageObjectId:s.id,size:size(e.width,e.height),transform:transform(e.x,e.y)});
  function text(e,cellLocation) {
    const selector=cellLocation?{cellLocation}:{};
    return [{insertText:{objectId:e.id,...selector,insertionIndex:0,text:e.text}},
      {updateTextStyle:{objectId:e.id,...selector,textRange:{type:'ALL'},style:{fontFamily:t.font,fontSize:{magnitude:e.fontSize??(e.role==='title'?t.titleSize:t.bodySize),unit:'PT'},bold:e.bold??false,foregroundColor:{opaqueColor:solid(e.color??'text')}},fields:'fontFamily,fontSize,bold,foregroundColor'}},
      {updateParagraphStyle:{objectId:e.id,...selector,textRange:{type:'ALL'},style:{alignment:({left:'START',center:'CENTER',right:'END'})[e.align??'left']},fields:'alignment'}}];
  }
  for(const s of scene.slides) {
    if (s.notes !== undefined) throw new Error('Scene notes are not supported by this Google compiler; preserve/add them through native tools');
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
        if(!/^https:\/\//.test(e.src))throw new Error('Google image objects need a public HTTPS URL; use native asset insertion for local images');
        if((e.fit??'contain')==='cover')throw new Error('Google cover crops require native crop controls; no silent approximation');
        requests.push({createImage:{objectId:e.id,url:e.src,elementProperties:props(s,e)}});
        requests.push({updatePageElementAltText:{objectId:e.id,title:e.alt,description:e.alt}});
      } else if(e.type==='chart') {
        const c=e.sheetsChart;
        if(!c?.spreadsheetId||!Number.isInteger(c.chartId))throw new Error('Editable Google charts need sheetsChart:{spreadsheetId,chartId}; no image fallback');
        validId(c.spreadsheetId);
        requests.push({createSheetsChart:{objectId:e.id,spreadsheetId:c.spreadsheetId,chartId:c.chartId,linkingMode:'LINKED',elementProperties:props(s,e)}});
      } else if(e.type==='line') {
        requests.push({createLine:{objectId:e.id,lineCategory:'STRAIGHT',elementProperties:props(s,e)}});
        requests.push({updateLineProperties:{objectId:e.id,lineProperties:{lineFill:{solidFill:{color:solid(e.color??'accent'),alpha:1}},weight:{magnitude:e.weight??2,unit:'PT'},endArrow:e.arrow?'FILL_ARROW':'NONE'},fields:'lineFill,weight,endArrow'}});
      } else if(e.type==='table') {
        requests.push({createTable:{objectId:e.id,rows:e.rows.length,columns:e.rows[0].length,elementProperties:props(s,e)}});
        requests.push({updateTableColumnProperties:{objectId:e.id,columnIndices:e.rows[0].map((_,i)=>i),tableColumnProperties:{columnWidth:{magnitude:e.width/e.rows[0].length,unit:'PT'}},fields:'columnWidth'}});
        requests.push({updateTableRowProperties:{objectId:e.id,rowIndices:e.rows.map((_,i)=>i),tableRowProperties:{minRowHeight:{magnitude:e.height/e.rows.length,unit:'PT'}},fields:'minRowHeight'}});
        e.rows.forEach((row,rowIndex)=>row.forEach((value,columnIndex)=>{if(value)requests.push(...text({...e,text:value,bold:rowIndex===0}, {rowIndex,columnIndex}));requests.push({updateTableCellProperties:{objectId:e.id,tableRange:{location:{rowIndex,columnIndex},rowSpan:1,columnSpan:1},tableCellProperties:{tableCellBackgroundFill:{solidFill:{color:solid(rowIndex===0?'muted':'background'),alpha:1}},contentAlignment:'MIDDLE'},fields:'tableCellBackgroundFill,contentAlignment'}});}));
      } else {
        requests.push({createShape:{objectId:e.id,shapeType:e.type==='text'?'TEXT_BOX':e.shape==='ellipse'?'ELLIPSE':'RECTANGLE',elementProperties:props(s,e)}});
        requests.push({updateShapeProperties:{objectId:e.id,shapeProperties:{shapeBackgroundFill:e.fill?{solidFill:{color:solid(e.fill),alpha:1}}:{propertyState:'NOT_RENDERED'},outline:{propertyState:'NOT_RENDERED'},contentAlignment:'MIDDLE'},fields:'shapeBackgroundFill,outline,contentAlignment'}});
        if(e.text)requests.push(...text(e));
      }
    }
  }
  return {presentationId:deck.presentationId,requests,writeControl:{requiredRevisionId:deck.revisionId},sceneDigest:digest(scene),templateDigest:digest(deck),status:'unreviewed draft'};
}
export async function applyGoogleScene(scene,deck,deps={}) {
  const plan=compileGoogleScene(scene,deck),current=await snapshotDeck(plan.presentationId,deps);
  if(current.revisionId!==deck.revisionId)throw new Error('Native deck changed; refresh, rebuild and inspect before applying');
  try{await(await request(`https://slides.googleapis.com/v1/presentations/${plan.presentationId}:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:plan.requests,writeControl:plan.writeControl})},deps)).json();}
  catch(error){throw new Error(`${error.message} Outcome may be uncertain. Inspect Slides before retrying; no automatic retry.`);}
  const after=await snapshotDeck(plan.presentationId,deps),afterIds=idsIn(after);
  for(const s of scene.slides)for(const e of s.elements)if(!afterIds.has(e.id))throw new Error('Update sent but object readback incomplete; inspect native deck');
  const replaced=new Set(scene.slides.flatMap(s=>s.replace??[]));
  for(const s of deck.slides)for(const e of s.pageElements??[])if(!replaced.has(e.objectId)&&!afterIds.has(e.objectId))throw new Error('Update sent but preserved object missing; inspect native deck');
  return {presentationId:after.presentationId,revisionId:after.revisionId,url:`https://docs.google.com/presentation/d/${after.presentationId}/edit`,status:'native objects read back; visual review required'};
}
