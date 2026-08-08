import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyPatchTool, globTool, grepTool, readFileTool } from '../src/tools/fs-tools.js';

function tempWorkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'muse-codex-'));
}

test('filesystem tools stay inside workdir and support patch lifecycle', async () => {
  const workdir = tempWorkdir();
  try {
    fs.writeFileSync(path.join(workdir, 'hello.txt'), 'alpha\nbeta\n', 'utf8');

    await applyPatchTool(`*** Begin Patch
*** Update File: hello.txt
@@
 alpha
-beta
+gamma
*** Add File: nested/new.ts
+export const value = 42;
*** End Patch`, workdir);

    assert.equal(fs.readFileSync(path.join(workdir, 'hello.txt'), 'utf8'), 'alpha\ngamma\n');
    assert.equal(fs.readFileSync(path.join(workdir, 'nested/new.ts'), 'utf8'), 'export const value = 42;\n');

    const files = await globTool('**/*.ts', workdir);
    assert.deepEqual(files, ['nested/new.ts']);
    assert.match(await grepTool('gamma', workdir), /hello\.txt:2:gamma/);

    await applyPatchTool(`*** Begin Patch
*** Delete File: nested/new.ts
*** End Patch`, workdir);
    assert.equal(fs.existsSync(path.join(workdir, 'nested/new.ts')), false);

    await assert.rejects(() => readFileTool('../outside.txt', workdir), /escapes workdir/);
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});
