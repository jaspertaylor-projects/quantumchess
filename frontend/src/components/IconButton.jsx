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
  suppressTitle = false, // hide native tooltip (a neon coach-sign covers it)
  onHoverChange = null, // report hover so a parent can show a coach-sign
}) {
  const [hovered, setHovered] = useState(false);
  const setHover = (v) => { setHovered(v); if (onHoverChange) onHoverChange(v); };

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
        position: glow ? 'relative' : undefined,
        // Pulse only when NOT hovered; on hover freeze to a static glow.
        ...(glow && !hovered
          ? { animation: 'qc-onboard-pulse 1.5s ease-in-out infinite', ['--qc-glow']: glowColor }
          : {}),
        ...(glow && hovered
          ? { boxShadow: `0 0 12px 3px ${glowColor}, 0 2px 8px ${shadow}` }
          : {}),
        ...style,
      },
    }),
    [width, height, radius, bgColor, iconColor, shadow, style, glow, glowColor, hovered]
  );

  return (
    <button
      type="button"
      title={suppressTitle ? undefined : title}
      aria-label={ariaLabel || title || 'icon button'}
      className={`qc-icon-button ${className}`.trim()}
      style={styles.root}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      {Icon ? <Icon size={size} color={iconColor} /> : null}
    </button>
  );
}
