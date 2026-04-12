/**
 * Applies configured command aliases to user input.
 * @param {string} input - Raw user input.
 * @param {Object} cfg - Application configuration.
 * @returns {string} Input with aliases expanded.
 */
function applyAliases(input, cfg) {
  for (const [a, b] of Object.entries(cfg.aliases)) {
    if (input === a || input.startsWith(a + " ")) return input.replace(a, b);
  }
  return input;
}

/**
 * Renders a prompt template with provided parameters.
 * @param {Object} cfg - Application configuration.
 * @param {string} name - Template name.
 * @param {Object} params - Key-value pairs for replacement.
 * @returns {string|null} Rendered text or null if template not found.
 */
function renderTemplate(cfg, name, params) {
  const tpl = cfg.templates[name]; if (!tpl) return null;
  let text = tpl;
  for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

/**
 * Parses key:value pairs from a string.
 * @param {string} s - Input string (e.g., "key:val foo:bar").
 * @returns {Object} Parsed key-value object.
 */
function parseKv(s) {
  const out = {};
  s.split(/\s+/).forEach(pair => { const i = pair.indexOf(":"); if (i === -1) return; const k = pair.slice(0, i), v = pair.slice(i + 1); if (k && v) out[k] = v; });
  return out;
}

/**
 * Generates a unique default chat name.
 * @param {Object} state - Current application state.
 * @returns {string} New chat name.
 */
function makeChatName(state) { let i = 1; while (state.chats[`chat-${i}`]) i++; return `chat-${i}`; }

/**
 * Formats byte size to a human-readable string.
 * @param {number} bytes - Size in bytes.
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Formats duration in milliseconds to a human-readable string.
 * @param {number} ms - Duration in ms.
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  if (ms < 3600000) return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
  return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m";
}

/**
 * Returns a relative time string.
 * @param {number} ts - Timestamp in ms.
 * @returns {string}
 */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}

export {
  applyAliases, renderTemplate, parseKv, makeChatName,
  formatBytes, formatDuration, timeAgo
};
