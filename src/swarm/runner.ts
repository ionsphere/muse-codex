import path from 'node:path';
import { runAgent } from '../agent.js';
import { AgentCoordinator } from '../coordinator.js';
import { config as runtimeConfig } from '../config.js';
import type { SwarmConfig, SwarmRole } from './config.js';
import { HandoffStore, type Handoff } from './handoffs.js';
import { repositoryRoot, resolveCommit, WorktreeManager, worktreeIsClean } from './git.js';
import { gateFailurePrompt, runQualityGates, type GateResult } from './gates.js';
import { RunStore, type RoleRunRecord, type SwarmRunRecord } from './runs.js';

export type SwarmRunResult = { runId: string; roles: Array<{ role: string; result: string; workdir: string; commit: string }> };

export async function runSwarm(config: SwarmConfig, task: string, workdir: string): Promise<SwarmRunResult> {
  const repository = await repositoryRoot(workdir);
  if (!await worktreeIsClean(repository)) throw new Error('Swarm runs require a clean repository worktree');
  const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${process.pid}`;
  const worktrees = new WorktreeManager(repository, runId);
  const handoffs = new HandoffStore(repository, runId);
  const pending = new Map(config.roles.map((role) => [role.id, role]));
  const completed = new Set<string>();
  const results: SwarmRunResult['roles'] = [];
  const record: SwarmRunRecord = {
    version: 1, runId, task, repository, status: 'running', startedAt: new Date().toISOString(),
    roles: config.roles.map((role) => ({ role: role.id, status: 'running', attempt: 0, gates: [] })),
  };
  const store = new RunStore(repository, runId);
  store.write(record);

  try { while (pending.size) {
    const ready = [...pending.values()].filter((role) => role.dependsOn.every((id) => completed.has(id)));
    if (!ready.length) throw new Error('No runnable swarm roles remain');
    const isolated = ready.filter((role) => role.workspace === 'worktree');
    const shared = ready.filter((role) => role.workspace === 'shared');
    const layer = await mapBounded(isolated, runtimeConfig.maxAgents, (role) =>
      runRole(role, task, repository, worktrees, handoffs, roleRecord(record, role.id), store, record));
    for (const role of shared) layer.push(await runRole(
      role, task, repository, worktrees, handoffs, roleRecord(record, role.id), store, record));
    for (const result of layer) {
      results.push(result);
      completed.add(result.role);
      pending.delete(result.role);
      for (const consumer of config.roles.filter((role) => role.dependsOn.includes(result.role))) {
        await handoffs.deliver({
          from: result.role,
          to: consumer.id,
          task,
          commit: result.commit,
          summary: result.result,
        }, result.workdir);
      }
    }
  }} catch (error: any) {
    record.status = 'failed';
    record.finishedAt = new Date().toISOString();
    store.write(record);
    throw error;
  }
  record.status = 'passed';
  record.finishedAt = new Date().toISOString();
  store.write(record);
  return { runId, roles: results };
}

function roleRecord(run: SwarmRunRecord, id: string) {
  return run.roles.find((role) => role.role === id)!;
}

async function mapBounded<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += Math.max(1, limit)) {
    results.push(...await Promise.all(items.slice(offset, offset + Math.max(1, limit)).map(run)));
  }
  return results;
}

async function runRole(
  role: SwarmRole,
  task: string,
  repository: string,
  worktrees: WorktreeManager,
  handoffs: HandoffStore,
  record: RoleRunRecord,
  store: RunStore,
  run: SwarmRunRecord,
) {
  const incoming = handoffs.receive(role.id);
  const roleWorkdir = role.workspace === 'shared'
    ? repository
    : await worktrees.create(role.id, incoming.map((handoff) => handoff.commit));
  record.workdir = path.resolve(roleWorkdir);
  store.write(run);
  let prompt = buildRoleTask(role, task, incoming);
  let result = '';
  try {
    for (let attempt = 1; attempt <= role.maxAttempts; attempt++) {
      record.attempt = attempt;
      store.write(run);
      result = await runAgent({
        task: prompt,
        workdir: roleWorkdir,
        selection: role.model,
        coordinator: new AgentCoordinator(),
        systemExtra: `Your swarm role is ${role.id}. ${role.prompt} Before reporting completion, commit all intended changes; the harness only hands off committed state.`,
        isSubagent: true,
      });
      const gates = await runQualityGates(role.gates, roleWorkdir);
      record.gates = gates;
      const failure = gateFailurePrompt(gates);
      const clean = await worktreeIsClean(roleWorkdir);
      if (!failure && clean) {
        const commit = await resolveCommit(roleWorkdir);
        record.commit = commit;
        record.status = 'passed';
        store.write(run);
        return { role: role.id, result, workdir: path.resolve(roleWorkdir), commit };
      }
      prompt = failure || 'The worktree has uncommitted changes. Review them, commit all intended changes, and verify the repository is clean.';
    }
    throw new Error(`Role ${role.id} exhausted ${role.maxAttempts} attempt(s)`);
  } catch (error: any) {
    record.status = 'failed';
    record.error = error?.message || String(error);
    store.write(run);
    throw error;
  }
}

function buildRoleTask(role: SwarmRole, task: string, handoffs: Handoff[]) {
  if (!handoffs.length) return task;
  const selected = role.receive === 'task' ? handoffs.slice(0, 1) : handoffs;
  const context = selected.map((handoff) =>
    `From ${handoff.from} at commit ${handoff.commit}:\n${handoff.summary}`,
  ).join('\n\n');
  return `${task}\n\nValidated upstream handoffs:\n${context}`;
}
