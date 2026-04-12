
import { TOOL_CLR, ACCENT, box } from './src/modules/ui.js';

console.log("TOOL_CLR.bold('test'):", TOOL_CLR.bold('test'));
console.log("ACCENT.bold('test'):", ACCENT.bold('test'));

try {
  const boxed = box("Hello", { color: ACCENT });
  console.log("Box with ACCENT (should not throw):");
  console.log(boxed);
} catch (e) {
  console.error("Box with ACCENT failed:", e);
}

try {
  const boxed = box("Hello", { color: "#FF0000" });
  console.log("Box with hex string (should not throw):");
  console.log(boxed);
} catch (e) {
  console.error("Box with hex string failed:", e);
}
