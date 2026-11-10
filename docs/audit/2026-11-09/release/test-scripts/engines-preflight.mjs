import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const semver = require('/tmp/dsh-na-audit/asar/semver/index.js');

function objectOf(value, field) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(field + ' must be an object');
  return value;
}
function runtimeVersionOf(value) {
  if (typeof value !== 'string' || semver.valid(value) === null) throw new Error('Invalid dsh runtime version: ' + JSON.stringify(value));
  return value;
}
function identityField(manifest, field) {
  const value = Object.hasOwn(manifest, field) ? manifest[field] : undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Plugin manifest ' + field + ' must be a non-empty string when dsh requirements are unmet');
  return value;
}
function satisfies(runtimeVersion, range) {
  return range.trim() !== '' && semver.satisfies(runtimeVersion, range, { includePrerelease: true });
}
function unmetRequirements(fields, runtimeVersion) {
  const engines = Object.hasOwn(fields, 'engines') ? objectOf(fields.engines, 'Plugin manifest engines') : {};
  if (Object.hasOwn(engines, 'dsh')) {
    const range = engines.dsh;
    if (typeof range !== 'string') throw new Error('Plugin manifest engines.dsh must be a string');
    return satisfies(runtimeVersion, range) ? {} : { 'engines.dsh': range };
  }
  if (!Object.hasOwn(fields, 'peerDependencies')) return {};
  const dependencies = objectOf(fields.peerDependencies, 'Plugin manifest peerDependencies');
  const unmet = {};
  for (const [name, range] of Object.entries(dependencies)) {
    if (typeof range !== 'string') throw new Error('Plugin manifest peerDependencies[' + JSON.stringify(name) + '] must be a string');
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue;
    if (!satisfies(runtimeVersion, ['workspace:^', 'workspace:~', 'workspace:*'].includes(range) ? runtimeVersion : range)) unmet[name] = range;
  }
  return unmet;
}
function evaluatePluginCompatibility(manifest, exemptions = {}, runtimeVersion = '0.2.2-rc.1') {
  runtimeVersionOf(runtimeVersion);
  const fields = objectOf(manifest, 'Plugin manifest');
  const requirements = unmetRequirements(fields, runtimeVersion);
  if (Object.keys(requirements).length === 0) return undefined;
  const name = identityField(fields, 'name');
  const version = identityField(fields, 'version');
  const key = name + '@' + version;
  return { name, version, runtimeVersion, requirements, exempted: (Object.hasOwn(exemptions, key) ? exemptions[key] : undefined)?.includes(runtimeVersion) === true };
}

const base = { name: '@local/dsh-next-actions', version: '0.1.0', private: true, type: 'module' };
const cases = [
  ['current manifest (no engines, no peers)', base],
  ['engines.dsh ^0.2.2', { ...base, engines: { dsh: '^0.2.2' } }],
  ['engines.dsh >=0.2.2-0 <0.3.0', { ...base, engines: { dsh: '>=0.2.2-0 <0.3.0' } }],
  ['engines.dsh ^0.3.0', { ...base, engines: { dsh: '^0.3.0' } }],
  ['engines.dsh *', { ...base, engines: { dsh: '*' } }],
  ['engines.dsh empty string', { ...base, engines: { dsh: '' } }],
  ['engines.dsh workspace:^', { ...base, engines: { dsh: 'workspace:^' } }],
  ['engines not object', { ...base, engines: 'nope' }],
  ['peer @deepseek-ai/dsh-client-ui-conversation ^0.2.2', { ...base, peerDependencies: { '@deepseek-ai/dsh-client-ui-conversation': '^0.2.2' } }],
  ['peer @deepseek-ai/dsh-client-ui-conversation ^0.3.0', { ...base, peerDependencies: { '@deepseek-ai/dsh-client-ui-conversation': '^0.3.0' } }],
  ['peers * (all dsh)', { ...base, peerDependencies: { '@deepseek-ai/dsh': '*', '@deepseek-ai/dsh-client-ui-chat': '*' } }],
  ['peers workspace:^', { ...base, peerDependencies: { '@deepseek-ai/dsh-client-locale': 'workspace:^' } }],
];
for (const [label, manifest] of cases) {
  try {
    const result = evaluatePluginCompatibility(manifest);
    console.log(label.padEnd(55), '=>', result === undefined ? 'ACCEPTED (no unmet requirements)' : 'REFUSED ' + JSON.stringify(result.requirements));
  } catch (error) {
    console.log(label.padEnd(55), '=> THROWS:', error.message);
  }
}
console.log('runtime version used: 0.2.2-rc.1 | semver', require('/tmp/dsh-na-audit/asar/semver/package.json').version);
