# muse-codex

A Codex-style coding-agent harness for Meta Muse Spark. The harness core is platform-neutral; command execution is provided by platform adapters.

## Runtime status

| Platform | Status | Execution |
| --- | --- | --- |
| Windows + WSL | Primary / functional | `wsl.exe` + bash |
| Linux | Scaffolded | `/bin/bash` |
| macOS | Scaffolded | `/bin/zsh` |
| Windows native | Scaffolded | PowerShell |
| iOS | Scaffolded capability boundary | no arbitrary local process spawn; execution transport TBD |

On Windows, `auto` intentionally selects WSL because that is the first supported Windows runtime. Use `--platform windows` to exercise the native PowerShell adapter explicitly.

## Quick start: Windows + WSL

1. Install WSL (Ubuntu is fine): `wsl --install`.
2. Install Node.js 20+ on Windows.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and set `MUSE_API_KEY`.
5. Point `WORKDIR` at an existing checkout you want the agent to modify.
6. Run:

```bash
npm run muse -- "Fix the failing tests in the auth module"
```

The Windows path in `WORKDIR` is translated to `/mnt/<drive>/...` for commands executed inside WSL, while file editing stays in the host process. This allows Windows and WSL to operate on the same checkout.

## Platform selection

Automatic selection:

- Windows -> `wsl`
- macOS -> `macos`
- Linux -> `linux`

Override with either:

```bash
npm run muse -- --platform linux "Implement the feature"
```

or `MUSE_PLATFORM=wsl|linux|macos|windows|ios`.

## Model API

The client uses the OpenAI-compatible chat-completions tool-calling shape and defaults to:

```text
MUSE_API_BASE=https://api.meta.ai/v1
MUSE_MODEL=muse-spark-1.2
```

Legacy `LLAMA_API_KEY`, `LLAMA_API_BASE`, and `LLAMA_MODEL` environment variables remain accepted as fallbacks.

## Harness tools

- `read_file` - bounded UTF-8 file reads
- `glob` - portable wildcard file discovery
- `grep` - portable literal text search
- `apply_patch` - Codex-style Add/Update/Delete patch operations
- `run_command` - platform-adapter command execution with timeout and streamed output
- `spawn_subagent` - focused delegated agent run

All filesystem tools reject paths that escape `WORKDIR`.

## Long-run behavior

The agent preserves native model tool-call IDs and sends tool results back as `role: tool`, which is required for sustained multi-turn tool use. A JSONL journal records assistant and tool activity. The current journal is an activity log; full deterministic crash replay/continuation is a future layer.

## Development

```bash
npm run check
```

This runs TypeScript compilation and the portable filesystem/patch tests.

## Next platform work

The shared `PlatformAdapter` is the extension seam. Linux, macOS, and native Windows already have command adapters but still need platform-specific integration tests, permission/sandbox policy, and packaging. iOS deliberately exposes `run_command` as unavailable until an embedded or remote execution transport is selected rather than pretending iOS supports unrestricted process spawning.
