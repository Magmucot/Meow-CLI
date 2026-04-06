// ═══════════════════════════════════════════════════════════════════════════
// cost-tracker.js — Meow CLI Cost Tracking
// Track token usage and estimated cost per request
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { COST_FILE } from "./config.js";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, WARNING, box, COLS } from "./ui.js";

// Prices per 1M tokens (USD) — common models
const MODEL_PRICES = {
  // OpenAI
  "gpt-4-turbo":        { input: 10.0,  output: 30.0 },
  "gpt-4o":             { input: 2.5,   output: 10.0 },
  "gpt-4o-mini":        { input: 0.15,  output: 0.60 },
  "gpt-4":              { input: 30.0,  output: 60.0 },
  "gpt-3.5-turbo":      { input: 0.50,  output: 1.50 },
  // Anthropic
  "claude-sonnet-4-20250514":    { input: 3.0,  output: 15.0 },
  "claude-opus-4-20250514":    { input: 15.0,  output: 75.0 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022":  { input: 0.80, output: 4.0 },
  // DeepSeek
  "deepseek-chat":      { input: 0.14,  output: 0.28 },
  "deepseek-coder":     { input: 0.14,  output: 0.28 },
  // Defaults
  "_default":           { input: 2.0,   output: 8.0 },
};

function getModelPrice(model) {
  // Exact match
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];

  // Partial match
  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (lower.includes(key) || key.includes(lower)) return price;
  }

  return MODEL_PRICES._default;
}

class CostTracker {
  constructor() {
    this.sessionCost = { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0 };
    this.history = [];
    this._loadTotal();
  }

  _loadTotal() {
    try {
      if (fs.existsSync(COST_FILE)) {
        this.totalCost = JSON.parse(fs.readFileSync(COST_FILE, "utf8"));
      } else {
        this.totalCost = { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0, since: Date.now() };
      }
    } catch {
      this.totalCost = { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0, since: Date.now() };
    }
  }

  _saveTotal() {
    try {
      fs.mkdirSync(path.dirname(COST_FILE), { recursive: true });
      fs.writeFileSync(COST_FILE, JSON.stringify(this.totalCost, null, 2));
    } catch { /* ignore */ }
  }

  // Record a single API call
  record(usage, model) {
    if (!usage) return;

    const price = getModelPrice(model);
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;

    // Session stats
    this.sessionCost.input_tokens += inputTokens;
    this.sessionCost.output_tokens += outputTokens;
    this.sessionCost.total_usd += cost;
    this.sessionCost.requests++;

    // Total stats
    this.totalCost.input_tokens += inputTokens;
    this.totalCost.output_tokens += outputTokens;
    this.totalCost.total_usd += cost;
    this.totalCost.requests++;
    this._saveTotal();

    // Keep recent history
    this.history.push({
      time: Date.now(),
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
    });
    if (this.history.length > 100) this.history.shift();

    return { inputTokens, outputTokens, cost };
  }

  // Format inline cost for display after each response
  formatInline(usage, model) {
    if (!usage) return "";
    const price = getModelPrice(model);
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;

    return `${inputTokens}→${outputTokens} (${(inputTokens + outputTokens).toLocaleString()} total) ~$${cost.toFixed(4)}`;
  }

  // Print session cost
  printSession() {
    const s = this.sessionCost;
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Session Cost${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    console.log(`  ${TEXT_DIM}Requests:${C.reset}      ${TEXT}${s.requests}${C.reset}`);
    console.log(`  ${TEXT_DIM}Input tokens:${C.reset}  ${TEXT}${s.input_tokens.toLocaleString()}${C.reset}`);
    console.log(`  ${TEXT_DIM}Output tokens:${C.reset} ${TEXT}${s.output_tokens.toLocaleString()}${C.reset}`);
    console.log(`  ${TEXT_DIM}Total tokens:${C.reset}  ${TEXT}${(s.input_tokens + s.output_tokens).toLocaleString()}${C.reset}`);
    console.log(`  ${TEXT_DIM}Estimated:${C.reset}     ${WARNING}$${s.total_usd.toFixed(4)}${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}\n`);
  }

  // Print total cost
  printTotal() {
    const t = this.totalCost;
    const s = this.sessionCost;
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Cost Summary${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    console.log(`  ${TEXT}This session:${C.reset}`);
    console.log(`    ${TEXT_DIM}${s.requests} requests, ${(s.input_tokens + s.output_tokens).toLocaleString()} tokens${C.reset}`);
    console.log(`    ${WARNING}$${s.total_usd.toFixed(4)}${C.reset}`);
    console.log("");
    console.log(`  ${TEXT}All time:${C.reset} ${MUTED}(since ${new Date(t.since).toLocaleDateString()})${C.reset}`);
    console.log(`    ${TEXT_DIM}${t.requests} requests, ${(t.input_tokens + t.output_tokens).toLocaleString()} tokens${C.reset}`);
    console.log(`    ${WARNING}$${t.total_usd.toFixed(4)}${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}\n`);
  }

  // Reset total cost
  resetTotal() {
    this.totalCost = { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0, since: Date.now() };
    this._saveTotal();
  }
}


export { CostTracker, getModelPrice, MODEL_PRICES };
