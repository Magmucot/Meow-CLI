# Meow CLI Command Reference

Meow CLI provides a rich set of commands to manage your AI sessions, project context, and autonomous tasks.

## 💬 Chat Management

| Command | Description |
|---------|-------------|
| `/clear` | Clear the current conversation history. |
| `/chat list` | List all saved chat sessions. |
| `/chat new [name]` | Start a new chat session. |
| `/chat use <name>` | Switch to an existing chat session. |
| `/chat delete <name>` | Delete a chat session. |

## 🤖 Autopilot & Agents

| Command | Description |
|---------|-------------|
| `/autopilot <task>` | Start a long-running autonomous task. |
| `/ap <task>` | Shortcut for `/autopilot`. |
| `/ap-config` | Show current autopilot configuration. |
| `/ap-limit <N>` | Set the maximum number of iterations for autopilot. |
| `/ap-errors <N>` | Set the maximum number of errors before autopilot stops. |
| `/lead [context]` | AI Lead Developer mode — suggest next steps. |
| `/lead auto [context]` | Full auto-mode for Lead Developer. |
| `/delegate <task>` | Delegate a task to parallel sub-agents. |
| `/trigger <cmd\|off>` | Set a command to trigger autopilot automatically. |

## 🧠 Memory & Intelligence

| Command | Description |
|---------|-------------|
| `/memory stats` | Show RAG memory statistics and learned patterns. |
| `/memory search <q>` | Search the project memory. |
| `/memory prefs` | Show learned user preferences. |
| `/memory clear` | Wipe the project memory. |
| `/routing on\|off` | Toggle smart model routing. |
| `/routing fast <model>` | Set the model for simple tasks. |
| `/routing powerful <model>` | Set the model for complex tasks. |

## 🔧 Tools & System

| Command | Description |
|---------|-------------|
| `/list <path>` | List files in a directory. |
| `/read <file>` | Read the contents of a file. |
| `/shell <cmd>` | Execute a shell command. |
| `/undo [N]` | Undo the last N file changes. |
| `/rewind [N]` | Undo the last N file changes (checkpoint based). |
| `/rewind --list` | Show available checkpoints. |
| `/permissions` | Manage tool execution permissions. |
| `/perm allow <tool>` | Always allow a specific tool. |
| `/perm deny <tool>` | Always deny a specific tool. |

## ⚙️ Settings & Configuration

| Command | Description |
|---------|-------------|
| `/model [name]` | Show or change the current AI model. |
| `/profile [name]` | Show or change the current profile. |
| `/assistant <cmd>` | Manage assistant-level instructions. |
| `/temp [0.0-2.0]` | Set the model temperature. |
| `/key [sk-...]` | Set the API key. |
| `/url [url]` | Set the API base URL. |
| `/config` | Show full current configuration. |
| `/git [on\|off]` | Toggle git integration features. |
| `/lang <ru\|en>` | Switch the UI language. |

## 🚀 Advanced Features

| Command | Description |
|---------|-------------|
| `/ci status` | Show current CI/CD pipeline status. |
| `/ci generate <desc>` | Generate a new CI/CD workflow. |
| `/ci heal` | Attempt to self-heal failing tests. |
| `/pair <mode>` | Set pair programming feedback level (`verbose`, `balanced`, `silent`, `off`). |
| `/incognito on\|off` | Toggle incognito mode. |
| `/audit show` | View the security audit log. |
| `/preview start\|stop` | Manage the live development server preview. |
| `/cost [total]` | Show token usage and cost for the session or all-time. |
| `/compact [--ai]` | Manually compress the conversation history. |

## 📦 Miscellaneous

| Command | Description |
|---------|-------------|
| `/pins` | List pinned messages or files. |
| `/pin [index]` | Pin a message or file to the context. |
| `/vacuum [opts]` | Clean up old history or logs. |
| `/alias` | Manage command aliases. |
| `/plugin [cmd]` | Manage Meow CLI plugins. |
| `/export <file>` | Export the current session to a file. |
| `/import <file>` | Import a session from a file. |
| `/template <name>` | Use a pre-defined prompt template. |
| `/exit` | Exit Meow CLI. |
