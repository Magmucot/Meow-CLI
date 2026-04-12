import { log, C, ACCENT, MUTED, TEXT_DIM, SUCCESS, WARNING } from "../ui.js";
import { getModelPrice } from "../cost-tracker.js";

/**
 * Enumeration of task complexity levels.
 * @enum {string}
 */
const Complexity = {
  TRIVIAL: "trivial",
  SIMPLE: "simple",
  MODERATE: "moderate",
  COMPLEX: "complex",
  EXPERT: "expert",
};

/** @type {Array<RegExp>} Regex patterns for identifying trivial tasks */
const TRIVIAL_PATTERNS = [
  /^(list|ls|show|display|print)\b/i,
  /^(what|which|where) (is|are|was)\b/i,
  /^(read|cat|view|open)\b/i,
  /^help\b/i,
  /^(explain|describe|summarize)\s+.{0,50}$/i,
];

/** @type {Array<RegExp>} Regex patterns for identifying expert/complex tasks */
const COMPLEX_PATTERNS = [
  /refactor\s+\d+\s+files?/i,
  /architect/i,
  /design\s+(system|api|database|schema)/i,
  /(create|build|implement)\s+.*(from scratch|complete|full)/i,
  /multi.*(file|step|phase)/i,
  /debug.*complex/i,
  /security\s+audit/i,
  /performance\s+optim/i,
  /migrate/i,
];

/**
 * Analyzes the complexity of a user message to determine routing.
 * @param {string} message - The user input.
 * @param {number} [contextLength=0] - Current length of the conversation context.
 * @returns {string} One of the Complexity enum values.
 */
function analyzeComplexity(message, contextLength = 0) {
  if (!message || message.length < 10) return Complexity.TRIVIAL;

  for (const p of TRIVIAL_PATTERNS) {
    if (p.test(message)) return Complexity.TRIVIAL;
  }

  for (const p of COMPLEX_PATTERNS) {
    if (p.test(message)) return Complexity.EXPERT;
  }

  const toolHints = (message.match(/\b(file|write|patch|shell|create|build|test|fix|bug)\b/gi) || []).length;
  const wordCount = message.split(/\s+/).length;
  const hasCode = /```/.test(message) || /\b(function|class|const|let|var|import|export|def|fn)\b/.test(message);

  let score = 0;
  score += Math.min(wordCount / 20, 2);
  score += toolHints * 0.5;
  score += hasCode ? 1 : 0;
  score += contextLength > 50000 ? 1 : contextLength > 20000 ? 0.5 : 0;

  if (score < 1) return Complexity.SIMPLE;
  if (score < 2.5) return Complexity.MODERATE;
  if (score < 4) return Complexity.COMPLEX;
  return Complexity.EXPERT;
}

/**
 * Mapping of complexity levels to model tiers.
 * @type {Object<string, {tier: string, label: string}>}
 */
const MODEL_TIERS = {
  [Complexity.TRIVIAL]:  { tier: "fast",     label: "⚡ Fast" },
  [Complexity.SIMPLE]:   { tier: "fast",     label: "⚡ Fast" },
  [Complexity.MODERATE]: { tier: "balanced", label: "⚖️ Balanced" },
  [Complexity.COMPLEX]:  { tier: "powerful", label: "🧠 Powerful" },
  [Complexity.EXPERT]:   { tier: "powerful", label: "🧠 Powerful" },
};

/** @type {Object<string, string>} Default models for each tier */
const DEFAULT_TIER_MODELS = {
  fast: "gpt-4o-mini",
  balanced: "gpt-4o",
  powerful: "gpt-4-turbo",
};

/**
 * Routes requests to different models based on estimated task complexity.
 */
class ModelRouter {
  /**
   * @param {Object} cfg - Application configuration.
   */
  constructor(cfg) {
    this.enabled = cfg.smart_routing?.enabled !== false;
    this.defaultModel = cfg.model;
    this.tierModels = {
      fast: cfg.smart_routing?.fast_model || cfg.smart_routing?.cheap_model || DEFAULT_TIER_MODELS.fast,
      balanced: cfg.smart_routing?.balanced_model || cfg.model || DEFAULT_TIER_MODELS.balanced,
      powerful: cfg.smart_routing?.powerful_model || cfg.smart_routing?.expensive_model || DEFAULT_TIER_MODELS.powerful,
    };\n    this.forceModel = cfg.smart_routing?.force_model || null;
    this.stats = { trivial: 0, simple: 0, moderate: 0, complex: 0, expert: 0, savings: 0 };
  }

  /**
   * Selects the appropriate model for a given message.
   * @param {string} message - User input.
   * @param {number} [contextLength=0] - Context length.
   * @returns {Object} Selection result (model, complexity, tier, etc).
   */
  selectModel(message, contextLength = 0) {
    if (!this.enabled) return { model: this.defaultModel, complexity: null, routed: false };
    if (this.forceModel) return { model: this.forceModel, complexity: null, routed: false };

    const complexity = analyzeComplexity(message, contextLength);
    const tier = MODEL_TIERS[complexity];
    const model = this.tierModels[tier.tier] || this.defaultModel;

    this.stats[complexity]++;

    if (model !== this.defaultModel) {
      const defaultPrice = getModelPrice(this.defaultModel);
      const selectedPrice = getModelPrice(model);
      const estimatedTokens = message.length / 3.5 * 3;
      const defaultCost = estimatedTokens * (defaultPrice.input + defaultPrice.output) / 2 / 1_000_000;
      const selectedCost = estimatedTokens * (selectedPrice.input + selectedPrice.output) / 2 / 1_000_000;
      this.stats.savings += Math.max(0, defaultCost - selectedCost);
    }

    return { model, complexity, tier: tier.tier, label: tier.label, routed: model !== this.defaultModel };
  }

  /**
   * Returns routing statistics and estimated savings.
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      totalRouted: Object.values(this.stats).reduce((s, v) => s + (typeof v === "number" && v > 0 ? v : 0), 0) - this.stats.savings,
      estimatedSavings: `$${this.stats.savings.toFixed(4)}`,
    };\n  }

  /**
   * Prints the current router configuration to the terminal.
   */
  printConfig() {
    console.log(`\n  ${ACCENT}${C.bold}◆ Smart Routing${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    console.log(`  ${TEXT_DIM}Enabled:${C.reset}  ${this.enabled ? `${SUCCESS}yes` : `${MUTED}no`}${C.reset}`);
    console.log(`  ${TEXT_DIM}Fast:${C.reset}     ${this.tierModels.fast}`);
    console.log(`  ${TEXT_DIM}Balanced:${C.reset} ${this.tierModels.balanced}`);
    console.log(`  ${TEXT_DIM}Powerful:${C.reset} ${this.tierModels.powerful}`);
    if (this.stats.savings > 0) {
      console.log(`  ${TEXT_DIM}Savings:${C.reset}  ${SUCCESS}$${this.stats.savings.toFixed(4)}${C.reset}`);
    }
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}\n`);
  }
}

/**
 * Compresses message history by extracting key state and removing old messages.
 * @param {Array<Object>} messages - Conversation history.
 * @returns {Object} Compaction result.
 */
function compressStructured(messages) {
  if (messages.length < 8) return { messages, compressed: false };

  const system = messages[0];
  const recent = messages.slice(-6);
  const old = messages.slice(1, -6);

  const state = {
    filesRead: new Set(),
    filesModified: new Set(),
    toolsUsed: {},\n    errorsEncountered: [],
    decisions: [],
    lastPlan: "",
  };

  for (const msg of old) {
    const content = typeof msg.content === "string" ? msg.content : "";

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name || "";
        state.toolsUsed[name] = (state.toolsUsed[name] || 0) + 1;
        try {
          const args = JSON.parse(tc.function?.arguments || "{}");
          if (args.path) {
            if (name === "read_file" || name === "list_dir") state.filesRead.add(args.path);
            if (name === "write_file" || name === "patch_file") state.filesModified.add(args.path);
          }
        } catch {}\n      }
    }\n    if (msg.role === "assistant" && content.includes("PLAN")) {
      state.lastPlan = content.slice(0, 500);
    }
    if (content.includes("❌") || content.includes("Error")) {
      state.errorsEncountered.push(content.slice(0, 200));
    }
  }

  const summary = [\n    "[COMPRESSED CONTEXT]",
    state.lastPlan ? `Plan: ${state.lastPlan.slice(0, 300)}` : "",
    state.filesRead.size > 0 ? `Files read: ${[...state.filesRead].join(", ")}` : "",
    state.filesModified.size > 0 ? `Files modified: ${[...state.filesModified].join(", ")}` : "",
    Object.keys(state.toolsUsed).length > 0 ? `Tools: ${JSON.stringify(state.toolsUsed)}` : "",
    state.errorsEncountered.length > 0 ? `Errors: ${state.errorsEncountered.slice(-3).join("; ")}` : "",
    "Continue from recent context.",
  ].filter(Boolean).join("\n");

  return {
    messages: [system, { role: "user", content: summary }, ...recent],
    compressed: true,
    removed: old.length,
  };
}

let _router = null;
/**
 * Singleton accessor for the ModelRouter.
 * @param {Object} cfg - Application configuration.
 * @returns {ModelRouter}
 */
function getModelRouter(cfg) {
  if (!_router || _router.defaultModel !== cfg.model) _router = new ModelRouter(cfg);
  return _router;
}

export {
  ModelRouter, getModelRouter,
  analyzeComplexity, Complexity, MODEL_TIERS,
  compressStructured,
};
