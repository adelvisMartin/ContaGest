import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import process from 'node:process';
import { assertLabRunSafe, runLabScenario, type LabEvent, type LabScenario } from '../src/modules/hipico-bot/hipico-lab-simulator.js';
import { HIPICO_LAB_SCENARIOS, labScenarioById } from '../src/modules/hipico-bot/hipico-lab-scenarios.js';

function repoRoot() {
  return path.basename(process.cwd()) === 'backend' ? path.resolve(process.cwd(), '..') : process.cwd();
}
function candidateSha() {
  const value = String(process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'local-unbound').trim();
  return /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'local-unbound';
}
function writeArtifact(name: string, value: unknown) {
  const dir = path.join(repoRoot(), 'artifacts', 'qa', 'hipico-lab', candidateSha());
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
}

function runScenario(id: string) {
  const scenario = labScenarioById(id);
  if (!scenario) throw new Error(`Escenario LAB desconocido: ${id}`);
  const result = runLabScenario(scenario);
  const target = writeArtifact(`${scenario.id}.json`, result);
  console.log(`[LAB] ${scenario.id}: pass=${result.summary.pass} fail=${result.summary.fail} transcript=${result.transcriptHash.slice(0, 12)} artifact=${target}`);
  assertLabRunSafe(result);
  return result;
}

async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let activeRaceId = 'manual-1';
  let sequence = 0;
  let events: LabEvent[] = [];
  const base: Omit<LabScenario, 'events'> = {
    id: 'interactive-two-testers',
    title: 'LAB interactivo de dos testers',
    seed: 'interactive-local',
    participants: [
      { id: 'tester-a', alias: 'Tester A' },
      { id: 'tester-b', alias: 'Tester B' }
    ],
    activeRaceId
  };
  console.log('LAB local — cero WhatsApp externo. Comandos: /a texto, /b texto, /race ID, /reset, /export, /quit');
  try {
    while (true) {
      const line = (await rl.question('lab> ')).trim();
      if (!line) continue;
      if (line === '/quit') break;
      if (line === '/reset') { events = []; sequence = 0; console.log('Escenario reiniciado.'); continue; }
      if (line.startsWith('/race ')) { activeRaceId = line.slice(6).trim() || activeRaceId; console.log(`Carrera activa: ${activeRaceId}`); continue; }
      if (line === '/export') {
        const result = runLabScenario({ ...base, activeRaceId, events });
        console.log(writeArtifact(`interactive-${Date.now()}.json`, result));
        continue;
      }
      const match = line.match(/^\/(a|b)\s+([\s\S]+)$/i);
      if (!match) { console.log('Usa /a mensaje o /b mensaje.'); continue; }
      const participantId = match[1].toLowerCase() === 'a' ? 'tester-a' : 'tester-b';
      events.push({
        id: `manual-${sequence}`,
        participantId,
        atMs: sequence * 1000,
        text: match[2],
        raceId: activeRaceId
      });
      sequence += 1;
      const result = runLabScenario({ ...base, activeRaceId, events });
      const row = result.transcript.at(-1);
      console.log(`${row?.alias}: ${row?.decision.decision} · ${row?.decision.decisionReason} · ${row?.decision.responseText || 'sin respuesta'}`);
    }
  } finally {
    if (events.length) {
      const result = runLabScenario({ ...base, activeRaceId, events });
      console.log(`Transcript final: ${writeArtifact(`interactive-final.json`, result)}`);
    }
    rl.close();
  }
}

const args = new Set(process.argv.slice(2));
if (args.has('--interactive')) {
  await interactive();
} else if (args.has('--all') || process.argv.length <= 2) {
  const summary = HIPICO_LAB_SCENARIOS.map((scenario) => runScenario(scenario.id));
  writeArtifact('summary.json', summary.map((result) => ({ scenarioId: result.scenarioId, summary: result.summary, stateHash: result.stateHash, transcriptHash: result.transcriptHash })));
} else {
  const value = process.argv.find((arg) => arg.startsWith('--scenario='));
  if (!value) throw new Error('Usa --all, --interactive o --scenario=<id>.');
  runScenario(value.slice('--scenario='.length));
}
