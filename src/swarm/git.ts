import fs from 'node:fs';
import path from 'node:path';
import { spawnWithTimeout } from '../platforms/process.js';

async function git(args: string[], cwd: string) {
  const result = await spawnWithTimeout('git', args, 30_000, cwd, false);
  if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

export async function repositoryRoot(workdir: string) {
  return path.resolve(await git(['rev-parse', '--show-toplevel'], workdir));
}

export async function resolveCommit(workdir: string, revision = 'HEAD') {
  const commit = await git(['rev-parse', '--verify', `${revision}^{commit}`], workdir);
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error(`Invalid commit resolved for ${revision}`);
  return commit.toLowerCase();
}

export class WorktreeManager {
  private readonly root: string;
  constructor(private readonly repository: string, runId: string) {
    this.root = path.join(repository, '.muse', 'worktrees', runId);
  }

  async create(role: string, revisions: string[] = []): Promise<string> {
    const target = path.join(this.root, role);
    if (fs.existsSync(target)) throw new Error(`Worktree already exists: ${target}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const branch = `muse/${path.basename(this.root)}/${role}`;
    const base = revisions[0] || 'HEAD';
    await git(['worktree', 'add', '-b', branch, target, base], this.repository);
    for (const revision of revisions.slice(1)) {
      const ancestor = await spawnWithTimeout('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], 30_000, target, false);
      if (ancestor.code === 0) continue;
      await git(['-c', 'user.name=Muse Swarm', '-c', 'user.email=muse@localhost', 'merge', '--no-edit', revision], target);
    }
    return target;
  }
}
