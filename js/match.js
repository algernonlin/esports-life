// ============================================================
// match.js — 比賽模擬公式
// 個人表現與隊伍勝負分開計算，才會出現「carry但輸」的狀況
// ============================================================
import { META_VERSIONS, computeSpecialty, POSITION_SPECIALTY, POSITIONS } from "./state.js";
import { clamp, randomRange, runtimeRng, gaussianRandom } from "./rng.js";
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
  const specialty = POSITION_SPECIALTY[character.meta.position]; // 名稱字串，給傷病比對用
  const specialtyVal = computeSpecialty(s, character.meta.position); // 即時算出來的數值

  // 版本適應：剛換版本的賽段有過渡期debuff，「版本怪物」天賦可以免疫
  const metaJustChanged = character.flags?.["metaJustChanged"];
  const metaFit = metaJustChanged && !hasTalent(character, "fast_learner") ? 0.85 : 1;

  let baseAbility =
    s["反應"] * 0.3 +
    s["意識"] * (0.25 + (hasTalent(character, "night_owl") ? 0.03 : 0)) + // 夜貓子：意識權重額外加成
    specialtyVal * 0.2 +
    s["版本適應力"] * metaFit * 0.15 +
    s["抗壓"] * (isMajorEvent ? 0.15 : 0.08) * 0.1 * 10; // 大賽加權

  // 心態、傷病 debuff：傷病扣的是affectedStats指定的核心能力值(反應/意識/抗壓等)，
  // 用「傷病扣了多少分」直接影響baseAbility，不是去比對根本對不上的專精值名稱(之前這裡是bug，一直算出0)
  const moodMod = 1 + (character.dynamic.心態 - 50) / 200;
  const injuryStatLoss = character.injuries.reduce((acc, inj) => {
    const relevantKeys = ["反應", "意識", "抗壓", "版本適應力"];
    return acc + relevantKeys.reduce((sum, key) => sum + Math.abs(inj.affectedStats?.[key] ?? 0), 0);
  }, 0);
  const injuryPenalty = clamp(injuryStatLoss / 100, 0, 0.5); // 傷病扣分總量換算成比例懲罰，封頂50%
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
  let perf = baseAbility * 0.85 + baseAbility * fit * 0.15;

  // 場次間的小幅隨機浮動：沒有這個的話，同一個角色狀態不變時每場perf幾乎固定，
  // MVP這種「偶爾打出神仙表現」的判定永遠不會觸發。神經刀高的人浮動更大，呼應這個性格特質。
  const neuroSwing = 0.1 + (character.personality["神經刀"] ?? 30) / 100 * 0.25;
  perf *= 1 + (runtimeRng() - 0.5) * 2 * neuroSwing;

  return clamp(perf, 1, 99);
}

// -------------------------------------------------------------
// 隊伍優勢計算：五路各自比較「我方 vs 對方」的差距，再用當前版本的位置權重加總，
// 而不是把隊伍壓成一個模糊的總分再比較。這樣版本英雄/版本權重才會真正影響
// 「哪一路的差距比較重要」，也讓對手不再只是一個隨機噪聲數字，是真的五路對比。
// -------------------------------------------------------------
function computeAdvantage(character, opponentTeam, metaWeights, matchContext) {
  const myPos = character.meta.position;
  let weightedGap = 0;

  for (const pos of POSITIONS) {
    const myValue = pos === myPos
      ? personalPerformance(character, matchContext)
      : (character.team.positionStrength?.[pos] ?? character.team.baseStrength);
    const oppValue = opponentTeam.positionStrength?.[pos] ?? opponentTeam.baseStrength;
    const gap = myValue - oppValue;
    weightedGap += gap * (metaWeights[pos] ?? 0.2);
  }

  return weightedGap;
}

export function teamMatchValue(character, opponentTeam, metaWeights, matchContext = {}) {
  const advantage = computeAdvantage(character, opponentTeam, metaWeights, matchContext);

  // 化學反應/領導/溝通轉成加減分（不是乘數），直接疊加在優勢差距上
  const chemistryBonus = (character.team.chemistry - 50) / 5;
  const leadershipBonus = (character.stats["領導"] - 50) / 8 + (character.stats["溝通"] - 50) / 10;

  return advantage + chemistryBonus + leadershipBonus;
}

// -------------------------------------------------------------
// 拆成兩階段給互動骰子流程用：
// 1. computeMatchWinProbability：算出這場的真實勝率跟context，不擲骰、不決定勝負
// 2. resolveMatchWithResult：拿到骰子結果(win已知)後，套用勝負、算KDA/MVP等後續數據
// simulateMatch 本身保留給批次模擬（例行賽）用，內部直接呼叫這兩個函式串起來
// -------------------------------------------------------------
export function computeMatchWinProbability(character, opponentTeam, matchContext = {}, runtimeRng) {
  const metaWeights = META_VERSIONS[character.seasonRecord.currentMeta] ?? META_VERSIONS["均衡版本"];
  const isUnderdog = character.team.baseStrength < opponentTeam.baseStrength;
  const conceptualForm = hasTalent(character, "conceptual_god") ? rollConceptualForm(runtimeRng) : null;
  const fullContext = { ...matchContext, isUnderdog, conceptualForm };

  const advantage = teamMatchValue(character, opponentTeam, metaWeights, fullContext) + randomRange(runtimeRng, -6, 6);
  // 勝率上下限鎖在15%~85%，不管實力差距多懸殊，弱方永遠保有反擊機會——
  // 沒有這個限制的話，碾壓局容易整個系列賽死亡數是0，KDA顯示會變成失真的誇張數字
  const winProb = clamp(sigmoid(advantage / 20), 0.15, 0.85);
  return { winProb, fullContext, advantage };
}

// -------------------------------------------------------------
// 各位置的K/D/A基準比重：輔助殺少助攻多，ADC/中路殺多助攻少，符合各路真實定位
// -------------------------------------------------------------
const POSITION_KDA_PROFILE = {
  "上路": { killMult: 1.0, assistMult: 0.85, deathMult: 1.0 },
  "打野": { killMult: 0.9, assistMult: 1.3, deathMult: 1.0 },
  "中路": { killMult: 1.2, assistMult: 0.9, deathMult: 0.95 },
  "ADC":  { killMult: 1.3, assistMult: 0.8, deathMult: 0.85 },
  "輔助": { killMult: 0.4, assistMult: 1.8, deathMult: 1.15 },
};

// 神經刀決定的場次浮動：不是平滑地讓數字大小差一點，是「神經刀高的人有機率打出極端場」——
// 要嘛神仙場(爆殺爆助攻幾乎不死)，要嘛送頭場(死好幾次)，神經刀低的人幾乎不會觸發極端場，
// 但仍保留一個基本浮動下限，避免每場數字幾乎一樣

// -------------------------------------------------------------
// 先算整場比賽雙方的團隊擊殺總數（比分懸殊程度跟隊伍實力差距/勝率掛鉤），
// 再依位置權重+個人表現，把這個總數分配到玩家身上——
// 這樣「隊伍打崩對手」時，就算是穩健(低神經刀)的玩家也會自然打出低死亡場，
// 不再是純粹靠個人神經刀決定KDA，比較貼近真實比賽的比分邏輯
// -------------------------------------------------------------
function simulateTeamKillSplit(winProb, rng) {
  // 真實比賽的單場總擊殺數呈常態分布：均值約29、標準差約8
  // (68%落在20~40之間、95%落在15~45之間，極端場<15或>45很少見)
  const totalKills = gaussianRandom(rng, 29, 8, 8, 55);
  // 勝率越極端，比分越懸殊；勝率接近50%時比分接近對半
  // skew上限從0.9收緊到0.8：就算是碾壓局，對方也該留一些擊殺數，不然我方死亡池太小，
  // 分完5個位置很容易全部round到0，導致KDA顯示變成失真的誇張數字
  const skew = clamp(0.5 + (winProb - 0.5) * 1.3, 0.15, 0.8);
  const myTeamKills = Math.round(totalKills * skew);
  const oppTeamKills = totalKills - myTeamKills; // 對方的擊殺數 = 我方要承受的團隊總死亡數
  return { myTeamKills, oppTeamKills };
}

// 把團隊總數依位置權重+個人表現分配到玩家身上
function allocateToPlayer(totalAmount, myPos, metaWeights, perfFactor, profileKey, character) {
  const shares = POSITIONS.map((pos) => {
    const posWeight = metaWeights[pos] ?? 0.2;
    const profileMult = POSITION_KDA_PROFILE[pos]?.[profileKey] ?? 1;
    let weight = posWeight * profileMult;
    if (pos === myPos) weight *= perfFactor;
    return weight;
  });
  const totalWeight = shares.reduce((a, b) => a + b, 0) || 1;
  const myShare = shares[POSITIONS.indexOf(myPos)] / totalWeight;
  return Math.max(0, Math.round(totalAmount * myShare));
}

export function resolveMatchWithResult(character, fullContext, win, runtimeRng, winProb = 0.5, forceHeroic = false) {
  // 世一XX的連勝/連敗持續累積，這裡統一更新（用這場「之前」的streak去影響這場表現，這場結果再更新給下一場用）
  character.matchStreak = win
    ? Math.max(1, (character.matchStreak ?? 0) + 1)
    : Math.min(-1, (character.matchStreak ?? 0) - 1);

  const perf = personalPerformance(character, fullContext);
  const myPos = character.meta.position;
  const metaWeights = META_VERSIONS[character.seasonRecord.currentMeta] ?? META_VERSIONS["均衡版本"];

  // 1. 先決定整場比賽雙方的團隊擊殺總數（比分懸殊程度跟勝率掛鉤）
  const { myTeamKills, oppTeamKills } = simulateTeamKillSplit(winProb, runtimeRng);

  // 2. 我方團隊擊殺總數，分配出「我個人的擊殺」；對方擊殺總數(=我方死亡)，分配出「我個人的死亡」
  const killPerfFactor = clamp(perf / 50, 0.4, 2.2);
  const deathPerfFactor = clamp((100 - perf) / 50, 0.4, 2.2);
  let kills = allocateToPlayer(myTeamKills, myPos, metaWeights, killPerfFactor, "killMult", character);
  let deaths = allocateToPlayer(oppTeamKills, myPos, metaWeights, deathPerfFactor, "deathMult", character);

  // 3. 助攻：從我方團隊擊殺數推算助攻池(每次擊殺平均帶來約1.8~2.6次助攻分配給隊友)，再分配
  const assistPool = myTeamKills * (1.8 + runtimeRng() * 0.8);
  const assistPerfFactor = clamp(perf / 50, 0.5, 1.8);
  let assists = allocateToPlayer(assistPool, myPos, metaWeights, assistPerfFactor, "assistMult", character);

  // 4. 神經刀在這個既定戰局下，再加一層「個人這場手感好壞」的小幅浮動（不再是唯一決定因素）
  const neuro = (character.personality["神經刀"] ?? 30) / 100;
  let noiseSwing = 0.1 + neuro * 0.3;

  // 老將：比賽經驗豐富，表現浮動壓縮(穩定)，但也代表爆發力上限被壓低
  if (hasTalent(character, "veteran")) noiseSwing *= 0.55;

  let personalNoise = 1 + (runtimeRng() - 0.5) * 2 * noiseSwing;

  // F6仙人：對資源極度執著，順風時貪刀貪更多優勢、逆風時容易送更大——贏面/輸面都被放大
  if (hasTalent(character, "f6_sage")) {
    if (winProb > 0.5) personalNoise *= 1 + (winProb - 0.5) * 0.6;
    else personalNoise *= 1 - (0.5 - winProb) * 0.6;
  }

  kills = Math.max(0, Math.round(kills * personalNoise));
  assists = Math.max(0, Math.round(assists * personalNoise));
  deaths = Math.max(0, Math.round(deaths / Math.max(personalNoise, 0.4)));

  // 這就是卡桑帝：團戰不容易死，死亡數額外打折
  if (hasTalent(character, "this_is_kassadin")) deaths = Math.max(0, Math.round(deaths * 0.65));

  // 強制英雄數據(目前給最後大魔王發動時用)：只保證贏球卻打出難看的KDA不合理，
  // 真的carry隊伍逆轉戰局，數據也該跟得上這個份量——至少5殺10助攻，死亡數壓到0~1
  if (forceHeroic) {
    kills = Math.max(kills, Math.round(5 + runtimeRng() * 4));
    assists = Math.max(assists, Math.round(10 + runtimeRng() * 5));
    deaths = Math.min(deaths, runtimeRng() < 0.6 ? 0 : 1);
  }

  const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;

  const carryButLose = !win && perf >= 70;
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  // MVP除了看能力值表現(perf)，也要看這場實際打出來的KDA數字夠不夠好看——
  // 兩者原本是獨立計算的，可能出現perf判定過關但KDA很難看(甚至死比殺+助攻還多)還被判MVP的矛盾
  // MVP門檻用相對統計校準：perf實際輸出範圍會隨團隊比分模型/位置差異化/天賦加成變動，
  // 固定倍率門檻容易跟perf真實分布脫節，改用statAvg*1.02，實測在不同能力值下都能穩定落在約22~26%的合理MVP比例
  const mvpThreshold = statAvg * 1.02;
  const mvp = win && perf >= mvpThreshold && kda >= 1.5;

  return { win, kills, deaths, assists, kda: Math.round(kda * 100) / 100, carryButLose, mvp };
}

export function simulateMatch(character, opponentTeam, matchContext = {}, runtimeRng) {
  const { winProb, fullContext } = computeMatchWinProbability(character, opponentTeam, matchContext, runtimeRng);
  const win = runtimeRng() < winProb;
  return resolveMatchWithResult(character, fullContext, win, runtimeRng, winProb);
}
