
import chalk from 'chalk';

const color = (hex) => {
  const fn = chalk.hex(hex);
  const wrapper = (text) => fn(text);
  
  const proxy = new Proxy(wrapper, {
    get(target, prop) {
      if (prop === 'hexCode') return hex;
      if (prop === 'toString') return () => fn.open;
      const val = fn[prop];
      if (typeof val === 'function') {
        return val.bind(fn);
      }
      return val;
    }
  });
  return proxy;
};

const TOOL_CLR = color("#6CB4DC");
console.log("TOOL_CLR type:", typeof TOOL_CLR);
console.log("TOOL_CLR.bold type:", typeof TOOL_CLR.bold);

try {
  console.log("TOOL_CLR.bold('test'):", TOOL_CLR.bold("test"));
} catch (e) {
  console.log("TOOL_CLR.bold() failed:", e.message);
}

console.log("TOOL_CLR.hexCode:", TOOL_CLR.hexCode);
