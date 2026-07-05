// frontend/src/components/IconButton.jsx
// Purpose: Reusable icon button with hover-invert behavior for background and icon colors.
// Imports From: ../theme.js
// Exported To: ../tray/SideTray.jsx, ../settings/SettingsModal.jsx

import React, { useMemo, useState } from 'react';
import theme from '../theme.js';

export default function IconButton({
  icon: Icon,
  title = '',
  ariaLabel = '',
  onClick = () => {},
  className = '',
  style = {},
  size = 18,
  width = 36,
  height = 36,
  radius = 8,
  bg = theme.primary,
  color = theme.secondary,
  hoverInvert = true,
  hoverBg,
  hoverColor,
  shadow = theme.shadow,
  glow = false, // onboarding: pulse to draw attention
  glowColor = '#4fc3f7',
  hint = '', // onboarding: neon sign shown on hover
  hintColor = '#4fc3f7',
}) {
  const [hovered, setHovered] = useState(false);

  const { bgColor, iconColor } = useMemo(() => {
    if (hovered && hoverInvert) {
      return {
        bgColor: hoverBg !== undefined ? hoverBg : color,
        iconColor: hoverColor !== undefined ? hoverColor : bg,
      };
    }
    return { bgColor: bg, iconColor: color };
  }, [hovered, hoverInvert, bg, color, hoverBg, hoverColor]);

  const styles = useMemo(
    () => ({
      root: {
        width,
        height,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius,
        border: 'none',
        padding: 0,
        backgroundColor: bgColor,
        color: iconColor,
        cursor: 'pointer',
        boxShadow: `0 2px 8px ${shadow}`,
        transition: 'background-color 0.2s ease, color 0.2s ease, transform 0.06s ease',
        WebkitTapHighlightColor: 'transparent',
        position: glow || hint ? 'relative' : undefined,
        // Pulse only when NOT hovered; on hover freeze to a static glow so the
        // neon hint (a child of this button) doesn't scale/pulse with it.
        ...(glow && !hovered
          ? { animation: 'qc-onboard-pulse 1.5s ease-in-out infinite', ['--qc-glow']: glowColor }
          : {}),
        ...(glow && hovered
          ? { boxShadow: `0 0 12px 3px ${glowColor}, 0 2px 8px ${shadow}` }
          : {}),
        ...style,
      },
    }),
    [width, height, radius, bgColor, iconColor, shadow, style, glow, glowColor, hint, hovered]
  );

  return (
    <button
      type="button"
      title={hint ? undefined : title}
      aria-label={ariaLabel || title || 'icon button'}
      className={`qc-icon-button ${className}`.trim()}
      style={styles.root}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {Icon ? <Icon size={size} color={iconColor} /> : null}
      {hint && hovered ? (
        <span
          className="qc-onboard-hint"
          style={{
            position: 'absolute',
            top: '118%',
            right: 0,
            whiteSpace: 'nowrap',
            zIndex: 80,
            padding: '10px 16px',
            borderRadius: 10,
            background: 'rgba(10,12,20,0.96)',
            border: `1.5px solid ${hintColor}`,
            color: hintColor,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.03em',
            textShadow: `0 0 6px ${hintColor}`,
            boxShadow: `0 0 10px ${hintColor}88, 0 0 2px ${hintColor} inset`,
            pointerEvents: 'none',
          }}
        >
          {hint}
        </span>
      ) : null}
    </button>
  );
}
