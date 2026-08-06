import { runAgent } from '../agent.js';
export async function spawnSubagent(task: string, workdir: string, parentContext: string){
  console.log('\n[Subagent] Spawning: '+task+'\n');
  return await runAgent({ task, workdir, systemExtra: 'You are a subagent. Parent: '+parentContext+'. Focus ONLY on your task.', isSubagent: true });
}
