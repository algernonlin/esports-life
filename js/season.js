// ============================================================
// season.js — 賽制推進、國際賽資格、輪換狀態、年齡衰退
// ============================================================
import { SEASON_FLOW, META_VERSIONS, TEAMS } from "./state.js";
import { simulateMatch } from "./match.js";
import { clamp, randomRange, pickWeighted } from "./rng.js";

// -------------------------------------------------------------
// 國際賽資格判定（示範用簡化規則，可依你研究的真實名額調整）
// -------------------------------------------------------------
export function checkQualification(character, conditionKey) {
  const sr = character.seasonRecord;
  switch (conditionKey) {
    case "qualified_pioneer":
      return sr.stage1.playoffResult === "冠軍" || sr.stage1.playoffResult === "亞軍";
    case "qualified_msi":
      return sr.stage1.playoffResult === "冠軍";
    case "qualified_ewc":
      return character.fame >= 40 && (sr.stage1.wins + sr.stage2.wins) >= 12;
    case "qualified_worlds": {
      const totalWins = sr.stage1.wins + sr.stage2.wins + sr.stage3.wins;
      return totalWins >= 24 || sr.stage3.playoffResult === "冠軍" || sr.stage3.playoffResult === "亞軍";
    }
    default:
      return false;
  }
}

// -------------------------------------------------------------
// 輪換 / 先發 / 替補 判定
// -------------------------------------------------------------
export function evaluateRosterStatus(character) {
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  const teamNeed = character.team.baseStrength;
  const favor = character.team.favor;

  if (statAvg >= teamNeed && favor >= 40) return "starter";
  if (statAvg >= teamNeed * 0.85) return "rotation";
  return "bench";
}

// -------------------------------------------------------------
// 例行賽 / 季後賽模擬（批次：一個賽段模擬 N 場，抽象化賽程）
// -------------------------------------------------------------
export function simulateRegularStage(character, runtimeRng, gamesCount = 18) {
  const results = [];
  const regionTeams = TEAMS[character.meta.region] ?? [];
  character.rosterStatus = evaluateRosterStatus(character);

  for (let i = 0; i < gamesCount; i++) {
    if (character.rosterStatus === "bench" && runtimeRng() > 0.15) {
      results.push({ played: false });
      continue;
    }
    if (character.rosterStatus === "rotation" && runtimeRng() > 0.6) {
      results.push({ played: false });
      continue;
    }
    const opponent = pickWeighted(runtimeRng, regionTeams.filter((t) => t.name !== character.team.name).map((t) => ({ ...t, weight: 1 })));
    const oppStrength = opponent ? opponent.baseStrength : 65;
    const result = simulateMatch(character, oppStrength, { isMajorEvent: false }, runtimeRng);
    results.push({ played: true, ...result, opponentName: opponent?.name ?? "未知隊伍" });

    if (result.win) character.careerCounters.wins++; else character.careerCounters.losses++;
    character.careerCounters.kills += result.kills;
    character.careerCounters.deaths += result.deaths;
    character.careerCounters.assists += result.assists;
    if (result.carryButLose) character.flags["本場carry但輸"] = true;
  }

  const wins = results.filter((r) => r.played && r.win).length;
  const losses = results.filter((r) => r.played && !r.win).length;
  return { results, wins, losses };
}

export function simulatePlayoff(character, runtimeRng) {
  const isMajor = true;
  let wins = 0, losses = 0;
  for (let i = 0; i < 5; i++) {
    const oppStrength = character.team.baseStrength + randomRange(runtimeRng, -6, 10);
    const result = simulateMatch(character, oppStrength, { isMajorEvent: isMajor }, runtimeRng);
    result.win ? wins++ : losses++;
    if (wins >= 3 || losses >= 3) break;
  }
  if (wins >= 3) return "冠軍";
  if (losses >= 3 && wins >= 1) return "亞軍";
  return "止步四強";
}

// -------------------------------------------------------------
// 版本更迭：每個例行賽段開始重抽
// -------------------------------------------------------------
export function rollMetaVersion(character, runtimeRng) {
  const keys = Object.keys(META_VERSIONS);
  character.seasonRecord.currentMeta = keys[Math.floor(runtimeRng() * keys.length)];
}

// -------------------------------------------------------------
// 年齡衰退：只影響 反應 / 體能
// -------------------------------------------------------------
export function applyAgeDecay(character, runtimeRng) {
  const age = character.meta.age;
  const declineStart = 25;
  if (age < declineStart) return;

  const yearsOver = age - declineStart;
  const chronicBonus = character.chronicInjuries.length * 0.05;
  const declineProb = clamp(0.05 + yearsOver * 0.04 + chronicBonus, 0, 0.7);

  if (runtimeRng() < declineProb) {
    character.stats["反應"] = clamp(character.stats["反應"] - Math.round(randomRange(runtimeRng, 1, 3)), 1, 99);
    character.dynamic["體能"] = clamp(character.dynamic["體能"] - Math.round(randomRange(runtimeRng, 2, 5)), 0, 100);
  }
}

// -------------------------------------------------------------
// 賽段推進（跳過沒資格的國際賽）
// -------------------------------------------------------------
export function advanceStage(character) {
  let idx = character.meta.currentStageIndex;
  let stage;
  do {
    idx = (idx + 1) % SEASON_FLOW.length;
    stage = SEASON_FLOW[idx];
    if (idx === 0) {
      // 繞回起點代表新的一年開始
      character.meta.careerYear++;
      character.meta.age++;
      character.seasonRecord = {
        year: character.meta.careerYear,
        currentMeta: character.seasonRecord.currentMeta,
        stage1: { wins: 0, losses: 0, playoffResult: null },
        stage2: { wins: 0, losses: 0, playoffResult: null },
        stage3: { wins: 0, losses: 0, playoffResult: null },
        qualifiedEvents: [],
      };
    }
  } while (stage.type === "international" && !checkQualification(character, stage.condition));

  character.meta.currentStageIndex = idx;
  character.meta.currentStageName = stage.stage;
  return stage;
}
