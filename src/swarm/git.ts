import fs from 'node:fs';
import path from 'node:path';
import { spawnWithTimeout } from '../platforms/process.js';

async function git(args: string[], cwd: string) {
  const result = await spawnWithTimeout('git', args, 30_000, cwd, false);
  if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

export async function worktreeChanges(workdir: string) {
  const output = await git(['status', '--porcelain'], workdir);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

export async function worktreeIsClean(workdir: string) {
  return (await worktreeChanges(workdir)).length === 0;
}

export function formatWorktreeChanges(changes: string[], limit = 20) {
  const shown = changes.slice(0, limit).map((change) => `  ${change}`).join('\n');
  const remaining = changes.length - Math.min(changes.length, limit);
  return `${shown}${remaining ? `\n  … and ${remaining} more` : ''}`;
}

export async function promoteCommit(workdir: string, commit: string) {
  const changes = await worktreeChanges(workdir);
  if (changes.length) throw new Error(
    `Promotion requires a clean target worktree: ${await repositoryRoot(workdir)}\nChanged paths:\n${formatWorktreeChanges(changes)}`,
  );
  const canonical = await resolveCommit(workdir, commit);
  const ancestor = await spawnWithTimeout('git', ['merge-base', '--is-ancestor', canonical, 'HEAD'], 30_000, workdir, false);
  if (ancestor.code === 0) return { commit: canonical, changed: false };
  await git(['-c', 'user.name=Zeal Swarm', '-c', 'user.email=zeal@localhost', 'merge', '--no-ff', '--no-edit', canonical], workdir);
  return { commit: canonical, changed: true };
}

export async function removeWorktree(repository: string, worktree: string) {
  const root = await repositoryRoot(repository);
  const target = fs.realpathSync.native(path.resolve(worktree));
  const allowedRoot = fs.realpathSync.native(path.join(root, '.zeal', 'worktrees'));
  const relative = path.relative(allowedRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove worktree ${target} outside ${allowedRoot} (relative: ${relative})`);
  }
  const changes = await worktreeChanges(target);
  if (changes.length) throw new Error(
    `Refusing to remove dirty worktree: ${target}\nChanged paths:\n${formatWorktreeChanges(changes)}`,
  );
  await git(['worktree', 'remove', target], root);
}

export async function repositoryRoot(workdir: string) {
  return path.resolve(await git(['rev-parse', '--show-toplevel'], workdir));
}

export async function pathIsIgnored(repository: string, candidate: string) {
  const relative = path.relative(path.resolve(repository), path.resolve(candidate)).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../')) return false;
  const gitPath = fs.statSync(candidate).isDirectory() ? `${relative}/` : relative;
  const result = await spawnWithTimeout('git', ['check-ignore', '-q', '--', gitPath], 30_000, repository, false);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new Error(`git check-ignore failed: ${(result.stderr || result.stdout).trim()}`);
}

export async function resolveCommit(workdir: string, revision = 'HEAD') {
  const commit = await git(['rev-parse', '--verify', `${revision}^{commit}`], workdir);
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error(`Invalid commit resolved for ${revision}`);
  return commit.toLowerCase();
}

export class WorktreeManager {
  private readonly root: string;
  constructor(private readonly repository: string, runId: string) {
    this.root = path.join(repository, '.zeal', 'worktrees', runId);
  }

  async create(role: string, revisions: string[] = []): Promise<string> {
    const target = path.join(this.root, role);
    if (fs.existsSync(target)) throw new Error(`Worktree already exists: ${target}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const branch = `zeal/${path.basename(this.root)}/${role}`;
    const base = revisions[0] || 'HEAD';
    await git(['worktree', 'add', '-b', branch, target, base], this.repository);
    for (const revision of revisions.slice(1)) {
      const ancestor = await spawnWithTimeout('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], 30_000, target, false);
      if (ancestor.code === 0) continue;
      await git(['-c', 'user.name=Zeal Swarm', '-c', 'user.email=zeal@localhost', 'merge', '--no-edit', revision], target);
    }
    return target;
  }
}
