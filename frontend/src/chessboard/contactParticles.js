// Shared contact-particle geometry for the live, review, and mini boards.
// The mover gets a short landing beat, then every mote travels center-to-center.

export const CONTACT_PARTICLE_LAUNCH_DELAY_MS = 180;
const CONTACT_PARTICLE_DELAY_JITTER_MS = 120;
const CONTACT_PARTICLE_MIN_TRAVEL_MS = 430;
const CONTACT_PARTICLE_TRAVEL_JITTER_MS = 240;

// Impact-only effects use this upper bound so they begin after every mote has
// reached the contacted square, without changing the particle animation.
export const CONTACT_PARTICLE_MAX_ARRIVAL_MS =
  CONTACT_PARTICLE_LAUNCH_DELAY_MS
  + CONTACT_PARTICLE_DELAY_JITTER_MS
  + CONTACT_PARTICLE_MIN_TRAVEL_MS
  + CONTACT_PARTICLE_TRAVEL_JITTER_MS;

function jitter01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 8) & 0xffff) / 0x10000;
}

export function buildContactParticles({
  originSquare,
  groups,
  centerOf,
  effectKey,
  particlesPerTarget = 4,
}) {
  if (!originSquare || typeof centerOf !== 'function') return [];
  const origin = centerOf(originSquare);
  if (!origin) return [];
  const particles = [];
  for (const group of groups || []) {
    for (const square of group.squares || []) {
      if (!square || square === originSquare) continue;
      const target = centerOf(square);
      if (!target) continue;
      for (let i = 0; i < particlesPerTarget; i++) {
        const speedJitter = jitter01(`${square}:${i}:speed`);
        const delayJitter = jitter01(`${square}:${i}:delay`);
        particles.push({
          key: `${group.cls}-${square}-${i}-${effectKey}`,
          cls: group.cls,
          x0: origin.x,
          y0: origin.y,
          tx: target.x - origin.x,
          ty: target.y - origin.y,
          delay: CONTACT_PARTICLE_LAUNCH_DELAY_MS + Math.round(delayJitter * CONTACT_PARTICLE_DELAY_JITTER_MS),
          dur: Math.round(CONTACT_PARTICLE_MIN_TRAVEL_MS + speedJitter * CONTACT_PARTICLE_TRAVEL_JITTER_MS),
        });
      }
    }
  }
  return particles;
}
