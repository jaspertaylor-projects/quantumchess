const fs = require('fs');
const path = require('path');

const srcDir = '/home/anonymous/TheCode/QuantumChess/frontend/src/assets';

function getInnerG(pieceName) {
  const content = fs.readFileSync(path.join(srcDir, `${pieceName}.svg`), 'utf-8');
  const match = content.match(/<g[^>]*>([\s\S]*?)<\/g>/);
  const transformMatch = content.match(/<g transform="([^"]+)"/);
  
  if (!match) throw new Error(`Could not parse ${pieceName}.svg`);
  return {
    innerHtml: match[1],
    transform: transformMatch ? transformMatch[1] : ''
  };
}

const basePieces = ['p', 'n', 'b', 'r', 'q', 'k'];
const pieces = {};
basePieces.forEach(p => {
  pieces[p] = getInnerG(p);
});

function generateCombo(p1, p2, outName) {
  const g1 = pieces[p1];
  const g2 = pieces[p2];

  // Scale around center (256, 256). 
  // s = 0.75. Center offset = 256 * 0.25 = 64.
  // Shift p1 left/up by (-50, -30) => translate(14, 34)
  // Shift p2 right/down by (50, 30) => translate(114, 94)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<style>:root{--band-fill:#000;--icon-color:#000;}</style>
<g transform="translate(14, 34) scale(0.75)">
  <g transform="${g1.transform}">
    ${g1.innerHtml}
  </g>
</g>
<g transform="translate(114, 94) scale(0.75)">
  <g transform="${g2.transform}">
    ${g2.innerHtml}
  </g>
</g>
</svg>`;

  fs.writeFileSync(path.join(srcDir, outName), svg);
}

const combos = [
  'pb', 'pk', 'pn', 'pq', 'pr',
  'nb', 'nk', 'nq', 'nr',
  'bk', 'bq', 'br',
  'qk', 'rq', 'rk'
];

combos.forEach(c => {
  generateCombo(c[0], c[1], `${c}_alt.svg`);
});
