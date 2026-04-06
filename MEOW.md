# Meow CLI — Project Context

## Overview
Meow CLI v2 — Terminal AI Agent inspired by Claude Code.
Node.js ≥18, ESM modules, zero heavy dependencies.

## Architecture
```
src/
├── cli.js                 # Main loop (streaming + pipe mode)
├── core.js                # Re-exports all modules
└── modules/
    ├── api.js             # API calls (streaming + non-streaming + retry)
    ├── autopilot.js       # Autonomous agent (phases, recovery, nudge)
    ├── checkpoints.js     # File snapshots + /rewind
    ├── cli-context.js     # CLI state management
    ├── cli-input.js       # Multiline input (Ctrl+D to send)
    ├── compact.js         # Context compression (/compact, /compact --ai)
    ├── config.js          # Config, i18n, paths
    ├── cost-tracker.js    # Token usage + cost estimation
    ├── images.js          # Vision support (base64 + URL)
    ├── permissions.js     # 3-level permission system (ask/allow/deny)
    ├── persistence.js     # JSON load/save, migration
    ├── plugins.js         # Plugin system (.js/.mjs/.cjs)
    ├── project-context.js # MEOW.md loading + !include
    ├── screens.js         # UI screens (banner, help, stats)
    ├── sessions.js        # Session save/restore
    ├── tool-handler.js    # Tool execution with permissions + checkpoints
    ├── tools.js           # 12 tools (patch_file, grep_search, etc.)
    ├── ui.js              # Theme, spinner, box drawing, markdown
    ├── utils.js           # Helpers
    └── commands/          # Slash command handlers
```

## Coding Standards
- ESM modules (import/export)
- No TypeScript, no build step
- ANSI color via raw escape codes (ui.js)
- All paths via config.js constants
- Functions export individually (no default exports)

## Rules
- Keep backward compatibility with v1 configs
- Never break existing commands
- All new features must be optional/configurable
