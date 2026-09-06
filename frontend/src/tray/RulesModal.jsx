import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Atom, Play } from 'lucide-react';
import ModalShell from '../components/ModalShell.jsx';
import ModalCloseButton from '../components/ModalCloseButton.jsx';
import { RULES } from '../rules/rulebook.js';
import RuleIllustration from '../rules/RuleIllustration.jsx';
import '../rules/Rulebook.css';

export default function RulesModal({ open = false, onClose = () => {}, onOpenTutorial = null, initialPageTitle = null }) {
  const [index, setIndex] = useState(0);
  const article = useRef(null);
  useEffect(() => {
    if (!open) return;
    const alias = initialPageTitle === 'Shields' ? 'royal' : initialPageTitle === 'Turn Order' ? 'measurement' : initialPageTitle;
    const found = RULES.findIndex((rule) => [rule.id, rule.title, rule.legacy].includes(alias));
    setIndex(Math.max(0, found));
  }, [open, initialPageTitle]);
  useEffect(() => { if (article.current) article.current.scrollTop = 0; }, [index]);
  if (!open) return null;
  const rule = RULES[index];
  return (
    <ModalShell onClose={onClose} closeOnBackdrop zIndex={1000} ariaLabelledBy="qc-rules-title" panelClassName="qc-rules-panel qr-panel">
      <header className="qr-header">
        <div><span className="qr-eyebrow"><Atom size={14} /> Quantum Chess</span><h2 id="qc-rules-title">The rulebook</h2></div>
        <ModalCloseButton ariaLabel="Close rulebook" onClick={onClose} />
      </header>
      <div className="qr-layout">
        <nav className="qr-nav" aria-label="Rule topics">
          {RULES.map((topic, i) => (
            <button key={topic.id} type="button" aria-current={index === i ? 'page' : undefined} onClick={() => setIndex(i)}>
              <span>{String(i + 1).padStart(2, '0')}</span>{topic.title}
            </button>
          ))}
        </nav>
        <article ref={article} className="qr-article" aria-labelledby="qr-concept">
          <div className="qr-article-content" key={rule.id}>
            <span className="qr-eyebrow">{rule.title}</span>
            <h3 id="qr-concept">{rule.concept}</h3>
            <p className="qr-lead">{rule.summary}</p>
            {rule.before && <RuleIllustration rule={rule} />}
            <div className="qr-copy">{rule.paragraphs.map((text) => <p key={text}>{text}</p>)}</div>
            <details className="qr-details"><summary>Rule details</summary><p>{rule.detail}</p></details>
          </div>
        </article>
      </div>
      <footer className="qr-footer">
        {onOpenTutorial && <button type="button" className="qr-tutorial" onClick={onOpenTutorial}><Play size={14} /> Tutorial</button>}
        <div className="qr-pagination">
          <button type="button" aria-label="Previous rule" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={17} /></button>
          <span>{index + 1} / {RULES.length}</span>
          <button type="button" aria-label="Next rule" disabled={index === RULES.length - 1} onClick={() => setIndex(index + 1)}><ArrowRight size={17} /></button>
        </div>
      </footer>
    </ModalShell>
  );
}
