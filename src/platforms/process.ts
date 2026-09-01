import { spawn } from 'node:child_process';
import type { ExecResult } from '../tools/exec.js';

export async function spawnWithTimeout(
  executable: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
  stream = true,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      const value = data.toString();
      stdout += value;
      if (stream) process.stdout.write(value);
    });
    child.stderr.on('data', (data) => {
      const value = data.toString();
      stderr += value;
      if (stream) process.stderr.write(value);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({
        stdout: stdout.slice(-20_000),
        stderr: stderr.slice(-20_000),
        code,
        timedOut,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        code: 1,
        timedOut,
      });
    });
  });
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
