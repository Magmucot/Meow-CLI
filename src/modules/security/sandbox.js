// ═══════════════════════════════════════════════════════════════════════════
// security/sandbox.js — Enterprise Security Layer
// Encryption, audit log, incognito mode, workspace sandboxing
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { DATA_DIR } from "../config.js";
import { log, C, ACCENT, MUTED, TEXT_DIM, SUCCESS, ERROR, WARNING } from "../ui.js";

const AUDIT_FILE = path.join(DATA_DIR, "audit.log");
const ENCRYPTION_KEY_FILE = path.join(DATA_DIR, ".keyfile");

// ─── Workspace Sandbox ──────────────────────────────────────────────────────

class WorkspaceSandbox {
  constructor(workspaceRoot = process.cwd()) {
    this.root = path.resolve(workspaceRoot);
    this.blockedPatterns = [
      /\.ssh/i, /\.gnupg/i, /\.aws\/credentials/i, /\.env(?:\.local)?$/i,
      /id_rsa/, /id_ed25519/, /\.pem$/, /\.key$/,
      /\/etc\/passwd/, /\/etc\/shadow/,
    ];
    this.blockedCommands = [
      /rm\s+(-rf?|--recursive)\s+\//,
      />\s*\/dev\/sd/, /mkfs\./, /dd\s+.*of=\/dev/,
      /:()\{\s*:\|:&\s*\};:/, // fork bomb
      /curl.*\|\s*(ba)?sh/, /wget.*\|\s*(ba)?sh/,
      /chmod\s+777\s+\//, /chown\s+.*\//,
    ];
  }

  isPathAllowed(targetPath) {
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      if (!resolved.startsWith(os.tmpdir())) return { allowed: false, reason: `Outside workspace: ${resolved}` };
    }
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(resolved)) return { allowed: false, reason: `Sensitive path blocked: ${resolved}` };
    }
    return { allowed: true };
  }

  isCommandAllowed(cmd) {
    for (const pattern of this.blockedCommands) {
      if (pattern.test(cmd)) return { allowed: false, reason: `Dangerous command blocked` };
    }
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(cmd)) return { allowed: false, reason: `Command accesses sensitive path` };
    }
    return { allowed: true };
  }

  validate(toolName, args) {
    switch (toolName) {
      case "write_file":
      case "patch_file":
      case "read_file": return this.isPathAllowed(args.path || "");
      case "run_shell": return this.isCommandAllowed(args.cmd || "");
      case "list_dir": return this.isPathAllowed(args.path || ".");
      default: return { allowed: true };
    }
  }
}

// ─── Audit Logger ───────────────────────────────────────────────────────────

class AuditLogger {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.sessionId = crypto.randomUUID().slice(0, 8);
    this.entries = [];
  }

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

  logToolCall(toolName, args, result) {
    this.log("tool_call", {
      tool: toolName,
      args: this._sanitize(JSON.stringify(args || {}).slice(0, 500)),
      result_preview: (result || "").slice(0, 200),
      success: !(result || "").startsWith("❌"),
    });
  }

  logApiCall(model, tokens, cost) {
    this.log("api_call", { model, tokens, cost: cost?.toFixed(6) });
  }

  logPermission(tool, decision) {
    this.log("permission", { tool, decision });
  }

  logFileChange(filePath, action) {
    this.log("file_change", { path: filePath, action });
  }

  _sanitize(str) {
    return str.replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***").replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer ***");
  }

  _appendToFile(entry) {
    try {
      fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
      fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n");
    } catch {}
  }

  getRecentEntries(count = 50) {
    try {
      const lines = fs.readFileSync(AUDIT_FILE, "utf8").trim().split("\n");
      return lines.slice(-count).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }

  clear() {
    try { fs.writeFileSync(AUDIT_FILE, ""); this.entries = []; } catch {}
  }

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

// ─── Simple Encryption (AES-256-GCM) ────────────────────────────────────────

class DataEncryptor {
  constructor() {
    this.algorithm = "aes-256-gcm";
    this.key = null;
  }

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

  encrypt(plaintext) {
    const key = this._getOrCreateKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

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

  encryptFile(inputPath, outputPath) {
    const plaintext = fs.readFileSync(inputPath, "utf8");
    const encrypted = this.encrypt(plaintext);
    fs.writeFileSync(outputPath || inputPath + ".enc", encrypted);
    return outputPath || inputPath + ".enc";
  }

  decryptFile(inputPath, outputPath) {
    const ciphertext = fs.readFileSync(inputPath, "utf8");
    const decrypted = this.decrypt(ciphertext);
    if (outputPath) fs.writeFileSync(outputPath, decrypted);
    return decrypted;
  }
}

// ─── Incognito Mode ─────────────────────────────────────────────────────────

class IncognitoSession {
  constructor() {
    this.active = false;
    this.tmpDir = null;
    this.savedDataDir = null;
  }

  start() {
    if (this.active) return { success: false, error: "Already in incognito mode" };
    this.active = true;
    this.tmpDir = path.join(os.tmpdir(), `meow-incognito-${crypto.randomUUID().slice(0, 8)}`);
    fs.mkdirSync(this.tmpDir, { recursive: true });
    log.ok(`Incognito mode ON — no data will persist`);
    return { success: true, tmpDir: this.tmpDir };
  }

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

  isActive() { return this.active; }

  getDataDir() { return this.active ? this.tmpDir : DATA_DIR; }

  shouldPersist() { return !this.active; }
}

// ─── Singletons ─────────────────────────────────────────────────────────────

let _sandbox = null;
let _audit = null;
let _encryptor = null;
let _incognito = null;

function getSandbox() { if (!_sandbox) _sandbox = new WorkspaceSandbox(); return _sandbox; }
function getAuditLogger() { if (!_audit) _audit = new AuditLogger(); return _audit; }
function getEncryptor() { if (!_encryptor) _encryptor = new DataEncryptor(); return _encryptor; }
function getIncognito() { if (!_incognito) _incognito = new IncognitoSession(); return _incognito; }

export {
  WorkspaceSandbox, getSandbox,
  AuditLogger, getAuditLogger,
  DataEncryptor, getEncryptor,
  IncognitoSession, getIncognito,
};
