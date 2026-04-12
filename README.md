# 🐾 Meow CLI v3

**Next-gen Terminal AI Agent.**  
Powerful, hierarchical, and context-aware assistant for developers.

---

## 🚀 Overview
Meow CLI is a high-performance terminal AI agent built with Node.js. It's designed to be more than just a chatbot; it's a tool-equipped autonomous agent capable of managing complex development tasks, parallelizing subtasks, and learning from your project environment.

## ✨ Key Features

### 🔀 Hierarchical Sub-Agents
The agent can autonomously decide to spawn parallel sub-agents to handle large tasks. For example, "Refactor imports in the entire project" will be split into multiple sub-tasks executed in parallel.

### 🧠 RAG Memory System
Meow CLI learns as it works. It stores decisions, error fixes, and your preferences in a local vector-like store (TF-IDF + JSON), injecting relevant context into every conversation.

### 🎯 AI Lead Developer Mode
The `/lead` command puts the agent in "Lead Developer" mode. It analyzes your project, suggests the next logical steps, and can even execute them autonomously.

### 🚀 CI/CD & Git Intelligence
Equipped with deep Git integration. It can generate GitHub Actions, check pipeline status, and even "self-heal" failing tests by analyzing logs and applying patches.

### 🔒 Enterprise-Grade Security
Built-in workspace sandbox prevents the agent from touching files outside your project. Every tool call is logged to an audit trail for transparency.

---

## 🚦 Quick Start

1. **Start Meow:**
   ```bash
   node index.js
   ```
2. **Setup your API Key:**
   ```bash
   /key sk-your-api-key-here
   ```
3. **Ask for help:**
   ```bash
   /help
   ```

---

## 📖 Essential Commands

| Command | Description |
|---------|-------------|
| `/lead` | Activate AI Lead Developer mode |
| `/delegate <task>` | Spawn parallel sub-agents for a task |
| `/memory stats` | View what the AI has learned about your project |
| `/ci heal` | Attempt to fix failing tests autonomously |
| `/routing on` | Enable smart model selection |
| `/compact --ai` | Summarize history using AI to save tokens |

---

## 📜 License
MIT © cons0leweb
