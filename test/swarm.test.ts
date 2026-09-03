import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { loadSwarmConfig } from '../src/swarm/config.js';
import { HandoffStore } from '../src/swarm/handoffs.js';
import { formatWorktreeChanges, resolveCommit, WorktreeManager, worktreeChanges } from '../src/swarm/git.js';
import { cleanupSwarmRun, promoteSwarmRole } from '../src/swarm/lifecycle.js';
import { RunStore, type SwarmRunRecord } from '../src/swarm/runs.js';
import { inspectSwarmWorkspace } from '../src/swarm/runner.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'muse-swarm-')); }
function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function repository() {
  const root = tempDir();
  git(root, 'init');
  git(root, 'config', 'user.name', 'Muse Test');
  git(root, 'config', 'user.email', 'muse-test@localhost');
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.muse/\nworkdir/\n');
  git(root, 'add', 'README.md', '.gitignore');
  git(root, 'commit', '-m', 'base');
  return root;
}

test('loads and validates an acyclic swarm topology', () => {
  const root = tempDir();
  const file = path.join(root, 'swarm.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, roles: [
    { id: 'coder', model: 'qwen/coder', prompt: 'Implement it' },
    { id: 'reviewer', model: 'kimi/reviewer', prompt: 'Review it', dependsOn: ['coder'], receive: 'batch', maxAttempts: 2,
      gates: [{ name: 'tests', command: 'npm test', timeoutMs: 5000 }] },
  ] }));
  const config = loadSwarmConfig(file);
  assert.equal(config.roles[0].workspace, 'worktree');
  assert.deepEqual(config.roles[1].dependsOn, ['coder']);
  assert.equal(config.roles[1].maxAttempts, 2);
  assert.equal(config.roles[1].gates[0].name, 'tests');
  fs.writeFileSync(file, JSON.stringify({ version: 1, roles: [
    { id: 'one', model: 'qwen/a', prompt: 'one', dependsOn: ['two'] },
    { id: 'two', model: 'qwen/b', prompt: 'two', dependsOn: ['one'] },
  ] }));
  assert.throws(() => loadSwarmConfig(file), /cycle/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('promotes passed role commits and safely cleans their worktrees', async () => {
  const root = repository();
  const runId = '20260902010101-123';
  const manager = new WorktreeManager(root, runId);
  const coder = await manager.create('coder');
  fs.writeFileSync(path.join(coder, 'feature.txt'), 'ready\n');
  git(coder, 'add', 'feature.txt');
  git(coder, 'commit', '-m', 'ready for promotion');
  const commit = await resolveCommit(coder);
  const run: SwarmRunRecord = {
    version: 1, runId, task: 'feature', repository: root, status: 'passed',
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    roles: [{ role: 'coder', status: 'passed', workdir: coder, commit, attempt: 1, gates: [] }],
  };
  new RunStore(root, runId).write(run);
  const promoted = await promoteSwarmRole(root, runId, 'coder');
  assert.equal(promoted.changed, true);
  assert.equal(fs.readFileSync(path.join(root, 'feature.txt'), 'utf8').trim(), 'ready');
  fs.writeFileSync(path.join(coder, 'uncommitted.txt'), 'preserve me\n');
  await assert.rejects(() => cleanupSwarmRun(root, runId), /dirty worktree/);
  fs.unlinkSync(path.join(coder, 'uncommitted.txt'));
  const cleaned = await cleanupSwarmRun(root, runId);
  assert.deepEqual(cleaned.removed, [coder]);
  assert.equal(fs.existsSync(coder), false);
  assert.match(git(root, 'branch', '--list', `muse/${runId}/coder`), /muse\//);
  fs.rmSync(root, { recursive: true, force: true });
});

test('creates isolated worktrees from verified upstream commits', async () => {
  const root = repository();
  const upstream = new WorktreeManager(root, 'upstream-run');
  const coder = await upstream.create('coder');
  fs.writeFileSync(path.join(coder, 'feature.txt'), 'implemented\n');
  git(coder, 'add', 'feature.txt');
  git(coder, 'commit', '-m', 'implement feature');
  const commit = await resolveCommit(coder);

  const downstream = new WorktreeManager(root, 'downstream-run');
  const reviewer = await downstream.create('reviewer', [commit]);
  assert.equal(fs.readFileSync(path.join(reviewer, 'feature.txt'), 'utf8').trim(), 'implemented');
  assert.equal(await resolveCommit(reviewer), commit);
  fs.rmSync(root, { recursive: true, force: true });
});

test('writes atomic handoffs with canonical commits', async () => {
  const root = repository();
  const store = new HandoffStore(root, 'run-1');
  const expected = await resolveCommit(root);
  const delivered = await store.deliver({
    from: 'coder', to: 'reviewer', task: 'review', commit: 'HEAD', summary: 'Implemented and tested',
  }, root);
  assert.equal(delivered.commit, expected);
  assert.deepEqual(store.receive('reviewer'), [delivered]);
  assert.deepEqual(store.receive('coder'), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('reports exact dirty paths for actionable worktree diagnostics', async () => {
  const root = repository();
  fs.writeFileSync(path.join(root, 'README.md'), 'changed\n');
  fs.writeFileSync(path.join(root, 'scratch.txt'), 'new\n');
  const changes = await worktreeChanges(root);
  assert.equal(changes.length, 2);
  const diagnostic = formatWorktreeChanges(changes);
  assert.match(diagnostic, /README\.md/);
  assert.match(diagnostic, /scratch\.txt/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('rejects an ignored placeholder rather than silently targeting its parent repository', async () => {
  const root = repository();
  const nested = path.join(root, 'workdir');
  fs.mkdirSync(nested);
  const isolated = {
    version: 1 as const,
    roles: [{ id: 'researcher', model: { provider: 'kimi', model: 'test' }, prompt: 'Research',
      dependsOn: [], workspace: 'worktree' as const, receive: 'task' as const, gates: [], maxAttempts: 1 }],
  };
  await assert.rejects(() => inspectSwarmWorkspace(isolated, nested), (error: Error) => {
    assert.match(error.message, /ignored directory/);
    assert.match(error.message, /Clone or initialize/);
    assert.match(error.message, /WORKDIR=/);
    return true;
  });
  git(nested, 'init');
  git(nested, 'config', 'user.name', 'Nested Test');
  git(nested, 'config', 'user.email', 'nested@localhost');
  fs.writeFileSync(path.join(nested, 'nested.txt'), 'nested repository\n');
  git(nested, 'add', 'nested.txt');
  git(nested, 'commit', '-m', 'nested base');
  const inspected = await inspectSwarmWorkspace(isolated, nested);
  assert.equal(
    path.normalize(inspected.repository).toLowerCase(),
    path.normalize(fs.realpathSync.native(nested)).toLowerCase(),
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('allows dirty parent checkout for isolated swarms but explains shared blockers', async () => {
  const root = repository();
  fs.writeFileSync(path.join(root, 'local-notes.txt'), 'uncommitted\n');
  const isolated = {
    version: 1 as const,
    roles: [{ id: 'researcher', model: { provider: 'kimi', model: 'test' }, prompt: 'Research',
      dependsOn: [], workspace: 'worktree' as const, receive: 'task' as const, gates: [], maxAttempts: 1 }],
  };
  const inspected = await inspectSwarmWorkspace(isolated, root);
  assert.match(inspected.localChanges.join('\n'), /local-notes\.txt/);
  const shared = { ...isolated, roles: [{ ...isolated.roles[0], workspace: 'shared' as const }] };
  await assert.rejects(() => inspectSwarmWorkspace(shared, root), (error: Error) => {
    assert.match(error.message, /Shared roles: researcher/);
    assert.match(error.message, /local-notes\.txt/);
    assert.match(error.message, /workspace "worktree"/);
    return true;
  });
  fs.rmSync(root, { recursive: true, force: true });
});
