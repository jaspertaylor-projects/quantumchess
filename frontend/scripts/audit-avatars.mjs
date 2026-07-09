// Purpose: Verify that avatar image files match the code catalogs that own
// them. Bot ids/tiers live in src/ai/bots.js; character avatar paths live in
// src/characters/characterCatalog.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOTS } from '../src/ai/bots.js';
import { CHARACTERS } from '../src/characters/characterCatalog.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(frontendRoot, 'public');
const botsDir = path.join(publicDir, 'bots');
const avatarsDir = path.join(publicDir, 'avatars');

function listFiles(dir, predicate = () => true) {
  const out = [];
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(full)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function relPublic(fullPath) {
  return `/${path.relative(publicDir, fullPath).split(path.sep).join('/')}`;
}

function pngName(fullPath) {
  return path.basename(fullPath);
}

const expectedBotPngs = new Set(BOTS.map((b) => `${b.id}.png`));
const playerSeatPngs = new Set(['anonymous.png', 'stranger.png']);
const actualBotPngs = new Set(listFiles(botsDir, (f) => f.endsWith('.png')).map(pngName));

const missingBotPngs = [...expectedBotPngs].filter((name) => !actualBotPngs.has(name));
const extraBotPngs = [...actualBotPngs].filter((name) => !expectedBotPngs.has(name) && !playerSeatPngs.has(name));
const missingPlayerSeatPngs = [...playerSeatPngs].filter((name) => !actualBotPngs.has(name));

const expectedCharacterImages = new Set(CHARACTERS.map((c) => c.image).filter(Boolean));
const actualCharacterImages = new Set(listFiles(avatarsDir, (f) => f.endsWith('.png')).map(relPublic));
const missingCharacterImages = [...expectedCharacterImages].filter((name) => !actualCharacterImages.has(name));
const extraCharacterImages = [...actualCharacterImages].filter((name) => !expectedCharacterImages.has(name));

const duplicateBotIds = BOTS
  .map((b) => b.id)
  .filter((id, idx, arr) => arr.indexOf(id) !== idx);
const duplicateCharacterIds = CHARACTERS
  .map((c) => c.id)
  .filter((id, idx, arr) => arr.indexOf(id) !== idx);

function printList(label, items) {
  if (!items.length) return;
  console.log(`\n${label}`);
  for (const item of items) console.log(`  - ${item}`);
}

console.log(`Bot catalog: ${BOTS.length} bots (${BOTS.filter((b) => !b.premium).length} free, ${BOTS.filter((b) => b.premium).length} premium)`);
console.log(`Bot avatar files: ${actualBotPngs.size} pngs (${playerSeatPngs.size} player-seat assets)`);
console.log(`Character catalog: ${CHARACTERS.length} characters`);
console.log(`Character avatar files: ${actualCharacterImages.size} pngs`);

printList('Missing bot avatar pngs:', missingBotPngs);
printList('Unexpected bot avatar pngs:', extraBotPngs);
printList('Missing player-seat bot pngs:', missingPlayerSeatPngs);
printList('Missing character avatar pngs:', missingCharacterImages);
printList('Unexpected character avatar pngs:', extraCharacterImages);
printList('Duplicate bot ids:', [...new Set(duplicateBotIds)]);
printList('Duplicate character ids:', [...new Set(duplicateCharacterIds)]);

const failed = [
  missingBotPngs,
  extraBotPngs,
  missingPlayerSeatPngs,
  missingCharacterImages,
  extraCharacterImages,
  duplicateBotIds,
  duplicateCharacterIds,
].some((items) => items.length > 0);

if (failed) {
  console.log('\nAvatar audit failed.');
  process.exit(1);
}

console.log('\nAvatar audit passed.');
