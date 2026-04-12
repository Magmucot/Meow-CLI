// ═══════════════════════════════════════════════════════════════════════════
// ui.js — Meow CLI UI (Claude Code–inspired redesign)
// ═══════════════════════════════════════════════════════════════════════════

import path from "path";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

// ─── Theme & Styling ────────────────────────────────────────────────────────

const C = {
  reset:     "\x1b[0m",
  bold:      "\x1b[1m",
  dim:       "\x1b[2m",
  italic:    "\x1b[3m",
  underline: "\x1b[4m",
  blink:     "\x1b[5m",
  inverse:   "\x1b[7m",
  hidden:    "\x1b[8m",
  strike:    "\x1b[9m",

  black:   "\x1b[30m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",

  bgBlack:   "\x1b[40m",
  bgRed:     "\x1b[41m",
  bgGreen:   "\x1b[42m",
  bgYellow:  "\x1b[43m",
  bgBlue:    "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan:    "\x1b[46m",
  bgWhite:   "\x1b[47m",

  brightBlack:   "\x1b[90m",
  brightRed:     "\x1b[91m",
  brightGreen:   "\x1b[92m",
  brightYellow:  "\x1b[93m",
  brightBlue:    "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan:    "\x1b[96m",
  brightWhite:   "\x1b[97m",
};

const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

// ─── Claude Code–inspired palette ───────────────────────────────────────────
// Primary: warm terracotta/clay orange (Claude's signature)
// Secondary: soft lavender for AI identity
// Accents: muted earth tones

const ACCENT    = rgb(204, 120, 50);   // terracotta orange (primary brand)
const ACCENT2   = rgb(169, 142, 210);  // soft lavender
const ACCENT3   = rgb(204, 120, 50);   // same as primary for prompt caret
const SUCCESS   = rgb(106, 190, 130);  // sage green
const WARNING   = rgb(222, 184, 88);   // warm amber
const ERROR     = rgb(210, 96, 96);    // muted coral red
const INFO      = rgb(108, 180, 220);  // sky blue
const MUTED     = rgb(100, 100, 100);  // neutral gray
const SURFACE   = rgb(30, 30, 30);     // dark surface
const TEXT      = rgb(212, 212, 212);   // light text
const TEXT_DIM  = rgb(150, 150, 150);   // dimmed text
const TOOL_CLR  = rgb(108, 180, 220);  // tools = blue (like Claude Code)
const USER_CLR  = rgb(212, 212, 212);  // user = white
const AI_CLR    = rgb(204, 120, 50);   // AI = terracotta
const IMG_CLR   = rgb(210, 140, 180);  // images = dusty rose
const AUTO_CLR  = rgb(222, 184, 88);   // autopilot = amber

const SHELL_TIMEOUT_MS = parseInt(process.env.MEOWCLI_SHELL_TIMEOUT_MS || "30000", 10);

const COLS = Math.min(process.stdout.columns || 80, 100);

marked.setOptions({
  renderer: new TerminalRenderer({
    code: (code) => `\n${MUTED}  ┃${C.reset} ${code}\n`,
    blockquote: (quote) => `  ${MUTED}┃${C.reset} ${TEXT_DIM}${quote}${C.reset}\n`,
    heading: (text, level) => {
      if (level === 1) return `\n${ACCENT}${C.bold}# ${text}${C.reset}\n`;
      if (level === 2) return `\n${ACCENT}${C.bold}## ${text}${C.reset}\n`;
      return `\n${TEXT}${C.bold}${text}${C.reset}\n`;
    },
    hr: () => `\n${MUTED}${"─".repeat(Math.min(COLS - 4, 60))}${C.reset}\n`,
  })
});

// ─── Box Drawing & Layout Helpers ───────────────────────────────────────────

function box(content, { title = "", color = ACCENT, width = COLS - 2, padding = 1, style = "rounded" } = {}) {
  const w = Math.max(width, 20);
  const inner = w - 2;
  const pad = " ".repeat(padding);

  // Rounded or sharp corners
  const chars = style === "sharp"
    ? { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" }
    : { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

  const top = title
    ? `${color}${chars.tl}${chars.h} ${C.bold}${title}${C.reset}${color} ${chars.h.repeat(Math.max(0, inner - stripAnsi(title).length - 3))}${chars.tr}${C.reset}`
    : `${color}${chars.tl}${chars.h.repeat(inner)}${chars.tr}${C.reset}`;
  const bot = `${color}${chars.bl}${chars.h.repeat(inner)}${chars.br}${C.reset}`;

  const lines = content.split("\n").map(line => {
    const stripped = stripAnsi(line);
    const space = Math.max(0, inner - padding * 2 - stripped.length);
    return `${color}${chars.v}${C.reset}${pad}${line}${" ".repeat(space)}${pad}${color}${chars.v}${C.reset}`;
  });

  return [top, ...lines, bot].join("\n");
}

function table(rows, { indent = 2, colSpacing = 2, colWidths = [] } = {}) {
  const padding = " ".repeat(indent);
  const spacing = " ".repeat(colSpacing);
  
  // Calculate max widths if not provided
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
    console.log(`${padding}${bulletColor}${bullet}${C.reset} ${item}`);
  });
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function centerText(text, width = COLS) {
  const len = stripAnsi(text).length;
  const pad = Math.max(0, Math.floor((width - len) / 2));
  return " ".repeat(pad) + text;
}

function divider(char = "─", color = MUTED, width = COLS - 2) {
  return `${color}${char.repeat(width)}${C.reset}`;
}

function badge(text, bg = ACCENT, fg = C.white) {
  return `${bgRgb(140, 80, 30)}${fg}${C.bold} ${text} ${C.reset}`;
}

function tag(text, color = ACCENT) {
  return `${color}[${text}]${C.reset}`;
}

function pill(text, color = MUTED) {
  return `${color}(${text})${C.reset}`;
}

// ─── Progress & Diff Helpers ────────────────────────────────────────────────

function progressBar(current, total, { width = 20, label = "", color = ACCENT } = {}) {
  const pct = Math.min(current / Math.max(total, 1), 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = `${color}${"━".repeat(filled)}${MUTED}${"━".repeat(empty)}${C.reset}`;
  const pctStr = `${Math.round(pct * 100)}%`;
  return `${bar} ${TEXT_DIM}${pctStr}${label ? ` ${label}` : ""}${C.reset}`;
}

function colorDiff(diffText) {
  if (!diffText) return "";
  return diffText.split("\n").map(line => {
    if (line.startsWith("+") && !line.startsWith("+++")) return `${SUCCESS}${line}${C.reset}`;
    if (line.startsWith("-") && !line.startsWith("---")) return `${ERROR}${line}${C.reset}`;
    if (line.startsWith("@@")) return `${INFO}${line}${C.reset}`;
    if (line.startsWith("diff ") || line.startsWith("index ")) return `${ACCENT}${C.bold}${line}${C.reset}`;
    return `${TEXT_DIM}${line}${C.reset}`;
  }).join("\n");
}

// ─── Spinner (Claude Code style — clean, minimal) ──────────────────────────

class Spinner {
  constructor(text = "Thinking") {
    // Claude Code uses a simple dots animation
    this.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.text = text;
    this.i = 0;
    this.timer = null;
    this.startTime = 0;
  }

  start() {
    this.startTime = Date.now();
    this.i = 0;
    process.stdout.write("\x1b[?25l"); // hide cursor
    this.timer = setInterval(() => {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      const frame = this.frames[this.i % this.frames.length];
      // Claude Code style: muted spinner, dim elapsed time
      process.stdout.write(
        `\r  ${ACCENT}${frame}${C.reset} ${TEXT_DIM}${this.text}${C.reset} ${MUTED}${elapsed}s${C.reset}  `
      );
      this.i++;
    }, 80);
  }

  update(text) { this.text = text; }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    process.stdout.write("\r" + " ".repeat(COLS - 1) + "\r");
    process.stdout.write("\x1b[?25h"); // show cursor
  }
}

// ─── Logger (Claude Code style — left-aligned, clean icons) ─────────────────

const log = {
  info: (s) => console.log(`  ${INFO}ℹ${C.reset} ${TEXT}${s}${C.reset}`),
  ok:   (s) => console.log(`  ${SUCCESS}✔${C.reset} ${TEXT}${s}${C.reset}`),
  warn: (s) => console.log(`  ${WARNING}⚠${C.reset} ${WARNING}${s}${C.reset}`),
  err:  (s) => console.log(`  ${ERROR}✘${C.reset} ${ERROR}${s}${C.reset}`),
  dim:  (s) => console.log(`  ${MUTED}${s}${C.reset}`),

  // Tool calls — Claude Code shows them as indented blocks with a colored bar
  tool: (name, args) => {
    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    const short = argsStr.length > 70 ? argsStr.slice(0, 67) + "…" : argsStr;
    console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);
  },

  // Tool result — shows result with a subtle bar
  toolResult: (name, result) => {
    const lines = (result || "").split("\n").slice(0, 8);
    for (const line of lines) {
      console.log(`  ${MUTED}┃${C.reset} ${TEXT_DIM}${line}${C.reset}`);
    }
    if ((result || "").split("\n").length > 8) {
      console.log(`  ${MUTED}┃${C.reset} ${MUTED}… (truncated)${C.reset}`);
    }
  },

  img: (filePath, size) => {
    console.log(`  ${IMG_CLR}┃${C.reset} ${IMG_CLR}📎 ${path.basename(filePath)}${C.reset} ${MUTED}${size}${C.reset}`);
  },

  auto: (s) => console.log(`  ${AUTO_CLR}┃${C.reset} ${AUTO_CLR}${C.bold}autopilot${C.reset} ${TEXT_DIM}${s}${C.reset}`),

  step: (n, total, text) => {
    console.log(`  ${progressBar(n, total, { color: ACCENT, label: text })}`);
  },

  // Section header — used for grouping output
  section: (title) => {
    console.log(`\n  ${ACCENT}${C.bold}${title}${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
  },

  // Blank line helper
  br: () => console.log(""),
};


// ─── Markdown Renderer ─────────────────────────────────────────────────────

function renderMD(text) {
  try { return marked.parse(text || ""); }
  catch { return text || ""; }
}


export {
  C, ACCENT, ACCENT2, ACCENT3, SUCCESS, WARNING, ERROR, INFO,
  MUTED, SURFACE, TEXT, TEXT_DIM, TOOL_CLR, USER_CLR, AI_CLR,
  IMG_CLR, AUTO_CLR, COLS, SHELL_TIMEOUT_MS,
  rgb, bgRgb, box, stripAnsi, centerText, divider, badge, tag, pill,
  Spinner, log, renderMD
};