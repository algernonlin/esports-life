// ============================================================
// rng.js — 兩種隨機來源分開管理
// seedRng：只用於「開局」產生能力/性格/天賦，可重現、可分享
// runtimeRng：用於之後所有比賽/事件判定，永遠是真隨機，不吃種子
// ============================================================

// mulberry32：簡單、快速、足夠這個用途的 seeded PRNG
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeedString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

export function randomSeedString(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function makeSeedRng(seedStr) {
  return mulberry32(hashSeedString(seedStr));
}

// runtime 用瀏覽器原生亂數即可，過程完全不可預測、不可重現
export function runtimeRng() {
  return Math.random();
}

// 常態分布近似（Box-Muller），開局能力值用這個比均勻分布更真實
export function gaussianRandom(rng, mean = 50, stdDev = 15) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return clamp(Math.round(mean + z * stdDev), 1, 99);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function randomRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function pickWeighted(rng, items, weightKey = "weight") {
  const total = items.reduce((s, i) => s + (i[weightKey] ?? 1), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item[weightKey] ?? 1;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}
