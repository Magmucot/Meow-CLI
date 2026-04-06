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

function getPluginDirs() {
  return [PLUGIN_DIR, path.join(process.cwd(), "plugins")];
}

function resetPluginState() {
  pluginState.plugins.clear();
  pluginState.commands = [];
}

function isPluginEnabled(cfg, name) {
  const disabled = cfg?.plugins?.disabled || [];
  return !disabled.includes(name);
}

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

function buildPluginApi(ctx, pluginName) {
  return {
    registerCommand: (cmd) => registerCommand(pluginName, cmd),
    log,
    ctx,
    cfg: ctx.cfg,
  };
}

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

function listPlugins() {
  return Array.from(pluginState.plugins.values());
}

function listPluginCommands() {
  return pluginState.commands.slice();
}

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

function normalizeResult(result) {
  if (!result) return { handled: true };
  if (typeof result === "string") return { handled: true, continue: true, input: result };
  if (typeof result === "object") {
    return { handled: result.handled ?? true, continue: !!result.continue, input: result.input };
  }
  return { handled: true };
}

function enablePlugin(cfg, name) {
  const disabled = new Set(cfg.plugins?.disabled || []);
  disabled.delete(name);
  cfg.plugins = { ...(cfg.plugins || {}), disabled: Array.from(disabled) };
}

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
