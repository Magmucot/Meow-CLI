// ═══════════════════════════════════════════════════════════════════════════
// cli.js — Meow CLI v2 Main Loop
// Streaming · Permissions · MEOW.md · Checkpoints · Sessions · Cost
// ═══════════════════════════════════════════════════════════════════════════

import { askInput } from "./modules/cli-input.js";
import { intro, outro, note } from "@clack/prompts";
import { createCliContext, registerSignalHandlers } from "./modules/cli-context.js";
import { runCommandHandlers } from "./modules/commands/index.js";
import {
  log, box, C, TEXT, TEXT_DIM, ACCENT, ACCENT3, MUTED, USER_CLR, IMG_CLR, AI_CLR, COLS,
  ERROR, WARNING, SUCCESS,
  renderMD,
  callApi, callApiStream,
  handleTools,
  buildVisionContent, parseInlineImages,
  makePrompt, applyAliases, Spinner,
  IMAGE_EXTENSIONS, isImagePath, isUrl,
  t, loadPlugins, runPluginCommand, listPluginCommands,
} from "./core.js";

import { buildSystemPrompt, loadProjectContext } from "./modules/project-context.js";
import { CheckpointManager } from "./modules/checkpoints.js";
import { SessionManager } from "./modules/sessions.js";
import { CostTracker } from "./modules/cost-tracker.js";
import { shouldAutoCompact, compactMessages, printCompactResult, estimateTokens } from "./modules/compact.js";

// ─── Parse CLI args ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    pipe: false,
    prompt: null,
    json: false,
    noStream: false,
    resume: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--pipe":
        opts.pipe = true;
        break;
      case "-p":
      case "--prompt":
        opts.prompt = args[++i] || "";
        opts.pipe = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--no-stream":
        opts.noStream = true;
        break;
      case "--resume":
        opts.resume = args[++i] || "latest";
        break;
    }
  }

  // Check for piped stdin
  if (!process.stdin.isTTY && !opts.prompt) {
    opts.pipe = true;
  }

  return opts;
}

// ─── Pipe Mode (non-interactive) ────────────────────────────────────────────

async function runPipeMode(opts) {
  const { createCliContext } = await import("./modules/cli-context.js");
  const ctx = createCliContext();

  let input = opts.prompt;
  if (!input) {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks).toString("utf8").trim();
  }

  if (!input) {
    if (opts.json) console.log(JSON.stringify({ error: "No input" }));
    else console.error("Error: No input provided");
    process.exit(1);
  }

  // Inject project context
  const contextParts = loadProjectContext();
  const basePrompt = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
  const systemPrompt = buildSystemPrompt(basePrompt, contextParts);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: input },
  ];

  try {
    const data = await callApi(messages, ctx.cfg);
    const content = data.choices?.[0]?.message?.content || "";

    if (opts.json) {
      console.log(JSON.stringify({
        content,
        model: ctx.cfg.model,
        usage: data.usage || null,
      }));
    } else {
      console.log(content);
    }
    process.exit(0);
  } catch (e) {
    if (opts.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error(`Error: ${e.message}`);
    }
    process.exit(1);
  }
}

// ─── Stream Response Renderer ───────────────────────────────────────────────

class StreamRenderer {
  constructor() {
    this.buffer = "";
    this.lineCount = 0;
    this.started = false;
  }

  onChunk(chunk) {
    if (chunk.type !== "text" || !chunk.content) return;

    if (!this.started) {
      // Print header on first chunk
      console.log(`\n  ${C.bold(AI_GRADIENT("Assistant"))}`);
      this.started = true;
    }

    this.buffer += chunk.content;

    // Render complete lines as they come in
    const lines = this.buffer.split("\n");
    // Keep the last (potentially incomplete) line in buffer
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      this._printLine(line);
    }
  }

  finish() {
    // Print remaining buffer
    if (this.buffer) {
      this._printLine(this.buffer);
      this.buffer = "";
    }

    if (this.started) {
      console.log(`  ${MUTED("└")}\n`);
    }
  }

  _printLine(line) {
    // Simple inline markdown hints: bold, code, headers
    let formatted = line;

    // Bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, (m, p1) => C.bold(p1));

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, (m, p1) => MUTED(p1));

    // Headers
    if (/^#{1,3}\s/.test(formatted)) {
      formatted = ACCENT.bold(formatted);
    }

    console.log(`  ${MUTED("┃")}  ${formatted}`);
    this.lineCount++;
  }
}

// ─── Non-streaming Response Renderer ────────────────────────────────────────

function renderNonStreaming(msg, data) {
  console.log(`\n  ${C.bold(AI_GRADIENT("Assistant"))}`);
  const output = renderMD(msg.content || "").trim();
  console.log(output.split("\n").map(l => `  ${MUTED("┃")}  ` + l).join("\n"));
  console.log(`  ${MUTED("└")}\n`);
}

// ─── Main Interactive Loop ──────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  // Pipe mode: non-interactive
  if (opts.pipe) {
    return runPipeMode(opts);
  }

  const ctx = createCliContext();
  registerSignalHandlers(ctx);

  // Initialize new subsystems
  const sessionMgr = new SessionManager();
  const checkpointMgr = new CheckpointManager(sessionMgr.create());
  const costTracker = new CostTracker();
  const useStreaming = !opts.noStream;

  // Attach to context for command handlers
  ctx.sessionMgr = sessionMgr;
  ctx.checkpointMgr = checkpointMgr;
  ctx.costTracker = costTracker;

  // Resume session if requested
  if (opts.resume) {
    const sessions = sessionMgr.list();
    const targetId = opts.resume === "latest" ? sessions[0]?.id : opts.resume;
    if (targetId) {
      const data = sessionMgr.load(targetId);
      if (data) {
        ctx.messages = data.messages || ctx.messages;
        ctx.history = ctx.messages.filter(m => m.role !== "system");
        log.ok(`Session '${targetId}' resumed (${data.messagesCount} messages)`);
      }
    }
  }

  // Load project context (MEOW.md)
  const contextParts = loadProjectContext();
  if (contextParts.length > 0) {
    const basePrompt = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
    ctx.messages[0] = { role: "system", content: buildSystemPrompt(basePrompt, contextParts) };
    const totalChars = contextParts.reduce((sum, p) => sum + p.content.length, 0);
    log.dim(`Loaded MEOW.md context (~${Math.ceil(totalChars / 3.5)} tokens)`);
  }

  // Inject RAG memory context
  try {
    const { getMemoryStore } = await import("./modules/memory/rag.js");
    const memStore = getMemoryStore();
    const memStats = memStore.getStats();
    if (memStats.total > 0) {
      const memContext = memStore.buildContextForPrompt("project context");
      if (memContext) {
        ctx.messages[0].content += "\n\n" + memContext;
        log.dim(`Memory: ${memStats.total} entries loaded`);
      }
    }
  } catch {}

  // Show banner
  ctx.refreshBanner();

  await loadPlugins(ctx.cfg, ctx);

  // ─── Main Loop ──────────────────────────────────────────────────────

  while (true) {
    let input;
    try {
      input = (await askInput(makePrompt(ctx.cfg, ctx.currentChat, ctx.history.length))).trim();
    } catch {
      break; // readline closed
    }
    if (!input) continue;

    input = applyAliases(input, ctx.cfg);

    if (input === "/plugins") input = "/plugin list";

    // Plugin commands
    const pluginResult = await runPluginCommand(ctx, input);
    if (pluginResult?.handled) {
      if (pluginResult?.exit) break;
      if (pluginResult?.continue) {
        if (pluginResult?.input !== undefined) input = pluginResult.input;
      } else {
        continue;
      }
    }

    // Built-in commands
    const commandResult = await runCommandHandlers(ctx, input);
    if (commandResult?.exit) break;
    if (commandResult?.handled && !commandResult?.continue) continue;
    if (commandResult?.input !== undefined) input = commandResult.input;

    // ── Check for inline images {img:path} ──
    const { text: parsedText, images: inlineImages } = parseInlineImages(input);
    const allImages = [...ctx.pendingImages, ...inlineImages];
    ctx.pendingImages = [];

    // ── Build user message ──
    let userMsg;
    if (allImages.length > 0) {
      try { userMsg = { role: "user", content: buildVisionContent(parsedText, allImages) }; }
      catch (e) { log.err(e.message); continue; }
    } else {
      userMsg = { role: "user", content: input };
    }

    ctx.messages.push(userMsg);

    // ── Auto-compact check ──
    const compactCheck = shouldAutoCompact(ctx.messages);
    if (compactCheck.shouldCompact) {
      log.warn(`Context at ~${compactCheck.tokens.toLocaleString()} tokens (${compactCheck.percentage}% of threshold). Auto-compacting...`);
      const compactResult = await compactMessages(ctx.messages, ctx.cfg);
      if (compactResult.compressed) {
        ctx.messages = compactResult.messages;
        printCompactResult(compactResult);
      }
    }

    // ── Smart Model Routing ──
    let routedModel = null;
    try {
      const { getModelRouter } = await import("./modules/smart/model-router.js");
      const router = getModelRouter(ctx.cfg);
      if (router.enabled) {
        const userText = typeof input === "string" ? input : "";
        const route = router.selectModel(userText, estimateTokens(ctx.messages));
        if (route.routed) {
          routedModel = route.model;
          log.dim(`${route.label} → ${route.model}`);
        }
      }
    } catch {}

    const effectiveCfg = routedModel ? { ...ctx.cfg, model: routedModel } : ctx.cfg;

    // ── API Call Loop (tool calls may loop) ──
    const spinnerText = allImages.length > 0 ? "Analyzing image" : "Thinking";
    const spinner = new Spinner(spinnerText);

    try {
      let toolRound = 0;
      while (true) {
        let data;

        if (useStreaming && toolRound === 0) {
          // ── STREAMING MODE ──
          const renderer = new StreamRenderer();
          spinner.start();

          data = await callApiStream(ctx.messages, effectiveCfg, (chunk) => {
            if (chunk.type === "text" && chunk.content) {
              // Stop spinner on first text chunk
              spinner.stop();
              renderer.onChunk(chunk);
            }
          });
          spinner.stop();

          const msg = data.choices[0].message;

          // Check for tool calls
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            renderer.finish();
            const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg, checkpointMgr);
            if (toolLoop) {
              toolRound++;
              spinner.update(`Processing (round ${toolRound + 1})`);
              continue;
            }
          }

          renderer.finish();

          // Cost tracking
          if (data.usage) {
            costTracker.record(data.usage, ctx.cfg.model);
            const costStr = costTracker.formatInline(data.usage, ctx.cfg.model);
            console.log(`  ${MUTED}${costStr}${C.reset}`);
          }

          ctx.messages.push(msg);
          break;
        } else {
          // ── NON-STREAMING MODE (or tool follow-up rounds) ──
          if (!spinner.timer) spinner.start();
          data = await callApi(ctx.messages, effectiveCfg);
          const msg = data.choices[0].message;

          // Tool calls
          const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg, checkpointMgr);
          if (toolLoop) {
            toolRound++;
            spinner.update(`Processing (round ${toolRound + 1})`);
            continue;
          }

          spinner.stop();

          // Render text response
          renderNonStreaming(msg, data);

          // Cost tracking
          if (data.usage) {
            costTracker.record(data.usage, ctx.cfg.model);
            const costStr = costTracker.formatInline(data.usage, ctx.cfg.model);
            console.log(`  ${MUTED}${costStr}${C.reset}`);
          }

          ctx.messages.push(msg);
          break;
        }
      }

      // Save state
      ctx.saveState();

      // Auto-save session
      sessionMgr.save({
        model: ctx.cfg.model,
        profile: ctx.cfg.profile,
        chat: ctx.currentChat,
        messages: ctx.messages,
      });

    } catch (e) {
      spinner.stop();
      log.err(e.message);
      ctx.messages.pop(); // Remove failed user message
    }
  }

  outro(ACCENT.bold("Goodbye! 👋"));
}

main().catch(e => {
  console.error(`\n  ${ERROR}${C.bold}Fatal Error:${C.reset} ${e.message}\n`);
  process.exit(1);
});
