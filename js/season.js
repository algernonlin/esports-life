// ============================================================
// season.js — 賽制推進、國際賽資格、輪換狀態、年齡衰退
// ============================================================
import { SEASON_FLOW, META_VERSIONS, TEAMS } from "./state.js";
import { simulateMatch } from "./match.js";
import { clamp, randomRange, pickWeighted } from "./rng.js";
import { decayChampionProficiency, rollMetaChampions } from "./champions.js";

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
// 方案A：批次跑完後，把過程中的最長連勝/連敗摘要出來，
// 連勝/連敗每滿3場會影響隊伍化學反應（士氣），並回傳給UI顯示摘要文字
// -------------------------------------------------------------
export function simulateRegularStage(character, runtimeRng, gamesCount = 18) {
  const results = [];
  const regionTeams = TEAMS[character.meta.region] ?? [];
  character.rosterStatus = evaluateRosterStatus(character);

  let currentStreak = 0; // 正=連勝中，負=連敗中
  let longestWinStreak = 0;
  let longestLossStreak = 0;

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

    if (result.win) {
      character.careerCounters.wins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      longestWinStreak = Math.max(longestWinStreak, currentStreak);
    } else {
      character.careerCounters.losses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      longestLossStreak = Math.max(longestLossStreak, -currentStreak);
    }
    character.careerCounters.kills += result.kills;
    character.careerCounters.deaths += result.deaths;
    character.careerCounters.assists += result.assists;
    if (result.carryButLose) character.flags["本場carry但輸"] = true;
  }

  // 連勝/連敗每滿3場，化學反應（士氣）對應調整
  const chemistryDelta = Math.floor(longestWinStreak / 3) * 3 - Math.floor(longestLossStreak / 3) * 3;
  character.team.chemistry = clamp(character.team.chemistry + chemistryDelta, 0, 100);

  const wins = results.filter((r) => r.played && r.win).length;
  const losses = results.filter((r) => r.played && !r.win).length;
  return { results, wins, losses, longestWinStreak, longestLossStreak, chemistryDelta };
}

export function simulatePlayoff(character, runtimeRng, { isInternational = false } = {}) {
  let wins = 0, losses = 0;
  for (let i = 0; i < 5; i++) {
    const isDecidingGame = wins === 2 && losses === 2; // BO5打到2:2，第5場就是決勝局
    const oppStrength = character.team.baseStrength + randomRange(runtimeRng, -6, 10);
    const result = simulateMatch(
      character, oppStrength,
      { isMajorEvent: true, isInternational, isDecidingGame, seriesGameIndex: i },
      runtimeRng
    );
    result.win ? wins++ : losses++;
    if (wins >= 3 || losses >= 3) break;
  }
  if (wins >= 3) return "冠軍";
  if (losses >= 3 && wins >= 1) return "亞軍";
  return "止步四強";
}

// -------------------------------------------------------------
// 版本更迭：每個例行賽段開始重抽，同時重抽本賽段的版本英雄清單
// -------------------------------------------------------------
export function rollMetaVersion(character, runtimeRng) {
  const keys = Object.keys(META_VERSIONS);
  character.seasonRecord.currentMeta = keys[Math.floor(runtimeRng() * keys.length)];
  character.seasonRecord.metaChampions = rollMetaChampions(runtimeRng);
  character.flags["metaJustChanged"] = true; // 給「版本怪物」天賦判斷用，這個賽段的比賽都算剛換版本
}

// -------------------------------------------------------------
// 年齡衰退：只影響 反應 / 體能
//
// 曲線分四段，不是單純線性：
//   16-20 上升期     幾乎不衰退（靠事件/訓練成長為主）
//   21-24 巔峰平台期  極低衰退機率
//   25-28 緩慢衰退期  機率逐年爬升
//   29+   加速衰退期  機率明顯升高
//
// 位置差異：中路/ADC最依賴手速，衰退感受最明顯；輔助靠意識/溝通，衰退最慢；
// 上路/打野居中。
//
// 意識+領導可以部分抵銷衰退機率（老將靠大局觀撐手速的既視感），但抵銷有上限，
// 終究抵不過歲月。訓練點數換來的 fitnessBoost 也能再壓低機率（一次性消耗）。
// 累積衰退量存進 decline.totalReactionLoss，供「手感不再」事件判斷觸發時機。
// -------------------------------------------------------------
const POSITION_DECLINE_MULTIPLIER = { "中路": 1.15, "ADC": 1.15, "上路": 1.0, "打野": 1.0, "輔助": 0.75 };

function baseDeclineProbability(age) {
  if (age < 21) return 0;
  if (age <= 24) return 0.03;
  if (age <= 28) return 0.05 + (age - 24) * 0.05;
  return clamp(0.25 + (age - 28) * 0.07, 0, 0.75);
}

export function applyAgeDecay(character, runtimeRng) {
  const age = character.meta.age;
  let prob = baseDeclineProbability(age);
  if (prob <= 0) return;

  prob *= POSITION_DECLINE_MULTIPLIER[character.meta.position] ?? 1.0;
  prob += character.chronicInjuries.length * 0.05; // 慢性傷病加重衰退

  // 轉型意識流／堅持巔峰打法：呼應「手感不再」事件的選擇
  if (character.flags["轉型意識流"]) prob *= 0.75;
  if (character.flags["堅持巔峰打法"]) prob *= 1.15;

  // 意識+領導部分抵銷衰退機率，上限15個百分點，不會完全免疫
  const offset = clamp((character.stats["意識"] + character.stats["領導"] - 100) / 400, 0, 0.15);
  prob = clamp(prob - offset, 0, 0.9);

  // 訓練點數換來的保養加成（一次性消耗）
  if (character.fitnessBoost > 0) {
    prob = clamp(prob - character.fitnessBoost, 0, 0.9);
    character.fitnessBoost = 0;
  }

  if (runtimeRng() < prob) {
    const reactionDrop = Math.round(randomRange(runtimeRng, 1, 3));
    character.stats["反應"] = clamp(character.stats["反應"] - reactionDrop, 1, 99);
    character.dynamic["體能"] = clamp(character.dynamic["體能"] - Math.round(randomRange(runtimeRng, 2, 5)), 0, 100);
    character.decline.totalReactionLoss += reactionDrop;
  }
}

// -------------------------------------------------------------
// 轉隊：在賽季中被挖角時，從同賽區挑一支「該位置需求較高」的隊伍
// 排除現在的隊伍；用跟邀請一樣的補強邏輯，越缺你這個位置的隊伍權重越高
// -------------------------------------------------------------
export function pickTradeDestination(character, runtimeRng) {
  const teams = (TEAMS[character.meta.region] ?? []).filter((t) => t.name !== character.team.name);
  if (teams.length === 0) return null;

  const myPos = character.meta.position;
  const weighted = teams.map((t) => {
    const need = Math.max(1, 100 - (t.positionStrength[myPos] ?? t.baseStrength));
    return { ...t, weight: need };
  });
  return pickWeighted(runtimeRng, weighted);
}

// -------------------------------------------------------------
// 訓練點數發放（自由分配到英雄熟練度用）與遺忘機制觸發
// -------------------------------------------------------------
const TRAINING_POINTS_BY_STAGE_TYPE = {
  regular: 2,
  playoff: 0,
  international: 0,
  offseason_short: 3,
  offseason_long: 6,
};

export function grantTrainingPoints(character, stageType) {
  let points = TRAINING_POINTS_BY_STAGE_TYPE[stageType] ?? 0;
  if (points > 0 && character.talents?.some((t) => t.id === "grinder")) points += 1; // 刻苦訓練生
  character.trainingPoints += points;
}

export function tickChampionDecay(character, runtimeRng) {
  decayChampionProficiency(character, character.meta.currentStageIndex, runtimeRng);
}

// -------------------------------------------------------------
// 隊伍邀請評估：依「你的位置」對「該隊該位置的需求」做補強式判定
// 該隊該位置越弱，門檻越低（求才若渴）；保底至少湊滿3隊邀請
// -------------------------------------------------------------
export function evaluateInvitations(character, runtimeRng) {
  const teams = TEAMS[character.meta.region] ?? [];
  const myPos = character.meta.position;
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;

  const rows = teams.map((t) => {
    const positionNeed = t.positionStrength[myPos] ?? t.baseStrength;
    const prob = clamp(0.5 + (statAvg - positionNeed) / 60, 0.05, 0.95);
    return { team: t, prob, invited: false, guaranteed: false };
  });

  rows.forEach((r) => { r.invited = runtimeRng() < r.prob; });

  const invitedCount = rows.filter((r) => r.invited).length;
  if (invitedCount < 3) {
    const candidates = rows.filter((r) => !r.invited).sort((a, b) => b.prob - a.prob);
    let need = 3 - invitedCount;
    for (const r of candidates) {
      if (need <= 0) break;
      r.invited = true;
      r.guaranteed = true; // 保底邀請：小聯盟/二隊性質的機會，非正式一軍門檻通過
      need--;
    }
  }

  return rows;
}

// -------------------------------------------------------------
// 合約續約判定：依戰績表現（跟隊伍所需水準比）跟好感度，
// 判斷隊伍願不願意開新約
// -------------------------------------------------------------
export function evaluateContractRenewal(character) {
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  const performanceOk = statAvg >= character.team.baseStrength * 0.75;
  const favorOk = character.team.favor >= 40;
  return performanceOk && favorOk;
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
        metaChampions: character.seasonRecord.metaChampions ?? [],
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
