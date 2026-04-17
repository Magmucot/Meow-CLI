import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LeadDevSession, suggestNextTasks } from '../../src/modules/agents/lead-dev.js';

describe('Lead Developer Integration', () => {
  const cfg = {
    model: 'test-model',
    api_base: 'http://localhost',
    api_key: 'test-key',
    profile: 'default',
    profiles: { default: { temperature: 0.7 } },
    lead_dev: { max_cost_usd: 10.0, max_tasks: 5 }
  };

  beforeEach(() => {
    globalThis.fetch = async (url) => {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify([
                { task: 'Refactor code', category: 'refactor', priority: 1, reason: 'Improve clarity', files: ['src/utils.js'], parallel: true }
              ])
            }
          }],
          usage: { total_tokens: 150 }
        })
      };
    };
  });

  test('suggestNextTasks should return parsed suggestions', async () => {
    const analyzer = {
      projectType: 'node',
      runAllGates: () => [],
      getSummary: () => ({})
    };
    
    const suggestions = await suggestNextTasks(cfg, analyzer);
    
    assert.ok(Array.isArray(suggestions));
    assert.strictEqual(suggestions.length, 1);
    assert.strictEqual(suggestions[0].task, 'Refactor code');
  });

  test('LeadDevSession should handle a full round', async () => {
    const session = new LeadDevSession(cfg, [], () => {});
    
    // Mocking _askUserChoice to auto-select the first suggestion
    session._askUserChoice = async () => 0;
    session._askContinue = async () => false;
    
    // Mocking _executeTask to avoid spawning Autopilot which is complex to mock here
    session._executeTask = async (task) => {
      return { tokens: 100, cost: 0.01 };
    };

    const result = await session.run('Initial context', { tasks: 1 });
    
    assert.strictEqual(result.completed, 1);
    assert.strictEqual(session.tasksCompleted.length, 1);
    assert.strictEqual(session.tasksCompleted[0].task, 'Refactor code');
  });
});
