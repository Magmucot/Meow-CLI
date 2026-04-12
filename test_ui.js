
import { Chalk } from 'chalk';
const chalk = new Chalk({level: 3});

const c = new Chalk({level: 3});
console.log('c.red.open:', JSON.stringify(c.red.open));
const fn = c.hex("#6CB4DC");
console.log('fn.open:', JSON.stringify(fn.open));

const color = (hex) => {
  const fn = chalk.hex(hex);
  const wrapper = (text) => fn(text);
  return new Proxy(wrapper, {
    get(target, prop) {
      if (prop === 'hexCode') return hex;
      if (prop === 'toString') return () => fn.open;
      const val = fn[prop];
      return typeof val === 'function' ? val.bind(fn) : val;
    }
  });
};

const TOOL_CLR = color("#6CB4DC");
console.log('TOOL_CLR.hexCode:', TOOL_CLR.hexCode);
console.log('TOOL_CLR.toString():', TOOL_CLR.toString());
console.log('Template literal:', `${TOOL_CLR}test`);
console.log('TOOL_CLR.bold type:', typeof TOOL_CLR.bold);
try {
    console.log('TOOL_CLR.bold("hello"):', TOOL_CLR.bold("hello"));
} catch (e) {
    console.log('TOOL_CLR.bold("hello") failed:', e.message);
}
