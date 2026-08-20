// ============================================================
// injuries.js — 傷病疊加/慢性化，跟體能連動
// ============================================================
import { clamp } from "./rng.js";

const INJURY_POOL = [
  { id: "wrist_strain", name: "手腕肌腱炎", affectedStats: { "反應": -6, "意識": -4 }, baseDuration: 2 },
  { id: "neck_pain",     name: "頸椎壓迫",   affectedStats: { "反應": -4, "意識": -3 }, baseDuration: 2 },
  { id: "burnout",       name: "精神倦怠",   affectedStats: { "抗壓": -5 },              baseDuration: 3 },
];

export function rollInjuryChance(character, runtimeRng) {
  const staminaFactor = (50 - character.dynamic["體能"]) / 100;
  let prob = clamp(0.04 + staminaFactor * 0.15, 0.02, 0.35);
  if (character.talents?.some((t) => t.id === "glass_body")) prob *= 1.3; // 玻璃體質：受傷機率提高

  if (runtimeRng() < prob) {
    const pick = INJURY_POOL[Math.floor(runtimeRng() * INJURY_POOL.length)];

    // 鐵手腕：手部相關傷病有機率直接免疫
    if (pick.id === "wrist_strain" && character.talents?.some((t) => t.id === "iron_wrist")) {
      if (runtimeRng() < 0.5) return null;
    }

    const severity = 1 + Math.floor(runtimeRng() * 3);
    character.injuries.push({
      id: pick.id, name: pick.name, severity,
      affectedStats: pick.affectedStats, duration: pick.baseDuration + severity - 1, chronic: false,
    });
    return pick;
  }
  return null;
}

export function tickInjuries(character, runtimeRng) {
  const remaining = [];
  for (const inj of character.injuries) {
    inj.duration -= 1;
    if (inj.duration <= 0) {
      const chronicProb = 0.1 * inj.severity;
      if (runtimeRng() < chronicProb && !character.chronicInjuries.includes(inj.name)) {
        character.chronicInjuries.push(inj.name);
      }
    } else {
      remaining.push(inj);
    }
  }
  character.injuries = remaining;
}
