
import { buildMeta } from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/lib/normalize.js'
const valid = { context: '改动已完成，改动集中在 src/api。', suggestions: [
  { label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。', stance: 'verify' },
  { label: '加回归用例', prompt: '补一条针对边界值的回归用例。', stance: 'continue' },
  { label: '看改动', prompt: '看一下本次改动的完整 diff。', stance: 'push' } ] }
for (let i = 0; i < 5000; i++) buildMeta(valid)
const runs = []
for (let r = 0; r < 5; r++) {
  const t0 = performance.now()
  const N = 200000
  for (let i = 0; i < N; i++) buildMeta(valid)
  runs.push(((performance.now() - t0) * 1000 / N).toFixed(2))
}
console.log('buildMeta us/call (5x200k runs):', runs.join(', '), '| min', Math.min(...runs.map(Number)))

