# 📜 Meow CLI Command Reference

Meow CLI provides a wide array of commands to manage your AI sessions, project context, and autonomous tasks.

## 💬 Chat Management
| Command | Description |
|---------|-------------|
| `/chat list` | List all saved chat sessions |
| `/chat new [name]` | Start a new chat session |
| `/chat use <name>` | Switch to an existing chat |
| `/chat delete <name>` | Delete a chat session |
| `/clear` | Clear chat context |
| `/reset` | Reset chat context |

## 🤖 Autopilot & Agents
| Command | Description |
|---------|-------------|
| `/autopilot <task>` | Execute a task autonomously (alias: `/ap`) |
| `/ap-config` | View autopilot configuration |
| `/ap-limit <N>` | Set max iterations for autopilot |
| `/ap-errors <N>` | Set max allowed errors for autopilot |
| `/lead [auto] [context]` | AI Lead Developer mode (auto: no prompts) |
| `/delegate <task>` | Spawn parallel sub-agents for a specific task |

## 🧠 Memory & Intelligence
| Command | Description |
|---------|-------------|
| `/memory stats` | Show learned project statistics |
| `/memory search <q>` | Search project memory |
| `/memory prefs` | View learned user preferences |
| `/memory clear` | Wipe project memory |
| `/routing on\|off` | Toggle smart model routing |

## 🔧 Tools & Filesystem
| Command | Description |
|---------|-------------|
| `/list <path>` | List files in a directory |
| `/read <file>` | Read file contents |
| `/shell <cmd>` | Execute a shell command |
| `/rewind [N]` | Undo last N file changes |
| `/rewind --list` | Show checkpoint history |

## 🖼 Images
| Command | Description |
|---------|-------------|
| `/img <path> [text]` | Analyze a local image |
| `/img <url> [text]` | Analyze an image from a URL |
| `{img:path} text` | Inline image syntax for messages |

## 🔒 Security & Permissions
| Command | Description |
|---------|-------------|
| `/permissions` | Manage tool permissions |
| `/perm allow <tool>` | Always allow a specific tool |
| `/perm deny <tool>` | Always deny a specific tool |
| `/audit` | Show security audit log |
| `/incognito on\|off` | Toggle incognito mode (no history saved) |

## ⚙️ Settings
| Command | Description |
|---------|-------------|
| `/model [name]` | View or change the AI model |
| `/profile [name]` | Switch between config profiles |
| `/temp [0.0-2.0]` | Set model temperature |
| `/key [sk-...]` | Set your API key |
| `/config` | View full configuration as JSON |
| `/lang <ru\|en>` | Change UI language |

## ⏪ History & Sessions
| Command | Description |
|---------|-------------|
| `/session list` | Show all saved sessions |
| `/session load <id>` | Resume a specific session |
| `/compact` | Compact history (manual) |
| `/compact --ai` | Compact history using AI summarization |
| `/cost [total]` | View token usage and costs |

## 📦 Miscellaneous
| Command | Description |
|---------|-------------|
| `/init` | Index the project with AI — creates `project.meow` and `MEOW.md` |
| `/init --force` | Regenerate `project.meow` and `MEOW.md` even if they exist |
| `/stats` | Show session and system statistics |
| `/help` | Show the help screen |
| `/exit` | Exit Meow CLI |
