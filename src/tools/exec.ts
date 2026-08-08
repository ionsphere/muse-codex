import { detectPlatform } from '../platforms/index.js';

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
};

export async function runCommandTool(
  cmd: string,
  workdir: string,
  timeoutMs: number,
): Promise<ExecResult> {
  const platform = detectPlatform();
  if (!platform.capabilities.shell) {
    throw new Error(`run_command is not supported by platform ${platform.id}`);
  }
  return platform.runCommand(cmd, workdir, timeoutMs);
}
