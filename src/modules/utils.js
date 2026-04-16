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

/**
 * Computes Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/**
 * All known slash commands for fuzzy matching.
 * @type {string[]}
 */
const ALL_COMMANDS = [
  "/help", "/clear", "/reset", "/exit", "/stats", "/config",
  "/model", "/profile", "/assistant", "/temp", "/key", "/url", "/lang", "/git",
  "/chat", "/chat list", "/chat new", "/chat use", "/chat delete",
  "/ap", "/autopilot", "/ap-config", "/ap-limit", "/ap-errors", "/trigger",
  "/img", "/list", "/read", "/shell",
  "/permissions", "/perm", "/context", "/audit", "/incognito",
  "/lead", "/delegate", "/pair", "/ci", "/routing", "/preview",
  "/memory", "/memory stats", "/memory search", "/memory clear",
  "/rewind", "/session", "/session list", "/session load",
  "/compact", "/cost", "/cost total",
  "/init", "/pins", "/pin", "/plugin", "/template", "/vacuum", "/alias",
  "/export", "/import", "/undo", "/saveconfig",
];

/**
 * Suggests closest command for a mistyped slash command.
 * @param {string} input - The mistyped input (e.g. "/halp").
 * @returns {string|null} Closest command, or null if not close enough.
 */
function suggestCommand(input) {
  if (!input.startsWith("/")) return null;
  const word = input.split(" ")[0].toLowerCase();
  if (word.length < 2) return null;

  let best = null, bestDist = Infinity;
  for (const cmd of ALL_COMMANDS) {
    const cmdWord = cmd.split(" ")[0];
    const dist = levenshtein(word, cmdWord);
    if (dist < bestDist) { bestDist = dist; best = cmd; }
  }
  // Only suggest if within edit distance 2 and not already valid
  if (best && bestDist > 0 && bestDist <= 2) return best;
  return null;
}

export {
  applyAliases, renderTemplate, parseKv, makeChatName,
  formatBytes, formatDuration, timeAgo,
  levenshtein, suggestCommand, ALL_COMMANDS
};
