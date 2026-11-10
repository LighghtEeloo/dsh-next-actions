#!/usr/bin/env node
/**
 * Zero-dependency client build for @local/dsh-next-actions.
 *
 * The DSH module system serves a plugin's `./client` as ONE classic script, so
 * the browser half cannot `import` sibling files. This script keeps
 * `lib/view-model.js` and `src/styles.js` as the single source of truth and
 * inlines them into `src/client.js` at the template markers, then writes the
 * committed `client.js` artifact.
 *
 * Usage:
 *   node scripts/build-client.mjs          # write client.js
 *   node scripts/build-client.mjs --check  # exit 1 when client.js is stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(root, relative), 'utf8')

const stripExports = (source) => source
  .replace(/^export\s+default\s+/gm, '')
  .replace(/^export\s+/gm, '')

const template = read('src/client.js')
const outputs = template
  .replace('/* @inline:view-model */', stripExports(read('lib/view-model.js')).trimEnd())
  .replace('/* @inline:styles */', stripExports(read('src/styles.js')).trimEnd())

const MARKERS = ['/* @inline:view-model */', '/* @inline:styles */']
const leftover = MARKERS.find((marker) => outputs.includes(marker))
if (leftover !== undefined) {
  console.error(`build-client: template marker was not replaced: ${leftover}`)
  process.exit(1)
}

if (process.argv.includes('--check')) {
  let current
  try {
    current = read('client.js')
  } catch {
    console.error('build-client: client.js is missing; run node scripts/build-client.mjs')
    process.exit(1)
  }
  if (current !== outputs) {
    console.error('build-client: client.js is stale; run node scripts/build-client.mjs')
    process.exit(1)
  }
  console.log(`build-client: client.js is up to date (${outputs.length} chars)`)
} else {
  writeFileSync(join(root, 'client.js'), outputs)
  console.log(`build-client: wrote client.js (${outputs.length} chars)`)
}
