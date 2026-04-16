import { AUTO_CLR, C, log, Autopilot, printAutopilotConfig, saveConfig } from "../../core.js";

/**
 * Autopilot and trigger commands.
 */
const commands = [
  {
    name: ["/autopilot", "/ap"],
    execute: async (ctx, { rest }) => {
      const task = rest.trim();
      if (!task) {
        log.err("Usage: /autopilot <task description>");
        log.dim("Example: /autopilot создай REST API на Express с CRUD для пользователей");
        return { handled: true };
      }

      if (!ctx.cfg.api_key) {
        log.err("API Key not set. Use /key to set it first.");
        return { handled: true };
      }

      const autopilot = new Autopilot(ctx.cfg, ctx.messages, ctx.saveState);
      ctx.activeAutopilot = autopilot;

      try {
        await autopilot.run(task);
      } catch (e) {
        log.err(`Autopilot crashed: ${e.message}`);
      }

      ctx.activeAutopilot = null;
      ctx.saveState();
      return { handled: true };
    }
  },
  {
    name: "/ap-config",
    execute: async (ctx) => {
      printAutopilotConfig(ctx.cfg);
      return { handled: true };
    }
  },
  {
    name: "/ap-limit",
    execute: async (ctx, { args }) => {
      const val = parseInt(args[0]);
      if (!isNaN(val) && val > 0 && val <= 500) {
        if (!ctx.cfg.autopilot) ctx.cfg.autopilot = {};
        ctx.cfg.autopilot.max_iterations = val;
        saveConfig(ctx.cfg);
        log.ok(`Autopilot max iterations → ${AUTO_CLR}${val}${C.reset}`);
      } else {
        log.err("Value must be 1–500");
      }
      return { handled: true };
    }
  },
  {
    name: "/ap-errors",
    execute: async (ctx, { args }) => {
      const val = parseInt(args[0]);
      if (!isNaN(val) && val > 0 && val <= 50) {
        if (!ctx.cfg.autopilot) ctx.cfg.autopilot = {};
        ctx.cfg.autopilot.max_errors = val;
        saveConfig(ctx.cfg);
        log.ok(`Autopilot max errors → ${AUTO_CLR}${val}${C.reset}`);
      } else {
        log.err("Value must be 1–50");
      }
      return { handled: true };
    }
  },
  {
    name: "/trigger",
    execute: async (ctx, { rest }) => {
      const arg = rest.trim();
      if (!ctx.cfg.autopilot) ctx.cfg.autopilot = {};
      if (!arg || arg.toLowerCase() === "off") {
        ctx.cfg.autopilot.trigger_cmd = "";
        saveConfig(ctx.cfg);
        log.ok("Autopilot trigger disabled");
      } else {
        ctx.cfg.autopilot.trigger_cmd = arg;
        saveConfig(ctx.cfg);
        log.ok(`Autopilot trigger set → ${AUTO_CLR}${arg}${C.reset}`);
      }
      return { handled: true };
    }
  }
];

export { commands };
