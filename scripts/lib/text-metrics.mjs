// Font-backed screening in points. Target-editor renders remain authoritative.
import {readFile,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash} from './common.mjs';
const exec=promisify(execFile),normal=s=>String(s??'').replace(/[\s_-]/g,'').toLowerCase();
export const textInsets=3.6,paragraphMultiple=1.25;

async function candidates(family,bold) {
  const names=[family.replace(/ /g,'')+(bold?' Bold':''),family+(bold?' Bold':''),family+(bold?'-Bold':'-Regular')];
  const dirs=['/System/Library/Fonts/Supplemental','/Library/Fonts',join(homedir(),'Library/Fonts'),join(homedir(),'.local/share/fonts'),'/usr/share/fonts/truetype/msttcorefonts'];
  const paths=dirs.flatMap(dir=>names.flatMap(name=>['.ttf','.otf','.ttc'].map(ext=>join(dir,name+ext))));
  if(process.platform==='linux')try{const {stdout}=await exec('fc-match',['--format','%{file}',family+(bold?':style=Bold':':style=Regular')],{timeout:5000,maxBuffer:8192});if(stdout.trim())paths.unshift(stdout.trim());}catch{}
  return [...new Set(paths)];
}
export async function resolveFont(family,{bold=false,file,expectedHash}={}) {
  const paths=file?[resolve(file)]:await candidates(family,bold);
  for(const path of paths)try{
    if(!/\.(ttf|otf|ttc|dfont)$/i.test(path))throw new Error('Use a font file');const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>40*1024*1024)throw new Error('Use a bounded regular font file');
    const bytes=await readFile(path),sha256=hash(bytes);if(expectedHash&&expectedHash!==sha256)throw new Error('Font source changed');
    const kit=await import('fontkit'),source=kit.create(bytes),fonts=source.fonts??[source];
    const font=fonts.find(f=>normal(f.familyName)===normal(family)&&(bold?/^bold$/i.test(f.subfamilyName??''):/^(regular|roman|book)$/i.test(f.subfamilyName??'')));
    if(!font)throw new Error('Font family or weight does not match the scene');
    return {font,evidence:{path,sha256,family:font.familyName,style:font.subfamilyName,postscriptName:font.postscriptName}};
  }catch(error){if(file)throw error;}
  return {font:null,evidence:{family,style:bold?'Bold':'Regular',status:'exact font unavailable; native review required'}};
}
// code lists [start,end) ranges of value set in codeFont (inline code). Without codeFont those characters are
// estimated as monospace, at 0.6 em each.
export function measureText(value,{font,fontSize,width,height,padding=textInsets,lineMultiple=paragraphMultiple,code,codeFont}={}) {
  if(!font||![fontSize,width,height,padding,lineMultiple].every(Number.isFinite)||fontSize<=0||width<=0||height<=0||padding<0||lineMultiple<=0)throw new Error('Provide a font and finite text geometry');
  if(code?.length)return measureRuns(value,{font,fontSize,width,height,padding,lineMultiple,code,codeFont});
  const availableWidth=width-padding*2,availableHeight=height-padding*2,scale=fontSize/font.unitsPerEm;
  const missing=[...new Set([...value].filter(c=>!/[\r\n\t]/.test(c)&&!font.hasGlyphForCodePoint(c.codePointAt(0))))];
  const advance=text=>font.layout(text).positions.reduce((sum,p)=>sum+p.xAdvance,0)*scale;
  const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'}),lines=[];
  for(const paragraph of value.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n')) {
    let line='';
    for(const token of paragraph.match(/[^ \t]+[ \t]*|[ \t]+/gu)??[]) {
      if(advance(line+token.trimEnd())<=availableWidth){line+=token;continue;}
      if(line.trim()){lines.push(line.trimEnd());line='';}
      const word=token.trimStart();
      if(advance(word.trimEnd())<=availableWidth){line=word;continue;}
      for(const {segment} of graphemes.segment(word)) {
        if(line&&advance(line+segment)>availableWidth){lines.push(line.trimEnd());line='';}
        line+=segment;
      }
    }
    lines.push(line.trimEnd());
  }
  const lineHeight=Math.max(fontSize,(font.ascent-font.descent+(font.lineGap??0))*scale)*lineMultiple;
  const requiredHeight=lines.length*lineHeight+padding*2,maxWidth=Math.max(0,...lines.map(advance));
  return {lines:lines.length,lineHeight,requiredHeight,maxWidth,availableWidth,availableHeight,
    overflowHeight:Math.max(0,requiredHeight-height),overflowWidth:Math.max(0,maxWidth-availableWidth),missingGlyphs:missing,
    tabStopsEstimated:value.includes('\t'),model:'shaped glyph advances; word/grapheme wrapping; conservative font line metrics',lineMultiple,padding};
}

// Text with inline code: the same wrapping, with each stretch of characters laid out in its own font.
function measureRuns(value,{font,fontSize,width,height,padding,lineMultiple,code,codeFont}) {
  const availableWidth=width-padding*2,availableHeight=height-padding*2,scale=f=>fontSize/f.unitsPerEm;
  // Tabs and line endings are normalized per character, so each keeps its place in or out of a code range.
  let text='';const mono=[];
  for(let at=0;at<value.length;) {
    const c=String.fromCodePoint(value.codePointAt(at)),inCode=code.some(([a,b])=>at>=a&&at<b);at+=c.length;
    if(c==='\r'){if(value[at]==='\n')continue;text+='\n';mono.push(inCode);continue;}
    const out=c==='\t'?'    ':c;text+=out;for(let k=0;k<out.length;k++)mono.push(inCode);
  }
  const fontAt=i=>mono[i]?codeFont:font,missing=[];
  for(let i=0;i<text.length;){const cp=text.codePointAt(i),c=String.fromCodePoint(cp);if(c!=='\n'&&fontAt(i)&&!fontAt(i).hasGlyphForCodePoint(cp)&&!missing.includes(c))missing.push(c);i+=c.length;}
  const piece=(a,b)=>{const s=text.slice(a,b),f=fontAt(a);if(!s)return 0;if(!f)return [...s].length*fontSize*.6;return f.layout(s).positions.reduce((sum,p)=>sum+p.xAdvance,0)*scale(f);};
  const advance=(a,b)=>{let sum=0,start=a;for(let i=a+1;i<=b;i++)if(i===b||mono[i]!==mono[start]){sum+=piece(start,i);start=i;}return sum;};
  const trimEnd=(a,b)=>{while(b>a&&/[ \t]/.test(text[b-1]))b--;return b;},trimStart=(a,b)=>{while(a<b&&/[ \t]/.test(text[a]))a++;return a;};
  const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'}),lines=[];
  let base=0;
  for(const paragraph of text.split('\n')) {
    // A line is the range [ls,le) of the text; the rules are measureText's, applied to ranges.
    let ls=base,le=base;
    for(const m of paragraph.matchAll(/[^ \t]+[ \t]*|[ \t]+/gu)) {
      const ts=base+m.index,te=ts+m[0].length;
      if(advance(ls,trimEnd(ls,te))<=availableWidth){le=te;continue;}
      if(text.slice(ls,le).trim())lines.push([ls,trimEnd(ls,le)]);
      const ws=trimStart(ts,te);ls=ws;le=ws;
      if(advance(ws,trimEnd(ws,te))<=availableWidth){le=te;continue;}
      let at=ws;
      for(const {segment} of graphemes.segment(text.slice(ws,te))) {
        if(le>ls&&advance(ls,at+segment.length)>availableWidth){lines.push([ls,trimEnd(ls,le)]);ls=at;}
        at+=segment.length;le=at;
      }
    }
    lines.push([ls,trimEnd(ls,le)]);base+=paragraph.length+1;
  }
  // A line holding code is as tall as the taller of the two fonts.
  const lineOf=f=>Math.max(fontSize,(f.ascent-f.descent+(f.lineGap??0))*scale(f))*lineMultiple;
  const plain=lineOf(font),coded=codeFont?Math.max(plain,lineOf(codeFont)):plain,heights=lines.map(([a,b])=>mono.slice(a,b).some(Boolean)?coded:plain);
  const requiredHeight=heights.reduce((sum,h)=>sum+h,0)+padding*2,maxWidth=Math.max(0,...lines.map(([a,b])=>advance(a,b)));
  return {lines:lines.length,lineHeight:Math.max(...heights),requiredHeight,maxWidth,availableWidth,availableHeight,
    overflowHeight:Math.max(0,requiredHeight-height),overflowWidth:Math.max(0,maxWidth-availableWidth),missingGlyphs:missing,
    tabStopsEstimated:value.includes('\t'),model:`shaped glyph advances in the text and code fonts${codeFont?'':' (code estimated at 0.6 em)'}; word/grapheme wrapping; conservative font line metrics`,lineMultiple,padding};
}
