import {
  ACCENT, ACCENT2, ACCENT3, SUCCESS, WARNING, ERROR, MUTED,
  TEXT, TEXT_DIM, AUTO_CLR, INFO, C, COLS, box, table, list, log, stripAnsi, 
  MEOW_GRADIENT, AI_GRADIENT
} from "./ui.js";
import { t } from "./config.js";
import { listPlugins } from "./plugins.js";

function banner(cfg, currentChat, historyLen, pinsCount = 0) {
  console.clear();
  const logoText = `
  ╔╦╗╔═╗╔═╗╦ ╦  ╔═╗╦  ╦
  ║║║║╣ ║ ║║║║  ║  ║  ║
  ╩ ╩╚═╝╚═╝╚╩╝  ╚═╝╩═╝╩
  `;
  console.log(MEOW_GRADIENT(logoText));
  console.log(`  ${MUTED(t(cfg, "banner_subtitle"))}`);
  console.log(`  ${MUTED("─".repeat(Math.min(COLS - 4, 50)))}`);
  const pairs = [
    [`model`,   `${ACCENT(cfg.model)}`],
    [`profile`, `${ACCENT2(cfg.profile)}`],
    [`chat`,    `${SUCCESS(currentChat)}`],
    [`msgs`,    `${TEXT_DIM(historyLen)}`],
  ];
  if (pinsCount > 0) pairs.push([`pins`, `${TEXT_DIM(pinsCount)}`]);
  const statusLine = pairs.map(([k, v]) => `${MUTED(k + ":")} ${v}`).join(`  ${MUTED("·")}  `);
  console.log(`  ${statusLine}`);
  if (!cfg.api_key) {
    console.log("");
    console.log(box(`${C.bold(WARNING(t(cfg, "api_key_missing_title")))}\n${TEXT_DIM(t(cfg, "api_key_missing_hint"))}`, { title: "⚠ Setup Required", color: "#DEB858", width: Math.min(COLS - 2, 55) }));
  }
  console.log(`\n  ${MUTED(t(cfg, "type_help"))}\n`);
}

function printHelp(cfg) {
  log.br();
  const sections = [
    { title: t(cfg, "help_title_chat"), items: [["/clear", t(cfg, "cmd_clear")], ["/reset", "Reset chat context"], ["/chat list", t(cfg, "cmd_chat_list")], ["/chat new [name]", t(cfg, "cmd_chat_new")], ["/chat use <name>", t(cfg, "cmd_chat_use")], ["/chat delete <name>", t(cfg, "cmd_chat_delete")]] },
    { title: t(cfg, "help_title_autopilot"), items: [["/autopilot <task>", t(cfg, "cmd_autopilot")], ["/ap <task>", t(cfg, "cmd_autopilot_short")], ["/ap-config", t(cfg, "cmd_ap_config")], ["/ap-limit <N>", t(cfg, "cmd_ap_limit")], ["/ap-errors <N>", t(cfg, "cmd_ap_errors")], ["/trigger <cmd|off>", t(cfg, "cmd_trigger")], ["Ctrl+C", t(cfg, "cmd_ctrl_c")]] },
    { title: t(cfg, "help_title_images"), items: [["/img <path> [text]", t(cfg, "cmd_img_path")], ["/img <url> [text]", t(cfg, "cmd_img_url")], ["{img:path} text", t(cfg, "cmd_img_inline")]] },
    { title: t(cfg, "help_title_tools"), items: [["/list <path>", t(cfg, "cmd_list")], ["/read <file>", t(cfg, "cmd_read")], ["/shell <cmd>", t(cfg, "cmd_shell")]] },
    { title: "🔒 Security & Context", items: [["/permissions", "Manage tool permissions"], ["/perm allow <tool>", "Always allow a tool"], ["/perm deny <tool>", "Always deny a tool"], ["/context", "Show project context (MEOW.md)"], ["/context edit", "Edit project MEOW.md"], ["/context reload", "Reload context into prompt"], ["/audit", "Show audit log"], ["/incognito on|off", "Incognito mode (no data persists)"]] },
    { title: "🔀 Agents & Automation", items: [["/lead [context]", "AI Lead Developer — continuous improvement"], ["/lead auto [context]", "Auto-mode: no prompts, picks tasks itself"], ["/delegate <task>", "Delegate task to parallel sub-agent"], ["/pair <mode>", "Pair programming (verbose/balanced/silent/off)"], ["/ci status", "Show CI/CD workflows"], ["/ci generate <desc>", "Generate GitHub Actions workflow"], ["/ci heal", "Self-heal failing tests"]] },
    { title: "🧠 Memory & Intelligence", items: [["/memory stats", "Show memory statistics"], ["/memory search <q>", "Search project memory"], ["/memory prefs", "Show learned preferences"], ["/memory clear", "Clear project memory"], ["/routing", "Smart model routing config"], ["/routing on|off", "Toggle dynamic model selection"]] },
    { title: "⏪ History & Sessions", items: [["/rewind [N]", "Undo last N file changes"], ["/rewind --list", "Show checkpoint history"], ["/session list", "Show saved sessions"], ["/session load <id>", "Resume a saved session"], ["/compact", "Compress conversation context"], ["/compact --ai", "AI-powered context compression"], ["/cost", "Show token usage & cost"], ["/cost total", "Show all-time cost"]] },
    { title: t(cfg, "help_title_settings"), items: [["/model [name]", `${t(cfg, "cmd_model")} ${MUTED("(" + cfg.model + ")")}`], ["/profile [name]", `${t(cfg, "cmd_profile")} ${MUTED("(" + cfg.profile + ")")}`], ["/assistant <cmd>", t(cfg, "cmd_assistant")], ["/temp [0.0-2.0]", t(cfg, "cmd_temp")], ["/key [sk-...]", t(cfg, "cmd_key")], ["/url [http...]", t(cfg, "cmd_url")], ["/config", t(cfg, "cmd_config")], ["/git [on|off]", t(cfg, "cmd_git")], ["/lang <ru|en>", "Switch UI language"], ["/preview start|stop", "Live dev server preview"]] },
    { title: t(cfg, "help_title_other"), items: [["/undo [N]", t(cfg, "cmd_undo")], ["/export <file>", t(cfg, "cmd_export")], ["/import <file>", t(cfg, "cmd_import")], ["/template <name>", t(cfg, "cmd_template")], ["/pins", t(cfg, "cmd_pins")], ["/pin [index]", t(cfg, "cmd_pin")], ["/vacuum [opts]", t(cfg, "cmd_vacuum")], ["/alias", t(cfg, "cmd_alias")], ["/plugin [cmd]", t(cfg, "cmd_plugin")], ["/stats", t(cfg, "cmd_stats")], ["/help", t(cfg, "cmd_help")], ["/exit", t(cfg, "cmd_exit")]] }
  ];
  for (const section of sections) {
    console.log(`  ${C.bold(AI_GRADIENT(stripAnsi(section.title)))}\n`);
    table(section.items.map(([cmd, desc]) => [`${TEXT.bold(cmd)}`, `${MUTED(desc)}`]), { indent: 4, colWidths: [24] });
    log.br();
  }
  const aliasEntries = Object.entries(cfg.aliases);
  if (aliasEntries.length > 0) {
    const aliasStr = aliasEntries.map(([a, b]) => `${TEXT_DIM(a)} ${MUTED("→")} ${TEXT_DIM(b)}`).join("  ");
    console.log(`  ${MUTED("aliases:")} ${aliasStr}\n`);
  }
}

function printStats(cfg, currentChat, historyLen, pinsCount = 0) {
  log.br();
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const vac = cfg.vacuum || {};
  const pluginSummary = getPluginSummary(cfg);
  const rows = [
    ["Chat", `${SUCCESS(currentChat)}`], ["Messages", `${TEXT(historyLen)}`], ["Model", `${ACCENT(cfg.model)}`], ["Profile", `${ACCENT2(cfg.profile)}`], ["Temperature", `${TEXT(profile.temperature)}`], ["API Base", `${MUTED(cfg.api_base)}`],
    ["API Key", cfg.api_key ? `${SUCCESS("set")} ${MUTED("(" + cfg.api_key.slice(0, 8) + "…)")}` : `${ERROR("not set")}`],
    ["Auto-yes", cfg.auto_yes ? `${SUCCESS("on")}` : `${MUTED("off")}`], ["Git Autocommit", cfg.git?.autocommit === false ? `${MUTED("off")}` : `${SUCCESS("on")}`], ["AP Limit", `${AUTO_CLR(cfg.autopilot?.max_iterations || 50)}`], ["Plugins", `${TEXT(pluginSummary)}`],
    ["Vacuum", `${vac.enabled ? SUCCESS("on") : MUTED("off")} ${MUTED("(drop " + (vac.drop_count || 0) + ", keep " + (vac.keep_last || 0) + ")")}`], ["Pins", `${TEXT(pinsCount)}`], ["CWD", `${MUTED(process.cwd())}`],
  ];
  console.log(`  ${C.bold(AI_GRADIENT(stripAnsi(t(cfg, "stats_title"))))}`);
  console.log(`  ${MUTED("─".repeat(50))}`);
  table(rows.map(([label, value]) => [`${TEXT_DIM(label)}`, value]), { colWidths: [18] });
  console.log(`  ${MUTED("─".repeat(50))}\n`);
}

function getPluginSummary(cfg) {
  const plugins = listPlugins();
  const total = plugins.length;
  if (total === 0) return `${MUTED("none")}`;
  const enabled = plugins.filter(p => p.enabled).length;
  const disabled = total - enabled;
  const disabledList = cfg.plugins?.disabled || [];
  const pending = disabledList.filter(name => !plugins.some(p => p.name === name)).length;
  const parts = [`${enabled}/${total}`];
  if (disabled > 0) parts.push(`${disabled} off`);
  if (pending > 0) parts.push(`${pending} missing`);
  return parts.join(` ${MUTED("·")} `);
}

function printChatList(state) {
  const names = Object.keys(state.chats || {}).sort();
  if (names.length === 0) { log.dim("No chats yet."); return; }
  log.br();
  console.log(`  ${C.bold(AI_GRADIENT("Chats"))}`);
  console.log(`  ${MUTED("─".repeat(45))}`);
  const rows = names.map(name => {
    const msgs = (state.chats[name] || []).length;
    const isCurrent = name === state.current;
    const indicator = isCurrent ? `${SUCCESS("●")}` : `${MUTED("○")}`;
    const nameColor = isCurrent ? SUCCESS.bold : TEXT;
    return [indicator, `${nameColor(name)}`, `${MUTED(msgs + " msgs")}`];
  });
  table(rows, { colSpacing: 1 });
  console.log(`  ${MUTED("─".repeat(45))}\n`);
}

function printConfig(cfg) {
  console.log("");
  console.log(`  ${C.bold(AI_GRADIENT("Configuration"))}`);
  console.log(`  ${MUTED("─".repeat(50))}`);
  const safe = { ...cfg, api_key: cfg.api_key ? cfg.api_key.slice(0, 8) + "…" : "(not set)" };
  const json = JSON.stringify(safe, null, 2);
  for (const line of json.split("\n")) {
    const colored = line.replace(/\"([^\"]+)\":/g, (m, p1) => `${ACCENT("\"" + p1 + "\"")}:`).replace(/: \"([^\"]+)\"/g, (m, p1) => `: ${SUCCESS("\"" + p1 + "\"")}`).replace(/: (\d+\.?\d*)/g, (m, p1) => `: ${WARNING(p1)}`).replace(/: (true|false)/g, (m, p1) => `: ${INFO(p1)}`).replace(/: (null)/g, (m, p1) => `: ${MUTED(p1)}`);
    console.log(`  ${colored}`);
  }
  console.log(`  ${MUTED("─".repeat(50))}\n`);
}

function printAutopilotConfig(cfg) {
  const ap = cfg.autopilot || {};
  log.br();
  console.log(`  ${C.bold(AI_GRADIENT("🤖 Autopilot Configuration"))}`);
  console.log(`  ${MUTED("─".repeat(45))}`);
  const rows = [["Max iterations", `${AUTO_CLR(ap.max_iterations || 50)}`], ["Max errors", `${AUTO_CLR(ap.max_errors || 5)}`], ["Retry delay", `${AUTO_CLR((ap.retry_delay_ms || 2000) + "ms")}`], ["Save logs", ap.save_log !== false ? `${SUCCESS("yes")}` : `${MUTED("no")}`], ["Trigger cmd", ap.trigger_cmd ? `${TEXT(ap.trigger_cmd)}` : `${MUTED("(off)")}`], ["Log dir", `${MUTED("~/.meowcli/data/logs/")}`]];
  table(rows.map(([label, value]) => [`${TEXT_DIM(label)}`, value]), { colWidths: [18] });
  console.log(`  ${MUTED("─".repeat(45))}\n`);
}

function makePrompt(cfg, currentChat, historyLen = 0) {
  const modelShort = cfg.model.length > 18 ? cfg.model.slice(0, 15) + "…" : cfg.model;
  return `${currentChat} · ${modelShort} · ${historyLen} msgs`;
}

export { banner, printHelp, printStats, printChatList, printConfig, printAutopilotConfig, makePrompt };
