import fs from "fs";
import path from "path";
import { PERM_FILE } from "./config.js";
import { log, C, SUCCESS, ERROR, WARNING, MUTED, TEXT, TEXT_DIM, ACCENT, box, COLS } from "./ui.js";

/**
 * Permission levels for tool execution.
 * @enum {string}
 */
const LEVEL = {
  ASK:           "ask",
  ALLOW:         "allow",
  DENY:          "deny",
  SESSION_ALLOW: "session_allow",
};

/** @type {Set<string>} Set of tools that are always considered safe to run */
const SAFE_TOOLS = new Set(["list_dir", "read_file", "grep_search", "ask_user", "confirm", "choose", "git_status", "git_log", "git_diff"]);

/** @type {Set<string>} Set of tools that require explicit user permission */
const DANGEROUS_TOOLS = new Set(["run_shell", "write_file", "patch_file", "http_request", "web_search", "git_commit", "git_branch", "ci_pipeline", "delegate_task"]);

/**
 * Matches a tool name against a pattern.
 * @param {string} pattern - The pattern to match (e.g., "write_file:*").
 * @param {string} value - The tool name.
 * @returns {boolean}
 */
function matchPattern(pattern, value) {
  if (pattern === "*") return true;
  if (pattern === value) return true;

  if (pattern.includes(":")) {
    const [pTool, pPath] = pattern.split(":", 2);
    if (pTool !== "*" && pTool !== value) return false;
    return true;
  }

  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }

  return false;
}

/**
 * Matches a file path against a glob-like pattern.
 * @param {string} pattern - The glob pattern.
 * @param {string} filePath - The path to check.
 * @returns {boolean}
 */
function matchPathPattern(pattern, filePath) {
  if (!pattern || !filePath) return true;
  if (pattern === "*") return true;

  const regexStr = "^" + pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*")
    + "$";

  try {
    return new RegExp(regexStr).test(filePath);
  } catch {
    return pattern === filePath;
  }
}

/**
 * Manages persistent and session-level tool permissions.
 */
class PermissionStore {
  constructor() {
    this.rules = [];
    this.sessionOverrides = new Map();
    this._load();
  }

  /** @private */
  _load() {
    try {
      if (fs.existsSync(PERM_FILE)) {
        const data = JSON.parse(fs.readFileSync(PERM_FILE, "utf8"));
        this.rules = Array.isArray(data.rules) ? data.rules : [];
      }
    } catch {
      this.rules = [];
    }
  }

  /** @private */
  _save() {
    try {
      fs.mkdirSync(path.dirname(PERM_FILE), { recursive: true });
      fs.writeFileSync(PERM_FILE, JSON.stringify({ rules: this.rules }, null, 2));
    } catch (e) {
      log.err(`Permission save error: ${e.message}`);
    }
  }

  /**
   * Adds a persistent permission rule.
   * @param {string} tool - Tool name or "*".
   * @param {string} level - Permission level.
   * @param {string|null} [pathPattern=null] - Optional file path pattern.
   */
  addRule(tool, level, pathPattern = null) {
    this.rules = this.rules.filter(r =>
      !(r.tool === tool && r.path === pathPattern)
    );
    this.rules.push({
      tool,
      level,
      path: pathPattern,
      created: Date.now(),
    });
    this._save();
  }

  /**
   * Removes a persistent permission rule.
   * @param {string} tool - Tool name.
   * @param {string|null} [pathPattern=null] - Optional file path pattern.
   * @returns {boolean} True if a rule was removed.
   */
  removeRule(tool, pathPattern = null) {
    const before = this.rules.length;
    this.rules = this.rules.filter(r =>
      !(r.tool === tool && r.path === pathPattern)
    );
    if (this.rules.length !== before) this._save();
    return before !== this.rules.length;
  }

  /**
   * Resets all persistent and session rules.
   */
  resetAll() {
    this.rules = [];
    this.sessionOverrides.clear();
    this._save();
  }

  /**
   * Checks the permission level for a tool call.
   * @param {string} toolName - Name of the tool.
   * @param {Object} [args={}] - Arguments passed to the tool.
   * @returns {string} The permission level (allow, deny, ask, etc).
   */
  check(toolName, args = {}) {
    if (SAFE_TOOLS.has(toolName)) return LEVEL.ALLOW;

    if (this.sessionOverrides.has(toolName)) {
      return this.sessionOverrides.get(toolName);
    }

    const filePath = args.path || args.cmd || args.url || args.file || null;
    const sessionKey = `${toolName}:${filePath || "*"}`;
    if (this.sessionOverrides.has(sessionKey)) {
      return this.sessionOverrides.get(sessionKey);
    }

    for (const rule of this.rules) {
      if (rule.tool === toolName && rule.path && filePath) {
        if (matchPathPattern(rule.path, filePath)) {
          return rule.level;
        }
      }
    }

    for (const rule of this.rules) {
      if (rule.tool === toolName && !rule.path) {
        return rule.level;
      }
    }

    for (const rule of this.rules) {
      if (rule.tool === "*") {
        return rule.level;
      }
    }

    return DANGEROUS_TOOLS.has(toolName) ? LEVEL.ASK : LEVEL.ALLOW;
  }

  /**
   * Remembers a session-level decision for a specific tool and path.
   * @param {string} toolName - Tool name.
   * @param {Object} args - Tool arguments.
   * @param {string} level - Permission level.
   */
  rememberSession(toolName, args, level) {
    const filePath = args.path || args.cmd || args.url || args.file || "*";
    const sessionKey = `${toolName}:${filePath}`;
    this.sessionOverrides.set(sessionKey, level);
  }

  /**
   * Remembers a session-level decision for a tool regardless of path.
   * @param {string} toolName - Tool name.
   * @param {string} level - Permission level.
   */
  rememberToolSession(toolName, level) {
    this.sessionOverrides.set(toolName, level);
  }

  /**
   * Returns all persistent rules.
   * @returns {Array<Object>}
   */
  listRules() {
    return [...this.rules].sort((a, b) => {
      if (a.tool !== b.tool) return a.tool.localeCompare(b.tool);
      return (a.path || "").localeCompare(b.path || "");
    });
  }
}

/**
 * Prompts the user for permission to execute a tool.
 * @param {string} toolName - Name of the tool.
 * @param {Object} args - Tool arguments.
 * @param {PermissionStore} store - The permission store instance.
 * @param {boolean} [autoYes=false] - If true, automatically allow (except for explicit denies).
 * @returns {Promise<boolean>} True if allowed.
 */
async function askPermission(toolName, args, store, autoYes = false) {
  const level = store.check(toolName, args);

  if (level === LEVEL.ALLOW || level === LEVEL.SESSION_ALLOW) return true;
  if (level === LEVEL.DENY) {
    log.warn(`Permission denied for ${toolName} (rule)`);
    return false;
  }

  if (autoYes) return true;

  const detail = formatToolDetail(toolName, args);

  return new Promise(resolve => {
    console.log("");
    console.log(box(
      `${WARNING}${C.bold}${toolName}${C.reset}\n${MUTED}${detail}${C.reset}`,
      { title: "⚠ Permission required", color: WARNING, width: Math.min(COLS - 2, 70) }
    ));
    console.log("");
    console.log(`  ${TEXT}Options:`);
    console.log(`    ${SUCCESS}y${C.reset}  ${TEXT_DIM}Allow once${C.reset}`);
    console.log(`    ${SUCCESS}s${C.reset}  ${TEXT_DIM}Allow for this session${C.reset}`);
    console.log(`    ${SUCCESS}a${C.reset}  ${TEXT_DIM}Always allow this tool${C.reset}`);
    console.log(`    ${ERROR}d${C.reset}  ${TEXT_DIM}Always deny this tool${C.reset}`);
    console.log(`    ${ERROR}n${C.reset}  ${TEXT_DIM}Deny once${C.reset}`);
    process.stdout.write(`\n  ${TEXT}[y/s/a/d/N]${C.reset} ${MUTED}(auto-deny 30s)${C.reset} `);

    const onData = (d) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      const answer = d.toString().trim().toLowerCase();

      switch (answer) {
        case "y":
          console.log(`  ${SUCCESS}✓ Allowed once${C.reset}\n`);
          resolve(true);
          break;
        case "s":
          store.rememberToolSession(toolName, LEVEL.SESSION_ALLOW);
          console.log(`  ${SUCCESS}✓ Allowed for session: ${toolName}${C.reset}\n`);
          resolve(true);
          break;
        case "a":
          store.addRule(toolName, LEVEL.ALLOW);
          console.log(`  ${SUCCESS}✓ Always allowed: ${toolName}${C.reset}\n`);
          resolve(true);
          break;
        case "d":
          store.addRule(toolName, LEVEL.DENY);
          console.log(`  ${ERROR}✗ Always denied: ${toolName}${C.reset}\n`);
          resolve(false);
          break;
        default:
          console.log(`  ${ERROR}✗ Denied${C.reset}\n`);
          resolve(false);
          break;
      }
    };

    const timer = setTimeout(() => {
      process.stdin.off("data", onData);
      console.log(`  ${ERROR}✗ Auto-denied (timeout)${C.reset}\n`);
      resolve(false);
    }, 30000);

    process.stdin.on("data", onData);
  });
}

/**
 * Formats tool arguments for the permission dialog.
 * @param {string} toolName - Tool name.
 * @param {Object} args - Tool arguments.
 * @returns {string} Formatted detail.
 * @private
 */
function formatToolDetail(toolName, args) {
  switch (toolName) {
    case "write_file":
    case "patch_file":
      return args.path || "unknown file";
    case "run_shell":
      return (args.cmd || "").slice(0, 200);
    case "http_request":
      return `${args.method || "GET"} ${args.url || ""}`.slice(0, 200);
    case "web_search":
      return `Search: ${args.query || ""}`;
    case "git_commit":
      return `Commit: ${args.message || ""}`;
    default:
      return JSON.stringify(args).slice(0, 200);
  }
}

let _store = null;
/**
 * Singleton accessor for the PermissionStore.
 * @returns {PermissionStore}
 */
function getPermissionStore() {
  if (!_store) _store = new PermissionStore();
  return _store;
}

export {
  LEVEL,
  SAFE_TOOLS,
  DANGEROUS_TOOLS,
  PermissionStore,
  askPermission,
  getPermissionStore,
  matchPattern,
  matchPathPattern,
};
