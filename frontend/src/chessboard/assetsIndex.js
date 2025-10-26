// frontend/src/chessboard/assetsIndex.js
// Purpose: Centralize imports of all piece/overlay SVG URLs used by the board to enable batch raster prewarming and cache management.
// Imports From: None
// Exported To: ./rasterPrewarm.js

// Single-type assets
import imgP from '../assets/p.svg?url';
import imgN from '../assets/n.svg?url';
import imgB from '../assets/b.svg?url';
import imgR from '../assets/r.svg?url';
import imgQ from '../assets/q.svg?url';
import imgK from '../assets/k.svg?url';

// Two-type composite assets
import imgBK from '../assets/bk.svg?url';
import imgBQ from '../assets/bq.svg?url';
import imgBR from '../assets/br.svg?url';
import imgNB from '../assets/nb.svg?url';
import imgNK from '../assets/nk.svg?url';
import imgNQ from '../assets/nq.svg?url';
import imgNR from '../assets/nr.svg?url';
import imgPB from '../assets/pb.svg?url';
import imgPK from '../assets/pk.svg?url';
import imgPN from '../assets/pn.svg?url';
import imgPQ from '../assets/pq.svg?url';
import imgPR from '../assets/pr.svg?url';
import imgQK from '../assets/qk.svg?url';
import imgRK from '../assets/rk.svg?url';
import imgRQ from '../assets/rq.svg?url';

// Quantum overlay assets
import qUrlP from '../assets/quantum_p.svg?url';
import qUrlN from '../assets/quantum_n.svg?url';
import qUrlB from '../assets/quantum_b.svg?url';
import qUrlR from '../assets/quantum_r.svg?url';
import qUrlQ from '../assets/quantum_q.svg?url';
import qUrlK from '../assets/quantum_k.svg?url';

const RAW_URLS = [
  // Singles
  imgP, imgN, imgB, imgR, imgQ, imgK,
  // Pairs
  imgBK, imgBQ, imgBR, imgNB, imgNK, imgNQ, imgNR, imgPB, imgPK, imgPN, imgPQ, imgPR, imgQK, imgRK, imgRQ,
  // Overlays
  qUrlP, qUrlN, qUrlB, qUrlR, qUrlQ, qUrlK,
];

const ALL_ASSET_URLS = Array.from(new Set(RAW_URLS.filter(Boolean)));

export { ALL_ASSET_URLS };
