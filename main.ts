// Tiny stack VM for make.fun's tiny-stack-vm-01 — a faithful interpreter of ISA v1
// (kit program/generator/subject/ISA.md; vm.mjs is the reference). Runs 40 instances.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [byte, immediate bytes, pops, pushes] — the 35 opcodes of ISA v1.
const TAB = [
  [0x00, 0, 0, 0], [0x01, 1, 0, 1], [0x02, 4, 0, 1], [0x03, 0, 1, 0],
  [0x04, 0, 1, 2], [0x05, 0, 2, 2], [0x06, 0, 2, 3], [0x07, 0, 3, 3],
  [0x10, 0, 2, 1], [0x11, 0, 2, 1], [0x12, 0, 2, 1], [0x13, 0, 2, 1],
  [0x14, 0, 2, 1], [0x15, 0, 2, 1], [0x16, 0, 2, 1], [0x17, 0, 1, 1],
  [0x18, 0, 2, 1], [0x19, 0, 2, 1], [0x1a, 0, 2, 1], [0x1b, 0, 1, 1],
  [0x1c, 0, 2, 1], [0x1d, 0, 2, 1], [0x1e, 0, 2, 1], [0x20, 0, 2, 1],
  [0x21, 0, 2, 1], [0x22, 0, 2, 1], [0x30, 2, 0, 0], [0x31, 2, 1, 0],
  [0x32, 2, 1, 0], [0x33, 2, 0, 0], [0x34, 0, 0, 0], [0x40, 0, 1, 1],
  [0x41, 0, 2, 0], [0x50, 0, 1, 0], [0x51, 0, 1, 0], [0x52, 0, 0, 1],
  [0x53, 0, 1, 0],
];
const BYOP = new Map(TAB.map((o) => [o[0], o]));

function go(q: Uint8Array, ib: Uint8Array): { out: Uint8Array; code: number } {
  const ln = q.length;
  const S = new Int32Array(256);
  let tp = 0;
  const R = new Int32Array(64);
  let rp = 0;
  const G = new Int32Array(256);
  const ob = new Uint8Array(65536);
  let ol = 0;
  let ix = 0;
  let cp = 0;
  let st = 0;
  const fn = (code: number) => ({ out: ob.slice(0, ol), code });
  for (;;) {
    if (st === 1000000) return fn(10);
    if (cp < 0 || cp >= ln) return fn(9);
    const oc = BYOP.get(q[cp]);
    if (oc === undefined) return fn(5);
    const im = oc[1];
    const po = oc[2];
    const pu = oc[3];
    if (cp + im >= ln) return fn(9);
    st++;
    const nx = cp + 1 + im;
    if (tp < po) return fn(2);
    if (tp - po + pu > 256) return fn(3);
    cp = nx;
    switch (oc[0]) {
      case 0x00:
        return fn(0);
      case 0x01:
        S[tp++] = (q[nx - 1] << 24) >> 24;
        break;
      case 0x02:
        S[tp++] = q[nx - 4] | (q[nx - 3] << 8) | (q[nx - 2] << 16) | (q[nx - 1] << 24);
        break;
      case 0x03:
        tp--;
        break;
      case 0x04:
        S[tp] = S[tp - 1];
        tp++;
        break;
      case 0x05: {
        const u = S[tp - 1];
        S[tp - 1] = S[tp - 2];
        S[tp - 2] = u;
        break;
      }
      case 0x06:
        S[tp] = S[tp - 2];
        tp++;
        break;
      case 0x07: {
        const x = S[tp - 3];
        S[tp - 3] = S[tp - 2];
        S[tp - 2] = S[tp - 1];
        S[tp - 1] = x;
        break;
      }
      case 0x17:
        S[tp - 1] = -S[tp - 1] | 0;
        break;
      case 0x1b:
        S[tp - 1] = ~S[tp - 1];
        break;
      case 0x10:
      case 0x11:
      case 0x12:
      case 0x13:
      case 0x14:
      case 0x15:
      case 0x16:
      case 0x18:
      case 0x19:
      case 0x1a:
      case 0x1c:
      case 0x1d:
      case 0x1e:
      case 0x20:
      case 0x21:
      case 0x22: {
        const y = S[tp - 1];
        const x = S[tp - 2];
        let z: number;
        switch (oc[0]) {
          case 0x10:
            z = (x + y) | 0;
            break;
          case 0x11:
            z = (x - y) | 0;
            break;
          case 0x12:
            z = Math.imul(x, y);
            break;
          case 0x13:
            if (y === 0) return fn(4);
            z = x === -2147483648 && y === -1 ? x : (x / y) | 0;
            break;
          case 0x14:
            if (y === 0) return fn(4);
            z = y === -1 ? 0 : (x % y) | 0;
            break;
          case 0x15:
            if (y === 0) return fn(4);
            z = Math.floor((x >>> 0) / (y >>> 0)) | 0;
            break;
          case 0x16:
            if (y === 0) return fn(4);
            z = ((x >>> 0) % (y >>> 0)) | 0;
            break;
          case 0x18:
            z = x & y;
            break;
          case 0x19:
            z = x | y;
            break;
          case 0x1a:
            z = x ^ y;
            break;
          case 0x1c:
            z = x << (y & 31);
            break;
          case 0x1d:
            z = x >> (y & 31);
            break;
          case 0x1e:
            z = (x >>> (y & 31)) | 0;
            break;
          case 0x20:
            z = x === y ? 1 : 0;
            break;
          case 0x21:
            z = x < y ? 1 : 0;
            break;
          default:
            z = x >>> 0 < y >>> 0 ? 1 : 0;
            break;
        }
        tp -= 2;
        S[tp++] = z;
        break;
      }
      case 0x30:
      case 0x31:
      case 0x32: {
        const rl = ((q[nx - 2] | (q[nx - 1] << 8)) << 16) >> 16;
        let tk = true;
        if (oc[0] !== 0x30) {
          const j = S[--tp];
          tk = oc[0] === 0x31 ? j === 0 : j !== 0;
        }
        if (tk) cp = nx + rl;
        break;
      }
      case 0x33:
        if (rp === 64) return fn(7);
        R[rp++] = nx;
        cp = q[nx - 2] | (q[nx - 1] << 8);
        break;
      case 0x34:
        if (rp === 0) return fn(8);
        cp = R[--rp];
        break;
      case 0x40: {
        const x = S[tp - 1];
        if (x < 0 || x >= 256) return fn(6);
        S[tp - 1] = G[x];
        break;
      }
      case 0x41: {
        const x = S[tp - 1];
        const j = S[tp - 2];
        if (x < 0 || x >= 256) return fn(6);
        tp -= 2;
        G[x] = j;
        break;
      }
      case 0x50: {
        const w = String(S[tp - 1]);
        if (ol + w.length > 65536) return fn(11);
        tp--;
        for (let i = 0; i < w.length; i++) ob[ol++] = w.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return fn(11);
        ob[ol++] = S[--tp] & 255;
        break;
      case 0x52:
        S[tp++] = ix < ib.length ? ib[ix++] : -1;
        break;
      case 0x53:
        return fn(S[--tp] & 255);
    }
  }
}

const A = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const B = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const k of readdirSync(A).sort()) {
  const e = go(new Uint8Array(readFileSync(join(A, k, 'program.bin'))), new Uint8Array(readFileSync(join(A, k, 'input.bin'))));
  mkdirSync(join(B, k), { recursive: true });
  writeFileSync(join(B, k, 'stdout.bin'), e.out);
  writeFileSync(join(B, k, 'exit.txt'), `${e.code}\n`);
}
