import { PromptOptimizer } from "../src/modules/smart/prompt-optimizer.js";
import assert from "assert";

// Mock config
const cfg = {
  model: "gpt-4-turbo",
  prompt_optimizer: {
    enabled: true,
    verbose: false
  }
};

// Mock callApi (this would need actual API access or a better mock for a real test)
// For now, we just check if the class instantiates and has the right methods.

async function testOptimizer() {
  console.log("Testing PromptOptimizer...");
  const optimizer = new PromptOptimizer(cfg);
  
  assert.strictEqual(typeof optimizer.optimize, "function");
  assert.strictEqual(typeof optimizer._getProjectContext, "function");
  assert.strictEqual(typeof optimizer._buildOptimizationPrompt, "function");

  console.log("Context gathering test...");
  const context = optimizer._getProjectContext();
  console.log("Project context length:", context.length);
  
  console.log("Prompt building test...");
  const optPrompt = optimizer._buildOptimizationPrompt("test prompt", "test context");
  assert.ok(optPrompt.includes("test prompt"));
  assert.ok(optPrompt.includes("test context"));

  console.log("✅ PromptOptimizer basic tests passed!");
}

testOptimizer().catch(e => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});
