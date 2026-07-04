const fs = require('fs');
const path = require('path');

const dir = './frontend/src/assets';
const files = ['quantum_p.svg', 'quantum_n.svg', 'quantum_b.svg', 'quantum_r.svg', 'quantum_q.svg', 'quantum_k.svg'];

files.forEach(file => {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');

  // If already fixed, skip
  if (content.includes('clipPath id="trapClip"')) return;

  // Extract the polygon points
  const match = content.match(/<polygon points="([^"]+)"/);
  if (!match) return;
  const points = match[1];

  // Create defs
  const defs = `<defs>\n  <clipPath id="trapClip">\n    <polygon points="${points}" />\n  </clipPath>\n</defs>\n`;

  // Insert defs after <style>...</style>
  content = content.replace(/(<\/style>)/, `$1\n${defs}`);

  // Find the `<g transform="translate` and wrap it
  content = content.replace(/(<g transform="translate[^>]+>)/, `<g clip-path="url(#trapClip)">\n$1`);
  
  // Close the wrapper group right before the outer </g> of the rotate
  // The structure is:
  // <g transform="rotate(...)">
  //   <polygon .../>
  //   <polygon .../>
  //   <g clip-path="...">
  //     <g transform="translate(...) scale(...)">
  //       <path .../>
  //     </g>
  //   </g> <!-- need to add this -->
  // </g>
  // </svg>
  
  content = content.replace(/(<\/g>\n<\/svg>)/, `</g>\n$1`);

  fs.writeFileSync(p, content, 'utf8');
  console.log('Fixed', file);
});
