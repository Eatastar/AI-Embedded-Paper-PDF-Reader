import test from 'node:test';
import assert from 'node:assert/strict';
import { sortDiscoveredModels } from '../src/domain/model-list';
import { discoverModels } from '../src/adapters/model';

test('models sort naturally by API ID, preserving IDs, labels and the provider array', () => {
  const input = [{ id: 'gpt-10', label: 'First display label' }, { id: 'Qwen-12' }, { id: 'gpt-2', label: 'Last display label' }, { id: 'claude-3' }, { id: 'qwen-2' }, { id: 'GPT-1' }];
  const snapshot = structuredClone(input), sorted = sortDiscoveredModels(input);
  assert.deepEqual(sorted.map(model => model.id), ['claude-3', 'GPT-1', 'gpt-2', 'gpt-10', 'qwen-2', 'Qwen-12']);
  assert.deepEqual(input, snapshot); assert.equal(sorted[2], input[2]); assert.equal(sorted[2].label, 'Last display label');
});

test('the model-list adapter returns sorted API IDs rather than replacing them with friendly labels', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ id: 'model-10', label: 'Alpha' }, { id: 'model-2', label: 'Zulu' }] }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const models = await discoverModels({ name: 'Synthetic', apiFormat: 'openai-chat', baseURL: 'http://127.0.0.1:11434/v1', model: '', systemPrompt: '' });
    assert.deepEqual(models, [{ id: 'model-2', label: 'Zulu' }, { id: 'model-10', label: 'Alpha' }]);
  } finally { globalThis.fetch = original; }
});
