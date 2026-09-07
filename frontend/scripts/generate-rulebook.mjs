// Generate the public page from the same copy and styles as the in-game rulebook.
// Run after editing rules or their presentation: node frontend/scripts/generate-rulebook.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { RULES } from '../src/rules/rulebook.js';
import { RULE_GROUPS, TUTORIAL_COPY, TURN_STEPS } from '../src/rules/rulebookPresentation.js';

import { RULE_EXAMPLES, createRuleExample } from '../src/rules/ruleExamples.js';

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const css = readFileSync(new URL('../src/rules/Rulebook.css', import.meta.url), 'utf8');
const asset = (type) => `data:image/svg+xml,${encodeURIComponent(readFileSync(new URL(`../src/assets/${type}.svg`, import.meta.url), 'utf8'))}`;
const arrow = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
const play = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>';
const brandIcon = '<img class="qr-brand-icon" src="/favicon.ico" width="24" height="24" alt="">';
const illustration = (rule) => {
  if (!RULE_EXAMPLES[rule.id]) return '';
  const example = createRuleExample(rule.id);
  return `<div data-rule-example="${rule.id}"><figure class="qr-experiment"><div class="qr-experiment-label">On the board · ${escape(example.title)}</div><p>${escape(example.start)}</p><p>${escape(example.frames.at(-1).notice)}</p><noscript>Enable JavaScript to play the board example.</noscript></figure></div>`;
};
const physics = (rule) => rule.physics ? `<aside class="qr-physics" aria-label="The physics behind ${escape(rule.title)}"><span class="qr-eyebrow">The quantum connection</span><p>${escape(rule.physics.explanation)}</p><a href="${escape(rule.physics.href)}" target="_blank" rel="noopener noreferrer">${escape(rule.physics.label)}${arrow}<span class="qr-sr-only"> (opens in a new tab)</span></a></aside>` : '';
const reference = (rule) => `<details class="qr-details" id="qr-rule-${rule.id}"><summary>${escape(rule.title)}<span aria-hidden="true">+</span></summary><div class="qr-details-content"><h3>${escape(rule.concept)}</h3><p>${escape(rule.summary)}</p>${rule.paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}${illustration(rule)}<p>${escape(rule.detail)}</p>${physics(rule)}</div></details>`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#070915"><title>The Rulebook — Quantum Chess</title><meta name="description" content="Learn Quantum Chess on the board with the guided tutorial, or explore the rules of superposition, measurement, interaction and conservation."><link rel="icon" type="image/x-icon" href="/favicon.ico"><link rel="canonical" href="https://quantumchess.ninja/rules.html"><style>${css}</style></head>
<body class="qr-web"><main class="qr-page">
<header class="qr-header"><a class="qr-brand" href="/play">${brandIcon} Quantum Chess <span class="qr-header-divider">/</span> Rulebook</a><a href="/play">Back to the board ↗</a></header>
<div class="qr-cover"><div class="qr-cover-copy"><span class="qr-eyebrow">Quantum Chess · Official rules</span><h1>The rules of<br><em>Quantum Chess.</em></h1><p>Every piece begins in superposition.<br>Every move is a measurement.</p></div><div class="qr-cover-art" aria-hidden="true"><div class="qr-orbit qr-orbit-one"></div><div class="qr-orbit qr-orbit-two"></div><div class="qr-art-board"></div><img class="qr-art-piece qr-art-bishop" src="${asset('b')}" alt=""><img class="qr-art-piece qr-art-knight" src="${asset('n')}" alt=""><img class="qr-art-piece qr-art-king" src="${asset('k')}" alt=""><span class="qr-art-state">| Pawn · Knight · Bishop · Rook · Queen · King ⟩</span></div></div>
<a class="qr-learn" href="/play?welcome=intro"><span class="qr-learn-symbol" aria-hidden="true">${play}</span><span class="qr-learn-copy"><span class="qr-eyebrow">${escape(TUTORIAL_COPY.eyebrow)}</span><strong>${escape(TUTORIAL_COPY.title)}</strong><span>${escape(TUTORIAL_COPY.body)}</span></span><span class="qr-learn-action">${escape(TUTORIAL_COPY.action)}${arrow}</span></a>
<section class="qr-turn-order" aria-labelledby="qr-turn-title"><span class="qr-eyebrow">Start here</span><h2 id="qr-turn-title">One turn, in order</h2><p>White moves first. Turns alternate. Every move must leave your revealed King safe.</p><ol>${TURN_STEPS.map((step) => `<li><strong>${escape(step.title)}</strong><span>${escape(step.text)}</span></li>`).join('')}</ol></section>
<div class="qr-reference-heading"><span class="qr-eyebrow">The rulebook</span><p>Keep the rules at hand while you play.</p></div>
<nav class="qr-jumps" aria-label="Rule topics">${RULE_GROUPS.map((group) => `<a href="#qr-${group.id}">${escape(group.nav)}</a>`).join('')}</nav>
<div class="qr-sections">${RULE_GROUPS.map((group) => `<section class="qr-section qr-section--${group.id}" id="qr-${group.id}"><div class="qr-section-title"><span class="qr-eyebrow">${escape(group.label)}</span><h2>${escape(group.title)}</h2></div><div class="qr-section-body"><p class="qr-lead">${escape(group.intro)}</p><p class="qr-note">${escape(group.note)}</p>${group.id === 'contact' ? '<div class="qr-contact-key"><span class="qr-zap"><i></i>Attack an enemy · Zap</span><span class="qr-heal"><i></i>Protect an ally · Heal</span><span class="qr-shield"><i></i>No removal · Shield</span></div>' : ''}${group.rules.map((id) => reference(RULES.find((rule) => rule.id === id))).join('')}</div></section>`).join('\n')}</div>
<div class="qr-end"><span>Ready to make the first measurement?</span><a class="qr-tutorial" href="/play?welcome=intro">${escape(TUTORIAL_COPY.action)}${arrow}</a></div>
<footer class="qr-legal"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></footer></main><script type="module" src="/src/rules/publicRuleExamples.jsx"></script></body></html>\n`;
writeFileSync(new URL('../rules.html', import.meta.url), html);
