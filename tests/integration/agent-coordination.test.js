import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SubagentCache, AgentCoordinator, SubAgent } from '../../src/modules/agents/subagent.js';

// Mocking fetch for API calls
const originalFetch = globalThis.fetch;

describe('Subagent Coordination Integration', () => {
  beforeEach(() => {
    globalThis.fetch = async (url) => {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: '✅ DONE: Task completed successfully'
            }
          }],
          usage: { total_tokens: 100 }
        })
      };
    };
  });

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
  });

  describe('AgentCoordinator', () => {
    const cfg = {
      model: 'test-model',
      api_base: 'http://localhost',
      api_key: 'test-key',
      profile: 'default',
      profiles: { default: { temperature: 0.7 } }
    };

    test('should run multiple tasks in parallel', async () => {
      const coordinator = new AgentCoordinator(cfg);
      const tasks = [
        { task: 'Task 1' },
        { task: 'Task 2' }
      ];

      const results = await coordinator.runParallel(tasks);
      
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].status, 'done');
      assert.strictEqual(results[1].status, 'done');
      
      const stats = coordinator.getStats();
      assert.strictEqual(stats.total, 2);
      assert.strictEqual(stats.success, 2);
    });

    test('should use cache for repeated tasks', async () => {
      const coordinator = new AgentCoordinator(cfg);
      const taskDef = { task: 'Repeated Task' };

      // First run
      await coordinator.runParallel([taskDef]);
      
      // Second run
      const results = await coordinator.runParallel([taskDef]);
      
      assert.strictEqual(results[0].fromCache, true);
      assert.strictEqual(coordinator.getStats().cacheStats.hits, 1);
    });
  });

  describe('SubAgent', () => {
    const cfg = {
      model: 'test-model',
      api_base: 'http://localhost',
      api_key: 'test-key',
      profile: 'default',
      profiles: { default: { temperature: 0.7 } }
    };

    test('should execute a task and return done', async () => {
      const agent = new SubAgent('Simple task', cfg);
      const result = await agent.run();
      
      assert.strictEqual(result.status, 'done');
      assert.ok(result.result.includes('✅ DONE:'));
    });

    test('should handle API errors gracefully', async () => {
      globalThis.fetch = async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Error message'
        };
      };

      const agent = new SubAgent('Failing task', cfg);
      const result = await agent.run();
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.includes('500'));
    });
  });
});
