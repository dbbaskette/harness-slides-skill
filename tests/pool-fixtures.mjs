import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Any test that imports these fixtures uses its own empty pool state, even when run without npm test,
// so it never reads or writes this computer's preview pool.
if(!process.env.HARNESS_PREVIEW_POOL_STATE)process.env.HARNESS_PREVIEW_POOL_STATE=mkdtempSync(join(tmpdir(),'harness-pool-fixture-'));

// A stand-in for the Google preview pool: it records the call, hands the render a pool file and never reaches Drive.
export function poolStub(calls=[],{id='drive_file_1',generation=1,slot=1,size=4,fail}={}){
  return async({file,fileId,size:asked,render})=>{
    calls.push(['pool',fileId??null,asked??null]);if(fail)throw fail;
    const remote={id,name:`Harness Slides preview ${slot}`,url:`https://docs.google.com/presentation/d/${id}/edit`,pool:{slot,size:asked??size,generation,receipt:`${id}:${generation}`,route:'drive-update',folder:{id:'pool_folder',url:'https://drive.google.com/drive/folders/pool_folder',name:'Harness Slides previews'}}};
    if(render)await render(remote,{});
    void file;return remote;
  };
}

const slides='application/vnd.google-apps.presentation',folderType='application/vnd.google-apps.folder';
// A stand-in for Drive that keeps files in memory and records every request. It never deletes anything,
// and the test checks that nothing ever asks it to. Every write gets a new modifiedTime, as in Drive.
// serverErrors: how many upload PATCHes answer HTTP 500 first. onExport(id): runs before an export is served.
// accountFor(authorization): the account a token belongs to.
export function fakeDrive({account='person@example.invalid',refuseUpdate=false,files=new Map(),prefix='',serverErrors=0,refuseCreate=false,onExport,accountFor}={}){
  let next=0,clock=Date.UTC(2026,9,21);const calls=[],stamp=()=>new Date(clock+=1000).toISOString();
  const state={serverErrors};
  const send=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const multipart=body=>{const text=body.toString('latin1'),meta=JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]),content=text.split('\r\n\r\n')[2].split('\r\n--')[0];return {meta,content};};
  const fetcher=async(url,options={})=>{
    const u=new URL(url),method=options.method??'GET';calls.push([method,u.pathname,u.searchParams.get('uploadType'),options.headers?.Authorization]);
    if(method==='DELETE')throw new Error('The pool must never delete a Drive file');
    if(u.pathname==='/drive/v3/about')return send({user:{emailAddress:accountFor?accountFor(options.headers?.Authorization):account}});
    if(u.pathname==='/drive/v3/files'&&method==='GET'){
      const q=u.searchParams.get('q'),marker=q.match(/key='(\w+)' and value='(\w+)'/),parent=q.match(/'([\w-]+)' in parents/)?.[1];
      return send({files:[...files.values()].filter(f=>!f.trashed&&f.appProperties?.[marker[1]]===marker[2]&&(!parent||f.parents?.includes(parent))&&(!q.includes(folderType)||f.mimeType===folderType))});
    }
    if(u.pathname==='/drive/v3/files'&&method==='POST'){const meta=JSON.parse(options.body),id=`${prefix}folder_${++next}`;files.set(id,{id,...meta,parents:['root'],modifiedTime:stamp()});return send({id,name:meta.name});}
    if(u.pathname==='/upload/drive/v3/files'&&method==='POST'&&refuseCreate)return send({error:{code:500}},500);
    if(u.pathname==='/upload/drive/v3/files'&&method==='POST'){const {meta,content}=multipart(options.body),id=`${prefix}pool_file_${++next}`;files.set(id,{id,...meta,content,modifiedTime:stamp()});return send(files.get(id));}
    const parts=u.pathname.split('/'),id=parts[parts.indexOf('files')+1],file=files.get(id);
    if(u.pathname.startsWith('/upload/drive/v3/files/')&&method==='PATCH'){
      if(state.serverErrors>0){state.serverErrors--;return send({error:{code:500}},500);}
      if(refuseUpdate)return send({error:{errors:[{reason:'forbidden'}]}},403);
      if(!file)return send({},404);file.content=Buffer.from(options.body).toString('latin1');file.modifiedTime=stamp();return send(file);
    }
    if(u.pathname.endsWith('/export')){await onExport?.(id);return new Response(`%PDF-1.7 ${file.content}`);}
    if(method==='PATCH'){
      if(!file)return send({},404);
      const {appProperties,...change}=JSON.parse(options.body);Object.assign(file,change);
      if(appProperties)file.appProperties={...file.appProperties,...appProperties};
      file.modifiedTime=stamp();return send(file);
    }
    if(!file)return send({error:{code:404}},404);
    return send(file);
  };
  // Another computer's preview writing into a file, as Drive would record it.
  const writeAsAnother=(id,content)=>{const file=files.get(id);file.content=content;file.modifiedTime=stamp();};
  return {files,calls,fetcher,state,writeAsAnother,live:()=>[...files.values()].filter(f=>f.mimeType===slides&&!f.trashed)};
}
