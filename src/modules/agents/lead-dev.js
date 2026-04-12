// ═══════════════════════════════════════════════════════════════════════════
// agents/lead-dev.js — AI Lead Developer Mode (Autopilot 2.0)
// Self-directed continuous improvement with quality gates
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { callApi } from "../api.js";
import { executeTool, grepSearch, listDir, readFile } from "../tools.js";
import { log, C, ACCENT, ACCENT2, MUTED, TEXT, TEXT_DIM, SUCCESS, ERROR, WARNING, AUTO_CLR, box, COLS } from "../ui.js";
import { getModelPrice } from "../cost-tracker.js";
import { formatDuration } from "../utils.js";
import { getMemoryStore } from "../memory/rag.js";
import { DATA_DIR } from "../config.js";

const LEAD_LOG_DIR = path.join(DATA_DIR, "lead-dev-logs");

const QualityGate = {
  LINT: "lint",
  TEST: "test",
  BUILD: "build",
  TYPE_CHECK: "type_check",
};

// ─── Project Analyzer ───────────────────────────────────────────────────────

class ProjectAnalyzer {
  constructor() {
    this.cwd = process.cwd();
    this.projectType = null;
    this.testCmd = null;
    this.lintCmd = null;
    this.buildCmd = null;
    this.typeCheckCmd = null;
  }

  detect() {
    this.projectType = this._detectProjectType();
    this.testCmd = this._findCommand("test");
    this.lintCmd = this._findCommand("lint");
    this.buildCmd = this._findCommand("build");
    this.typeCheckCmd = this._findTypeCheck();
    return this;
  }

  _detectProjectType() {
    if (fs.existsSync(path.join(this.cwd, "package.json"))) return "node";
    if (fs.existsSync(path.join(this.cwd, "Cargo.toml"))) return "rust";
    if (fs.existsSync(path.join(this.cwd, "go.mod"))) return "go";
    if (fs.existsSync(path.join(this.cwd, "pyproject.toml")) ||
        fs.existsSync(path.join(this.cwd, "requirements.txt"))) return "python";
    return "unknown";
  }

  _findCommand(name) {
    try {
      if (this.projectType === "node") {
        const pkg = JSON.parse(fs.readFileSync(path.join(this.cwd, "package.json"), "utf8"));
        if (pkg.scripts?.[name]) return `npm run ${name}`;
      }
      if (this.projectType === "python") {
        if (name === "test") return "python -m pytest";
        if (name === "lint") return "python -m flake8 .";
      }
      if (this.projectType === "rust") {
        if (name === "test") return "cargo test";
        if (name === "build") return "cargo build";
        if (name === "lint") return "cargo clippy";
      }
      if (this.projectType === "go") {
        if (name === "test") return "go test ./...";
        if (name === "build") return "go build ./...";
        if (name === "lint") return "golangci-lint run";
      }
    } catch {}
    return null;
  }

  _findTypeCheck() {
    if (this.projectType === "node") {
      if (fs.existsSync(path.join(this.cwd, "tsconfig.json"))) return "npx tsc --noEmit";
    }
    if (this.projectType === "rust") return "cargo check";
    return null;
  }

  runGate(gate) {
    const commands = {
      [QualityGate.LINT]: this.lintCmd,
      [QualityGate.TEST]: this.testCmd,
      [QualityGate.BUILD]: this.buildCmd,
      [QualityGate.TYPE_CHECK]: this.typeCheckCmd,
    };
    const cmd = commands[gate];
    if (!cmd) return { gate, passed: true, skipped: true, output: "No command configured" };
    try {
      const output = execSync(cmd, { encoding: "utf8", timeout: 60000, cwd: this.cwd }).trim();
      return { gate, passed: true, skipped: false, output: output.slice(0, 1000) };
    } catch (e) {
      return { gate, passed: false, skipped: false, output: (e.stdout || e.stderr || e.message || "").slice(0, 1000) };
    }
  }

  runAllGates() {
    return [QualityGate.TYPE_CHECK, QualityGate.LINT, QualityGate.TEST, QualityGate.BUILD]
      .map(g => this.runGate(g));
  }

  getSummary() {
    return {
      type: this.projectType,
      test: !!this.testCmd,
      lint: !!this.lintCmd,
      build: !!this.buildCmd,
      typeCheck: !!this.typeCheckCmd,
    };
  }
}

// ─── Task Suggester ─────────────────────────────────────────────────────────

const TASK_CATEGORIES = [
  { id: "fix_bugs", label: "Fix bugs & errors", priority: 1, icon: "🐛" },
  { id: "add_tests", label: "Improve test coverage", priority: 2, icon: "🧪" },
  { id: "refactor", label: "Refactor & clean up", priority: 3, icon: "♻️" },
  { id: "docs", label: "Update documentation", priority: 4, icon: "📝" },
  { id: "security", label: "Security improvements", priority: 5, icon: "🔒" },
  { id: "performance", label: "Optimize performance", priority: 6, icon: "⚡" },
  { id: "deps", label: "Update dependencies", priority: 7, icon: "📦" },
];

async function suggestNextTasks(cfg, analyzer, context = "") {
  const cwd = process.cwd();
  const structure = listDir(cwd, true);
  const gateResults = analyzer.runAllGates();
  const failedGates = gateResults.filter(g => !g.passed && !g.skipped);

  const memory = getMemoryStore();
  const recentPatterns = memory.search("recent work improvements", { maxResults: 5 });

  const systemPrompt = [
    "You are a senior tech lead analyzing a codebase for improvements.",
    "Based on the project state, suggest 3-5 concrete next tasks.",
    "Return ONLY valid JSON array of objects: {\"task\": \"...\", \"category\": \"...\", \"priority\": 1-5, \"reason\": \"...\", \"files\": [\"...\"]}",
    "Categories: fix_bugs, add_tests, refactor, docs, security, performance, deps",
  ].join("\n");

  const userPrompt = [
    `Project type: ${analyzer.projectType}`,
    `Structure:\n${structure.slice(0, 2000)}`,
    failedGates.length > 0 ? `Failed quality gates:\n${failedGates.map(g => `${g.gate}: ${g.output.slice(0, 300)}`).join("\n")}` : "All quality gates pass",
    context ? `Additional context: ${context}` : "",
    recentPatterns.length > 0 ? `Recent patterns:\n${recentPatterns.map(r => r.memory.content.slice(0, 200)).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const data = await callApi([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { ...cfg, profiles: { ...cfg.profiles, [cfg.profile]: { ...(cfg.profiles[cfg.profile] || {}), temperature: 0.3 } } });

    const content = data.choices?.[0]?.message?.content || "[]";
    const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    log.dim(`Task suggestion failed: ${e.message}`);
    if (failedGates.length > 0) {
      return failedGates.map(g => ({
        task: `Fix ${g.gate} failures`, category: "fix_bugs", priority: 1,
        reason: g.output.slice(0, 200), files: [],
      }));
    }
    return [{ task: "Review codebase for improvements", category: "refactor", priority: 3, reason: "Default task", files: [] }];
  }
}

// ─── Lead Dev Session ───────────────────────────────────────────────────────

class LeadDevSession {
  constructor(cfg, messages, saveCallback) {
    this.cfg = cfg;
    this.messages = messages;
    this.saveCallback = saveCallback;
    this.running = false;
    this.aborted = false;
    this.analyzer = new ProjectAnalyzer().detect();
    this.tasksCompleted = [];
    this.tasksFailed = [];
    this.totalTokens = 0;
    this.totalCost = 0;
    this.startTime = 0;
    this.logEntries = [];
    this.maxCost = cfg.lead_dev?.max_cost_usd || 10.0;
    this.maxTasks = cfg.lead_dev?.max_tasks || 20;
    this.autoMode = false;
  }

  abort() { this.aborted = true; this.running = false; }

  _log(msg) {
    this.logEntries.push({ time: Date.now(), msg: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }

  async run(initialContext = "", options = {}) {
    this.running = true;
    this.aborted = false;
    this.startTime = Date.now();
    this.autoMode = !!options.auto;
    const origAutoYes = this.cfg.auto_yes;

    this._printHeader(initialContext);

    try {
      let round = 0;
      while (round < this.maxTasks && !this.aborted && this.totalCost < this.maxCost) {
        round++;

        // 1. Suggest tasks
        console.log(`\n  ${ACCENT2}${C.bold}🔄 Round ${round}${C.reset} ${MUTED}— Analyzing project...${C.reset}`);

        const context = round === 1 ? initialContext : `Previous: ${this.tasksCompleted.slice(-3).map(t => t.task).join("; ")}`;
        const suggestions = await suggestNextTasks(this.cfg, this.analyzer, context);

        if (!suggestions || suggestions.length === 0) {
          log.ok("No more improvements suggested. Project is in good shape!");
          break;
        }

        // 2. Present options
        this._printSuggestions(suggestions);

        // 3. Get user choice (or auto-pick)
        let selectedTask;
        if (this.autoMode) {
          selectedTask = suggestions[0];
          console.log(`  ${AUTO_CLR}Auto-selecting:${C.reset} ${TEXT}${selectedTask.task}${C.reset}`);
        } else {
          const choice = await this._askUserChoice(suggestions);
          if (choice === null) break;
          if (choice === -1) {
            this.autoMode = true;
            selectedTask = suggestions[0];
            console.log(`  ${AUTO_CLR}Auto-mode enabled.${C.reset}`);
          } else {
            selectedTask = suggestions[choice];
          }
        }

        // 4. Execute task via autopilot
        console.log(`\n  ${ACCENT}${C.bold}⚡ Executing:${C.reset} ${TEXT}${selectedTask.task}${C.reset}`);

        this.cfg.auto_yes = true;
        const result = await this._executeTask(selectedTask);
        this.cfg.auto_yes = origAutoYes;

        // 5. Quality gate check
        const gates = this.analyzer.runAllGates();
        const failed = gates.filter(g => !g.passed && !g.skipped);

        if (failed.length > 0) {
          console.log(`  ${WARNING}⚠ Quality gates failed:${C.reset}`);
          for (const g of failed) {
            console.log(`  ${ERROR}  ✗ ${g.gate}${C.reset}: ${MUTED}${g.output.slice(0, 100)}${C.reset}`);
          }
          this.tasksFailed.push({ ...selectedTask, gates: failed.map(g => g.gate) });
          this._log(`Task failed gates: ${selectedTask.task}`);
        } else {
          console.log(`  ${SUCCESS}✔ All quality gates pass${C.reset}`);
          this.tasksCompleted.push(selectedTask);
          this._log(`Task completed: ${selectedTask.task}`);

          const memory = getMemoryStore();
          memory.recordDecision(selectedTask.task, selectedTask.reason || "lead-dev suggestion");
        }

        // 6. Status
        this._printStatus(round);

        if (!this.autoMode && round < this.maxTasks) {
          const cont = await this._askContinue();
          if (!cont) break;
        }
      }
    } catch (e) {
      log.err(`Lead dev error: ${e.message}`);
      this._log(`Error: ${e.message}`);
    } finally {
      this.cfg.auto_yes = origAutoYes;
      this.running = false;
    }

    this._printSummary();
    this._saveLog();
    this.saveCallback();

    return {
      completed: this.tasksCompleted.length,
      failed: this.tasksFailed.length,
      tokens: this.totalTokens,
      cost: this.totalCost,
      elapsed: Date.now() - this.startTime,
    };
  }

  async _executeTask(task) {
    const { Autopilot } = await import("../autopilot.js");
    const ap = new Autopilot({ ...this.cfg, auto_yes: true, autopilot: { ...this.cfg.autopilot, max_iterations: 20 } },
      [...this.messages], this.saveCallback);

    const taskPrompt = [
      task.task,
      task.files?.length > 0 ? `\nRelevant files: ${task.files.join(", ")}` : "",
      task.reason ? `\nReason: ${task.reason}` : "",
    ].filter(Boolean).join("");

    const result = await ap.run(taskPrompt);
    this.totalTokens += result.tokens || 0;
    const price = getModelPrice(this.cfg.model);
    this.totalCost += (result.tokens * (price.input + price.output) / 2) / 1_000_000;
    return result;
  }

  _printHeader(context) {
    const summary = this.analyzer.getSummary();
    const lines = [
      `${ACCENT2}${C.bold}AI LEAD DEVELOPER${C.reset}`,
      "",
      `${MUTED}Project:${C.reset} ${TEXT}${this.analyzer.projectType}${C.reset}  ${MUTED}CWD:${C.reset} ${TEXT_DIM}${process.cwd()}${C.reset}`,
      `${MUTED}Gates:${C.reset} ${summary.test ? `${SUCCESS}test` : `${MUTED}test`}${C.reset} ${summary.lint ? `${SUCCESS}lint` : `${MUTED}lint`}${C.reset} ${summary.build ? `${SUCCESS}build` : `${MUTED}build`}${C.reset} ${summary.typeCheck ? `${SUCCESS}types` : `${MUTED}types`}${C.reset}`,
      `${MUTED}Budget:${C.reset} $${this.maxCost} ${MUTED}max tasks:${C.reset} ${this.maxTasks}`,
      context ? `\n${MUTED}Focus:${C.reset} ${TEXT}${context.slice(0, 100)}${C.reset}` : "",
      `\n${TEXT_DIM}Press Ctrl+C to stop${C.reset}`,
    ].filter(Boolean);
    console.log("\n" + box(lines.join("\n"), { title: "🎯 LEAD DEV", color: ACCENT2, width: Math.min(COLS - 2, 65) }));
  }

  _printSuggestions(suggestions) {
    console.log(`\n  ${ACCENT2}${C.bold}📋 Suggested Tasks${C.reset}`);
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const cat = TASK_CATEGORIES.find(c => c.id === s.category) || { icon: "▸" };
      console.log(`  ${TEXT}${i + 1}.${C.reset} ${cat.icon} ${TEXT}${s.task}${C.reset}`);
      if (s.reason) console.log(`     ${MUTED}${s.reason.slice(0, 80)}${C.reset}`);
    }
  }

  _askUserChoice(suggestions) {
    return new Promise(resolve => {
      const prompt = `\n  ${TEXT}Choose (1-${suggestions.length}), ${MUTED}'a'=auto, 'q'=quit${C.reset}: `;
      process.stdout.write(prompt);
      const onData = (d) => {
        clearTimeout(timer);
        process.stdin.off("data", onData);
        const answer = d.toString().trim().toLowerCase();
        if (answer === "q" || answer === "quit") resolve(null);
        else if (answer === "a" || answer === "auto") resolve(-1);
        else {
          const num = parseInt(answer, 10);
          resolve(!isNaN(num) && num >= 1 && num <= suggestions.length ? num - 1 : 0);
        }
      };
      const timer = setTimeout(() => { process.stdin.off("data", onData); resolve(0); }, 30000);
      process.stdin.on("data", onData);
    });
  }

  _askContinue() {
    return new Promise(resolve => {
      process.stdout.write(`\n  ${TEXT}Continue? ${MUTED}[Y/n/a(uto)]${C.reset} `);
      const onData = (d) => {
        clearTimeout(timer);
        process.stdin.off("data", onData);
        const answer = d.toString().trim().toLowerCase();
        if (answer === "n" || answer === "no") resolve(false);
        else if (answer === "a" || answer === "auto") { this.autoMode = true; resolve(true); }
        else resolve(true);
      };
      const timer = setTimeout(() => { process.stdin.off("data", onData); resolve(true); }, 15000);
      process.stdin.on("data", onData);
    });
  }

  _printStatus(round) {
    const elapsed = formatDuration(Date.now() - this.startTime);
    console.log(`  ${MUTED}Round ${round} · ✔${this.tasksCompleted.length} ✗${this.tasksFailed.length} · ${this.totalTokens} tokens · $${this.totalCost.toFixed(4)} · ${elapsed}${C.reset}`);
  }

  _printSummary() {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const lines = [
      `${C.bold}Tasks completed:${C.reset} ${SUCCESS}${this.tasksCompleted.length}${C.reset}`,
      `${C.bold}Tasks failed:${C.reset}    ${this.tasksFailed.length > 0 ? ERROR : MUTED}${this.tasksFailed.length}${C.reset}`,
      `${C.bold}Tokens:${C.reset}          ${this.totalTokens.toLocaleString()}`,
      `${C.bold}Cost:${C.reset}            $${this.totalCost.toFixed(4)}`,
      `${C.bold}Duration:${C.reset}        ${elapsed}`,
    ];
    if (this.tasksCompleted.length > 0) {
      lines.push("", `${C.bold}Completed:${C.reset}`);
      for (const t of this.tasksCompleted) lines.push(`  ${SUCCESS}✔${C.reset} ${TEXT_DIM}${t.task}${C.reset}`);
    }
    if (this.tasksFailed.length > 0) {
      lines.push("", `${C.bold}Failed:${C.reset}`);
      for (const t of this.tasksFailed) lines.push(`  ${ERROR}✗${C.reset} ${TEXT_DIM}${t.task} (${t.gates?.join(", ")})${C.reset}`);
    }
    console.log("\n" + box(lines.join("\n"), { title: "🎯 LEAD DEV SUMMARY", color: ACCENT2, width: Math.min(COLS - 2, 65) }));
  }

  _saveLog() {
    try {
      fs.mkdirSync(LEAD_LOG_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      fs.writeFileSync(path.join(LEAD_LOG_DIR, `lead-${ts}.json`), JSON.stringify({
        startTime: new Date(this.startTime).toISOString(),
        completed: this.tasksCompleted, failed: this.tasksFailed,
        tokens: this.totalTokens, cost: this.totalCost,
        duration: Date.now() - this.startTime, entries: this.logEntries,
      }, null, 2));
    } catch {}
  }
}

export { LeadDevSession, ProjectAnalyzer, QualityGate, suggestNextTasks, TASK_CATEGORIES };
