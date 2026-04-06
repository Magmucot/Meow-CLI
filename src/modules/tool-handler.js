// ═══════════════════════════════════════════════════════════════════════════
// tool-handler.js — Meow CLI Tool Handler (with permissions + checkpoints)
// ═══════════════════════════════════════════════════════════════════════════

import { TOOL_CLR, C, MUTED, TEXT_DIM, ERROR, COLS, log } from "./ui.js";
import { executeTool } from "./tools.js";
import { askPermission, getPermissionStore } from "./permissions.js";

// ─── Tool Handler ───────────────────────────────────────────────────────────

async function handleTools(msg, messages, cfg, checkpointMgr = null) {
  if (!msg.tool_calls || msg.tool_calls.length === 0) return false;

  messages.push(msg);
  const count = msg.tool_calls.length;
  const permStore = getPermissionStore();

  console.log("");
  console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}Tools${C.reset} ${MUTED}(${count} call${count > 1 ? "s" : ""})${C.reset}`);

  for (let i = 0; i < msg.tool_calls.length; i++) {
    const call = msg.tool_calls[i];
    let name = call.function.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

    // Show tool name with args
    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
    const counter = count > 1 ? `${MUTED}[${i + 1}/${count}]${C.reset} ` : "";
    console.log(`  ${TOOL_CLR}┃${C.reset} ${counter}${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);

    // Permission check (replaces old confirm for dangerous tools)
    const allowed = await askPermission(name, args, permStore, cfg.auto_yes);
    if (!allowed) {
      const result = `❌ Permission denied for ${name}`;
      console.log(`  ${MUTED}┃${C.reset}   ${ERROR}${result}${C.reset}`);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      continue;
    }

    // Create checkpoint before file-modifying operations
    if (checkpointMgr && (name === "write_file" || name === "patch_file") && args.path) {
      checkpointMgr.create(`${name}: ${args.path}`, [args.path]);
    }

    let result = await executeTool(name, args, cfg);

    // Show compact result (first few lines)
    if (result) {
      const lines = result.split("\n").slice(0, 5);
      for (const line of lines) {
        const trimmed = line.slice(0, COLS - 8);
        console.log(`  ${MUTED}┃${C.reset}   ${TEXT_DIM}${trimmed}${C.reset}`);
      }
      if (result.split("\n").length > 5) {
        console.log(`  ${MUTED}┃${C.reset}   ${MUTED}… +${result.split("\n").length - 5} more lines${C.reset}`);
      }
    }

    messages.push({ role: "tool", tool_call_id: call.id, content: result });
  }

  console.log(`  ${TOOL_CLR}┃${C.reset} ${MUTED}done${C.reset}`);
  console.log("");

  return true;
}


export { handleTools };
