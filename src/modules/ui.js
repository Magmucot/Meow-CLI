import path from "path";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import chalk from "chalk";
import boxen from "boxen";
import { spinner as clackSpinner } from "@clack/prompts";
import gradient from "gradient-string";

/**
 * String-friendly Chalk Wrapper.
 * This allows using ${ACCENT} as a prefix AND ACCENT("text") as a function.
 * @param {Function} fn - The chalk color function to wrap.
 * @returns {Function} - The wrapped color function.
 */
const color = (fn) => {
  const wrapped = (s) => (s === undefined ? fn.open : fn(s));
  wrapped.toString = () => fn.open;
  Object.getOwnPropertyNames(Object.getPrototypeOf(fn)).forEach(prop => {
    if (typeof fn[prop] === 'function' && prop !== 'constructor') {
      wrapped[prop] = (...args) => color(fn[prop](...args));
    }
  });
  wrapped.bold = (s) => color(fn.bold)(s);
  wrapped.dim = (s) => color(fn.dim)(s);
  return wrapped;
};

/**
 * Core ANSI styles and colors.
 * @type {Object}
 */
const C = {
  reset:     Object.assign((s) => chalk.reset(s), { toString: () => chalk.reset.open }),
  bold:      color(chalk.bold),
  dim:       color(chalk.dim),
  italic:    color(chalk.italic),
  underline: color(chalk.underline),
  inverse:   color(chalk.inverse),
  gray:      color(chalk.gray),
  red:       color(chalk.red),
  green:     color(chalk.green),
  yellow:    color(chalk.yellow),
  blue:      color(chalk.blue),
  magenta:   color(chalk.magenta),
  cyan:      color(chalk.cyan),
  white:     color(chalk.white),
};

/** @type {Function} Terracotta orange (primary brand) */
const ACCENT    = color(chalk.hex("#CC7832"));
/** @type {Function} Soft lavender */
const ACCENT2   = color(chalk.hex("#A98EDA"));
/** @type {Function} Primary accent alias */
const ACCENT3   = color(chalk.hex("#CC7832"));
/** @type {Function} Sage green */
const SUCCESS   = color(chalk.hex("#6ABE82"));
/** @type {Function} Warm amber */
const WARNING   = color(chalk.hex("#DEB858"));
/** @type {Function} Muted coral red */
const ERROR     = color(chalk.hex("#D26060"));
/** @type {Function} Sky blue */
const INFO      = color(chalk.hex("#6CB4DC"));
/** @type {Function} Neutral gray */
const MUTED     = color(chalk.hex("#646464"));
/** @type {Function} Light text */
const TEXT      = color(chalk.hex("#D4D4D4"));
/** @type {Function} Dimmed text */
const TEXT_DIM  = color(chalk.hex("#969696"));
/** @type {Function} Tool label color */
const TOOL_CLR  = color(chalk.hex("#6CB4DC"));
/** @type {Function} User label color */
const USER_CLR  = color(chalk.hex("#D4D4D4"));
/** @type {Function} AI label color */
const AI_CLR    = color(chalk.hex("#CC7832"));
/** @type {Function} Image label color */
const IMG_CLR   = color(chalk.hex("#D28CB4"));
/** @type {Function} Autopilot label color */
const AUTO_CLR  = color(chalk.hex("#DEB858"));

/** @type {number} Shell execution timeout in milliseconds */
const SHELL_TIMEOUT_MS = parseInt(process.env.MEOWCLI_SHELL_TIMEOUT_MS || "30000", 10);
/** @type {number} Terminal width limit */
const COLS = Math.min(process.stdout.columns || 80, 100);

/** @type {Function} Primary brand gradient */
const MEOW_GRADIENT = gradient(["#CC7832", "#EBCB8B", "#A98EDA"]);
/** @type {Function} AI identity gradient */
const AI_GRADIENT = gradient(["#CC7832", "#A98EDA"]);

marked.setOptions({
  renderer: new TerminalRenderer({
    code: (code) => `\n${MUTED("  ┃")} ${code}\n`,
    blockquote: (quote) => `  ${MUTED("┃")} ${TEXT_DIM(quote)}\n`,
    heading: (text, level) => {
      if (level === 1) return `\n${ACCENT.bold("# " + text)}\n`;
      if (level === 2) return `\n${ACCENT2.bold("## " + text)}\n`;
      return `\n${TEXT.bold(text)}\n`;
    },
    hr: () => `\n${MUTED("─".repeat(Math.min(COLS - 4, 60)))}\n`,
  })
});

/**
 * Renders a stylized box with content.
 * @param {string} content - The content to wrap in the box.
 * @param {Object} options - Box options.
 * @param {string} [options.title] - Box title.
 * @param {string} [options.color] - Border color (hex).
 * @param {number} [options.width] - Box width.
 * @param {number} [options.padding] - Internal padding.
 * @param {string} [options.style] - Border style (e.g., 'rounded').
 * @returns {string} - The formatted box string.
 */
function box(content, { title = "", color = "#CC7832", width = COLS - 2, padding = 1, style = "rounded" } = {}) {
  return boxen(content, {
    title,
    borderColor: color(chalk.hex("#CC7832")),
    borderStyle: style,
    padding,
    width,
    float: "left",
  });
}

/**
 * Prints a tabular representation of data.
 * @param {Array<Array<string>>} rows - The data rows.
 * @param {Object} options - Table options.
 * @param {number} [options.indent] - Left indentation.
 * @param {number} [options.colSpacing] - Space between columns.
 * @param {Array<number>} [options.colWidths] - Fixed column widths.
 */
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

/**
 * Prints a bulleted list.
 * @param {Array<string>} items - The list items.
 * @param {Object} options - List options.
 * @param {number} [options.indent] - Left indentation.
 * @param {string} [options.bullet] - Bullet character.
 * @param {Function} [options.bulletColor] - Bullet color function.
 */
function list(items, { indent = 2, bullet = "•", bulletColor = MUTED } = {}) {
  const padding = " ".repeat(indent);
  items.forEach(item => {
    console.log(`${padding}${bulletColor(bullet)} ${item}`);
  });
}

/**
 * Removes ANSI escape codes from a string.
 * @param {string} str - The string to clean.
 * @returns {string} - The clean string.
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Generates a stylized progress bar.
 * @param {number} current - Current progress value.
 * @param {number} total - Total value.
 * @param {Object} options - Bar options.
 * @param {number} [options.width] - Bar width in characters.
 * @param {string} [options.label] - Progress label.
 * @param {Function} [options.color] - Bar color function.
 * @returns {string} - The formatted progress bar.
 */
function progressBar(current, total, { width = 20, label = "", color = ACCENT } = {}) {
  const pct = Math.min(current / Math.max(total, 1), 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = `${color("━".repeat(filled))}${MUTED("━".repeat(empty))}`;
  const pctStr = `${Math.round(pct * 100)}%`;
  return `${bar} ${TEXT_DIM(pctStr)}${label ? ` ${label}` : ""}`;
}

/**
 * Colors a unified diff string.
 * @param {string} diffText - The diff text.
 * @returns {string} - The colorized diff.
 */
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

/**
 * Modern terminal spinner with elapsed time.
 */
class Spinner {
  /**
   * @param {string} [text="Thinking"] - Initial spinner text.
   */
  constructor(text = "Thinking") {
    this.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.text = text;
    this.i = 0;
    this.timer = null;
    this.startTime = 0;
  }

  /** Starts the spinner animation. */
  start() {
    this.startTime = Date.now();
    this.i = 0;
    process.stdout.write("\x1b[?25l");
    this.timer = setInterval(() => {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      const frame = this.frames[this.i % this.frames.length];
      process.stdout.write(
        `\r  ${ACCENT(frame)} ${TEXT_DIM(this.text)} ${MUTED(elapsed + "s")}  `
      );
      this.i++;
    }, 80);
  }

  /**
   * Updates the spinner text.
   * @param {string} text - New text to display.
   */
  update(text) { this.text = text; }

  /**
   * Stops the spinner and clears the line.
   * @param {string} [msg=""] - Optional success message to print.
   */
  stop(msg = "") {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    process.stdout.write("\r" + " ".repeat(COLS - 1) + "\r");
    process.stdout.write("\x1b[?25h");
    if (msg) console.log(`  ${SUCCESS("✔")} ${TEXT(msg)}`);
  }
}

/**
 * Centralized logging utility for consistent CLI output.
 */
const log = {
  /** @param {string} s - Info message */
  info: (s) => console.log(`  ${INFO("ℹ")} ${TEXT(s)}`),
  /** @param {string} s - Success message */
  ok:   (s) => console.log(`  ${SUCCESS("✔")} ${TEXT(s)}`),
  /** @param {string} s - Warning message */
  warn: (s) => console.log(`  ${WARNING("⚠")} ${WARNING(s)}`),
  /** @param {string} s - Error message */
  err:  (s) => console.log(`  ${ERROR("✘")} ${ERROR(s)}`),
  /** @param {string} s - Dimmed message */
  dim:  (s) => console.log(`  ${MUTED(s)}`),

  /**
   * Logs a tool call.
   * @param {string} name - Tool name.
   * @param {any} args - Tool arguments.
   */
  tool: (name, args) => {
    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    const short = argsStr.length > 70 ? argsStr.slice(0, 67) + "…" : argsStr;
    console.log(`  ${TOOL_CLR("┃")} ${TOOL_CLR.bold(name)} ${MUTED(short)}`);
  },

  /**
   * Logs tool execution result.
   * @param {string} name - Tool name.
   * @param {string} result - Execution output.
   */
  toolResult: (name, result) => {
    const lines = (result || "").split("\n").slice(0, 8);
    for (const line of lines) {
      console.log(`  ${MUTED("┃")} ${TEXT_DIM(line)}`);
    }
    if ((result || "").split("\n").length > 8) {
      console.log(`  ${MUTED("┃")} ${MUTED("… (truncated)")}`);
    }
  },

  /**
   * Logs an image attachment.
   * @param {string} filePath - Path to the image.
   * @param {string} size - Image metadata/size.
   */
  img: (filePath, size) => {
    console.log(`  ${IMG_CLR("┃")} ${IMG_CLR("📎 " + path.basename(filePath))} ${MUTED(size)}`);
  },

  /**
   * Logs an autopilot status update.
   * @param {string} s - Status message.
   */
  auto: (s) => console.log(`  ${AUTO_CLR("┃")} ${AUTO_CLR.bold("autopilot")} ${TEXT_DIM(s)}`),

  /**
   * Logs a progress step.
   * @param {number} n - Current step.
   * @param {number} total - Total steps.
   * @param {string} text - Step description.
   */
  step: (n, total, text) => {
    console.log(`  ${progressBar(n, total, { color: ACCENT, label: text })}`);
  },

  /**
   * Logs a section header.
   * @param {string} title - Section title.
   */
  section: (title) => {
    console.log(`\n  ${C.bold(AI_GRADIENT(stripAnsi(title)))}`);
    console.log(`  ${MUTED("─".repeat(Math.min(COLS - 4, 50)))}`);
  },

  /** Prints a blank line. */
  br: () => console.log(""),
};

/**
 * Renders Markdown for the terminal.
 * @param {string} text - Markdown content.
 * @returns {string} - Rendered ANSI string.
 */
function renderMD(text) {
  try { return marked.parse(text || ""); }
  catch { return text || ""; }
}

export {
  C, ACCENT, ACCENT2, ACCENT3, SUCCESS, WARNING, ERROR, INFO,
  MUTED, TEXT, TEXT_DIM, TOOL_CLR, USER_CLR, AI_CLR,
  IMG_CLR, AUTO_CLR, COLS, SHELL_TIMEOUT_MS,
  MEOW_GRADIENT, AI_GRADIENT,
  box, table, list, stripAnsi,
  progressBar, colorDiff,
  Spinner, log, renderMD, gradient
};
