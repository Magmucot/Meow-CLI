import fs from "fs";
import path from "path";
import { log } from "./ui.js";
import { ASSIST_DIR, CONF_FILE, HIST_FILE, PIN_FILE, UNDO_FILE, LOG_DIR, LEGACY_CONF_FILE, LEGACY_HIST_FILE, LEGACY_LOG_DIR, DATA_DIR, DEFAULT_CONFIG, PLUGIN_DIR } from "./config.js";

// ─── Persistence ────────────────────────────────────────────────────────────

function loadJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback; }
  catch { return fallback; }
}

function saveJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }
  catch (e) { log.err(`Save error: ${e.message}`); }
}

function normalizeAssistantProfile(name, data) {
  if (!name || !data) return null;
  let system = "";
  let temperature = DEFAULT_CONFIG.profiles.default.temperature;
  if (typeof data === "string") {
    system = data;
  } else if (typeof data === "object") {
    system = data.system || data.prompt || "";
    if (typeof data.temperature === "number" && !Number.isNaN(data.temperature)) {
      temperature = data.temperature;
    }
  }
  if (!system) return null;
  return { name, profile: { system, temperature } };
}

function loadAssistentsFromDir() {
  const profiles = {};
  try { fs.mkdirSync(ASSIST_DIR, { recursive: true }); } catch {}
  if (!fs.existsSync(ASSIST_DIR)) return profiles;
  let files = [];
  try { files = fs.readdirSync(ASSIST_DIR); } catch { return profiles; }
  for (const file of files) {
    const full = path.join(ASSIST_DIR, file);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    try {
      if (ext === ".json") {
        const data = JSON.parse(fs.readFileSync(full, "utf8"));
        const name = data.name || base;
        const normalized = normalizeAssistantProfile(name, data);
        if (normalized) profiles[normalized.name] = normalized.profile;
      } else if (ext === ".txt" || ext === ".md") {
        const system = fs.readFileSync(full, "utf8").trim();
        const normalized = normalizeAssistantProfile(base, system);
        if (normalized) profiles[normalized.name] = normalized.profile;
      }
    } catch {
      continue;
    }
  }
  return profiles;
}

function saveAssistantProfile(name, system, temperature) {
  if (!name || !system) throw new Error("Name and system required");
  fs.mkdirSync(ASSIST_DIR, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const file = path.join(ASSIST_DIR, `${safeName}.json`);
  const data = { name, system, temperature };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

function loadConfig() {
  const cfg = loadJson(CONF_FILE, DEFAULT_CONFIG);
  const assistentProfiles = loadAssistentsFromDir();
  return {
    ...DEFAULT_CONFIG, ...cfg,
    autopilot: { ...DEFAULT_CONFIG.autopilot, ...(cfg.autopilot || {}) },
    plugins: { ...DEFAULT_CONFIG.plugins, ...(cfg.plugins || {}) },
    vacuum: { ...DEFAULT_CONFIG.vacuum, ...(cfg.vacuum || {}) },
    profiles:  { ...DEFAULT_CONFIG.profiles,  ...(cfg.profiles  || {}), ...assistentProfiles },
    templates: { ...DEFAULT_CONFIG.templates, ...(cfg.templates || {}) },
    aliases:   { ...DEFAULT_CONFIG.aliases,   ...(cfg.aliases   || {}) }
  };
}

function saveConfig(cfg) {
  const assistentProfiles = loadAssistentsFromDir();
  const cleanedProfiles = { ...cfg.profiles };
  for (const name of Object.keys(assistentProfiles)) {
    delete cleanedProfiles[name];
  }
  saveJson(CONF_FILE, { ...cfg, profiles: cleanedProfiles });
}

function loadHistoryState() {
  const fallback = { current: "default", chats: { default: [] } };
  const data = loadJson(HIST_FILE, fallback);
  if (Array.isArray(data)) return { current: "default", chats: { default: data } };
  if (data && typeof data === "object") {
    const chats = data.chats && typeof data.chats === "object" ? data.chats : {};
    const current = data.current || "default";
    if (!chats[current]) chats[current] = [];
    return { current, chats };
  }
  return fallback;
}

function loadPins() {
  return loadJson(PIN_FILE, []);
}

function savePins(pins) {
  saveJson(PIN_FILE, pins || []);
}

function applyVacuum(history, cfg) {
  const vac = cfg.vacuum || {};
  if (!vac.enabled) return history;
  const keepLast = Math.max(0, parseInt(vac.keep_last ?? 1));
  const dropCount = Math.max(0, parseInt(vac.drop_count ?? 4));
  if (dropCount <= 0) return history;
  if (history.length <= keepLast + dropCount) return history;
  const keepTail = keepLast > 0 ? history.slice(-keepLast) : [];
  const head = history.slice(0, Math.max(0, history.length - keepLast - dropCount));
  return [...head, ...keepTail];
}

function saveHistoryState(state) { saveJson(HIST_FILE, state); }

function loadUndoState() {
  return loadJson(UNDO_FILE, []);
}

function saveUndoState(state) {
  saveJson(UNDO_FILE, state);
}

function migrateLegacyData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(PLUGIN_DIR, { recursive: true });

    if (!fs.existsSync(CONF_FILE) && fs.existsSync(LEGACY_CONF_FILE)) {
      fs.renameSync(LEGACY_CONF_FILE, CONF_FILE);
    }

    if (!fs.existsSync(HIST_FILE) && fs.existsSync(LEGACY_HIST_FILE)) {
      fs.renameSync(LEGACY_HIST_FILE, HIST_FILE);
    }

    if (fs.existsSync(LEGACY_LOG_DIR) && fs.statSync(LEGACY_LOG_DIR).isDirectory()) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const entries = fs.readdirSync(LEGACY_LOG_DIR);
      for (const entry of entries) {
        const from = path.join(LEGACY_LOG_DIR, entry);
        const to = path.join(LOG_DIR, entry);
        if (!fs.existsSync(to)) {
          fs.renameSync(from, to);
        }
      }
      if (fs.readdirSync(LEGACY_LOG_DIR).length === 0) {
        fs.rmdirSync(LEGACY_LOG_DIR);
      }
    }
  } catch (e) {
    log.dim(`Legacy data migration skipped: ${e.message}`);
  }
}


export { loadJson, saveJson, normalizeAssistantProfile, loadAssistentsFromDir, saveAssistantProfile, loadConfig, saveConfig, loadHistoryState, loadPins, savePins, applyVacuum, saveHistoryState, loadUndoState, saveUndoState, migrateLegacyData };
