import type { ExecResult } from '../tools/exec.js';

export type PlatformId = 'wsl' | 'linux' | 'macos' | 'windows' | 'ios';

export type PlatformCapabilities = {
  shell: boolean;
  filesystem: boolean;
  processSpawn: boolean;
};

export interface PlatformAdapter {
  id: PlatformId;
  label: string;
  capabilities: PlatformCapabilities;
  promptNotes: string;
  runCommand(cmd: string, workdir: string, timeoutMs: number): Promise<ExecResult>;
}
