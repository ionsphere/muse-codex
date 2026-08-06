import { config } from './config.js';
import { Journal } from './tools/journal.js';
import { readFileTool, applyPatchTool, globTool, grepTool } from './tools/fs-tools.js';
import { runCommandTool } from './tools/exec.js';
import { spawnSubagent } from './tools/subagent.js';

const TOOLS = [
  { name: 'read_file', description: 'Read file' },
  { name: 'glob', description: 'Find files' },
  { name: 'grep', description: 'Search' },
  { name: 'apply_patch', description: 'Apply Codex-style patch' },
  { name: 'run_command', description: 'Run shell via WSL' },
  { name: 'spawn_subagent', description: 'Parallel subagent' },
];

function sysPrompt(wd: string, extra=''){
  return `You are Muse Code harness running ${config.model} on Windows+WSL.
Workdir: ${wd}
Rules: use tools to explore, patch, verify. Always run tests after edit. Use spawn_subagent for parallel work. Never rm -rf outside workdir. On Windows use ls not dir, bash syntax.
${extra}
Tools: ${TOOLS.map(t=>t.name).join(', ')}`;
}

export async function runAgent(opts: {task:string; workdir:string; systemExtra?:string; isSubagent?:boolean;}){
  const journal = new Journal(opts.workdir);
  if(!opts.isSubagent){
    console.log(`\n=== Muse Harness (${config.model}) === Workdir: ${opts.workdir} Task: ${opts.task}`);
    const prev = journal.readAll(); if(prev.length) console.log(`Resuming with ${prev.length} entries`);
  }
  let messages:any[] = [{role:'system', content: sysPrompt(opts.workdir, opts.systemExtra)}, {role:'user', content: opts.task}];
  for(let step=0; step<config.maxSteps; step++){
    const resp = await callLlama(messages);
    const content = resp.content; if(!content) break;
    console.log(`\n[Step ${step+1}] ${content.slice(0,800)}\n`);
    messages.push({role:'assistant', content});
    journal.append({ts: new Date().toISOString(), role:'assistant', content} as any);
    const toolCalls = resp.tool_calls || parsePatches(content);
    if(toolCalls.length===0){ if(content.includes('TASK_DONE')) break; continue; }
    for(const tc of toolCalls){
      let result:any;
      try{
        switch(tc.name){
          case 'read_file': result = await readFileTool(tc.args.path, opts.workdir); break;
          case 'glob': result = await globTool(tc.args.pattern, opts.workdir); break;
          case 'grep': result = await grepTool(tc.args.query, opts.workdir); break;
          case 'apply_patch': result = await applyPatchTool(tc.args.patch, opts.workdir); break;
          case 'run_command': result = await runCommandTool(tc.args.cmd, opts.workdir, config.commandTimeoutMs); break;
          case 'spawn_subagent': result = await spawnSubagent(tc.args.task, opts.workdir, opts.task); break;
          default: result={error:'unknown'};
        }
      }catch(e:any){ result={error:e.message}; }
      const msg = `Tool ${tc.name} result: ${JSON.stringify(result).slice(0,8000)}`;
      messages.push({role:'user', content: msg});
      journal.append({ts: new Date().toISOString(), role:'tool', tool: tc.name, args: tc.args, result} as any);
    }
  }
  return messages[messages.length-1]?.content;
}
function parsePatches(text:string){
  const calls:any[]=[]; const m=text.match(/\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/);
  if(m) calls.push({name:'apply_patch', args:{patch:m[0]}});
  return calls;
}
async function callLlama(messages:any[]){
  if(!config.apiKey){
    return {content: `MOCK MODE (set LLAMA_API_KEY). Would call ${config.model}. Flow: glob -> read_file -> apply_patch -> run_command -> TASK_DONE`, tool_calls:[]};
  }
  const res = await fetch(`${config.apiBase}/chat/completions`, {
    method:'POST',
    headers:{'Authorization':`Bearer ${config.apiKey}`, 'Content-Type':'application/json'},
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: [{type:'function', function:{name:'read_file', description:'Read', parameters:{type:'object', properties:{path:{type:'string'}}, required:['path']}}},
              {type:'function', function:{name:'glob', parameters:{type:'object', properties:{pattern:{type:'string'}}, required:['pattern']}}},
              {type:'function', function:{name:'grep', parameters:{type:'object', properties:{query:{type:'string'}}, required:['query']}}},
              {type:'function', function:{name:'apply_patch', parameters:{type:'object', properties:{patch:{type:'string'}}, required:['patch']}}},
              {type:'function', function:{name:'run_command', parameters:{type:'object', properties:{cmd:{type:'string'}}, required:['cmd']}}},
              {type:'function', function:{name:'spawn_subagent', parameters:{type:'object', properties:{task:{type:'string'}}, required:['task']}}}],
    })
  });
  const data:any = await res.json();
  const ch = data.choices?.[0]?.message;
  return {content: ch?.content||'', tool_calls: ch?.tool_calls?.map((c:any)=>({name:c.function.name, args: JSON.parse(c.function.arguments)}))||[]};
}
