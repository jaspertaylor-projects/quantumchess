// Purpose: Keep publisher content ad-free while preserving the two explicit
// SDK entry documents used by H5 game ads and the solved-puzzle display unit.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FRONTEND_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT = path.join(FRONTEND_ROOT, 'public');
const ADSENSE_SCRIPT = 'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

const read = (relativePath) => readFileSync(path.join(FRONTEND_ROOT, relativePath), 'utf8');

describe('static AdSense surface allowlist', () => {
  it('loads the SDK only from the app and puzzle entry documents', () => {
    expect(read('index.html')).toContain(ADSENSE_SCRIPT);
    expect(read('puzzle.html')).toContain(ADSENSE_SCRIPT);
  });

  it('keeps the learning library and informational pages ad-free', () => {
    const guideArticles = readdirSync(path.join(PUBLIC_ROOT, 'guides'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => `public/guides/${name}`);
    const adFreePages = [
      'public/guides.html',
      ...guideArticles,
      'rules.html',
      'public/strategy.html',
      'public/faq.html',
      'public/about.html',
      'public/privacy.html',
      'public/terms.html',
    ];

    for (const page of adFreePages) {
      expect(read(page), page).not.toContain(ADSENSE_SCRIPT);
    }
  });
});
