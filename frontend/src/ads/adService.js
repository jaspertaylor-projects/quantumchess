// frontend/src/ads/adService.js
// Purpose: AdSense H5 Games (Ad Placement API) integration, dormant until a
// publisher id is configured. Shows a frequency-capped interstitial at game
// end via adBreak(); no-ops entirely in dev and in unconfigured builds.
//
// To activate after AdSense approval:
//   1. frontend/.env.production  ->  VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
//   2. Replace the placeholder line in frontend/public/ads.txt with the line
//      AdSense gives you (Sites -> ads.txt).
//   3. Optional while testing: VITE_ADSENSE_TEST=1 forces Google test ads.
//
// Imports From: None
// Exported To: ../App.jsx

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || '';
const TEST_MODE = String(import.meta.env.VITE_ADSENSE_TEST || '') === '1';

// Frequency caps: players tolerate occasional interstitials; every game end
// would burn them out (and Google derates constant requests anyway).
const MIN_SECONDS_BETWEEN_ADS = 180;
const MIN_GAMES_BETWEEN_ADS = 3;

let initialized = false;
let adBreakFn = null;
let gamesSinceAd = 0;
let lastAdShownAt = 0;

export function adsEnabled() {
  return Boolean(CLIENT);
}

// Call once at app start. Injects the AdSense script and configures the
// Ad Placement API. Safe to call repeatedly; does nothing without a client id.
export function initAds() {
  if (!CLIENT || initialized || typeof document === 'undefined') return;
  initialized = true;

  window.adsbygoogle = window.adsbygoogle || [];
  adBreakFn = (o) => window.adsbygoogle.push(o);
  const adConfig = (o) => window.adsbygoogle.push(o);

  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
  s.setAttribute('data-ad-frequency-hint', '120s');
  if (TEST_MODE) s.setAttribute('data-adbreak-test', 'on');
  document.head.appendChild(s);

  adConfig({ preloadAdBreaks: 'on', sound: 'off' });
}

// Call when a game genuinely ends (winner popup opens). Counts the game and,
// if the frequency caps allow, requests an interstitial. Google returns
// control automatically when the ad closes (or immediately if none fills).
export function maybeShowGameEndAd() {
  gamesSinceAd += 1;
  if (!CLIENT || !adBreakFn) return;
  if (gamesSinceAd < MIN_GAMES_BETWEEN_ADS) return;
  if (Date.now() - lastAdShownAt < MIN_SECONDS_BETWEEN_ADS * 1000) return;

  adBreakFn({
    type: 'next',
    name: 'game_end',
    adBreakDone: (info) => {
      if (info && info.breakStatus === 'viewed') {
        lastAdShownAt = Date.now();
        gamesSinceAd = 0;
      }
    },
  });
}
