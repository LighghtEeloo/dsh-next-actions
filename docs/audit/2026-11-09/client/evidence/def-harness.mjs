import { readFileSync } from 'node:fs';
const code = readFileSync('/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions/client.js', 'utf8');
let loaded;
const windowStub = { __ModuleLoader__: { load: (b) => { loaded = b; } } };
new Function('window', code)(windowStub);
const react = {
  createElement: () => null,
  createContext: () => ({ Provider: ({ children }) => children }),
  useContext: () => undefined,
  memo: (c) => c,
  useCallback: (cb) => cb,
  useId: () => 'id',
  useMemo: (f) => f(),
  useRef: (i) => ({ current: i }),
  useState: (i) => [typeof i === 'function' ? i() : i, () => {}],
};
const mod = loaded.factory((name) => {
  if (name === 'react') return react;
  throw new Error('unexpected require ' + name);
});
const def = mod.__test.nextStepsDefinition;
console.log('id', loaded.id, '| inject', JSON.stringify(mod.inject));

// Simulate a Definition context whose turn/start fell outside the loaded window:
// acceptMatch creates the context, then buildLocationData runs for every dirty context.
const orphan = { key: 'next-steps:1', kind: 'next-steps', id: '1', matches: [], start: undefined, state: undefined, current: new Map() };
try {
  def.buildLocationData(orphan, 'turn', undefined);
  console.log('ORPHAN: no throw (unexpected)');
} catch (error) {
  console.log('ORPHAN buildLocationData threw:', error.constructor.name + ': ' + error.message);
}

// State present, model null -> null (fine).
console.log('no model ->', def.buildLocationData({ state: { turn: 1, calls: new Map(), model: null } }, 'turn'));
// Identity optimisation check: two identical-content publications.
const state = { turn: 1, calls: new Map(), model: { shown: true, context: 'c', suggestions: [{ id: 'a', label: 'a', prompt: 'a', stance: 'continue' }] } };
const first = def.buildLocationData({ state }, 'turn');
const second = def.buildLocationData({ state }, 'turn', first);
console.log('identity optimization reuses previous object:', second === first);
console.log('content equal:', JSON.stringify(second.value) === JSON.stringify(first.value));