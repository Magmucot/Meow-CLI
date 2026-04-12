// ═══════════════════════════════════════════════════════════════════════════
// smart/ux.js — Enhanced UX Features
// Desktop notifications, live preview, pair programming mode
// ═══════════════════════════════════════════════════════════════════════════

import { exec, execSync } from "child_process";
import path from "path";
import os from "os";
import {
  log, C, ACCENT, ACCENT2, MUTED, TEXT, TEXT_DIM, SUCCESS, ERROR, WARNING, INFO, TOOL_CLR, box, COLS,
  colorDiff, progressBar
} from "../ui.js";

// ─── Desktop Notifications ──────────────────────────────────────────────────

function notify(title, message, options = {}) {
  const { sound = false, urgency = "normal" } = options;
  const platform = os.platform();
  const escapedTitle = (title || "").replace(/"/g, '\\"').slice(0, 100);
  const escapedMsg = (message || "").replace(/"/g, '\\"').slice(0, 200);

  try {
    if (platform === "darwin") {
      const soundFlag = sound ? ' sound name "default"' : "";
      exec(`osascript -e 'display notification "${escapedMsg}" with title "${escapedTitle}"${soundFlag}'`);
    } else if (platform === "linux") {
      const urgencyFlag = urgency === "critical" ? "-u critical" : "";
      exec(`notify-send ${urgencyFlag} "${escapedTitle}" "${escapedMsg}" 2>/dev/null`);
    } else if (platform === "win32") {
      const ps = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');` +
        `[System.Windows.Forms.MessageBox]::Show('${escapedMsg}','${escapedTitle}')`;
      exec(`powershell -command "${ps}" 2>NUL`, { timeout: 5000 });
    }
  } catch {}
}

function notifyTaskComplete(task, duration) {
  notify("Meow CLI ✅", `Task completed: ${task.slice(0, 60)} (${duration})`);
}

function notifyError(error) {
  notify("Meow CLI ❌", `Error: ${error.slice(0, 100)}`, { urgency: "critical" });
}

function notifyAutopilotDone(stats) {
  notify("Meow CLI 🤖", `Autopilot done: ${stats.completed || 0} tasks, ${stats.duration || ""}`, { sound: true });
}

// ─── Live Preview for Frontend ──────────────────────────────────────────────

class LivePreview {
  constructor() {
    this.serverProcess = null;
    this.port = null;
    this.type = null;
  }

  detect() {
    const cwd = process.cwd();
    try {
      const pkg = JSON.parse(require("fs").readFileSync(path.join(cwd, "package.json"), "utf8"));
      const scripts = pkg.scripts || {};
      if (scripts.dev) return { cmd: "npm run dev", type: "npm" };
      if (scripts.start) return { cmd: "npm start", type: "npm" };
    } catch {}
    return null;
  }

  start() {
    const config = this.detect();
    if (!config) return { success: false, error: "No dev server detected" };
    if (this.serverProcess) return { success: false, error: "Server already running" };

    try {
      this.serverProcess = exec(config.cmd, { cwd: process.cwd() });
      this.type = config.type;
      this.serverProcess.on("error", () => { this.serverProcess = null; });
      this.serverProcess.on("exit", () => { this.serverProcess = null; });
      return { success: true, cmd: config.cmd, pid: this.serverProcess.pid };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  stop() {
    if (!this.serverProcess) return { success: false, error: "No server running" };
    try { this.serverProcess.kill(); this.serverProcess = null; return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  }

  status() {
    return { running: !!this.serverProcess, type: this.type, pid: this.serverProcess?.pid || null };
  }
}

// ─── Pair Programming Mode ──────────────────────────────────────────────────

const PairMode = {
  OFF: "off",
  VERBOSE: "verbose",
  BALANCED: "balanced",
  SILENT: "silent",
};

class PairProgrammer {
  constructor(mode = PairMode.BALANCED) {
    this.mode = mode;
    this.commentQueue = [];
  }

  setMode(mode) {
    if (Object.values(PairMode).includes(mode)) this.mode = mode;
  }

  getSystemSuffix() {
    switch (this.mode) {
      case PairMode.VERBOSE: return "\n\n[PAIR MODE: VERBOSE] Explain every decision in detail. Before each tool call, explain WHY you're doing it. After each change, explain what you changed and alternatives you considered. Think out loud like a senior engineer pair-programming with a junior.";
      case PairMode.BALANCED: return "\n\n[PAIR MODE: BALANCED] Briefly explain your approach before starting. Comment on significant decisions. Flag any trade-offs or risks. Keep explanations concise.";
      case PairMode.SILENT: return "\n\n[PAIR MODE: SILENT] Minimal commentary. Just do the task. Only explain if something unexpected happens.";
      default: return "";
    }
  }

  printModeChange() {
    const icons = { [PairMode.OFF]: "🔇", [PairMode.VERBOSE]: "🗣️", [PairMode.BALANCED]: "💬", [PairMode.SILENT]: "🤫" };
    log.ok(`Pair mode: ${icons[this.mode] || ""} ${this.mode}`);
  }
}

// ─── Smart Tab Completion ───────────────────────────────────────────────────

const ALL_COMMANDS = [
  "/help", "/clear", "/exit", "/model", "/profile", "/temp", "/key", "/url",
  "/config", "/saveconfig", "/lang", "/stats", "/alias",
  "/chat list", "/chat new", "/chat use", "/chat delete",
  "/autopilot", "/ap-config", "/ap-limit", "/ap-errors", "/trigger",
  "/img", "/list", "/read", "/shell", "/undo",
  "/permissions", "/perm allow", "/perm deny", "/perm ask", "/perm reset",
  "/context", "/context edit", "/context reload",
  "/rewind", "/checkpoint",
  "/session list", "/session load", "/session save", "/session delete",
  "/compact", "/compact --ai",
  "/cost", "/cost total", "/cost reset",
  "/plugin list", "/plugin enable", "/plugin disable", "/plugin reload",
  "/export", "/import", "/template",
  "/pins", "/pin", "/vacuum",
  "/assistant list", "/assistant new", "/assistant show", "/assistant use",
  "/git", "/git on", "/git off", "/git prefix", "/git ai",
  "/lead", "/lead auto",
  "/delegate",
  "/memory", "/memory stats", "/memory search", "/memory clear",
  "/pair", "/pair verbose", "/pair balanced", "/pair silent", "/pair off",
  "/preview start", "/preview stop", "/preview status",
  "/ci status", "/ci generate", "/ci heal",
];

function completeCommand(partial) {
  if (!partial) return ALL_COMMANDS.filter(c => c.startsWith("/")).slice(0, 15);
  const lower = partial.toLowerCase();
  return ALL_COMMANDS.filter(c => c.toLowerCase().startsWith(lower));
}

function completeFilePath(partial) {
  const fs = require("fs");
  try {
    const dir = path.dirname(partial) || ".";
    const prefix = path.basename(partial);
    const entries = fs.readdirSync(dir === "" ? "." : dir)
      .filter(e => e.startsWith(prefix))
      .map(e => {
        const full = path.join(dir, e);
        try {
          return fs.statSync(full).isDirectory() ? full + "/" : full;
        } catch { return full; }
      });
    return entries.slice(0, 20);
  } catch { return []; }
}

function complete(input) {
  if (input.startsWith("/")) return completeCommand(input);
  return completeFilePath(input);
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _preview = null;
let _pair = null;

function getLivePreview() { if (!_preview) _preview = new LivePreview(); return _preview; }
function getPairProgrammer() { if (!_pair) _pair = new PairProgrammer(); return _pair; }

export {
  notify, notifyTaskComplete, notifyError, notifyAutopilotDone,
  LivePreview, getLivePreview,
  PairProgrammer, PairMode, getPairProgrammer,
  completeCommand, completeFilePath, complete,
  colorDiff, progressBar,
  ALL_COMMANDS,
};
