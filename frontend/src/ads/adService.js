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
let adConsentGranted = null; // null = not yet decided

export function adsEnabled() {
  return Boolean(CLIENT);
}

// Google Consent Mode v2 helper. Called by the consent banner with the
// user's choice. Grants/denies ad storage + personalization signals; also
// falls back to non-personalized ads for AdSense when consent is denied.
export function setAdConsent(granted) {
  adConsentGranted = Boolean(granted);
  if (typeof window === 'undefined') return;
  try {
    window.dataLayer = window.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params
    function gtag() { window.dataLayer.push(arguments); }
    gtag('consent', 'update', {
      ad_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: granted ? 'granted' : 'denied',
    });
    if (!granted) {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.requestNonPersonalizedAds = 1;
    }
  } catch (_) {
    // consent signaling is best-effort
  }
}

// Call once at app start. Injects the AdSense script and configures the
// Ad Placement API. Safe to call repeatedly; does nothing without a client id.
export function initAds() {
  if (!CLIENT || initialized || typeof document === 'undefined') return;
  initialized = true;

  window.adsbygoogle = window.adsbygoogle || [];
  adBreakFn = (o) => window.adsbygoogle.push(o);
  const adConfig = (o) => window.adsbygoogle.push(o);

  // Consent Mode v2 defaults: deny advertising signals until the consent
  // banner grants them (EEA/UK/CH-friendly). A prior stored choice is
  // re-applied by the banner via setAdConsent().
  try {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500,
    });
  } catch (_) {
    // best-effort
  }
  if (adConsentGranted === false) {
    window.adsbygoogle.requestNonPersonalizedAds = 1;
  }

  // The AdSense script is loaded statically from index.html <head>. Only
  // inject it here if it isn't already present (avoids a duplicate tag).
  if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
    s.setAttribute('data-ad-frequency-hint', '120s');
    if (TEST_MODE) s.setAttribute('data-adbreak-test', 'on');
    document.head.appendChild(s);
  }

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
