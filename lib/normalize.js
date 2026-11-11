/**
 * Normalize `suggest_next_steps` arguments into the card model.
 *
 * Shared by both halves: the Host persists the result as `tool/result.meta`,
 * and the browser bundle inlines this file to re-read that meta (or the raw
 * arguments when compaction dropped it). Import-free and side-effect-free.
 */

export const LIMITS = Object.freeze({ suggestions: 3, context: 240, label: 24, prompt: 500 })

/** A hit marks a suggestion as needing confirmation; clicking still only fills the input. */
export const RISK = /\brm\s+-rf\b|\bforce[- ]?push\b|--force\b|\bdrop\s+(table|database)\b|\bsudo\b|\bdeploy\b|\bpublish\b|\bproduction\b|删除|清空|重置|强制推送|强推|发布|部署|上线|付费|支付|授权|卸载|回滚|销毁/i

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

function clip(value, max) {
  const characters = Array.from(value)
  return characters.length <= max ? value : `${characters.slice(0, max - 1).join('')}…`
}

/**
 * @param {unknown} raw - tool arguments (object or JSON string), or a persisted meta.
 * @returns {{ shown: true, context: string, suggestions: { label: string, prompt: string, danger?: true }[] } | { shown: false, note: string }}
 */
export function buildMeta(raw) {
  let args = raw
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      args = null
    }
  }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return { shown: false, note: 'invalid-arguments' }

  const context = clip(text(args.context), LIMITS.context)
  if (context === '') return { shown: false, note: 'missing-context' }

  const seen = new Set()
  const suggestions = []
  for (const item of Array.isArray(args.suggestions) ? args.suggestions : []) {
    if (item === null || typeof item !== 'object') continue
    const prompt = clip(text(item.prompt) || text(item.label), LIMITS.prompt)
    const key = prompt.toLowerCase()
    if (prompt === '' || seen.has(key)) continue
    seen.add(key)
    const label = clip(text(item.label) || prompt, LIMITS.label)
    suggestions.push(item.danger === true || RISK.test(`${label}\n${prompt}`)
      ? { label, prompt, danger: true }
      : { label, prompt })
    if (suggestions.length === LIMITS.suggestions) break
  }
  if (suggestions.length === 0) return { shown: false, note: 'no-usable-suggestions' }
  return { shown: true, context, suggestions }
}
