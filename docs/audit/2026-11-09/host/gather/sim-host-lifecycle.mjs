
import { Context, Service } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolsService, projectToolSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import { snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import * as plugin from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/index.js'

const log = []
const out = (...a) => log.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '))

class FakeAgents extends Service {
  constructor(ctx) { super(ctx, 'agents'); this.live = [] }
  roots() { return this.live.filter((a) => a.root !== false) }
  get(id) { return this.live.find((a) => a.id === id) }
}

async function makeHost({ rootsThrows = false } = {}) {
  const root = new Context()
  await root.plugin(SystemPrompt, {})
  await root.plugin(ToolsService, {})
  await root.plugin(FakeAgents, {})
  const executor = {
    describe(definitions) { return { schemas: definitions.map((d) => projectToolSchema(d, false)) } },
    execute() { throw new Error('executor not used in this simulation') },
  }
  root.tools.setExecutor(executor)
  let loopCtx
  const loopFiber = root.inject(['tools', 'systemPrompt', 'agents'], (ctx) => { loopCtx = ctx })
  await loopFiber
  const host = { root, agents: root.agents, loopCtx, cleanups: [] }
  if (rootsThrows) root.agents.roots = () => { throw new Error('registry unavailable') }
  host.agent = (id, { root: isRoot = true } = {}) => {
    const agent = { id, root: isRoot }
    const scope = createScope(host.loopCtx, agent)
    agent.ctx = scope.ctx
    host.agents.live.push(agent)
    host.cleanups.push(scope.dispose)
    return agent
  }
  host.mount = async (config) => {
    const fiber = root.plugin(plugin, config)
    await fiber
    return fiber
  }
  host.emitCreated = (agent) => root.serial(scopeTarget(agent, agent), 'agent/created', { agent, source: 'startup' })
  host.emitDisposed = (agent) => root.emit(scopeTarget(agent, agent), 'agent/disposed', { agent })
  host.assemble = async (agent) => {
    const signal = new AbortController().signal
    const toolSet = await root.tools.resolve({ agent, modelSelection: undefined, signal })
    try {
      const assembly = await root.systemPrompt.assemble({ scope: agent, toolSet })
      return { assembly, text: renderPrompt(assembly), schemas: assembly.tools.map((t) => t.name), sectionNames: assembly.sections.map((s) => s.name + '@' + s.order), toolSet }
    } finally { toolSet.dispose() }
  }
  return host
}

// ---- S1 ----
{
  const h = await makeHost()
  await h.mount({})
  const rootAgent = h.agent('root-1')
  await h.emitCreated(rootAgent)
  const asmRoot = await h.assemble(rootAgent)
  out('S1 root: tool visible =', asmRoot.schemas.includes('suggest_next_steps'), '| guidance =', asmRoot.text.includes('suggest_next_steps'), '| sections', asmRoot.sectionNames.filter((n) => n.startsWith('tool:suggest')))
  out('S1 getSectionOrder(TOOL_REPORT) =', h.root.systemPrompt.getSectionOrder('TOOL_REPORT'))
  const sub = h.agent('sub-1', { root: false })
  await h.emitCreated(sub)
  const asmSub = await h.assemble(sub)
  out('S1 subagent: tool =', asmSub.schemas.includes('suggest_next_steps'), '| guidance =', asmSub.text.includes('suggest_next_steps'))
  const signal = new AbortController().signal
  const tsUnknown = await h.root.tools.resolve({ agent: undefined, modelSelection: undefined, signal })
  out('S1 unknown-agent fail-open admitted =', tsUnknown.view(undefined).has('suggest_next_steps'))
  tsUnknown.dispose()
  // prompt includes guidance in exact position near TOOL_REPORT sections?
  out('S1 rendered prompt length:', asmRoot.text.length)
  h.cleanups.forEach((d) => d())
}

// ---- S2 ----
{
  const h = await makeHost()
  const f1 = await h.mount({})
  const agent = h.agent('root-2')
  await h.emitCreated(agent)
  let err = null
  try { await h.mount({}) } catch (e) { err = e }
  out('S2 second row error:', err ? String(err.message).slice(0, 160) : 'NO ERROR (bad)')
  const asm = await h.assemble(agent)
  out('S2 first row functional:', asm.schemas.includes('suggest_next_steps'), '| section count', asm.sectionNames.filter((n) => n.startsWith('tool:suggest')).length)
  await f1.dispose()
}

// ---- S3 ----
{
  const h = await makeHost()
  const agent = h.agent('root-3')
  const f1 = await h.mount({})
  await h.emitCreated(agent)
  const s1 = await h.assemble(agent)
  out('S3 before reload: sections', s1.sectionNames.filter((n) => n.startsWith('tool:suggest')).length, '| tool', s1.schemas.includes('suggest_next_steps'))
  await f1.dispose()
  const afterUnload = await h.assemble(agent)
  out('S3 after unload: guidance =', afterUnload.text.includes('suggest_next_steps'), '| tool =', afterUnload.schemas.includes('suggest_next_steps'))
  let err = null
  try { await h.mount({}) } catch (e) { err = e }
  const s2 = await h.assemble(agent)
  out('S3 remount error:', err ? String(err.message).slice(0, 160) : 'none', '| after remount sections', s2.sectionNames.filter((n) => n.startsWith('tool:suggest')), '| tool', s2.schemas.includes('suggest_next_steps'))
  h.cleanups.forEach((d) => d())
}

// ---- S4 ----
{
  const h = await makeHost()
  const agent = h.agent('root-4')
  await h.emitCreated(agent)
  await h.mount({})
  const asm = await h.assemble(agent)
  out('S4 pre-existing root guidance:', asm.text.includes('suggest_next_steps'), '| sections', asm.sectionNames.filter((n) => n.startsWith('tool:suggest')).length)
  await h.emitCreated(agent)
  const asm2 = await h.assemble(agent)
  out('S4 duplicate agent/created -> sections', asm2.sectionNames.filter((n) => n.startsWith('tool:suggest')).length)
  h.cleanups.forEach((d) => d())
}

// ---- S5 ----
{
  const h = await makeHost()
  await h.mount({ enabled: false })
  const agent = h.agent('root-5'); await h.emitCreated(agent)
  const asm = await h.assemble(agent)
  out('S5 disabled: tool =', asm.schemas.includes('suggest_next_steps'), '| guidance =', asm.text.includes('suggest_next_steps'))
  const h2 = await makeHost()
  await h2.mount({ enabled: 'no' })
  const a2 = h2.agent('root-5b'); await h2.emitCreated(a2)
  out('S5 enabled:"no" keeps feature =', (await h2.assemble(a2)).schemas.includes('suggest_next_steps'))
  h.cleanups.forEach((d) => d()); h2.cleanups.forEach((d) => d())
}

// ---- S6 ----
{
  const h = await makeHost()
  await h.mount({})
  const agent = h.agent('root-6')
  await h.emitCreated(agent)
  agent.ctx.tools.restrict({ deny: ['suggest_next_steps'] })
  const asm = await h.assemble(agent)
  out('S6 restricted: tool =', asm.schemas.includes('suggest_next_steps'), '| guidance still present =', asm.text.includes('suggest_next_steps'))
  h.cleanups.forEach((d) => d())
}

// ---- S7 ----
{
  const h = await makeHost({ rootsThrows: true })
  await h.mount({})
  const agent = h.agent('root-7')
  const signal = new AbortController().signal
  let err = null, admitted = null
  try { const ts = await h.root.tools.resolve({ agent, modelSelection: undefined, signal }); admitted = ts.view(agent).has('suggest_next_steps'); ts.dispose() } catch (e) { err = e }
  out('S7 broken roots: resolve error =', err ? String(err.message) : 'none', '| admitted =', admitted)
  const asm = await h.assemble(agent)
  out('S7 broken roots: guidance for new agent =', asm.text.includes('suggest_next_steps'))
  h.cleanups.forEach((d) => d())
}

// ---- S8 ----
{
  const def = plugin.__definition
  out('S8 output schema valid:', validateJsonSchemaValue(def.output.schema, { shown: true, count: 3 }, 'value').length === 0)
  out('S8 output schema rejects fractional:', validateJsonSchemaValue(def.output.schema, { shown: true, count: 1.5 }, 'value').length > 0)
  out('S8 output schema rejects extra:', validateJsonSchemaValue(def.output.schema, { shown: true, count: 1, x: 1 }, 'value').length > 0)
  const args = { context: 'ok', suggestions: [{ label: 'a', prompt: 'p1' }, { label: 'b', prompt: 'p2' }] }
  const value = def.execute(args)
  const meta = def.output.presentationMeta(args, value)
  out('S8 meta lossless:', snapshotJsonValue(meta) !== undefined, '| meta chars:', JSON.stringify(meta).length)
  out('S8 render:', JSON.stringify(def.output.render(args, value)))
  out('S8 exports:', Object.keys(plugin).sort().join(','))
  out('S8 name/inject:', plugin.name, JSON.stringify(plugin.inject))
}

// ---- S9 ----
{
  const h = await makeHost()
  await h.mount({})
  const a1 = h.agent('root-8')
  await h.emitCreated(a1)
  h.emitDisposed(a1)
  const a2 = h.agent('root-8b')
  await h.emitCreated(a2)
  const asm = await h.assemble(a2)
  out('S9 recreated agent guidance:', asm.text.includes('suggest_next_steps'))
  h.cleanups.forEach((d) => d())
}

console.log(log.join('\n'))

