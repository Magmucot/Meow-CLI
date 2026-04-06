// ═══════════════════════════════════════════════════════════════════════════
// checkpoints.js — Meow CLI Checkpoint System
// Auto-saves file snapshots before changes, supports /rewind
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CHECKPOINT_DIR } from "./config.js";
import { log, C, SUCCESS, MUTED, TEXT, TEXT_DIM, ACCENT, WARNING, box, COLS } from "./ui.js";
import { timeAgo } from "./utils.js";

const MAX_CHECKPOINTS = 50;

class CheckpointManager {
  constructor(sessionId = null) {
    this.sessionId = sessionId || crypto.randomUUID().slice(0, 8);
    this.dir = path.join(CHECKPOINT_DIR, this.sessionId);
    this.indexFile = path.join(this.dir, "index.json");
    this.checkpoints = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.indexFile)) {
        this.checkpoints = JSON.parse(fs.readFileSync(this.indexFile, "utf8"));
      }
    } catch {
      this.checkpoints = [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.indexFile, JSON.stringify(this.checkpoints, null, 2));
    } catch (e) {
      log.dim(`Checkpoint save failed: ${e.message}`);
    }
  }

  // Save a checkpoint before modifying files
  create(description, filePaths) {
    const id = this.checkpoints.length;
    const snapshots = {};

    for (const filePath of filePaths) {
      const resolved = path.resolve(filePath);
      try {
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          const content = fs.readFileSync(resolved, "utf8");
          const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
          const snapFile = path.join(this.dir, `${id}_${hash}`);
          fs.mkdirSync(this.dir, { recursive: true });
          fs.writeFileSync(snapFile, content, "utf8");
          snapshots[resolved] = { snapFile, existed: true, size: content.length };
        } else {
          snapshots[resolved] = { snapFile: null, existed: false, size: 0 };
        }
      } catch (e) {
        snapshots[resolved] = { snapFile: null, existed: false, error: e.message };
      }
    }

    const checkpoint = {
      id,
      description,
      time: Date.now(),
      files: snapshots,
      cwd: process.cwd(),
    };

    this.checkpoints.push(checkpoint);

    // Prune old checkpoints
    while (this.checkpoints.length > MAX_CHECKPOINTS) {
      const old = this.checkpoints.shift();
      this._cleanupCheckpoint(old);
    }

    this._save();
    return checkpoint;
  }

  _cleanupCheckpoint(cp) {
    if (!cp?.files) return;
    for (const info of Object.values(cp.files)) {
      if (info.snapFile) {
        try { fs.unlinkSync(info.snapFile); } catch { /* ignore */ }
      }
    }
  }

  // Rewind to a specific checkpoint
  rewind(steps = 1) {
    if (this.checkpoints.length === 0) {
      return { success: false, message: "No checkpoints available." };
    }

    const targetIndex = Math.max(0, this.checkpoints.length - steps);
    const toRestore = this.checkpoints.slice(targetIndex);
    const restored = [];
    const errors = [];

    // Restore files from the most recent checkpoint being reverted
    // We go backwards: restore to the state BEFORE the target checkpoint
    for (let i = toRestore.length - 1; i >= 0; i--) {
      const cp = toRestore[i];
      for (const [filePath, info] of Object.entries(cp.files)) {
        try {
          if (info.existed && info.snapFile && fs.existsSync(info.snapFile)) {
            const content = fs.readFileSync(info.snapFile, "utf8");
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content, "utf8");
            restored.push(filePath);
          } else if (!info.existed) {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              restored.push(filePath + " (deleted)");
            }
          }
        } catch (e) {
          errors.push(`${filePath}: ${e.message}`);
        }
      }
    }

    // Remove rewound checkpoints
    this.checkpoints = this.checkpoints.slice(0, targetIndex);
    this._save();

    return {
      success: true,
      restored,
      errors,
      stepsRewound: toRestore.length,
      remaining: this.checkpoints.length,
    };
  }

  // List all checkpoints
  list() {
    return this.checkpoints.map(cp => ({
      id: cp.id,
      description: cp.description,
      time: cp.time,
      fileCount: Object.keys(cp.files).length,
      files: Object.keys(cp.files).map(f => path.relative(cp.cwd || process.cwd(), f)),
    }));
  }

  // Print checkpoint list
  printList() {
    const list = this.list();

    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Checkpoints${C.reset} ${MUTED}(session: ${this.sessionId})${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

    if (list.length === 0) {
      console.log(`  ${MUTED}No checkpoints yet${C.reset}`);
    } else {
      for (const cp of list.slice(-20)) {
        const filesStr = cp.files.slice(0, 3).join(", ") + (cp.files.length > 3 ? ` +${cp.files.length - 3}` : "");
        console.log(`  ${TEXT}#${cp.id}${C.reset} ${TEXT_DIM}${timeAgo(cp.time)}${C.reset} ${MUTED}${cp.description.slice(0, 40)}${C.reset}`);
        console.log(`    ${MUTED}files:${C.reset} ${TEXT_DIM}${filesStr}${C.reset}`);
      }
    }

    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    console.log(`  ${MUTED}Total: ${list.length} checkpoints${C.reset}`);
    console.log("");
  }

  get count() {
    return this.checkpoints.length;
  }
}


export { CheckpointManager, MAX_CHECKPOINTS };
