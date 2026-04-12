import {
  DEFAULT_CONFIG,
  ACCENT,
  ACCENT2,
  WARNING,
  MUTED,
  TEXT,
  TEXT_DIM,
  C,
  box,
  COLS,
  log,
  ASSIST_DIR,
  saveAssistantProfile,
  loadConfig,
  saveConfig
} from "../../core.js";

/**
 * Handles /assistant commands for managing assistant profiles.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleAssistant = async (ctx, input) => {
  if (!input.startsWith("/assistant ")) return null;

  const rest = input.slice(11).trim();
  const [sub, ...args] = rest.split(" ");
  if (!sub) {
    log.err("Usage: /assistant <list|new|show|use>");
    return { handled: true };
  }

  if (sub === "list") {
    const names = Object.keys(ctx.cfg.profiles || {})
      .filter(name => !DEFAULT_CONFIG.profiles[name])
      .sort();
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Assistants${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    if (names.length === 0) {
      console.log(`  ${MUTED}(none)${C.reset}`);
    } else {
      for (const name of names) console.log(`  ${TEXT}${name}${C.reset}`);
    }
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    console.log(`  ${MUTED}Dir:${C.reset} ${TEXT_DIM}${ASSIST_DIR}${C.reset}`);
    console.log("");
    return { handled: true };
  }

  if (sub === "use") {
    const name = args.join(" ").trim();
    if (!name) { log.err("Usage: /assistant use <name>"); return { handled: true }; }
    if (!ctx.cfg.profiles[name]) { log.err(`Assistant '${name}' not found.`); return { handled: true }; }
    ctx.cfg.profile = name; saveConfig(ctx.cfg);
    ctx.messages[0] = { role: "system", content: ctx.cfg.profiles[name].system };
    log.ok(`Assistant active → ${ACCENT2}${name}${C.reset}`);
    return { handled: true };
  }

  if (sub === "show") {
    const name = args.join(" ").trim();
    if (!name) { log.err("Usage: /assistant show <name>"); return { handled: true }; }
    const profile = ctx.cfg.profiles[name];
    if (!profile) { log.err(`Assistant '${name}' not found.`); return { handled: true }; }
    console.log("");
    console.log(box(
      `${ACCENT}${C.bold}${name}${C.reset}\n${MUTED}temp:${C.reset} ${WARNING}${profile.temperature}${C.reset}\n\n${TEXT}${profile.system}${C.reset}`,
      { title: "🤖 Assistant", color: ACCENT2, width: Math.min(COLS - 2, 70) }
    ));
    console.log("");
    return { handled: true };
  }

  if (sub === "new") {
    const name = args[0];
    if (!name) { log.err("Usage: /assistant new <name> [temp:<num>] <system>"); return { handled: true }; }
    const tempArg = args.find(a => a.startsWith("temp:"));
    const temperature = tempArg ? parseFloat(tempArg.split(":")[1]) : (ctx.cfg.profiles[ctx.cfg.profile]?.temperature ?? 0.2);
    const system = args.filter(a => !a.startsWith("temp:")).slice(1).join(" ").trim();
    if (!system) { log.err("System prompt required after name."); return { handled: true }; }
    if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
      log.err("Temperature must be 0.0 – 2.0");
      return { handled: true };
    }
    try {
      const file = saveAssistantProfile(name, system, temperature);
      ctx.cfg = loadConfig();
      if (ctx.cfg.profile === name) {
        ctx.messages[0] = { role: "system", content: ctx.cfg.profiles[name].system };
      }
      log.ok(`Assistant saved: ${file}`);
    } catch (e) {
      log.err(`Save failed: ${e.message}`);
    }
    return { handled: true };
  }

  log.err("Unknown /assistant command. Use: list | new | show | use");
  return { handled: true };
};

export { handleAssistant };
