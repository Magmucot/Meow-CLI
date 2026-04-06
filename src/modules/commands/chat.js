
import { log, makeChatName, saveHistoryState, printChatList } from "../../core.js";

const handleChat = async (ctx, input) => {
  if (!input.startsWith("/chat ") && input.trim() !== "/chat") return null;
  const parts = input.split(/\s+/);
  const cmd = parts[1] || "list";
  const name = parts.slice(2).join(" ");

  if (cmd === "list") {
    printChatList(ctx.historyState);
  } else if (cmd === "new") {
    const newName = name || makeChatName(ctx.historyState);
    if (ctx.historyState.chats[newName]) { log.err(`Chat '${newName}' already exists.`); }
    else {
      ctx.historyState.chats[newName] = [];
      ctx.historyState.current = newName;
      ctx.currentChat = newName;
      ctx.history = [];
      ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }];
      ctx.pendingImages = [];
      saveHistoryState(ctx.historyState);
      log.ok(`Created & switched to: ${newName}`);
    }
  } else if (cmd === "use") {
    if (!name) { log.err("Specify chat name."); }
    else if (!ctx.historyState.chats[name]) { log.err(`Chat '${name}' not found.`); }
    else {
      ctx.historyState.current = name;
      ctx.currentChat = name;
      ctx.history = ctx.historyState.chats[name] || [];
      ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }, ...ctx.history];
      ctx.pendingImages = [];
      saveHistoryState(ctx.historyState);
      log.ok(`Switched to: ${name}`);
    }
  } else if (cmd === "delete") {
    if (!name) { log.err("Specify chat name."); }
    else if (!ctx.historyState.chats[name]) { log.err(`Chat '${name}' not found.`); }
    else {
      delete ctx.historyState.chats[name];
      if (ctx.historyState.current === name) {
        const names = Object.keys(ctx.historyState.chats);
        const next = names[0] || "default";
        if (!ctx.historyState.chats[next]) ctx.historyState.chats[next] = [];
        ctx.historyState.current = next;
        ctx.currentChat = next;
        ctx.history = ctx.historyState.chats[next];
        ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }, ...ctx.history];
      }
      saveHistoryState(ctx.historyState);
      log.ok(`Deleted: ${name}`);
    }
  } else {
    log.err("Unknown /chat command. Use: list | new | use | delete");
  }

  return { handled: true };
};

export { handleChat };
