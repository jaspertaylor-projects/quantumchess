// frontend/src/analytics/analytics.js
// Purpose: Google Analytics 4 integration, dormant until a measurement id is
// configured — the same pattern as ads/adService.js. Consent-Mode-aware:
// analytics_storage defaults to denied and is flipped by the same consent
// decision the ad banner/CMP collects, so EEA visitors are measured
// cookielessly unless they consent.
//
// To activate:
//   1. Create a GA4 property (analytics.google.com) for quantumchess.ninja
//      and copy its Measurement ID (G-XXXXXXXXXX).
//   2. frontend/.env.production  ->  VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
//   3. Redeploy the frontend. Verify in GA4 Realtime.
//
// Imports From: None
// Exported To: ../App.jsx, ../components/ConsentBanner.jsx

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';

let initialized = false;

function gtag() {
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

export function analyticsEnabled() {
  return Boolean(MEASUREMENT_ID);
}

// Call once at app start (alongside initAds). Safe to call repeatedly;
// no-ops entirely when no measurement id is configured.
export function initAnalytics() {
  if (!MEASUREMENT_ID || initialized || typeof document === 'undefined') return;
  initialized = true;

  try {
    // Deny analytics cookies until the consent banner / Google CMP grants
    // them. GA4 still records consentless, cookieless pings, so traffic
    // counts stay roughly right even when visitors decline.
    gtag('consent', 'default', { analytics_storage: 'denied', wait_for_update: 500 });
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
  } catch (_) {
    // analytics is never allowed to break the game
  }

  if (!document.querySelector('script[src*="googletagmanager.com/gtag"]')) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(s);
  }
}

// Called with the visitor's consent-banner choice (same decision that drives
// ad consent in adService.setAdConsent).
export function setAnalyticsConsent(granted) {
  if (typeof window === 'undefined') return;
  try {
    gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
  } catch (_) {
    // best-effort
  }
}

// Fire-and-forget custom event. Params must be flat key/value pairs.
export function trackEvent(name, params = {}) {
  if (!MEASUREMENT_ID || !initialized) return;
  try {
    gtag('event', name, params);
  } catch (_) {
    // best-effort
  }
}
