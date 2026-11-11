#!/usr/bin/env node
/**
 * Build client.js: DSH serves `./client` as one classic script, so
 * lib/normalize.js and src/styles.js are inlined into the src/client.js template.
 *
 *   node scripts/build-client.mjs          # write client.js
 *   node scripts/build-client.mjs --check  # exit 1 when client.js is stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(root, relative), 'utf8')
const inline = (relative) => read(relative).replace(/^export\s+/gm, '').trimEnd()

let output = read('src/client.js')
for (const [marker, file] of [['/* @inline:normalize */', 'lib/normalize.js'], ['/* @inline:styles */', 'src/styles.js']]) {
  if (!output.includes(marker)) {
    console.error(`build-client: missing marker ${marker}`)
    process.exit(1)
  }
  output = output.replace(marker, () => inline(file))
}

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = read('client.js')
  } catch {
    // Missing counts as stale.
  }
  if (current !== output) {
    console.error('build-client: client.js is stale; run node scripts/build-client.mjs')
    process.exit(1)
  }
  console.log('build-client: client.js is up to date')
} else {
  writeFileSync(join(root, 'client.js'), output)
  console.log(`build-client: wrote client.js (${output.length} chars)`)
}
