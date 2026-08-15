// ============================================================
// match.js — 比賽模擬公式
// 個人表現與隊伍勝負分開計算，才會出現「carry但輸」的狀況
// ============================================================
import { META_VERSIONS, POSITION_SPECIALTY } from "./state.js";
import { clamp, randomRange, runtimeRng } from "./rng.js";
import { pickMatchChampionFit } from "./champions.js";

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function hasTalent(character, id) {
  return character.talents?.some((t) => t.id === id) ?? false;
}

function rollConceptualForm(rng) {
  const r = rng();
  if (r < 1 / 3) return "godMode";
  if (r < 2 / 3) return "feeder";
  return "steady";
}

// 大賽（季後賽/國際賽）抗壓加權比一般賽段更高
// isInternational：是否為國際賽（外戰），跟例行賽/季後賽（賽區內戰）區分
// isDecidingGame：是否為BO5系列賽的決勝局（2:2打第5場）
// seriesGameIndex：系列賽第幾場（0起算），非系列賽傳0即可
export function personalPerformance(character, matchContext = {}) {
  const { isMajorEvent = false, isInternational = false, isDecidingGame = false, seriesGameIndex = 0, isUnderdog = false, conceptualForm = null } = matchContext;
  const s = character.stats;
  const specialty = POSITION_SPECIALTY[character.meta.position];
  const specialtyVal = s[specialty] ?? 50;

  // 版本適應：剛換版本的賽段有過渡期debuff，「版本怪物」天賦可以免疫
  const metaJustChanged = character.flags?.["metaJustChanged"];
  const metaFit = metaJustChanged && !hasTalent(character, "fast_learner") ? 0.85 : 1;

  let baseAbility =
    s["反應"] * 0.3 +
    s["意識"] * (0.25 + (hasTalent(character, "night_owl") ? 0.03 : 0)) + // 夜貓子：意識權重額外加成
    specialtyVal * 0.2 +
    s["版本適應力"] * metaFit * 0.15 +
    s["抗壓"] * (isMajorEvent ? 0.15 : 0.08) * 0.1 * 10; // 大賽加權

  // 心態、傷病 debuff
  const moodMod = 1 + (character.dynamic.心態 - 50) / 200;
  const injuryPenalty = character.injuries.reduce((acc, inj) => acc + (inj.affectedStats?.[specialty] ? 0.03 * inj.severity : 0), 0);
  baseAbility = baseAbility * moodMod * (1 - injuryPenalty);

  // 壓力懲罰：只在大賽發威，抗壓值可以部分抵銷
  const pressure = character.dynamic["壓力"] ?? 20;
  if (isMajorEvent) {
    const pressurePenalty = clamp((pressure - 50) / 300, 0, 0.2);
    const pressureOffset = clamp((s["抗壓"] - 50) / 600, 0, 0.1);
    baseAbility *= 1 - Math.max(pressurePenalty - pressureOffset, 0);

    if (pressure > 75) {
      const chokeProb = Math.max(clamp((pressure - 75) / 100, 0, 0.3) - clamp((s["抗壓"] - 50) / 300, 0, 0.15), 0);
      if (runtimeRng() < chokeProb) baseAbility *= 0.7;
    }
  }

  // 大賽型選手：國際賽額外加成
  if (isMajorEvent && hasTalent(character, "big_heart")) baseAbility *= 1.06;

  // 內戰幻神 / 突然的陀螺：賽區內戰 vs 國際賽外戰的反向加減
  if (!isInternational && hasTalent(character, "internal_war_god")) baseAbility *= 1.08;
  if (isInternational && hasTalent(character, "sudden_gyro")) baseAbility *= 0.85;

  // 7の意志：BO5決勝局全屬性+15%
  if (isDecidingGame && hasTalent(character, "seven_will")) baseAbility *= 1.15;

  // 永不加班：系列賽場次越後面，能力衰退越明顯
  if (seriesGameIndex > 0 && hasTalent(character, "never_overtime")) {
    baseAbility *= 1 - clamp(0.04 * seriesGameIndex, 0, 0.2);
  }

  // 童子功：沒有感情牽絆時額外加成
  const inRelationship = character.flags?.["有女友"] || character.flags?.["有秘密女友"] || character.flags?.["外遇中"];
  if (!inRelationship && hasTalent(character, "boy_kungfu")) baseAbility *= 1.06;

  // 世一XX：連勝滾雪球加成，連敗被輿論反噬掉更慘（用跨賽段持續累積的 matchStreak 判斷）
  if (hasTalent(character, "self_proclaimed_goat")) {
    const streak = character.matchStreak ?? 0;
    if (streak > 0) baseAbility *= 1 + clamp(streak * 0.02, 0, 0.15);
    if (streak < 0) baseAbility *= 1 - clamp(-streak * 0.03, 0, 0.3);
  }

  // 永遠滴神：逆風局（隊伍實力落後對手）容易carry
  if (isUnderdog && hasTalent(character, "eternal_god")) baseAbility *= 1.1;

  // 概念神：每場開局隨機三態，同一場比賽用同一個結果（由 simulateMatch 統一骰好傳進來）
  if (conceptualForm === "godMode") baseAbility *= 1.3;
  if (conceptualForm === "feeder") baseAbility *= 0.7;

  // 英雄適配層：能力值85% + 英雄熟練度/版本英雄加成15%，下限0.4不會讓玩家卡死
  const { fit } = pickMatchChampionFit(character, character.meta.position, character.seasonRecord.metaChampions);
  const perf = baseAbility * 0.85 + baseAbility * fit * 0.15;

  return clamp(perf, 1, 99);
}

export function teamMatchValue(character, positionWeights, matchContext = {}) {
  const myPos = character.meta.position;
  const myWeight = positionWeights[myPos] ?? 0.2;
  const myPerf = personalPerformance(character, matchContext);

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

export function simulateMatch(character, opponentStrength, matchContext = {}, runtimeRng) {
  const metaWeights = META_VERSIONS[character.seasonRecord.currentMeta] ?? META_VERSIONS["均衡版本"];

  // 逆風/順風判定跟概念神的隨機形態，一場比賽只算/骰一次，讓勝負判定跟KDA判定吃到同一個結果
  const isUnderdog = character.team.baseStrength < opponentStrength;
  const conceptualForm = hasTalent(character, "conceptual_god") ? rollConceptualForm(runtimeRng) : null;
  const fullContext = { ...matchContext, isUnderdog, conceptualForm };

  const myTeamValue = teamMatchValue(character, metaWeights, fullContext);
  const opponentValue = opponentStrength + randomRange(runtimeRng, -4, 4);

  const winProb = sigmoid((myTeamValue - opponentValue) / 8);
  const win = runtimeRng() < winProb;

  // 世一XX的連勝/連敗持續累積，這裡統一更新（用這場「之前」的streak去影響這場表現，這場結果再更新給下一場用）
  character.matchStreak = win
    ? Math.max(1, (character.matchStreak ?? 0) + 1)
    : Math.min(-1, (character.matchStreak ?? 0) - 1);

  // 個人 KDA：跟隊伍勝負分開算，允許 carry-but-lose
  const perf = personalPerformance(character, fullContext);
  const neuro = character.personality["神經刀"] / 100;
  const variance = 1 + (runtimeRng() - 0.5) * 2 * neuro;

  const kills = Math.max(0, Math.round((perf / 12) * variance));
  const deaths = Math.max(0, Math.round(((100 - perf) / 20) * (1 / Math.max(variance, 0.3))));
  const assists = Math.max(0, Math.round((perf / 8) * variance));
  const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;

  const carryButLose = !win && perf >= 70;

  return { win, kills, deaths, assists, kda: Math.round(kda * 100) / 100, carryButLose, myTeamValue, opponentValue };
}
