import { TOOL_CLR, C, MUTED, TEXT_DIM, ERROR, WARNING, COLS, log } from "./ui.js";
import { executeTool } from "./tools.js";
import { askPermission, getPermissionStore } from "./permissions.js";
import { getTrustManager, TRUST_LEVEL } from "./trust.js";
import { t } from "./config.js";

const READONLY_TOOLS = new Set(["list_dir", "read_file", "grep_search", "git_diff", "git_log", "git_status"]);

async function handleTools(msg, messages, cfg, checkpointMgr = null) {
  if (!msg.tool_calls || msg.tool_calls.length === 0) return false;

  // Trust check
  const trust = getTrustManager();
  const status = await trust.checkStatus();
  const isTrusted = status === TRUST_LEVEL.TRUSTED;

  messages.push(msg);
  const count = msg.tool_calls.length;
  const permStore = getPermissionStore();

  let sandbox = null, audit = null;
  try {
    const sec = await import("./security/sandbox.js");
    sandbox = sec.getSandbox();
    audit = sec.getAuditLogger();
  } catch {}

  let memHooks = null;
  try {
    const mem = await import("./memory/rag.js");
    memHooks = mem.getMemoryHooks();
  } catch {}

  console.log(`\n  ${TOOL_CLR("┃")} ${TOOL_CLR.bold("Tools")} ${MUTED("(" + count + " call" + (count > 1 ? "s" : "") + ")")}`);

  if (!isTrusted) {
    console.log(`  ${MUTED("┃")}   ${WARNING(t(cfg, "trust_readonly_warning"))}`);
  }

  const readCalls = [], writeCalls = [];
  for (const call of msg.tool_calls) {
    if (READONLY_TOOLS.has(call.function.name)) readCalls.push(call);
    else writeCalls.push(call);
  }

  // Handle write calls in untrusted repo
  if (!isTrusted && writeCalls.length > 0) {
    for (const call of writeCalls) {
      const res = `❌ Untrusted repository: ${call.function.name} is blocked in read-only mode. Use /trust to enable.`;
      console.log(`  ${MUTED("┃")}   ${ERROR(res)}`);
      messages.push({ role: "tool", tool_call_id: call.id, content: res });
    }
    // Filter out write calls from being executed
    writeCalls.length = 0;
  }

  if (readCalls.length > 1) {
    const readResults = await Promise.all(readCalls.map(async (call) => {
      const name = call.function.name;
      let args = {};
      try { args = JSON.parse(call.function.arguments); } catch {}
      const argsStr = JSON.stringify(args);
      const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
      console.log(`  ${TOOL_CLR("┃")} ${TOOL_CLR.bold(name)} ${MUTED(short)}`);

      if (sandbox) {
        const check = sandbox.validate(name, args);
        if (!check.allowed) {
          const res = `❌ Blocked by sandbox: ${check.reason}`;
          console.log(`  ${MUTED("┃")}   ${WARNING(res)}`);
          if (audit) audit.logPermission(name, "sandbox_blocked");
          return { call, result: res };
        }
      }

      const env = sandbox ? sandbox.filterEnv() : process.env;
      let result = await executeTool(name, args, cfg, env);
      if (audit) audit.logToolCall(name, args, result);
      if (memHooks) memHooks.afterToolCall(name, args, result || "");
      return { call, result };
    }));

    for (const { call, result } of readResults) {
      if (result) {
        const lines = result.split("\n").slice(0, 3);
        for (const line of lines) console.log(`  ${MUTED("┃")}   ${TEXT_DIM(line.slice(0, COLS - 8))}`);
        if (result.split("\n").length > 3) console.log(`  ${MUTED("┃")}   ${MUTED("… +" + (result.split("\n").length - 3) + " lines")}`);
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result || "" });
    }
  } else {
    writeCalls.unshift(...readCalls);
  }

  for (let i = 0; i < writeCalls.length; i++) {
    const call = writeCalls[i];
    const name = call.function.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
    const argsStr = JSON.stringify(args);
    const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
    const counter = count > 1 ? `${MUTED("[" + (readCalls.length + i + 1) + "/" + count + "]")} ` : "";
    console.log(`  ${TOOL_CLR("┃")} ${counter}${TOOL_CLR.bold(name)} ${MUTED(short)}`);

    if (sandbox) {
      const check = sandbox.validate(name, args);
      if (!check.allowed) {
        const res = `❌ Blocked by sandbox: ${check.reason}`;
        console.log(`  ${MUTED("┃")}   ${WARNING(res)}`);
        if (audit) audit.logPermission(name, "sandbox_blocked");
        messages.push({ role: "tool", tool_call_id: call.id, content: res });
        continue;
      }
    }

    const allowed = await askPermission(name, args, permStore, cfg.auto_yes);
    if (!allowed) {
      const res = `❌ Permission denied for ${name}`;
      console.log(`  ${MUTED("┃")}   ${ERROR(res)}`);
      if (audit) audit.logPermission(name, "denied");
      messages.push({ role: "tool", tool_call_id: call.id, content: res });
      continue;
    }

    if (audit) audit.logPermission(name, "allowed");
    if (checkpointMgr && (name === "write_file" || name === "patch_file") && args.path) checkpointMgr.create(`${name}: ${args.path}`, [args.path]);

    const env = sandbox ? sandbox.filterEnv() : process.env;
    let result = await executeTool(name, args, cfg, env);
    if (audit) audit.logToolCall(name, args, result);
    if (memHooks) memHooks.afterToolCall(name, args, result || "");

    if (result) {
      const lines = result.split("\n").slice(0, 5);
      for (const line of lines) console.log(`  ${MUTED("┃")}   ${TEXT_DIM(line.slice(0, COLS - 8))}`);
      if (result.split("\n").length > 5) console.log(`  ${MUTED("┃")}   ${MUTED("… +" + (result.split("\n").length - 5) + " more lines")}`);
    }
    messages.push({ role: "tool", tool_call_id: call.id, content: result });
  }

  console.log(`  ${TOOL_CLR("┃")} ${MUTED("done")}\n`);
  return true;
}

export { handleTools };
