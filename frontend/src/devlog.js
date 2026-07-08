// frontend/src/devlog.js
// Purpose: Dev-only console logging. Diagnostic chatter (SVG prewarm, cache writes, WS/AI traces) prints in dev builds and becomes a no-op in production so the live-site console stays clean. console.error/warn are NOT wrapped — real problems should always surface.
// Imports From: None
// Exported To: ./chessboard/svgPrewarm.js, ./chessboard/svgStyler.js, ./App.jsx, ./ai/aiWorker.js

const enabled = Boolean(import.meta.env && import.meta.env.DEV);

export const devLog = enabled ? console.log.bind(console) : () => {};
export const devDebug = enabled ? console.debug.bind(console) : () => {};
