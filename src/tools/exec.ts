import { spawn } from 'child_process';
import os from 'os';
export type ExecResult = { stdout: string; stderr: string; code: number|null; timedOut: boolean; };
function isWin(){ return os.platform()==='win32'; }
export async function runCommandTool(cmd: string, workdir: string, timeoutMs: number): Promise<ExecResult> {
  const useWsl = isWin();
  const shellCmd = useWsl ? ['wsl','bash','-lc', `cd "${workdir.replace(/"/g,'\"')}" && ${cmd}`] : ['bash','-lc',cmd];
  return new Promise((resolve)=>{
    let stdout='', stderr='', timedOut=false;
    const child = spawn(shellCmd[0], shellCmd.slice(1), { cwd: workdir, windowsHide: true });
    const timer = setTimeout(()=>{ timedOut=true; child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),5000); }, timeoutMs);
    child.stdout.on('data', d=>{ const s=d.toString(); stdout+=s; process.stdout.write(s); });
    child.stderr.on('data', d=>{ const s=d.toString(); stderr+=s; process.stderr.write(s); });
    child.on('close', code=>{ clearTimeout(timer); resolve({ stdout: stdout.slice(-20000), stderr: stderr.slice(-20000), code, timedOut }); });
    child.on('error', err=>{ clearTimeout(timer); resolve({ stdout, stderr: stderr+'\n'+(err as Error).message, code:1, timedOut }); });
  });
}
