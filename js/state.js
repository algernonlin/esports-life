// ============================================================
// state.js — 角色 / 隊伍 / 賽制的資料結構定義 (Single Source of Truth)
// ============================================================

// ---- 位置 ----
export const POSITIONS = ["上路", "打野", "中路", "ADC", "輔助"];

export const POSITION_SPECIALTY = {
  "上路": "單線抗壓",
  "打野": "節奏",
  "中路": "節奏",
  "ADC": "運營",
  "輔助": "視野控制",
};

// 專精值不再是獨立roll、獨立記錄的數字，改成用6個核心能力值即時算出來——
// 原本專精值完全沒有訓練/事件管道能碰到，形同虛設，改成公式後至少會隨著核心能力值一起變動
export function computeSpecialty(stats, position) {
  const s = stats;
  switch (position) {
    case "打野": case "中路":
      return (s["反應"] ?? 50) * 0.5 + (s["版本適應力"] ?? 50) * 0.5; // 節奏：手速+版本知識=抓節奏能力
    case "上路":
      return (s["抗壓"] ?? 50) * 0.5 + (s["反應"] ?? 50) * 0.5; // 單線抗壓：扛壓力+反應=單線生存力
    case "ADC":
      return (s["意識"] ?? 50) * 0.5 + (s["版本適應力"] ?? 50) * 0.5; // 運營：意識+版本知識=資源運營判斷
    case "輔助":
      return (s["溝通"] ?? 50) * 0.5 + (s["領導"] ?? 50) * 0.5; // 視野控制：溝通+領導=視野協調指揮
    default:
      return 50;
  }
}

// 賽區薪資市場倍率：反映真實世界薪資水準落差（市場規模跟資本，不是純競技強度）
// LPL資本最雄厚、LCK/LCS其次、LEC基準、LCP市場最小
export const REGION_SALARY_MULTIPLIER = {
  LPL: 1.4,
  LCK: 1.1,
  LCS: 1.1,
  LEC: 1.0,
  LCP: 0.6,
};

// 用隊名當種子，穩定地把單一 baseStrength 展開成五路數值（demo佔位用）
// 你研究真實數據後，直接把每隊的 positionStrength 覆蓋成手填的真實值即可
function expandPositionStrength(teamName, baseStrength) {
  let h = 0;
  for (let i = 0; i < teamName.length; i++) h = (h * 31 + teamName.charCodeAt(i)) >>> 0;
  const spread = POSITIONS.map((_, i) => {
    const v = ((h >> (i * 5)) % 17) - 8; // -8 ~ +8 穩定浮動
    return v;
  });
  const result = {};
  POSITIONS.forEach((pos, i) => {
    result[pos] = Math.max(30, Math.min(99, baseStrength + spread[i]));
  });
  return result;
}

// ---- 賽區 ----
export const REGIONS = ["LPL", "LCK", "LEC", "LCS", "LCP"];

// 2026 真實隊伍資料，依照 LoL Esports Global Power Rankings（2026/8/14）換算。
// 換算公式：baseStrength = 60 + (GPR分數-1092)/(1533-1092)*35，四捨五入，範圍約60-95。
// reputation 用 baseStrength*0.9 粗略估計媒體評價的初始值，之後遊戲過程會自動連動戰績調整。
// 想精確反映個別選手強弱，可以在下方 buildTeams() 產生完 TEAMS 後手動覆蓋
// 特定隊伍的 positionStrength（詳見檔案最後的覆蓋範例）。
function buildTeams(list, regionName) {
  return list.map((t) => ({
    ...t,
    region: regionName,
    reputation: t.reputation ?? Math.round(t.baseStrength * 0.9),
    positionStrength: expandPositionStrength(t.name, t.baseStrength),
  }));
}

export const TEAMS = {
  LPL: buildTeams([
    { name: "BLG",  baseStrength: 95 },
    { name: "AL",   baseStrength: 91 },
    { name: "TES",  baseStrength: 90 },
    { name: "JDG",  baseStrength: 88 },
    { name: "NIP",  baseStrength: 82 },
    { name: "WBG",  baseStrength: 78 },
    { name: "IG",   baseStrength: 84 },
    { name: "WE",   baseStrength: 83 },
    { name: "LNG",  baseStrength: 70 },
    { name: "TT",   baseStrength: 75 },
    { name: "LGD",  baseStrength: 78 },
    { name: "EDG",  baseStrength: 69 },
    { name: "OMG",  baseStrength: 67 },
    { name: "UP",   baseStrength: 67 },
  ], "LPL"),
  LCK: buildTeams([
    { name: "HLE",  baseStrength: 95 },
    { name: "GEN",  baseStrength: 94 },
    { name: "T1",   baseStrength: 92 },
    { name: "DK",   baseStrength: 90 },
    { name: "KT",   baseStrength: 89 },
    { name: "BFX",  baseStrength: 80 },
    { name: "KRX",  baseStrength: 66 },
    { name: "NS",   baseStrength: 75 },
    { name: "BRO",  baseStrength: 73 },
    { name: "DNS",  baseStrength: 67 },
  ], "LCK"),
  LEC: buildTeams([
    { name: "G2",   baseStrength: 90 },
    { name: "KC",   baseStrength: 86 },
    { name: "MKOI", baseStrength: 81 },
    { name: "VIT",  baseStrength: 77 },
    { name: "GX",   baseStrength: 73 },
    { name: "NAVI", baseStrength: 69 },
    { name: "SHFT", baseStrength: 66 },
    { name: "SK",   baseStrength: 64 },
    { name: "TH",   baseStrength: 63 },
  ], "LEC"),
  LCS: buildTeams([
    { name: "LYON",  baseStrength: 84 },
    { name: "FLY",   baseStrength: 85 },
    { name: "TLAW",  baseStrength: 80 },
    { name: "C9",    baseStrength: 79 },
    { name: "SEN",   baseStrength: 71 },
    { name: "SR",    baseStrength: 69 },
    { name: "DSG",   baseStrength: 67 },
    { name: "DIG",   baseStrength: 66 },
  ], "LCS"),
  LCP: buildTeams([
    { name: "TSW",  baseStrength: 81 },
    { name: "CFO",  baseStrength: 79 },
    { name: "GAM",  baseStrength: 75 },
    { name: "DCG",  baseStrength: 71 },
    { name: "MVK",  baseStrength: 79 },
    { name: "SHG",  baseStrength: 66 },
    { name: "GZ",   baseStrength: 69 },
    { name: "DFM",  baseStrength: 60 },
  ], "LCP"),
};

// 跨賽區用的攤平清單：合約到期後的自由市場、緊急轉會都可以搜尋全部賽區的隊伍，
// 不侷限在開局選的那個賽區（開局選賽區純粹是敘事偏好/難度選擇，之後能不能站上頂級賽區看實力）
export const ALL_TEAMS = Object.values(TEAMS).flat();

// ---- 手動覆蓋範例：想精確指定特定隊伍的各路數值，取消註解後照格式改 ----
// const t1 = TEAMS.LCK.find((t) => t.name === "T1");
// if (t1) t1.positionStrength = { 上路: 90, 打野: 93, 中路: 91, ADC: 94, 輔助: 90 };

// ---- 能力值 ----
export const STAT_KEYS = ["反應", "意識", "抗壓", "溝通", "版本適應力", "領導"];

// ---- 性格：每軸都用「左端點 / 右端點」文字直接表達，不顯示抽象軸名 ----
// value: -100 ~ 100（bipolar），或 0~100（unipolar，神經刀專用）
export const PERSONALITY_TRAITS = [
  { key: "決斷風格", left: "謹慎", right: "衝動", type: "bipolar" },
  { key: "團隊取向", left: "個人主義", right: "團隊", type: "bipolar" },
  { key: "社交傾向", left: "內向", right: "外向", type: "bipolar" },
  { key: "心境",     left: "悲觀", right: "樂觀", type: "bipolar" },
  { key: "自我評價", left: "自卑", right: "自信", type: "bipolar" },
  { key: "驕傲度",   left: "謙遜", right: "自大", type: "bipolar" },
  { key: "神經刀",   left: "穩定", right: "大心臟", type: "unipolar" },
];

// ---- 賽制骨架 ----
export const SEASON_FLOW = [
  { stage: "第一賽段例行賽", type: "regular" },
  { stage: "第一賽段季後賽", type: "playoff" },
  { stage: "先鋒賽",       type: "international", condition: "qualified_pioneer" },
  { stage: "短休賽期A",     type: "offseason_short" },

  { stage: "第二賽段例行賽", type: "regular" },
  { stage: "第二賽段季後賽", type: "playoff" },
  { stage: "短休賽期B",     type: "offseason_short" },

  { stage: "季中邀請賽",     type: "international", condition: "qualified_msi" },
  { stage: "電競世界盃EWC", type: "international", condition: "qualified_ewc" },
  { stage: "短休賽期C",     type: "offseason_short" },

  { stage: "第三賽段例行賽", type: "regular" },
  { stage: "第三賽段季後賽", type: "playoff" },
  { stage: "世界大賽",   type: "international", condition: "qualified_worlds" },

  { stage: "長休賽期",      type: "offseason_long" },
];

// ---- 版本模板（位置權重會依版本浮動）----
export const META_VERSIONS = {
  "野核版本":     { "上路": 0.15, "打野": 0.30, "中路": 0.20, "ADC": 0.20, "輔助": 0.15 },
  "AD核心版本":   { "上路": 0.16, "打野": 0.18, "中路": 0.20, "ADC": 0.30, "輔助": 0.16 },
  "上路強勢版本": { "上路": 0.28, "打野": 0.20, "中路": 0.20, "ADC": 0.18, "輔助": 0.14 },
  "均衡版本":     { "上路": 0.18, "打野": 0.22, "中路": 0.22, "ADC": 0.22, "輔助": 0.16 },
};

// ---- 先天天賦池（開局抽選，稀有度分層）----
// rarity 決定被抽到的相對權重：common=70 / rare=25 / legendary=5
// 每個天賦的實際效果接在對應的邏輯檔案裡，見各檔案內的 talents.some(...) 判斷
export const INNATE_TALENTS = [
  { id: "glass_body",        name: "玻璃體質",     rarity: "rare",      desc: "受傷機率提高，但英雄熟練度成長更快。" },
  { id: "big_heart",         name: "大賽型選手",   rarity: "rare",      desc: "國際賽事的表現額外提升。" },
  { id: "fast_learner",      name: "版本怪物",     rarity: "legendary", desc: "版本剛更迭時幾乎不受過渡期debuff影響。" },
  { id: "iron_wrist",        name: "鐵手腕",       rarity: "rare",      desc: "手部相關傷病機率大幅降低。" },
  { id: "night_owl",         name: "夜貓子",       rarity: "common",    desc: "體能基礎值略低，但意識成長略快。" },
  { id: "internal_war_god",  name: "內戰幻神",     rarity: "rare",      desc: "賽區內對戰（例行賽/季後賽）時能力有額外加成。" },
  { id: "sudden_gyro",       name: "突然的陀螺",   rarity: "rare",      desc: "國際賽（外戰）時能力會降低。" },
  { id: "seven_will",        name: "7の意志",      rarity: "legendary", desc: "在BO5的決勝局，全屬性提升15%。傳說在7的指引下，你將無所不能。" },
  { id: "conceptual_god",    name: "概念神",       rarity: "rare",      desc: "每場比賽開始時，隨機進入三種形態之一：天神下凡（能力大幅提升）、及時雨（容易送頭）、穩健（能力不變化）。" },
  { id: "eternal_god",       name: "永遠滴神",     rarity: "rare",      desc: "逆風局（隊伍實力落後對手）容易carry比賽。" },
  { id: "self_proclaimed_goat", name: "世一XX",    rarity: "rare",      desc: "自封為某個位置的世界第一。壓力持續偏高，但連勝時增幅會滾雪球提升，連敗時則會被輿論反噬、能力下降得更慘。" },
  { id: "boy_kungfu",        name: "童子功",       rarity: "rare",      desc: "沒交女友時，獲得額外能力加成。" },
  { id: "rift_inventor",     name: "峽谷發明家",   rarity: "rare",      desc: "練英雄特別快。" },
  { id: "semifinal_enough",  name: "四強就算成功", rarity: "rare",      desc: "國際賽打進四強以上後，狀態會下滑。" },
  { id: "never_overtime",    name: "永不加班",     rarity: "common",    desc: "BO5系列賽前期能力強，但場次越打越後面，能力會開始下降。" },
  { id: "emotional_stability", name: "情緒穩定",   rarity: "common",    desc: "心態受事件影響的波動幅度較小，大好大壞都比較不明顯。" },
  { id: "grinder",           name: "刻苦訓練生",   rarity: "common",    desc: "每個賽段能額外多獲得1點訓練點數。" },

  // ---- 以下7個天賦，實作分散在不同檔案，統一用 hasTalent(character, id) 判斷 ----
  // 老將：比賽表現浮動壓縮(match.js的personalNoise)，穩定但少了爆發上限
  { id: "veteran",           name: "老將",         rarity: "common",    desc: "比賽經驗豐富，穩定性高；但爆發力下降。" },
  // 三板斧：開局英雄池洗成「3隻滿熟練度、其他0」(roll.js)，之後練其他英雄效率只有20%(champions.js)
  { id: "three_axes",        name: "三板斧",       rarity: "common",    desc: "開始時，有三個英雄滿熟練度，其他都是0，且訓練其他英雄的效果只有一般的20%。" },
  // 戰術狂人：研究版本情報訓練效果加成(season.js)，團隊決策類事件效果加成但衝突風險也加成(effects.js)
  { id: "tactics_maniac",    name: "戰術狂人",     rarity: "common",    desc: "研究戰術速度快，團隊決策事件加成；但容易與教練或隊友意見衝突。" },
  // 最後大魔王：BO5決勝局(2:2)觸發骰子時，直接骰出雙6保證過關(main.js的runInteractivePlayoff)
  { id: "final_boss",        name: "最後大魔王",   rarity: "legendary", desc: "BO5絕境時，若觸發骰子會直接骰出兩個6。" },
  // 孤狼：開局反應/意識額外加成，溝通/領導額外減損(roll.js)
  { id: "lone_wolf",         name: "孤狼",         rarity: "common",    desc: "反應意識都很高，但不會打團戰(溝通領導降低)。" },
  // 這就是卡桑帝：死亡分配權重降低(match.js的POSITION_KDA_PROFILE死亡倍率之外再乘一層)
  { id: "this_is_kassadin",  name: "這就是卡桑帝", rarity: "common",    desc: "團戰更不容易死亡。" },
  // F6仙人：贏面被放大、輸面也被放大(match.js的personalNoise在順風/逆風時進一步加乘)
  { id: "f6_sage",           name: "F6仙人",       rarity: "common",    desc: "對野區資源有非同一般的執著，容易入侵獲得大優勢，但野區一劣勢就會送很大。" },
];

// ---- 角色狀態物件 factory ----
export function createCharacter({ name, position, region, teamName }) {
  return {
    schemaVersion: 1,
    meta: {
      name,
      position,
      region,
      teamName,
      age: 16,
      careerYear: 2026,
      currentStageIndex: 0,
    },
    stats: {
      "反應": 50, "意識": 50, "抗壓": 50, "溝通": 50, "版本適應力": 50, "領導": 50,
      // 專精值(節奏/單線抗壓/運營/視野控制)不再是獨立欄位，改用computeSpecialty()即時算
    },
    personality: {
      "決斷風格": 0, "團隊取向": 0, "社交傾向": 0, "心境": 0,
      "自我評價": 0, "驕傲度": 0, "神經刀": 30,
    },
    dynamic: { 心態: 50, 體能: 70, 壓力: 20 },
    fame: 10,
    talents: [],
    flags: {},
    champions: {},       // { championId: { proficiency, lastPracticedStage, peakProficiency? } }
    trainingPoints: 0,   // 可自由分配的訓練點數，賽段結束時發放
    injuries: [],
    chronicInjuries: [],
    rosterStatus: "rotation", // starter | rotation | bench
    matchStreak: 0, // 持續連勝(正)/連敗(負)計數，跨賽段累積，給「世一XX」天賦用
    decline: { totalReactionLoss: 0 }, // 衰退累積量，用來觸發「手感不再」事件
    yearRecord: { stageMvpCount: 0 },  // 年度累積：這年三個賽段裡拿了幾次「賽段MVP」，年底結算年度榮譽用
    yearlyHistory: [], // 逐年戰績快照，年底存一筆，供生涯數據「逐年戰績」展開區塊用
    fitnessBoost: 0,                    // 訓練點數換來的暫時性衰退減免（消耗型）
    team: {
      name: teamName,
      baseStrength: 60,
      positionStrength: { "上路": 60, "打野": 60, "中路": 60, "ADC": 60, "輔助": 60 },
      chemistry: 50,
      reputation: 50,
      favor: 50,
      contractYears: 2,
      contractSalary: 0, // 簽約當下鎖定的年薪(萬)，換約才會重新算
    },
    careerCounters: {
      kills: 0, assists: 0, deaths: 0, wins: 0, losses: 0, appearances: 0, mvps: 0, worldsAppearances: 0,
      // 收入拆三類：薪資（合約鎖定）、獎金（賽事名次，固定金額不因人而異）、其他收入（零散事件）
      salaryIncome: 0, prizeMoney: 0, otherIncome: 0,
      // 生涯榮譽
      domesticTitles: 0, domesticRunnerUps: 0,       // 賽區冠軍/亞軍（例行賽季後賽）
      internationalTitles: 0, internationalRunnerUps: 0, // 國際賽冠軍/亞軍(四個賽事加總)
      // 大滿貫/大滿亞、三冠王/五冠王/十冠王要分開算，不能只看上面加總後的籠統數字
      pioneerTitles: 0, pioneerRunnerUps: 0,       // 先鋒賽
      msiTitles: 0, msiRunnerUps: 0,               // 季中邀請賽
      ewcTitles: 0, ewcRunnerUps: 0,               // 電競世界盃EWC
      worldsTitles: 0, worldsRunnerUps: 0,         // 世界大賽
      fmvps: 0,                                       // 決賽FMVP（只有奪冠才可能拿到）
      regularSeasonMVPs: 0,                            // 該賽段例行賽MVP（賽段級，累積次數）
      bestXI: 0,                                       // 該賽段最佳陣容入選次數
      yearEndBestPosition: 0,                          // 年度賽區最佳（該位置）
      yearEndMVP: 0,                                    // 年度常規賽MVP（一年三個賽段都拿MVP才算）
    },
    seasonRecord: {
      year: 2026,
      currentMeta: "均衡版本",
      metaChampions: [],
      stage1: { wins: 0, losses: 0, teamWins: 0, teamLosses: 0, playoffResult: null },
      stage2: { wins: 0, losses: 0, teamWins: 0, teamLosses: 0, playoffResult: null },
      stage3: { wins: 0, losses: 0, teamWins: 0, teamLosses: 0, playoffResult: null },
      qualifiedEvents: [],
    },
    history: [],
    retired: false,
  };
}
