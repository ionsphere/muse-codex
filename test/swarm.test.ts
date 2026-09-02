import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { loadSwarmConfig } from '../src/swarm/config.js';
import { HandoffStore } from '../src/swarm/handoffs.js';
import { resolveCommit, WorktreeManager } from '../src/swarm/git.js';

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
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'base');
  return root;
}

test('loads and validates an acyclic swarm topology', () => {
  const root = tempDir();
  const file = path.join(root, 'swarm.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, roles: [
    { id: 'coder', model: 'qwen/coder', prompt: 'Implement it' },
    { id: 'reviewer', model: 'kimi/reviewer', prompt: 'Review it', dependsOn: ['coder'], receive: 'batch' },
  ] }));
  const config = loadSwarmConfig(file);
  assert.equal(config.roles[0].workspace, 'worktree');
  assert.deepEqual(config.roles[1].dependsOn, ['coder']);
  fs.writeFileSync(file, JSON.stringify({ version: 1, roles: [
    { id: 'one', model: 'qwen/a', prompt: 'one', dependsOn: ['two'] },
    { id: 'two', model: 'qwen/b', prompt: 'two', dependsOn: ['one'] },
  ] }));
  assert.throws(() => loadSwarmConfig(file), /cycle/);
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
