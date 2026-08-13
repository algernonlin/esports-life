// ============================================================
// dice.js — 把「機率」轉換成「2d6 骰子門檻值」，並提供擲骰結果
// 設計：sum >= target 視為成功。用累積分布表找最接近原始機率的門檻。
// ============================================================

// 2d6 總和 → 累積機率 P(sum >= target)，共 36 種排列組合
const CUMULATIVE_TABLE = [
  { target: 2,  prob: 36 / 36 },
  { target: 3,  prob: 35 / 36 },
  { target: 4,  prob: 33 / 36 },
  { target: 5,  prob: 30 / 36 },
  { target: 6,  prob: 26 / 36 },
  { target: 7,  prob: 21 / 36 },
  { target: 8,  prob: 15 / 36 },
  { target: 9,  prob: 10 / 36 },
  { target: 10, prob: 6 / 36 },
  { target: 11, prob: 3 / 36 },
  { target: 12, prob: 1 / 36 },
];

// 找出跟原始機率最接近的門檻值（例如 70% → 6，實際機率 72.2%）
export function probabilityToTarget(p) {
  let best = CUMULATIVE_TABLE[0];
  let bestDiff = Infinity;
  for (const row of CUMULATIVE_TABLE) {
    const diff = Math.abs(row.prob - p);
    if (diff < bestDiff) { bestDiff = diff; best = row; }
  }
  return best;
}

const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
export function faceChar(n) { return DICE_FACES[n - 1]; }

export function rollTwoDice(rng) {
  const d1 = Math.floor(rng() * 6) + 1;
  const d2 = Math.floor(rng() * 6) + 1;
  return { d1, d2, sum: d1 + d2 };
}
