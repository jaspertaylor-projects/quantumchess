// Purpose: Large always-reachable development control for swapping the live
// app among real, signed-out, free, supporter, and Premium account views.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEV_ACCOUNT_LEVEL } from './useDevAccountPreview.js';

const POSITION_KEY = 'qcDevAccountSwitcherPosition';
const VIEWPORT_GUTTER = 8;

const SWITCHER_CSS = `
.qc-dev-account-switcher{position:fixed;z-index:4000;top:max(10px,env(safe-area-inset-top,0px));left:50%;width:min(360px,calc(100vw - 24px));box-sizing:border-box;transform:translateX(-50%);padding:8px 12px 9px;border:2px solid #f6c445;border-radius:14px;color:#fff;background:rgba(8,12,24,.97);box-shadow:0 12px 42px rgba(0,0,0,.55),0 0 24px rgba(246,196,69,.18);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
.qc-dev-account-switcher__handle{display:flex;align-items:center;justify-content:space-between;min-height:24px;margin:-3px -3px 4px;padding:2px 3px;color:#f6c445;cursor:grab;touch-action:none;user-select:none}
.qc-dev-account-switcher__handle:active{cursor:grabbing}
.qc-dev-account-switcher__title{font-size:10px;font-weight:900;letter-spacing:.14em}
.qc-dev-account-switcher__grip{font-size:17px;font-weight:900;letter-spacing:-.2em;line-height:1;opacity:.75}
.qc-dev-account-switcher select{width:100%;height:44px;box-sizing:border-box;padding:0 38px 0 12px;border:1px solid rgba(255,255,255,.22);border-radius:9px;color:#fff;background:#182036;font:800 16px/1 Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.qc-dev-account-switcher__detail{display:block;margin-top:5px;overflow:hidden;color:#9ca9be;font-size:10px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:520px){.qc-dev-account-switcher{top:max(6px,env(safe-area-inset-top,0px));width:min(330px,calc(100vw - 12px));padding:6px 9px 7px}.qc-dev-account-switcher__handle{min-height:20px;margin-bottom:2px}.qc-dev-account-switcher__detail{display:none}.qc-dev-account-switcher select{height:42px;font-size:14px}}
`;

const OPTIONS = [
  { value: DEV_ACCOUNT_LEVEL.ACTUAL, label: 'Actual browser session', detail: 'Live auth' },
  { value: DEV_ACCOUNT_LEVEL.SIGNED_OUT, label: 'Signed out', detail: 'Anonymous' },
  { value: DEV_ACCOUNT_LEVEL.FREE, label: 'Free account', detail: 'Standard access' },
  { value: DEV_ACCOUNT_LEVEL.SUPPORTER, label: 'Supporter account', detail: 'Tip · ad-free + daily review' },
  { value: DEV_ACCOUNT_LEVEL.PREMIUM, label: 'Premium account', detail: 'All access · 15 saved games' },
  { value: DEV_ACCOUNT_LEVEL.ADMIN, label: 'Admin account', detail: 'Premium + stats dashboard' },
];

function loadPosition() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY));
    return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y) ? parsed : null;
  } catch (_) {
    return null;
  }
}

export default function DevAccountSwitcher({ level, onChange }) {
  if (!import.meta.env.DEV) return null;
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const positionRef = useRef(null);
  const [position, setPosition] = useState(loadPosition);
  const selected = OPTIONS.find((option) => option.value === level) || OPTIONS[0];

  const setClampedPosition = useCallback((x, y) => {
    const panel = panelRef.current;
    if (!panel) return;
    const maxX = Math.max(VIEWPORT_GUTTER, window.innerWidth - panel.offsetWidth - VIEWPORT_GUTTER);
    const maxY = Math.max(VIEWPORT_GUTTER, window.innerHeight - panel.offsetHeight - VIEWPORT_GUTTER);
    const next = {
      x: Math.min(Math.max(VIEWPORT_GUTTER, x), maxX),
      y: Math.min(Math.max(VIEWPORT_GUTTER, y), maxY),
    };
    positionRef.current = next;
    setPosition(next);
  }, []);

  useEffect(() => {
    positionRef.current = position;
    if (position) setClampedPosition(position.x, position.y);
  }, []); // Clamp a restored position once the panel has been measured.

  useEffect(() => {
    const handleResize = () => {
      const current = positionRef.current;
      if (current) setClampedPosition(current.x, current.y);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setClampedPosition]);

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setClampedPosition(rect.left, rect.top);
    event.preventDefault();
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setClampedPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current));
    } catch (_) {
      // Persistence is only a convenience for local UI work.
    }
  };

  return (
    <>
      <style>{SWITCHER_CSS}</style>
      <aside
        ref={panelRef}
        className="qc-dev-account-switcher"
        aria-label="Development account preview"
        style={position ? { left: position.x, top: position.y, transform: 'none' } : undefined}
      >
        <div
          className="qc-dev-account-switcher__handle"
          title="Drag to move"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <span className="qc-dev-account-switcher__title">DEV ACCOUNT LEVEL · DRAG ME</span>
          <span className="qc-dev-account-switcher__grip" aria-hidden="true">⠿</span>
        </div>
        <select
          id="qc-dev-account-level"
          aria-label="Development account level"
          value={selected.value}
          onChange={(event) => onChange(event.target.value)}
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span className="qc-dev-account-switcher__detail">{selected.detail} · switching opens the account panel</span>
      </aside>
    </>
  );
}
