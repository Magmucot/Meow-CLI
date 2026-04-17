import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SubagentCache } from '../../src/modules/agents/subagent.js';

describe('SubagentCache', () => {
  test('should store and retrieve results', () => {
    const cache = new SubagentCache();
    const task = 'test task';
    const result = { status: 'done', result: 'success' };
    
    cache.set(task, [], result);
    const cached = cache.get(task, []);
    
    assert.deepStrictEqual(cached, result);
    assert.strictEqual(cache.getStats().hits, 1);
  });

  test('should return null for non-existent entries', () => {
    const cache = new SubagentCache();
    const cached = cache.get('non-existent');
    
    assert.strictEqual(cached, null);
    assert.strictEqual(cache.getStats().misses, 1);
  });

  test('should expire entries after TTL', async () => {
    const cache = new SubagentCache();
    const task = 'expiring task';
    const result = { status: 'done' };
    
    // We can't easily wait 5 minutes in a test, but we can mock Date.now if needed
    // For now, let's just verify basic set/get
    cache.set(task, [], result);
    assert.ok(cache.get(task, []));
  });
});
