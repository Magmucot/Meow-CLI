// ═══════════════════════════════════════════════════════════════════════════
// screens.js — Meow CLI Screens (Claude Code–inspired redesign)
// ═══════════════════════════════════════════════════════════════════════════

import {
  ACCENT, ACCENT2, ACCENT3, SUCCESS, WARNING, ERROR, MUTED,
  TEXT, TEXT_DIM, AUTO_CLR, INFO, C, COLS, box, log, stripAnsi
} from "./ui.js";
import { t } from "./config.js";
import { listPlugins } from "./plugins.js";

// ─── Banner (Claude Code style — clean, compact) ───────────────────────────

function banner(cfg, currentChat, historyLen, pinsCount = 0) {
  console.clear();

  // Minimal ASCII art — warm terracotta accent
  const logo = [
    `${ACCENT}${C.bold}  ╔╦╗╔═╗╔═╗╦ ╦  ╔═╗╦  ╦${C.reset}`,
    `${ACCENT}${C.bold}  ║║║║╣ ║ ║║║║  ║  ║  ║${C.reset}`,
    `${ACCENT}${C.bold}  ╩ ╩╚═╝╚═╝╚╩╝  ╚═╝╩═╝╩${C.reset}`,
  ];
  logo.forEach(l => console.log(l));

  console.log(`\n  ${MUTED}${t(cfg, "banner_subtitle")}${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);

  // Status line — Claude Code style: compact key:value pairs
  const pairs = [
    [`model`,   `${ACCENT}${cfg.model}${C.reset}`],
    [`profile`, `${ACCENT2}${cfg.profile}${C.reset}`],
    [`chat`,    `${SUCCESS}${currentChat}${C.reset}`],
    [`msgs`,    `${TEXT_DIM}${historyLen}${C.reset}`],
  ];
  if (pinsCount > 0) pairs.push([`pins`, `${TEXT_DIM}${pinsCount}${C.reset}`]);

  const statusLine = pairs
    .map(([k, v]) => `${MUTED}${k}:${C.reset} ${v}`)
    .join(`  ${MUTED}·${C.reset}  `);
  console.log(`  ${statusLine}`);

  // API key warning
  if (!cfg.api_key) {
    console.log("");
    console.log(box(
      `${WARNING}${C.bold}${t(cfg, "api_key_missing_title")}${C.reset}\n${TEXT_DIM}${t(cfg, "api_key_missing_hint")}${C.reset}`,
      { title: "⚠ Setup Required", color: WARNING, width: Math.min(COLS - 2, 55) }
    ));
  }

  console.log(`\n  ${MUTED}${t(cfg, "type_help")}${C.reset}\n`);
}

// ─── Help Screen (Claude Code style — grouped, clean) ──────────────────────

function printHelp(cfg) {
  console.log("");

  const sections = [
    {
      title: `💬 ${t(cfg, "help_title_chat")}`,
      items: [
        ["/clear",              t(cfg, "cmd_clear")],
        ["/chat list",          t(cfg, "cmd_chat_list")],
        ["/chat new [name]",    t(cfg, "cmd_chat_new")],
        ["/chat use <name>",    t(cfg, "cmd_chat_use")],
        ["/chat delete <name>", t(cfg, "cmd_chat_delete")],
      ]
    },
    {
      title: `🤖 ${t(cfg, "help_title_autopilot")}`,
      items: [
        ["/autopilot <task>",   t(cfg, "cmd_autopilot")],
        ["/ap <task>",          t(cfg, "cmd_autopilot_short")],
        ["/ap-config",          t(cfg, "cmd_ap_config")],
        ["/ap-limit <N>",       t(cfg, "cmd_ap_limit")],
        ["/ap-errors <N>",      t(cfg, "cmd_ap_errors")],
        ["/trigger <cmd|off>",  t(cfg, "cmd_trigger")],
        ["Ctrl+C",              t(cfg, "cmd_ctrl_c")],
      ]
    },
    {
      title: `🖼  ${t(cfg, "help_title_images")}`,
      items: [
        ["/img <path> [text]",  t(cfg, "cmd_img_path")],
        ["/img <url> [text]",   t(cfg, "cmd_img_url")],
        ["{img:path} text",     t(cfg, "cmd_img_inline")],
      ]
    },
    {
      title: `🔧 ${t(cfg, "help_title_tools")}`,
      items: [
        ["/list <path>",        t(cfg, "cmd_list")],
        ["/read <file>",        t(cfg, "cmd_read")],
        ["/shell <cmd>",        t(cfg, "cmd_shell")],
      ]
    },
    {
      title: "🔒 Security & Context",
      items: [
        ["/permissions",         "Manage tool permissions"],
        ["/perm allow <tool>",   "Always allow a tool"],
        ["/perm deny <tool>",    "Always deny a tool"],
        ["/context",             "Show project context (MEOW.md)"],
        ["/context edit",        "Edit project MEOW.md"],
        ["/context reload",      "Reload context into prompt"],
        ["/audit",               "Show audit log"],
        ["/incognito on|off",    "Incognito mode (no data persists)"],
      ]
    },
    {
      title: "🔀 Agents & Automation",
      items: [
        ["/lead [context]",      "AI Lead Developer — continuous improvement"],
        ["/lead auto [context]", "Auto-mode: no prompts, picks tasks itself"],
        ["/delegate <task>",     "Delegate task to parallel sub-agent"],
        ["/pair <mode>",         "Pair programming (verbose/balanced/silent/off)"],
        ["/ci status",           "Show CI/CD workflows"],
        ["/ci generate <desc>",  "Generate GitHub Actions workflow"],
        ["/ci heal",             "Self-heal failing tests"],
      ]
    },
    {
      title: "🧠 Memory & Intelligence",
      items: [
        ["/memory stats",        "Show memory statistics"],
        ["/memory search <q>",   "Search project memory"],
        ["/memory prefs",        "Show learned preferences"],
        ["/memory clear",        "Clear project memory"],
        ["/routing",             "Smart model routing config"],
        ["/routing on|off",      "Toggle dynamic model selection"],
      ]
    },
    {
      title: "⏪ History & Sessions",
      items: [
        ["/rewind [N]",         "Undo last N file changes"],
        ["/rewind --list",      "Show checkpoint history"],
        ["/session list",       "Show saved sessions"],
        ["/session load <id>",  "Resume a saved session"],
        ["/compact",            "Compress conversation context"],
        ["/compact --ai",       "AI-powered context compression"],
        ["/cost",               "Show token usage & cost"],
        ["/cost total",         "Show all-time cost"],
      ]
    },
    {
      title: `⚙  ${t(cfg, "help_title_settings")}`,
      items: [
        ["/model [name]",       `${t(cfg, "cmd_model")} ${MUTED}(${cfg.model})${C.reset}`],
        ["/profile [name]",     `${t(cfg, "cmd_profile")} ${MUTED}(${cfg.profile})${C.reset}`],
        ["/assistant <cmd>",    t(cfg, "cmd_assistant")],
        ["/temp [0.0-2.0]",     t(cfg, "cmd_temp")],
        ["/key [sk-...]",       t(cfg, "cmd_key")],
        ["/url [http...]",      t(cfg, "cmd_url")],
        ["/config",             t(cfg, "cmd_config")],
        ["/git [on|off]",       t(cfg, "cmd_git")],
        ["/lang <ru|en>",       "Switch UI language"],
        ["/preview start|stop",  "Live dev server preview"],
      ]
    },
    {
      title: `📦 ${t(cfg, "help_title_other")}`,
      items: [
        ["/undo [N]",           t(cfg, "cmd_undo")],
        ["/export <file>",      t(cfg, "cmd_export")],
        ["/import <file>",      t(cfg, "cmd_import")],
        ["/template <name>",    t(cfg, "cmd_template")],
        ["/pins",               t(cfg, "cmd_pins")],
        ["/pin [index]",        t(cfg, "cmd_pin")],
        ["/vacuum [opts]",      t(cfg, "cmd_vacuum")],
        ["/alias",              t(cfg, "cmd_alias")],
        ["/plugin [cmd]",       t(cfg, "cmd_plugin")],
        ["/stats",              t(cfg, "cmd_stats")],
        ["/help",               t(cfg, "cmd_help")],
        ["/exit",               t(cfg, "cmd_exit")],
      ]
    }
  ];

  for (const section of sections) {
    console.log(`  ${ACCENT}${C.bold}${section.title}${C.reset}`);
    console.log("");
    for (const [cmd, desc] of section.items) {
      const padded = cmd.padEnd(24);
      console.log(`    ${TEXT}${C.bold}${padded}${C.reset} ${MUTED}${desc}${C.reset}`);
    }
    console.log("");
  }

  // Aliases footer
  const aliasEntries = Object.entries(cfg.aliases);
  if (aliasEntries.length > 0) {
    const aliasStr = aliasEntries
      .map(([a, b]) => `${TEXT_DIM}${a}${MUTED} → ${TEXT_DIM}${b}`)
      .join("  ");
    console.log(`  ${MUTED}aliases:${C.reset} ${aliasStr}${C.reset}`);
    console.log("");
  }
}

// ─── Stats (Claude Code style — tabular, clean) ────────────────────────────

function printStats(cfg, currentChat, historyLen, pinsCount = 0) {
  console.log("");
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const vac = cfg.vacuum || {};
  const pluginSummary = getPluginSummary(cfg);

  const rows = [
    ["Chat",            `${SUCCESS}${currentChat}${C.reset}`],
    ["Messages",        `${TEXT}${historyLen}${C.reset}`],
    ["Model",           `${ACCENT}${cfg.model}${C.reset}`],
    ["Profile",         `${ACCENT2}${cfg.profile}${C.reset}`],
    ["Temperature",     `${TEXT}${profile.temperature}${C.reset}`],
    ["API Base",        `${MUTED}${cfg.api_base}${C.reset}`],
    ["API Key",         cfg.api_key
                          ? `${SUCCESS}set${C.reset} ${MUTED}(${cfg.api_key.slice(0, 8)}…)${C.reset}`
                          : `${ERROR}not set${C.reset}`],
    ["Auto-yes",        cfg.auto_yes ? `${SUCCESS}on${C.reset}` : `${MUTED}off${C.reset}`],
    ["Git Autocommit",  cfg.git?.autocommit === false ? `${MUTED}off${C.reset}` : `${SUCCESS}on${C.reset}`],
    ["AP Limit",        `${AUTO_CLR}${cfg.autopilot?.max_iterations || 50}${C.reset}`],
    ["Plugins",         `${TEXT}${pluginSummary}${C.reset}`],
    ["Vacuum",          `${vac.enabled ? SUCCESS + "on" : MUTED + "off"}${C.reset} ${MUTED}(drop ${vac.drop_count || 0}, keep ${vac.keep_last || 0})${C.reset}`],
    ["Pins",            `${TEXT}${pinsCount}${C.reset}`],
    ["CWD",             `${MUTED}${process.cwd()}${C.reset}`],
  ];

  console.log(`  ${ACCENT}${C.bold}${t(cfg, "stats_title")}${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
  for (const [label, value] of rows) {
    console.log(`  ${TEXT_DIM}${label.padEnd(18)}${C.reset} ${value}`);
  }
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}\n`);
}

function getPluginSummary(cfg) {
  const plugins = listPlugins();
  const total = plugins.length;
  if (total === 0) return `${MUTED}none${C.reset}`;
  const enabled = plugins.filter(p => p.enabled).length;
  const disabled = total - enabled;
  const disabledList = cfg.plugins?.disabled || [];
  const pending = disabledList.filter(name => !plugins.some(p => p.name === name)).length;
  const parts = [`${enabled}/${total}`];
  if (disabled > 0) parts.push(`${disabled} off`);
  if (pending > 0) parts.push(`${pending} missing`);
  return parts.join(` ${MUTED}·${C.reset} `);
}

// ─── Chat List ──────────────────────────────────────────────────────────────

function printChatList(state) {
  const names = Object.keys(state.chats || {}).sort();
  if (names.length === 0) { log.dim("No chats yet."); return; }

  console.log("");
  console.log(`  ${ACCENT}${C.bold}Chats${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);

  for (const name of names) {
    const msgs = (state.chats[name] || []).length;
    const isCurrent = name === state.current;
    const indicator = isCurrent ? `${SUCCESS}●${C.reset}` : `${MUTED}○${C.reset}`;
    const nameColor = isCurrent ? `${SUCCESS}${C.bold}` : `${TEXT}`;
    console.log(`  ${indicator} ${nameColor}${name}${C.reset}  ${MUTED}${msgs} msgs${C.reset}`);
  }

  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}\n`);
}

// ─── Config Display ─────────────────────────────────────────────────────────

function printConfig(cfg) {
  console.log("");
  console.log(`  ${ACCENT}${C.bold}Configuration${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

  const safe = { ...cfg, api_key: cfg.api_key ? cfg.api_key.slice(0, 8) + "…" : "(not set)" };
  const json = JSON.stringify(safe, null, 2);

  for (const line of json.split("\n")) {
    const colored = line
      .replace(/\"([^\"]+)\":/g,        `${ACCENT}\"$1\"${C.reset}:`)
      .replace(/: \"([^\"]+)\"/g,       `: ${SUCCESS}\"$1\"${C.reset}`)
      .replace(/: (\d+\.?\d*)/g,     `: ${WARNING}$1${C.reset}`)
      .replace(/: (true|false)/g,    `: ${INFO}$1${C.reset}`)
      .replace(/: (null)/g,          `: ${MUTED}$1${C.reset}`);
    console.log(`  ${colored}`);
  }

  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}\n`);
}

// ─── Autopilot Config ───────────────────────────────────────────────────────

function printAutopilotConfig(cfg) {
  const ap = cfg.autopilot || {};

  console.log("");
  console.log(`  ${AUTO_CLR}${C.bold}🤖 Autopilot Configuration${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);

  const rows = [
    ["Max iterations", `${AUTO_CLR}${ap.max_iterations || 50}${C.reset}`],
    ["Max errors",     `${AUTO_CLR}${ap.max_errors || 5}${C.reset}`],
    ["Retry delay",    `${AUTO_CLR}${ap.retry_delay_ms || 2000}ms${C.reset}`],
    ["Save logs",      ap.save_log !== false ? `${SUCCESS}yes${C.reset}` : `${MUTED}no${C.reset}`],
    ["Trigger cmd",    ap.trigger_cmd ? `${TEXT}${ap.trigger_cmd}${C.reset}` : `${MUTED}(off)${C.reset}`],
    ["Log dir",        `${MUTED}~/.meowcli/data/logs/${C.reset}`],
  ];

  for (const [label, value] of rows) {
    console.log(`  ${TEXT_DIM}${label.padEnd(18)}${C.reset} ${value}`);
  }

  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}\n`);
}

// ─── Prompt (Claude Code style — minimal, one-line context) ─────────────────

function makePrompt(cfg, currentChat, historyLen = 0) {
  // Claude Code uses a very clean prompt:
  //   project-name /path > _
  // We adapt it to show chat context
  const modelShort = cfg.model.length > 18 ? cfg.model.slice(0, 15) + "…" : cfg.model;

  return [
    `${C.reset}`,
    `  ${MUTED}${currentChat}${C.reset} ${MUTED}·${C.reset} ${MUTED}${modelShort}${C.reset} ${MUTED}·${C.reset} ${MUTED}${historyLen} msgs${C.reset}`,
    `  ${ACCENT}${C.bold}❯${C.reset} `
  ].join("\n");
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  banner,
  printHelp,
  printStats,
  printChatList,
  printConfig,
  printAutopilotConfig,
  makePrompt
};
