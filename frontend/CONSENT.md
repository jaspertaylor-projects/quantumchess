# Consent deployment checklist

The welcome-page control records the site's first-party privacy preference and
updates Google Consent Mode. It deliberately unlocks play after either
`Accept all` or `Necessary only`; access must never depend on accepting
optional processing.

The site control is not, by itself, a Google-certified IAB TCF consent
management platform. For AdSense traffic in the EEA, UK, and Switzerland,
keep Google's certified message published:

1. In AdSense, open **Privacy & messaging → European regulations**.
2. Confirm the Quantum Chess message is **Published** for
   `quantumchess.ninja` and uses Google's certified CMP.
3. Offer **Consent**, **Do not consent**, and **Manage options** on the first
   layer; do not remove or visually suppress the refusal path.
4. In the message settings, enable Consent Mode for advertising and analytics
   purposes so the certified CMP remains authoritative in covered regions.
5. Verify in a private browser session using an EEA test location. Refusing
   must still allow the game to open, while `ad_storage`, `ad_user_data`,
   `ad_personalization`, and `analytics_storage` remain denied.

The persistent **Privacy choices** control on the welcome page reopens the
site preference. Google's message must separately retain its own
privacy-options/revocation entry point wherever its regional policy requires
one.

References:

- https://support.google.com/adsense/answer/13554116
- https://support.google.com/adsense/answer/10961068
- https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/grounds-processing/when-consent-valid_en
