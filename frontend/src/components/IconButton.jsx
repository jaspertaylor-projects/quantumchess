// frontend/src/components/IconButton.jsx
// Purpose: Reusable icon button with hover-invert behavior for background and icon colors.
// Imports From: ../theme.js
// Exported To: ../tray/SideTray.jsx

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
  shadow = theme.shadow,
}) {
  const [hovered, setHovered] = useState(false);

  const { bgColor, iconColor } = useMemo(() => {
    if (hovered && hoverInvert) {
      return { bgColor: color, iconColor: bg };
    }
    return { bgColor: bg, iconColor: color };
  }, [hovered, hoverInvert, bg, color]);

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
        ...style,
      },
    }),
    [width, height, radius, bgColor, iconColor, shadow, style]
  );

  return (
    <button
      type="button"
      title={title}
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
    </button>
  );
}
