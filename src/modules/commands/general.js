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

/**
 * General CLI commands.
 */
const commands = [
  {
    name: "/exit",
    execute: async () => ({ handled: true, exit: true })
  },
  {
    name: "/help",
    execute: async (ctx) => {
      printHelp(ctx.cfg);
      return { handled: true };
    }
  },
  {
    name: "/stats",
    execute: async (ctx) => {
      printStats(ctx.cfg, ctx.currentChat, ctx.history.length, loadPins().length);
      return { handled: true };
    }
  },
  {
    name: "/clear",
    execute: async (ctx) => {
      ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }];
      ctx.history = [];
      ctx.historyState.chats[ctx.currentChat] = [];
      ctx.pendingImages = [];
      saveHistoryState(ctx.historyState);
      log.ok("Chat context cleared.");
      ctx.refreshBanner();
      return { handled: true };
    }
  }
];

export { commands };
