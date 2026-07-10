import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  buildAnalysis,
  formatRunTime,
  parseNodeTap,
  parsePlaywright,
  renderMarkdown,
} from './helpers/test-records.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function commandOutput(command, args = []) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unavailable';
}

async function uniqueRunPath(recordRoot, time) {
  const datePath = path.join(recordRoot, time.dateDirectory);
  await mkdir(datePath, { recursive: true });
  for (let suffix = 0; ; suffix += 1) {
    const name = suffix ? `${time.runDirectory}-${suffix + 1}` : time.runDirectory;
    const candidate = path.join(datePath, name);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

async function runStage(stage, { cwd, quiet }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(stage.command, stage.args || [], { cwd, env: { ...process.env, ...(stage.env || {}) } });
    let output = '';
    const collect = (target, chunk) => {
      const text = chunk.toString();
      output += text;
      if (!quiet) target.write(chunk);
    };
    child.stdout.on('data', (chunk) => collect(process.stdout, chunk));
    child.stderr.on('data', (chunk) => collect(process.stderr, chunk));
    child.on('error', (error) => {
      output += `\n[runner error] ${error.message}\n`;
      resolve({ exitCode: 1, durationMs: Date.now() - started, output, infrastructureError: error.message });
    });
    child.on('close', (code) => resolve({ exitCode: code ?? 1, durationMs: Date.now() - started, output }));
  });
}

async function readKnownFailureNames() {
  try {
    const report = await readFile(path.join(root, 'docs', '测试缺陷报告.md'), 'utf8');
    return [...report.matchAll(/^- 失败用例：`(.+)`$/gm)].map((match) => match[1]);
  } catch {
    return [];
  }
}

async function findHistory(recordRoot, currentPath) {
  const records = [];
  try {
    const dates = (await readdir(recordRoot)).sort().reverse();
    for (const date of dates) {
      const datePath = path.join(recordRoot, date);
      const runs = (await readdir(datePath)).sort().reverse();
      for (const run of runs) {
        const runPath = path.join(datePath, run);
        if (runPath === currentPath) continue;
        try {
          records.push(JSON.parse(await readFile(path.join(runPath, 'metadata.json'), 'utf8')));
        } catch {
          // Continue to the next complete historical record.
        }
      }
    }
  } catch {
    return { previous: null, baseline: null };
  }
  return { previous: records[0] || null, baseline: records.at(-1) || null };
}

function environmentMetadata() {
  let playwright = 'unavailable';
  let chromium = 'unavailable';
  try {
    playwright = require('@playwright/test/package.json').version;
    const executable = require('playwright').chromium.executablePath();
    const revision = /chromium(?:_headless_shell)?-(\d+)/.exec(executable)?.[1];
    chromium = revision ? `Playwright revision ${revision}` : path.basename(executable);
  } catch {
    // Version discovery is diagnostic only.
  }
  return {
    node: process.version,
    npm: commandOutput(process.execPath, [process.env.npm_execpath, '--version']),
    playwright,
    chromium,
  };
}

export async function runRecordedTests({
  recordRoot = path.join(root, 'test-records'),
  now = () => new Date(),
  stages = null,
  knownFailures = null,
  quiet = false,
} = {}) {
  const startedDate = now();
  const started = formatRunTime(startedDate);
  const runPath = await uniqueRunPath(recordRoot, started);
  const npmCli = process.env.npm_execpath;
  const actualStages = stages || [
    { key: 'node', command: process.execPath, args: [npmCli, 'run', 'test:node'], display: 'npm run test:node' },
    { key: 'ui', command: process.execPath, args: [npmCli, 'run', 'test:ui'], display: 'npm run test:ui' },
  ];
  const results = {};
  for (const stage of actualStages) {
    const result = await runStage(stage, { cwd: root, quiet });
    const stats = stage.key === 'node' ? parseNodeTap(result.output) : parsePlaywright(result.output);
    results[stage.key] = { command: stage.display || [stage.command, ...(stage.args || [])].join(' '), ...result, stats };
    await writeFile(path.join(runPath, `${stage.key}.log`), result.output, 'utf8');
  }
  const finishedDate = now();
  const finished = formatRunTime(finishedDate);
  const history = await findHistory(recordRoot, runPath);
  const failures = knownFailures ?? await readKnownFailureNames();
  const analysis = buildAnalysis({
    node: results.node.stats,
    ui: results.ui.stats,
    knownFailures: failures,
    previous: history.previous?.analysis || null,
    baseline: history.baseline?.analysis || null,
  });
  const exitCode = Object.values(results).some((result) => result.exitCode !== 0) ? 1 : 0;
  const status = commandOutput('git', ['status', '--short']);
  const metadata = {
    runId: path.basename(runPath),
    startedAt: started.iso,
    finishedAt: finished.iso,
    startedAtLocal: started.local,
    finishedAtLocal: finished.local,
    timezone: 'Asia/Shanghai',
    durationMs: Math.max(0, finishedDate.getTime() - startedDate.getTime()),
    git: {
      branch: commandOutput('git', ['branch', '--show-current']),
      commit: commandOutput('git', ['rev-parse', 'HEAD']),
      clean: status === '',
    },
    environment: environmentMetadata(),
    stages: results,
    analysis,
    exitCode,
  };
  await writeFile(path.join(runPath, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  await writeFile(path.join(runPath, 'result.md'), renderMarkdown(metadata), 'utf8');
  if (!quiet) console.log(`\n测试记录：${runPath}`);
  return { exitCode, runPath, metadata };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runRecordedTests();
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`测试记录生成失败：${error.message}`);
    process.exitCode = 1;
  }
}
