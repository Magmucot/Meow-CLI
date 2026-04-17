/**
 * Security module for Meow CLI.
 * Provides workspace sandboxing, audit logging, data encryption, and incognito mode.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { DATA_DIR } from "../config.js";
import { log, C, ACCENT, MUTED, TEXT_DIM, SUCCESS, ERROR, WARNING } from "../ui.js";

const AUDIT_FILE = path.join(DATA_DIR, "audit.log");
const ENCRYPTION_KEY_FILE = path.join(DATA_DIR, ".keyfile");

/**
 * Enforces security policies on file access and command execution.
 */
class WorkspaceSandbox {
  /**
   * @param {string} [workspaceRoot=process.cwd()] - The root directory allowed for access.
   */
  constructor(workspaceRoot = process.cwd()) {
    this.root = path.resolve(workspaceRoot);
    this.blockedPatterns = [
      /\.ssh/i, /\.gnupg/i, /\.aws\/credentials/i, /\.env(?:\.local)?$/i,
      /id_rsa/, /id_ed25519/, /\.pem$/, /\.key$/,
      /\/etc\/passwd/, /\/etc\/shadow/, /\/etc\/sudoers/,
      /\.bash_history/, /\.zsh_history/,
      /\.node_repl_history/, /\.npmrc$/, /\.yarnrc$/,
      /config\.json$/i, // Generic config files often contain keys
      /\.dockercfg$/, /\.docker\/config\.json$/,
      /\.netrc$/, /\.pypirc$/,
    ];
    this.blockedCommands = [
      /rm\s+(-rf?|--recursive)\s+\//,
      />\s*\/dev\/sd/, /mkfs\./, /dd\s+.*of=\/dev/,
      /:()\{\s*:\|:&\s*\};:/, // fork bomb
      /curl.*\|\s*(ba)?sh/, /wget.*\|\s*(ba)?sh/,
      /chmod\s+777\s+\//, /chown\s+.* \//,
      /kill\s+-9\s+1/, /shutdown/, /reboot/,
      /passwd\s+root/, /visudo/,
      /nc\s+-e/, /nc\s+.*-c\s+bash/, /netcat\s+-e/,
      /python\s+-c\s+.*import\s+os,pty,socket/,
      /perl\s+-e\s+.*exec\s+"\/bin\/sh"/,
      /eval\s+.*\$\(.*\)/, /exec\s+.*>/,
      /alias\s+.*=/, /unalias\s+/,
      /history\s+-c/, /export\s+.*=/,
    ];
    this.blockedEnvVars = [
      /API_KEY/i, /SECRET/i, /PASSWORD/i, /TOKEN/i, /AUTH/i,
      /AWS_/i, /AZURE_/i, /GOOGLE_/i, /CLOUDFLARE_/i,
      /SSH_AUTH_SOCK/, /KUBECONFIG/
    ];
  }

  /**
   * Validates if a file path is within the allowed workspace and doesn't match blocked patterns.
   * @param {string} targetPath - Path to validate.
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  isPathAllowed(targetPath) {
    try {
      const resolved = path.resolve(targetPath);
      let realPath;
      try {
        // Resolve symlinks to prevent escaping via links
        realPath = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
      } catch {
        realPath = resolved;
      }

      // Check if it's within workspace or tmp
      const isUnderRoot = realPath.startsWith(this.root + path.sep) || realPath === this.root;
      const isUnderTmp = realPath.startsWith(os.tmpdir());

      if (!isUnderRoot && !isUnderTmp) {
        return { allowed: false, reason: `Access outside workspace: ${realPath}` };
      }

      for (const pattern of this.blockedPatterns) {
        if (pattern.test(realPath)) return { allowed: false, reason: `Sensitive path blocked: ${realPath}` };
      }
      return { allowed: true };
    } catch (e) {
      return { allowed: false, reason: `Path validation error: ${e.message}` };
    }
  }

  /**
   * Validates if a shell command is safe to execute.
   * @param {string} cmd - Command string.
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  isCommandAllowed(cmd) {
    for (const pattern of this.blockedCommands) {
      if (pattern.test(cmd)) return { allowed: false, reason: `Dangerous command blocked` };
    }
    // Check for access to blocked patterns in the command string itself
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(cmd)) return { allowed: false, reason: `Command attempts to access sensitive path` };
    }
    return { allowed: true };
  }

  /**
   * Filters out sensitive environment variables.
   * @param {Object} [env=process.env] - Environment variables object.
   * @returns {Object} Safe environment variables.
   */
  filterEnv(env = process.env) {
    const safeEnv = {};
    for (const [key, value] of Object.entries(env)) {
      const isBlocked = this.blockedEnvVars.some(pattern => pattern.test(key));
      if (!isBlocked) {
        safeEnv[key] = value;
      }
    }
    return safeEnv;
  }

  /**
   * Generic validation for tool calls.
   * @param {string} toolName - Name of the tool.
   * @param {Object} args - Tool arguments.
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  validate(toolName, args) {
    switch (toolName) {
      case "write_file":
      case "patch_file":
      case "read_file":
      case "git_diff":
      case "git_commit":
        return this.isPathAllowed(args.path || args.file || "");
      case "run_shell":
        return this.isCommandAllowed(args.cmd || "");
      case "list_dir":
        return this.isPathAllowed(args.path || ".");
      case "http_request":
        // Basic URL validation
        if (args.url && (args.url.startsWith("file://") || args.url.includes("169.254.169.254"))) {
          return { allowed: false, reason: "SSRF protection: Local or metadata URL blocked" };
        }
        return { allowed: true };
      default:
        return { allowed: true };
    }
  }

  /**
   * Safely executes a command within the sandbox.
   * @param {string} cmd - Command to execute.
   * @param {Object} [options={}] - Execution options.
   * @returns {string} Command output.
   * @throws {Error} If command is blocked or execution fails.
   */
  safeExec(cmd, options = {}) {
    const check = this.isCommandAllowed(cmd);
    if (!check.allowed) {
      throw new Error(`Security Block: ${check.reason}`);
    }

    const { execSync } = require("child_process");
    const safeEnv = this.filterEnv(options.env || process.env);
    
    return execSync(cmd, {
      ...options,
      env: safeEnv,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: options.timeout || 60000,
    }).toString();
  }
}

/**
 * Records tool calls, API calls, and file changes for auditing purposes.
 */
class AuditLogger {
  /**
   * @param {boolean} [enabled=true] - Whether logging is enabled.
   */
  constructor(enabled = true) {
    this.enabled = enabled;
    this.sessionId = crypto.randomUUID().slice(0, 8);
    this.entries = [];
  }

  /**
   * Logs a generic action.
   * @param {string} action - Action name.
   * @param {Object} [details={}] - Additional details.
   */
  log(action, details = {}) {
    if (!this.enabled) return;
    const entry = {
      time: new Date().toISOString(),
      session: this.sessionId,
      action,
      ...details,
    };
    this.entries.push(entry);
    this._appendToFile(entry);
  }

  /**
   * Logs a tool execution.
   * @param {string} toolName - Tool name.
   * @param {Object} args - Tool arguments.
   * @param {string} result - Execution result.
   */
  logToolCall(toolName, args, result) {
    this.log("tool_call", {
      tool: toolName,
      args: this._sanitize(JSON.stringify(args || {}).slice(0, 500)),
      result_preview: (result || "").slice(0, 200),
      success: !(result || "").startsWith("❌"),
    });
  }

  /**
   * Logs an API call.
   * @param {string} model - Model used.
   * @param {number} tokens - Tokens consumed.
   * @param {number} cost - Estimated cost.
   */
  logApiCall(model, tokens, cost) {
    this.log("api_call", { model, tokens, cost: cost?.toFixed(6) });
  }

  /**
   * Logs a permission decision.
   * @param {string} tool - Tool name.
   * @param {string} decision - Decision (e.g., 'allowed', 'denied').
   */
  logPermission(tool, decision) {
    this.log("permission", { tool, decision });
  }

  /**
   * Logs a file modification.
   * @param {string} filePath - Path to the file.
   * @param {string} action - Action taken (e.g., 'write', 'patch').
   */
  logFileChange(filePath, action) {
    this.log("file_change", { path: filePath, action });
  }

  /** @private */
  _sanitize(str) {
    return str.replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***").replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer ***");
  }

  /** @private */
  _appendToFile(entry) {
    try {
      fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
      fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n");
    } catch {}
  }

  /**
   * Retrieves recent audit log entries.
   * @param {number} [count=50] - Number of entries to retrieve.
   * @returns {Array<Object>}
   */
  getRecentEntries(count = 50) {
    try {
      if (!fs.existsSync(AUDIT_FILE)) return [];
      const lines = fs.readFileSync(AUDIT_FILE, "utf8").trim().split("\n");
      return lines.slice(-count).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }

  /** Clears the audit log file. */
  clear() {
    try { fs.writeFileSync(AUDIT_FILE, ""); this.entries = []; } catch {}
  }

  /**
   * Prints recent audit log entries to the console.
   * @param {number} [count=20] - Number of entries to print.
   */
  printRecent(count = 20) {
    const entries = this.getRecentEntries(count);
    console.log(`\n  ${ACCENT}${C.bold}◆ Audit Log${C.reset} ${MUTED}(last ${entries.length})${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(60)}${C.reset}`);
    for (const e of entries) {
      const time = e.time?.slice(11, 19) || "";
      const icon = e.action === "tool_call" ? "🔧" : e.action === "api_call" ? "🌐" :
        e.action === "permission" ? "🔒" : e.action === "file_change" ? "📄" : "▸";
      const detail = e.tool || e.model || e.path || "";
      console.log(`  ${MUTED}${time}${C.reset} ${icon} ${TEXT_DIM}${e.action}${C.reset} ${MUTED}${detail}${C.reset}`);
    }
    console.log(`  ${MUTED}${"─".repeat(60)}${C.reset}\n`);
  }
}

/**
 * Handles AES-256-GCM encryption and decryption for sensitive data.
 */
class DataEncryptor {
  constructor() {
    this.algorithm = "aes-256-gcm";
    this.key = null;
  }

  /** @private */
  _getOrCreateKey() {
    if (this.key) return this.key;
    try {
      if (fs.existsSync(ENCRYPTION_KEY_FILE)) {
        this.key = Buffer.from(fs.readFileSync(ENCRYPTION_KEY_FILE, "utf8").trim(), "hex");
      } else {
        this.key = crypto.randomBytes(32);
        fs.mkdirSync(path.dirname(ENCRYPTION_KEY_FILE), { recursive: true });
        fs.writeFileSync(ENCRYPTION_KEY_FILE, this.key.toString("hex"), { mode: 0o600 });
      }
      return this.key;
    } catch (e) {
      log.dim(`Encryption key error: ${e.message}`);
      this.key = crypto.randomBytes(32);
      return this.key;
    }
  }

  /**
   * Encrypts a plaintext string.
   * @param {string} plaintext - String to encrypt.
   * @returns {string} Encrypted data in 'iv:authTag:ciphertext' format.
   */
  encrypt(plaintext) {
    const key = this._getOrCreateKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts a ciphertext string.
   * @param {string} ciphertext - Encrypted string.
   * @returns {string} Decrypted plaintext.
   */
  decrypt(ciphertext) {
    const key = this._getOrCreateKey();
    const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
    if (!ivHex || !authTagHex || !encrypted) throw new Error("Invalid encrypted data format");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Encrypts a file.
   * @param {string} inputPath - Path to the file to encrypt.
   * @param {string} [outputPath] - Path to save the encrypted file.
   * @returns {string} Path to the encrypted file.
   */
  encryptFile(inputPath, outputPath) {
    const plaintext = fs.readFileSync(inputPath, "utf8");
    const encrypted = this.encrypt(plaintext);
    fs.writeFileSync(outputPath || inputPath + ".enc", encrypted);
    return outputPath || inputPath + ".enc";
  }

  /**
   * Decrypts a file.
   * @param {string} inputPath - Path to the encrypted file.
   * @param {string} [outputPath] - Path to save the decrypted file.
   * @returns {string} Decrypted plaintext.
   */
  decryptFile(inputPath, outputPath) {
    const ciphertext = fs.readFileSync(inputPath, "utf8");
    const decrypted = this.decrypt(ciphertext);
    if (outputPath) fs.writeFileSync(outputPath, decrypted);
    return decrypted;
  }
}

/**
 * Manages an incognito session where data persistence is disabled.
 */
class IncognitoSession {
  constructor() {
    this.active = false;
    this.tmpDir = null;
    this.savedDataDir = null;
  }

  /**
   * Starts an incognito session.
   * @returns {Object} { success: boolean, tmpDir?: string, error?: string }
   */
  start() {
    if (this.active) return { success: false, error: "Already in incognito mode" };
    this.active = true;
    this.tmpDir = path.join(os.tmpdir(), `meow-incognito-${crypto.randomUUID().slice(0, 8)}`);
    fs.mkdirSync(this.tmpDir, { recursive: true });
    log.ok(`Incognito mode ON — no data will persist`);
    return { success: true, tmpDir: this.tmpDir };
  }

  /**
   * Stops the current incognito session and destroys temporary data.
   * @returns {Object} { success: boolean, error?: string }
   */
  stop() {
    if (!this.active) return { success: false, error: "Not in incognito mode" };
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
    }
    this.active = false;
    this.tmpDir = null;
    log.ok("Incognito mode OFF — temp data destroyed");
    return { success: true };
  }

  /** @returns {boolean} */
  isActive() { return this.active; }

  /** @returns {string} Current data directory (temp if incognito). */
  getDataDir() { return this.active ? this.tmpDir : DATA_DIR; }

  /** @returns {boolean} */
  shouldPersist() { return !this.active; }
}

// ─── Singletons ─────────────────────────────────────────────────────────────

let _sandbox = null;
let _audit = null;
let _encryptor = null;
let _incognito = null;

/** @returns {WorkspaceSandbox} Singleton sandbox instance. */
function getSandbox() { if (!_sandbox) _sandbox = new WorkspaceSandbox(); return _sandbox; }
/** @returns {AuditLogger} Singleton audit logger instance. */
function getAuditLogger() { if (!_audit) _audit = new AuditLogger(); return _audit; }
/** @returns {DataEncryptor} Singleton encryptor instance. */
function getEncryptor() { if (!_encryptor) _encryptor = new DataEncryptor(); return _encryptor; }
/** @returns {IncognitoSession} Singleton incognito session instance. */
function getIncognito() { if (!_incognito) _incognito = new IncognitoSession(); return _incognito; }

export {
  WorkspaceSandbox, getSandbox,
  AuditLogger, getAuditLogger,
  DataEncryptor, getEncryptor,
  IncognitoSession, getIncognito,
};
