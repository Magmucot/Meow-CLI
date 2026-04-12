import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";
import { log } from "./ui.js";
import { PLUGIN_DIR } from "./config.js";

const require = createRequire(import.meta.url);
const PLUGIN_EXTS = new Set([".js", ".mjs", ".cjs"]);

const pluginState = {
  plugins: new Map(),
  commands: [],
};

/**
 * Returns the directories where plugins are searched.
 * @returns {Array<string>}
 */
function getPluginDirs() {
  return [PLUGIN_DIR, path.join(process.cwd(), "plugins")];
}

/**
 * Resets the internal plugin state.
 */
function resetPluginState() {
  pluginState.plugins.clear();
  pluginState.commands = [];
}

/**
 * Checks if a plugin is enabled in the configuration.
 * @param {Object} cfg - Configuration object.
 * @param {string} name - Plugin name.
 * @returns {boolean}
 */
function isPluginEnabled(cfg, name) {
  const disabled = cfg?.plugins?.disabled || [];
  return !disabled.includes(name);
}

/**
 * Registers a command from a plugin.
 * @param {string} pluginName - Name of the plugin providing the command.
 * @param {Object} command - Command definition.
 */
function registerCommand(pluginName, command) {
  if (!command || !command.name || typeof command.run !== "function") return;
  const clean = command.name.replace(/^\//, "");
  pluginState.commands.push({
    plugin: pluginName,
    name: clean,
    description: command.description || "",
    usage: command.usage || `/${clean}`,
    run: command.run,
    match: command.match,
  });
}

/**
 * Builds the API object passed to plugins.
 * @param {Object} ctx - CLI context.
 * @param {string} pluginName - Plugin name.
 * @returns {Object} Plugin API.
 */
function buildPluginApi(ctx, pluginName) {
  return {
    registerCommand: (cmd) => registerCommand(pluginName, cmd),
    log,
    ctx,
    cfg: ctx.cfg,
  };
}

/**
 * Loads a single plugin file.
 * @param {string} file - Full path to the plugin file.
 * @param {Object} ctx - CLI context.
 * @returns {Promise<Object>} Object containing the plugin instance and its API.
 */
async function loadPluginFile(file, ctx) {
  const ext = path.extname(file).toLowerCase();
  let mod;
  if (ext === ".cjs") {
    mod = require(file);
  } else {
    const url = pathToFileURL(file).href + `?v=${Date.now()}`;
    mod = await import(url);
  }
  const raw = mod?.default ?? mod?.plugin ?? mod;
  const api = buildPluginApi(ctx, path.basename(file, ext));
  if (typeof raw === "function") {
    const returned = await raw(api);
    return { plugin: returned || {}, api };
  }
  return { plugin: raw || {}, api };
}

/**
 * Loads all plugins from the plugin directories.
 * @param {Object} cfg - Configuration object.
 * @param {Object} ctx - CLI context.
 * @returns {Promise<Object>} The updated plugin state.
 */
async function loadPlugins(cfg, ctx) {
  resetPluginState();
  const dirs = getPluginDirs();
  for (const dir of dirs) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const file of files) {
      const full = path.join(dir, file);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (!stat.isFile()) continue;
      if (!PLUGIN_EXTS.has(path.extname(full).toLowerCase())) continue;
      const base = path.basename(file, path.extname(file));
      let name = base;
      try {
        const { plugin, api } = await loadPluginFile(full, ctx);
        name = plugin?.name || base;
        if (pluginState.plugins.has(name)) {
          log.warn(`Plugin '${name}' already loaded. Skipping ${file}.`);
          continue;
        }
        const enabled = isPluginEnabled(cfg, name);
        const info = {
          name,
          version: plugin?.version || "0.0.0",
          description: plugin?.description || "",
          file: full,
          enabled,
        };
        pluginState.plugins.set(name, info);
        if (!enabled) continue;
        if (Array.isArray(plugin?.commands)) {
          for (const cmd of plugin.commands) registerCommand(name, cmd);
        }
        if (typeof plugin?.onLoad === "function") {
          await plugin.onLoad(api);
        }
      } catch (e) {
        const info = { name, version: "0.0.0", description: "", file: full, enabled: false, error: e.message };
        pluginState.plugins.set(name, info);
        log.err(`Plugin load failed (${file}): ${e.message}`);
      }
    }
  }
  return pluginState;
}

/**
 * Lists all registered plugins.
 * @returns {Array<Object>}
 */
function listPlugins() {
  return Array.from(pluginState.plugins.values());
}

/**
 * Lists all commands registered by plugins.
 * @returns {Array<Object>}
 */
function listPluginCommands() {
  return pluginState.commands.slice();
}

/**
 * Attempts to execute a plugin command based on user input.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input string.
 * @returns {Promise<Object|null>} Command result or null if no command matched.
 */
async function runPluginCommand(ctx, input) {
  for (const cmd of pluginState.commands) {
    if (typeof cmd.match === "function") {
      const matchResult = await cmd.match(input, ctx);
      if (!matchResult) continue;
      const result = await cmd.run(ctx, input, matchResult);
      return normalizeResult(result);
    }
    const prefix = `/${cmd.name}`;
    if (input === prefix || input.startsWith(prefix + " ")) {
      const args = input.slice(prefix.length).trim();
      const result = await cmd.run(ctx, input, args);
      return normalizeResult(result);
    }
  }
  return null;
}

/**
 * Normalizes the result of a plugin command execution.
 * @param {any} result - Raw result from command.run.
 * @returns {Object} Normalized result object.
 * @private
 */
function normalizeResult(result) {
  if (!result) return { handled: true };
  if (typeof result === "string") return { handled: true, continue: true, input: result };
  if (typeof result === "object") {
    return { handled: result.handled ?? true, continue: !!result.continue, input: result.input };
  }
  return { handled: true };
}

/**
 * Enables a plugin in the configuration.
 * @param {Object} cfg - Configuration object.
 * @param {string} name - Plugin name.
 */
function enablePlugin(cfg, name) {
  const disabled = new Set(cfg.plugins?.disabled || []);
  disabled.delete(name);
  cfg.plugins = { ...(cfg.plugins || {}), disabled: Array.from(disabled) };
}

/**
 * Disables a plugin in the configuration.
 * @param {Object} cfg - Configuration object.
 * @param {string} name - Plugin name.
 */
function disablePlugin(cfg, name) {
  const disabled = new Set(cfg.plugins?.disabled || []);
  disabled.add(name);
  cfg.plugins = { ...(cfg.plugins || {}), disabled: Array.from(disabled) };
}

export {
  loadPlugins,
  listPlugins,
  listPluginCommands,
  runPluginCommand,
  getPluginDirs,
  enablePlugin,
  disablePlugin,
};
