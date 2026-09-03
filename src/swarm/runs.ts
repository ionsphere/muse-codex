import fs from 'node:fs';
import path from 'node:path';
import type { GateResult } from './gates.js';

export type RoleRunRecord = {
  role: string;
  status: 'running' | 'passed' | 'failed';
  workdir?: string;
  commit?: string;
  attempt: number;
  gates: GateResult[];
  error?: string;
};

export type SwarmRunRecord = {
  version: 1;
  runId: string;
  task: string;
  repository: string;
  status: 'running' | 'passed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  roles: RoleRunRecord[];
};

export class RunStore {
  private readonly file: string;
  constructor(repository: string, runId: string) {
    this.file = path.join(repository, '.muse', 'runs', `${runId}.json`);
  }

  write(record: SwarmRunRecord) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
    fs.renameSync(temporary, this.file);
  }

  static read(repository: string, runId: string): SwarmRunRecord {
    if (!/^[0-9]{14}-[0-9]+$/.test(runId)) throw new Error('Invalid swarm run ID');
    const file = path.join(repository, '.muse', 'runs', `${runId}.json`);
    if (!fs.existsSync(file)) throw new Error(`Unknown swarm run: ${runId}`);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SwarmRunRecord;
  }
}
