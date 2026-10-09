// One image of every slide, in order and numbered, so a deck can be judged as a deck. No image library: the renderer's PNGs are plain 8-bit RGB.
import {readFile,writeFile} from 'node:fs/promises';
import {inflateSync,deflateSync} from 'node:zlib';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
const crc=bytes=>{let c=0xFFFFFFFF;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
const chunk=(type,data)=>{const head=Buffer.alloc(8);head.writeUInt32BE(data.length,0);head.write(type,4,'ascii');const tail=Buffer.alloc(4);tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4),data])),0);return Buffer.concat([head,data,tail]);};

// Decode to tightly packed RGB. Only what a slide render uses is supported: 8-bit truecolor, with or without alpha, not interlaced.
export function decodePng(bytes) {
  if(!bytes.subarray(0,8).equals(signature))throw new Error('Not a PNG image');
  let width,height,channels,at=8;const data=[];
  while(at<bytes.length) {
    const length=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),body=bytes.subarray(at+8,at+8+length);
    if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);if(body[8]!==8||![2,6].includes(body[9])||body[12]!==0)throw new Error('Unsupported PNG kind for a contact sheet');channels=body[9]===6?4:3;}
    else if(type==='IDAT')data.push(body);
    at+=12+length;
  }
  if(!width||!height||!data.length)throw new Error('Incomplete PNG image');
  const raw=inflateSync(Buffer.concat(data)),stride=width*channels,rgb=Buffer.alloc(width*height*3),line=Buffer.alloc(stride),above=Buffer.alloc(stride);
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)],row=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
    for(let x=0;x<stride;x++) {
      const left=x>=channels?line[x-channels]:0,up=above[x],corner=x>=channels?above[x-channels]:0;
      let predicted=0;
      if(filter===1)predicted=left;else if(filter===2)predicted=up;else if(filter===3)predicted=(left+up)>>1;
      else if(filter===4){const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);predicted=a<=b&&a<=c?left:b<=c?up:corner;}
      else if(filter!==0)throw new Error('Corrupt PNG filter');
      line[x]=(row[x]+predicted)&255;
    }
    for(let x=0;x<width;x++)line.copy(rgb,(y*width+x)*3,x*channels,x*channels+3);
    line.copy(above);
  }
  return {width,height,rgb};
}

export function encodePng({width,height,rgb}) {
  const raw=Buffer.alloc(height*(width*3+1));
  for(let y=0;y<height;y++)rgb.copy(raw,y*(width*3+1)+1,y*width*3,(y+1)*width*3);
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

// Slide numbers in a 3×5 dot face, so a reviewer can name a slide without counting.
const digits=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
function stamp(sheet,x,y,number) {
  const text=String(number),dot=4,pad=6,w=text.length*4*dot-dot+pad*2,h=5*dot+pad*2;
  const set=(px,py,v)=>{if(px>=0&&py>=0&&px<sheet.width&&py<sheet.height)sheet.rgb.fill(v,(py*sheet.width+px)*3,(py*sheet.width+px)*3+3);};
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)set(x+i,y+j,34);
  [...text].forEach((ch,n)=>{const glyph=digits[Number(ch)];for(let r=0;r<5;r++)for(let c=0;c<3;c++)if(glyph[r*3+c]==='1')for(let j=0;j<dot;j++)for(let i=0;i<dot;i++)set(x+pad+n*4*dot+c*dot+i,y+pad+r*dot+j,255);});
}

// images are same-sized thumbnails in deck order; numbers default to 1, 2, 3...
export function tile(images,{columns,gap=12,numbers}={}) {
  if(!images.length)throw new Error('No slides to put on a contact sheet');
  const {width:w,height:h}=images[0];
  if(images.some(i=>i.width!==w||i.height!==h))throw new Error('Slides on a contact sheet must be one size');
  const cols=columns??(images.length<=4?2:images.length<=9?3:images.length<=16?4:5),rows=Math.ceil(images.length/cols);
  const sheet={width:cols*w+(cols+1)*gap,height:rows*h+(rows+1)*gap};sheet.rgb=Buffer.alloc(sheet.width*sheet.height*3,136);
  images.forEach((image,n)=>{
    const x=gap+(n%cols)*(w+gap),y=gap+Math.floor(n/cols)*(h+gap);
    for(let row=0;row<h;row++)image.rgb.copy(sheet.rgb,((y+row)*sheet.width+x)*3,row*w*3,(row+1)*w*3);
    stamp(sheet,x,y,numbers?.[n]??n+1);
  });
  return sheet;
}

export async function writeContactSheet(files,output,options) {
  const sheet=tile(await Promise.all(files.map(async file=>decodePng(await readFile(file)))),options);
  await writeFile(output,encodePng(sheet),{flag:'wx',mode:0o600});
  return {path:output,width:sheet.width,height:sheet.height,slides:files.length};
}
