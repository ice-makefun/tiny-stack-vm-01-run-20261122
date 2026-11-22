// Tiny stack VM (make.fun tiny-stack-vm-01): runs /input/<id>/program.bin on input.bin,
// writes /output/<id>/stdout.bin + exit.txt. Semantics follow kit ISA.md / vm.mjs.
import{mkdirSync,readFileSync,readdirSync,writeFileSync}from'node:fs';
import{join}from'node:path';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output',E=new TextEncoder;
for(const id of readdirSync(I).sort()){
const P=readFileSync(join(I,id,'program.bin')),N=readFileSync(join(I,id,'input.bin')),n=P.length,D=new Int32Array(256),C=new Int32Array(64),M=new Int32Array(256),o=new Uint8Array(65536);
let sp=0,cp=0,ip=0,pc=0,st=0,ol=0,ex=0;
for(;;){
if(st===1e6){ex=10;break}
if(pc<0||pc>=n){ex=9;break}
const k=P[pc];let m=0,u=0,v=0;
if(k===1){m=1;v=1}else if(k===2){m=4;v=1}else if(k===3)u=1;else if(k===4){u=1;v=2}else if(k===5){u=2;v=2}else if(k===6){u=2;v=3}else if(k===7){u=3;v=3}else if(k===0x17||k===0x1b){u=1;v=1}else if(k>=0x10&&k<=0x16||k>=0x18&&k<=0x1e||k>=0x20&&k<=0x22){u=2;v=1}else if(k===0x30||k===0x33)m=2;else if(k===0x31||k===0x32){m=2;u=1}else if(k===0x34){}else if(k===0x40){u=1;v=1}else if(k===0x41)u=2;else if(k===0x50||k===0x51||k===0x53)u=1;else if(k===0x52)v=1;else if(k!==0){ex=5;break}
if(pc+m>=n){ex=9;break}
st++;const nx=pc+1+m;
if(sp<u){ex=2;break}
if(sp-u+v>256){ex=3;break}
pc=nx;
if(k===0)break;
else if(k===1)D[sp++]=(P[nx-1]<<24)>>24;
else if(k===2)D[sp++]=P[nx-4]|P[nx-3]<<8|P[nx-2]<<16|P[nx-1]<<24;
else if(k===3)sp--;
else if(k===4){D[sp]=D[sp-1];sp++}
else if(k===5){const t=D[sp-1];D[sp-1]=D[sp-2];D[sp-2]=t}
else if(k===6){D[sp]=D[sp-2];sp++}
else if(k===7){const a=D[sp-3];D[sp-3]=D[sp-2];D[sp-2]=D[sp-1];D[sp-1]=a}
else if(k===0x17)D[sp-1]=-D[sp-1]|0;
else if(k===0x1b)D[sp-1]=~D[sp-1];
else if((k>=0x10&&k<=0x16)||(k>=0x18&&k<=0x1e)||(k>=0x20&&k<=0x22)){
const b=D[sp-1],a=D[sp-2];let r=0;
if(k===0x10)r=a+b|0;else if(k===0x11)r=a-b|0;else if(k===0x12)r=Math.imul(a,b);
else if(k===0x13){if(!b){ex=4;break}r=a===-2147483648&&b===-1?a:(a/b)|0}
else if(k===0x14){if(!b){ex=4;break}r=b===-1?0:a%b|0}
else if(k===0x15){if(!b){ex=4;break}r=Math.floor((a>>>0)/(b>>>0))|0}
else if(k===0x16){if(!b){ex=4;break}r=(a>>>0)%(b>>>0)|0}
else if(k===0x18)r=a&b;else if(k===0x19)r=a|b;else if(k===0x1a)r=a^b;
else if(k===0x1c)r=a<<(b&31);else if(k===0x1d)r=a>>(b&31);else if(k===0x1e)r=a>>>(b&31)|0;
else if(k===0x20)r=a===b?1:0;else if(k===0x21)r=a<b?1:0;else r=(a>>>0)<(b>>>0)?1:0;
sp-=2;D[sp++]=r}
else if(k===0x30||k===0x31||k===0x32){
const rl=((P[nx-2]|P[nx-1]<<8)<<16)>>16;let t=1;
if(k!==0x30){const w=D[--sp];t=k===0x31?w===0:w!==0}
if(t)pc=nx+rl}
else if(k===0x33){if(cp===64){ex=7;break}C[cp++]=nx;pc=P[nx-2]|P[nx-1]<<8}
else if(k===0x34){if(!cp){ex=8;break}pc=C[--cp]}
else if(k===0x40){const a=D[sp-1];if(a<0||a>=256){ex=6;break}D[sp-1]=M[a]}
else if(k===0x41){const a=D[sp-1],w=D[sp-2];if(a<0||a>=256){ex=6;break}sp-=2;M[a]=w}
else if(k===0x50){const g=E.encode(String(D[sp-1]));if(ol+g.length>65536){ex=11;break}sp--;o.set(g,ol);ol+=g.length}
else if(k===0x51){if(ol+1>65536){ex=11;break}o[ol++]=D[--sp]&255}
else if(k===0x52)D[sp++]=ip<N.length?N[ip++]:-1;
else if(k===0x53){ex=D[--sp]&255;break}
}
mkdirSync(join(O,id),{recursive:true});
writeFileSync(join(O,id,'stdout.bin'),o.subarray(0,ol));
writeFileSync(join(O,id,'exit.txt'),ex+'\n');
}
