# 🐈 Meow CLI — Next-gen Terminal AI Agent

Meow CLI is a powerful, autonomous, and beautiful terminal-based AI Agent. Inspired by the best of Claude Code and modern CLI tools, it provides a high-performance environment for building, refactoring, and automating your projects.

![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)


## 🚀 Features

### 🔀 Autonomous Multi-Agent System
*   **Hierarchical Delegation**: The main agent can split complex tasks into subtasks and delegate them to parallel sub-agents.
*   **Parallel Execution**: Up to 8 sub-agents can work simultaneously on different parts of your codebase.
*   **Autonomous Mode**: Full autopilot mode for long-running tasks with self-correction.

### 🧠 Intelligence & Memory
*   **RAG Memory System**: Automatically learns your code style, preferences, and common error fixes.
*   **Smart Model Routing**: Dynamically selects the best model (GPT-4o, GPT-4o-mini, etc.) based on task complexity to save costs.
*   **Project Context (MEOW.md)**: Automatically loads and injects project-specific rules and context into every prompt.

### 🔧 Developer Toolset
*   **19+ Specialized Tools**: From filesystem operations and grep search to HTTP requests and web search.
*   **Full Git Integration**: `git_diff`, `git_log`, `git_commit`, `git_branch`, `git_status` available to the AI.
*   **CI/CD Management**: Generate, status, and self-heal GitHub Actions workflows.

### ✨ Modern UX
*   **Beautiful UI**: Gradient logos, clean status lines, and sophisticated progress bars.
*   **Interactive Prompts**: Modern multiline input with autocomplete and syntax highlighting.
*   **Pair Programming Modes**: Choose between Verbose, Balanced, and Silent feedback levels.
*   **Live Preview**: Integrated dev server management.

### 🔒 Enterprise-Grade Security
*   **Workspace Sandbox**: Prevents any file operations outside your project directory.
*   **Audit Logging**: Every tool call is logged to `audit.log` for transparency.
*   **Incognito Mode**: Sessions that leave no trace on your disk.

## 🛠 Installation

```bash
# Clone the repository
git clone https://github.com/cons0leweb/meow-cli.git
cd meow-cli

# Install dependencies
npm install

# Link for global use
npm link
```

## 📖 Quick Start

```bash
# Start the interactive shell
meow

# Or use pipe mode
echo "Refactor this code" | meow --pipe
```

### Common Commands

*   `/help` — Show all available commands.
*   `/lead auto` — AI Lead Developer mode: suggests and executes improvements.
*   `/delegate <task>` — Run a task in parallel using sub-agents.
*   `/memory stats` — See what the AI has learned about your project.
*   `/routing on` — Enable smart model selection.
*   `/cost` — Show current session usage and cost.

## 📂 Project Structure

*   `src/cli.js` — Main interactive loop and routing logic.
*   `src/modules/agents/` — Autonomous agent implementations.
*   `src/modules/memory/` — RAG memory and learning system.
*   `src/modules/smart/` — CI/CD, Routing, and UX logic.
*   `src/modules/security/` — Sandbox and audit logging.
*   `src/modules/commands/` — Command handlers for the interactive shell.

## 📄 License

MIT © [cons0leweb](https://github.com/cons0leweb)
