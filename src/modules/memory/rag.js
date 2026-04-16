/**
 * RAG Memory module for Meow CLI.
 * Provides long-term memory, cross-project learning, and adaptive preferences using TF-IDF similarity.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { log, C, ACCENT, MUTED, TEXT_DIM, SUCCESS } from "../ui.js";
import { DATA_DIR } from "../config.js";

const MEMORY_DIR = path.join(DATA_DIR, "memory");
const GLOBAL_MEMORY = path.join(MEMORY_DIR, "global.json");
const MAX_MEMORIES = 1000;
const MAX_SEARCH_RESULTS = 10;
const SIMILARITY_THRESHOLD = 0.15;

const STOP_WORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for", "on", "with",
  "at", "by", "from", "as", "into", "through", "during", "before", "after",
  "and", "but", "or", "nor", "not", "so", "yet", "both", "either", "neither",
  "this", "that", "these", "those", "it", "its", "i", "me", "my", "we", "our",
  "you", "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "что", "как", "это", "для", "при", "все", "уже", "если", "или", "но", "не",
  "из", "на", "за", "по", "от", "до", "об", "так", "тоже", "ещё", "еще"]);

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\sа-яё]/gi, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function termFrequency(tokens) {
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  const max = Math.max(...Object.values(freq), 1);
  for (const t in freq) freq[t] /= max;
  return freq;
}

function cosineSimilarity(tfA, tfB) {
  const terms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
  let dot = 0, magA = 0, magB = 0;
  for (const t of terms) {
    const a = tfA[t] || 0;
    const b = tfB[t] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

const MemoryType = {
  DECISION: "decision",
  ERROR_FIX: "error_fix",
  PREFERENCE: "preference",
  PATTERN: "pattern",
  CODE_STYLE: "code_style",
  ARCHITECTURE: "architecture",
  REJECTION: "rejection",
};

function createMemory(type, content, metadata = {}) {
  const tokens = tokenize(content);
  return {
    id: crypto.randomUUID().slice(0, 12),
    type,
    content: content.slice(0, 2000),
    metadata: { ...metadata, project: metadata.project || getProjectId() },
    tf: termFrequency(tokens),
    keywords: [...new Set(tokens)].slice(0, 30),
    created: Date.now(),
    accessed: Date.now(),
    accessCount: 0,
    score: 1.0,
  };
}

function getProjectId() {
  const cwd = process.cwd();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    return pkg.name || path.basename(cwd);
  } catch {
    return path.basename(cwd);
  }
}

class MemoryStore {
  constructor() {
    this.memories = [];
    this.projectIndex = {};
    this._loaded = false;
    this._cache = new Map();
  }

  _clearCache() {
    this._cache.clear();
  }

  _ensureDir() {
    try { fs.mkdirSync(MEMORY_DIR, { recursive: true }); } catch {}
  }

  load() {
    if (this._loaded) return;
    this._ensureDir();
    this._clearCache();
    try {
      if (fs.existsSync(GLOBAL_MEMORY)) {
        const data = JSON.parse(fs.readFileSync(GLOBAL_MEMORY, "utf8"));
        this.memories = Array.isArray(data.memories) ? data.memories : [];
        this.projectIndex = data.projectIndex || {};
      }
    } catch { this.memories = []; this.projectIndex = {}; }
    this._loaded = true;
  }

  save() {
    this._ensureDir();
    this._clearCache();
    try {
      fs.writeFileSync(GLOBAL_MEMORY, JSON.stringify({
        memories: this.memories,
        projectIndex: this.projectIndex,
        version: 1,
        lastSaved: Date.now(),
      }, null, 2));
    } catch (e) { log.dim(`Memory save failed: ${e.message}`); }
  }

  add(type, content, metadata = {}) {
    this.load();
    const entry = createMemory(type, content, metadata);
    this.memories.push(entry);

    const project = entry.metadata.project;
    if (!this.projectIndex[project]) this.projectIndex[project] = [];
    this.projectIndex[project].push(entry.id);

    while (this.memories.length > MAX_MEMORIES) {
      const oldest = this.memories.reduce((min, m, i) =>
        m.score * m.accessCount < (min.val) ? { idx: i, val: m.score * m.accessCount } : min,
        { idx: 0, val: Infinity }
      );
      const removed = this.memories.splice(oldest.idx, 1)[0];
      for (const p in this.projectIndex) {
        this.projectIndex[p] = this.projectIndex[p].filter(id => id !== removed.id);
      }
    }

    this.save();
    return entry;
  }

  search(query, options = {}) {
    this.load();
    const { maxResults = MAX_SEARCH_RESULTS, project = null,
      type = null, crossProject = false, minScore = SIMILARITY_THRESHOLD } = options;

    const queryTokens = tokenize(query);
    const queryTf = termFrequency(queryTokens);

    let candidates = this.memories;

    if (type) candidates = candidates.filter(m => m.type === type);

    if (project && !crossProject) {
      candidates = candidates.filter(m => m.metadata.project === project);
    }

    const scored = candidates.map(m => ({
      memory: m,
      similarity: cosineSimilarity(queryTf, m.tf || {}),
    })).filter(s => s.similarity >= minScore);

    scored.sort((a, b) => {
      const scoreA = a.similarity * (1 + Math.log1p(a.memory.accessCount) * 0.1);
      const scoreB = b.similarity * (1 + Math.log1p(b.memory.accessCount) * 0.1);
      return scoreB - scoreA;
    });

    const results = scored.slice(0, maxResults);
    for (const r of results) {
      r.memory.accessed = Date.now();
      r.memory.accessCount++;
    }
    if (results.length > 0) this.save();

    return results;
  }

  recordDecision(decision, reasoning, context = {}) {
    return this.add(MemoryType.DECISION, `Decision: ${decision}\nReasoning: ${reasoning}`, context);
  }

  recordErrorFix(error, fix, file = "") {
    return this.add(MemoryType.ERROR_FIX, `Error: ${error}\nFix: ${fix}\nFile: ${file}`, { file });
  }

  recordPreference(key, value, source = "implicit") {
    const existing = this.memories.find(m =>
      m.type === MemoryType.PREFERENCE && m.content.startsWith(`Preference: ${key}=`)
    );
    if (existing) {
      existing.content = `Preference: ${key}=${value} (source: ${source})`;
      existing.accessed = Date.now();
      existing.score = Math.min(existing.score + 0.2, 3.0);
      this.save();
      return existing;
    }
    return this.add(MemoryType.PREFERENCE, `Preference: ${key}=${value} (source: ${source})`);
  }

  recordRejection(suggestion, reason = "") {
    return this.add(MemoryType.REJECTION,
      `Rejected: ${suggestion}${reason ? `\nReason: ${reason}` : ""}`,
      { decayRate: 0.5 }
    );
  }

  recordPattern(pattern, example = "") {
    return this.add(MemoryType.PATTERN, `Pattern: ${pattern}${example ? `\nExample: ${example}` : ""}`);
  }

  getProjectMemories(project = null) {
    this.load();
    const p = project || getProjectId();
    return this.memories.filter(m => m.metadata.project === p);
  }

  getPreferences(project = null) {
    const mems = this.getProjectMemories(project);
    const prefs = {};
    for (const m of mems.filter(m => m.type === MemoryType.PREFERENCE)) {
      const match = m.content.match(/Preference: (.+?)=(.+?)(?:\s*\(|$)/);
      if (match) prefs[match[1]] = match[2].trim();
    }
    return prefs;
  }

  buildContextForPrompt(query, maxTokens = 1500) {
    const results = this.search(query, {
      project: getProjectId(),
      crossProject: false,
      maxResults: 8,
    });

    if (results.length === 0) return "";

    const parts = ["═══ Project Memory (RAG) ═══"];
    let chars = 0;
    const maxChars = maxTokens * 3.5;

    for (const r of results) {
      const entry = `[${r.memory.type}] ${r.memory.content} (relevance: ${(r.similarity * 100).toFixed(0)}%)`;
      if (chars + entry.length > maxChars) break;
      parts.push(entry);
      chars += entry.length;
    }

    const prefs = this.getPreferences();
    if (Object.keys(prefs).length > 0) {
      const prefStr = Object.entries(prefs).map(([k, v]) => `${k}: ${v}`).join(", ");
      parts.push(`\nUser preferences: ${prefStr}`);
    }

    return parts.join("\n");
  }

  getStats() {
    this.load();
    const byType = {};
    for (const m of this.memories) byType[m.type] = (byType[m.type] || 0) + 1;
    const projects = [...new Set(this.memories.map(m => m.metadata.project))];
    return {
      total: this.memories.length,
      byType,
      projects: projects.length,
      projectNames: projects.slice(0, 10),
    };
  }

  clear(project = null) {
    this.load();
    if (project) {
      this.memories = this.memories.filter(m => m.metadata.project !== project);
      delete this.projectIndex[project];
    } else {
      this.memories = [];
      this.projectIndex = {};
    }
    this.save();
  }

  printStats() {
    const stats = this.getStats();
    console.log(`\n  ${ACCENT}${C.bold}◆ Memory Stats${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    console.log(`  ${TEXT_DIM}Total memories:${C.reset} ${stats.total}`);
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`  ${TEXT_DIM}  ${type}:${C.reset} ${count}`);
    }
    console.log(`  ${TEXT_DIM}Projects:${C.reset} ${stats.projects} (${stats.projectNames.join(", ")})`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}\n`);
  }
}

class MemoryHooks {
  constructor(store) {
    this.store = store;
  }

  afterToolCall(toolName, args, result) {
    if (toolName === "write_file" && args.path && !result.includes("❌")) {
      const ext = path.extname(args.path);
      if (ext) this.store.recordPreference(`file_ext_${ext}`, "used");
    }
    if (toolName === "run_shell" && args.cmd) {
      const cmd = args.cmd.split(" ")[0];
      this.store.recordPreference(`shell_cmd_${cmd}`, "used");
    }
    if (toolName === "patch_file" && result.includes("❌")) {
      this.store.recordErrorFix(result.slice(0, 200), "patch failed", args.path);
    }
  }

  afterRejection(suggestion) {
    this.store.recordRejection(suggestion);
  }

  afterConversation(messages) {
    const assistantMsgs = messages.filter(m => m.role === "assistant" && typeof m.content === "string");
    for (const msg of assistantMsgs.slice(-3)) {
      const content = msg.content || "";
      if (content.includes("Architecture") || content.includes("архитектур")) {
        this.store.recordPattern(content.slice(0, 500));
      }
    }
  }

  inferCodeStyle(content, filePath) {
    if (!content || !filePath) return;
    const ext = path.extname(filePath);
    if (ext === ".js" || ext === ".ts") {
      if (content.includes("'use strict'")) this.store.recordPreference("strict_mode", "true");
      if (/;\s*$/.test(content.split("\n")[0] || "")) this.store.recordPreference("semicolons", "true");
      else this.store.recordPreference("semicolons", "false");
      if (content.includes("  ")) this.store.recordPreference("indent", "2spaces");
      else if (content.includes("\t")) this.store.recordPreference("indent", "tabs");
      if (content.includes("import ")) this.store.recordPreference("modules", "esm");
      else if (content.includes("require(")) this.store.recordPreference("modules", "cjs");
    }
  }
}

let _store = null;
let _hooks = null;

function getMemoryStore() {
  if (!_store) _store = new MemoryStore();
  return _store;
}

function getMemoryHooks() {
  if (!_hooks) _hooks = new MemoryHooks(getMemoryStore());
  return _hooks;
}

export {
  MemoryStore, MemoryHooks, MemoryType,
  getMemoryStore, getMemoryHooks, getProjectId,
  tokenize, cosineSimilarity,
};
