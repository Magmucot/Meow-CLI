# 🏗 Meow CLI Architecture Guide

This document explains the internal structure and design philosophy of Meow CLI v3.

## 核心 (Core)
The system is built as a single-loop orchestration engine that combines a streaming LLM interface with a rich set of local tools.

### 1. Main Loop (`src/cli.js`)
The `main()` function in `cli.js` is the heart of the application. It handles:
- Argument parsing and session resumption.
- Interactive input via `askInput`.
- Command routing (built-in vs. plugins).
- The "Think-Act" loop where the LLM calls tools and receives results.
- Auto-compaction of history when token limits are approached.

### 2. Module System
Functionality is strictly modularized:
- **`agents/`**: High-level orchestration for complex tasks (Sub-agents, Lead Dev).
- **`memory/`**: The RAG system that persists project context.
- **`security/`**: Sandbox validation and audit logging.
- **`smart/`**: Intelligence layer for CI/CD and dynamic routing.
- **`commands/`**: Handlers for all `/` slash commands.

## 🛠 Tool Execution Flow
When the LLM decides to use a tool:
1. **`api.js`**: Defines the tool schema sent to the model.
2. **`tool-handler.js`**: Receives the call, validates it against the **Sandbox**, and checks **Permissions**.
3. **`tools.js`**: Contains the actual implementation of low-level tools (fs, shell, git).
4. **Result**: The output is returned to the LLM, which continues its reasoning.

## 🧠 Memory & Context
Meow CLI uses a two-tier context system:
1. **Static Context**: `MEOW.md` file in the project root is loaded at startup.
2. **Dynamic Memory**: The RAG system (`rag.js`) automatically learns from tool outputs and user preferences, storing them in `~/.meowcli/data/memory/`.

## 🔒 Security Model
- **Sandbox**: All file operations are restricted to the Current Working Directory (CWD).
- **Permissions**: Users can set tools to `allow`, `deny`, or `ask` (default).
- **Audit Log**: Every tool execution is recorded with timestamps and arguments.

## 🚀 Parallelism
Meow CLI can parallelize work using the `delegate_task` tool. This spawns independent "Sub-Agents" that run in parallel, each with its own token budget and toolset, reporting back to the main agent upon completion.
