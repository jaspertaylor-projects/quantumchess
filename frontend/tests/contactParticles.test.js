import { describe, expect, it } from 'vitest';
import {
  buildContactParticles,
  CONTACT_PARTICLE_LAUNCH_DELAY_MS,
  CONTACT_PARTICLE_MAX_ARRIVAL_MS,
} from '../src/chessboard/contactParticles.js';

describe('contact particle paths', () => {
  it('launches every particle from the exact landing-square center', () => {
    const centers = { e4: { x: 45, y: 35 }, f5: { x: 55, y: 25 } };
    const particles = buildContactParticles({
      originSquare: 'e4',
      groups: [{ cls: 'zap', squares: ['f5'] }],
      centerOf: (square) => centers[square],
      effectKey: 1,
    });
    expect(particles).toHaveLength(4);
    for (const particle of particles) {
      expect(particle.x0).toBe(45);
      expect(particle.y0).toBe(35);
      expect(particle.tx).toBe(10);
      expect(particle.ty).toBe(-10);
      expect(particle.delay).toBeGreaterThanOrEqual(CONTACT_PARTICLE_LAUNCH_DELAY_MS);
      expect(particle.delay + particle.dur).toBeLessThanOrEqual(CONTACT_PARTICLE_MAX_ARRIVAL_MS);
    }
  });
});
