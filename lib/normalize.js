/**
 * Pure, dependency-free normalization for the `suggest_next_steps` tool.
 *
 * The Host uses `buildMeta()` twice per accepted call:
 *   - `execute()` reduces it to the canonical `{ shown, count }` value, and
 *   - `output.presentationMeta()` persists it as `tool/result.meta`, the only
 *     structured source the browser reads when it renders the card.
 *
 * Rules (design/next-step-suggestions-tech.md §5.6): trim/clamp text, drop
 * empty entries, de-duplicate prompts, keep explicit stances unique, keep at
 * most one recommendation, upgrade `danger` with a local risk lexicon, cap the
 * list at six while protecting the recommendation and the "optional" entry,
 * and derive a stable content id for every suggestion.
 *
 * The module must stay import-free and side-effect-free: it runs inside the
 * Host process, is unit-tested with `node --test`, and a conservative subset of
 * these rules is inlined into the browser bundle later (M2) for the compaction
 * fallback path.
 */

export const LIMITS = Object.freeze({
  maxSuggestions: 6,
  context: 240,
  label: 40,
  labelDisplay: 20,
  prompt: 500,
})

export const STANCES = Object.freeze(['verify', 'continue', 'push', 'pivot', 'optional'])

/**
 * Warning-only risk lexicon. A hit upgrades a suggestion with `danger: true`,
 * which only changes the card's tag and warning copy — never the "fill the
 * input, never send" contract.
 */
export const RISK_LEXICON = Object.freeze([
  /\brm\s+-rf\b/i,
  /\bforce[- ]?push\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bsudo\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bformat\s+(disk|drive|volume)\b/i,
  /\bdeploy\b/i,
  /\bpublish\b/i,
  /\bproduction\b/i,
  /删除|清空|重置|格式化|强制推送|强推|发布|部署|上线|付费|扣费|支付|授权|提权|权限|卸载|回滚|迁移|销毁/,
])

export const NOTES = Object.freeze({
  invalidArguments: 'invalid-arguments',
  missingContext: 'missing-context',
  noUsableSuggestions: 'no-usable-suggestions',
})

/** @typedef {{ id: string, label: string, prompt: string, stance: string, recommended?: true, danger?: true }} Suggestion */
/** @typedef {{ shown: boolean, context?: string, suggestions?: Suggestion[], note?: string }} Meta */

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value) => typeof value === 'string'
const asText = (value) => (isString(value) ? value : '')

/** Collapse runs of whitespace (including newlines) into single spaces. */
export function collapse(value) {
  return value.replace(/\s+/g, ' ').trim()
}

/** Strip matching wrapping quotes the model sometimes adds around short fields. */
export function stripWrappingQuotes(value) {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  const pairs = [
    ['"', '"'],
    ['“', '”'],
    ['「', '」'],
    ["'", "'"],
  ]
  return pairs.some(([left, right]) => first === left && last === right)
    ? value.slice(1, -1).trim()
    : value
}

/** Clamp by Unicode code points, appending an ellipsis when content is dropped. */
export function truncate(value, max) {
  const characters = Array.from(value)
  if (characters.length <= max) return value
  return `${characters.slice(0, Math.max(0, max - 1)).join('')}…`
}

/** Normalized key used for prompt de-duplication. */
export function normalizeKey(value) {
  return collapse(value)
    .toLocaleLowerCase()
    .replace(/[。．.!！?？,，;；:：]+$/u, '')
}

/** Stable content hash (djb2/xor variant, base36) — the suggestion id. */
export function hashBase36(value) {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

function riskOf(label, prompt) {
  const haystack = `${label}\n${prompt}`
  return RISK_LEXICON.some((pattern) => pattern.test(haystack))
}

function safeParseArguments(rawArgs) {
  if (isString(rawArgs)) {
    try {
      return JSON.parse(rawArgs)
    } catch {
      return undefined
    }
  }
  return rawArgs
}

/**
 * Clean one entry. `explicitStance` records whether the model supplied a valid
 * stance: omitted/invalid stances default to `continue` for display but do not
 * consume a stance slot, so a model that forgets the field cannot collapse the
 * card to a single suggestion.
 */
function normalizeEntries(rawSuggestions) {
  const entries = []
  for (const raw of rawSuggestions) {
    if (!isRecord(raw)) continue
    const label = truncate(collapse(stripWrappingQuotes(asText(raw.label))), LIMITS.label)
    const promptText = truncate(collapse(stripWrappingQuotes(asText(raw.prompt))), LIMITS.prompt)
    if (label === '' && promptText === '') continue
    const prompt = promptText === '' ? label : promptText
    const safeLabel = label === '' ? truncate(prompt, LIMITS.label) : label
    const explicitStance = STANCES.includes(raw.stance)
    entries.push({
      label: safeLabel,
      prompt,
      stance: explicitStance ? raw.stance : 'continue',
      explicitStance,
      recommended: raw.recommended === true,
      danger: raw.danger === true || riskOf(safeLabel, prompt),
    })
  }
  return entries
}

/** De-duplicate prompts; keep explicit stances unique (first one wins). */
function dedupe(entries) {
  const seenPrompts = new Set()
  const seenStances = new Set()
  const kept = []
  for (const entry of entries) {
    const promptKey = normalizeKey(entry.prompt)
    if (promptKey === '' || seenPrompts.has(promptKey)) continue
    if (entry.explicitStance && seenStances.has(entry.stance)) continue
    seenPrompts.add(promptKey)
    if (entry.explicitStance) seenStances.add(entry.stance)
    kept.push(entry)
  }
  return kept
}

/** Only the first `recommended: true` survives. */
function singleRecommendation(entries) {
  let found = false
  return entries.map((entry) => {
    if (!entry.recommended) return entry
    if (found) return { ...entry, recommended: false }
    found = true
    return entry
  })
}

/** Order: recommendation first, "optional" last, everything else in model order. */
function order(entries) {
  const recommendation = entries.find((entry) => entry.recommended)
  const optional = entries.find((entry) => entry.stance === 'optional' && entry !== recommendation)
  const middle = entries.filter((entry) => entry !== recommendation && entry !== optional)
  const capacity = Math.max(0, LIMITS.maxSuggestions - (recommendation ? 1 : 0) - (optional ? 1 : 0))
  return [
    ...(recommendation ? [recommendation] : []),
    ...middle.slice(0, capacity),
    ...(optional ? [optional] : []),
  ]
}

/** Derive stable ids; a hash collision inside one card gets a numeric suffix. */
function withIds(entries) {
  const used = new Set()
  return entries.map((entry) => {
    const base = `s${hashBase36(entry.prompt)}`
    let id = base
    let suffix = 1
    while (used.has(id)) {
      suffix += 1
      id = `${base}-${suffix}`
    }
    used.add(id)
    const suggestion = {
      id,
      label: entry.label,
      prompt: entry.prompt,
      stance: entry.stance,
    }
    if (entry.recommended) suggestion.recommended = true
    if (entry.danger) suggestion.danger = true
    return suggestion
  })
}

/**
 * Normalize the model's tool arguments into the persisted card metadata.
 * Never throws: every malformed input degrades to `{ shown: false, note }`.
 *
 * @param {unknown} rawArgs - parsed tool arguments (a JSON string is tolerated).
 * @returns {Meta}
 */
export function buildMeta(rawArgs) {
  const args = safeParseArguments(rawArgs)
  if (!isRecord(args)) return { shown: false, note: NOTES.invalidArguments }

  if (!isString(args.context)) {
    return {
      shown: false,
      note: args.context === undefined ? NOTES.missingContext : NOTES.invalidArguments,
    }
  }
  const context = truncate(collapse(stripWrappingQuotes(args.context)), LIMITS.context)
  if (context === '') return { shown: false, note: NOTES.missingContext }

  if (!Array.isArray(args.suggestions)) return { shown: false, note: NOTES.invalidArguments }
  const suggestions = withIds(order(singleRecommendation(dedupe(normalizeEntries(args.suggestions)))))
  if (suggestions.length === 0) return { shown: false, note: NOTES.noUsableSuggestions }

  return { shown: true, context, suggestions }
}
