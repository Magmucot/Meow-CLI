// ═══════════════════════════════════════════════════════════════════════════
// project-context.js — Meow CLI Project Context (MEOW.md)
// Reads project context files and injects into system prompt
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { GLOBAL_MEOW_MD } from "./config.js";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, box, COLS } from "./ui.js";

const LOCAL_MEOW_MD = "MEOW.md";
const INCLUDE_RE = /^!include\s+(.+)$/gm;
const MAX_CONTEXT_SIZE = 50000; // 50KB max
const MAX_INCLUDE_DEPTH = 3;

// ─── Load Context ───────────────────────────────────────────────────────────

function resolveIncludes(content, basePath, depth = 0) {
  if (depth >= MAX_INCLUDE_DEPTH) return content;

  return content.replace(INCLUDE_RE, (match, includePath) => {
    const resolved = path.resolve(basePath, includePath.trim());
    try {
      if (!fs.existsSync(resolved)) {
        return `<!-- Include not found: ${includePath.trim()} -->`;
      }
      const included = fs.readFileSync(resolved, "utf8");
      return resolveIncludes(included, path.dirname(resolved), depth + 1);
    } catch (e) {
      return `<!-- Include error: ${e.message} -->`;
    }
  });
}

function loadContextFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    let content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) return null;

    // Resolve !include directives
    content = resolveIncludes(content, path.dirname(filePath));

    // Truncate if too large
    if (content.length > MAX_CONTEXT_SIZE) {
      content = content.slice(0, MAX_CONTEXT_SIZE) + "\n\n... [TRUNCATED]";
    }

    return content;
  } catch {
    return null;
  }
}

function loadProjectContext() {
  const parts = [];

  // 1. Global context (~/.meowcli/MEOW.md)
  const globalCtx = loadContextFile(GLOBAL_MEOW_MD);
  if (globalCtx) {
    parts.push({
      source: "global",
      path: GLOBAL_MEOW_MD,
      content: globalCtx,
    });
  }

  // 2. Local context (./MEOW.md in CWD)
  const localPath = path.resolve(process.cwd(), LOCAL_MEOW_MD);
  const localCtx = loadContextFile(localPath);
  if (localCtx) {
    parts.push({
      source: "project",
      path: localPath,
      content: localCtx,
    });
  }

  return parts;
}

// ─── Build System Prompt ────────────────────────────────────────────────────

function buildSystemPrompt(basePrompt, contextParts = null) {
  const parts = contextParts ?? loadProjectContext();
  if (parts.length === 0) return basePrompt;

  const contextBlock = parts.map(p => {
    const label = p.source === "global" ? "Global Rules" : "Project Context";
    return `\n\n═══ ${label} (${p.source}: ${path.basename(p.path)}) ═══\n${p.content}`;
  }).join("");

  return basePrompt + contextBlock;
}

// ─── Display Context ────────────────────────────────────────────────────────

function printContext() {
  const parts = loadProjectContext();

  console.log("");
  console.log(`  ${ACCENT}${C.bold}◆ Project Context${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

  if (parts.length === 0) {
    console.log(`  ${MUTED}No MEOW.md found${C.reset}`);
    console.log(`  ${TEXT_DIM}Create ${path.resolve(LOCAL_MEOW_MD)} or ${GLOBAL_MEOW_MD}${C.reset}`);
  } else {
    for (const part of parts) {
      const size = part.content.length;
      const lines = part.content.split("\n").length;
      const tokens = Math.ceil(size / 3.5);
      console.log(`  ${TEXT}${part.source}${C.reset} ${MUTED}${part.path}${C.reset}`);
      console.log(`  ${TEXT_DIM}${lines} lines, ~${tokens} tokens${C.reset}`);

      // Show first 5 lines preview
      const preview = part.content.split("\n").slice(0, 5);
      for (const line of preview) {
        console.log(`  ${MUTED}┃${C.reset} ${TEXT_DIM}${line.slice(0, COLS - 8)}${C.reset}`);
      }
      if (part.content.split("\n").length > 5) {
        console.log(`  ${MUTED}┃${C.reset} ${MUTED}… +${lines - 5} more lines${C.reset}`);
      }
      console.log("");
    }
  }

  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
  console.log(`  ${MUTED}CWD:${C.reset} ${TEXT_DIM}${process.cwd()}${C.reset}`);
  console.log("");
}

// ─── Edit Context ───────────────────────────────────────────────────────────

function editContext(editor = null) {
  const localPath = path.resolve(process.cwd(), LOCAL_MEOW_MD);
  const editorCmd = editor || process.env.EDITOR || process.env.VISUAL || "nano";

  if (!fs.existsSync(localPath)) {
    // Create template
    const template = `# Project Context for Meow CLI

## Project Description
<!-- Describe your project here -->

## Architecture
<!-- Key architecture decisions -->

## Coding Standards
<!-- Your coding conventions -->

## Important Files
<!-- Key files the AI should know about -->

## Rules
<!-- Specific rules for the AI to follow -->
`;
    fs.writeFileSync(localPath, template, "utf8");
    log.ok(`Created ${localPath}`);
  }

  return { editor: editorCmd, path: localPath };
}


export {
  loadProjectContext,
  buildSystemPrompt,
  printContext,
  editContext,
  loadContextFile,
  LOCAL_MEOW_MD,
};
