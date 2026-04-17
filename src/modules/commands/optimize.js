import { ACCENT, MUTED, SUCCESS, WARNING, C, log, saveConfig } from "../../core.js";

/**
 * Commands for Prompt Optimizer.
 */
const commands = [
  {
    name: ["/optimize", "/opt"],
    execute: async (ctx, { rest }) => {
      const parts = rest.split(" ").map(p => p.trim()).filter(Boolean);
      const sub = parts[0]?.toLowerCase();

      if (!ctx.cfg.prompt_optimizer) {
        ctx.cfg.prompt_optimizer = { enabled: false, model: "", verbose: true };
      }

      if (!sub) {
        const status = ctx.cfg.prompt_optimizer.enabled ? `${SUCCESS}ON${C.reset}` : `${WARNING}OFF${C.reset}`;
        log.info(`Prompt Optimizer is ${status}`);
        log.dim(`Usage: /opt [on|off] | /opt model <name> | /opt verbose [on|off]`);
        return { handled: true };
      }

      if (sub === "on" || sub === "off") {
        ctx.cfg.prompt_optimizer.enabled = sub === "on";
        saveConfig(ctx.cfg);
        log.ok(`Prompt Optimizer → ${sub === "on" ? SUCCESS + "ON" : WARNING + "OFF"}${C.reset}`);
        return { handled: true };
      }

      if (sub === "model") {
        const model = parts[1];
        if (model) {
          ctx.cfg.prompt_optimizer.model = model === "default" ? "" : model;
          saveConfig(ctx.cfg);
          log.ok(`Prompt Optimizer model → ${ACCENT}${model}${C.reset}`);
        } else {
          log.info(`Prompt Optimizer model: ${ACCENT}${ctx.cfg.prompt_optimizer.model || "default (same as main)"}${C.reset}`);
        }
        return { handled: true };
      }

      if (sub === "verbose") {
        const mode = parts[1]?.toLowerCase();
        if (mode === "on" || mode === "off") {
          ctx.cfg.prompt_optimizer.verbose = mode === "on";
          saveConfig(ctx.cfg);
          log.ok(`Prompt Optimizer verbose → ${mode}`);
        } else {
          log.info(`Prompt Optimizer verbose: ${ctx.cfg.prompt_optimizer.verbose ? "on" : "off"}`);
        }
        return { handled: true };
      }

      log.err("Unknown sub-command. Try: /opt [on|off], /opt model <name>, /opt verbose [on|off]");
      return { handled: true };
    }
  }
];

export { commands };
