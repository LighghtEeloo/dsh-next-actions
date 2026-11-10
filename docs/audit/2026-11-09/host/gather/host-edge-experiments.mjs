
import { buildMeta, LIMITS, NOTES, STANCES, RISK_LEXICON } from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/lib/normalize.js'
import { __definition, __guidance, __config, __when } from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/index.js'

const out = []
const log = (...a) => out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '))

// ---------- A. never-throw fuzz ----------
function tryMeta(v) {
  try { return { ok: true, meta: buildMeta(v) } } catch (e) { return { ok: false, err: String(e) } }
}
const circular = { context: 'ok' }; circular.suggestions = [circular]
const hostile = [
  Symbol('s'), () => 1, 1n, NaN, Infinity, -0,
  { context: { toString(){ throw new Error('x') } } },
  { context: 'ok', suggestions: new Array(3) },
  { context: 'ok', suggestions: [undefined, null, true, false, 0, '', [], {}, {label:{},prompt:{}}] },
  { context: 'ok', suggestions: [{ label: 'x', prompt: 'y', stance: 'VERIFY' }] },
  { context: 'ok', suggestions: [{ label: 'x', prompt: 'y', recommended: 1, danger: 'true' }] },
  circular,
  JSON.stringify({ context: 'ok', suggestions: [{ label: 'a', prompt: 'b' }] }),
  '{broken',
  'null',
  '42',
  '[]',
  { context: ' ok ', suggestions: [{ label: ' a ', prompt: ' b ' }], extra: { deep: [1,2,3] } },
]
let failures = 0
for (const v of hostile) {
  const r = tryMeta(v)
  if (!r.ok) { failures++; log('THREW on', String(typeof v === 'symbol' ? 'symbol' : v)); continue }
  const m = r.meta
  if (typeof m.shown !== 'boolean') { failures++; log('bad shown', m) }
}
log('A. never-throw hostile:', failures === 0 ? 'PASS (no throws, shown boolean)' : 'FAIL ' + failures)

// Object with throwing getters (model JSON cannot produce, but contract says never throw)
const evil = { context: 'ok' }
Object.defineProperty(evil, 'suggestions', { get() { throw new Error('getter') } })
log('A2 throwing getter on suggestions:', tryMeta(evil).ok ? 'no throw' : 'THREW (getter) - ' + tryMeta(evil).err)

// deep frozen args (pipeline deepFreezes)
const frozen = Object.freeze({ context: 'ok', suggestions: Object.freeze([Object.freeze({ label: 'a', prompt: 'b' })]) })
log('A3 frozen args:', JSON.stringify(tryMeta(frozen)))

// ---------- B. truncation / unicode ----------
const emoji = buildMeta({ context: 'ok', suggestions: [{ label: '😀'.repeat(50), prompt: 'x' }] })
const emoLabel = emoji.suggestions[0].label
log('B. emoji label codepoints:', Array.from(emoLabel).length, 'code units:', emoLabel.length, 'ends ellipsis:', emoLabel.endsWith('…'))
const zwj = '👨‍👩‍👧‍👦'
const fam = buildMeta({ context: 'ok', suggestions: [{ label: zwj.repeat(30), prompt: 'x' }] })
log('B2 ZWJ family label codepoints:', Array.from(fam.suggestions[0].label).length, 'graphemes:', [...new Intl.Segmenter().segment(fam.suggestions[0].label)].length)
const bidi = buildMeta({ context: 'safe \u202E txet desrever', suggestions: [{ label: 'ok \u202E abc', prompt: 'next \u200B step' }] })
log('B3 bidi/zero-width preserved:', JSON.stringify(bidi.context), JSON.stringify(bidi.suggestions[0].label), JSON.stringify(bidi.suggestions[0].prompt))
const ctrl = buildMeta({ context: 'a\u0000b\u0007c\nd', suggestions: [{ label: '\u0000\u0007', prompt: 'x' }] })
log('B4 control chars preserved:', JSON.stringify(ctrl.context), JSON.stringify(ctrl.suggestions[0].label))

// ---------- C. danger lexicon FP/FN ----------
const cases = [
  ['FP', 'Run the production build', 'run the production build'],
  ['FP', 'Publish docs', 'publish the docs site locally'],
  ['FP', 'Deploy config check', 'inspect the deploy config only'],
  ['FP', 'chmod notes', 'read the chmod documentation'],
  ['FP', 'publish', 'publish a local preview on localhost'],
  ['FN', 'git reset --hard', 'git reset --hard HEAD~1'],
  ['FN', 'delete rows', 'delete all rows from the users table'],
  ['FN', 'remove files', 'remove the generated files'],
  ['FN', 'overwrite', 'overwrite config.yaml with defaults'],
  ['FN', 'wipe', 'wipe the local database'],
  ['FN', 'npm install -g', 'install the package globally'],
  ['FN', 'billing', 'enable billing on the account'],
  ['FN', 'charge', 'charge the saved card'],
  ['FN', 'permission', 'change file permissions to 777'],
  ['FN', 'git clean', 'git clean -fd'],
  ['FN', 'kill process', 'kill -9 the server process'],
  ['FN', 'rm -r', 'rm -r ./dist'],
  ['FN', 'shutdown', 'shutdown the machine'],
  ['FN', 'drop column', 'drop column status from users'],
  ['TP', 'rm -rf', 'rm -rf ./dist'],
  ['TP', 'force push', 'git push --force origin main'],
  ['TP', '删除', '删除旧文件'],
  ['TP', '发布', '发布到 npm'],
]
for (const [kind, label, prompt] of cases) {
  const m = buildMeta({ context: 'ok', suggestions: [{ label, prompt }] })
  const danger = !!m.suggestions?.[0]?.danger
  log('C.', kind, danger ? 'DANGER' : 'safe   ', '|', label)
}
// substring edge for \b on CJK-adjacent latin
for (const s of ['rm -rfx', 'myrm -rf', 'sudoers', 'sudo', 'chmodding', 'chmod +x file', 'DROP   TABLE users', 'drop table']) {
  const m = buildMeta({ context: 'ok', suggestions: [{ label: 'x', prompt: 'do ' + s + ' now' }] })
  log('C2', JSON.stringify(s), '->', !!m.suggestions?.[0]?.danger ? 'danger' : 'safe')
}

// ---------- D. recommended / dedupe / order ----------
const rec = (suggestions) => buildMeta({ context: 'ok', suggestions })
log('D1 recommended dropped when dup prompt keeps first unmarked:',
  JSON.stringify(rec([{ label: 'A', prompt: 'same task' }, { label: 'B', prompt: 'Same task', recommended: true }]).suggestions))
log('D2 recommended dropped by duplicate explicit stance:',
  JSON.stringify(rec([{ label: 'A', prompt: 'p1', stance: 'verify' }, { label: 'B', prompt: 'p2', stance: 'verify', recommended: true }]).suggestions))
log('D3 recommended+optional same entry:',
  JSON.stringify(rec([{ label: 'A', prompt: 'p1', stance: 'optional', recommended: true }, { label: 'B', prompt: 'p2' }]).suggestions))
log('D4 optional appears twice (one explicit, one via fallback?):',
  JSON.stringify(rec([{ label: 'A', prompt: 'p1', stance: 'optional' }, { label: 'B', prompt: 'p2', stance: 'optional' }, { label: 'C', prompt: 'p3' }]).suggestions))
const many = Array.from({length: 8}, (_, i) => ({ label: 'L'+i, prompt: 'task '+i }))
const capRec = [...many]; capRec[7] = { ...capRec[7], recommended: true }
const capOpt = [...many]; capOpt[7] = { ...capOpt[7], stance: 'optional' }
const capBoth = [...many]; capBoth[6] = { ...capBoth[6], recommended: true }; capBoth[7] = { ...capBoth[7], stance: 'optional' }
for (const [name, input] of [['cap', many], ['capRec', capRec], ['capOpt', capOpt], ['capBoth', capBoth]]) {
  const m = rec(input)
  log('D5', name, 'n=' + m.suggestions.length, 'order=' + m.suggestions.map(s => s.label + (s.recommended ? '*' : '')).join(','))
}
// dedupe unicode case / locale
log('D6 unicode case dedupe:', rec([{label:'a',prompt:'CAFÉ'},{label:'b',prompt:'café'}]).suggestions.length)
log('D7 tr locale edge (İ):', rec([{label:'a',prompt:'İSTANBUL'},{label:'b',prompt:'istanbul'}]).suggestions.length)
// dedupe punctuation-only differences across languages
log('D8 trailing punctuation:', rec([{label:'a',prompt:'跑测试。'},{label:'b',prompt:'跑测试？'}]).suggestions.length)
log('D9 internal punctuation untouched:', rec([{label:'a',prompt:'跑，测试'},{label:'b',prompt:'跑测试'}]).suggestions.length)

// ---------- E. context edge ----------
log('E1 quotes nested:', JSON.stringify(buildMeta({context:'““x””', suggestions:[{label:'a',prompt:'b'}]}).context))
log('E2 quotes around only:', JSON.stringify(buildMeta({context:'""', suggestions:[{label:'a',prompt:'b'}]}).note))
log('E3 context 120 exactly no ellipsis:', buildMeta({context:'字'.repeat(120), suggestions:[{label:'a',prompt:'b'}]}).context.length)
log('E4 context 121 ->', Array.from(buildMeta({context:'字'.repeat(121), suggestions:[{label:'a',prompt:'b'}]}).context).length)
log('E5 newline collapse:', JSON.stringify(buildMeta({context:'a\nb\r\nc\td', suggestions:[{label:'a',prompt:'b'}]}).context))

// ---------- F. output contract consistency ----------
const weird = { context: ' ok ', suggestions: [{ label: 'x'.repeat(60), prompt: 'p'.repeat(700) }] }
const val = __definition.execute(weird)
const meta = __definition.output.presentationMeta(weird, val)
log('F1 execute/presentationMeta consistency:', JSON.stringify(val), 'meta.shown', meta.shown, 'n', meta.suggestions.length)
log('F2 execute(JSON string):', JSON.stringify(__definition.execute(JSON.stringify({context:'ok',suggestions:[{label:'a',prompt:'b'}]}))))
let threw = null
for (const a of [null, undefined, 0, NaN, [], {}, {context:1}, 'x', '[1,2]']) {
  try { const v = __definition.execute(a); if (typeof v.shown !== 'boolean' || typeof v.count !== 'number') threw = 'bad shape ' + JSON.stringify(v) } catch (e) { threw = String(e) }
}
log('F3 execute never throws:', threw ?? 'PASS')

// ---------- G. config gate ----------
for (const c of [[], () => {}, new Date(), Object.create(null), { enabled: false }, { enabled: new Boolean(false) }]) {
  try { log('G1 config', JSON.stringify(c && c.enabled !== undefined ? {enabled: String(c.enabled)} : String(c)), '->', JSON.stringify(__config.normalize(c))) } catch (e) { log('G1 config THREW', String(e)) }
}

// ---------- H. when gate ----------
log('H1 when({}) =', __when({ agents: { roots: () => [] } }, undefined))
log('H2 when unknown agent fail-open =', (() => { try { return __when({ agents: { roots: () => [] } }, {fake:true}) } catch(e) { return 'THREW ' + e } })())
const ctxThrow = { agents: { roots() { throw new Error('gone') } } }
try { log('H3 when roots throws (ctx,agent) =', (function(){ try { return __when(ctxThrow, {a:1}) } catch (e) { return 'THREW ' + e } })()) } catch(e) { log('H3 outer', String(e)) }
log('H4 when roots returns non-array =', (function(){ try { return __when({agents:{roots:()=>42}}, {a:1}) } catch(e) { return 'THREW '+e } })())
log('H5 when roots undefined method =', (function(){ try { return __when({agents:{}}, {a:1}) } catch(e) { return 'THREW '+e } })())
log('H6 when ctx.agents missing =', (function(){ try { return __when({}, {a:1}) } catch(e) { return 'THREW '+e } })())

// ---------- I. perf / large input ----------
const big = { context: 'ok', suggestions: Array.from({length: 2000}, (_, i) => ({ label: 'L'+i, prompt: 'task '.repeat(50) + i })) }
const t0 = performance.now(); const bm = buildMeta(big); const t1 = performance.now()
log('I1 2000-entry buildMeta ms:', (t1-t0).toFixed(2), '-> n', bm.suggestions.length, 'maxPromptLen', Math.max(...bm.suggestions.map(s=>Array.from(s.prompt).length)))
const t2 = performance.now(); for (let i=0;i<20000;i++) buildMeta(weird); const t3 = performance.now()
log('I2 20000 typical buildMeta us/call:', ((t3-t2)*1000/20000).toFixed(2))

// ---------- J. id stability / collision ----------
const a = buildMeta({context:'ok', suggestions:[{label:'a',prompt:'task one'},{label:'b',prompt:'task two'}]})
const b = buildMeta({context:'ok', suggestions:[{label:'b',prompt:'task two'},{label:'a',prompt:'task one'}]})
log('J1 order-independent ids:', JSON.stringify(a.suggestions.map(s=>s.id)) === JSON.stringify(b.suggestions.map(s=>s.id).reverse()))
const hashCollide = buildMeta({context:'ok', suggestions:[{label:'a',prompt:'p'},{label:'b',prompt:'q'}]})
log('J2 ids unique:', new Set(hashCollide.suggestions.map(s=>s.id)).size === hashCollide.suggestions.length)

// ---------- K. prompt layer duplication ----------
const desc = __definition.description.toLowerCase()
const guid = __guidance.text.toLowerCase()
const render = __definition.output.render({}, {shown:true,count:1})[0].text.toLowerCase()
const find = (needle) => [desc, guid, render].map((t,i)=>t.includes(needle)?['desc','guidance','render'][i]:null).filter(Boolean)
log('K1 "never list"/"do not list" display rule appears in:', find('list'))
log('K2 "once" trigger appears in:', find('once'))
log('K3 "lead-in sentence" appears in:', find('lead-in'))
log('K4 description words:', desc.split(/\s+/).length, 'guidance words:', guid.split(/\s+/).length)

// ---------- L. output schema accepted subset char-level ----------
log('L1 output schema:', JSON.stringify(__definition.output.schema))
log('L2 params additionalProperties:', __definition.parameters.additionalProperties, '| item additionalProperties:', __definition.parameters.properties.suggestions.items.additionalProperties)
log('L3 stance schema has no enum:', 'enum' in __definition.parameters.properties.suggestions.items.properties.stance)
log('L4 label schema maxLength:', 'maxLength' in __definition.parameters.properties.suggestions.items.properties.label)
log('L5 required fields:', JSON.stringify(__definition.parameters.required))

console.log(out.join('\n'))

