// ============================================================
// state.js — 角色 / 隊伍 / 賽制的資料結構定義 (Single Source of Truth)
// ============================================================

// ---- 位置 ----
export const POSITIONS = ["上路", "打野", "中路", "ADC", "輔助"];

export const POSITION_SPECIALTY = {
  "上路": "單線抗壓",
  "打野": "節奏感",
  "中路": "節奏感",
  "ADC": "運營",
  "輔助": "視野控制",
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
export const REGIONS = ["LPL", "LCK", "LEC", "LTA", "LCP"];

// 2026 真實隊伍資料，依照 LoL Esports Global Power Rankings（2026/8/14）換算。
// 換算公式：baseStrength = 60 + (GPR分數-1092)/(1533-1092)*35，四捨五入，範圍約60-95。
// reputation 用 baseStrength*0.9 粗略估計媒體評價的初始值，之後遊戲過程會自動連動戰績調整。
// 想精確反映個別選手強弱，可以在下方 buildTeams() 產生完 TEAMS 後手動覆蓋
// 特定隊伍的 positionStrength（詳見檔案最後的覆蓋範例）。
function buildTeams(list) {
  return list.map((t) => ({
    ...t,
    reputation: t.reputation ?? Math.round(t.baseStrength * 0.9),
    positionStrength: expandPositionStrength(t.name, t.baseStrength),
  }));
}

export const TEAMS = {
  LPL: buildTeams([
    { name: "BLG",  baseStrength: 95 },
    { name: "AL",   baseStrength: 88 },
    { name: "TES",  baseStrength: 85 },
    { name: "JDG",  baseStrength: 83 },
    { name: "NIP",  baseStrength: 79 },
    { name: "WBG",  baseStrength: 78 },
    { name: "IG",   baseStrength: 77 },
    { name: "WE",   baseStrength: 77 },
    { name: "LNG",  baseStrength: 70 },
    { name: "TT",   baseStrength: 70 },
    { name: "LGD",  baseStrength: 69 },
    { name: "EDG",  baseStrength: 65 },
    { name: "OMG",  baseStrength: 63 },
    { name: "UP",   baseStrength: 63 },
  ]),
  LCK: buildTeams([
    { name: "HLE",  baseStrength: 95 },
    { name: "GEN",  baseStrength: 94 },
    { name: "T1",   baseStrength: 92 },
    { name: "DK",   baseStrength: 86 },
    { name: "KT",   baseStrength: 84 },
    { name: "BFX",  baseStrength: 74 },
    { name: "KRX",  baseStrength: 69 },
    { name: "NS",   baseStrength: 68 },
    { name: "BRO",  baseStrength: 67 },
    { name: "DNS",  baseStrength: 62 },
  ]),
  LEC: buildTeams([
    { name: "G2",   baseStrength: 88 },
    { name: "KC",   baseStrength: 85 },
    { name: "MKOI", baseStrength: 76 },
    { name: "VIT",  baseStrength: 73 },
    { name: "GX",   baseStrength: 70 },
    { name: "NAVI", baseStrength: 67 },
    { name: "SHFT", baseStrength: 64 },
    { name: "SK",   baseStrength: 63 },
    { name: "TH",   baseStrength: 61 },
  ]),
  LTA: buildTeams([
    { name: "LYON",  baseStrength: 85 },
    { name: "FLY",   baseStrength: 81 },
    { name: "TLAW",  baseStrength: 80 },
    { name: "C9",    baseStrength: 77 },
    { name: "SEN",   baseStrength: 69 },
    { name: "SR",    baseStrength: 67 },
    { name: "DSG",   baseStrength: 66 },
    { name: "DIG",   baseStrength: 63 },
  ]),
  LCP: buildTeams([
    { name: "TSW",  baseStrength: 80 },
    { name: "CFO",  baseStrength: 78 },
    { name: "GAM",  baseStrength: 72 },
    { name: "DCG",  baseStrength: 70 },
    { name: "MVK",  baseStrength: 75 },
    { name: "SHG",  baseStrength: 66 },
    { name: "GZ",   baseStrength: 64 },
    { name: "DFM",  baseStrength: 60 },
  ]),
};

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
  { stage: "S16世界大賽",   type: "international", condition: "qualified_worlds" },

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
      [POSITION_SPECIALTY[position]]: 50,
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
    fitnessBoost: 0,                    // 訓練點數換來的暫時性衰退減免（消耗型）
    team: {
      name: teamName,
      baseStrength: 60,
      positionStrength: { "上路": 60, "打野": 60, "中路": 60, "ADC": 60, "輔助": 60 },
      chemistry: 50,
      reputation: 50,
      favor: 50,
      contractYears: 2,
    },
    careerCounters: { kills: 0, assists: 0, deaths: 0, wins: 0, losses: 0, mvps: 0, worldsAppearances: 0 },
    seasonRecord: {
      year: 2026,
      currentMeta: "均衡版本",
      metaChampions: [],
      stage1: { wins: 0, losses: 0, playoffResult: null },
      stage2: { wins: 0, losses: 0, playoffResult: null },
      stage3: { wins: 0, losses: 0, playoffResult: null },
      qualifiedEvents: [],
    },
    history: [],
    retired: false,
  };
}
