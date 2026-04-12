// ═══════════════════════════════════════════════════════════════════════════
// ui.js — Meow CLI UI (Modern Library-based)
// ═══════════════════════════════════════════════════════════════════════════

import path from "path";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import chalk from "chalk";
import boxen from "boxen";
import { spinner as clackSpinner } from "@clack/prompts";
import gradient from "gradient-string";

// ─── Theme & Styling (using Chalk) ──────────────────────────────────────────

const C = {
  reset:     chalk.reset,
  bold:      chalk.bold,
  dim:       chalk.dim,
  italic:    chalk.italic,
  underline: chalk.underline,
  inverse:   chalk.inverse,
  gray:      chalk.gray,
  red:       chalk.red,
  green:     chalk.green,
  yellow:    chalk.yellow,
  blue:      chalk.blue,
  magenta:   chalk.magenta,
  cyan:      chalk.cyan,
  white:     chalk.white,
};

// Claude Code–inspired palette using hex colors for precision
const ACCENT    = chalk.hex("#CC7832"); // terracotta orange
const ACCENT2   = chalk.hex("#A98EDA"); // soft lavender
const ACCENT3   = chalk.hex("#CC7832");
const SUCCESS   = chalk.hex("#6ABE82"); // sage green
const WARNING   = chalk.hex("#DEB858"); // warm amber
const ERROR     = chalk.hex("#D26060"); // muted coral red
const INFO      = chalk.hex("#6CB4DC"); // sky blue
const MUTED     = chalk.hex("#646464"); // neutral gray
const TEXT      = chalk.hex("#D4D4D4"); // light text
const TEXT_DIM  = chalk.hex("#969696"); // dimmed text
const TOOL_CLR  = chalk.hex("#6CB4DC"); // tools = blue
const USER_CLR  = chalk.hex("#D4D4D4"); // user = white
const AI_CLR    = chalk.hex("#CC7832"); // AI = terracotta
const IMG_CLR   = chalk.hex("#D28CB4"); // images = dusty rose
const AUTO_CLR  = chalk.hex("#DEB858"); // autopilot = amber

const SHELL_TIMEOUT_MS = parseInt(process.env.MEOWCLI_SHELL_TIMEOUT_MS || "30000", 10);
const COLS = Math.min(process.stdout.columns || 80, 100);

marked.setOptions({
  renderer: new TerminalRenderer({
    code: (code) => `\n${MUTED("  ┃")} ${code}\n`,
    blockquote: (quote) => `  ${MUTED("┃")} ${TEXT_DIM(quote)}\n`,
    heading: (text, level) => {
      if (level === 1) return `\n${ACCENT.bold("# " + text)}\n`;
      if (level === 2) return `\n${ACCENT.bold("## " + text)}\n`;
      return `\n${TEXT.bold(text)}\n`;
    },
    hr: () => `\n${MUTED("─".repeat(Math.min(COLS - 4, 60)))}\n`,
  })
});

// ─── Box Drawing & Layout Helpers ───────────────────────────────────────────

function box(content, { title = "", color = "#CC7832", width = COLS - 2, padding = 1, style = "rounded" } = {}) {
  return boxen(content, {
    title,
    borderColor: color,
    borderStyle: style,
    padding,
    width,
    float: "left",
  });
}

function table(rows, { indent = 2, colSpacing = 2, colWidths = [] } = {}) {
  const padding = " ".repeat(indent);
  const spacing = " ".repeat(colSpacing);
  
  const widths = [...colWidths];
  rows.forEach(row => {
    row.forEach((cell, i) => {
      const len = stripAnsi(String(cell)).length;
      if (!widths[i] || len > widths[i]) widths[i] = len;
    });
  });

  rows.forEach(row => {
    const line = row.map((cell, i) => {
      const str = String(cell);
      const len = stripAnsi(str).length;
      const pad = " ".repeat(Math.max(0, (widths[i] || 0) - len));
      return str + pad;
    }).join(spacing);
    console.log(padding + line);
  });
}

function list(items, { indent = 2, bullet = "•", bulletColor = MUTED } = {}) {
  const padding = " ".repeat(indent);
  items.forEach(item => {
    console.log(`${padding}${bulletColor(bullet)} ${item}`);
  });
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Progress & Diff Helpers ────────────────────────────────────────────────

function progressBar(current, total, { width = 20, label = "", color = ACCENT } = {}) {
  const pct = Math.min(current / Math.max(total, 1), 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = `${color("━".repeat(filled))}${MUTED("━".repeat(empty))}`;
  const pctStr = `${Math.round(pct * 100)}%`;
  return `${bar} ${TEXT_DIM(pctStr)}${label ? ` ${label}` : ""}`;
}

function colorDiff(diffText) {
  if (!diffText) return "";
  return diffText.split("\n").map(line => {
    if (line.startsWith("+") && !line.startsWith("+++")) return SUCCESS(line);
    if (line.startsWith("-") && !line.startsWith("---")) return ERROR(line);
    if (line.startsWith("@@")) return INFO(line);
    if (line.startsWith("diff ") || line.startsWith("index ")) return ACCENT.bold(line);
    return TEXT_DIM(line);
  }).join("\n");
}

// ─── Spinner (using Clack) ──────────────────────────────────────────────────

class Spinner {
  constructor(text = "Thinking") {
    this.s = clackSpinner();
    this.text = text;
  }

  start() {
    this.s.start(this.text);
  }

  update(text) {
    this.text = text;
    this.s.message(text);
  }

  stop(msg = "") {
    this.s.stop(msg);
  }
}

// ─── Logger ─────────────────────────────────────────────────────────────────

const log = {
  info: (s) => console.log(`  ${INFO("ℹ")} ${TEXT(s)}`),
  ok:   (s) => console.log(`  ${SUCCESS("✔")} ${TEXT(s)}`),
  warn: (s) => console.log(`  ${WARNING("⚠")} ${WARNING(s)}`),
  err:  (s) => console.log(`  ${ERROR("✘")} ${ERROR(s)}`),
  dim:  (s) => console.log(`  ${MUTED(s)}`),

  tool: (name, args) => {
    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    const short = argsStr.length > 70 ? argsStr.slice(0, 67) + "…" : argsStr;
    console.log(`  ${TOOL_CLR("┃")} ${TOOL_CLR.bold(name)} ${MUTED(short)}`);
  },

  toolResult: (name, result) => {
    const lines = (result || "").split("\n").slice(0, 8);
    for (const line of lines) {
      console.log(`  ${MUTED("┃")} ${TEXT_DIM(line)}`);
    }
    if ((result || "").split("\n").length > 8) {
      console.log(`  ${MUTED("┃")} ${MUTED("… (truncated)")}`);
    }
  },

  img: (filePath, size) => {
    console.log(`  ${IMG_CLR("┃")} ${IMG_CLR("📎 " + path.basename(filePath))} ${MUTED(size)}`);
  },

  auto: (s) => console.log(`  ${AUTO_CLR("┃")} ${AUTO_CLR.bold("autopilot")} ${TEXT_DIM(s)}`),

  step: (n, total, text) => {
    console.log(`  ${progressBar(n, total, { color: ACCENT, label: text })}`);
  },

  section: (title) => {
    console.log(`\n  ${ACCENT.bold(title)}`);
    console.log(`  ${MUTED("─".repeat(Math.min(COLS - 4, 50)))}`);
  },

  br: () => console.log(""),
};

function renderMD(text) {
  try { return marked.parse(text || ""); }
  catch { return text || ""; }
}

export {
  C, ACCENT, ACCENT2, ACCENT3, SUCCESS, WARNING, ERROR, INFO,
  MUTED, TEXT, TEXT_DIM, TOOL_CLR, USER_CLR, AI_CLR,
  IMG_CLR, AUTO_CLR, COLS, SHELL_TIMEOUT_MS,
  box, table, list, stripAnsi,
  progressBar, colorDiff,
  Spinner, log, renderMD, gradient
};
