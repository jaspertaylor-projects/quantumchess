import React, { useEffect, useRef, useState } from 'react';
import ModalShell from '../components/ModalShell.jsx';
import ModalCloseButton from '../components/ModalCloseButton.jsx';
import { Sparkles as SparklesIcon, Check as CheckIcon, Play as PlayIcon } from 'lucide-react';
import {
  PREMIUM_FEATURES,
  PREMIUM_PRICE_LABEL,
  PREMIUM_PRICE_VALUE,
  startCheckout,
} from './billing.js';
import { PRODUCT_EVENT, trackProductEvent } from '../analytics/productEvents.js';
import './PricingModal.css';

export default function PricingModal({
  open = false,
  onClose = () => {},
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const upsellViewedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      upsellViewedRef.current = false;
      return;
    }
    if (!upsellViewedRef.current) {
      trackProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_VIEWED, { source: 'post_signup_pricing' });
      upsellViewedRef.current = true;
    }
  }, [open]);

  if (!open) return null;

  const handleUpgrade = async () => {
    trackProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_CLICKED, {
      source: 'post_signup_pricing',
      offer: 'lifetime',
    });
    setBusy(true);
    setNotice(null);
    const { url, error } = await startCheckout();
    if (url) {
      trackProductEvent(PRODUCT_EVENT.CHECKOUT_STARTED, {
        source: 'post_signup_pricing',
        offer: 'lifetime',
        value: PREMIUM_PRICE_VALUE,
      });
      window.location.assign(url);
      return;
    }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not start checkout.' });
  };

  const handleContinueFree = () => {
    onClose();
  };

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      zIndex={1001}
      ariaLabelledBy="qc-pricing-title"
      backdropClassName="qc-account-backdrop"
      panelClassName="qc-pm-panel"
      panelStyle={{}}
    >
      <div className="qc-pm-header">
        <h2 id="qc-pricing-title" className="qc-pm-title">Choose Your Tier</h2>
        <p className="qc-pm-subtitle">Quantum Chess is built and run by one person — your support keeps the servers on.</p>
        {notice ? <div className={`qc-pm-notice`}>{notice.text}</div> : null}
      </div>

      <div className="qc-pm-columns">
        {/* Free Tier */}
        <div className="qc-pm-card">
          <div className="qc-pm-card-title"><PlayIcon size={20} color="#61dafb" /> Free Play</div>
          <div className="qc-pm-card-price">Always Free</div>
          
          <ul className="qc-pm-feature-list">
            <li className="qc-pm-feature-item">
              <CheckIcon size={16} className="check" /> Play online & local games
            </li>
            <li className="qc-pm-feature-item">
              <CheckIcon size={16} className="check" /> Global matchmaking
            </li>
            <li className="qc-pm-feature-item">
              <CheckIcon size={16} className="check" /> Up to 10 saved games
            </li>
            <li className="qc-pm-feature-item">
              <CheckIcon size={16} className="check" /> 6 Free bots to discover
            </li>
            <li className="qc-pm-feature-item">
              <CheckIcon size={16} className="check" /> 16 starter avatars
            </li>
          </ul>
          
          <button 
            className="qc-pm-btn qc-pm-btn-ghost" 
            onClick={handleContinueFree}
            disabled={busy}
          >
            Continue with Free
          </button>
        </div>

        {/* Premium Tier */}
        <div className="qc-pm-card premium">
          <div className="qc-pm-card-title"><SparklesIcon size={20} /> Premium</div>
          <div className="qc-pm-card-price">{PREMIUM_PRICE_LABEL}</div><p>No subscription. No renewal.</p>
          
          <ul className="qc-pm-feature-list">
            {PREMIUM_FEATURES.map((feature, idx) => (
              <li key={idx} className="qc-pm-feature-item">
                <CheckIcon size={16} className="check" /> {feature}
              </li>
            ))}
          </ul>
          
          <button 
            className="qc-pm-btn qc-pm-btn-gold" 
            onClick={handleUpgrade}
            disabled={busy}
          >
            {busy ? 'Working…' : `Unlock Premium — ${PREMIUM_PRICE_LABEL}`}
          </button>
        </div>

      </div>
      
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ModalCloseButton ariaLabel="Close pricing panel" className="qc-account-close" onClick={onClose} />
      </div>
    </ModalShell>
  );
}
