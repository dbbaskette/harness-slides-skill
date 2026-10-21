// A stand-in for the Google preview pool: it records the call, hands the render a pool file and never reaches Drive.
export function poolStub(calls=[],{id='drive_file_1',generation=1,slot=1,size=4,fail}={}){
  return async({file,fileId,size:asked,render})=>{
    calls.push(['pool',fileId??null,asked??null]);if(fail)throw fail;
    const remote={id,name:`Harness Slides preview ${slot}`,url:`https://docs.google.com/presentation/d/${id}/edit`,pool:{slot,size:asked??size,generation,receipt:`${id}:${generation}`,route:'drive-update',folder:{id:'pool_folder',url:'https://drive.google.com/drive/folders/pool_folder',name:'Harness Slides previews'}}};
    if(render)await render(remote);
    void file;return remote;
  };
}

const slides='application/vnd.google-apps.presentation',folderType='application/vnd.google-apps.folder';
// A stand-in for Drive that keeps files in memory and records every request. It never deletes anything,
// and the test checks that nothing ever asks it to.
export function fakeDrive({account='person@example.invalid',refuseUpdate=false,files=new Map(),prefix=''}={}){
  let next=0;const calls=[];
  const send=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const multipart=body=>{const text=body.toString('latin1'),meta=JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]),content=text.split('\r\n\r\n')[2].split('\r\n--')[0];return {meta,content};};
  const fetcher=async(url,options={})=>{
    const u=new URL(url),method=options.method??'GET';calls.push([method,u.pathname,u.searchParams.get('uploadType')]);
    if(method==='DELETE')throw new Error('The pool must never delete a Drive file');
    if(u.pathname==='/drive/v3/about')return send({user:{emailAddress:account}});
    if(u.pathname==='/drive/v3/files'&&method==='GET'){
      const q=u.searchParams.get('q'),marker=q.match(/key='(\w+)' and value='(\w+)'/),parent=q.match(/'([\w-]+)' in parents/)?.[1];
      return send({files:[...files.values()].filter(f=>!f.trashed&&f.appProperties?.[marker[1]]===marker[2]&&(!parent||f.parents?.includes(parent))&&(!q.includes(folderType)||f.mimeType===folderType))});
    }
    if(u.pathname==='/drive/v3/files'&&method==='POST'){const meta=JSON.parse(options.body),id=`${prefix}folder_${++next}`;files.set(id,{id,...meta,parents:['root']});return send({id,name:meta.name});}
    if(u.pathname==='/upload/drive/v3/files'&&method==='POST'){const {meta,content}=multipart(options.body),id=`${prefix}pool_file_${++next}`;files.set(id,{id,...meta,content,version:1});return send({id,name:meta.name,mimeType:meta.mimeType});}
    const parts=u.pathname.split('/'),id=parts[parts.indexOf('files')+1],file=files.get(id);
    if(u.pathname.startsWith('/upload/drive/v3/files/')&&method==='PATCH'){
      if(refuseUpdate)return send({error:{errors:[{reason:'forbidden'}]}},403);
      if(!file)return send({},404);file.content=Buffer.from(options.body).toString('latin1');file.version++;return send({id,mimeType:file.mimeType});
    }
    if(u.pathname.endsWith('/export'))return new Response(`%PDF-1.7 ${file.content}`);
    if(method==='PATCH'){const change=JSON.parse(options.body);Object.assign(file,change);return send({id,trashed:file.trashed});}
    if(!file)return send({error:{code:404}},404);
    return send(file);
  };
  return {files,calls,fetcher,live:()=>[...files.values()].filter(f=>f.mimeType===slides&&!f.trashed)};
}
