
import { Chalk } from 'chalk';
const chalk = new Chalk({level: 3});

const color = (hex) => {
  const fn = chalk.hex(hex);
  const wrapper = (text) => fn(text);
  return new Proxy(wrapper, {
    get(target, prop) {
      if (prop === 'hexCode') return hex;
      if (prop === 'toString') return () => fn.open || "";
      if (prop === Symbol.toPrimitive) return (hint) => (hint === 'number') ? null : (fn.open || "");
      const val = fn[prop];
      return typeof val === 'function' ? val.bind(fn) : val;
    }
  });
};

const TOOL_CLR = color("#6CB4DC");
console.log('Template literal:', `${TOOL_CLR}test`);
console.log('TOOL_CLR + "test":', TOOL_CLR + "test");
console.log('String(TOOL_CLR):', String(TOOL_CLR));
console.log('TOOL_CLR.bold type:', typeof TOOL_CLR.bold);
try {
    console.log('TOOL_CLR.bold("hello"):', TOOL_CLR.bold("hello"));
} catch (e) {
    console.log('TOOL_CLR.bold("hello") failed:', e.message);
}
