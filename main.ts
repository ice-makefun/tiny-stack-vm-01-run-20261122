// Tiny stack VM for make.fun's tiny-stack-vm-01 ISA (see kit ISA.md).
// Runs every /input/<id>/program.bin on /input/<id>/input.bin and writes
// /output/<id>/stdout.bin + /output/<id>/exit.txt. One run, 40 instances.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const enc = new TextEncoder();

for (const id of readdirSync(IN).sort()) {
  const P = readFileSync(join(IN, id, 'program.bin'));
  const inp = readFileSync(join(IN, id, 'input.bin'));
  const n = P.length;
  const D = new Int32Array(256); // data stack
  const C = new Int32Array(64); // call stack (return addresses)
  const M = new Int32Array(256); // memory, 256 words
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, ip = 0, pc = 0, st = 0, ol = 0, ex = 0;

  for (;;) {
    if (st === 1000000) { ex = 10; break; } // step limit
    if (pc < 0 || pc >= n) { ex = 9; break; } // pc outside program
    const o = P[pc];
    // Decode: immediate length, pops, pushes per opcode.
    let imm = 0, pop = 0, push = 0;
    if (o === 1) { imm = 1; push = 1; } // PUSH8
    else if (o === 2) { imm = 4; push = 1; } // PUSH32
    else if (o === 3) pop = 1; // POP
    else if (o === 4) { pop = 1; push = 2; } // DUP
    else if (o === 5) { pop = 2; push = 2; } // SWAP
    else if (o === 6) { pop = 2; push = 3; } // OVER
    else if (o === 7) { pop = 3; push = 3; } // ROT
    else if (o === 0x17 || o === 0x1b) { pop = 1; push = 1; } // NEG, NOT
    else if ((o >= 0x10 && o <= 0x16) || (o >= 0x18 && o <= 0x1e) || (o >= 0x20 && o <= 0x22)) { pop = 2; push = 1; } // binary ops
    else if (o === 0x30 || o === 0x33) imm = 2; // JMP, CALL
    else if (o === 0x31 || o === 0x32) { imm = 2; pop = 1; } // JZ, JNZ
    else if (o === 0x34) { /* RET */ }
    else if (o === 0x40) { pop = 1; push = 1; } // LOAD
    else if (o === 0x41) pop = 2; // STORE
    else if (o === 0x50 || o === 0x51 || o === 0x53) pop = 1; // PRINT, PUTC, EXIT
    else if (o === 0x52) push = 1; // IN
    else if (o !== 0) { ex = 5; break; } // unknown opcode
    if (pc + imm >= n) { ex = 9; break; } // immediate cut off by program end
    st++;
    const nx = pc + 1 + imm;
    if (sp < pop) { ex = 2; break; } // stack underflow
    if (sp - pop + push > 256) { ex = 3; break; } // stack overflow
    pc = nx;

    if (o === 0) break; // HALT, exit 0
    else if (o === 1) D[sp++] = (P[nx - 1] << 24) >> 24; // PUSH8, sign-extended
    else if (o === 2) D[sp++] = P[nx - 4] | (P[nx - 3] << 8) | (P[nx - 2] << 16) | (P[nx - 1] << 24); // PUSH32
    else if (o === 3) sp--; // POP
    else if (o === 4) { D[sp] = D[sp - 1]; sp++; } // DUP
    else if (o === 5) { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; } // SWAP
    else if (o === 6) { D[sp] = D[sp - 2]; sp++; } // OVER
    else if (o === 7) { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; } // ROT
    else if (o === 0x17) D[sp - 1] = (-D[sp - 1]) | 0; // NEG (wraps)
    else if (o === 0x1b) D[sp - 1] = ~D[sp - 1]; // NOT
    else if ((o >= 0x10 && o <= 0x16) || (o >= 0x18 && o <= 0x1e) || (o >= 0x20 && o <= 0x22)) {
      // Binary ops: same ranges as the decode above, so no opcode can drift in.
      const b = D[sp - 1], a = D[sp - 2];
      let r = 0;
      if (o === 0x10) r = (a + b) | 0; // ADD wraps
      else if (o === 0x11) r = (a - b) | 0; // SUB wraps
      else if (o === 0x12) r = Math.imul(a, b); // MUL low 32 bits
      else if (o === 0x13) { if (b === 0) { ex = 4; break; } r = a === -2147483648 && b === -1 ? a : (a / b) | 0; } // DIV
      else if (o === 0x14) { if (b === 0) { ex = 4; break; } r = b === -1 ? 0 : (a % b) | 0; } // MOD
      else if (o === 0x15) { if (b === 0) { ex = 4; break; } r = Math.floor((a >>> 0) / (b >>> 0)) | 0; } // DIVU
      else if (o === 0x16) { if (b === 0) { ex = 4; break; } r = ((a >>> 0) % (b >>> 0)) | 0; } // MODU
      else if (o === 0x18) r = a & b; // AND
      else if (o === 0x19) r = a | b; // OR
      else if (o === 0x1a) r = a ^ b; // XOR
      else if (o === 0x1c) r = a << (b & 31); // SHL
      else if (o === 0x1d) r = a >> (b & 31); // SHR arithmetic
      else if (o === 0x1e) r = (a >>> (b & 31)) | 0; // SHRU logical
      else if (o === 0x20) r = a === b ? 1 : 0; // EQ
      else if (o === 0x21) r = a < b ? 1 : 0; // LT signed
      else if (o === 0x22) r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU unsigned
      sp -= 2;
      D[sp++] = r;
    } else if (o === 0x30 || o === 0x31 || o === 0x32) {
      const rel = ((P[nx - 2] | (P[nx - 1] << 8)) << 16) >> 16; // signed 16-bit
      let take = true;
      if (o !== 0x30) { const v = D[--sp]; take = o === 0x31 ? v === 0 : v !== 0; }
      if (take) pc = nx + rel;
    } else if (o === 0x33) { // CALL
      if (cp === 64) { ex = 7; break; }
      C[cp++] = nx;
      pc = P[nx - 2] | (P[nx - 1] << 8);
    } else if (o === 0x34) { // RET
      if (cp === 0) { ex = 8; break; }
      pc = C[--cp];
    } else if (o === 0x40) { // LOAD
      const a = D[sp - 1];
      if (a < 0 || a >= 256) { ex = 6; break; }
      D[sp - 1] = M[a];
    } else if (o === 0x41) { // STORE
      const a = D[sp - 1], v = D[sp - 2];
      if (a < 0 || a >= 256) { ex = 6; break; }
      sp -= 2;
      M[a] = v;
    } else if (o === 0x50) { // PRINT decimal ASCII, no newline
      const bs = enc.encode(String(D[sp - 1]));
      if (ol + bs.length > 65536) { ex = 11; break; }
      sp--;
      out.set(bs, ol);
      ol += bs.length;
    } else if (o === 0x51) { // PUTC one byte
      if (ol + 1 > 65536) { ex = 11; break; }
      out[ol++] = D[--sp] & 255;
    } else if (o === 0x52) { // IN next byte, -1 when exhausted
      D[sp++] = ip < inp.length ? inp[ip++] : -1;
    } else if (o === 0x53) { // EXIT with code v & 255
      ex = D[--sp] & 255;
      break;
    }
  }

  mkdirSync(join(OUT, id), { recursive: true });
  writeFileSync(join(OUT, id, 'stdout.bin'), out.subarray(0, ol));
  writeFileSync(join(OUT, id, 'exit.txt'), ex + '\n');
}
