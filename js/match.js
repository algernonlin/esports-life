// ============================================================
// match.js — 比賽模擬公式
// 個人表現與隊伍勝負分開計算，才會出現「carry但輸」的狀況
// ============================================================
import { META_VERSIONS, POSITION_SPECIALTY } from "./state.js";
import { clamp, randomRange } from "./rng.js";
import { pickMatchChampionFit } from "./champions.js";

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// 大賽（季後賽/國際賽）抗壓加權比一般賽段更高
export function personalPerformance(character, { isMajorEvent = false } = {}) {
  const s = character.stats;
  const specialty = POSITION_SPECIALTY[character.meta.position];
  const specialtyVal = s[specialty] ?? 50;
  const metaFit = character.seasonRecord.currentMeta ? 1 : 0.85; // 版本剛切換可再細調

  let baseAbility =
    s["反應"] * 0.3 +
    s["意識"] * 0.25 +
    specialtyVal * 0.2 +
    s["版本適應力"] * metaFit * 0.15 +
    s["抗壓"] * (isMajorEvent ? 0.15 : 0.08) * 0.1 * 10; // 大賽加權

  // 心態、傷病 debuff
  const moodMod = 1 + (character.dynamic.心態 - 50) / 200;
  const injuryPenalty = character.injuries.reduce((acc, inj) => acc + (inj.affectedStats?.[specialty] ? 0.03 * inj.severity : 0), 0);
  baseAbility = baseAbility * moodMod * (1 - injuryPenalty);

  // 英雄適配層：能力值85% + 英雄熟練度/版本英雄加成15%，下限0.4不會讓玩家卡死
  const { fit } = pickMatchChampionFit(character, character.meta.position, character.seasonRecord.currentMeta);
  const perf = baseAbility * 0.85 + baseAbility * fit * 0.15;

  return clamp(perf, 1, 99);
}

export function teamMatchValue(character, positionWeights, { isMajorEvent = false } = {}) {
  const myPos = character.meta.position;
  const myWeight = positionWeights[myPos] ?? 0.2;
  const myPerf = personalPerformance(character, { isMajorEvent });

  // 其餘四路：改用隊伍「各路能力值」加權平均，而不是單一 baseStrength
  const otherPositions = Object.keys(positionWeights).filter((p) => p !== myPos);
  const otherWeightTotal = otherPositions.reduce((s, p) => s + positionWeights[p], 0) || 1;
  const teammatesPerf = otherPositions.reduce(
    (sum, p) => sum + (character.team.positionStrength?.[p] ?? character.team.baseStrength) * (positionWeights[p] / otherWeightTotal),
    0
  );

  const chemistryMod = 1 + (character.team.chemistry - 50) / 250;
  const leadershipMod = 1 + (character.stats["領導"] - 50) / 400 + (character.stats["溝通"] - 50) / 500;

  const raw = myWeight * myPerf + (1 - myWeight) * teammatesPerf;
  return raw * chemistryMod * leadershipMod;
}

export function simulateMatch(character, opponentStrength, { isMajorEvent = false } = {}, runtimeRng) {
  const metaWeights = META_VERSIONS[character.seasonRecord.currentMeta] ?? META_VERSIONS["均衡版本"];
  const myTeamValue = teamMatchValue(character, metaWeights, { isMajorEvent });
  const opponentValue = opponentStrength + randomRange(runtimeRng, -4, 4);

  const winProb = sigmoid((myTeamValue - opponentValue) / 8);
  const win = runtimeRng() < winProb;

  // 個人 KDA：跟隊伍勝負分開算，允許 carry-but-lose
  const perf = personalPerformance(character, { isMajorEvent });
  const neuro = character.personality["神經刀"] / 100;
  const variance = 1 + (runtimeRng() - 0.5) * 2 * neuro;

  const kills = Math.max(0, Math.round((perf / 12) * variance));
  const deaths = Math.max(0, Math.round(((100 - perf) / 20) * (1 / Math.max(variance, 0.3))));
  const assists = Math.max(0, Math.round((perf / 8) * variance));
  const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;

  const carryButLose = !win && perf >= 70;

  return { win, kills, deaths, assists, kda: Math.round(kda * 100) / 100, carryButLose, myTeamValue, opponentValue };
}
