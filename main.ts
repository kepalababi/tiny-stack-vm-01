// Tiny stack VM — ISA v1 interpreter for the make.fun tiny-stack-vm-01 bounty.
// Composed from the ISA spec (kit generator/subject/ISA.md); vm.mjs is the reference.
// One run answers a whole set of instances, writing stdout.bin plus exit.txt for each.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STEP_MAX = 1_000_000;
const OUT_MAX = 65_536;

interface V {
  p: Uint8Array;
  i: Uint8Array;
  s: Int32Array;
  t: number;
  c: Int32Array;
  u: number;
  m: Int32Array;
  o: Uint8Array;
  l: number;
  r: number;
  q: number;
  k: number;
  x: number;
}

function make(p: Uint8Array, i: Uint8Array): V {
  return {
    p, i,
    s: new Int32Array(256), t: 0,
    c: new Int32Array(64), u: 0,
    m: new Int32Array(256),
    o: new Uint8Array(OUT_MAX), l: 0,
    r: 0, q: 0, k: 0, x: -1,
  };
}

// Per-opcode [immediate bytes, pops, pushes]; null means "not an opcode".
const MD: Array<[number, number, number] | null> = (() => {
  const a: Array<[number, number, number] | null> = new Array(256).fill(null);
  const rows: Array<[number, number, number, number]> = [
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
  for (const [op, a1, b1, c1] of rows) a[op] = [a1, b1, c1];
  return a;
})();

type Op = (v: V, nx: number) => void;

function arith(v: V, op: number): void {
  const b = v.s[v.t - 1];
  const a = v.s[v.t - 2];
  let z = 0;
  if (op === 0x10) z = (a + b) | 0;
  else if (op === 0x11) z = (a - b) | 0;
  else if (op === 0x12) z = Math.imul(a, b);
  else if (op === 0x13) {
    if (b === 0) { v.x = 4; return; }
    z = a === -2147483648 && b === -1 ? a : (a / b) | 0;
  } else if (op === 0x14) {
    if (b === 0) { v.x = 4; return; }
    z = b === -1 ? 0 : (a % b) | 0;
  } else if (op === 0x15) {
    if (b === 0) { v.x = 4; return; }
    z = Math.floor((a >>> 0) / (b >>> 0)) | 0;
  } else if (op === 0x16) {
    if (b === 0) { v.x = 4; return; }
    z = ((a >>> 0) % (b >>> 0)) | 0;
  } else if (op === 0x18) z = a & b;
  else if (op === 0x19) z = a | b;
  else if (op === 0x1a) z = a ^ b;
  else if (op === 0x1c) z = a << (b & 31);
  else if (op === 0x1d) z = a >> (b & 31);
  else if (op === 0x1e) z = (a >>> (b & 31)) | 0;
  else if (op === 0x20) z = a === b ? 1 : 0;
  else if (op === 0x21) z = a < b ? 1 : 0;
  else z = a >>> 0 < b >>> 0 ? 1 : 0;
  v.t -= 2;
  v.s[v.t++] = z;
}

const H: Op[] = new Array(256).fill(() => {});
H[0x00] = (v) => { v.x = 0; };
H[0x01] = (v, nx) => { v.s[v.t++] = (v.p[nx - 1] << 24) >> 24; };
H[0x02] = (v, nx) => { v.s[v.t++] = v.p[nx - 4] | (v.p[nx - 3] << 8) | (v.p[nx - 2] << 16) | (v.p[nx - 1] << 24); };
H[0x03] = (v) => { v.t--; };
H[0x04] = (v) => { v.s[v.t] = v.s[v.t - 1]; v.t++; };
H[0x05] = (v) => { const t = v.s[v.t - 1]; v.s[v.t - 1] = v.s[v.t - 2]; v.s[v.t - 2] = t; };
H[0x06] = (v) => { v.s[v.t] = v.s[v.t - 2]; v.t++; };
H[0x07] = (v) => { const t = v.s[v.t - 3]; v.s[v.t - 3] = v.s[v.t - 2]; v.s[v.t - 2] = v.s[v.t - 1]; v.s[v.t - 1] = t; };
H[0x17] = (v) => { v.s[v.t - 1] = -v.s[v.t - 1] | 0; };
H[0x1b] = (v) => { v.s[v.t - 1] = ~v.s[v.t - 1]; };
for (const op of [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x20, 0x21, 0x22]) {
  H[op] = (v) => arith(v, op);
}
H[0x30] = (v, nx) => { const rl = ((v.p[nx - 2] | (v.p[nx - 1] << 8)) << 16) >> 16; v.q = nx + rl; };
H[0x31] = (v, nx) => { const rl = ((v.p[nx - 2] | (v.p[nx - 1] << 8)) << 16) >> 16; if (v.s[--v.t] === 0) v.q = nx + rl; };
H[0x32] = (v, nx) => { const rl = ((v.p[nx - 2] | (v.p[nx - 1] << 8)) << 16) >> 16; if (v.s[--v.t] !== 0) v.q = nx + rl; };
H[0x33] = (v, nx) => {
  if (v.u === 64) { v.x = 7; return; }
  v.c[v.u++] = nx;
  v.q = v.p[nx - 2] | (v.p[nx - 1] << 8);
};
H[0x34] = (v) => {
  if (v.u === 0) { v.x = 8; return; }
  v.q = v.c[--v.u];
};
H[0x40] = (v) => {
  const a = v.s[v.t - 1];
  if (a < 0 || a >= 256) { v.x = 6; return; }
  v.s[v.t - 1] = v.m[a];
};
H[0x41] = (v) => {
  const a = v.s[v.t - 1];
  const b = v.s[v.t - 2];
  if (a < 0 || a >= 256) { v.x = 6; return; }
  v.t -= 2;
  v.m[a] = b;
};
H[0x50] = (v) => {
  const s = String(v.s[v.t - 1]);
  if (v.l + s.length > OUT_MAX) { v.x = 11; return; }
  v.t--;
  for (let i = 0; i < s.length; i++) v.o[v.l++] = s.charCodeAt(i);
};
H[0x51] = (v) => {
  if (v.l + 1 > OUT_MAX) { v.x = 11; return; }
  v.o[v.l++] = v.s[--v.t] & 255;
};
H[0x52] = (v) => { v.s[v.t++] = v.r < v.i.length ? v.i[v.r++] : -1; };
H[0x53] = (v) => { v.x = v.s[--v.t] & 255; };

function exec(p: Uint8Array, i: Uint8Array): { out: Uint8Array; code: number } {
  const v = make(p, i);
  const n = p.length;
  for (;;) {
    if (v.k === STEP_MAX) return { out: v.o.slice(0, v.l), code: 10 };
    if (v.q < 0 || v.q >= n) return { out: v.o.slice(0, v.l), code: 9 };
    const oc = p[v.q];
    const md = MD[oc];
    if (md === null) return { out: v.o.slice(0, v.l), code: 5 };
    const [im, po, pu] = md;
    if (v.q + im >= n) return { out: v.o.slice(0, v.l), code: 9 };
    v.k++;
    const nx = v.q + 1 + im;
    if (v.t < po) return { out: v.o.slice(0, v.l), code: 2 };
    if (v.t - po + pu > 256) return { out: v.o.slice(0, v.l), code: 3 };
    v.q = nx;
    H[oc](v, nx);
    if (v.x >= 0) return { out: v.o.slice(0, v.l), code: v.x };
  }
}

const INP = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTP = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(INP).sort()) {
  const ans = exec(new Uint8Array(readFileSync(join(INP, id, 'program.bin'))), new Uint8Array(readFileSync(join(INP, id, 'input.bin'))));
  mkdirSync(join(OUTP, id), { recursive: true });
  writeFileSync(join(OUTP, id, 'stdout.bin'), ans.out);
  writeFileSync(join(OUTP, id, 'exit.txt'), `${ans.code}\n`);
}
