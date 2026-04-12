import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SESSION_DIR } from "./config.js";
import { log, C, SUCCESS, MUTED, TEXT, TEXT_DIM, ACCENT, COLS } from "./ui.js";
import { timeAgo } from "./utils.js";

/** @type {number} Maximum number of sessions to keep */
const MAX_SESSIONS = 20;

/**
 * Manages persistent chat sessions, allowing users to save and resume conversations.
 */
class SessionManager {
  constructor() {
    this.sessionId = null;
    this.dir = SESSION_DIR;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Creates a new session ID.
   * @returns {string} The new session ID.
   */
  create() {
    this.sessionId = crypto.randomUUID().slice(0, 8);
    return this.sessionId;
  }

  /**
   * Saves the current session state to disk.
   * @param {Object} state - The session state to save.
   * @param {string} [state.model] - The model used in the session.
   * @param {string} [state.profile] - The profile name.
   * @param {string} [state.chat] - The chat mode.
   * @param {Array<Object>} [state.messages] - Conversation history.
   */
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

  /**
   * Loads a session by its ID.
   * @param {string} sessionId - The session ID to load.
   * @returns {Object|null} The session data or null if not found.
   */
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

  /**
   * Lists all available sessions.
   * @returns {Array<Object>} Sorted list of session metadata.
   */
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
        } catch { }
      }
    } catch { }

    return sessions.sort((a, b) => b.time - a.time);
  }

  /**
   * Deletes a session file.
   * @param {string} sessionId - ID of the session to delete.
   * @returns {boolean} True if deleted successfully.
   */
  delete(sessionId) {
    const file = path.join(this.dir, `${sessionId}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      return true;
    }
    return false;
  }

  /**
   * Prunes old sessions if the count exceeds MAX_SESSIONS.
   * @private
   */
  _prune() {
    const sessions = this.list();
    if (sessions.length <= MAX_SESSIONS) return;

    const toDelete = sessions.slice(MAX_SESSIONS);
    for (const s of toDelete) {
      this.delete(s.id);
    }
  }

  /**
   * Prints the list of sessions to the terminal.
   */
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
