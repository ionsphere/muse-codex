import os from 'node:os';
import { spawnWithTimeout, shellQuote } from './process.js';
import type { PlatformAdapter } from './types.js';

function toWslPath(workdir: string): string {
  if (os.platform() !== 'win32') return workdir;
  const match = workdir.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return workdir.replace(/\\/g, '/');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

export const wslPlatform: PlatformAdapter = {
  id: 'wsl',
  label: 'Windows + WSL',
  capabilities: { shell: true, filesystem: true, processSpawn: true },
  promptNotes: 'Commands run in bash inside WSL. Use POSIX/bash syntax and Linux tooling.',
  async runCommand(cmd, workdir, timeoutMs) {
    const linuxWorkdir = toWslPath(workdir);
    return spawnWithTimeout(
      'wsl.exe',
      ['bash', '-lc', `cd -- ${shellQuote(linuxWorkdir)} && ${cmd}`],
      timeoutMs,
    );
  },
};
