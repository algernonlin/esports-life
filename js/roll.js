// ============================================================
// roll.js — 開局擲骰（吃 seedRng，可重現、可分享）
// ============================================================
import { STAT_KEYS, PERSONALITY_TRAITS, POSITION_SPECIALTY, INNATE_TALENTS } from "./state.js";
import { gaussianRandom, clamp, randomRange } from "./rng.js";

const RARITY_WEIGHT = { common: 70, rare: 25, legendary: 5 };

export function rollStats(seedRng, position) {
  const stats = {};
  for (const key of STAT_KEYS) {
    stats[key] = gaussianRandom(seedRng, 50, 15);
  }
  stats[POSITION_SPECIALTY[position]] = gaussianRandom(seedRng, 52, 15);
  return stats;
}

export function rollPersonality(seedRng) {
  const personality = {};
  for (const trait of PERSONALITY_TRAITS) {
    if (trait.type === "unipolar") {
      personality[trait.key] = clamp(Math.round(randomRange(seedRng, 5, 80)), 0, 100);
    } else {
      personality[trait.key] = clamp(Math.round(randomRange(seedRng, -80, 80)), -100, 100);
    }
  }
  return personality;
}

export function rollTalents(seedRng, maxCount = 2) {
  const talents = [];
  const roll = seedRng();
  let count = 0;
  if (roll > 0.7) count = 1;
  if (roll > 0.93) count = 2;

  const pool = [...INNATE_TALENTS];
  for (let i = 0; i < count && pool.length; i++) {
    const total = pool.reduce((s, t) => s + RARITY_WEIGHT[t.rarity], 0);
    let r = seedRng() * total;
    let picked = pool[0];
    for (const t of pool) {
      r -= RARITY_WEIGHT[t.rarity];
      if (r <= 0) { picked = t; break; }
    }
    talents.push(picked);
    const idx = pool.indexOf(picked);
    pool.splice(idx, 1);
  }
  return talents;
}
