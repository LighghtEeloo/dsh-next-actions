import { openSync, readSync, closeSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ASAR = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
const fd = openSync(ASAR, 'r');
const hdr = Buffer.alloc(16); readSync(fd, hdr, 0, 16, 0);
const u12 = hdr.readUInt32LE(12);
const jsonLen = u12;
const buf = Buffer.alloc(jsonLen); readSync(fd, buf, 0, jsonLen, 16);
const tree = JSON.parse(buf.toString('utf8'));
function find(path) { let n = tree; for (const s of path.split('/')) { if (!n.files || !n.files[s]) return null; n = n.files[s]; } return n; }
function walk(n, p, out) { if (n.files) { for (const [k, c] of Object.entries(n.files)) walk(c, p ? p + '/' + k : k, out); } else out.push({ path: p, node: n }); return out; }
const all = walk(tree, '', []);
const known = find('dsh/package.json');
const candidates = [8 + hdr.readUInt32LE(4), 8 + hdr.readUInt32LE(8), 16 + jsonLen, 8 + jsonLen, 8 + u12, 4 + hdr.readUInt32LE(4)];
let base = null;
for (const b of candidates) {
  const probe = Buffer.alloc(40);
  readSync(fd, probe, 0, 40, b + Number(known.offset));
  if (probe.toString('utf8').trimStart().startsWith('{')) { base = b; break; }
}
const prefix = process.argv[2];
const dest = process.argv[3];
const matched = all.filter(({ path }) => path.startsWith(prefix));
for (const { path, node } of matched) {
  const size = node.size ?? 0;
  const b = Buffer.alloc(size);
  if (size > 0) readSync(fd, b, 0, size, base + Number(node.offset));
  const out = join(dest, path.slice(prefix.length));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, b);
}
console.log('extracted', matched.length, 'files from', prefix, 'to', dest);
