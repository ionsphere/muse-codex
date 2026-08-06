import fs from 'fs';
import path from 'path';
import * as Diff from 'diff';
export function detectLineEnding(s: string): '\n' | '\r\n' { return s.includes('\r\n') ? '\r\n' : '\n'; }
export async function readFileTool(filePath: string, workdir: string) {
  const full = path.resolve(workdir, filePath);
  if (!fs.existsSync(full)) throw new Error('File not found: ' + filePath);
  const data = fs.readFileSync(full, 'utf8');
  return { path: filePath, content: data.slice(0, 20000), eol: detectLineEnding(data) };
}
export async function applyPatchTool(patch: string, workdir: string) {
  const lines = patch.split('\n'); let cur = ''; let buf = '';
  const apply = async () => { if(cur && buf) await applySingle(cur, buf, workdir); };
  for (const line of lines) {
    if (line.startsWith('*** Update File:')) { await apply(); cur = line.replace('*** Update File:', '').trim(); buf=''; }
    else if (line.startsWith('*** Begin Patch') || line.startsWith('*** End Patch')) continue;
    else buf += line + '\n';
  }
  await apply(); return { ok: true };
}
async function applySingle(filePath: string, uniDiff: string, workdir: string) {
  const full = path.resolve(workdir, filePath);
  const exists = fs.existsSync(full);
  const original = exists ? fs.readFileSync(full, 'utf8') : '';
  const eol = exists ? detectLineEnding(original) : '\n';
  const origLF = original.replace(/\r\n/g, '\n');
  let patched = origLF;
  if (uniDiff.includes('@@') || uniDiff.includes('---')) {
    const r = Diff.applyPatch(origLF, uniDiff);
    if (r===false) throw new Error('Patch failed for '+filePath);
    patched = r;
  } else { patched = uniDiff; }
  if (eol==='\r\n') patched = patched.replace(/\n/g, '\r\n');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, patched, 'utf8');
}
export async function globTool(pattern: string, workdir: string) {
  const { execSync } = require('child_process');
  try {
    const out = execSync(`wsl bash -c "cd '${workdir}' && git ls-files 2>/dev/null | grep -E '${pattern.replace('*','.*')}' || find . -type f | head -n 200"`, { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).slice(0,200);
  } catch { return []; }
}
export async function grepTool(query: string, workdir: string) {
  const { execSync } = require('child_process');
  try {
    const cmd = `wsl bash -c "cd '${workdir}' && grep -R -n '${query}' . 2>/dev/null | head -n 100"`;
    return execSync(cmd, { encoding: 'utf8' });
  } catch(e:any){ return e.stdout?.toString() || ''; }
}
