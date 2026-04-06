// ═══════════════════════════════════════════════════════════════════════════
// autopilot.js — Meow CLI Smart Autopilot (Claude Code–grade) v2
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import {
  AUTO_CLR, C, TEXT, MUTED, ACCENT, ACCENT2, SUCCESS, ERROR,
  WARNING, TOOL_CLR, TEXT_DIM, AI_CLR, INFO,
  log, Spinner, renderMD, COLS, box
} from "./ui.js";
import { LOG_DIR } from "./config.js";
import { formatDuration } from "./utils.js";
import { callApi } from "./api.js";
import { executeTool, runShell } from "./tools.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const PHASE = {
  PLAN:     "plan",
  EXECUTE:  "execute",
  VERIFY:   "verify",
  RECOVER:  "recover",
  COMPLETE: "complete",
};

const PHASE_ICONS = {
  [PHASE.PLAN]:     "📋",
  [PHASE.EXECUTE]:  "⚡",
  [PHASE.VERIFY]:   "🔍",
  [PHASE.RECOVER]:  "🔧",
  [PHASE.COMPLETE]: "✅",
};

const PHASE_COLORS = {
  [PHASE.PLAN]:     INFO,
  [PHASE.EXECUTE]:  AUTO_CLR,
  [PHASE.VERIFY]:   ACCENT2,
  [PHASE.RECOVER]:  WARNING,
  [PHASE.COMPLETE]: SUCCESS,
};

// ─── Smart System Prompt ────────────────────────────────────────────────────

const AUTOPILOT_SYSTEM_SUFFIX = `

═══ AUTOPILOT MODE — INTELLIGENT AGENT ═══

You are operating in AUTOPILOT mode as an intelligent autonomous agent.
The user has left and will NOT respond. You must complete the task independently.

## AVAILABLE TOOLS (use actively!)
- read_file: read files (supports start_line/end_line for partial reads)
- write_file: create or overwrite files
- patch_file: targeted edits — replace old_string with new_string (PREFERRED over write_file for edits)
- grep_search: search for patterns across files (regex supported, with --include glob)
- list_dir: list directory contents (supports recursive mode)
- run_shell: execute shell commands
- tool_chain: batch multiple tool calls in sequence
- http_request / web_search: internet access

## EXECUTION PROTOCOL

### Phase 1: PLAN (mandatory first step)
Before ANY action, create a structured plan:
- Analyze the task requirements thoroughly
- Use grep_search and list_dir to understand the codebase first
- List concrete steps with expected outcomes
- Identify potential risks and fallbacks
- Prefix your plan with "📋 PLAN:" so the system can track phases

### Phase 2: EXECUTE
- Execute each step from your plan sequentially
- Use patch_file for targeted edits (NOT write_file for existing files)
- Use grep_search to find code before modifying it
- After each significant action, briefly note what's next
- Prefix execution updates with "⚡ STEP N:"

### Phase 3: VERIFY (mandatory before completion)
- Run tests: run_shell to execute linters, tests, type checks
- Read modified files to verify changes look correct
- If something is broken, go to RECOVER phase
- Prefix with "🔍 VERIFY:"

### Phase 4: RECOVER (if needed)
- Analyze what went wrong
- Try alternative approaches (max 3 attempts per issue)
- Prefix with "🔧 RECOVER:"

### Phase 5: COMPLETE
- Summary of what was done
- List all files created/modified
- Note any remaining issues
- MUST start with "✅ AUTOPILOT COMPLETE"

## RULES
1. NEVER ask questions — decide yourself
2. ALWAYS verify before declaring completion
3. Dead end after 3 attempts → skip and note it
4. Use patch_file instead of write_file for existing files
5. Use grep_search before modifying code you haven't read
6. NEVER output "AUTOPILOT COMPLETE" without verification
7. Use tool_chain for batch reads/checks
`;

// ─── Context Window Manager ─────────────────────────────────────────────────

class ContextManager {
  constructor(maxTokens = 4000000) {
    this.maxTokens = maxTokens;
    this.warningThreshold = 0.75;
    this.criticalThreshold = 0.90;
    this.estimatedTokens = 0;
    this.compressions = 0;
  }

  estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === "string"
        ? msg.content : JSON.stringify(msg.content || "");
      total += Math.ceil(content.length / 3.5);
      if (msg.tool_calls) {
        total += msg.tool_calls.length * 50;
        for (const tc of msg.tool_calls) {
          total += Math.ceil((tc.function?.arguments || "").length / 3.5);
        }
      }
    }
    this.estimatedTokens = total;
    return total;
  }

  getUsageRatio() {
    return this.estimatedTokens / this.maxTokens;
  }

  needsCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.warningThreshold;
  }

  needsCriticalCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.criticalThreshold;
  }

  compress(messages) {
    if (messages.length < 10) return messages;
    this.compressions++;

    const systemMsg = messages[0];
    const recentCount = Math.min(12, Math.floor(messages.length * 0.3));
    const recentMessages = messages.slice(-recentCount);
    const oldMessages = messages.slice(1, -recentCount);
    const summary = this._summarizeMessages(oldMessages);

    const compressed = [
      systemMsg,
      {
        role: "user",
        content:
          `[CONTEXT COMPRESSION #${this.compressions}]\n` +
          `Previous ${oldMessages.length} messages were compressed.\n\n${summary}\n\n` +
          `Continue from where you left off. Refer to your plan.`
      },
      ...recentMessages,
    ];

    const oldTokens = this.estimatedTokens;
    this.estimateTokens(compressed);
    log.dim(`Context: ~${oldTokens} → ~${this.estimatedTokens} tokens (${compressed.length} msgs)`);

    return compressed;
  }

  _summarizeMessages(messages) {
    const parts = [];
    let planText = "";
    let lastAssistant = "";
    const toolResults = [];
    const files = new Set();

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (msg.role === "assistant" && content) {
        lastAssistant = content;
        if (content.includes("PLAN:") || content.includes("📋")) planText = content;
      }
      if (msg.role === "tool" && content) {
        toolResults.push(content.split("\n")[0].slice(0, 150));
      }
      const fileMatches = content.match(/(?:\/[\w.-]+)+\.\w+/g) || [];
      fileMatches.forEach(f => files.add(f));
    }

    if (planText) parts.push(`## Plan:\n${planText.slice(0, 1000)}`);
    if (toolResults.length > 0) {
      parts.push(`## Tools (${toolResults.length}):\n${toolResults.slice(-10).map(r => `- ${r}`).join("\n")}`);
    }
    if (files.size > 0) parts.push(`## Files: ${[...files].join(", ")}`);
    if (lastAssistant && !planText) parts.push(`## Last state:\n${lastAssistant.slice(0, 500)}`);

    return parts.join("\n\n") || "No significant content.";
  }
}

// ─── Diff Tracker ───────────────────────────────────────────────────────────

class DiffTracker {
  constructor() {
    this.filesCreated = [];
    this.filesModified = [];
    this.commandsRun = [];
    this.snapshots = new Map();
  }

  snapshotFile(filePath) {
    const resolved = path.resolve(filePath);
    if (this.snapshots.has(resolved)) return;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        this.snapshots.set(resolved, fs.readFileSync(resolved, "utf8"));
      } else {
        this.snapshots.set(resolved, null);
      }
    } catch { /* ignore */ }
  }

  trackWrite(filePath) {
    const resolved = path.resolve(filePath);
    this.snapshotFile(resolved);
    const original = this.snapshots.get(resolved);
    if (original === null || original === undefined) {
      if (!this.filesCreated.includes(resolved)) this.filesCreated.push(resolved);
    } else {
      if (!this.filesModified.includes(resolved)) this.filesModified.push(resolved);
    }
  }

  trackCommand(cmd) {
    this.commandsRun.push({ cmd: cmd.slice(0, 200), time: Date.now() });
  }

  getSummary() {
    const parts = [];
    const cwd = process.cwd();
    if (this.filesCreated.length > 0) {
      parts.push(`📄 Created (${this.filesCreated.length}): ${this.filesCreated.map(f => path.relative(cwd, f)).join(", ")}`);
    }
    if (this.filesModified.length > 0) {
      parts.push(`✏️  Modified (${this.filesModified.length}): ${this.filesModified.map(f => path.relative(cwd, f)).join(", ")}`);
    }
    if (this.commandsRun.length > 0) {
      parts.push(`🖥  Commands (${this.commandsRun.length}): ${this.commandsRun.map(c => c.cmd.slice(0, 60)).join("; ")}`);
    }
    return parts.join("\n") || "No changes tracked.";
  }

  getTotalChanges() {
    return this.filesCreated.length + this.filesModified.length;
  }
}

// ─── Recovery Strategy ──────────────────────────────────────────────────────

class RecoveryStrategy {
  constructor() {
    this.errorHistory = [];
    this.retryMap = new Map();
    this.maxRetriesPerTool = 3;
    this.backoffMs = 2000;
  }

  recordError(error, toolName, iteration) {
    this.errorHistory.push({
      error: error.message || String(error),
      tool: toolName, iteration,
      time: Date.now(),
    });
    const count = (this.retryMap.get(toolName) || 0) + 1;
    this.retryMap.set(toolName, count);
  }

  shouldRetry(toolName) {
    return (this.retryMap.get(toolName) || 0) < this.maxRetriesPerTool;
  }

  getBackoffMs(toolName) {
    const count = this.retryMap.get(toolName) || 0;
    return this.backoffMs * Math.pow(2, Math.max(0, count - 1));
  }

  isApiError(error) {
    const msg = error.message || String(error);
    return /429|rate|500|502|503|timeout|ECONNRESET|fetch failed|socket/i.test(msg);
  }

  getRecoveryHint(error) {
    const msg = error.message || String(error);
    if (/429|rate/i.test(msg))              return "Rate limited — backoff";
    if (/500|502|503/i.test(msg))           return "Server error — retrying";
    if (/timeout/i.test(msg))               return "Timeout — retrying";
    if (/context.?length|token/i.test(msg)) return "Context overflow — compressing";
    return "Unknown error — recovering";
  }

  getErrorSummary() {
    if (this.errorHistory.length === 0) return "No errors";
    const grouped = {};
    for (const e of this.errorHistory) {
      const key = e.tool || "api";
      grouped[key] = (grouped[key] || 0) + 1;
    }
    return Object.entries(grouped).map(([k, v]) => `${k}:${v}`).join(", ");
  }
}

// ─── Phase Detector ─────────────────────────────────────────────────────────

function detectPhase(content) {
  if (!content) return null;
  const upper = content.toUpperCase();
  if (upper.includes("AUTOPILOT COMPLETE") || upper.includes("АВТОПИЛОТ ЗАВЕРШЁН")) return PHASE.COMPLETE;
  if (content.includes("📋 PLAN:") || /^#+\s*PLAN/im.test(content)) return PHASE.PLAN;
  if (content.includes("🔍 VERIFY:") || /VERIF(Y|ICATION)/i.test(content)) return PHASE.VERIFY;
  if (content.includes("🔧 RECOVER:") || /RECOVER(Y)?:/i.test(content)) return PHASE.RECOVER;
  if (content.includes("⚡ STEP") || /STEP\s+\d/i.test(content)) return PHASE.EXECUTE;
  return null;
}

// ─── Tracked Tool Execution ─────────────────────────────────────────────────

async function executeToolTracked(name, args, cfg, tracker, recovery, iteration) {
  // Pre-track
  if ((name === "write_file" || name === "patch_file") && args.path) {
    tracker.snapshotFile(args.path);
  }
  if (name === "run_shell" && args.cmd) {
    tracker.trackCommand(args.cmd);
  }

  try {
    const result = await executeTool(name, args, cfg);

    // Post-track successful writes
    if ((name === "write_file" || name === "patch_file") && args.path && !result.includes("❌")) {
      tracker.trackWrite(args.path);
    }

    return result;
  } catch (e) {
    recovery.recordError(e, name, iteration);

    if (recovery.shouldRetry(name)) {
      const backoff = recovery.getBackoffMs(name);
      log.warn(`${recovery.getRecoveryHint(e)} (retry in ${backoff / 1000}s)`);
      await new Promise(r => setTimeout(r, backoff));
      try {
        return await executeTool(name, args, cfg);
      } catch (e2) {
        return `❌ Tool error after retry: ${e2.message}`;
      }
    }

    return `❌ Tool error (max retries): ${e.message}`;
  }
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────

function printToolCallBlock(calls) {
  const count = calls.length;
  console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}Tools${C.reset} ${MUTED}(${count} call${count > 1 ? "s" : ""})${C.reset}`);
}

function printToolExecution(name, args, index, total) {
  const argsStr = typeof args === "string" ? args : JSON.stringify(args);
  const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
  const counter = total > 1 ? `${MUTED}[${index + 1}/${total}]${C.reset} ` : "";
  console.log(`  ${TOOL_CLR}┃${C.reset} ${counter}${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);
}

function printToolResult(result, maxLines = 5) {
  if (!result) return;
  const lines = result.split("\n");
  const show = lines.slice(0, maxLines);
  for (const line of show) {
    console.log(`  ${MUTED}┃${C.reset}   ${TEXT_DIM}${line.slice(0, COLS - 8)}${C.reset}`);
  }
  if (lines.length > maxLines) {
    console.log(`  ${MUTED}┃${C.reset}   ${MUTED}… +${lines.length - maxLines} more lines${C.reset}`);
  }
}

function printStatusBar(ap) {
  const elapsed = formatDuration(Date.now() - ap.startTime);
  const barWidth = 20;
  const filled = Math.round((ap.iteration / ap.maxIterations) * barWidth);
  const empty = barWidth - filled;
  const bar = `${AUTO_CLR}${"━".repeat(filled)}${MUTED}${"━".repeat(empty)}${C.reset}`;
  const pct = Math.round((ap.iteration / ap.maxIterations) * 100);

  const phaseIcon = PHASE_ICONS[ap.currentPhase] || "▸";
  const phaseColor = PHASE_COLORS[ap.currentPhase] || MUTED;

  const parts = [
    `${bar} ${AUTO_CLR}${pct}%${C.reset}`,
    `${phaseColor}${phaseIcon} ${ap.currentPhase || "init"}${C.reset}`,
    `${MUTED}i${TEXT}${ap.iteration}${MUTED}/${ap.maxIterations}${C.reset}`,
    `${TOOL_CLR}⚡${ap.toolCalls}${C.reset}`,
    `${ap.errors > 0 ? ERROR : MUTED}✗${ap.errors}${C.reset}`,
    `${MUTED}Δ${ap.diffTracker.getTotalChanges()}${C.reset}`,
    `${TEXT_DIM}${elapsed}${C.reset}`,
  ];

  console.log(`\n  ${parts.join(`  ${MUTED}·${C.reset}  `)}`);
}

function printCompactResponse(content, phase, iteration) {
  if (!content || content.trim().length === 0) return;
  const phaseColor = PHASE_COLORS[phase] || AI_CLR;
  const phaseIcon = PHASE_ICONS[phase] || "💭";

  console.log("");
  console.log(`  ${phaseColor}${C.bold}${phaseIcon} Assistant${C.reset} ${MUTED}[iter ${iteration}]${C.reset}`);

  const output = renderMD(content).trim();
  for (const line of output.split("\n")) {
    console.log(`  ${line}`);
  }
}

// ─── Main Autopilot Class ───────────────────────────────────────────────────

class Autopilot {
  constructor(cfg, messages, saveCallback) {
    this.cfg = cfg;
    this.messages = messages;
    this.saveCallback = saveCallback;
    this.running = false;
    this.aborted = false;
    this.iteration = 0;
    this.errors = 0;
    this.totalTokens = 0;
    this.toolCalls = 0;
    this.startTime = 0;
    this.logEntries = [];
    this.currentPhase = PHASE.PLAN;
    this.planText = "";

    this.contextManager = new ContextManager(cfg.autopilot?.max_context_tokens || 120000);
    this.diffTracker = new DiffTracker();
    this.recovery = new RecoveryStrategy();

    const apCfg = cfg.autopilot || {};
    this.maxIterations = apCfg.max_iterations || 50;
    this.maxErrors = apCfg.max_errors || 5;
    this.retryDelay = apCfg.retry_delay_ms || 2000;
    this.saveLog = apCfg.save_log !== false;
    this.verbose = apCfg.verbose !== false;

    this.lastToolCallIteration = 0;
    this.stallThreshold = 3;
    this.nudgeCount = 0;
    this.maxNudges = 5;
  }

  abort() {
    this.aborted = true;
    this.running = false;
  }

  _log(type, msg) {
    this.logEntries.push({
      time: Date.now(),
      iteration: this.iteration,
      phase: this.currentPhase,
      type,
      msg: typeof msg === "string" ? msg.slice(0, 2000) : JSON.stringify(msg).slice(0, 2000),
    });
  }

  _printHeader(task) {
    console.log("");
    const lines = [
      `${AUTO_CLR}${C.bold}AUTOPILOT ENGAGED${C.reset}`,
      ``,
      `${MUTED}Task:${C.reset} ${TEXT}${task.slice(0, 120)}${task.length > 120 ? "…" : ""}${C.reset}`,
      ``,
      `${MUTED}Model:${C.reset}        ${ACCENT}${this.cfg.model}${C.reset}`,
      `${MUTED}Max iters:${C.reset}    ${TEXT}${this.maxIterations}${C.reset}`,
      `${MUTED}Max errors:${C.reset}   ${TEXT}${this.maxErrors}${C.reset}`,
      `${MUTED}Auto-confirm:${C.reset} ${SUCCESS}ON${C.reset}`,
      ``,
      `${TEXT_DIM}Press ${C.bold}Ctrl+C${C.reset}${TEXT_DIM} to stop gracefully${C.reset}`,
    ];
    console.log(box(lines.join("\n"), { title: "🤖 AUTOPILOT", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }));
    console.log("");
  }

  _printSummary(reason) {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const diffSummary = this.diffTracker.getSummary();
    const errorSummary = this.recovery.getErrorSummary();

    const lines = [
      `${C.bold}Status:${C.reset}       ${reason}`,
      `${C.bold}Iterations:${C.reset}   ${this.iteration} / ${this.maxIterations}`,
      `${C.bold}Tool calls:${C.reset}   ${this.toolCalls}`,
      `${C.bold}Errors:${C.reset}       ${this.errors}${this.errors > 0 ? ` (${errorSummary})` : ""}`,
      `${C.bold}Tokens:${C.reset}       ~${this.totalTokens.toLocaleString()}`,
      `${C.bold}Compressions:${C.reset} ${this.contextManager.compressions}`,
      `${C.bold}Duration:${C.reset}     ${elapsed}`,
      ``,
      `${C.bold}Changes:${C.reset}`,
      ...diffSummary.split("\n").map(l => `  ${l}`),
    ];

    if (this.planText) {
      const preview = this.planText.split("\n").slice(0, 8).join("\n");
      lines.push(``, `${C.bold}Original Plan:${C.reset}`);
      lines.push(...preview.split("\n").map(l => `  ${TEXT_DIM}${l}${C.reset}`));
    }

    console.log("");
    console.log(box(lines.join("\n"), { title: "🤖 AUTOPILOT SUMMARY", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }));
    console.log("");
  }

  _saveLogFile() {
    if (!this.saveLog || this.logEntries.length === 0) return;
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(LOG_DIR, `autopilot-${ts}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        version: 2,
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: formatDuration(Date.now() - this.startTime),
        iterations: this.iteration,
        toolCalls: this.toolCalls,
        errors: this.errors,
        totalTokens: this.totalTokens,
        model: this.cfg.model,
        phases: this._getPhaseTimeline(),
        changes: {
          created: this.diffTracker.filesCreated.map(f => path.relative(process.cwd(), f)),
          modified: this.diffTracker.filesModified.map(f => path.relative(process.cwd(), f)),
          commands: this.diffTracker.commandsRun.length,
        },
        compressions: this.contextManager.compressions,
        errorSummary: this.recovery.getErrorSummary(),
        entries: this.logEntries,
      }, null, 2));
      log.dim(`Log saved: ${logFile}`);
    } catch (e) { log.dim(`Log save failed: ${e.message}`); }
  }

  _getPhaseTimeline() {
    const phases = [];
    let cur = null;
    for (const entry of this.logEntries) {
      if (entry.phase !== cur) {
        phases.push({ phase: entry.phase, iteration: entry.iteration, time: entry.time });
        cur = entry.phase;
      }
    }
    return phases;
  }

  _generateNudge() {
    this.nudgeCount++;
    const itersSinceTools = this.iteration - this.lastToolCallIteration;

    if (this.nudgeCount >= this.maxNudges) {
      return `[AUTOPILOT] FINAL WARNING: Nudged ${this.maxNudges} times. ` +
        `Finish NOW with "✅ AUTOPILOT COMPLETE" or use tools. No more text-only responses.`;
    }

    if (itersSinceTools >= this.stallThreshold) {
      return `[AUTOPILOT] ⚠ STALL: No tool calls for ${itersSinceTools} iterations. ` +
        `Use tools NOW or write "✅ AUTOPILOT COMPLETE" if done.`;
    }

    if (this.currentPhase === PHASE.PLAN) {
      return `[AUTOPILOT] Plan created. Now EXECUTE: use tools (patch_file, run_shell, grep_search, etc.)`;
    }

    return `[AUTOPILOT] Continue. Progress: ${this.toolCalls} tools, ${this.diffTracker.getTotalChanges()} changes. ` +
      `If done → verify → "✅ AUTOPILOT COMPLETE". If not → use tools.`;
  }

  _manageContext() {
    if (this.contextManager.needsCriticalCompression(this.messages)) {
      log.warn("Context critical — compressing");
      this.messages = this.contextManager.compress(this.messages);
      this._log("compression", `Critical #${this.contextManager.compressions}`);
      return true;
    }
    if (this.contextManager.needsCompression(this.messages)) {
      log.dim("Context growing — compressing");
      this.messages = this.contextManager.compress(this.messages);
      this._log("compression", `#${this.contextManager.compressions}`);
      return true;
    }
    return false;
  }

  async _processToolCalls(msg) {
    const calls = msg.tool_calls;
    this.toolCalls += calls.length;
    this.lastToolCallIteration = this.iteration;
    this.messages.push(msg);

    printToolCallBlock(calls);

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const name = call.function.name;
      let args = {};
      try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

      printToolExecution(name, args, i, calls.length);
      this._log("tool_call", `${name}: ${JSON.stringify(args).slice(0, 300)}`);

      let result;
      try {
        result = await executeToolTracked(name, args, this.cfg, this.diffTracker, this.recovery, this.iteration);
      } catch (e) {
        result = `❌ Tool error: ${e.message}`;
        this.errors++;
        this.recovery.recordError(e, name, this.iteration);
        this._log("tool_error", `${name}: ${e.message}`);
      }

      if (this.verbose) printToolResult(result, 4);

      this._log("tool_result", `${name}: ${(result || "").slice(0, 500)}`);
      this.messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }

    console.log(`  ${TOOL_CLR}┃${C.reset} ${MUTED}done${C.reset}`);
  }

  _processTextResponse(msg) {
    const content = msg.content || "";
    this.messages.push(msg);

    const detected = detectPhase(content);
    if (detected && detected !== this.currentPhase) {
      this._log("phase_change", `${this.currentPhase} → ${detected}`);
      this.currentPhase = detected;
      if (detected === PHASE.PLAN) this.planText = content;
    }

    printCompactResponse(content, this.currentPhase, this.iteration);
    return detected === PHASE.COMPLETE;
  }

  // ─── Main Loop ────────────────────────────────────────────────────────

  async run(task) {
    this.running = true;
    this.aborted = false;
    this.startTime = Date.now();
    this.iteration = 0;
    this.errors = 0;
    this.totalTokens = 0;
    this.toolCalls = 0;
    this.logEntries = [];
    this.currentPhase = PHASE.PLAN;
    this.planText = "";
    this.nudgeCount = 0;
    this.lastToolCallIteration = 0;

    this.diffTracker = new DiffTracker();
    this.recovery = new RecoveryStrategy();
    this.contextManager = new ContextManager(this.cfg.autopilot?.max_context_tokens || 120000);

    const originalSystem = this.messages[0]?.content || "";
    this.messages[0] = { role: "system", content: originalSystem + AUTOPILOT_SYSTEM_SUFFIX };

    this.messages.push({
      role: "user",
      content: [
        `[AUTOPILOT TASK]`, ``, task, ``,
        `---`,
        `CWD: ${process.cwd()}`,
        `Time: ${new Date().toISOString()}`,
        ``,
        `Execute autonomously. Start with 📋 PLAN: → then EXECUTE → VERIFY → COMPLETE.`,
      ].join("\n"),
    });

    const origAutoYes = this.cfg.auto_yes;
    this.cfg.auto_yes = true;

    this._printHeader(task);
    this._log("start", task);

    let finalReason = `${SUCCESS}✓ Completed${C.reset}`;
    let apiRetries = 0;
    const maxApiRetries = 3;

    try {
      while (this.iteration < this.maxIterations && !this.aborted) {
        this.iteration++;
        printStatusBar(this);
        this._manageContext();

        // ── API Call ──
        let data;
        const spinner = new Spinner(`${this.currentPhase} (iter ${this.iteration})`);
        try {
          spinner.start();
          data = await callApi(this.messages, this.cfg);
          spinner.stop();
          apiRetries = 0;
        } catch (e) {
          spinner.stop();
          this.errors++;
          this._log("api_error", e.message);

          // Context overflow → compress
          if (e.isContextError || /context.?length|token/i.test(e.message || "")) {
            log.warn("Context overflow — compressing…");
            this.messages = this.contextManager.compress(this.messages);
            this.iteration--;
            continue;
          }

          if (this.recovery.isApiError(e) && apiRetries < maxApiRetries) {
            apiRetries++;
            const backoff = this.retryDelay * Math.pow(2, apiRetries - 1);
            log.warn(`${this.recovery.getRecoveryHint(e)} (${apiRetries}/${maxApiRetries}, ${backoff / 1000}s)`);
            await new Promise(r => setTimeout(r, backoff));
            this.iteration--;
            continue;
          }

          if (this.errors >= this.maxErrors) {
            finalReason = `${ERROR}✗ Too many errors (${this.errors})${C.reset}`;
            break;
          }

          log.err(`Iter ${this.iteration}: ${e.message}`);
          await new Promise(r => setTimeout(r, this.retryDelay));
          this.iteration--;
          continue;
        }

        if (data.usage) this.totalTokens += data.usage.total_tokens || 0;

        const msg = data.choices?.[0]?.message;
        if (!msg) { log.warn("Empty API response"); this.iteration--; continue; }

        // ── Tool Calls ──
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          await this._processToolCalls(msg);
          continue;
        }

        // ── Text Response ──
        const isComplete = this._processTextResponse(msg);

        if (data.usage) {
          const u = data.usage;
          log.dim(`tokens: ${u.prompt_tokens}→${u.completion_tokens} (${u.total_tokens})`);
        }

        this.saveCallback();

        if (isComplete) {
          finalReason = `${SUCCESS}✓ Task completed${C.reset}`;
          this._log("complete", "Done");
          break;
        }

        // ── Nudge ──
        const itersSinceTools = this.iteration - this.lastToolCallIteration;
        if (itersSinceTools >= 2) {
          const nudge = this._generateNudge();
          this.messages.push({ role: "user", content: nudge });
          this._log("nudge", nudge.slice(0, 200));

          if (this.nudgeCount >= this.maxNudges) {
            finalReason = `${WARNING}▲ Stalled — max nudges${C.reset}`;
            this._log("stall", "Max nudges");
            break;
          }
        }
      }

      if (this.aborted) {
        finalReason = `${WARNING}▲ Aborted (Ctrl+C)${C.reset}`;
        this._log("abort", "User aborted");
      } else if (this.iteration >= this.maxIterations && !/completed/i.test(finalReason)) {
        finalReason = `${WARNING}▲ Max iterations (${this.maxIterations})${C.reset}`;
        this._log("limit", "Max iterations");
      }

    } catch (e) {
      finalReason = `${ERROR}✗ Fatal: ${e.message}${C.reset}`;
      this._log("fatal", e.message);
      log.err(`Fatal: ${e.message}`);
    } finally {
      this.cfg.auto_yes = origAutoYes;
      this.messages[0] = { role: "system", content: originalSystem };
      this.running = false;
    }

    // Trigger
    try {
      const cmd = this.cfg.autopilot?.trigger_cmd || "";
      if (cmd && /completed/i.test(finalReason) && !this.aborted) {
        log.auto(`Trigger: ${cmd}`);
        await runShell(cmd, true);
      }
    } catch (e) { log.err(`Trigger failed: ${e.message}`); }

    this._printSummary(finalReason);
    this._saveLogFile();
    this.saveCallback();

    return {
      iterations: this.iteration,
      toolCalls: this.toolCalls,
      errors: this.errors,
      tokens: this.totalTokens,
      duration: Date.now() - this.startTime,
      filesCreated: this.diffTracker.filesCreated.length,
      filesModified: this.diffTracker.filesModified.length,
      compressions: this.contextManager.compressions,
      phases: this._getPhaseTimeline(),
    };
  }
}


export { Autopilot, AUTOPILOT_SYSTEM_SUFFIX, ContextManager, DiffTracker, RecoveryStrategy };