import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexPlan, codexPlanner } from '../server/codex.ts';

test('CLI transport excludes API credentials and inherited config; tools and aborts fail without accepting a plan', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'moonjelly-cli-contract-')), previousPath = process.env.PATH, previousKey = process.env.OPENAI_API_KEY;
  try {
    const executable = join(folder, 'codex');
    await writeFile(executable, `#!${process.execPath}
const fs = require('fs'), args = process.argv.slice(2);
if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) process.exit(20);
if (args[0] === 'login') { console.log(fs.existsSync(__dirname+'/api-key-login') ? 'Logged in using an API key' : 'Logged in using ChatGPT'); process.exit(0); }
for (const flag of ['--ignore-user-config','--ignore-rules','--ephemeral','--output-schema']) if (!args.includes(flag)) process.exit(21);
if (args[args.indexOf('--sandbox') + 1] !== 'read-only') process.exit(22);
if (!args.includes('forced_login_method="chatgpt"')) process.exit(23);
let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => {
 console.log(JSON.stringify({type:'thread.started',thread_id:'contract-thread'}));
 if (input.includes('TOOL_CASE')) { console.log(JSON.stringify({type:'item.started',item:{type:'command_execution'}})); setInterval(()=>{},1000); return; }
 if (input.includes('ABORT_CASE')) { setInterval(()=>{},1000); return; }
 fs.writeFileSync(args[args.indexOf('--output-last-message')+1], JSON.stringify({summary:'No changes.',operations:[]}));
});
`);
    await chmod(executable, 0o700); process.env.PATH = `${folder}:${previousPath}`; process.env.OPENAI_API_KEY = 'synthetic-do-not-forward';
    assert.equal((await codexPlanner()).available, true);
    let thread = ''; const controller = new AbortController();
    assert.deepEqual(await runCodexPlan({ instruction: 'No changes.', words: [] }, controller.signal, id => { thread = id; }), { summary: 'No changes.', operations: [] }); assert.equal(thread, 'contract-thread');
    await assert.rejects(runCodexPlan({ instruction: 'TOOL_CASE', words: [] }, controller.signal, () => {}), /unsupported tool action/);
    const abort = new AbortController(); const running = runCodexPlan({ instruction: 'ABORT_CASE', words: [] }, abort.signal, () => abort.abort());
    await assert.rejects(running, /Cancelled/);
    await writeFile(join(folder, 'api-key-login'), 'synthetic authentication switch');
    await assert.rejects(runCodexPlan({ instruction: 'Must not run with API login.', words: [] }, controller.signal, () => {}), /API-key authentication is disabled/);
  } finally {
    process.env.PATH = previousPath;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    await rm(folder, { recursive: true, force: true });
  }
});
