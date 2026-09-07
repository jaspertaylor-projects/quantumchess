import React, { useState } from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import { SINGLE_ASSET_BY_TYPE } from '../chessboard/assetsIndex.js';
import { RULES } from './rulebook.js';
import { RULE_GROUPS, TUTORIAL_COPY, TURN_STEPS } from './rulebookPresentation.js';
import RuleIllustration from './RuleIllustration.jsx';
import { RULE_EXAMPLES } from './ruleExamples.js';

export function RulebookArt() {
  return <div className="qr-cover-art" aria-hidden="true">
    <div className="qr-orbit qr-orbit-one" /><div className="qr-orbit qr-orbit-two" />
    <div className="qr-art-board" />
    <img className="qr-art-piece qr-art-bishop" src={SINGLE_ASSET_BY_TYPE.b} alt="" />
    <img className="qr-art-piece qr-art-knight" src={SINGLE_ASSET_BY_TYPE.n} alt="" />
    <img className="qr-art-piece qr-art-king" src={SINGLE_ASSET_BY_TYPE.k} alt="" />
    <span className="qr-art-state">| Pawn · Knight · Bishop · Rook · Queen · King ⟩</span>
  </div>;
}

function RuleReference({ rule }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="qr-details" id={`qr-rule-${rule.id}`} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>{rule.title}<span aria-hidden="true">+</span></summary>
    <div className="qr-details-content"><h4>{rule.concept}</h4><p>{rule.summary}</p>
      {rule.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {expanded && RULE_EXAMPLES[rule.id] && <RuleIllustration rule={rule} />}
      <p>{rule.detail}</p>
      {rule.physics && <aside className="qr-physics" aria-label={`The physics behind ${rule.title}`}>
        <span className="qr-eyebrow">The quantum connection</span>
        <p>{rule.physics.explanation}</p>
        <a href={rule.physics.href} target="_blank" rel="noopener noreferrer">{rule.physics.label}<ArrowUpRight size={14} aria-hidden="true" /><span className="qr-sr-only"> (opens in a new tab)</span></a>
      </aside>}
    </div>
  </details>;
}

export default function RulebookContent({ onOpenTutorial }) {
  return <>
    <div className="qr-cover">
      <div className="qr-cover-copy"><span className="qr-eyebrow">Quantum Chess · Official rules</span>
        <h2>The rules of<br /><em>Quantum Chess.</em></h2>
        <p>Every piece begins in superposition.<br />Every move is a measurement.</p>
      </div>
      <RulebookArt />
    </div>
    {onOpenTutorial && <button type="button" className="qr-learn" onClick={onOpenTutorial}>
      <span className="qr-learn-symbol" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
      <span className="qr-learn-copy"><span className="qr-eyebrow">{TUTORIAL_COPY.eyebrow}</span><strong>{TUTORIAL_COPY.title}</strong><span>{TUTORIAL_COPY.body}</span></span>
      <span className="qr-learn-action">{TUTORIAL_COPY.action}<ArrowUpRight size={17} /></span>
    </button>}
    <section className="qr-turn-order" aria-labelledby="qr-turn-title"><h3 id="qr-turn-title">Turn sequence</h3><ol>{TURN_STEPS.map((step) => <li key={step.title}><strong>{step.title}</strong><span>{step.text}</span></li>)}</ol></section>
    <div className="qr-reference-heading"><span className="qr-eyebrow">The rulebook</span><p>Keep the rules at hand while you play.</p></div>
    <nav className="qr-jumps" aria-label="Rule topics">{RULE_GROUPS.map((group) => <a key={group.id} href={`#qr-${group.id}`}>{group.nav}</a>)}</nav>
    <div className="qr-sections">{RULE_GROUPS.map((group) => <section className={`qr-section qr-section--${group.id}`} key={group.id} id={`qr-${group.id}`}>
      <div className="qr-section-title"><span className="qr-eyebrow">{group.label}</span><h3>{group.title}</h3></div>
      <div className="qr-section-body"><p className="qr-lead">{group.intro}</p><p className="qr-note">{group.note}</p>
        {group.id === 'contact' && <div className="qr-contact-key"><span className="qr-zap"><i />Attack an enemy · Zap</span><span className="qr-heal"><i />Protect an ally · Heal</span><span className="qr-shield"><i />No removal · Shield</span></div>}
        {group.rules.map((id) => <RuleReference key={id} rule={RULES.find((rule) => rule.id === id)} />)}
      </div>
    </section>)}</div>
    {onOpenTutorial && <div className="qr-end"><span>Ready to make the first measurement?</span><button type="button" className="qr-tutorial" onClick={onOpenTutorial}>{TUTORIAL_COPY.action}<ArrowUpRight size={16} /></button></div>}
  </>;
}
