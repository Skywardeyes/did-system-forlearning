const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function formatRunTime(date = new Date()) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const localIso = shifted.toISOString().slice(0, 19);
  return {
    iso: date.toISOString(),
    local: localIso.replace('T', ' '),
    dateDirectory: localIso.slice(0, 10),
    runDirectory: `${localIso.replaceAll(':', '-') }+08-00`,
  };
}

function summaryNumber(output, label) {
  const match = new RegExp(`^# ${label} (\\d+)$`, 'm').exec(output);
  return match ? Number(match[1]) : null;
}

export function parseNodeTap(output) {
  const tests = summaryNumber(output, 'tests');
  const passed = summaryNumber(output, 'pass');
  const failed = summaryNumber(output, 'fail');
  const skipped = summaryNumber(output, 'skipped');
  const todo = summaryNumber(output, 'todo');
  const failureNames = [...output.matchAll(/^not ok \d+ - (.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((name) => !/^[A-Z]:\\/.test(name));
  const cases = [...output.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)].map((match) => ({ title: match[2].trim(), result: match[1] === 'ok' ? 'passed' : 'failed', file: null }));
  return { tests, passed, failed, skipped, todo, failureNames, cases, parsed: tests !== null && passed !== null && failed !== null };
}

function playwrightCount(output, label) {
  const matches = [...output.matchAll(new RegExp(`(?:^|\\n)\\s*(\\d+) ${label}(?:\\s|$)`, 'g'))];
  return matches.length ? Number(matches.at(-1)[1]) : 0;
}

export function parsePlaywright(output) {
  const passed = playwrightCount(output, 'passed');
  const failed = playwrightCount(output, 'failed');
  const skipped = playwrightCount(output, 'skipped');
  const failureNames = [...output.matchAll(/^\s*\d+\) \[[^\]]+\] › .* › (.+)$/gm)].map((match) => match[1].trim());
  const parsed = passed + failed + skipped > 0;
  const cases = [...output.matchAll(/^\s*(?:ok|x|-)\s+\d+\s+\[[^\]]+\]\s+›\s+(.+?)(?:\s+\([\d.]+(?:ms|s)\))?$/gm)].map((match) => {
    const text = match[1].trim(); const separator = text.lastIndexOf(' › '); const location = separator >= 0 ? text.slice(0, separator) : null;
    return { title: separator >= 0 ? text.slice(separator + 3) : text, result: 'passed', file: location };
  });
  return { tests: parsed ? passed + failed + skipped : null, passed: parsed ? passed : null, failed: parsed ? failed : null, skipped: parsed ? skipped : null, todo: 0, failureNames, cases, parsed };
}

export function buildAnalysis({ node, ui, knownFailures = [], previous = null, baseline = null }) {
  const allFailures = [...(node.failureNames || []), ...(ui.failureNames || [])];
  const knownFailureNames = allFailures.filter((name) => knownFailures.some((known) => name.includes(known) || known.includes(name)));
  const newFailureNames = allFailures.filter((name) => !knownFailureNames.includes(name));
  const total = (node.tests || 0) + (ui.tests || 0);
  const passed = (node.passed || 0) + (ui.passed || 0);
  const failed = (node.failed || 0) + (ui.failed || 0);
  const passRate = total ? Number(((passed / total) * 100).toFixed(2)) : 0;
  const failureChange = previous ? failed - previous.failed : null;
  const summary = failed === 0
    ? '全部测试通过，未发现失败。'
    : `存在 ${knownFailureNames.length} 项已知失败，${newFailureNames.length} 项新增或未匹配失败。`;
  const trend = previous
    ? `与上次相比，失败数由 ${previous.failed} 变为 ${failed}（变化 ${failureChange >= 0 ? '+' : ''}${failureChange}），通过率由 ${Number(previous.passRate).toFixed(2)}% 变为 ${passRate.toFixed(2)}%。`
    : '无历史记录可比较。';
  const baselineTrend = baseline
    ? `与修复前基线相比，失败数由 ${baseline.failed} 变为 ${failed}，通过率由 ${Number(baseline.passRate).toFixed(2)}% 变为 ${passRate.toFixed(2)}%。`
    : '无修复前基线可比较。';
  return { total, passed, failed, passRate, knownFailureNames, newFailureNames, failureChange, summary, trend, baselineTrend };
}

function list(values) {
  return values?.length ? values.map((value) => `- ${value}`).join('\n') : '- 无';
}

export function renderMarkdown(metadata) {
  const { stages, analysis } = metadata;
  return `# 测试运行记录

## 基本信息

- 运行编号：${metadata.runId}
- 开始时间：${metadata.startedAtLocal}（${metadata.timezone}）
- 结束时间：${metadata.finishedAtLocal}（${metadata.timezone}）
- 总耗时：${(metadata.durationMs / 1000).toFixed(2)} 秒
- Git：${metadata.git.branch} @ ${metadata.git.commit}
- 工作区：${metadata.git.clean ? '干净' : '存在未提交修改'}
- 最终退出码：${metadata.exitCode}

## 环境

- Node.js：${metadata.environment.node}
- npm：${metadata.environment.npm}
- Playwright：${metadata.environment.playwright}
- Chromium：${metadata.environment.chromium}

## 测试结果

| 阶段 | 测试数 | 通过 | 失败 | 跳过 | 耗时 | 退出码 |
|---|---:|---:|---:|---:|---:|---:|
| Node | ${stages.node.stats.tests ?? '无法解析'} | ${stages.node.stats.passed ?? '-'} | ${stages.node.stats.failed ?? '-'} | ${stages.node.stats.skipped ?? '-'} | ${(stages.node.durationMs / 1000).toFixed(2)} 秒 | ${stages.node.exitCode} |
| Chromium UI | ${stages.ui.stats.tests ?? '无法解析'} | ${stages.ui.stats.passed ?? '-'} | ${stages.ui.stats.failed ?? '-'} | ${stages.ui.stats.skipped ?? '-'} | ${(stages.ui.durationMs / 1000).toFixed(2)} 秒 | ${stages.ui.exitCode} |

总体通过率：**${analysis.passRate.toFixed(2)}%**（${analysis.passed}/${analysis.total}）

## 已知失败

${list(analysis.knownFailureNames)}

## 新增或未匹配失败

${list(analysis.newFailureNames)}

## 简要分析

${analysis.summary}

${analysis.trend}

${analysis.baselineTrend || ''}

${analysis.newFailureNames.length ? '建议优先分析新增失败，确认是否为回归或测试基础设施问题。' : analysis.failed ? '失败均已匹配已知缺陷，建议按缺陷报告逐项修复。' : '未发现新增风险，可继续后续交付流程。'}
`;
}
