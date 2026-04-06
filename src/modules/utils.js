// ─── Helpers ────────────────────────────────────────────────────────────────

function applyAliases(input, cfg) {
  for (const [a, b] of Object.entries(cfg.aliases)) {
    if (input === a || input.startsWith(a + " ")) return input.replace(a, b);
  }
  return input;
}

function renderTemplate(cfg, name, params) {
  const tpl = cfg.templates[name]; if (!tpl) return null;
  let text = tpl;
  for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

function parseKv(s) {
  const out = {};
  s.split(/\s+/).forEach(pair => { const i = pair.indexOf(":"); if (i === -1) return; const k = pair.slice(0, i), v = pair.slice(i + 1); if (k && v) out[k] = v; });
  return out;
}

function makeChatName(state) { let i = 1; while (state.chats[`chat-${i}`]) i++; return `chat-${i}`; }

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDuration(ms) {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  if (ms < 3600000) return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
  return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m";
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}


export { applyAliases, renderTemplate, parseKv, makeChatName, formatBytes, formatDuration, timeAgo };
