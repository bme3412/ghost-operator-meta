import type { BatchItem, BatchRecord } from '../../shared/schemas'
import { batchHeadline, summarizeBatch } from '../runner/batch'

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function label(choice: string | undefined): string {
  if (!choice) return 'Done'
  return choice.charAt(0).toUpperCase() + choice.slice(1)
}

function caseLink(item: BatchItem, caseUrl: ((caseId: string) => string | null) | undefined): string {
  const url = caseUrl?.(item.caseId)
  return url ? `<a class="open" href="${esc(url)}">Open ${esc(item.caseId)}</a>` : ''
}

function timeOf(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * Phone-sized "while you were away" page for one batch. Cases Ghost handed
 * back come first; each handled case quotes the owner's own rule.
 */
export function renderAwayPage(
  batch: BatchRecord,
  options: { caseUrl?: (caseId: string) => string | null } = {}
): string {
  const { handled, escalated, failed } = summarizeBatch(batch)
  const needsYou = [...escalated, ...failed]
  const needsCards = needsYou
    .map(
      (item) => `<article class="card needs" data-case="${esc(item.caseId)}">
  <h3>${esc(item.caseId)} <span class="tag">${item.status === 'escalated' ? 'Handed back' : 'Did not finish'}</span></h3>
  <p class="why">${esc(item.reason ?? item.error ?? 'Muse for SMB could not finish this case.')}</p>
  ${item.evidence ? `<blockquote>${esc(item.evidence)}</blockquote>` : ''}
  ${caseLink(item, options.caseUrl)}
</article>`
    )
    .join('\n')
  const handledRows = handled
    .map(
      (item) => `<li data-case="${esc(item.caseId)}">
  <div><strong>${esc(item.caseId)}</strong> <span class="choice">${esc(label(item.choice))}</span></div>
  ${item.rule ? `<div class="rule">Your rule: “${esc(item.rule)}”</div>` : ''}
</li>`
    )
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(batchHeadline(batch))}</title>
<style>
  :root { --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --sea: #0e7490; --sand: #fffbeb; --sun: #b45309; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.45 -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; color: var(--ink); background: #f8fafc; }
  header { background: linear-gradient(160deg, #0e7490, #155e75); color: #fff; padding: 28px 20px 22px; }
  header .eyebrow { opacity: .8; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
  header h1 { margin: 6px 0 0; font-size: 24px; line-height: 1.25; }
  main { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 10px 4px 0; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
  .needs { background: var(--sand); border-color: #fde68a; }
  .needs h3 { margin: 0 0 6px; font-size: 18px; }
  .tag { font-size: 12px; font-weight: 600; color: var(--sun); background: #fef3c7; border-radius: 999px; padding: 2px 8px; vertical-align: middle; }
  .why { margin: 0 0 8px; }
  blockquote { margin: 0 0 10px; padding: 8px 12px; border-left: 3px solid #fcd34d; color: #44403c; background: #fff; border-radius: 6px; font-size: 14px; }
  .open { display: inline-block; color: var(--sea); font-weight: 600; text-decoration: none; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 10px 0; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  .choice { font-size: 13px; font-weight: 600; color: var(--sea); background: #ecfeff; border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
  .rule { color: var(--muted); font-size: 14px; margin-top: 2px; }
  footer { color: var(--muted); font-size: 13px; text-align: center; padding: 8px 16px 32px; }
</style>
</head>
<body>
<header>
  <div class="eyebrow">Muse for SMB · while you were away</div>
  <h1 data-semid="away-headline">${esc(batchHeadline(batch))}</h1>
</header>
<main>
  ${needsYou.length > 0 ? `<h2>Needs you</h2>\n${needsCards}` : ''}
  ${
    handled.length > 0
      ? `<h2>Handled with your rules</h2>\n<section class="card"><ul>${handledRows}</ul></section>`
      : ''
  }
</main>
<footer>${esc(batch.skillName)}${batch.endedAt ? ` · finished ${esc(timeOf(batch.endedAt))}` : ' · still running'}</footer>
</body>
</html>`
}
