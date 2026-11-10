
import { __definition, __guidance, normalizeConfig } from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/index.js'
import { buildMeta, LIMITS, NOTES, RISK_LEXICON } from '/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/lib/normalize.js'

const d = __definition
const nameDescParams = JSON.stringify({ name: d.name, description: d.description, parameters: d.parameters })
const outputSchema = JSON.stringify(d.output.schema)
const declared = JSON.stringify({ name: d.name, description: d.description, parameters: d.parameters }).length + outputSchema.length
const modelVisible = JSON.stringify({ name: d.name, description: d.description, parameters: d.parameters }).length
console.log('--- TOKEN/CHAR RECOUNT ---')
console.log('name:', d.name, '| description chars:', d.description.length)
console.log('JSON.stringify({name,description,parameters}).length =', nameDescParams.length)
console.log('JSON.stringify(output.schema).length =', outputSchema.length)
console.log('declared total (design formula) =', declared, '-> tokens@4 =', (declared/4).toFixed(1))
console.log('model-visible native declaration (no output schema) =', modelVisible, '-> tokens@4 =', (modelVisible/4).toFixed(1))
console.log('guidance chars:', __guidance.text.length, '-> tokens@4 =', (__guidance.text.length/4).toFixed(1))
console.log('guidance codepoints:', Array.from(__guidance.text).length)
console.log('guidance contains {{:', __guidance.text.includes('{{'))
console.log('total always-on (declared+guidance) =', declared + __guidance.text.length)
console.log('total always-on model-visible native (nameDescParams+guidance) =', modelVisible + __guidance.text.length)
console.log('render shown text chars:', JSON.stringify(d.output.render({}, {shown:true,count:3})).length, '| raw text:', d.output.render({}, {shown:true,count:3})[0].text.length)
console.log('render no-card text chars:', d.output.render({}, {shown:false,count:0})[0].text.length)
const validArgs = { context: '改动已完成，改动集中在 src/api。', suggestions: [
  { label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。', stance: 'verify' },
  { label: '加回归用例', prompt: '补一条针对边界值的回归用例。', stance: 'continue' },
  { label: '看改动', prompt: '看一下本次改动的完整 diff。', stance: 'push' } ] }
console.log('sample args JSON chars:', JSON.stringify(validArgs).length)
console.log('sample meta JSON chars:', JSON.stringify(buildMeta(validArgs)).length)
console.log('sample meta:', JSON.stringify(buildMeta(validArgs)))
console.log('config normalize variants:', JSON.stringify([undefined,null,{}, {enabled:false},{enabled:'false'},{enabled:0},{enabled:true}].map(c => [c, normalizeConfig(c)])))

