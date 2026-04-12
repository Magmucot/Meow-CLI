// ═══════════════════════════════════════════════════════════════════════════
// smart/cicd.js — CI/CD Integration & Self-Healing
// GitHub Actions, pipeline monitoring, auto-revert
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, ERROR, WARNING } from "../ui.js";
import { callApi } from "../api.js";

// ─── Git Operations (no external deps) ──────────────────────────────────────

function git(cmd, cwd = process.cwd()) {
  try { return execSync(`git ${cmd}`, { encoding: "utf8", cwd, timeout: 15000 }).trim(); }
  catch (e) { return e.stdout?.trim() || e.stderr?.trim() || e.message; }
}

function isGitRepo() {
  try { execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" }); return true; }
  catch { return false; }
}

// ─── Git Tools for AI Agent ─────────────────────────────────────────────────

function gitDiff(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { staged, file } = args;
  let cmd = staged ? "diff --cached" : "diff";
  if (file) cmd += ` -- ${file}`;
  const output = git(cmd);
  return output || "ℹ No changes";
}

function gitLog(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { count = 10, file, oneline = true } = args;
  let cmd = `log -${count}`;
  if (oneline) cmd += " --oneline --decorate";
  if (file) cmd += ` -- ${file}`;
  return git(cmd) || "ℹ No commits";
}

function gitBranch(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { create, checkout, name } = args;
  if (create && name) return git(`checkout -b ${name}`);
  if (checkout && name) return git(`checkout ${name}`);
  return git("branch -a --no-color");
}

function gitCommit(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { message, files } = args;
  if (!message) return "❌ Commit message required";
  if (files && files.length > 0) {
    for (const f of files) git(`add ${f}`);
  } else {
    git("add -A");
  }
  return git(`commit -m ${JSON.stringify(message)}`);
}

function gitStash(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { pop } = args;
  return pop ? git("stash pop") : git("stash");
}

function gitStatus() {
  if (!isGitRepo()) return "❌ Not a git repository";
  return git("status --short") || "ℹ Working tree clean";
}

// ─── CI/CD Pipeline Detection ───────────────────────────────────────────────

function detectCIProvider() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, ".github/workflows"))) return "github_actions";
  if (fs.existsSync(path.join(cwd, ".gitlab-ci.yml"))) return "gitlab_ci";
  if (fs.existsSync(path.join(cwd, ".circleci/config.yml"))) return "circleci";
  if (fs.existsSync(path.join(cwd, "Jenkinsfile"))) return "jenkins";
  if (fs.existsSync(path.join(cwd, "bitbucket-pipelines.yml"))) return "bitbucket";
  if (fs.existsSync(path.join(cwd, ".travis.yml"))) return "travis";
  return null;
}

function listWorkflows() {
  const cwd = process.cwd();
  const provider = detectCIProvider();
  if (provider !== "github_actions") return { provider, workflows: [] };
  const dir = path.join(cwd, ".github/workflows");
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
    return {
      provider,
      workflows: files.map(f => {
        try {
          const content = fs.readFileSync(path.join(dir, f), "utf8");
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          return { file: f, name: nameMatch?.[1]?.trim() || f, path: path.join(dir, f) };
        } catch { return { file: f, name: f, path: path.join(dir, f) }; }
      })
    };
  } catch { return { provider, workflows: [] }; }
}

// ─── GitHub Actions Generator ───────────────────────────────────────────────

async function generateWorkflow(cfg, description) {
  const cwd = process.cwd();
  const projectType = detectProjectType();

  const systemPrompt = [
    "You are a DevOps expert. Generate a GitHub Actions workflow YAML file.",
    "Return ONLY the valid YAML content, no markdown fences, no explanation.",
    `Project type: ${projectType}`,
    `Directory: ${cwd}`,
  ].join("\n");

  try {
    const data = await callApi([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Create a GitHub Actions workflow for: ${description}` },
    ], cfg);

    const yaml = (data.choices?.[0]?.message?.content || "")
      .replace(/```ya?ml\n?/g, "").replace(/```/g, "").trim();

    if (!yaml.includes("on:") || !yaml.includes("jobs:")) {
      return { success: false, error: "Generated YAML doesn't look valid" };
    }

    return { success: true, yaml, projectType };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function saveWorkflow(name, yaml) {
  const dir = path.join(process.cwd(), ".github/workflows");
  fs.mkdirSync(dir, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const filePath = path.join(dir, `${safeName}.yml`);
  fs.writeFileSync(filePath, yaml, "utf8");
  return filePath;
}

// ─── Self-Healing ───────────────────────────────────────────────────────────

class SelfHealer {
  constructor(cfg) {
    this.cfg = cfg;
    this.maxAttempts = 3;
    this.revertOnFailure = true;
  }

  async checkAndHeal() {
    if (!isGitRepo()) return { healed: false, reason: "Not a git repo" };

    const testResult = this._runTests();
    if (testResult.passed) return { healed: false, reason: "Tests pass — nothing to heal" };

    log.warn(`Tests failing: ${testResult.output.slice(0, 200)}`);

    const lastCommitHash = git("rev-parse HEAD").trim();

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      log.info(`Heal attempt ${attempt}/${this.maxAttempts}...`);

      const success = await this._attemptFix(testResult.output, attempt);
      if (success) {
        const retest = this._runTests();
        if (retest.passed) {
          log.ok("Self-healing successful — tests pass");
          gitCommit({ message: `fix: auto-heal test failures (attempt ${attempt})` });
          return { healed: true, attempt };
        }
      }
    }

    if (this.revertOnFailure) {
      log.warn("Max attempts reached — reverting to last good state");
      git(`reset --hard ${lastCommitHash}`);
      return { healed: false, reason: "Reverted after max attempts", reverted: true };
    }

    return { healed: false, reason: "Max attempts reached" };
  }

  _runTests() {
    try {
      const output = execSync("npm test 2>&1", { encoding: "utf8", timeout: 60000 });
      return { passed: true, output };
    } catch (e) {
      return { passed: false, output: (e.stdout || "") + (e.stderr || "") };
    }
  }

  async _attemptFix(errorOutput, attempt) {
    try {
      const data = await callApi([
        { role: "system", content: "You are a debugging expert. Analyze the test failure and suggest a fix. Use patch_file tool to apply the fix." },
        { role: "user", content: `Test failure (attempt ${attempt}):\n${errorOutput.slice(0, 2000)}` },
      ], { ...this.cfg, auto_yes: true });

      const msg = data.choices?.[0]?.message;
      if (msg?.tool_calls) {
        const { executeTool } = await import("../tools.js");
        for (const call of msg.tool_calls) {
          const name = call.function.name;
          const args = JSON.parse(call.function.arguments || "{}");
          await executeTool(name, args, this.cfg);
        }
        return true;
      }
      return false;
    } catch { return false; }
  }
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function detectProjectType() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) return "node";
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) return "rust";
  if (fs.existsSync(path.join(cwd, "go.mod"))) return "go";
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return "python";
  return "unknown";
}

// ─── CI Tool Implementation ─────────────────────────────────────────────────

async function ciTool(args, cfg) {
  const { action } = args;
  switch (action) {
    case "status": return JSON.stringify(listWorkflows(), null, 2);
    case "generate": {
      const result = await generateWorkflow(cfg, args.description || "CI pipeline");
      if (!result.success) return `❌ ${result.error}`;
      const filePath = saveWorkflow(args.name || "ci", result.yaml);
      return `✅ Workflow saved: ${filePath}\n\n${result.yaml}`;
    }
    case "heal": {
      const healer = new SelfHealer(cfg);
      const result = await healer.checkAndHeal();
      return JSON.stringify(result, null, 2);
    }
    default: return `❌ Unknown CI action: ${action}. Use: status, generate, heal`;
  }
}

// ─── Git + CI Tool Definitions for AI ───────────────────────────────────────

const GIT_TOOLS = [
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show git diff (staged or unstaged)",
      parameters: { type: "object", properties: {
        staged: { type: "boolean" }, file: { type: "string" },
      }}
    }
  },
  {
    type: "function",
    function: {
      name: "git_log",
      description: "Show recent git commits",
      parameters: { type: "object", properties: {
        count: { type: "number", description: "Number of commits (default 10)" },
        file: { type: "string" },
      }}
    }
  },
  {
    type: "function",
    function: {
      name: "git_commit",
      description: "Stage files and commit with message",
      parameters: { type: "object", properties: {
        message: { type: "string" },
        files: { type: "array", items: { type: "string" } },
      }, required: ["message"]}
    }
  },
  {
    type: "function",
    function: {
      name: "git_branch",
      description: "List, create, or checkout branches",
      parameters: { type: "object", properties: {
        create: { type: "boolean" }, checkout: { type: "boolean" }, name: { type: "string" },
      }}
    }
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Show working tree status",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "ci_pipeline",
      description: "Manage CI/CD pipelines. Actions: status (list workflows), generate (create workflow), heal (self-healing test fix)",
      parameters: { type: "object", properties: {
        action: { type: "string", enum: ["status", "generate", "heal"] },
        description: { type: "string" },
        name: { type: "string" },
      }, required: ["action"]}
    }
  },
];

export {
  gitDiff, gitLog, gitBranch, gitCommit, gitStash, gitStatus,
  detectCIProvider, listWorkflows, generateWorkflow, saveWorkflow,
  SelfHealer, ciTool, GIT_TOOLS,
};
