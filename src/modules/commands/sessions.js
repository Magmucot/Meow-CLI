import { log, C, SUCCESS, MUTED } from "../../core.js";

/**
 * Handles the /session command for managing persistent chat sessions.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleSessions = async (ctx, input) => {
  if (!input.startsWith("/session")) return null;

  const parts = input.split(/\s+/);
  const cmd = parts[1] || "list";

  if (!ctx.sessionMgr) {
    log.warn("Session manager not initialized");
    return { handled: true };
  }

  if (cmd === "list") {
    ctx.sessionMgr.printList();
    return { handled: true };
  }

  if (cmd === "load") {
    const id = parts[2];
    if (!id) { log.err("Usage: /session load <id>"); return { handled: true }; }
    const data = ctx.sessionMgr.load(id);
    if (!data) { log.err(`Session '${id}' not found`); return { handled: true }; }

    ctx.messages = data.messages || [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }];
    ctx.history = ctx.messages.filter(m => m.role !== "system");
    log.ok(`Session '${id}' loaded (${data.messagesCount} messages)`);
    if (data.cwd !== process.cwd()) {
      log.dim(`Note: session was in ${data.cwd}`);
    }
    return { handled: true };
  }

  if (cmd === "delete") {
    const id = parts[2];
    if (!id) { log.err("Usage: /session delete <id>"); return { handled: true }; }
    if (ctx.sessionMgr.delete(id)) {
      log.ok(`Session '${id}' deleted`);
    } else {
      log.err(`Session '${id}' not found`);
    }
    return { handled: true };
  }

  if (cmd === "save") {
    ctx.sessionMgr.save({
      model: ctx.cfg.model,
      profile: ctx.cfg.profile,
      chat: ctx.currentChat,
      messages: ctx.messages,
    });
    log.ok(`Session saved: ${ctx.sessionMgr.sessionId}`);
    return { handled: true };
  }

  log.err("Usage: /session <list|load|delete|save> [id]");
  return { handled: true };
};

export { handleSessions };
