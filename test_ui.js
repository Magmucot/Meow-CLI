
import chalk from 'chalk';

const hex = "#6CB4DC";
const fn = chalk.hex(hex);

console.log('fn.open:', fn.open);
console.log('fn.close:', fn.close);
console.log('String(fn):', String(fn));

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
