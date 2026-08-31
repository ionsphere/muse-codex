import { runAgent } from '../agent.js';
import type { AgentCoordinator } from '../coordinator.js';
import type { ModelSelection } from '../models.js';

export function spawnSubagent(task: string, workdir: string, parentContext: string, coordinator: AgentCoordinator, selection: ModelSelection, parentId?: string){
  console.log('\n[Subagent] Spawning: '+task+'\n');
  return coordinator.spawn(task, selection, (agentId) => runAgent({
    task,
    workdir,
    selection,
    coordinator,
    agentId,
    systemExtra: `You are subagent ${agentId}${parentId ? ` of ${parentId}` : ''}. Parent task: ${parentContext}. Focus ONLY on your task and report a concise result.`,
    isSubagent: true,
  }));
}
