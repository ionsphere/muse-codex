import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveCommit } from './git.js';

export type Handoff = {
  version: 1;
  id: string;
  runId: string;
  from: string;
  to: string;
  task: string;
  commit: string;
  summary: string;
  createdAt: string;
};

export class HandoffStore {
  private readonly root: string;
  constructor(repository: string, private readonly runId: string) {
    this.root = path.join(repository, '.muse', 'handoffs', runId);
  }

  async deliver(input: Omit<Handoff, 'version' | 'id' | 'runId' | 'createdAt' | 'commit'> & { commit: string }, gitWorkdir: string) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(input.from) || !/^[a-z][a-z0-9-]{0,31}$/.test(input.to)) {
      throw new Error('Handoff roles must be valid role IDs');
    }
    if (!input.task.trim() || !input.summary.trim()) throw new Error('Handoff task and summary are required');
    const commit = await resolveCommit(gitWorkdir, input.commit);
    const handoff: Handoff = {
      version: 1,
      id: randomUUID(),
      runId: this.runId,
      from: input.from,
      to: input.to,
      task: input.task.slice(0, 200),
      commit,
      summary: input.summary.slice(0, 10_000),
      createdAt: new Date().toISOString(),
    };
    const inbox = path.join(this.root, input.to, 'inbox');
    fs.mkdirSync(inbox, { recursive: true });
    const destination = path.join(inbox, `${handoff.createdAt.replace(/[:.]/g, '-')}-${handoff.id}.json`);
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(handoff, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, destination);
    return handoff;
  }

  receive(role: string): Handoff[] {
    const inbox = path.join(this.root, role, 'inbox');
    if (!fs.existsSync(inbox)) return [];
    return fs.readdirSync(inbox)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(inbox, file), 'utf8')) as Handoff);
  }
}
