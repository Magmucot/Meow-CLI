
import { Chalk } from 'chalk';
const chalk = new Chalk({level: 3});

const color = (hex) => {
  const fn = chalk.hex(hex);
  const wrapper = (text) => fn(text);
  return new Proxy(wrapper, {
    get(target, prop) {
      if (prop === 'hexCode') return hex;
      if (prop === 'toString' || prop === Symbol.toPrimitive) {
        return (hint) => (hint === 'number' ? null : (fn.open || ""));
      }
      const val = fn[prop];
      if (typeof val === 'function') {
        const bound = val.bind(fn);
        return (...args) => {
          const result = bound(...args);
          return result;
        };
      }
      return val;
    }
  });
};

const TOOL_CLR = color("#6CB4DC");
console.log('TOOL_CLR.bold("hello"):', JSON.stringify(TOOL_CLR.bold("hello")));
console.log('Template literal:', `${TOOL_CLR}test`);
console.log('TOOL_CLR.bold type:', typeof TOOL_CLR.bold);
try {
    console.log('TOOL_CLR.bold("hello"):', TOOL_CLR.bold("hello"));
} catch (e) {
    console.log('TOOL_CLR.bold("hello") failed:', e.message);
}
