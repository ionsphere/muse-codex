import path from 'node:path';
import { promoteCommit, removeWorktree, repositoryRoot } from './git.js';
import { RunStore } from './runs.js';

export async function promoteSwarmRole(workdir: string, runId: string, roleId: string) {
  const repository = await repositoryRoot(workdir);
  const run = RunStore.read(repository, runId);
  const role = run.roles.find((item) => item.role === roleId);
  if (!role) throw new Error(`Run ${runId} has no role ${roleId}`);
  if (role.status !== 'passed' || !role.commit) throw new Error(`Role ${roleId} has no passed commit to promote`);
  return promoteCommit(repository, role.commit);
}

export async function cleanupSwarmRun(workdir: string, runId: string) {
  const repository = await repositoryRoot(workdir);
  const run = RunStore.read(repository, runId);
  const removed: string[] = [];
  for (const role of run.roles) {
    if (!role.workdir || path.resolve(role.workdir) === repository) continue;
    await removeWorktree(repository, role.workdir);
    removed.push(role.workdir);
  }
  return { runId, removed, branchesPreserved: true };
}
