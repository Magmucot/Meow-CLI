
import {
  C,
  ACCENT,
  MUTED,
  log,
  printHelp,
  printStats,
  saveHistoryState,
  loadPins
} from "../../core.js";

const handleGeneral = async (ctx, input) => {
  if (input === "/exit") return { handled: true, exit: true };

  if (input === "/help") {
    printHelp(ctx.cfg);
    return { handled: true };
  }

  if (input === "/stats") {
    printStats(ctx.cfg, ctx.currentChat, ctx.history.length, loadPins().length);
    return { handled: true };
  }

  if (input === "/clear") {
    ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }];
    ctx.history = [];
    ctx.historyState.chats[ctx.currentChat] = [];
    ctx.pendingImages = [];
    saveHistoryState(ctx.historyState);
    log.ok("Chat context cleared.");
    ctx.refreshBanner();
    return { handled: true };
  }

  return null;
};

export { handleGeneral };
