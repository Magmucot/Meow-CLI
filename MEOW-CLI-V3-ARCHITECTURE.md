# Meow CLI v3 — Architecture & Usage Guide

## Overview
Meow CLI v3 — Next-gen Terminal AI Agent.  
**9,031 lines** · Node.js ≥18 · ESM · 3 npm deps · 7 strategic features

## New in v3

### 🔀 1. Hierarchical Sub-Agents (`delegate_task`)
```
User → "refactor imports in 10 files"
  ↓
Main Agent analyzes → splits into 10 subtasks
  ↓
AgentCoordinator.runParallel()
  ↓
┌─ SubAgent#1 (read src/api.js → patch_file)
├─ SubAgent#2 (read src/cli.js → patch_file)
├─ SubAgent#3 ...
└─ SubAgent#N (max 8 parallel, depth 3)
  ↓
Results collected → Cache stored → Summary returned
```

**Key files:** `src/modules/agents/subagent.js`  
**Commands:** `/delegate <task>`  
**Tool:** `delegate_task` (model calls it autonomously)  
**Config:** Token budget per agent, tool allowlists, depth limits

---

### 🧠 2. RAG Memory System
```
Tool Execution
  ↓ MemoryHooks (auto-learn)
  ↓
MemoryStore (JSON + TF-IDF)
  ├── decisions, error_fixes, preferences
  ├── patterns, code_styles, rejections
  └── per-project + cross-project
  ↓
buildContextForPrompt() → injected into system prompt
```

**Key files:** `src/modules/memory/rag.js`  
**Commands:** `/memory stats`, `/memory search <q>`, `/memory prefs`, `/memory clear`  
**Auto-learning:** Code style, shell commands, rejected suggestions

---

### 🎯 3. AI Lead Developer
```
/lead [auto] [context]
  ↓
ProjectAnalyzer.detect() → node/rust/go/python
  ↓
suggestNextTasks(AI) → prioritized list
  ↓ User picks (or auto-selects)
Autopilot executes task
  ↓
Quality Gates (lint/test/build/types)
  ↓ Pass? → Record in memory, next round
  ↓ Fail? → Log failure, continue
```

**Key files:** `src/modules/agents/lead-dev.js`  
**Commands:** `/lead`, `/lead auto`, `/lead auto improve test coverage`

---

### 🚀 4. CI/CD + Git Tools
```
Model toolset:
  git_diff, git_log, git_commit, git_branch, git_status
  ci_pipeline (status/generate/heal)

Self-Healing:
  Tests fail → AI analyzes → patch_file fix → re-test
  3 attempts max → auto-revert on failure
```

**Key files:** `src/modules/smart/cicd.js`  
**Commands:** `/ci status`, `/ci generate <desc>`, `/ci heal`

---

### ✨ 5. Enhanced UX
```
/pair verbose   — AI explains every decision
/pair balanced  — Brief explanations
/pair silent    — Minimal output
/preview start  — Launch dev server
/preview stop   — Stop dev server
```

**Key files:** `src/modules/smart/ux.js`  
**Also:** Desktop notifications, colored diffs, tab completion data

---

### 🔒 6. Enterprise Security
```
Every tool call:
  → WorkspaceSandbox.validate() — block writes outside CWD
  → AuditLogger.logToolCall() — append to audit.log
  → Permission check (existing system)

/incognito on  — all data to tmpdir, destroyed on exit
/audit show    — view audit trail
```

**Key files:** `src/modules/security/sandbox.js`  
**Features:** AES-256-GCM encryption, shell command blocklist, sensitive path detection

---

### ⚡ 7. Smart Model Routing
```
User message → analyzeComplexity()
  ↓
Trivial/Simple → fast model (gpt-4o-mini)
Moderate       → balanced model (gpt-4o)
Complex/Expert → powerful model (gpt-4-turbo)
  ↓
Cost savings tracked per session
```

**Key files:** `src/modules/smart/model-router.js`  
**Commands:** `/routing on|off`, `/routing fast <model>`, `/routing powerful <model>`

---

## Architecture

```
src/
├── cli.js                      # Main loop (streaming + routing + RAG)
├── core.js                     # Barrel re-exports
└── modules/
    ├── agents/                 # v3: Agent system
    │   ├── subagent.js         # Parallel sub-agents + cache
    │   └── lead-dev.js         # AI Lead Developer mode
    ├── memory/                 # v3: RAG memory
    │   └── rag.js              # TF-IDF store + auto-learning
    ├── security/               # v3: Enterprise security
    │   └── sandbox.js          # Sandbox + audit + encryption
    ├── smart/                  # v3: Intelligence layer
    │   ├── cicd.js             # Git tools + CI/CD + self-heal
    │   ├── model-router.js     # Dynamic model selection
    │   └── ux.js               # Notifications + pair mode
    ├── api.js                  # API (uses ALL_TOOLS)
    ├── autopilot.js            # Original autopilot
    ├── tool-handler.js         # Parallel reads + sandbox + audit
    ├── tools.js                # 19 tools (12 original + 7 new)
    ├── commands/
    │   ├── v3.js               # All v3 command handlers
    │   └── ...                 # Original commands
    └── ...                     # Config, UI, sessions, etc.
```

## Tool Inventory (19 total)

| Tool | Category | New? |
|------|----------|------|
| list_dir | filesystem | |
| read_file | filesystem | |
| write_file | filesystem | |
| patch_file | filesystem | |
| grep_search | search | |
| run_shell | system | |
| http_request | network | |
| web_search | network | |
| tool_chain | orchestration | |
| ask_user | interaction | |
| confirm | interaction | |
| choose | interaction | |
| **delegate_task** | **agents** | **✓** |
| **git_diff** | **git** | **✓** |
| **git_log** | **git** | **✓** |
| **git_commit** | **git** | **✓** |
| **git_branch** | **git** | **✓** |
| **git_status** | **git** | **✓** |
| **ci_pipeline** | **CI/CD** | **✓** |

## Integration Points

The v3 features are wired into the existing system at these points:

1. **tool-handler.js** — sandbox validation, parallel reads, audit logging, memory hooks
2. **cli.js** — RAG injection at startup, smart model routing per message, auto-compact on overflow
3. **api.js** — ALL_TOOLS (19) sent to model
4. **commands/index.js** — 9 new command handlers registered
5. **config.js** — new aliases, new config sections
6. **screens.js** — 3 new help sections

## Quick Start

```bash
# Install
npm install -g .

# Run
meow

# Try v3 features
/lead auto                    # AI suggests & executes improvements
/delegate fix all TODOs       # Parallel sub-agent
/memory stats                 # Check what AI has learned
/pair verbose                 # AI explains everything
/ci generate test on PR       # Create GitHub Actions
/routing on                   # Auto-select cheap/expensive model
/incognito on                 # No traces left
/audit show                   # Security audit trail
```
