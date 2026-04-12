// ═══════════════════════════════════════════════════════════════════════════
// tool-handler.js — Meow CLI Tool Handler (with permissions + checkpoints + security)
// ═══════════════════════════════════════════════════════════════════════════

import { TOOL_CLR, C, MUTED, TEXT_DIM, ERROR, WARNING, COLS, log } from "./ui.js";
import { executeTool } from "./tools.js";
import { askPermission, getPermissionStore } from "./permissions.js";

const READONLY_TOOLS = new Set(["list_dir", "read_file", "grep_search", "git_diff", "git_log", "git_status"]);

// ─── Tool Handler ───────────────────────────────────────────────────────────

async function handleTools(msg, messages, cfg, checkpointMgr = null) {
  if (!msg.tool_calls || msg.tool_calls.length === 0) return false;

  messages.push(msg);
  const count = msg.tool_calls.length;
  const permStore = getPermissionStore();

  // Lazy-load security modules
  let sandbox = null;
  let audit = null;
  try {
    const sec = await import("./security/sandbox.js");
    sandbox = sec.getSandbox();
    audit = sec.getAuditLogger();
  } catch {}

  // Lazy-load memory hooks
  let memHooks = null;
  try {
    const mem = await import("./memory/rag.js");
    memHooks = mem.getMemoryHooks();
  } catch {}

  console.log("");
  console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}Tools${C.reset} ${MUTED}(${count} call${count > 1 ? "s" : ""})${C.reset}`);

  // Separate read-only and mutating calls for parallel execution
  const readCalls = [];
  const writeCalls = [];
  for (const call of msg.tool_calls) {
    const name = call.function.name;
    if (READONLY_TOOLS.has(name)) readCalls.push(call);
    else writeCalls.push(call);
  }

  // Execute read-only calls in parallel
  if (readCalls.length > 1) {
    const readResults = await Promise.all(readCalls.map(async (call) => {
      const name = call.function.name;
      let args = {};
      try { args = JSON.parse(call.function.arguments); } catch {}

      const argsStr = JSON.stringify(args);
      const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
      console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);

      let result = await executeTool(name, args, cfg);
      if (audit) audit.logToolCall(name, args, result);
      if (memHooks) memHooks.afterToolCall(name, args, result || "");
      return { call, result };
    }));

    for (const { call, result } of readResults) {
      if (result) {
        const lines = result.split("\n").slice(0, 3);
        for (const line of lines) console.log(`  ${MUTED}┃${C.reset}   ${TEXT_DIM}${line.slice(0, COLS - 8)}${C.reset}`);
        if (result.split("\n").length > 3) console.log(`  ${MUTED}┃${C.reset}   ${MUTED}… +${result.split("\n").length - 3} lines${C.reset}`);
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result || "" });
    }
  } else {
    // Single read call — process normally below with write calls
    writeCalls.unshift(...readCalls);
    readCalls.length = 0;
  }

  // Execute mutating calls sequentially
  for (let i = 0; i < writeCalls.length; i++) {
    const call = writeCalls[i];
    let name = call.function.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
    const counter = count > 1 ? `${MUTED}[${readCalls.length + i + 1}/${count}]${C.reset} ` : "";
    console.log(`  ${TOOL_CLR}┃${C.reset} ${counter}${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);

    // Sandbox validation
    if (sandbox) {
      const check = sandbox.validate(name, args);
      if (!check.allowed) {
        const result = `❌ Blocked by sandbox: ${check.reason}`;
        console.log(`  ${MUTED}┃${C.reset}   ${WARNING}${result}${C.reset}`);
        if (audit) audit.logPermission(name, "sandbox_blocked");
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
        continue;
      }
    }

    // Permission check
    const allowed = await askPermission(name, args, permStore, cfg.auto_yes);
    if (!allowed) {
      const result = `❌ Permission denied for ${name}`;
      console.log(`  ${MUTED}┃${C.reset}   ${ERROR}${result}${C.reset}`);
      if (audit) audit.logPermission(name, "denied");
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      continue;
    }

    if (audit) audit.logPermission(name, "allowed");

    // Create checkpoint before file-modifying operations
    if (checkpointMgr && (name === "write_file" || name === "patch_file") && args.path) {
      checkpointMgr.create(`${name}: ${args.path}`, [args.path]);
    }

    let result = await executeTool(name, args, cfg);

    if (audit) audit.logToolCall(name, args, result);
    if (memHooks) memHooks.afterToolCall(name, args, result || "");

    // Show compact result
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
