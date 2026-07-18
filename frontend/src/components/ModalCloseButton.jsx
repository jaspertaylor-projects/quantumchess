// frontend/src/components/ModalCloseButton.jsx
// Purpose: The standard modal close button — an X IconButton with the shared
// size/color treatment, so modals don't each restate the nine-prop bundle.
// Imports From: ./IconButton.jsx, ../theme.js
// Exported To: ../puzzle/DailyPuzzleModal.jsx, ../review/ReviewModal.jsx
import React from 'react';
import { X as XIcon } from 'lucide-react';
import IconButton from './IconButton.jsx';
import theme from '../theme.js';

export default function ModalCloseButton({
  onClick,
  ariaLabel = 'Close',
  title = 'Close',
  className,
  style = {},
  suppressTitle = false,
}) {
  return (
    <IconButton
      icon={XIcon} size={18} title={title} ariaLabel={ariaLabel}
      className={className} onClick={onClick} width={32} height={32} radius={8}
      bg={theme.secondary} color={theme.error} hoverInvert={true}
      style={style} suppressTitle={suppressTitle}
    />
  );
}
