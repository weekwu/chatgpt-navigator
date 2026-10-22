// Dependency-free PNG authoring for the native, code-defined navigation glyph.
import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
function crc32(buffer) { let crc = -1; for (const n of buffer) { crc ^= n; for(let b=0;b<8;b++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
function chunk(type, data) { const name=Buffer.from(type), len=Buffer.alloc(4), crc=Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name,data]))); return Buffer.concat([len,name,data,crc]); }
for (const size of [16,32,48,128]) {
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const offset=y*(size*4+1)+1+x*4;
    const px=(x+.5)/size,py=(y+.5)/size;
    const corner=Math.hypot(Math.max(.2-px,0,px-.8),Math.max(.2-py,0,py-.8));
    let color=[41,45,44,corner>.18?0:255];
    const bars=[{y:.31,x:.32,end:.68},{y:.5,x:.25,end:.75},{y:.69,x:.38,end:.68}];
    if(bars.some(b=>Math.abs(py-b.y)<.027 && px>b.x && px<b.end)) color=[225,239,232,255];
    color.forEach((v,i)=>raw[offset+i]=v);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  await writeFile(`public/icons/${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
