import readline from "readline";
import { C, MUTED, ACCENT, TEXT, TEXT_DIM, SUCCESS, AI_GRADIENT } from "./ui.js";

/**
 * List of available commands for tab-completion.
 * @type {Array<string>}
 */
const COMMANDS = [
  // Most common first — these appear first in tab-complete
  "/help", "/clear", "/exit", "/stats", "/config",
  "/ap", "/autopilot",
  "/model", "/profile", "/temp", "/key", "/url", "/lang",
  // Chat
  "/chat list", "/chat new", "/chat use", "/chat delete",
  "/reset", "/compact", "/compact --ai",
  // Autopilot
  "/ap-config", "/ap-limit", "/ap-errors", "/trigger",
  // Agents
  "/lead", "/lead auto", "/delegate", "/pair",
  "/ci status", "/ci generate", "/ci heal",
  // Memory
  "/memory stats", "/memory search", "/memory prefs", "/memory clear",
  "/routing", "/routing on", "/routing off",
  // Tools
  "/img", "/list", "/read", "/shell",
  // Security
  "/permissions", "/perm allow", "/perm deny",
  "/context", "/context edit", "/context reload",
  "/audit", "/incognito on", "/incognito off",
  // History
  "/rewind", "/rewind --list",
  "/session list", "/session load",
  "/cost", "/cost total",
  "/export", "/import", "/undo",
  // Settings
  "/git on", "/git off", "/git prefix", "/git ai",
  "/assistant", "/preview start", "/preview stop",
  // Other
  "/init", "/init --force",
  "/pins", "/pin",
  "/plugin list", "/plugin enable", "/plugin disable",
  "/template", "/vacuum", "/alias",
  "/saveconfig",
];

/**
 * Reads multi-line input from the terminal with basic syntax highlighting and autocomplete.
 * @param {string} promptTitle - Title to display above the input area.
 * @returns {Promise<string>} The user's input.
 */
const readMultilineInput = (promptTitle) => new Promise(resolve => {
  const promptPrefix = `${MUTED("│")}  `;
  console.log(`\n${ACCENT("◇")}  ${TEXT_DIM(promptTitle)} ${MUTED("(Enter: newline, Shift+Enter: send)")}`);
  process.stdout.write(promptPrefix);

  let buffer = "";

  const onKey = (str, key = {}) => {
    // Ctrl+C
    if (key.ctrl && key.name === 'c') {
      process.stdout.write("\n");
      process.exit(0);
    }

    // Submit: Ctrl+D, Ctrl+Enter, or Shift+Enter
    if ((key.ctrl && key.name === 'd') || 
        (key.name === 'return' && (buffer.startsWith('/') || key.ctrl || key.shift))) {
      process.stdout.write("\n" + MUTED("└") + "\n");
      cleanup();
      resolve(buffer.trim());
      return;
    }

    // New line: Enter (when not submitting)
    if (key.name === 'return') {
      buffer += "\n";
      process.stdout.write("\n" + promptPrefix);
      return;
    }

    // Backspace
    if (key.name === 'backspace') {
      if (buffer.length > 0) {
        if (buffer.endsWith('\n')) {
          buffer = buffer.slice(0, -1);
          readline.moveCursor(process.stdout, 0, -1);
          readline.cursorTo(process.stdout, 100); 
        } else {
          buffer = buffer.slice(0, -1);
          readline.moveCursor(process.stdout, -1, 0);
          readline.clearLine(process.stdout, 1);
        }
      }
      return;
    }

    // Tab (Autocomplete)
    if (key.name === 'tab') {
      if (buffer.startsWith('/')) {
        const hits = COMMANDS.filter(c => c.startsWith(buffer));
        if (hits.length === 1) {
          const diff = hits[0].slice(buffer.length);
          buffer = hits[0];
          process.stdout.write(ACCENT(diff));
        }
      }
      return;
    }

    // Normal chars
    if (str && !key.ctrl && !key.meta) {
      buffer += str;
      if (buffer.startsWith('/') && !buffer.includes(' ')) {
        process.stdout.write(ACCENT(str));
      } else {
        process.stdout.write(TEXT(str));
      }
    }
  };

  const cleanup = () => {
    process.stdin.off("keypress", onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  };

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("keypress", onKey);
});

/**
 * Wrapper for readMultilineInput.
 * @param {string} promptTitle - Prompt title.
 * @returns {Promise<string>}
 */
const askInput = (promptTitle) => readMultilineInput(promptTitle);

export { askInput, readMultilineInput };
