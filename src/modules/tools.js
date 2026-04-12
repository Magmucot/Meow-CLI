// ═══════════════════════════════════════════════════════════════════════════
// tools.js — Meow CLI Tools (with patch_file + grep_search)
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { createTwoFilesPatch } from "diff";
import { exec, execSync } from "child_process";
import { C, WARNING, SUCCESS, ERROR, MUTED, TEXT, TEXT_DIM, log, box, COLS, SHELL_TIMEOUT_MS } from "./ui.js";
import { CONF_FILE, DATA_DIR, UNDO_FILE } from "./config.js";
import { loadUndoState, saveUndoState } from "./persistence.js";
import { callApi } from "./api.js";

// ─── Tool Definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories at the given path. Returns sorted entries with '/' suffix for directories.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path to list" },
          recursive: { type: "boolean", description: "If true, list recursively (max 3 levels deep)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Large files are truncated to 50KB.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
          start_line: { type: "number", description: "Start reading from this line (1-based)" },
          end_line: { type: "number", description: "Stop reading at this line (inclusive)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with the given content. Shows diff for confirmation.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to write" },
          content: { type: "string", description: "Full file content" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "patch_file",
      description: "Apply a targeted edit to a file. Replaces 'old_string' with 'new_string'. Use this instead of write_file when you only need to change part of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to patch" },
          old_string: { type: "string", description: "Exact string to find and replace (must match exactly, including whitespace)" },
          new_string: { type: "string", description: "Replacement string" }
        },
        required: ["path", "old_string", "new_string"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep_search",
      description: "Search for a pattern across files in a directory. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Search pattern (regex supported)" },
          path: { type: "string", description: "Directory or file to search in (default: current dir)" },
          include: { type: "string", description: "File glob pattern to include (e.g. '*.js', '*.py')" },
          max_results: { type: "number", description: "Maximum results to return (default: 50)" }
        },
        required: ["pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_shell",
      description: "Execute a shell command (Bash). Returns stdout, stderr, and exit code.",
      parameters: {
        type: "object",
        properties: {
          cmd: { type: "string", description: "Shell command to execute" }
        },
        required: ["cmd"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "http_request",
      description: "Make an HTTP request and return the response.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
          headers: { type: "object", additionalProperties: { type: "string" } },
          body: { type: "string" },
          timeout_ms: { type: "number" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the internet using DuckDuckGo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          max_results: { type: "number" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "tool_chain",
      description: "Execute a sequence of tools in order. Useful for batch operations.",
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tool: { type: "string" },
                args: { type: "object" }
              },
              required: ["tool"]
            }
          }
        },
        required: ["steps"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Ask the user a question and get a text response.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          default: { type: "string" }
        },
        required: ["question"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "confirm",
      description: "Ask the user for yes/no confirmation.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          default: { type: "boolean" }
        },
        required: ["message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "choose",
      description: "Present options to the user and get their choice.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          default_index: { type: "number" }
        },
        required: ["question", "options"]
      }
    }
  }
];

// ─── Confirmation Dialog ────────────────────────────────────────────────────

async function confirm(action, detail, auto_yes = false) {
  if (auto_yes) return true;
  return new Promise(resolve => {
    console.log("");
    console.log(box(
      `${WARNING}${C.bold}${action}${C.reset}\n${MUTED}${detail.slice(0, 500)}${detail.length > 500 ? "…" : ""}`,
      { title: "⚠ CONFIRM", color: WARNING, width: Math.min(COLS - 2, 70) }
    ));
    process.stdout.write(`\n  ${TEXT}Execute? ${MUTED}[${SUCCESS}y${MUTED}/${ERROR}N${MUTED}] ${TEXT_DIM}(auto-yes 10s)${C.reset} `);

    const onData = (d) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      const answer = d.toString().trim().toLowerCase();
      if (answer === "y") { console.log(`  ${SUCCESS}✓ Confirmed${C.reset}\n`); resolve(true); }
      else { console.log(`  ${ERROR}✗ Cancelled${C.reset}\n`); resolve(false); }
    };

    const timer = setTimeout(() => {
      process.stdin.off("data", onData);
      console.log(`  ${SUCCESS}✓ Auto-confirmed${C.reset}\n`);
      resolve(true);
    }, 10000);

    process.stdin.on("data", onData);
  });
}

async function promptLine(prompt, auto_yes = false, defaultValue = "") {
  if (auto_yes) return defaultValue || "";
  return new Promise(resolve => {
    process.stdout.write(`\n  ${TEXT}${prompt}${C.reset} `);
    const onData = (d) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      const value = d.toString().trim();
      resolve(value || defaultValue || "");
    };
    const timer = setTimeout(() => {
      process.stdin.off("data", onData);
      resolve(defaultValue || "");
    }, 10000);
    process.stdin.on("data", onData);
  });
}

async function askUser(question, auto_yes = false, defaultValue = "") {
  const hint = defaultValue ? `(${defaultValue})` : "";
  return await promptLine(`${question} ${MUTED}${hint}${C.reset}`, auto_yes, defaultValue);
}

async function confirmUser(message, auto_yes = false, defaultValue = false) {
  if (auto_yes) return !!defaultValue;
  return new Promise(resolve => {
    process.stdout.write(`\n  ${TEXT}${message} ${MUTED}[${SUCCESS}y${MUTED}/${ERROR}N${MUTED}]${TEXT_DIM} (auto-yes 10s)${C.reset} `);
    const onData = (d) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      const answer = d.toString().trim().toLowerCase();
      if (!answer) resolve(!!defaultValue);
      else resolve(answer === "y" || answer === "yes");
    };
    const timer = setTimeout(() => {
      process.stdin.off("data", onData);
      resolve(!!defaultValue);
    }, 10000);
    process.stdin.on("data", onData);
  });
}

async function chooseUser(question, options, auto_yes = false, defaultIndex = 0) {
  const safeOptions = Array.isArray(options) ? options : [];
  const idx = Math.min(Math.max(parseInt(defaultIndex, 10) || 0, 0), Math.max(safeOptions.length - 1, 0));
  if (auto_yes) return safeOptions[idx] ?? "";
  const list = safeOptions.map((opt, i) => `  ${TEXT_DIM}${i + 1}.${C.reset} ${TEXT}${opt}${C.reset}`).join("\n");
  console.log(`\n${list}`);
  const answer = await promptLine(`${question} ${MUTED}(1-${safeOptions.length})${C.reset}`, auto_yes, String(idx + 1));
  const num = parseInt(answer, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= safeOptions.length) return safeOptions[num - 1];
  return safeOptions[idx] ?? "";
}

// ─── Git Auto-Commit Helpers ────────────────────────────────────────────────

function isGitAvailable() {
  try { execSync("git --version", { stdio: "ignore" }); return true; } catch { return false; }
}

function isInsideGitRepo() {
  try { execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" }); return true; } catch { return false; }
}

function ensureGitRepo() {
  if (!isGitAvailable()) return false;
  if (isInsideGitRepo()) return true;
  try { execSync("git init", { stdio: "ignore" }); return true; } catch { return false; }
}

function ensureGitUser() {
  try {
    const name = execSync("git config user.name", { encoding: "utf8" }).trim();
    const email = execSync("git config user.email", { encoding: "utf8" }).trim();
    if (!name) execSync('git config user.name "Meow CLI"');
    if (!email) execSync('git config user.email "meowcli@local"');
  } catch { /* ignore */ }
}

function gitHasChanges() {
  try { return execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0; } catch { return false; }
}

function escapeShellArg(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/[\r\n]+/g, " ").trim();
}

function describeShellCommand(cmd) {
  return escapeShellArg(cmd).slice(0, 80) || "shell command";
}

function describeFileChange(filePath) {
  const rel = path.relative(process.cwd(), filePath) || path.basename(filePath);
  return rel.replace(/\\/g, "/");
}

function getStagedDiffSummary(maxChars = 6000) {
  try {
    const diff = execSync("git diff --cached --stat", { encoding: "utf8" }).trim();
    if (!diff) return "";
    if (diff.length > maxChars) return diff.slice(0, maxChars) + "\n…";
    return diff;
  } catch { return ""; }
}

async function generateAiCommitMessage({ summary, fallback }, cfg) {
  if (!cfg?.api_key) return fallback;
  const profile = cfg.profiles?.[cfg.profile] || cfg.profiles?.default || { temperature: 0.2 };
  const system = "You are a senior engineer. Write a concise git commit message (imperative mood, <= 72 chars). Return ONLY the message.";
  const user = summary
    ? `Summarize this staged diff into a single commit message:\n\n${summary}`
    : `Write a concise git commit message for the changes. Use: ${fallback}`;

  try {
    const data = await callApi(
      [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      { ...cfg, profile: cfg.profile, profiles: { ...cfg.profiles, [cfg.profile]: { ...profile, temperature: 0.2 } } }
    );
    const msg = data?.choices?.[0]?.message?.content?.trim();
    if (!msg) return fallback;
    return msg.split("\n")[0].slice(0, 72);
  } catch {
    return fallback;
  }
}

async function autoGitCommit(message, cfg) {
  const gitCfg = cfg?.git || {};
  if (gitCfg.autocommit === false) return;
  if (!ensureGitRepo()) return;
  try {
    if (!gitHasChanges()) return;
    ensureGitUser();
    execSync("git add -A", { stdio: "ignore" });
    const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim();
    if (!staged) return;

    const rawPrefix = gitCfg.prefix;
    const prefix = typeof rawPrefix === "string" ? rawPrefix.trim() : "";
    const fallback = prefix ? `${prefix}: ${message}` : message;

    let finalMessage = fallback;
    if (gitCfg.ai_message !== false) {
      const maxChars = Number.isFinite(gitCfg.ai_max_diff_chars) ? gitCfg.ai_max_diff_chars : 6000;
      const summary = getStagedDiffSummary(maxChars);
      const aiMessage = await generateAiCommitMessage({ summary, fallback }, cfg);
      finalMessage = prefix ? `${prefix}: ${aiMessage}` : aiMessage;
    }

    execSync(`git commit -m ${JSON.stringify(finalMessage)}`, { stdio: "ignore" });
  } catch { /* ignore */ }
}

// ─── Tool Implementations ───────────────────────────────────────────────────

function listDir(p, recursive = false) {
  try {
    const dir = path.resolve(p);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return `❌ Directory not found: ${dir}`;

    if (!recursive) {
      return fs.readdirSync(dir).map(n => {
        try { return fs.statSync(path.join(dir, n)).isDirectory() ? n + "/" : n; } catch { return n; }
      }).sort().join("\n");
    }

    // Recursive listing (max 3 levels, skip node_modules/.git etc.)
    const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv"]);
    const MAX_ENTRIES = 500;
    const results = [];

    function walk(d, prefix, depth) {
      if (depth > 3 || results.length >= MAX_ENTRIES) return;
      let entries;
      try { entries = fs.readdirSync(d).sort(); } catch { return; }
      for (const entry of entries) {
        if (results.length >= MAX_ENTRIES) break;
        if (SKIP.has(entry)) { results.push(`${prefix}${entry}/ (skipped)`); continue; }
        const full = path.join(d, entry);
        try {
          const isDir = fs.statSync(full).isDirectory();
          results.push(`${prefix}${entry}${isDir ? "/" : ""}`);
          if (isDir) walk(full, prefix + "  ", depth + 1);
        } catch {
          results.push(`${prefix}${entry}`);
        }
      }
    }

    walk(dir, "", 0);
    if (results.length >= MAX_ENTRIES) results.push(`… (truncated at ${MAX_ENTRIES} entries)`);
    return results.join("\n");
  } catch (e) { return `❌ Error: ${e.message}`; }
}

function readFile(p, startLine, endLine) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return `❌ File not found: ${file}`;

    let data = fs.readFileSync(file, "utf8");

    // Line range support
    if (startLine || endLine) {
      const lines = data.split("\n");
      const start = Math.max(1, startLine || 1) - 1;
      const end = Math.min(lines.length, endLine || lines.length);
      const slice = lines.slice(start, end);
      const numbered = slice.map((l, i) => `${String(start + i + 1).padStart(4)} │ ${l}`);
      return `[Lines ${start + 1}-${end} of ${lines.length}]\n${numbered.join("\n")}`;
    }

    if (data.length > 50000) data = data.slice(0, 50000) + `\n…[TRUNCATED: ${data.length} bytes total]…`;
    return data;
  } catch (e) { return `❌ Read error: ${e.message}`; }
}

async function writeFile(p, content, auto_yes = false, cfg = {}) {
  try {
    const file = path.resolve(p);
    const existed = fs.existsSync(file);
    const old = existed ? fs.readFileSync(file, "utf8") : "";

    // Show diff for existing files
    if (existed) {
      const diff = createTwoFilesPatch(file, file, old, content, "Old", "New");
      if (diff.trim() && diff.length > 100) {
        const ok = await confirm("Write file: " + describeFileChange(file), diff.slice(0, 3000), auto_yes);
        if (!ok) return "❌ Write cancelled.";
      }
    } else {
      const preview = content.length > 200 ? content.slice(0, 200) + "…" : content;
      const ok = await confirm("Create new file: " + describeFileChange(file), preview, auto_yes);
      if (!ok) return "❌ Creation cancelled.";
    }

    // Save undo state
    const undoState = loadUndoState();
    undoState.push({ path: file, existed, content: old, time: Date.now() });
    saveUndoState(undoState);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");

    const desc = describeFileChange(file);
    autoGitCommit(`update ${desc}`, cfg);

    return `✅ Written: ${desc} (${content.length} bytes)`;
  } catch (e) { return `❌ Write error: ${e.message}`; }
}

// ─── NEW: Patch File (targeted edit) ────────────────────────────────────────

async function patchFile(p, oldString, newString, auto_yes = false, cfg = {}) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return `❌ File not found: ${file}`;
    }

    const original = fs.readFileSync(file, "utf8");

    // Find the old string
    const index = original.indexOf(oldString);
    if (index === -1) {
      // Try to help: show nearby context
      const lines = original.split("\n");
      const firstWords = oldString.split("\n")[0].trim().slice(0, 40);
      const candidates = lines
        .map((l, i) => ({ line: i + 1, text: l }))
        .filter(l => l.text.includes(firstWords.slice(0, 20)))
        .slice(0, 3);

      let hint = "";
      if (candidates.length > 0) {
        hint = `\nPossible matches near:\n${candidates.map(c => `  L${c.line}: ${c.text.slice(0, 80)}`).join("\n")}`;
      }

      return `❌ old_string not found in ${describeFileChange(file)}.${hint}\nMake sure the string matches exactly (including whitespace and indentation).`;
    }

    // Check for multiple occurrences
    const secondIndex = original.indexOf(oldString, index + 1);
    if (secondIndex !== -1) {
      const lineNum1 = original.slice(0, index).split("\n").length;
      const lineNum2 = original.slice(0, secondIndex).split("\n").length;
      return `❌ old_string found multiple times (lines ${lineNum1} and ${lineNum2}). Please provide a more specific/unique string to match.`;
    }

    // Apply patch
    const patched = original.slice(0, index) + newString + original.slice(index + oldString.length);

    // Show diff
    const diff = createTwoFilesPatch(file, file, original, patched, "Before", "After");
    const ok = await confirm("Patch file: " + describeFileChange(file), diff.slice(0, 3000), auto_yes);
    if (!ok) return "❌ Patch cancelled.";

    // Save undo state
    const undoState = loadUndoState();
    undoState.push({ path: file, existed: true, content: original, time: Date.now() });
    saveUndoState(undoState);

    fs.writeFileSync(file, patched, "utf8");

    const lineNum = original.slice(0, index).split("\n").length;
    const desc = describeFileChange(file);
    autoGitCommit(`patch ${desc}`, cfg);

    return `✅ Patched: ${desc} (line ~${lineNum}, ${oldString.split("\n").length} lines → ${newString.split("\n").length} lines)`;
  } catch (e) { return `❌ Patch error: ${e.message}`; }
}

// ─── NEW: Grep Search ───────────────────────────────────────────────────────

function grepSearch(pattern, searchPath, include, maxResults = 50) {
  try {
    const dir = path.resolve(searchPath || ".");
    if (!fs.existsSync(dir)) return `❌ Path not found: ${dir}`;

    // Try native grep first (much faster)
    try {
      const parts = ["grep", "-rn", "--color=never"];
      if (include) parts.push(`--include=${include}`);
      parts.push("-E", JSON.stringify(pattern), JSON.stringify(dir));

      const cmd = parts.join(" ");
      const output = execSync(cmd, {
        encoding: "utf8",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 10000,
      }).trim();

      if (!output) return "ℹ No matches found.";

      const lines = output.split("\n").slice(0, maxResults);
      const results = lines.map(line => {
        // Format: /path/to/file:linenum:content
        const rel = line.replace(dir + "/", "").replace(dir + "\\", "");
        return rel;
      });

      let result = results.join("\n");
      if (output.split("\n").length > maxResults) {
        result += `\n… (${output.split("\n").length - maxResults} more matches)`;
      }
      return result;

    } catch (e) {
      // grep returns exit code 1 if no matches — that's OK
      if (e.status === 1) return "ℹ No matches found.";

      // Fallback to JS-based search
      return grepSearchJS(pattern, dir, include, maxResults);
    }
  } catch (e) { return `❌ Search error: ${e.message}`; }
}

function grepSearchJS(pattern, dir, include, maxResults) {
  const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__"]);
  const regex = new RegExp(pattern, "gi");
  const globRegex = include ? new RegExp("^" + include.replace(/\*/g, ".*").replace(/\?/g, ".") + "$") : null;
  const results = [];

  function walk(d, depth) {
    if (depth > 5 || results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(d); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (SKIP.has(entry) || entry.startsWith(".")) continue;

      const full = path.join(d, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        } else if (stat.isFile() && stat.size < 1024 * 1024) {
          if (globRegex && !globRegex.test(entry)) continue;
          const content = fs.readFileSync(full, "utf8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (regex.test(lines[i])) {
              const rel = path.relative(dir, full);
              results.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 150)}`);
            }
            regex.lastIndex = 0;
          }
        }
      } catch { /* skip */ }
    }
  }

  walk(dir, 0);
  if (results.length === 0) return "ℹ No matches found.";
  let result = results.join("\n");
  if (results.length >= maxResults) result += `\n… (truncated at ${maxResults} results)`;
  return result;
}

// ─── Shell ──────────────────────────────────────────────────────────────────

async function runShell(cmd, auto_yes = false, cfg = {}) {
  const ok = await confirm("Shell command", cmd, auto_yes);
  if (!ok) return "❌ Cancelled.";
  const timeoutMs = Number.isFinite(SHELL_TIMEOUT_MS) && SHELL_TIMEOUT_MS > 0 ? SHELL_TIMEOUT_MS : 30000;
  return new Promise(resolve => {
    exec(
      cmd,
      {
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.cwd(),
        timeout: timeoutMs,
        killSignal: "SIGTERM",
      },
      (err, stdout, stderr) => {
        const output = [];
        if (stdout) output.push(`STDOUT:\n${stdout.trim()}`);
        if (stderr) output.push(`STDERR:\n${stderr.trim()}`);
        if (err && err.killed) {
          output.push(`⚠ Process killed after ${timeoutMs}ms`);
        }
        if (err && err.code !== null && err.code !== undefined) output.push(`EXIT CODE: ${err.code}`);

        const desc = describeShellCommand(cmd);
        autoGitCommit(`shell ${desc}`, cfg);

        resolve(output.join("\n\n") || "✅ Done (no output).");
      }
    );
  });
}

// ─── HTTP & Search ──────────────────────────────────────────────────────────

async function httpRequest({ url, method = "GET", headers = {}, body = "", timeout_ms = 15000 }, auto_yes = false) {
  if (!url) return "❌ Error: url required";
  const ok = await confirm("HTTP Request", `${method} ${url}`, auto_yes);
  if (!ok) return "❌ Cancelled.";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
      signal: controller.signal,
    });
    let data = await res.text();
    if (data.length > 50000) data = data.slice(0, 50000) + `\n…[TRUNCATED]…`;
    const headersObj = {};
    res.headers.forEach((v, k) => headersObj[k] = v);
    return [
      `STATUS: ${res.status} ${res.statusText}`,
      `HEADERS: ${JSON.stringify(headersObj, null, 2)}`,
      `BODY:\n${data}`,
    ].join("\n\n");
  } catch (e) {
    return `❌ HTTP Error: ${e.name === "AbortError" ? "Timeout" : e.message}`;
  } finally { clearTimeout(t); }
}

async function webSearch({ query, max_results = 5 }, auto_yes = false) {
  if (!query) return "❌ Error: query required";
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ok = await confirm("Web Search", query, auto_yes);
  if (!ok) return "❌ Cancelled.";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "meowcli/1.0" } });
    const html = await res.text();
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]*href="(.*?)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push({
        title: m[2].replace(/<[^>]+>/g, ""),
        url: m[1],
        snippet: m[3].replace(/<[^>]+>/g, ""),
      });
      if (results.length >= max_results) break;
    }
    return results.length === 0 ? "ℹ No results." : JSON.stringify(results, null, 2);
  } catch (e) { return `❌ Search error: ${e.message}`; }
}

// ─── Tool Chain ─────────────────────────────────────────────────────────────

async function toolChain(steps, cfg) {
  if (!Array.isArray(steps) || steps.length === 0) return "❌ Error: steps empty";
  const outputs = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    let result = await executeTool(step.tool, step.args || {}, cfg);
    outputs.push({ step: i + 1, tool: step.tool, result });
  }
  return JSON.stringify(outputs, null, 2);
}

// ─── Tool Router ────────────────────────────────────────────────────────────

async function executeTool(name, args, cfg) {
  const cleanName = (name || "").replace(/^proxy_/, "");
  switch (cleanName) {
    case "list_dir":      return listDir(args.path, args.recursive);
    case "read_file":     return readFile(args.path, args.start_line, args.end_line);
    case "write_file":    return await writeFile(args.path, args.content, cfg.auto_yes, cfg);
    case "patch_file":    return await patchFile(args.path, args.old_string, args.new_string, cfg.auto_yes, cfg);
    case "grep_search":   return grepSearch(args.pattern, args.path, args.include, args.max_results);
    case "run_shell":     return await runShell(args.cmd, cfg.auto_yes, cfg);
    case "ask_user":      return await askUser(args.question, cfg.auto_yes, args.default || "");
    case "confirm":       return String(await confirmUser(args.message, cfg.auto_yes, args.default));
    case "choose":        return await chooseUser(args.question, args.options, cfg.auto_yes, args.default_index);
    case "http_request":  return await httpRequest(args, cfg.auto_yes);
    case "web_search":    return await webSearch(args, cfg.auto_yes);
    case "tool_chain":    return await toolChain(args.steps, cfg);
    // ─── v3: New tools ──────────────────────────────────────────────────
    case "delegate_task": {
      const { delegateTask } = await import("./agents/subagent.js");
      return await delegateTask(args, cfg);
    }
    case "git_diff": {
      const { gitDiff } = await import("./smart/cicd.js");
      return gitDiff(args);
    }
    case "git_log": {
      const { gitLog } = await import("./smart/cicd.js");
      return gitLog(args);
    }
    case "git_commit": {
      const { gitCommit } = await import("./smart/cicd.js");
      return gitCommit(args);
    }
    case "git_branch": {
      const { gitBranch } = await import("./smart/cicd.js");
      return gitBranch(args);
    }
    case "git_status": {
      const { gitStatus } = await import("./smart/cicd.js");
      return gitStatus();
    }
    case "ci_pipeline": {
      const { ciTool } = await import("./smart/cicd.js");
      return await ciTool(args, cfg);
    }
    default:              return `❌ Unknown tool: ${name}`;
  }
}

// ─── Extended Tool Definitions (v3) ─────────────────────────────────────────

const EXTENDED_TOOLS = [
  {
    type: "function",
    function: {
      name: "delegate_task",
      description: "Delegate subtasks to parallel sub-agents. Each sub-agent runs independently with its own token budget. Use for multi-file operations, parallel searches, batch refactoring.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "Clear task description for the sub-agent" },
                tools: { type: "array", items: { type: "string" }, description: "Tools this sub-agent may use" },
                max_tokens: { type: "number", description: "Token budget for this sub-agent (default: auto)" },
              },
              required: ["description"]
            },
            description: "Array of subtasks to run in parallel"
          }
        },
        required: ["tasks"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show git diff (staged or unstaged changes)",
      parameters: { type: "object", properties: {
        staged: { type: "boolean", description: "Show staged changes" },
        file: { type: "string", description: "Specific file" },
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
        file: { type: "string", description: "Filter by file" },
      }}
    }
  },
  {
    type: "function",
    function: {
      name: "git_commit",
      description: "Stage and commit changes",
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
      description: "Show git working tree status",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "ci_pipeline",
      description: "Manage CI/CD. Actions: status (list workflows), generate (create GitHub Actions), heal (auto-fix failing tests)",
      parameters: { type: "object", properties: {
        action: { type: "string", enum: ["status", "generate", "heal"] },
        description: { type: "string" },
        name: { type: "string" },
      }, required: ["action"]}
    }
  },
];

const ALL_TOOLS = [...TOOLS, ...EXTENDED_TOOLS];


export {
  TOOLS, ALL_TOOLS, EXTENDED_TOOLS,
  confirm, promptLine, askUser, confirmUser, chooseUser,
  listDir, readFile, writeFile, patchFile, grepSearch,
  runShell, httpRequest, webSearch, toolChain, executeTool
};