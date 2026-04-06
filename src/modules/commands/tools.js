
import fs from "fs";
import path from "path";
import { log, listDir, readFile, runShell, loadUndoState, saveUndoState } from "../../core.js";

const handleTools = async (ctx, input) => {
  if (input.startsWith("/undo")) {
    const parts = input.split(" ");
    const count = parts[1] ? parseInt(parts[1], 10) : 1;
    if (Number.isNaN(count) || count <= 0) { log.err("Usage: /undo [N]"); return { handled: true }; }
    const undoState = loadUndoState();
    if (undoState.length == 0) { log.warn("No changes to undo."); return { handled: true }; }
    const undoCount = Math.min(count, undoState.length);
    for (let i = 0; i < undoCount; i++) {
      const last = undoState.pop();
      if (!last) break;
      try {
        if (!last.existed) {
          if (fs.existsSync(last.path)) fs.unlinkSync(last.path);
          log.ok(`Undo: removed ${last.path}`);
        } else {
          fs.mkdirSync(path.dirname(last.path), { recursive: true });
          fs.writeFileSync(last.path, last.content, "utf8");
          log.ok(`Undo: restored ${last.path}`);
        }
      } catch (e) {
        log.err(`Undo failed: ${e.message}`);
      }
    }
    saveUndoState(undoState);
    return { handled: true };
  }

  if (input === "/list" || input.startsWith("/list ")) {
    const target = input.slice(5).trim() || ".";
    console.log(listDir(target));
    return { handled: true };
  }
  if (input === "/read" || input.startsWith("/read ")) {
    const target = input.slice(5).trim();
    if (!target) { log.err("Usage: /read <file>"); return { handled: true }; }
    console.log(readFile(target));
    return { handled: true };
  }
  if (input === "/shell" || input.startsWith("/shell ")) {
    const cmd = input.slice(6).trim();
    if (!cmd) { log.err("Usage: /shell <command>"); return { handled: true }; }
    console.log(await runShell(cmd, ctx.cfg.auto_yes));
    return { handled: true };
  }

  return null;
};

export { handleTools };
