import readline from "readline";
import { C, MUTED } from "./ui.js";

const buildMultilinePrompt = (promptText) => {
  return `${promptText} ${MUTED}(Ctrl+D — send, Enter — new line)${C.reset}`;
};

const readMultilineInput = (promptText) => new Promise(resolve => {
  const prompt = buildMultilinePrompt(promptText);
  let buffer = "";
  let lastRenderedLineCount = 1;

  const render = () => {
    readline.moveCursor(process.stdout, 0, -lastRenderedLineCount);
    readline.clearScreenDown(process.stdout);
    const full = prompt + buffer;
    process.stdout.write(full);
    lastRenderedLineCount = full.split("\n").length;
  };

  const finish = () => {
    cleanup();
    process.stdout.write("\n");
    resolve(buffer);
  };

  const onKey = (str, key = {}) => {
    // Отправка по Ctrl+D (работает во всех терминалах)
    if (key && key.ctrl && key.name === "d") {
      return finish();
    }
    
    // Enter - новая строка
    if (key && key.name === "return") {
      buffer += "\n";
      return render();
    }
    
    // Backspace
    if (key && key.name === "backspace") {
      if (buffer.length > 0) buffer = buffer.slice(0, -1);
      return render();
    }
    
    // Ctrl+C - выход
    if (key && key.ctrl && key.name === "c") {
      process.emit("SIGINT");
      return;
    }
    
    // Обычные символы
    if (typeof str === "string" && str.length > 0 && !key.ctrl && !key.meta) {
      buffer += str;
      return render();
    }
  };

  const cleanup = () => {
    process.stdin.off("keypress", onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  };

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  render();
  process.stdin.on("keypress", onKey);
});

const askInput = (promptText) => readMultilineInput(promptText);

export { buildMultilinePrompt, readMultilineInput, askInput };