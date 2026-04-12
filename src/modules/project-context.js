import fs from "fs";
import path from "path";
import { GLOBAL_MEOW_MD } from "./config.js";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, box, COLS } from "./ui.js";

/** @type {string} Default filename for local project context */
const LOCAL_MEOW_MD = "MEOW.md";
/** @type {RegExp} Pattern for !include directives in context files */
const INCLUDE_RE = /^!include\s+(.+)$/gm;
/** @type {number} Maximum size of a context file in characters */
const MAX_CONTEXT_SIZE = 50000;
/** @type {number} Maximum recursion depth for !include */
const MAX_INCLUDE_DEPTH = 3;

/**
 * Recursively resolves !include directives in context files.
 * @param {string} content - Raw file content.
 * @param {string} basePath - Directory of the current file.
 * @param {number} [depth=0] - Current recursion depth.
 * @returns {string} Content with inclusions resolved.
 */
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

/**
 * Loads and processes a context file.
 * @param {string} filePath - Path to the file.
 * @returns {string|null} Processed content or null.
 */
function loadContextFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    let content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) return null;

    content = resolveIncludes(content, path.dirname(filePath));

    if (content.length > MAX_CONTEXT_SIZE) {
      content = content.slice(0, MAX_CONTEXT_SIZE) + "\n\n... [TRUNCATED]";
    }

    return content;
  } catch {
    return null;
  }
}

/**
 * Loads all relevant project context (global and local).
 * @returns {Array<Object>} List of context parts with source, path, and content.
 */
function loadProjectContext() {
  const parts = [];

  const globalCtx = loadContextFile(GLOBAL_MEOW_MD);
  if (globalCtx) {
    parts.push({
      source: "global",
      path: GLOBAL_MEOW_MD,
      content: globalCtx,
    });
  }

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

/**
 * Builds a complete system prompt by appending project context.
 * @param {string} basePrompt - Initial system prompt.
 * @param {Array<Object>|null} [contextParts=null] - Pre-loaded context parts.
 * @returns {string} Final system prompt.
 */
function buildSystemPrompt(basePrompt, contextParts = null) {
  const parts = contextParts ?? loadProjectContext();
  if (parts.length === 0) return basePrompt;

  const contextBlock = parts.map(p => {
    const label = p.source === "global" ? "Global Rules" : "Project Context";
    return `\n\n═══ ${label} (${p.source}: ${path.basename(p.path)}) ═══\n${p.content}`;
  }).join("");

  return basePrompt + contextBlock;
}

/**
 * Prints the current project context to the terminal.
 */
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

/**
 * Prepares the local context file for editing.
 * @param {string|null} [editor=null] - Command to open the editor.
 * @returns {Object} Object containing the editor command and file path.
 */
function editContext(editor = null) {
  const localPath = path.resolve(process.cwd(), LOCAL_MEOW_MD);
  const editorCmd = editor || process.env.EDITOR || process.env.VISUAL || "nano";

  if (!fs.existsSync(localPath)) {
    const template = `# Project Context for Meow CLI\n\n## Project Description\n<!-- Describe your project here -->\n\n## Architecture\n<!-- Key architecture decisions -->\n\n## Coding Standards\n<!-- Your coding conventions -->\n\n## Important Files\n<!-- Key files the AI should know about -->\n\n## Rules\n<!-- Specific rules for the AI to follow -->\n`;
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
