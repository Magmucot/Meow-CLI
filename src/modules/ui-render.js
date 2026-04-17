import { C, AI_GRADIENT, MUTED, ACCENT, renderMD } from "./ui.js";

export class StreamRenderer {
  constructor() {
    this.buffer = "";
    this.lineCount = 0;
    this.started = false;
  }
  onChunk(chunk) {
    if (chunk.type !== "text" || !chunk.content) return;
    if (!this.started) {
      console.log(`\n  ${C.bold(AI_GRADIENT("Assistant"))}`);
      this.started = true;
    }
    this.buffer += chunk.content;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) this._printLine(line);
  }
  finish() {
    if (this.buffer) { this._printLine(this.buffer); this.buffer = ""; }
    if (this.started) console.log(`  ${MUTED("└")}\n`);
  }
  _printLine(line) {
    let formatted = line;
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, (m, p1) => C.bold(p1));
    formatted = formatted.replace(/`([^`]+)`/g, (m, p1) => MUTED(p1));
    if (/^#{1,3}\s/.test(formatted)) formatted = ACCENT.bold(formatted);
    console.log(`  ${MUTED("┃")}  ${formatted}`);
    this.lineCount++;
  }
}

export function renderNonStreaming(msg) {
  console.log(`\n  ${C.bold(AI_GRADIENT("Assistant"))}`);
  const output = renderMD(msg.content || "").trim();
  console.log(output.split("\n").map(l => `  ${MUTED("┃")}  ` + l).join("\n"));
  console.log(`  ${MUTED("└")}\n`);
}
