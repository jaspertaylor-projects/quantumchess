// Purpose: Compact first-visit welcome experience. Three clear entry choices
// sit above an animated diagram made from the game's real piece artwork.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, GraduationCap, LockKeyhole, Puzzle, Star, Swords } from 'lucide-react';
import QuantumPiece from '../chessboard/QuantumPiece.jsx';
import ConsentBanner, {
  CONSENT_CHOICE,
  readStoredConsent,
} from '../components/ConsentBanner.jsx';
import { initAnalytics } from '../analytics/analytics.js';
import { PRODUCT_EVENT, trackProductEvent } from '../analytics/productEvents.js';
import { WELCOME_ACTION } from './welcomeRouting.js';
import './WelcomeLanding.css';

const choices = [
  {
    action: WELCOME_ACTION.PLAY,
    title: 'Play Quantum Chess',
    text: 'Jump straight to the board',
    icon: Swords,
    tone: 'cyan',
  },
  {
    action: WELCOME_ACTION.INTRO,
    title: 'Guided Intro Game',
    text: 'Learn the rules by playing',
    icon: GraduationCap,
    tone: 'gold',
    featured: true,
    recommended: true,
  },
  {
    action: WELCOME_ACTION.PUZZLE,
    title: 'Daily Puzzle',
    text: 'A new puzzle every day',
    icon: Puzzle,
    tone: 'green',
  },
];

// Material order is also the orbit order: cheapest on the widest ring,
// King closest to the unresolved six-type state in the center.
const orbitPieces = [
  { type: 'p', label: 'Pawn', inset: '1%', duration: '24s', delay: '-3s' },
  { type: 'n', label: 'Knight', inset: '7.5%', duration: '21s', delay: '-14s' },
  { type: 'b', label: 'Bishop', inset: '14%', duration: '18s', delay: '-7s' },
  { type: 'r', label: 'Rook', inset: '20.5%', duration: '15s', delay: '-11s' },
  { type: 'q', label: 'Queen', inset: '27%', duration: '12s', delay: '-5s' },
  { type: 'k', label: 'King', inset: '33.5%', duration: '9s', delay: '-2s' },
];

const welcomePieceStyles = {
  white: {
    '--band-fill': '#dff8ff',
    '--band-stroke': '#21354d',
    '--piece-outline': '#6ee7ff',
    '--icon-color': '#17243a',
  },
  black: {},
};

function QuantumOrbit() {
  return (
    <div className="qc-welcome-quantum" role="img" aria-label="Pawn, Knight, Bishop, Rook, Queen, and King orbit a full quantum superposition, least valuable to most valuable from outside in">
      <div className="qc-welcome-quantum-glow" aria-hidden="true" />
      {orbitPieces.map((piece) => (
        <div
          key={piece.type}
          className={`qc-welcome-piece-orbit qc-welcome-piece-orbit--${piece.type}`}
          style={{
            '--orbit-inset': piece.inset,
            '--orbit-duration': piece.duration,
            '--orbit-delay': piece.delay,
          }}
          aria-hidden="true"
        >
          <div className="qc-welcome-orbit-anchor">
            <div className="qc-welcome-orbit-upright">
              <QuantumPiece
                id={`welcome-${piece.type}`}
                side="white"
                possibleTypes={[piece.type]}
                size={48}
                ariaLabel={piece.label}
                svgStyleBySide={welcomePieceStyles}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="qc-welcome-superposition" aria-hidden="true">
        <QuantumPiece
          id="welcome-superposition"
          side="white"
          possibleTypes={['p', 'n', 'b', 'r', 'q', 'k']}
          size={118}
          ariaLabel="Full six-piece quantum superposition"
          svgStyleBySide={welcomePieceStyles}
        />
      </div>
    </div>
  );
}

export default function WelcomeLanding({ onChoose }) {
  const [consentChoice, setConsentChoice] = useState(() => readStoredConsent());
  const [consentPromptOpen, setConsentPromptOpen] = useState(false);
  const [consentNudge, setConsentNudge] = useState(false);
  const consentNudgeTimer = useRef(null);
  const consentResolved = consentChoice === CONSENT_CHOICE.GRANTED
    || consentChoice === CONSENT_CHOICE.DENIED;

  useEffect(() => {
    initAnalytics();
    let alreadyViewed = false;
    try {
      alreadyViewed = sessionStorage.getItem('qcWelcomeViewed') === '1';
      if (!alreadyViewed) sessionStorage.setItem('qcWelcomeViewed', '1');
    } catch (_) {
      // A storage-blocked browser may count a repeat view; never block entry.
    }
    if (!alreadyViewed) trackProductEvent(PRODUCT_EVENT.WELCOME_VIEWED);

    return () => clearTimeout(consentNudgeTimer.current);
  }, []);

  const handleConsentDecision = useCallback((choice) => {
    setConsentChoice(choice);
    setConsentPromptOpen(false);
  }, []);

  const choose = (event, choice) => {
    const { action, href } = choice;
    if (href) {
      trackProductEvent(PRODUCT_EVENT.WELCOME_CHOICE, { choice: action });
      return;
    }
    event.preventDefault();
    if (!consentResolved) {
      setConsentPromptOpen(true);
      clearTimeout(consentNudgeTimer.current);
      setConsentNudge(false);
      requestAnimationFrame(() => {
        setConsentNudge(true);
        consentNudgeTimer.current = setTimeout(() => setConsentNudge(false), 900);
      });
      return;
    }
    trackProductEvent(PRODUCT_EVENT.WELCOME_CHOICE, { choice: action });
    onChoose(action);
  };

  return (
    <main className={`qc-welcome-page${consentResolved ? '' : ' qc-welcome-page--consent-locked'}${consentNudge ? ' qc-welcome-page--consent-nudge' : ''}`}>
      <div className="qc-welcome-aurora qc-welcome-aurora--one" aria-hidden="true" />
      <div className="qc-welcome-aurora qc-welcome-aurora--two" aria-hidden="true" />
      <div className="qc-welcome-stars" aria-hidden="true" />

      <section className="qc-welcome-content" aria-labelledby="qc-welcome-title">
        <h1 id="qc-welcome-title">Welcome to <span>Quantum Chess</span></h1>
        <p className="qc-welcome-tagline">Blurring the lines between what is quantum and what is chess</p>

        <div className="qc-welcome-choice-grid" aria-label="Choose how to begin">
          {choices.map((choice) => {
            const ChoiceIcon = choice.icon;
            const locked = !choice.href && !consentResolved;
            return (
              <a
                key={choice.action}
                href={choice.href || (consentResolved ? `/play?welcome=${choice.action}` : '#privacy-choices')}
                className={`qc-welcome-card qc-welcome-card--${choice.tone}${choice.featured ? ' qc-welcome-card--featured' : ''}${locked ? ' qc-welcome-card--locked' : ''}`}
                onClick={(event) => choose(event, choice)}
                aria-disabled={locked || undefined}
              >
                <span className="qc-welcome-card-icon"><ChoiceIcon size={23} /></span>
                <span className="qc-welcome-card-copy">
                  <strong>{choice.title}</strong>
                  {choice.recommended ? (
                    <small className="qc-welcome-card-recommended">
                      <Star size={10} fill="currentColor" /> Recommended for first-time visitors
                    </small>
                  ) : <small>{choice.text}</small>}
                </span>
                {locked
                  ? (
                    <span className="qc-welcome-card-lock-seal">
                      <LockKeyhole className="qc-welcome-card-lock" size={17} aria-label="Choose a privacy option to unlock" />
                    </span>
                  )
                  : <ArrowRight className="qc-welcome-card-arrow" size={19} />}
              </a>
            );
          })}
        </div>

        <QuantumOrbit />

        <nav className="qc-welcome-footer-links" aria-label="More about Quantum Chess">
          <a href="/rules.html">Rules</a>
          <a href="/strategy.html">Strategy</a>
          <a href="/faq.html">FAQ</a>
          <a href="/about.html">About</a>
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
          <button type="button" onClick={() => setConsentPromptOpen(true)}>Privacy choices</button>
        </nav>
      </section>
      <ConsentBanner
        forceOpen={consentPromptOpen}
        emphasizeChoices={!consentResolved}
        onDecision={handleConsentDecision}
      />
    </main>
  );
}
