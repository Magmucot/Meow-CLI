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

const askInput = (promptTitle) => new Promise((resolve) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
      const hits = COMMANDS.filter((c) => c.startsWith(line));
      return [hits.length ? hits : COMMANDS, line];
    },
    prompt: "",
  });

  let buffer = "";
  let isMultiline = false;

  // Clack-style header
  console.log(`\n${ACCENT("◇")}  ${TEXT_DIM(promptTitle)}`);
  process.stdout.write(`${MUTED("│")}  `);

  const onKeypress = (str, key) => {
    // Submit on Ctrl+D or Ctrl+Enter
    if ((key.ctrl && key.name === 'd') || (key.ctrl && key.name === 'return')) {
      rl.close();
      return;
    }

    // Enter for newline
    if (key.name === 'return' && !key.shift) {
      // In some terminals, Shift+Enter is just Enter. 
      // We'll treat Enter as newline and Ctrl+Enter as submit.
      // But for single-line commands, Enter should submit.
      if (buffer.startsWith('/') || !isMultiline) {
         // If it's a command, submit on Enter
         if (buffer.startsWith('/')) {
           rl.close();
           return;
         }
         // Otherwise, if we haven't started multiline, maybe we want to?
         // Let's make it simple: Enter = newline, Ctrl+Enter = submit.
         // BUT users expect Enter to submit single lines.
         // So: if buffer has no newlines and is short, Enter submits. 
         // If it's a command, Enter submits.
         // Otherwise, Enter adds newline.
         if (buffer.length < 100 && !buffer.includes('\n')) {
            rl.close();
            return;
         }
      }
      
      buffer += "\n";
      process.stdout.write(`\n${MUTED("│")}  `);
      return;
    }
  };

  // We actually don't want to use rl.on('line') if we handle multiline ourselves
  // But readline is tricky with raw mode.
  // Let's use a simpler approach: use rl for line-by-line, but allow escaping it.
  
  rl.on('line', (line) => {
    if (line.startsWith('/')) {
      buffer = line;
      rl.close();
      return;
    }
    
    if (buffer) buffer += "\n" + line;
    else buffer = line;
    
    // If it's a single line and not a command, we might want to wait for more?
    // No, standard CLI behavior: Enter submits. 
    // Let's add a hint: "Type /m to enter multiline mode" or just use Ctrl+D.
    
    // Actually, let's stick to: Enter submits, unless user specifically wants multiline.
    // Or: if line ends with '\', continue.
    if (line.endsWith('\\')) {
      buffer = buffer.slice(0, -1);
      process.stdout.write(`${MUTED("│")}  `);
      return;
    }
    
    rl.close();
  });

  rl.on('close', () => {
    console.log(`${MUTED("└")}`);
    resolve(buffer.trim());
  });
});

// Since the user wants "beautiful" and "multiline", let's use a more robust custom implementation
// that doesn't rely on the 'line' event if we want real-time multiline editing.

const readMultilineInput = (promptTitle) => new Promise(resolve => {
  const promptPrefix = `${MUTED("│")}  `;
  console.log(`\n${ACCENT("◇")}  ${TEXT_DIM(promptTitle)}`);
  process.stdout.write(promptPrefix);

  let buffer = "";
  let cursor = 0;

  const onKey = (str, key = {}) => {
    // Ctrl+C
    if (key.ctrl && key.name === 'c') {
      process.stdout.write("\n");
      process.exit(0);
    }

    // Submit: Ctrl+D or Ctrl+Enter (if supported) or just Enter for commands
    if ((key.ctrl && key.name === 'd') || (key.name === 'return' && (buffer.startsWith('/') || key.ctrl))) {
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
        buffer = buffer.slice(0, -1);
        readline.moveCursor(process.stdout, -1, 0);
        readline.clearLine(process.stdout, 1);
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
