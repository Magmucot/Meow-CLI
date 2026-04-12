
import chalk from 'chalk';

const color = (hex) => {
  const fn = chalk.hex(hex);
  const wrapper = (text) => fn(text);
  Object.defineProperty(wrapper, 'toString', { value: () => fn.open });
  Object.assign(wrapper, fn);
  return wrapper;
};

const TOOL_CLR = color("#6CB4DC");
console.log("TOOL_CLR type:", typeof TOOL_CLR);
console.log("TOOL_CLR.bold type:", typeof TOOL_CLR.bold);

try {
  console.log(TOOL_CLR.bold("test"));
} catch (e) {
  console.log("TOOL_CLR.bold() failed:", e.message);
}

const ACCENT = color("#CC7832");
console.log("ACCENT.hex:", ACCENT.hex);
