// frontend/src/tutorial/TutorialModal.jsx
// Purpose: Step-by-step illustrated tutorial. Opens automatically on first
// visit, or on a specific lesson from the rulebook's contents page. Each
// lesson links back to its rulebook section.
// Imports From: ../theme.js, ../components/IconButton.jsx, ./lessons.js, ./MiniBoard.jsx
// Exported To: ../App.jsx

import React, { useEffect, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import { X as XIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, GraduationCap as GraduationCapIcon, BookOpen as BookOpenIcon, Atom as AtomIcon } from 'lucide-react';
import { LESSONS } from './lessons.js';
import MiniBoard from './MiniBoard.jsx';
import InteractiveExercise from './InteractiveExercise.jsx';

export default function TutorialModal({ open = false, onClose = () => {}, initialLessonId = null, onOpenRules = null, pieceSvgStyles = null }) {
  const [lessonIdx, setLessonIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (open) {
      const idx = initialLessonId ? Math.max(0, LESSONS.findIndex((l) => l.id === initialLessonId)) : 0;
      setLessonIdx(idx);
      setStepIdx(0);
    }
  }, [open, initialLessonId]);

  if (!open) return null;

  const lesson = LESSONS[lessonIdx];
  const step = lesson.steps[stepIdx];
  const isFirstStep = lessonIdx === 0 && stepIdx === 0;
  const isLastStep = lessonIdx === LESSONS.length - 1 && stepIdx === lesson.steps.length - 1;

  const goNext = () => {
    if (stepIdx < lesson.steps.length - 1) {
      setStepIdx(stepIdx + 1);
    } else if (lessonIdx < LESSONS.length - 1) {
      setLessonIdx(lessonIdx + 1);
      setStepIdx(0);
    } else {
      onClose();
    }
  };
  const goPrev = () => {
    if (stepIdx > 0) {
      setStepIdx(stepIdx - 1);
    } else if (lessonIdx > 0) {
      setLessonIdx(lessonIdx - 1);
      setStepIdx(LESSONS[lessonIdx - 1].steps.length - 1);
    }
  };

  const styles = {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1001,
    },
    panel: {
      width: 'min(94vw, 640px)',
      maxHeight: '90vh',
      overflowY: 'auto',
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      color: theme.textPrimary,
      padding: 16,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
    kicker: {
      fontSize: 11,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      fontWeight: 800,
    },
    title: { margin: 0, fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.03em' },
    body: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 14,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      padding: 16,
    },
    stepTitle: { margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.02em', textAlign: 'center' },
    text: { margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.textPrimary, maxWidth: 520 },
    physicsBox: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      maxWidth: 520,
      fontSize: 12.5,
      lineHeight: 1.55,
      color: theme.textSecondary,
      borderLeft: `3px solid ${theme.primary}`,
      paddingLeft: 10,
      margin: 0,
    },
    physicsLabel: {
      color: theme.primary,
      fontWeight: 800,
      fontStyle: 'normal',
    },
    rulesLink: {
      background: 'none',
      border: 'none',
      color: theme.primary,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '0.03em',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: 0,
    },
    footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    stepDots: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'center' },
    dot: (active) => ({
      width: 7,
      height: 7,
      borderRadius: 999,
      background: active ? theme.primary : theme.border,
      cursor: 'pointer',
      boxShadow: active ? `0 0 8px ${theme.primary}` : 'none',
    }),
    navBtn: (disabled) => ({
      padding: '8px 14px',
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      background: disabled ? 'transparent' : theme.secondary,
      color: disabled ? theme.textSecondary : theme.textPrimary,
      fontWeight: 800,
      fontSize: 13,
      cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      opacity: disabled ? 0.5 : 1,
    }),
    primaryBtn: {
      padding: '8px 16px',
      borderRadius: 8,
      border: 'none',
      backgroundColor: theme.primary,
      color: theme.secondary,
      fontWeight: 800,
      fontSize: 13,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    },
    skip: {
      background: 'none',
      border: 'none',
      color: theme.textSecondary,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 700,
      padding: 0,
    },
    progress: { fontSize: 11, color: theme.textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 800 },
  };

  return (
    <div className="qc-tutorial-backdrop" style={styles.backdrop} onClick={onClose}>
      <div
        className="qc-tutorial-panel"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qc-tutorial-title"
      >
        <div className="qc-tutorial-header" style={styles.header}>
          <div style={styles.headerLeft}>
            <GraduationCapIcon size={20} color={theme.primary} />
            <div>
              <div style={styles.kicker}>Tutorial · Lesson {lessonIdx + 1} of {LESSONS.length}</div>
              <h2 id="qc-tutorial-title" style={styles.title}>{lesson.title}</h2>
            </div>
          </div>
          <IconButton
            icon={XIcon}
            size={20}
            title="Close tutorial"
            ariaLabel="Close tutorial"
            className="qc-tutorial-close"
            onClick={onClose}
            width={36}
            height={36}
            radius={8}
            bg={theme.secondary}
            color={theme.error}
            hoverInvert={true}
            shadow="transparent"
          />
        </div>

        <div className="qc-tutorial-body" style={styles.body}>
          {step.interactive ? (
            <InteractiveExercise
              key={`ex-${lessonIdx}-${stepIdx}`}
              spec={step.interactive}
              svgStyleBySide={pieceSvgStyles}
            />
          ) : step.board ? (
            <MiniBoard
              cell={Math.max(40, Math.min(64, Math.floor(360 / Math.max(step.board.files || 6, step.board.ranks || 6))))}
              svgStyleBySide={pieceSvgStyles}
              {...step.board}
            />
          ) : null}
          <h3 className="qc-tutorial-step-title" style={styles.stepTitle}>{step.title}</h3>
          {step.text.map((t, i) => (
            <p key={`t-${i}`} style={styles.text}>{t}</p>
          ))}
          {step.physics ? (
            <div className="qc-tutorial-physics" style={styles.physicsBox}>
              <AtomIcon size={15} color={theme.primary} style={{ flex: 'none', marginTop: 2 }} />
              <span>
                <em style={styles.physicsLabel}>In quantum terms: </em>
                {step.physics}
              </span>
            </div>
          ) : null}
          {onOpenRules ? (
            <button
              type="button"
              className="qc-tutorial-rules-link"
              style={styles.rulesLink}
              onClick={() => onOpenRules(lesson.rulesPage)}
            >
              <BookOpenIcon size={14} /> Read the full rules for this topic
            </button>
          ) : null}
        </div>

        <div className="qc-tutorial-step-dots" style={styles.stepDots} aria-hidden="true">
          {lesson.steps.map((_, i) => (
            <span key={`d-${i}`} style={styles.dot(i === stepIdx)} onClick={() => setStepIdx(i)} />
          ))}
        </div>

        <div className="qc-tutorial-footer" style={styles.footer}>
          <button type="button" className="qc-tutorial-skip" style={styles.skip} onClick={onClose}>
            Skip tutorial
          </button>
          <span style={styles.progress}>Step {stepIdx + 1} / {lesson.steps.length}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="qc-tutorial-prev"
              style={styles.navBtn(isFirstStep)}
              onClick={goPrev}
              disabled={isFirstStep}
            >
              <ChevronLeftIcon size={15} /> Back
            </button>
            <button type="button" className="qc-tutorial-next" style={styles.primaryBtn} onClick={goNext}>
              {isLastStep ? 'Finish' : 'Next'} {isLastStep ? null : <ChevronRightIcon size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
