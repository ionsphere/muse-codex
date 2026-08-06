# my-muse Windows harness for Muse Spark

Codex-style terminal harness that works on Windows via WSL.

Quick start:
1. wsl --install (Ubuntu)
2. npm install
3. copy .env.example to .env, set key from dev.meta.ai
4. git clone <your repo> workdir
5. npm run muse -- "Fix failing tests in auth module"

Features:
- WSL exec wrapper with PTY streaming + timeouts
- CRLF-safe patch applier
- JSONL journal for crash-resume like Muse Code
- Tools: read_file, glob, grep, apply_patch, run_command, spawn_subagent
