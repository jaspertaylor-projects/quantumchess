import React, { useEffect, useRef } from 'react';
import ModalShell from '../components/ModalShell.jsx';
import ModalCloseButton from '../components/ModalCloseButton.jsx';
import { RULES } from '../rules/rulebook.js';
import RulebookContent from '../rules/RulebookContent.jsx';
import '../rules/Rulebook.css';

export default function RulesModal({ open = false, onClose = () => {}, onOpenTutorial = null, initialPageTitle = null }) {
  const scroll = useRef(null);
  useEffect(() => {
    if (!open || !scroll.current) return;
    scroll.current.querySelectorAll('details').forEach((node) => { node.open = false; });
    scroll.current.scrollTop = 0;
    const alias = initialPageTitle === 'Shields' ? 'royal' : initialPageTitle === 'Turn Order' ? 'measurement' : initialPageTitle;
    const rule = RULES.find((r) => [r.id, r.title, r.legacy].includes(alias));
    if (rule) {
      const detail = scroll.current.querySelector(`#qr-rule-${rule.id}`);
      if (detail) { detail.open = true; detail.scrollIntoView({ block: 'start' }); }
    }
  }, [open, initialPageTitle]);
  if (!open) return null;
  return <ModalShell onClose={onClose} closeOnBackdrop zIndex={1000} ariaLabelledBy="qc-rules-title" panelClassName="qc-rules-panel qr-panel">
    <header className="qr-header"><span id="qc-rules-title"><img className="qr-brand-icon" src="/favicon.ico" width="24" height="24" alt="" /> Quantum Chess <span className="qr-header-divider">/</span> Rulebook</span><ModalCloseButton ariaLabel="Close rulebook" title="Back to the board (Esc)" onClick={onClose} style={{ width: 44, height: 44 }} /></header>
    <div className="qr-scroll" ref={scroll} onClick={(event) => {
      const link = event.target.closest('a[href^="#qr-"]');
      if (!link) return;
      const target = scroll.current.querySelector(link.getAttribute('href'));
      if (target) { event.preventDefault(); target.scrollIntoView({ block: 'start' }); target.tabIndex = -1; target.focus({ preventScroll: true }); }
    }}><RulebookContent onOpenTutorial={onOpenTutorial} /></div>
  </ModalShell>;
}
