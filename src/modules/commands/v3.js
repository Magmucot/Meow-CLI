// ═══════════════════════════════════════════════════════════════════════════
// commands/v3.js — All v3 Feature Commands
// /lead, /delegate, /memory, /pair, /preview, /ci, /audit, /incognito, /routing
// ═══════════════════════════════════════════════════════════════════════════

import {
  log, C, ACCENT, ACCENT2, MUTED, TEXT, TEXT_DIM, SUCCESS, ERROR, WARNING,
  saveConfig,
} from "../../core.js";

// ─── /lead — AI Lead Developer Mode ─────────────────────────────────────────

const handleLead = async (ctx, input) => {
  if (!input.startsWith("/lead")) return null;

  const rest = input.slice(5).trim();

  if (!ctx.cfg.api_key) {
    log.err("API Key not set. Use /key first.");
    return { handled: true };
  }

  const { LeadDevSession } = await import("../agents/lead-dev.js");
  const session = new LeadDevSession(ctx.cfg, [...ctx.messages], ctx.saveState);
  ctx.activeAutopilot = session;

  const isAuto = rest.startsWith("auto") || rest.startsWith("--auto");
  const context = rest.replace(/^auto\s*/, "").replace(/^--auto\s*/, "").trim();

  try {
    await session.run(context, { auto: isAuto });
  } catch (e) {
    log.err(`Lead dev error: ${e.message}`);
  }

  ctx.activeAutopilot = null;
  ctx.saveState();
  return { handled: true };
};

// ─── /delegate — Quick task delegation ──────────────────────────────────────

const handleDelegate = async (ctx, input) => {
  if (!input.startsWith("/delegate ")) return null;

  const task = input.slice(10).trim();
  if (!task) {
    log.err("Usage: /delegate <task description>");
    return { handled: true };
  }

  const { AgentCoordinator } = await import("../agents/subagent.js");
  const coordinator = new AgentCoordinator(ctx.cfg);

  log.info("Delegating to sub-agent...");

  const results = await coordinator.runParallel([{
    task,
    maxTokens: 30000,
    maxCost: 2.0,
    depth: 0,
  }]);

  const r = results[0];
  if (r) {
    const icon = r.status === "done" ? `${SUCCESS}✔` : `${ERROR}✘`;
    console.log(`\n  ${icon}${C.reset} ${TEXT}${r.status}${C.reset} ${MUTED}(${r.iterations}i, ${r.toolCalls}t, ${r.tokensUsed} tokens, $${(r.costUsd || 0).toFixed(4)})${C.reset}`);
    if (r.result) {
      const lines = r.result.split("\n").slice(0, 15);
      for (const line of lines) console.log(`  ${TEXT_DIM}${line}${C.reset}`);
    }
    console.log("");
  }

  return { handled: true };
};

// ─── /memory — RAG Memory System ────────────────────────────────────────────

const handleMemory = async (ctx, input) => {
  if (!input.startsWith("/memory")) return null;

  const parts = input.split(/\s+/);
  const cmd = parts[1] || "stats";

  const { getMemoryStore } = await import("../memory/rag.js");
  const store = getMemoryStore();

  if (cmd === "stats") {
    store.printStats();
    return { handled: true };
  }

  if (cmd === "search") {
    const query = parts.slice(2).join(" ");
    if (!query) { log.err("Usage: /memory search <query>"); return { handled: true }; }
    const results = store.search(query, { maxResults: 10 });
    console.log(`\n  ${ACCENT}${C.bold}◆ Memory Search: "${query}"${C.reset} ${MUTED}(${results.length} results)${C.reset}`);
    for (const r of results) {
      const score = (r.similarity * 100).toFixed(0);
      console.log(`  ${TEXT_DIM}[${r.memory.type}] ${score}%${C.reset} ${TEXT}${r.memory.content.slice(0, 100)}${C.reset}`);
    }
    console.log("");
    return { handled: true };
  }

  if (cmd === "add") {
    const text = parts.slice(2).join(" ");
    if (!text) { log.err("Usage: /memory add <text>"); return { handled: true }; }
    store.add("pattern", text);
    log.ok("Memory added");
    return { handled: true };
  }

  if (cmd === "clear") {
    const { getProjectId } = await import("../memory/rag.js");
    const project = parts[2] || getProjectId();
    store.clear(project === "--all" ? null : project);
    log.ok(project === "--all" ? "All memory cleared" : `Memory cleared for: ${project}`);
    return { handled: true };
  }

  if (cmd === "prefs") {
    const prefs = store.getPreferences();
    console.log(`\n  ${ACCENT}${C.bold}◆ Learned Preferences${C.reset}`);
    const entries = Object.entries(prefs);
    if (entries.length === 0) console.log(`  ${MUTED}No preferences learned yet${C.reset}`);
    else for (const [k, v] of entries) console.log(`  ${TEXT_DIM}${k}:${C.reset} ${TEXT}${v}${C.reset}`);
    console.log("");
    return { handled: true };
  }

  log.err("Usage: /memory <stats|search|add|clear|prefs>");
  return { handled: true };
};

// ─── /pair — Pair Programming Mode ──────────────────────────────────────────

const handlePair = async (ctx, input) => {
  if (!input.startsWith("/pair")) return null;

  const { getPairProgrammer, PairMode } = await import("../smart/ux.js");
  const pair = getPairProgrammer();
  const mode = input.split(/\s+/)[1] || "";

  if (!mode || mode === "status") {
    log.info(`Pair mode: ${pair.mode}`);
    log.dim("Options: /pair verbose | balanced | silent | off");
    return { handled: true };
  }

  if (Object.values(PairMode).includes(mode)) {
    pair.setMode(mode);
    pair.printModeChange();

    const suffix = pair.getSystemSuffix();
    if (suffix) {
      const base = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
      ctx.messages[0] = { role: "system", content: base + suffix };
    } else {
      ctx.messages[0] = { role: "system", content: ctx.cfg.profiles[ctx.cfg.profile]?.system || "" };
    }
    return { handled: true };
  }

  log.err("Usage: /pair <verbose|balanced|silent|off>");
  return { handled: true };
};

// ─── /preview — Live Preview ────────────────────────────────────────────────

const handlePreview = async (ctx, input) => {
  if (!input.startsWith("/preview")) return null;

  const { getLivePreview } = await import("../smart/ux.js");
  const preview = getLivePreview();
  const cmd = input.split(/\s+/)[1] || "status";

  if (cmd === "start") {
    const result = preview.start();
    if (result.success) log.ok(`Dev server started (PID: ${result.pid}): ${result.cmd}`);
    else log.err(result.error);
  } else if (cmd === "stop") {
    const result = preview.stop();
    if (result.success) log.ok("Dev server stopped");
    else log.err(result.error);
  } else {
    const status = preview.status();
    log.info(`Preview: ${status.running ? `${SUCCESS}running${C.reset} (PID: ${status.pid})` : `${MUTED}stopped${C.reset}`}`);
  }
  return { handled: true };
};

// ─── /ci — CI/CD Management ─────────────────────────────────────────────────

const handleCI = async (ctx, input) => {
  if (!input.startsWith("/ci")) return null;

  const parts = input.split(/\s+/);
  const cmd = parts[1] || "status";

  const { detectCIProvider, listWorkflows, generateWorkflow, saveWorkflow, SelfHealer } = await import("../smart/cicd.js");

  if (cmd === "status") {
    const info = listWorkflows();
    console.log(`\n  ${ACCENT}${C.bold}◆ CI/CD${C.reset} ${MUTED}(${info.provider || "none detected"})${C.reset}`);
    if (info.workflows.length > 0) {
      for (const w of info.workflows) console.log(`  ${SUCCESS}●${C.reset} ${TEXT}${w.name}${C.reset} ${MUTED}${w.file}${C.reset}`);
    } else console.log(`  ${MUTED}No workflows found${C.reset}`);
    console.log("");
    return { handled: true };
  }

  if (cmd === "generate") {
    const desc = parts.slice(2).join(" ") || "CI pipeline with test, lint, and build";
    log.info(`Generating workflow: ${desc}`);
    const result = await generateWorkflow(ctx.cfg, desc);
    if (result.success) {
      const filePath = saveWorkflow(parts[2] || "ci", result.yaml);
      log.ok(`Workflow saved: ${filePath}`);
    } else log.err(result.error);
    return { handled: true };
  }

  if (cmd === "heal") {
    const healer = new SelfHealer(ctx.cfg);
    log.info("Running self-healing...");
    const result = await healer.checkAndHeal();
    if (result.healed) log.ok(`Self-healed in ${result.attempt} attempt(s)`);
    else log.warn(result.reason || "Could not self-heal");
    return { handled: true };
  }

  log.err("Usage: /ci <status|generate|heal>");
  return { handled: true };
};

// ─── /audit — Audit Log ─────────────────────────────────────────────────────

const handleAudit = async (ctx, input) => {
  if (!input.startsWith("/audit")) return null;

  const { getAuditLogger } = await import("../security/sandbox.js");
  const audit = getAuditLogger();
  const cmd = input.split(/\s+/)[1] || "show";

  if (cmd === "show") {
    audit.printRecent(30);
  } else if (cmd === "clear") {
    audit.clear();
    log.ok("Audit log cleared");
  } else {
    log.err("Usage: /audit <show|clear>");
  }
  return { handled: true };
};

// ─── /incognito — Incognito Mode ────────────────────────────────────────────

const handleIncognito = async (ctx, input) => {
  if (!input.startsWith("/incognito")) return null;

  const { getIncognito } = await import("../security/sandbox.js");
  const incognito = getIncognito();
  const cmd = input.split(/\s+/)[1] || "status";

  if (cmd === "on" || cmd === "start") {
    const result = incognito.start();
    if (result.success) console.log(`  ${WARNING}🕶  Incognito mode ON — no data persists${C.reset}\n`);
    else log.err(result.error);
  } else if (cmd === "off" || cmd === "stop") {
    const result = incognito.stop();
    if (result.success) console.log(`  ${SUCCESS}Incognito mode OFF — data destroyed${C.reset}\n`);
    else log.err(result.error);
  } else {
    log.info(`Incognito: ${incognito.isActive() ? `${WARNING}ON` : `${MUTED}OFF`}${C.reset}`);
  }
  return { handled: true };
};

// ─── /routing — Smart Model Routing ─────────────────────────────────────────

const handleRouting = async (ctx, input) => {
  if (!input.startsWith("/routing")) return null;

  const parts = input.split(/\s+/);
  const cmd = parts[1] || "status";

  const { getModelRouter } = await import("../smart/model-router.js");
  const router = getModelRouter(ctx.cfg);

  if (cmd === "status" || cmd === "config") {
    router.printConfig();
    return { handled: true };
  }

  if (cmd === "on") {
    if (!ctx.cfg.smart_routing) ctx.cfg.smart_routing = {};
    ctx.cfg.smart_routing.enabled = true;
    saveConfig(ctx.cfg);
    log.ok("Smart routing enabled");
    return { handled: true };
  }

  if (cmd === "off") {
    if (!ctx.cfg.smart_routing) ctx.cfg.smart_routing = {};
    ctx.cfg.smart_routing.enabled = false;
    saveConfig(ctx.cfg);
    log.ok("Smart routing disabled");
    return { handled: true };
  }

  if (cmd === "fast" || cmd === "balanced" || cmd === "powerful") {
    const model = parts[2];
    if (!model) { log.err(`Usage: /routing ${cmd} <model_name>`); return { handled: true }; }
    if (!ctx.cfg.smart_routing) ctx.cfg.smart_routing = {};
    ctx.cfg.smart_routing[`${cmd}_model`] = model;
    saveConfig(ctx.cfg);
    log.ok(`${cmd} model → ${model}`);
    return { handled: true };
  }

  log.err("Usage: /routing <status|on|off|fast|balanced|powerful> [model]");
  return { handled: true };
};

export {
  handleLead, handleDelegate, handleMemory, handlePair,
  handlePreview, handleCI, handleAudit, handleIncognito, handleRouting,
};
