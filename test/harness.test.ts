import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentCoordinator } from '../src/coordinator.js';
import { ModelRegistry, parseModelSelection } from '../src/models.js';

test('parses provider-qualified and default model selections', () => {
  assert.deepEqual(parseModelSelection('kimi/kimi-k2'), { provider: 'kimi', model: 'kimi-k2' });
  assert.deepEqual(parseModelSelection('muse-spark-1.2', 'meta'), { provider: 'meta', model: 'muse-spark-1.2' });
  assert.deepEqual(parseModelSelection('openrouter/qwen/qwen3-coder'), {
    provider: 'openrouter', model: 'qwen/qwen3-coder',
  });
});

test('registry includes model-neutral provider presets', () => {
  const providers = new ModelRegistry().list();
  for (const expected of ['kimi', 'meta', 'ollama', 'openai', 'openrouter', 'qwen', 'xai']) {
    assert.ok(providers.includes(expected), `missing ${expected}`);
  }
});

test('coordinator runs agents concurrently and records results', async () => {
  const coordinator = new AgentCoordinator(2);
  const selection = { provider: 'qwen', model: 'test-model' };
  const first = coordinator.spawn('one', selection, async () => 'first result');
  const second = coordinator.spawn('two', selection, async () => 'second result');
  assert.throws(() => coordinator.spawn('three', selection, async () => 'no'), /limit/);
  const results = await coordinator.wait([first.id, second.id]);
  assert.deepEqual(results.map((item) => item.status), ['completed', 'completed']);
  assert.deepEqual(results.map((item) => item.result), ['first result', 'second result']);
});

test('coordinator queues steering messages', () => {
  const coordinator = new AgentCoordinator();
  const agent = coordinator.spawn('one', { provider: 'meta', model: 'test' }, async () => 'done');
  coordinator.send(agent.id, 'focus on tests');
  assert.deepEqual(coordinator.drain(agent.id), ['focus on tests']);
  assert.deepEqual(coordinator.drain(agent.id), []);
});
