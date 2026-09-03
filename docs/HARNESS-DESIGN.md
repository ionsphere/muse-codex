# Muse harness architecture

Muse-Codex is a model-agnostic agent runtime. Models propose actions; the harness owns context, tools, permissions, concurrency, state, and verification.

## Reference comparison

| Concern | Grok Build / GrokBot | SwarmForge | Muse-Codex direction |
| --- | --- | --- | --- |
| Model binding | Grok runtime first, with provider bridges | Launches independent Codex, Claude, Copilot, or Grok CLIs per role | Native provider interface; every agent selects its own provider/model |
| Topology | Primary agent with dynamic subagents and optional councils | Configured role pipeline (`two-pack`, `four-pack`, `six-pack`) | Both dynamic delegation and declarative role graphs |
| Isolation | Sessions, permissions, sandbox profiles, optional worktrees | One Git worktree per editing role | Explicit workspace policy: shared read-only, shared edit, or isolated worktree |
| Coordination | Runtime-managed subagents, queues, steering, interruption | Durable, validated file handoffs through a daemon | Run-scoped coordinator plus durable event/handoff store |
| Policy | Rules, skills, hooks, MCP, permissions | Layered project constitution and role prompts | Layered policy files plus enforceable tool/command gates |
| UX | Full TUI/desktop, history, preview, remote agent, schedules | Observable tmux sessions | Normalized event stream first; TUI/desktop/remote clients consume it |
| Durability | Resumable sessions and checkpoints | Local handoff queues and Git commits | Atomic sessions, event journal, checkpoints, resumable agents |

Grok Build is the stronger single-agent harness and product surface. SwarmForge is the stronger explicit software-production workflow: its valuable ideas are named roles, isolated worktrees, small validated handoffs, and deterministic quality gates. Muse should combine these without embedding any vendor CLI as its runtime.

## Implemented foundation

- `ModelProvider` is the inference boundary.
- `ModelRegistry` supports Meta, OpenAI, xAI, Kimi/Moonshot, Qwen/DashScope, OpenRouter, Ollama, and arbitrary OpenAI-compatible servers.
- A model is selected as `provider/model` globally or per spawned agent.
- `AgentCoordinator` starts concurrent agents, tracks lifecycle, waits for results, and accepts steering messages.
- All agents retain the existing work-directory containment rules.
- Declarative swarms define role-specific models, prompts, dependencies, receive modes, and workspace policies.
- Editing roles can run in isolated Git worktrees, and dependency edges produce atomic, commit-verified handoffs.
- Ordered executable quality gates block handoffs, with bounded corrective attempts and durable run manifests.
- Promotion and cleanup are explicit: promotion requires a clean checkout; cleanup refuses dirty worktrees and preserves branches.

## Next runtime layers

1. Durable sessions: replace the activity-only JSONL file with atomic session metadata, event replay, checkpoints, and context compaction.
2. Worktree integration: add selectable merge/rebase promotion strategies and branch-retention policies.
3. Declarative swarm gates: add conditional transitions and specialist gate adapters for coverage, mutation, and architecture checks.
4. Policy engine: approvals, command allow/deny rules, network and secret boundaries, hooks, and sandbox profiles enforced in code.
5. Extension protocol: skills, MCP servers, plugins, and typed hooks independent of provider message format.
6. Normalized streaming events: text, reasoning, tool calls, diffs, agent lifecycle, usage, and errors for CLI/TUI/desktop clients.
7. Verification and evals: task-level gates, reviewer roles, regression fixtures, and provider/harness comparison runs.

## Non-goals

- Pretending every provider has identical capabilities. Provider adapters expose capabilities and the runtime degrades explicitly.
- Sending an entire repository to a model provider. Only model-visible messages and requested tool results cross the inference boundary.
- Depending on tmux, Electron, or a specific vendor CLI in the core runtime.
