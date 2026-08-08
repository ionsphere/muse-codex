import fs from 'node:fs';
import path from 'node:path';
import * as Diff from 'diff';

export function detectLineEnding(s: string): '\n' | '\r\n' {
  return s.includes('\r\n') ? '\r\n' : '\n';
}

function resolveInside(workdir: string, filePath: string): string {
  const root = path.resolve(workdir);
  const full = path.resolve(root, filePath);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workdir: ${filePath}`);
  }
  return full;
}

export async function readFileTool(filePath: string, workdir: string) {
  const full = resolveInside(workdir, filePath);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new Error(`File not found: ${filePath}`);
  }
  const data = fs.readFileSync(full, 'utf8');
  return { path: filePath, content: data.slice(0, 50_000), eol: detectLineEnding(data) };
}

type PatchOp = { kind: 'add' | 'update' | 'delete'; filePath: string; body: string[] };

export async function applyPatchTool(patchText: string, workdir: string) {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const operations: PatchOp[] = [];
  let current: PatchOp | undefined;

  for (const line of lines) {
    const match = line.match(/^\*\*\* (Add|Update|Delete) File:\s*(.+)$/);
    if (match) {
      if (current) operations.push(current);
      current = {
        kind: match[1].toLowerCase() as PatchOp['kind'],
        filePath: match[2].trim(),
        body: [],
      };
      continue;
    }
    if (line === '*** Begin Patch' || line === '*** End Patch') continue;
    if (current) current.body.push(line);
  }
  if (current) operations.push(current);
  if (!operations.length) throw new Error('Patch contains no file operations');

  for (const op of operations) {
    const full = resolveInside(workdir, op.filePath);
    if (op.kind === 'delete') {
      if (!fs.existsSync(full)) throw new Error(`Cannot delete missing file: ${op.filePath}`);
      fs.unlinkSync(full);
      continue;
    }

    if (op.kind === 'add') {
      if (fs.existsSync(full)) throw new Error(`Cannot add existing file: ${op.filePath}`);
      const content = op.body.map((line) => line.startsWith('+') ? line.slice(1) : line).join('\n');
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content.replace(/\n$/, '') + '\n', 'utf8');
      continue;
    }

    if (!fs.existsSync(full)) throw new Error(`Cannot update missing file: ${op.filePath}`);
    const original = fs.readFileSync(full, 'utf8');
    const eol = detectLineEnding(original);
    let content = original.replace(/\r\n/g, '\n');
    const body = op.body.join('\n');

    if (/^--- /m.test(body) && /^\+\+\+ /m.test(body)) {
      const patched = Diff.applyPatch(content, body);
      if (patched === false) throw new Error(`Unified patch failed for ${op.filePath}`);
      content = patched;
    } else {
      const hunks = body.split(/^@@.*$/m).filter((hunk) => hunk.trim().length > 0);
      if (!hunks.length) throw new Error(`Update has no hunks for ${op.filePath}`);
      for (const hunk of hunks) {
        const hunkLines = hunk.replace(/^\n/, '').replace(/\n$/, '').split('\n');
        const before = hunkLines
          .filter((line) => line.startsWith(' ') || line.startsWith('-'))
          .map((line) => line.slice(1))
          .join('\n');
        const after = hunkLines
          .filter((line) => line.startsWith(' ') || line.startsWith('+'))
          .map((line) => line.slice(1))
          .join('\n');
        const index = content.indexOf(before);
        if (index < 0) throw new Error(`Patch context not found in ${op.filePath}`);
        content = content.slice(0, index) + after + content.slice(index + before.length);
      }
    }

    if (eol === '\r\n') content = content.replace(/\n/g, '\r\n');
    fs.writeFileSync(full, content, 'utf8');
  }

  return { ok: true, files: operations.map((op) => ({ path: op.filePath, operation: op.kind })) };
}

function walkFiles(workdir: string, limit = 2_000): string[] {
  const root = path.resolve(workdir);
  const results: string[] = [];
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next']);
  const stack = [root];

  while (stack.length && results.length < limit) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) results.push(path.relative(root, full).split(path.sep).join('/'));
      if (results.length >= limit) break;
    }
  }
  return results;
}

function globRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const source = escaped.replace(/\*\*/g, '§§DOUBLESTAR§§').replace(/\*/g, '[^/]*').replace(/§§DOUBLESTAR§§/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${source}$`);
}

export async function globTool(pattern: string, workdir: string) {
  const regex = globRegex(pattern);
  return walkFiles(workdir).filter((file) => regex.test(file)).slice(0, 200);
}

export async function grepTool(query: string, workdir: string) {
  const matches: string[] = [];
  for (const file of walkFiles(workdir)) {
    if (matches.length >= 100) break;
    let text: string;
    try {
      const buffer = fs.readFileSync(resolveInside(workdir, file));
      if (buffer.includes(0)) continue;
      text = buffer.toString('utf8');
    } catch { continue; }
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (line.includes(query)) matches.push(`${file}:${index + 1}:${line}`);
      if (matches.length >= 100) break;
    }
  }
  return matches.join('\n');
}
