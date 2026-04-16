import path from "path";
import os from "os";

/** @type {string} Base directory for Meow CLI data */
const DATA_DIR = path.join(os.homedir(), ".meowcli", "data");
/** @type {string} Path to chat history file */
const HIST_FILE = path.join(DATA_DIR, "history.json");
/** @type {string} Path to configuration file */
const CONF_FILE = path.join(DATA_DIR, "config.json");
/** @type {string} Directory for autopilot logs */
const LOG_DIR = path.join(DATA_DIR, "logs");
/** @type {string} Path to undo/checkpoint state */
const UNDO_FILE = path.join(DATA_DIR, "undo.json");
/** @type {string} Directory for custom assistant profiles */
const ASSIST_DIR = path.join(DATA_DIR, "assistants");
/** @type {string} Path to pinned messages */
const PIN_FILE = path.join(DATA_DIR, "pins.json");
/** @type {string} Directory for user plugins */
const PLUGIN_DIR = path.join(DATA_DIR, "plugins");
/** @type {string} Path to tool permissions storage */
const PERM_FILE = path.join(DATA_DIR, "permissions.json");
/** @type {string} Directory for saved sessions */
const SESSION_DIR = path.join(DATA_DIR, "sessions");
/** @type {string} Directory for file-system checkpoints */
const CHECKPOINT_DIR = path.join(DATA_DIR, "checkpoints");
/** @type {string} Path to cost/usage tracking data */
const COST_FILE = path.join(DATA_DIR, "cost.json");
/** @type {string} Path to global project context file */
const GLOBAL_MEOW_MD = path.join(os.homedir(), ".meowcli", "MEOW.md");

/** @type {string} Legacy history path (pre-v2) */
const LEGACY_HIST_FILE = path.join(os.homedir(), ".meowcli_history.json");
/** @type {string} Legacy config path (pre-v2) */
const LEGACY_CONF_FILE = path.join(os.homedir(), ".meowcli.json");
/** @type {string} Legacy log directory (pre-v2) */
const LEGACY_LOG_DIR = path.join(os.homedir(), ".meowcli_logs");

/**
 * Default application configuration.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  api_base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  api_key: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4-turbo",
  auto_yes: process.env.AI_AUTO_YES === "1",
  quiet: false,
  profile: "default",
  lang: process.env.AI_LANG || "ru",
  git: {
    autocommit: true,
    prefix: "",
    ai_message: true,
    ai_max_diff_chars: 6000
  },
  autopilot: {
    max_iterations: 50,
    max_errors: 5,
    retry_delay_ms: 2000,
    save_log: true,
    trigger_cmd: "",
  },
  plugins: {
    disabled: [],
  },
  vacuum: {
    enabled: true,
    keep_last: 1,
    drop_count: 4
  },
  profiles: {
    default: {
      temperature: 0.2,
      system: "Ты — опытный инженер-программист. Твои ответы кратки, точны и по существу. Используй инструменты для работы с файлами и системой."
    },
    creative: {
      temperature: 0.7,
      system: "Ты — креативный помощник. Предлагай нестандартные идеи и развернутые объяснения."
    }
  },
  aliases: {
    "/h": "/help",
    "/q": "/exit",
    "/m": "/model",
    "/p": "/profile",
    "/ls": "/list",
    "/cat": "/read",
    "/run": "/shell",
    "/ap": "/autopilot",
    "/auto": "/autopilot",
    "/pl": "/plugin",
    "/perm": "/permissions",
    "/ctx": "/context",
    "/rw": "/rewind",
    "/sess": "/session",
    "/ld": "/lead",
    "/del": "/delegate",
    "/mem": "/memory",
    "/pr": "/preview",
    "/rt": "/routing",
    "/i": "/init",
  },
  templates: {
    "fix": "Исправь ошибку в следующем коде: {code}. Объясни, в чем была проблема.",
    "refactor": "Отрефактори этот файл: {file}. Улучши читаемость и производительность.",
    "explain": "Объясни, что делает этот код: {context}."
  }
};

/**
 * Internationalization strings.
 * @type {Object}
 */
const I18N = {
  ru: {
    banner_subtitle: "Terminal AI Assistant",
    api_key_missing_title: "API Key not found",
    api_key_missing_hint: "Use /key sk-... to set it.",
    type_help: "Type /help for commands",
    help_title_chat: "💬 Chat",
    help_title_autopilot: "🤖 Autopilot",
    help_title_images: "🖼  Images",
    help_title_tools: "🔧 Tools",
    help_title_settings: "⚙️  Settings",
    help_title_other: "📦 Other",
    cmd_clear: "Clear current chat context",
    cmd_chat_list: "List all chats",
    cmd_chat_new: "Create new chat",
    cmd_chat_use: "Switch to chat",
    cmd_chat_delete: "Delete chat",
    cmd_autopilot: "Start autopilot with a task",
    cmd_autopilot_short: "Short alias for autopilot",
    cmd_ap_config: "Show autopilot settings",
    cmd_ap_limit: "Set max iterations (default 50)",
    cmd_ap_errors: "Set max errors (default 5)",
    cmd_trigger: "Run command on autopilot completion",
    cmd_ctrl_c: "Stop autopilot gracefully",
    cmd_img_path: "Send image with optional question",
    cmd_img_url: "Send image by URL",
    cmd_img_inline: "Inline image in message",
    cmd_list: "List directory contents",
    cmd_read: "Read file contents",
    cmd_shell: "Execute shell command",
    cmd_model: "Change model",
    cmd_profile: "Change profile",
    cmd_assistant: "List/create/use custom assistants",
    cmd_temp: "Set temperature",
    cmd_key: "Set API key",
    cmd_url: "Set base URL",
    cmd_config: "Show current config",
    cmd_git: "Toggle git auto-commit",
    cmd_undo: "Undo last N AI file changes",
    cmd_export: "Export history to JSON",
    cmd_import: "Import history from JSON",
    cmd_template: "Use prompt template",
    cmd_pins: "List pinned messages",
    cmd_pin: "Pin last or specific message",
    cmd_vacuum: "Configure chat vacuum",
    cmd_alias: "Show aliases",
    cmd_stats: "Show status",
    cmd_plugin: "Manage plugins",
    cmd_help: "This help",
    cmd_exit: "Quit",
    stats_title: "◆ Status",
    tips_title: "✨ Tips",
    tips_body: `• /help — help\n• /pin — save useful reply\n• /vacuum on drop:4 keep:1 — auto cleanup\n• /plugin list — manage plugins`,
  },
  en: {
    banner_subtitle: "Terminal AI Assistant",
    api_key_missing_title: "API Key not found",
    api_key_missing_hint: "Use /key sk-... to set it.",
    type_help: "Type /help for commands",
    help_title_chat: "💬 Chat",
    help_title_autopilot: "🤖 Autopilot",
    help_title_images: "🖼  Images",
    help_title_tools: "🔧 Tools",
    help_title_settings: "⚙️  Settings",
    help_title_other: "📦 Other",
    cmd_clear: "Clear current chat context",
    cmd_chat_list: "List all chats",
    cmd_chat_new: "Create new chat",
    cmd_chat_use: "Switch to chat",
    cmd_chat_delete: "Delete chat",
    cmd_autopilot: "Start autopilot with a task",
    cmd_autopilot_short: "Short alias for autopilot",
    cmd_ap_config: "Show autopilot settings",
    cmd_ap_limit: "Set max iterations (default 50)",
    cmd_ap_errors: "Set max errors (default 5)",
    cmd_trigger: "Run command on autopilot completion",
    cmd_ctrl_c: "Stop autopilot gracefully",
    cmd_img_path: "Send image with optional question",
    cmd_img_url: "Send image by URL",
    cmd_img_inline: "Inline image in message",
    cmd_list: "List directory contents",
    cmd_read: "Read file contents",
    cmd_shell: "Execute shell command",
    cmd_model: "Change model",
    cmd_profile: "Change profile",
    cmd_assistant: "List/create/use custom assistants",
    cmd_temp: "Set temperature",
    cmd_key: "Set API key",
    cmd_url: "Set base URL",
    cmd_config: "Show current config",
    cmd_git: "Toggle git auto-commit",
    cmd_undo: "Undo last N AI file changes",
    cmd_export: "Export history to JSON",
    cmd_import: "Import history from JSON",
    cmd_template: "Use prompt template",
    cmd_pins: "List pinned messages",
    cmd_pin: "Pin last or specific message",
    cmd_vacuum: "Configure chat vacuum",
    cmd_alias: "Show aliases",
    cmd_stats: "Show status",
    cmd_plugin: "Manage plugins",
    cmd_help: "This help",
    cmd_exit: "Quit",
    stats_title: "◆ Status",
    tips_title: "✨ Tips",
    tips_body: `• /help — help\n• /pin — save useful reply\n• /vacuum on drop:4 keep:1 — auto cleanup\n• /plugin list — manage plugins`,
  }
};

/**
 * Translates a key to the current language.
 * @param {Object} cfg - Application configuration.
 * @param {string} key - Translation key.
 * @param {string} [fallback=""] - Fallback string.
 * @returns {string} Translated string.
 */
function t(cfg, key, fallback = "") {
  const lang = cfg?.lang || "ru";
  return (I18N[lang] && I18N[lang][key]) || I18N.ru[key] || fallback || key;
}

export { DATA_DIR, HIST_FILE, CONF_FILE, LOG_DIR, UNDO_FILE, ASSIST_DIR, PIN_FILE, PLUGIN_DIR, PERM_FILE, SESSION_DIR, CHECKPOINT_DIR, COST_FILE, GLOBAL_MEOW_MD, LEGACY_HIST_FILE, LEGACY_CONF_FILE, LEGACY_LOG_DIR, DEFAULT_CONFIG, I18N, t };
