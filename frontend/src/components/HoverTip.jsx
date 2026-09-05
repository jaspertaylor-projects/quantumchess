// frontend/src/components/HoverTip.jsx
// Purpose: THE app-wide styled tooltip. Mounted once in App, it delegates on
// document pointer events: any element carrying a native `title` (or
// `data-tip`) gets the styled tip — the title text is lifted into data-tip on
// first hover so the browser's default tooltip never competes. Style, delay,
// and placement all live here; components keep writing plain `title="..."`.
// Rich hover UIs (bot-card lock hints, onboarding coach signs) are separate
// deliberate overlays and don't route through this.
// Imports From: None
// Exported To: ../App.jsx

import React, { useEffect, useRef, useState } from 'react';

const SHOW_DELAY_MS = 220;
const GAP_PX = 9;
const EDGE_PAD_PX = 8;

// Read the tip text off an element, migrating a native title attribute to
// data-tip so the browser tooltip is permanently disarmed for it. React
// re-sets `title` if the prop changes, so a fresh value gets re-lifted here.
function liftTip(el) {
  const title = el.getAttribute('title');
  if (title !== null) {
    if (title.trim()) el.setAttribute('data-tip', title);
    el.removeAttribute('title');
  }
  return el.getAttribute('data-tip') || '';
}

export default function HoverTip() {
  const [tip, setTip] = useState(null); // { text, x, y, below }
  const anchorRef = useRef(null);
  const timerRef = useRef(null);
  const tipElRef = useRef(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const hide = () => {
      clearTimer();
      anchorRef.current = null;
      setTip(null);
    };

    const place = (el, text) => {
      const r = el.getBoundingClientRect();
      // Prefer above the element; flip below when the top edge is tight.
      const below = r.top < 44;
      const y = below ? r.bottom + GAP_PX : r.top - GAP_PX;
      const x = Math.min(
        Math.max(r.left + r.width / 2, EDGE_PAD_PX + 60),
        window.innerWidth - EDGE_PAD_PX - 60
      );
      setTip({ text, x, y, below });
    };

    const onPointerOver = (e) => {
      if (e.pointerType === 'touch') return; // touch has no hover — stay quiet
      const el = e.target && e.target.closest ? e.target.closest('[title], [data-tip]') : null;
      if (!el) {
        if (anchorRef.current && !anchorRef.current.contains(e.target)) hide();
        return;
      }
      const text = liftTip(el);
      if (!text) {
        hide();
        return;
      }
      if (el === anchorRef.current) return; // already shown/pending for this anchor
      clearTimer();
      anchorRef.current = el;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // The anchor may have unmounted during the delay (menus close fast).
        if (anchorRef.current === el && el.isConnected) place(el, text);
      }, SHOW_DELAY_MS);
    };

    const onPointerOut = (e) => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const to = e.relatedTarget;
      if (to && (anchor.contains(to) || (tipElRef.current && tipElRef.current.contains(to)))) return;
      if (anchor.contains(e.target)) hide();
    };

    // Keyboard parity: focused controls show their tip too.
    const onFocusIn = (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[title], [data-tip]') : null;
      if (!el) return;
      const text = liftTip(el);
      if (!text) return;
      anchorRef.current = el;
      place(el, text);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') hide();
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('wheel', hide, { capture: true, passive: true });
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimer();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('wheel', hide, { capture: true });
      document.removeEventListener('scroll', hide, { capture: true });
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip) return null;

  return (
    <div
      ref={tipElRef}
      className="qc-hover-tip"
      role="tooltip"
      style={{
        position: 'fixed',
        left: tip.x,
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
        zIndex: 120000,
        maxWidth: 280,
        padding: '7px 12px',
        borderRadius: 9,
        border: '1px solid rgba(127, 231, 255, 0.72)',
        background: 'linear-gradient(135deg, rgba(13, 22, 38, 0.98), rgba(39, 22, 57, 0.98))',
        color: '#dff8ff',
        fontFamily: '"Trebuchet MS", "Avenir Next", Avenir, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1.38,
        letterSpacing: '0.035em',
        textAlign: 'center',
        boxShadow: '0 7px 20px rgba(0,0,0,0.52), 0 0 11px rgba(127,231,255,0.22), 0 0 18px rgba(199,146,234,0.12)',
        pointerEvents: 'none',
        whiteSpace: 'normal',
        animation: 'qc-hover-tip-in 130ms ease-out',
      }}
    >
      {tip.text}
    </div>
  );
}
