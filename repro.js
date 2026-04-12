import chalk from 'chalk';
import { ACCENT2, C, MUTED, TEXT, TEXT_DIM, SUCCESS, box, COLS } from './src/modules/ui.js';

console.log("Testing colors in template literals:");
console.log(`ACCENT2: "${ACCENT2}"`);
console.log(`C.bold: "${C.bold}"`);
console.log(`Combined: ${ACCENT2}${C.bold}AI LEAD DEVELOPER${C.reset}`);

const summary = { test: true, lint: false, build: true, typeCheck: false };
const lines = [
  `${ACCENT2}${C.bold}AI LEAD DEVELOPER${C.reset}`,
  "",
  `${MUTED}Project:${C.reset} ${TEXT}test-project${C.reset}  ${MUTED}CWD:${C.reset} ${TEXT_DIM}${process.cwd()}${C.reset}`,
  `${MUTED}Gates:${C.reset} ${summary.test ? `${SUCCESS}test` : `${MUTED}test`}${C.reset} ${summary.lint ? `${SUCCESS}lint` : `${MUTED}lint`}${C.reset} ${summary.build ? `${SUCCESS}build` : `${MUTED}build`}${C.reset} ${summary.typeCheck ? `${SUCCESS}types` : `${MUTED}types`}${C.reset}`,
  `${MUTED}Budget:${C.reset} $10 ${MUTED}max tasks:${C.reset} 5`,
  `\n${TEXT_DIM}Press Ctrl+C to stop${C.reset}`,
].filter(Boolean);

console.log("\nTesting box:");
try {
    console.log(box(lines.join("\n"), { title: "🎯 LEAD DEV", color: ACCENT2, width: Math.min(COLS - 2, 65) }));
} catch (e) {
    console.error("Box failed:", e);
}
