import type { ModelSelection } from './models.js';

export type AgentStatus = 'running' | 'completed' | 'failed';
export type AgentRecord = {
  id: string;
  task: string;
  selection: ModelSelection;
  status: AgentStatus;
  result?: string;
  error?: string;
};

export class AgentCoordinator {
  private sequence = 0;
  private readonly records = new Map<string, AgentRecord>();
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly inboxes = new Map<string, string[]>();

  constructor(private readonly maxConcurrent = 4) {}

  spawn(task: string, selection: ModelSelection, runner: (id: string) => Promise<string>): AgentRecord {
    const running = [...this.records.values()].filter((agent) => agent.status === 'running').length;
    if (running >= this.maxConcurrent) throw new Error(`Agent concurrency limit (${this.maxConcurrent}) reached`);
    const id = `agent-${++this.sequence}`;
    const record: AgentRecord = { id, task, selection, status: 'running' };
    this.records.set(id, record);
    this.inboxes.set(id, []);
    const job = runner(id).then(
      (result) => { record.result = result; record.status = 'completed'; },
      (error) => { record.error = error?.message || String(error); record.status = 'failed'; },
    );
    this.jobs.set(id, job);
    return { ...record };
  }

  list(): AgentRecord[] { return [...this.records.values()].map((record) => ({ ...record })); }

  send(id: string, message: string) {
    const inbox = this.inboxes.get(id);
    if (!inbox) throw new Error(`Unknown agent: ${id}`);
    inbox.push(message);
    return { delivered: true };
  }

  drain(id: string) { return this.inboxes.get(id)?.splice(0) ?? []; }

  async wait(ids?: string[]) {
    const selected = ids?.length ? ids : [...this.jobs.keys()];
    await Promise.all(selected.map(async (id) => {
      const job = this.jobs.get(id);
      if (!job) throw new Error(`Unknown agent: ${id}`);
      await job;
    }));
    return selected.map((id) => ({ ...this.records.get(id)! }));
  }
}
