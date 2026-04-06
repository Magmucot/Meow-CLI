
import { ACCENT, MUTED, TEXT, TEXT_DIM, C, log, loadPins, savePins, timeAgo } from "../../core.js";

const handlePins = async (ctx, input) => {
  if (input.startsWith("/pin")) {
    const parts = input.split(" ");
    const idxStr = parts[1];
    const pins = loadPins();
    const messagesOnly = ctx.messages.filter(m => m.role !== "system");
    let targetIndex;
    if (!idxStr) {
      targetIndex = messagesOnly.length - 1;
    } else {
      const parsed = parseInt(idxStr, 10);
      if (Number.isNaN(parsed)) { log.err("Usage: /pin [index]"); return { handled: true }; }
      targetIndex = parsed - 1;
    }
    if (targetIndex < 0 || targetIndex >= messagesOnly.length) {
      log.err("Message index out of range.");
      return { handled: true };
    }
    const msg = messagesOnly[targetIndex];
    const content = msg?.content;
    const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    const pin = {
      time: Date.now(),
      chat: ctx.currentChat,
      role: msg.role,
      index: targetIndex + 1,
      content: text.slice(0, 2000)
    };
    pins.push(pin);
    savePins(pins);
    log.ok(`Pinned message #${pin.index}`);
    ctx.refreshBanner();
    return { handled: true };
  }

  if (input === "/pins") {
    const pins = loadPins();
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Pins${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    if (pins.length === 0) {
      console.log(`  ${MUTED}(none)${C.reset}`);
    } else {
      pins.slice(-50).forEach((p, i) => {
        const label = `${i + 1}. ${p.chat} · ${p.role} · #${p.index} · ${timeAgo(p.time)}`;
        console.log(`  ${TEXT}${label}${C.reset}`);
        const snippet = p.content.replace(/\s+/g, " ").slice(0, 160);
        console.log(`  ${TEXT_DIM}${snippet}${C.reset}`);
      });
    }
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    console.log("");
    return { handled: true };
  }

  return null;
};

export { handlePins };
