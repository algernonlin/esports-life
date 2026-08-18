// ============================================================
// season.js — 賽制推進、國際賽資格、輪換狀態、年齡衰退
// ============================================================
import { SEASON_FLOW, META_VERSIONS, TEAMS, ALL_TEAMS, REGION_SALARY_MULTIPLIER } from "./state.js";
import { simulateMatch } from "./match.js";
import { clamp, randomRange, pickWeighted } from "./rng.js";
import { decayChampionProficiency, rollMetaChampions, trainChampion } from "./champions.js";

// -------------------------------------------------------------
// 國際賽資格判定
// -------------------------------------------------------------
export function checkQualification(character, conditionKey) {
  const sr = character.seasonRecord;
  const top2 = (result) => result === "冠軍" || result === "亞軍";
  const top4 = (result) => result === "冠軍" || result === "亞軍" || result === "止步四強";
  switch (conditionKey) {
    case "qualified_pioneer":
      return top2(sr.stage1.playoffResult); // 先鋒賽：第一賽段季後賽前二
    case "qualified_msi":
      return top2(sr.stage2.playoffResult); // 季中邀請賽：第二賽段季後賽前二
    case "qualified_ewc":
      return top2(sr.stage2.playoffResult); // 電競世界盃：跟MSI同期，一樣要求第二賽段前二
    case "qualified_worlds":
      return top4(sr.stage3.playoffResult); // 只有世界賽是取前四，門檻比其他國際賽寬鬆
    default:
      return false;
  }
}

// -------------------------------------------------------------
// 輪換 / 先發 / 替補 判定
// -------------------------------------------------------------
export function evaluateRosterStatus(character) {
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  const positionNeed = character.team.positionStrength?.[character.meta.position] ?? character.team.baseStrength;
  const favor = character.team.favor;

  // 先發：能力值超過該路門檻的85%且好感度夠 —— 或者能力值直接超過該路完整門檻(不需要好感度加持)
  // 這樣換隊時如果你真的夠強，不會被「新隊伍還不信任你」卡住，馬上就能打先發
  if ((statAvg >= positionNeed * 0.85 && favor >= 40) || statAvg >= positionNeed) return "starter";
  if (statAvg >= positionNeed * 0.8) return "rotation";
  return "bench";
}

// -------------------------------------------------------------
// 例行賽 / 季後賽模擬（批次：一個賽段模擬 N 場，抽象化賽程）
// 方案A：批次跑完後，把過程中的最長連勝/連敗摘要出來，
// 連勝/連敗每滿3場會影響隊伍化學反應（士氣），並回傳給UI顯示摘要文字
// -------------------------------------------------------------
export function simulateRegularStage(character, runtimeRng, gamesCount = null) {
  const results = [];
  const regionTeams = TEAMS[character.meta.region] ?? [];
  character.rosterStatus = evaluateRosterStatus(character);

  // 場次改成「雙循環」：對賽區內其他每一隊各打兩輪，場次會依賽區隊伍數量自動調整
  const opponentCount = Math.max(regionTeams.length - 1, 1);
  const totalGames = gamesCount ?? opponentCount * 2;

  let currentStreak = 0; // 正=連勝中，負=連敗中
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let stageMvpCount = 0;
  let teamWins = 0, teamLosses = 0; // 隊伍整體戰績(不管你有沒有上場，隊伍都要打這場)

  for (let i = 0; i < totalGames; i++) {
    const opponent = pickWeighted(runtimeRng, regionTeams.filter((t) => t.name !== character.team.name).map((t) => ({ ...t, weight: 1 })));
    const opponentTeam = opponent ?? { baseStrength: 65, positionStrength: {} };

    const sitOut =
      (character.rosterStatus === "bench" && runtimeRng() > 0.3) ||
      (character.rosterStatus === "rotation" && runtimeRng() > 0.65);

    if (sitOut) {
      results.push({ played: false });
      // 用隊伍平均戰力(不含你的個人加成)簡化算勝負，
      // 這樣「隊伍整體戰績」才會是真的隊伍戰績，不會因為你替補沒上場就漏掉這場比賽
      const myAvg = Object.values(character.team.positionStrength ?? {}).reduce((a, b) => a + b, 0) / 5 || character.team.baseStrength;
      const oppAvg = Object.values(opponentTeam.positionStrength ?? {}).reduce((a, b) => a + b, 0) / 5 || opponentTeam.baseStrength;
      const teamWinProb = 1 / (1 + Math.exp(-(myAvg - oppAvg) / 8));
      if (runtimeRng() < teamWinProb) teamWins++; else teamLosses++;
      continue;
    }

    const result = simulateMatch(character, opponentTeam, { isMajorEvent: false }, runtimeRng);
    results.push({ played: true, ...result, opponentName: opponent?.name ?? "未知隊伍" });
    character.careerCounters.appearances++;

    if (result.win) {
      character.careerCounters.wins++;
      teamWins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      longestWinStreak = Math.max(longestWinStreak, currentStreak);
    } else {
      character.careerCounters.losses++;
      teamLosses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      longestLossStreak = Math.max(longestLossStreak, -currentStreak);
    }
    character.careerCounters.kills += result.kills;
    character.careerCounters.deaths += result.deaths;
    character.careerCounters.assists += result.assists;
    if (result.mvp) { character.careerCounters.mvps++; stageMvpCount++; }
    if (result.carryButLose) character.flags["本場carry但輸"] = true;
  }

  // 連勝/連敗每滿3場，化學反應（士氣）對應調整
  const chemistryDelta = Math.floor(longestWinStreak / 3) * 3 - Math.floor(longestLossStreak / 3) * 3;
  character.team.chemistry = clamp(character.team.chemistry + chemistryDelta, 0, 100);

  const wins = results.filter((r) => r.played && r.win).length;
  const losses = results.filter((r) => r.played && !r.win).length;
  return { results, wins, losses, teamWins, teamLosses, longestWinStreak, longestLossStreak, chemistryDelta, totalGames, stageMvpCount };
}

// 季後賽/國際賽改成真正的兩輪淘汰制（四強賽→冠軍賽），而不是單一BO5就決定冠軍——
// 單輪模式會讓「贏一次系列賽=拿冠軍」，難度被嚴重壓縮，兩輪才會真正複合出應有的難度
// -------------------------------------------------------------
// 單場結果套用進生涯累積數據（例行賽批次跟互動骰子流程共用同一套）
// -------------------------------------------------------------
export function applyGameResult(character, result) {
  character.careerCounters.kills += result.kills;
  character.careerCounters.deaths += result.deaths;
  character.careerCounters.assists += result.assists;
  if (result.win) character.careerCounters.wins++; else character.careerCounters.losses++;
  character.careerCounters.appearances++;
  if (result.mvp) {
    character.careerCounters.mvps++;
    character.trainingPoints += 1;
  }
}

export function simulatePlayoff(character, runtimeRng, { isInternational = false } = {}) {
  const opponentPool = isInternational
    ? buildInternationalOpponentPool(character)
    : buildDomesticPlayoffOpponentPool(character);

  function playSeries() {
    let wins = 0, losses = 0;
    // 對手整個系列賽只抽一次，不是每場重抽
    const opponent = opponentPool.length ? pickWeighted(runtimeRng, opponentPool.map((t) => ({ ...t, weight: t.baseStrength }))) : null;
    const opponentTeam = opponent ?? { baseStrength: character.team.baseStrength, positionStrength: {} };
    for (let i = 0; i < 5; i++) {
      const isDecidingGame = losses === 2; // 再輸一場就淘汰(2:2/1:2/0:2都算)，不是只有2:2平手才算絕境
      const result = simulateMatch(
        character, opponentTeam,
        { isMajorEvent: true, isInternational, isDecidingGame, seriesGameIndex: i },
        runtimeRng
      );
      result.win ? wins++ : losses++;

      // 每一場（不管哪一輪）都要累積進生涯數據
      applyGameResult(character, result);

      if (wins >= 3 || losses >= 3) break;
    }
    return wins >= 3;
  }

  const wonSemifinal = playSeries(); // 第一輪：四強賽
  if (!wonSemifinal) return isInternational ? "止步八強" : "止步四強";

  const wonFinal = playSeries(); // 第二輪：冠軍賽，只有贏了四強賽才會打
  if (wonFinal) {
    if (isInternational) character.careerCounters.internationalTitles++;
    else character.careerCounters.domesticTitles++;
    rollFinalsMVP(character, runtimeRng);
    return "冠軍";
  } else {
    if (isInternational) character.careerCounters.internationalRunnerUps++;
    else character.careerCounters.domesticRunnerUps++;
    return "亞軍";
  }
}

// 國內季後賽對手池：只從賽區前半強隊伍裡抽（合理的季後賽競爭者），排除墊底隊伍
export function buildDomesticPlayoffOpponentPool(character) {
  const regionTeams = (TEAMS[character.meta.region] ?? []).filter((t) => t.name !== character.team.name);
  const sorted = [...regionTeams].sort((a, b) => b.baseStrength - a.baseStrength);
  const contenderCount = Math.max(3, Math.ceil(sorted.length / 2));
  return sorted.slice(0, contenderCount);
}

// 國際賽對手池：抓其他賽區各自最強的前3隊，模擬「打進國際賽會遇到各賽區精英」
export function buildInternationalOpponentPool(character) {
  const pool = [];
  for (const region of Object.keys(TEAMS)) {
    if (region === character.meta.region) continue; // 避免國際賽又打回自己賽區的隊伍
    const top3 = [...TEAMS[region]].sort((a, b) => b.baseStrength - a.baseStrength).slice(0, 3);
    pool.push(...top3);
  }
  return pool;
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

// 衰退起始年齡：25~30之間動態決定，不是所有人都固定同一個起跑點——
// 體能/心態維持得越好，起始年齡越晚(最晚30歲)；狀態差的話最早25歲就可能開始走下坡
function baseDeclineProbability(character) {
  const age = character.meta.age;
  const stamina = character.dynamic?.["體能"] ?? 50;
  const mood = character.dynamic?.["心態"] ?? 50;
  const conditionAvg = (stamina + mood) / 2;
  const onsetAge = 25 + (conditionAvg / 100) * 5; // 100分狀態→30歲起衰；0分狀態→25歲起衰

  if (age < onsetAge) return 0;
  const yearsPastOnset = age - onsetAge;
  if (yearsPastOnset <= 4) return 0.03 + yearsPastOnset * 0.05;
  return clamp(0.25 + (yearsPastOnset - 4) * 0.07, 0, 0.75);
}

export function applyAgeDecay(character, runtimeRng) {
  const age = character.meta.age;
  let prob = baseDeclineProbability(character);
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
  const teams = ALL_TEAMS.filter((t) => t.name !== character.team.name);
  if (teams.length === 0) return null;

  const myPos = character.meta.position;
  const weighted = teams.map((t) => {
    const need = Math.max(1, 100 - (t.positionStrength[myPos] ?? t.baseStrength));
    return { ...t, weight: need };
  });
  return pickWeighted(runtimeRng, weighted);
}

// -------------------------------------------------------------
// 主動加強核心能力值：只開放 反應/意識/版本適應力 三項
// 溝通/抗壓/領導 只能靠事件被動變動（詳見設計討論：這三項是「跟人相處/被逼出來」的特質，
// 不適合關起門來自己練）
// 漸進遞減：越接近上限，單次漲幅越小，避免變成無腦點數字
// -------------------------------------------------------------
export const TRAINABLE_CORE_STATS = ["反應", "意識", "版本適應力"];

export function trainCoreStat(character, stat, currentStageIndex, runtimeRng) {
  if (!TRAINABLE_CORE_STATS.includes(stat)) return { gain: 0, champBonus: null };
  const current = character.stats[stat] ?? 50;
  let gain = clamp(1.5 * (1 - (current - 50) / 80), 0.2, 1.5);

  // 戰術狂人：研究版本情報這項特別擅長，效果加成
  if (stat === "版本適應力" && character.talents?.some((t) => t.id === "tactics_maniac")) {
    gain *= 1.4;
  }

  character.stats[stat] = clamp(Math.round((current + gain) * 10) / 10, 1, 99);

  // 30%機率，練基本功順便帶動一隻你已經在練的英雄手感（小幅加成，不算額外花點數）
  let champBonus = null;
  const owned = Object.keys(character.champions);
  if (owned.length && runtimeRng() < 0.3) {
    const id = owned[Math.floor(runtimeRng() * owned.length)];
    trainChampion(character, id, 1, currentStageIndex);
    champBonus = id;
  }

  return { gain, champBonus };
}

// -------------------------------------------------------------
// 訓練點數發放（自由分配到英雄熟練度用）與遺忘機制觸發
// -------------------------------------------------------------
const TRAINING_POINTS_BY_STAGE_TYPE = {
  regular: 2,
  playoff: 0,
  international: 0,
  offseason_short: 2,
  offseason_long: 3,
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
// crossRegion=false（預設）：開局選秀用，只在你選的賽區內找隊伍——這是敘事偏好/難度選擇，
// crossRegion=true：合約到期後的自由市場用，搜尋全部賽區——能不能站上頂級賽區純看實力，不侷限開局選擇
export function evaluateInvitations(character, runtimeRng, crossRegion = false) {
  const teams = (crossRegion ? ALL_TEAMS : TEAMS[character.meta.region]) ?? [];
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
      r.guaranteed = true; // 保底邀請：實力還不到位，加入後直接從替補做起，不做「二隊」這層區分
      need--;
    }
  }

  return rows;
}

// -------------------------------------------------------------
// 合約薪水：簽約當下算好、鎖定，不會因為之後表現/知名度變動而浮動，
// 只有換約（續約/轉會/自由市場）才會重新議價算出新數字
// -------------------------------------------------------------
// -------------------------------------------------------------
// 薪資範圍抓真實市場的量級（萬）：底薪(替補/新人) ~ 一般明星選手天花板
// （真正賽區第一人等級的極端天價不納入常態公式，那是萬中選一的特例）
// -------------------------------------------------------------
const REGION_SALARY_RANGE = {
  LPL: { floor: 110, ceiling: 4700 },
  LCK: { floor: 165, ceiling: 5000 },
  LEC: { floor: 210, ceiling: 3450 },
  LCS: { floor: 245, ceiling: 1600 },
  LCP: { floor: 50,  ceiling: 480 },
};
const ROSTER_SIGNING_FACTOR = { starter: 1.0, rotation: 0.55, bench: 0.25 };

export function computeContractSalary(character, team, predictedRoster = "rotation") {
  const range = REGION_SALARY_RANGE[team.region] ?? REGION_SALARY_RANGE.LEC;
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  // 綜合能力(權重較高)+知名度，算出「星度」，用指數曲線壓縮——大部分人集中在底薪附近，只有真正頂尖才衝高
  const starPower = clamp((statAvg - 30) / 65, 0, 1) * 0.7 + clamp(character.fame / 100, 0, 1) * 0.3;
  const qualityCurve = Math.pow(starPower, 2.4);
  const rosterFactor = ROSTER_SIGNING_FACTOR[predictedRoster] ?? 0.55;
  return Math.round(range.floor + (range.ceiling - range.floor) * qualityCurve * rosterFactor);
}

// 預測簽約當下的先發/輪換/替補（跟evaluateRosterStatus同一套邏輯，但用「候選隊伍」而非目前隊伍）
export function predictRosterStatus(character, team) {
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  const positionNeed = team.positionStrength?.[character.meta.position] ?? team.baseStrength;
  if (statAvg >= positionNeed) return "starter";
  if (statAvg >= positionNeed * 0.8) return "rotation";
  return "bench";
}

// -------------------------------------------------------------
// 合約年限：1-3年隨機，年限影響年薪（短約溢價、長約打折，隊伍求穩換折扣）
// previewContract：純函式，不寫入character，給邀請/轉隊畫面「先看合約內容再決定」用
// -------------------------------------------------------------
const CONTRACT_YEAR_MULTIPLIER = { 1: 1.15, 2: 1.0, 3: 0.9 };

export function rollContractLength(runtimeRng) {
  const r = runtimeRng();
  if (r < 0.3) return 1;
  if (r < 0.75) return 2;
  return 3;
}

export function previewContract(character, team, runtimeRng) {
  const years = rollContractLength(runtimeRng);
  const predictedRoster = predictRosterStatus(character, team);
  const annualSalary = Math.round(computeContractSalary(character, team, predictedRoster) * CONTRACT_YEAR_MULTIPLIER[years]);
  return { years, annualSalary, totalValue: annualSalary * years, predictedRoster };
}

// -------------------------------------------------------------
// 賽事獎金：固定金額，不因個人薪水高低而變動——真實世界的獎金池是固定的，
// 國內賽區獎金額外乘賽區倍率（沿用薪資的市場倍率邏輯，反映各賽區獎金池規模差異）
// -------------------------------------------------------------
const INTERNATIONAL_PRIZE_MONEY = {
  "世界大賽":   { champion: 400, runnerup: 320 },
  "季中邀請賽":     { champion: 200, runnerup: 120 },
  "電競世界盃EWC": { champion: 200, runnerup: 120 },
  "先鋒賽":         { champion: 100, runnerup: 60 },
};
const DOMESTIC_PRIZE_BASE = { champion: 30, runnerup: 12 };

// 場外快訊：純敘事包裝，不代表真的模擬了其他49隊的完整賽程——
// 加權隨機抽兩支隊伍(強隊機率高)打一場模擬決賽，純粹是給世界增添一點背景聲響
export function generateWorldsNewsFlash(runtimeRng, eventName, excludeTeamName) {
  // 候選池要限制在「每個賽區前3強」，不能從全部49隊隨便抽——
  // 不然墊底隊伍(例如全聯盟排名39/49的隊伍)也有機會被抽中打進決賽，不合理
  // (跟之前修過的「四強賽對手池」是同一種問題，這裡補上同樣的限制)
  const pool = [];
  for (const region of Object.keys(TEAMS)) {
    const top3 = [...TEAMS[region]].filter((t) => t.name !== excludeTeamName).sort((a, b) => b.baseStrength - a.baseStrength).slice(0, 3);
    pool.push(...top3);
  }
  if (pool.length < 2) return null;

  const finalistA = pickWeighted(runtimeRng, pool.map((t) => ({ ...t, weight: t.baseStrength })));
  const finalistB = pickWeighted(runtimeRng, pool.filter((t) => t.name !== finalistA.name).map((t) => ({ ...t, weight: t.baseStrength })));

  // 依雙方baseStrength算個粗略勝率，模擬BO5比數（3:0~3:2都可能）
  const diff = finalistA.baseStrength - finalistB.baseStrength;
  const winProbA = clamp(0.5 + diff / 60, 0.15, 0.85);
  let winsA = 0, winsB = 0;
  while (winsA < 3 && winsB < 3) {
    if (runtimeRng() < winProbA) winsA++; else winsB++;
  }
  const champion = winsA === 3 ? finalistA : finalistB;
  const runnerup = winsA === 3 ? finalistB : finalistA;
  const score = winsA === 3 ? `${winsA}:${winsB}` : `${winsB}:${winsA}`;

  return `場外快訊｜${eventName}落幕，${champion.name} ${score} 戰勝${runnerup.name}奪冠。`;
}

export function computePrizeMoney(character, isInternational, eventName, result) {
  if (result !== "冠軍" && result !== "亞軍") return 0;
  const key = result === "冠軍" ? "champion" : "runnerup";
  if (isInternational) {
    // 世界大賽名稱含動態年份編號(S17/S18...)，查表前先把「S數字」前綴拿掉，比對穩定的基礎名稱
    const normalizedName = eventName.replace(/^S\d+/, "");
    return (INTERNATIONAL_PRIZE_MONEY[normalizedName]?.[key] ?? 0);
  }
  const regionMult = REGION_SALARY_MULTIPLIER[character.meta.region] ?? 1.0;
  return Math.round(DOMESTIC_PRIZE_BASE[key] * regionMult);
}

// -------------------------------------------------------------
// 薪水發放：讀取簽約時鎖定的年薪，依當下先發/輪換/替補狀態打折，
// 每個賽段發放一次（年薪本身不會變，變的只有出賽狀態的折扣）
// -------------------------------------------------------------
const ROSTER_SALARY_MULTIPLIER = { starter: 1.0, rotation: 0.6, bench: 0.3 };

export function paySalary(character) {
  const annualSalary = character.team.contractSalary ?? 0;
  const rosterMult = ROSTER_SALARY_MULTIPLIER[character.rosterStatus] ?? 0.3;
  const perStage = Math.round((annualSalary * rosterMult) / SEASON_FLOW.length);
  character.careerCounters.salaryIncome = (character.careerCounters.salaryIncome ?? 0) + perStage;
  return perStage;
}

// -------------------------------------------------------------
// 賽段級榮譽判定：常規賽MVP（門檻較高）跟最佳陣容（門檻較低），
// 用「這個賽段單場MVP次數佔出場比例」當簡化替代——引擎沒有真的模擬其他選手，
// 沒辦法真的排名，用這個比例當作「這賽段打得夠不夠突出」的判斷依據
// -------------------------------------------------------------
export function evaluateStageHonors(character, stageMvpCount, gamesPlayed, wins, losses, totalGames = gamesPlayed) {
  if (gamesPlayed === 0) return { regularSeasonMVP: false, bestXI: false };
  const mvpRate = stageMvpCount / gamesPlayed;
  const winningRecord = wins > losses;

  // 出賽率門檻：替補選手只打了小部分場次，就算單場MVP比例湊巧達標，樣本數太小也不該有資格角逐賽季獎項——
  // 真實世界的賽季MVP不會是打不到一半場次的替補，這裡至少要出賽排定場次的70%才夠資格
  const participationRate = totalGames > 0 ? gamesPlayed / totalGames : 1;
  const eligibleForHonors = participationRate >= 0.7;

  const regularSeasonMVP = eligibleForHonors && mvpRate >= 0.35 && winningRecord;
  const bestXI = eligibleForHonors && !regularSeasonMVP && mvpRate >= 0.2 && wins >= losses;

  if (regularSeasonMVP) {
    character.careerCounters.regularSeasonMVPs++;
    character.yearRecord.stageMvpCount++;
  }
  if (bestXI) character.careerCounters.bestXI++;

  return { regularSeasonMVP, bestXI };
}

// -------------------------------------------------------------
// 年度榮譽結算：一年三個賽段都拿下賽段MVP才夠格「年度常規賽MVP」，
// 拿到至少2次才夠格「年度賽區最佳(該位置)」。長休賽期年度重置前呼叫。
// -------------------------------------------------------------
// -------------------------------------------------------------
// 逐年戰績快照：年底存一筆這年的摘要，供生涯數據「逐年戰績」展開區塊用。
// 要在 seasonRecord 被跨年重置之前呼叫（長休賽期結束、advanceStage()跨年重置前）
// -------------------------------------------------------------
export function snapshotYearRecord(character) {
  const sr = character.seasonRecord;
  character.yearlyHistory.push({
    year: character.meta.careerYear,
    age: character.meta.age,
    team: character.team.name,
    region: character.meta.region,
    stage1: { ...sr.stage1 },
    stage2: { ...sr.stage2 },
    stage3: { ...sr.stage3 },
    international: sr.qualifiedEvents.map((e) => ({ name: e.name, result: e.result })),
  });
}

export function evaluateYearEndHonors(character) {
  const count = character.yearRecord.stageMvpCount;
  const result = { yearEndMVP: false, yearEndBestPosition: false };

  if (count >= 3) {
    character.careerCounters.yearEndMVP++;
    result.yearEndMVP = true;
  } else if (count >= 2) {
    character.careerCounters.yearEndBestPosition++;
    result.yearEndBestPosition = true;
  }

  character.yearRecord.stageMvpCount = 0; // 重置，準備下一年
  return result;
}

// -------------------------------------------------------------
// FMVP判定：只有奪冠時才可能拿到，機率跟「你的能力值相對隊伍其他人有多突出」掛鉤
// （引擎沒有真的模擬隊友個人數據，用你的能力值 vs 隊伍baseStrength的落差當代理指標）
// -------------------------------------------------------------
export function rollFinalsMVP(character, runtimeRng) {
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  const chance = clamp(0.3 + (statAvg - character.team.baseStrength) / 100, 0.15, 0.85);
  const won = runtimeRng() < chance;
  if (won) character.careerCounters.fmvps++;
  return won;
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
  const skippedInternationals = []; // 沒資格被跳過的國際賽名稱，讓main.js可以生成場外快訊
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
    if (stage.type === "international" && !checkQualification(character, stage.condition)) {
      const season = 16 + (character.meta.careerYear - 2026);
      skippedInternationals.push(stage.stage === "世界大賽" ? `S${season}世界大賽` : stage.stage);
    }
  } while (stage.type === "international" && !checkQualification(character, stage.condition));

  character.meta.currentStageIndex = idx;
  // 世界大賽的S編號要跟著年份走：2026是S16，2027是S17，以此類推，不能整個生涯都寫死S16
  const season = 16 + (character.meta.careerYear - 2026);
  character.meta.currentStageName = stage.stage === "世界大賽" ? `S${season}世界大賽` : stage.stage;
  return { ...stage, skippedInternationals };
}
