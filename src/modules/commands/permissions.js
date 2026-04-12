import {
  ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, ERROR, WARNING, C, log,
  getPermissionStore, LEVEL,
} from "../../core.js";

/**
 * Handles the /permissions and /perm commands for managing tool execution rules.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handlePermissions = async (ctx, input) => {
  if (!input.startsWith("/permissions") && !input.startsWith("/perm")) return null;

  const parts = input.split(/\s+/);
  const cmd = parts[1] || "list";
  const store = getPermissionStore();

  if (cmd === "list") {
    const rules = store.listRules();
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Permission Rules${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

    if (rules.length === 0) {
      console.log(`  ${MUTED}No custom rules (using defaults)${C.reset}`);
      console.log(`  ${TEXT_DIM}Safe tools (auto-allow): list_dir, read_file, grep_search${C.reset}`);
      console.log(`  ${TEXT_DIM}Dangerous tools (ask): run_shell, write_file, patch_file${C.reset}`);
    } else {
      for (const rule of rules) {
        const icon = rule.level === LEVEL.ALLOW ? `${SUCCESS}✓${C.reset}` :
                     rule.level === LEVEL.DENY  ? `${ERROR}✗${C.reset}` :
                     `${WARNING}?${C.reset}`;
        const pathStr = rule.path ? ` ${MUTED}path:${C.reset}${TEXT_DIM}${rule.path}${C.reset}` : "";
        console.log(`  ${icon} ${TEXT}${rule.tool}${C.reset}  ${MUTED}→${C.reset} ${TEXT_DIM}${rule.level}${C.reset}${pathStr}`);
      }
    }

    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}\n`);
    return { handled: true };
  }

  if (cmd === "allow") {
    const tool = parts[2];
    const pathPattern = parts[3] || null;
    if (!tool) { log.err("Usage: /permissions allow <tool> [path_pattern]"); return { handled: true }; }
    store.addRule(tool, LEVEL.ALLOW, pathPattern);
    log.ok(`Rule added: ${SUCCESS}allow${C.reset} ${tool}${pathPattern ? ` (${pathPattern})` : ""}`);
    return { handled: true };
  }

  if (cmd === "deny") {
    const tool = parts[2];
    const pathPattern = parts[3] || null;
    if (!tool) { log.err("Usage: /permissions deny <tool> [path_pattern]"); return { handled: true }; }
    store.addRule(tool, LEVEL.DENY, pathPattern);
    log.ok(`Rule added: ${ERROR}deny${C.reset} ${tool}${pathPattern ? ` (${pathPattern})` : ""}`);
    return { handled: true };
  }

  if (cmd === "ask") {
    const tool = parts[2];
    if (!tool) { log.err("Usage: /permissions ask <tool>"); return { handled: true }; }
    store.removeRule(tool);
    log.ok(`Rule removed for ${tool} (will ask)`);
    return { handled: true };
  }

  if (cmd === "reset") {
    store.resetAll();
    log.ok("All permission rules reset to defaults");
    return { handled: true };
  }

  log.err("Usage: /permissions <list|allow|deny|ask|reset> [tool] [path]");
  return { handled: true };
};

export { handlePermissions };
