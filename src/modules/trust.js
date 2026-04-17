import fs from "fs";
import path from "path";
import { runShell } from "./tools.js";
import { TRUST_FILE, DEFAULT_CONFIG } from "./config.js";
import { log } from "./ui.js";

/**
 * Trust status levels.
 */
export const TRUST_LEVEL = {
  TRUSTED: "trusted",
  UNTRUSTED: "untrusted",
  BLACKLISTED: "blacklisted",
};

class TrustManager {
  constructor() {
    this.localTrust = new Set();
    this.globalTrust = new Set();
    this.blacklist = new Set();
    this.repoId = null;
    this._loadLocal();
  }

  /** @private */
  _loadLocal() {
    try {
      if (fs.existsSync(TRUST_FILE)) {
        const data = JSON.parse(fs.readFileSync(TRUST_FILE, "utf8"));
        if (Array.isArray(data.trusted)) this.localTrust = new Set(data.trusted);
      }
    } catch (e) {
      log.dim(`Trust load error: ${e.message}`);
    }
  }

  /** @private */
  _saveLocal() {
    try {
      fs.mkdirSync(path.dirname(TRUST_FILE), { recursive: true });
      fs.writeFileSync(TRUST_FILE, JSON.stringify({
        trusted: Array.from(this.localTrust)
      }, null, 2));
    } catch (e) {
      log.err(`Trust save error: ${e.message}`);
    }
  }

  /**
   * Identifies the current repository ID.
   * Uses git remote URL or current directory path as fallback.
   */
  async getRepoId() {
    if (this.repoId) return this.repoId;
    try {
      const { execSync } = await import("child_process");
      const remote = execSync("git remote get-url origin", { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (remote) {
        this.repoId = remote;
        return this.repoId;
      }
    } catch {}
    this.repoId = process.cwd();
    return this.repoId;
  }

  /**
   * Fetches global trust list from GitHub.
   */
  async fetchGlobalTrust() {
    const url = DEFAULT_CONFIG.trust_url || "https://raw.githubusercontent.com/meowcli/meow-cli/main/globals/trust/trust.meow";
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const text = await response.text();
      
      // Parse trust.meow (simple text format: repo_url [trusted|blacklisted])
      const lines = text.split("\n");
      for (const line of lines) {
        const [id, status] = line.trim().split(/\s+/);
        if (!id) continue;
        if (status === "blacklisted") this.blacklist.add(id);
        else this.globalTrust.add(id);
      }
    } catch (e) {
      log.dim(`Global trust fetch failed: ${e.message}`);
    }
  }

  /**
   * Checks the trust status of the current repository.
   */
  async checkStatus() {
    const id = await this.getRepoId();
    if (this.blacklist.has(id)) return TRUST_LEVEL.BLACKLISTED;
    if (this.globalTrust.has(id) || this.localTrust.has(id)) return TRUST_LEVEL.TRUSTED;
    return TRUST_LEVEL.UNTRUSTED;
  }

  /**
   * Grants trust to the current repository.
   */
  async grantTrust() {
    const id = await this.getRepoId();
    if (this.blacklist.has(id)) return false;
    this.localTrust.add(id);
    this._saveLocal();
    return true;
  }
}

let _manager = null;
export function getTrustManager() {
  if (!_manager) _manager = new TrustManager();
  return _manager;
}
