import readline from "readline";
import { C, MUTED, ACCENT, TEXT, TEXT_DIM, SUCCESS, AI_GRADIENT } from "./ui.js";

const COMMANDS = [
  "/help", "/clear", "/exit", "/stats", "/config", "/model", "/profile",
  "/chat list", "/chat new", "/chat use", "/chat delete",
  "/ap", "/autopilot", "/ap-config", "/ap-limit", "/ap-errors",
  "/img", "/list", "/read", "/shell", "/undo", "/export", "/import",
  "/template", "/pins", "/pin", "/vacuum", "/alias", "/plugin",
  "/permissions", "/perm allow", "/perm deny", "/context", "/context edit", "/context reload",
  "/rewind", "/rewind --list", "/session list", "/session load", "/compact", "/compact --ai",
  "/cost", "/cost total", "/lead", "/delegate", "/memory", "/pair", "/ci", "/audit",
  "/incognito", "/routing", "/preview"
];

const readMultilineInput = (promptTitle) => new Promise(resolve => {
  const promptPrefix = `${MUTED("│")}  `;
  console.log(`\n${ACCENT("◇")}  ${TEXT_DIM(promptTitle)}`);
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
        // If we are deleting a newline, we need to move up
        if (buffer.endsWith('\n')) {
          buffer = buffer.slice(0, -1);
          readline.moveCursor(process.stdout, 0, -1);
          // Move to the end of the line (approximate)
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
      // Simple syntax highlighting for commands
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

const askInput = (promptTitle) => readMultilineInput(promptTitle);

export { askInput, readMultilineInput };
