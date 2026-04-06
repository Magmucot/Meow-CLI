import fs from "fs";
import path from "path";
import {
  ACCENT,
  ACCENT2,
  MUTED,
  SUCCESS,
  WARNING,
  TEXT,
  TEXT_DIM,
  C,
  box,
  COLS,
  log,
  saveConfig,
  t,
  PLUGIN_DIR,
  listPlugins,
  getPluginDirs,
  loadPlugins,
  enablePlugin,
  disablePlugin,
} from "../../core.js";

const handlePlugins = async (ctx, input) => {
  if (!input.startsWith("/plugin")) return null;

  const parts = input.split(/\s+/);
  const cmd = parts[1] || "list";
  const name = parts.slice(2).join(" ").trim();

  if (cmd === "list") {
    const plugins = listPlugins();
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Plugins${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    if (plugins.length === 0) {
      console.log(`  ${MUTED}(none)${C.reset}`);
    } else {
      for (const plugin of plugins) {
        const status = plugin.enabled ? `${SUCCESS}●${C.reset}` : `${MUTED}○${C.reset}`;
        const nameColor = plugin.enabled ? `${SUCCESS}${C.bold}` : `${TEXT_DIM}`;
        const meta = plugin.version ? `${MUTED}v${plugin.version}${C.reset}` : "";
        const desc = plugin.description ? `${TEXT_DIM}${plugin.description}${C.reset}` : `${MUTED}(no description)${C.reset}`;
        console.log(`  ${status} ${nameColor}${plugin.name}${C.reset} ${meta}`);
        console.log(`     ${desc}`);
        if (plugin.error) console.log(`     ${WARNING}${plugin.error}${C.reset}`);
      }
    }
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    console.log(`  ${MUTED}Dirs:${C.reset} ${TEXT_DIM}${getPluginDirs().join(" | ")}${C.reset}`);
    console.log("");
    return { handled: true };
  }

  if (cmd === "enable") {
    if (!name) { log.err("Usage: /plugin enable <name>"); return { handled: true }; }
    enablePlugin(ctx.cfg, name);
    saveConfig(ctx.cfg);
    await loadPlugins(ctx.cfg, ctx);
    log.ok(`Plugin enabled: ${name}`);
    return { handled: true };
  }

  if (cmd === "disable") {
    if (!name) { log.err("Usage: /plugin disable <name>"); return { handled: true }; }
    disablePlugin(ctx.cfg, name);
    saveConfig(ctx.cfg);
    await loadPlugins(ctx.cfg, ctx);
    log.ok(`Plugin disabled: ${name}`);
    return { handled: true };
  }

  if (cmd === "reload") {
    await loadPlugins(ctx.cfg, ctx);
    log.ok("Plugins reloaded");
    return { handled: true };
  }

  if (cmd === "dir") {
    console.log("");
    console.log(box(`Drop .js/.mjs/.cjs files here:\n${TEXT_DIM}${PLUGIN_DIR}${C.reset}`, { title: "🔌 Plugin directory", color: ACCENT2, width: Math.min(COLS - 2, 70) }));
    console.log("");
    return { handled: true };
  }

  log.err("Unknown /plugin command. Use: list | enable | disable | reload | dir");
  return { handled: true };
};

export { handlePlugins };
