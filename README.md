# muse-codex

A model-agnostic, multi-agent coding harness. The harness core is independent of model vendors and operating systems; inference and command execution are provided by adapters.

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
4. Point `WORKDIR` at an existing checkout you want the agent to modify.
5. Run:

```bash
npm run muse -- "Fix the failing tests in the auth module"
```

On the first Meta-backed run, Muse Codex opens Meta's Model API portal. Sign in, create the one-click API key, and paste it once into the terminal. The key is then stored using OS-protected credential storage rather than a project `.env` file. Runs selecting another provider use that provider's credentials and never trigger Meta login.

The Windows path in `WORKDIR` is translated to `/mnt/<drive>/...` for commands executed inside WSL, while file editing stays in the host process. This allows Windows and WSL to operate on the same checkout.

## Authentication

Explicit login is also available:

```bash
npm run muse -- login
npm run muse -- auth status
npm run muse -- logout
```

Credential storage:

- Windows: DPAPI protected for the current Windows user
- macOS: Keychain
- Linux: Secret Service via `secret-tool`

Environment variables remain supported for CI and advanced setups. Credential resolution order is:

1. `META_MODEL_API_KEY` / compatibility environment aliases
2. OS secure credential store
3. interactive login

Meta currently exposes Model API access through account signup plus one-click API key creation; Muse Codex therefore performs a browser handoff and one-time paste rather than pretending a third-party OAuth/device-code flow exists.

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

## Models and providers

Select a model with `provider/model`:

```text
npm run muse -- --model kimi/kimi-k2 "Fix the failing tests"
npm run muse -- --model qwen/qwen3-coder-plus "Implement the feature"
npm run muse -- --model openai/gpt-5.4 "Review this change"
```

Built-in OpenAI-compatible adapters cover Meta, OpenAI, xAI, Kimi/Moonshot, Qwen/DashScope, OpenRouter, Ollama, and a custom endpoint. `--list-providers` prints the registry. Different child agents may use different providers and models.

The adapter interface is intentionally independent from Chat Completions so native Responses, Anthropic, or other protocols can be added without changing the agent runtime.

## Harness tools

- `read_file` - bounded UTF-8 file reads
- `glob` - portable wildcard file discovery
- `grep` - portable literal text search
- `apply_patch` - Codex-style Add/Update/Delete patch operations
- `run_command` - platform-adapter command execution with timeout and streamed output
- `spawn_subagent` - start a concurrent delegated agent, optionally on another provider/model
- `list_agents`, `wait_agents`, `send_agent` - observe, join, and steer child agents

All filesystem tools reject paths that escape `WORKDIR`.

## Long-run behavior

The agent preserves native model tool-call IDs and sends tool results back as `role: tool`, which is required for sustained multi-turn tool use. A JSONL journal records assistant and tool activity. See [the harness design](docs/HARNESS-DESIGN.md) for the Grok Build and SwarmForge comparison and implementation roadmap.

## Development

```bash
npm run check
```

This runs TypeScript compilation and the portable tests.

## Next platform work

The shared `PlatformAdapter` is the extension seam. Linux, macOS, and native Windows already have command adapters but still need platform-specific integration tests, permission/sandbox policy, and packaging. iOS deliberately exposes `run_command` as unavailable until an embedded or remote execution transport is selected rather than pretending iOS supports unrestricted process spawning.
