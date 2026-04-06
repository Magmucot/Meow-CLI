// ═══════════════════════════════════════════════════════════════════════════
// sessions.js — Meow CLI Session Management
// Save/restore full session state across terminal restarts
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SESSION_DIR } from "./config.js";
import { log, C, SUCCESS, MUTED, TEXT, TEXT_DIM, ACCENT, COLS } from "./ui.js";
import { timeAgo } from "./utils.js";

const MAX_SESSIONS = 20;

class SessionManager {
  constructor() {
    this.sessionId = null;
    this.dir = SESSION_DIR;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  // Create a new session
  create() {
    this.sessionId = crypto.randomUUID().slice(0, 8);
    return this.sessionId;
  }

  // Save session state
  save(state) {
    if (!this.sessionId) this.create();

    const file = path.join(this.dir, `${this.sessionId}.json`);
    const data = {
      id: this.sessionId,
      time: Date.now(),
      cwd: process.cwd(),
      model: state.model || "",
      profile: state.profile || "default",
      chat: state.chat || "default",
      messagesCount: (state.messages || []).length,
      messages: (state.messages || []).map(m => {
        // Strip large base64 images for storage
        if (m.role === "user" && Array.isArray(m.content)) {
          return {
            ...m,
            content: m.content.map(part =>
              part.type === "image_url" && part.image_url?.url?.startsWith("data:")
                ? { type: "image_url", image_url: { url: "[base64 image]", detail: part.image_url.detail } }
                : part
            ),
          };
        }
        return m;
      }),
    };

    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
      log.dim(`Session save failed: ${e.message}`);
    }

    this._prune();
  }

  // Load a session
  load(sessionId) {
    const file = path.join(this.dir, `${sessionId}.json`);
    if (!fs.existsSync(file)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      this.sessionId = sessionId;
      return data;
    } catch {
      return null;
    }
  }

  // List all sessions
  list() {
    const sessions = [];
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.dir, file), "utf8"));
          sessions.push({
            id: data.id,
            time: data.time,
            cwd: data.cwd,
            model: data.model,
            profile: data.profile,
            chat: data.chat,
            messagesCount: data.messagesCount || 0,
          });
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }

    return sessions.sort((a, b) => b.time - a.time);
  }

  // Delete a session
  delete(sessionId) {
    const file = path.join(this.dir, `${sessionId}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      return true;
    }
    return false;
  }

  // Prune old sessions
  _prune() {
    const sessions = this.list();
    if (sessions.length <= MAX_SESSIONS) return;

    const toDelete = sessions.slice(MAX_SESSIONS);
    for (const s of toDelete) {
      this.delete(s.id);
    }
  }

  // Print session list
  printList() {
    const sessions = this.list();

    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Sessions${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(55)}${C.reset}`);

    if (sessions.length === 0) {
      console.log(`  ${MUTED}No saved sessions${C.reset}`);
    } else {
      const current = this.sessionId;
      for (const s of sessions.slice(0, 15)) {
        const isCurrent = s.id === current;
        const indicator = isCurrent ? `${SUCCESS}●${C.reset}` : `${MUTED}○${C.reset}`;
        const idColor = isCurrent ? `${SUCCESS}${C.bold}` : TEXT;
        console.log(`  ${indicator} ${idColor}${s.id}${C.reset}  ${TEXT_DIM}${timeAgo(s.time)}${C.reset}  ${MUTED}${s.model}${C.reset}  ${MUTED}${s.messagesCount} msgs${C.reset}`);
        console.log(`    ${MUTED}${s.cwd}${C.reset}`);
      }
    }

    console.log(`  ${MUTED}${"─".repeat(55)}${C.reset}\n`);
  }
}


export { SessionManager };
