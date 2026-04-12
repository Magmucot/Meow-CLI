import { DEFAULT_CONFIG, log, saveConfig } from "../../core.js";

/**
 * Handles the /vacuum command for managing context auto-cleaning settings.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleVacuum = async (ctx, input) => {
  if (!input.startsWith("/vacuum")) return null;
  const args = input.split(" ").slice(1).filter(Boolean);
  if (!ctx.cfg.vacuum) ctx.cfg.vacuum = { ...DEFAULT_CONFIG.vacuum };
  if (args.length === 0) {
    log.info(`Vacuum: ${ctx.cfg.vacuum.enabled ? "on" : "off"}, drop ${ctx.cfg.vacuum.drop_count}, keep ${ctx.cfg.vacuum.keep_last}`);
    return { handled: true };
  }
  if (args[0] === "on" || args[0] === "off") {
    ctx.cfg.vacuum.enabled = args[0] === "on";
  }
  for (const arg of args) {
    if (arg.startsWith("drop:")) {
      const v = parseInt(arg.split(":")[1]);
      if (!Number.isNaN(v) && v >= 0) ctx.cfg.vacuum.drop_count = v;
    }
    if (arg.startsWith("keep:")) {
      const v = parseInt(arg.split(":")[1]);
      if (!Number.isNaN(v) && v >= 0) ctx.cfg.vacuum.keep_last = v;
    }
  }
  saveConfig(ctx.cfg);
  log.ok(`Vacuum → ${ctx.cfg.vacuum.enabled ? "on" : "off"}, drop ${ctx.cfg.vacuum.drop_count}, keep ${ctx.cfg.vacuum.keep_last}`);
  ctx.refreshBanner();
  return { handled: true };
};

export { handleVacuum };
