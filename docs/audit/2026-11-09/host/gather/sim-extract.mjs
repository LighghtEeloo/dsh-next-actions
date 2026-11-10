
import { openSync, readSync, closeSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
const ASAR = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
const fd = openSync(ASAR, 'r');
const hdr = Buffer.alloc(16); readSync(fd, hdr, 0, 16, 0);
const u4 = hdr.readUInt32LE(4), u8 = hdr.readUInt32LE(8), u12 = hdr.readUInt32LE(12);
const jsonLen = u12;
const buf = Buffer.alloc(jsonLen); readSync(fd, buf, 0, jsonLen, 16);
const tree = JSON.parse(buf.toString('utf8'));
function find(path) { let n = tree; for (const s of path.split('/')) { if (!n.files || !n.files[s]) return null; n = n.files[s]; } return n; }
function walk(n, p, out) { if (n.files) { for (const [k, c] of Object.entries(n.files)) walk(c, p ? p + '/' + k : k, out); } else out.push(p); return out; }
const all = walk(tree, '', []);
const known = find('dsh/package.json');
const candidates = [8 + u4, 8 + u8, 16 + jsonLen, 8 + jsonLen, 8 + u12, 4 + u4];
let base = null;
for (const b of candidates) {
  const probe = Buffer.alloc(40); readSync(fd, probe, 0, 40, b + Number(known.offset));
  const s = probe.toString('utf8').trimStart();
  if (s.startsWith('{')) { base = b; break; }
}
const readAll = (p) => { const n = find(p); const size = n.size ?? 0; const chunks = []; let pos = 0; const CH = 8*1024*1024;
  while (pos < size) { const len = Math.min(CH, size - pos); const b = Buffer.alloc(len); readSync(fd, b, 0, len, base + Number(n.offset) + pos); chunks.push(b); pos += len; } return Buffer.concat(chunks); };

const PKGS = ['@deepseek-ai/cordis','@deepseek-ai/cosmokit','@deepseek-ai/schemastery','@standard-schema/spec','@deepseek-ai/dsh-scope','@deepseek-ai/dsh-util-values','@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools'];
const ROOT = '/tmp/sim/node_modules';
for (const pkg of PKGS) {
  const prefix = 'dsh/node_modules/' + pkg + '/';
  const files = all.filter(p => p.startsWith(prefix)).filter(p => {
    const rel = p.slice(prefix.length);
    if (rel === 'package.json') return true;
    if (rel.includes('/src/')) return false;
    return /\.(js|mjs|cjs)$/.test(rel) && !rel.endsWith('.map');
  });
  let count = 0;
  for (const p of files) {
    const rel = p.slice(prefix.length);
    const dest = ROOT + '/' + pkg + '/' + rel;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readAll(p));
    count++;
  }
  console.log(pkg, '->', count, 'files');
}
// standard-schema package.json if absent
if (!existsSync(ROOT + '/@standard-schema/spec/package.json')) {
  mkdirSync(ROOT + '/@standard-schema/spec', { recursive: true });
  writeFileSync(ROOT + '/@standard-schema/spec/package.json', JSON.stringify({ name: '@standard-schema/spec', version: '1.1.0', type: 'module', main: 'dist/index.js', exports: { '.': './dist/index.js' } }));
  console.log('created @standard-schema/spec package.json');
}
// stub dsh-llm
mkdirSync(ROOT + '/@deepseek-ai/dsh-llm/lib', { recursive: true });
writeFileSync(ROOT + '/@deepseek-ai/dsh-llm/package.json', JSON.stringify({ name: '@deepseek-ai/dsh-llm', version: '0.2.2-rc.1', type: 'module', main: 'lib/index.js', exports: { '.': './lib/index.js' } }));
writeFileSync(ROOT + '/@deepseek-ai/dsh-llm/lib/index.js', [
  'export class HarnessError extends Error {',
  '  constructor(message, code, options) { super(message, options); this.name = "HarnessError"; this.code = code; }',
  '}',
  'export function createToolResultMessage(input) { return { role: "tool", content: input.content ?? [], toolCallId: input.toolCallId, isError: input.isError === true }; }',
].join('\n'));
// sim package.json
writeFileSync('/tmp/sim/package.json', JSON.stringify({ name: 'sim', type: 'module', private: true }));
console.log('done');

