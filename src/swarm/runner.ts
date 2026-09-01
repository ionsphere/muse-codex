import path from 'node:path';
import { runAgent } from '../agent.js';
import { AgentCoordinator } from '../coordinator.js';
import { config as runtimeConfig } from '../config.js';
import type { SwarmConfig, SwarmRole } from './config.js';
import { HandoffStore, type Handoff } from './handoffs.js';
import { repositoryRoot, resolveCommit, WorktreeManager } from './git.js';

export type SwarmRunResult = { runId: string; roles: Array<{ role: string; result: string; workdir: string; commit: string }> };

export async function runSwarm(config: SwarmConfig, task: string, workdir: string): Promise<SwarmRunResult> {
  const repository = await repositoryRoot(workdir);
  const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${process.pid}`;
  const worktrees = new WorktreeManager(repository, runId);
  const handoffs = new HandoffStore(repository, runId);
  const pending = new Map(config.roles.map((role) => [role.id, role]));
  const completed = new Set<string>();
  const results: SwarmRunResult['roles'] = [];

  while (pending.size) {
    const ready = [...pending.values()].filter((role) => role.dependsOn.every((id) => completed.has(id)));
    if (!ready.length) throw new Error('No runnable swarm roles remain');
    const isolated = ready.filter((role) => role.workspace === 'worktree');
    const shared = ready.filter((role) => role.workspace === 'shared');
    const layer = await mapBounded(isolated, runtimeConfig.maxAgents, (role) =>
      runRole(role, task, repository, worktrees, handoffs));
    for (const role of shared) layer.push(await runRole(role, task, repository, worktrees, handoffs));
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
  }
  return { runId, roles: results };
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
) {
  const incoming = handoffs.receive(role.id);
  const roleWorkdir = role.workspace === 'shared'
    ? repository
    : await worktrees.create(role.id, incoming.map((handoff) => handoff.commit));
  const prompt = buildRoleTask(role, task, incoming);
  const result = await runAgent({
    task: prompt,
    workdir: roleWorkdir,
    selection: role.model,
    coordinator: new AgentCoordinator(),
    systemExtra: `Your swarm role is ${role.id}. ${role.prompt}`,
    isSubagent: true,
  });
  const commit = await resolveCommit(roleWorkdir);
  return { role: role.id, result, workdir: path.resolve(roleWorkdir), commit };
}

function buildRoleTask(role: SwarmRole, task: string, handoffs: Handoff[]) {
  if (!handoffs.length) return task;
  const selected = role.receive === 'task' ? handoffs.slice(0, 1) : handoffs;
  const context = selected.map((handoff) =>
    `From ${handoff.from} at commit ${handoff.commit}:\n${handoff.summary}`,
  ).join('\n\n');
  return `${task}\n\nValidated upstream handoffs:\n${context}`;
}
