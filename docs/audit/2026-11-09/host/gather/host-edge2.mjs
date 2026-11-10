
import { buildMeta, LIMITS, NOTES } from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/lib/normalize.js'
import { __definition, __guidance, normalizeConfig } from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/index.js'

const out = []
const log = (...a) => out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '))
const m = (suggestions, context = 'ok') => buildMeta({ context, suggestions })

// stance tolerance
for (const stance of [' verify ', 'Verify', 'VERIFY', 'verify\n', true, 1, null]) {
  const meta = m([{ label: 'a', prompt: 'p1', stance }, { label: 'b', prompt: 'p2', stance: 'verify' }])
  log('stance', JSON.stringify(stance), '-> kept', meta.suggestions.length, '| stances', JSON.stringify(meta.suggestions.map(s => s.stance)))
}
// boolean coercion tolerance
log('recommended:"true" ->', m([{ label: 'a', prompt: 'p', recommended: 'true' }]).suggestions[0].recommended ?? 'absent')
log('danger:1 ->', m([{ label: 'a', prompt: 'p', danger: 1 }]).suggestions[0].danger ?? 'absent')
log('danger:"true" ->', m([{ label: 'a', prompt: 'p', danger: 'true' }]).suggestions[0].danger ?? 'absent')
// config null-proto / arrays / booleans
const np = Object.create(null); np.enabled = false
log('config null-proto {enabled:false} ->', normalizeConfig(np))
log('config array ->', normalizeConfig([]))
log('config {enabled: Boolean false object} ->', normalizeConfig({ enabled: new Boolean(false) }))
log('config {enabled:false, extra:1} ->', normalizeConfig({ enabled: false, extra: 1 }))
// worst-case meta size
const worst = buildMeta({ context: '上'.repeat(120), suggestions: Array.from({length: 6}, (_, i) => ({ label: '标'.repeat(40), prompt: '指'.repeat(500), stance: ['verify','continue','push','pivot','optional','continue'][i] })) })
log('worst-case suggestions:', worst.suggestions.length, '| meta JSON bytes:', Buffer.byteLength(JSON.stringify(worst)))
// danger lexicon battery, count false positives/negatives on benign/destructive EN + ZH
const benign = [
  ['Check the production logs', 'read production logs for errors'],
  ['Review deploy checklist', 'review the deployment checklist'],
  ['Publish docs', 'publish the local docs preview'],
  ['Update chmod docs', 'update the chmod section of the README'],
  ['Read sudo docs', 'read the sudo man page'],
  ['Billing FAQ', 'summarize the billing FAQ'],
  ['Permission model', 'explain the permission model'],
  ['Force push docs', 'read the docs about force push'],
  ['Delete key handling', 'review how delete key handling works'],
]
const destructive = [
  ['Reset branch', 'git reset --hard origin/main'],
  ['Clean worktree', 'git clean -fd'],
  ['Delete rows', 'delete all rows from the users table'],
  ['Remove files', 'remove build artifacts recursively'],
  ['Overwrite config', 'overwrite config.yaml with defaults'],
  ['Wipe database', 'wipe the local database'],
  ['Kill server', 'kill -9 the running server'],
  ['Shutdown', 'shutdown the machine'],
  ['Global install', 'npm install -g some-package'],
  ['Enable billing', 'enable billing and charge the card'],
  ['chmod 777', 'chmod 777 the upload directory'],
  ['rm -r', 'rm -r ./dist'],
  ['rm -fr', 'rm -fr ./dist'],
  ['truncate', 'truncate the orders table'],
  ['drop column', 'drop column email from users'],
]
let fp = 0, fn = 0
for (const [label, prompt] of benign) { if (m([{ label, prompt }]).suggestions[0].danger) { fp++; log('FP:', label) } }
for (const [label, prompt] of destructive) { if (!m([{ label, prompt }]).suggestions[0].danger) { fn++; log('FN:', label) } }
log('danger lexicon battery: benign misflagged', fp + '/' + benign.length, '| destructive missed', fn + '/' + destructive.length)
// full list of zh coverage vs en
log('lexicon entries:', 13)
console.log(out.join('\n'))

