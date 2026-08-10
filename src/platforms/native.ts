import { spawnWithTimeout } from './process.js';
import type { PlatformAdapter } from './types.js';

export const linuxPlatform: PlatformAdapter = {
  id: 'linux',
  label: 'Linux',
  capabilities: { shell: true, filesystem: true, processSpawn: true },
  promptNotes: 'Commands run in bash on Linux. Use POSIX/bash syntax.',
  runCommand: (cmd, workdir, timeoutMs) =>
    spawnWithTimeout('/bin/bash', ['-lc', cmd], timeoutMs, workdir),
};

export const macosPlatform: PlatformAdapter = {
  id: 'macos',
  label: 'macOS',
  capabilities: { shell: true, filesystem: true, processSpawn: true },
  promptNotes: 'Commands run in zsh on macOS. Prefer portable POSIX commands; BSD tool flags may differ from GNU.',
  runCommand: (cmd, workdir, timeoutMs) =>
    spawnWithTimeout('/bin/zsh', ['-lc', cmd], timeoutMs, workdir),
};

export const windowsPlatform: PlatformAdapter = {
  id: 'windows',
  label: 'Windows (native)',
  capabilities: { shell: true, filesystem: true, processSpawn: true },
  promptNotes: 'Commands run in PowerShell on native Windows. Use PowerShell syntax, not bash syntax.',
  runCommand: (cmd, workdir, timeoutMs) =>
    spawnWithTimeout(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', cmd],
      timeoutMs,
      workdir,
    ),
};

export const iosPlatform: PlatformAdapter = {
  id: 'ios',
  label: 'iOS',
  capabilities: { shell: false, filesystem: true, processSpawn: false },
  promptNotes: 'iOS does not expose arbitrary local process spawning. The future iOS harness must provide sandboxed file tools and a remote or embedded execution transport.',
  async runCommand() {
    throw new Error('run_command is unavailable on the iOS scaffold; configure an execution transport first');
  },
};
