// ============================================================
// roll.js — 開局擲骰（吃 seedRng，可重現、可分享）
// ============================================================
import { STAT_KEYS, PERSONALITY_TRAITS, INNATE_TALENTS } from "./state.js";
import { gaussianRandom, clamp, randomRange } from "./rng.js";
import { CHAMPIONS } from "./champions.js";

const RARITY_WEIGHT = { common: 67, rare: 25, legendary: 8 };

export function rollStats(seedRng, position, talents = []) {
  const stats = {};
  for (const key of STAT_KEYS) {
    // 開局分布從 mean50/std15 收斂到 mean48/std13：先發判定改成拿「該路需求」比對後比較容易達標，
    // 開局要稍微壓低極端高分的機率，避免變成每個角色隨便都能一開局就先發
    stats[key] = gaussianRandom(seedRng, 48, 13);
  }
  // 專精值(節奏/單線抗壓/運營/視野控制)不再獨立roll，改用computeSpecialty()從這6個核心即時算出來

  // 孤狼：反應/意識加成，溝通/領導減損——單打獨鬥能力強，但不擅長打團體戰
  if (talents.some((t) => t.id === "lone_wolf")) {
    stats["反應"] = clamp(stats["反應"] + 10, 1, 99);
    stats["意識"] = clamp(stats["意識"] + 10, 1, 99);
    stats["溝通"] = clamp(stats["溝通"] - 12, 1, 99);
    stats["領導"] = clamp(stats["領導"] - 12, 1, 99);
  }

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
  if (roll > 0.99) count = 3; // 頂端1%機率骰到3個天賦

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

// -------------------------------------------------------------
// 開局基礎英雄池：業餘時期多少會練過幾隻該位置的英雄，
// 不會整個英雄清單空白開局。抽3-5隻本命位置英雄，各給隨機基礎熟練度(15-45)
// -------------------------------------------------------------
export function rollInitialChampions(seedRng, position, talents = []) {
  const pool = CHAMPIONS.filter((c) => c.primary === position);

  // 三板斧：只練3隻英雄但練到滿，其他完全沒碰過——極端的專精型開局
  if (talents.some((t) => t.id === "three_axes")) {
    const poolCopy = [...pool];
    const picked = [];
    for (let i = 0; i < 3 && poolCopy.length; i++) {
      const idx = Math.floor(seedRng() * poolCopy.length);
      picked.push(poolCopy[idx]);
      poolCopy.splice(idx, 1);
    }
    const result = {};
    for (const champ of picked) {
      result[champ.id] = { proficiency: 100, lastPracticedStage: 0, signature: true }; // signature標記給champions.js判斷訓練效率用
    }
    return result;
  }

  const count = 3 + Math.floor(seedRng() * 3); // 3~5隻
  const picked = [];
  const poolCopy = [...pool];
  for (let i = 0; i < count && poolCopy.length; i++) {
    const idx = Math.floor(seedRng() * poolCopy.length);
    picked.push(poolCopy[idx]);
    poolCopy.splice(idx, 1);
  }
  const result = {};
  for (const champ of picked) {
    result[champ.id] = { proficiency: Math.round(15 + seedRng() * 30), lastPracticedStage: 0 };
  }
  return result;
}
