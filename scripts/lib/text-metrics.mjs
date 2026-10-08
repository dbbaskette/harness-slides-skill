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
export function measureText(value,{font,fontSize,width,height,padding=textInsets,lineMultiple=paragraphMultiple}={}) {
  if(!font||![fontSize,width,height,padding,lineMultiple].every(Number.isFinite)||fontSize<=0||width<=0||height<=0||padding<0||lineMultiple<=0)throw new Error('Provide a font and finite text geometry');
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
