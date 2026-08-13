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

// ---- 賽區 ----
export const REGIONS = ["LPL", "LCK", "LEC", "LTA", "LCP"];

// 2026 真實隊伍佔位資料。baseStrength 請自行研究填入真實數值 (0-100)。
// tier 只是顯示用標籤，不影響運算。
export const TEAMS = {
  LPL: [
    { name: "BLG",  baseStrength: 82, reputation: 70 },
    { name: "TES",  baseStrength: 78, reputation: 68 },
    { name: "JDG",  baseStrength: 85, reputation: 80 },
    { name: "AL",   baseStrength: 74, reputation: 60 },
    { name: "LNG",  baseStrength: 76, reputation: 62 },
  ],
  LCK: [
    { name: "T1",     baseStrength: 88, reputation: 90 },
    { name: "GEN.G",  baseStrength: 86, reputation: 82 },
    { name: "HLE",    baseStrength: 79, reputation: 65 },
    { name: "DK",     baseStrength: 77, reputation: 63 },
    { name: "KT",     baseStrength: 73, reputation: 58 },
  ],
  LEC: [
    { name: "G2",   baseStrength: 80, reputation: 75 },
    { name: "FNC",  baseStrength: 74, reputation: 68 },
    { name: "MDK",  baseStrength: 70, reputation: 55 },
    { name: "KC",   baseStrength: 68, reputation: 50 },
  ],
  LTA: [
    { name: "100T", baseStrength: 70, reputation: 60 },
    { name: "TL",   baseStrength: 72, reputation: 62 },
    { name: "FLY",  baseStrength: 66, reputation: 50 },
  ],
  LCP: [
    { name: "CFO",  baseStrength: 62, reputation: 55 },
    { name: "PSG",  baseStrength: 60, reputation: 48 },
    { name: "GAM",  baseStrength: 63, reputation: 52 },
  ],
};

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
export const INNATE_TALENTS = [
  { id: "glass_body",  name: "玻璃體質", rarity: "rare",   desc: "受傷機率提高，但巔峰期數值成長更快。" },
  { id: "big_heart",   name: "大賽型選手", rarity: "rare",  desc: "國際賽事的抗壓加權額外提升。" },
  { id: "fast_learner", name: "版本怪物", rarity: "legendary", desc: "版本更迭時幾乎不受過渡期debuff影響。" },
  { id: "iron_wrist",  name: "鐵手腕",   rarity: "rare",   desc: "手部相關傷病機率大幅降低。" },
  { id: "night_owl",   name: "夜貓子",   rarity: "common",  desc: "體能基礎值略低，但意識成長略快。" },
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
    dynamic: { 心態: 50, 體能: 70 },
    fame: 10,
    talents: [],
    flags: {},
    injuries: [],
    chronicInjuries: [],
    rosterStatus: "rotation", // starter | rotation | bench
    team: {
      name: teamName,
      baseStrength: 60,
      chemistry: 50,
      reputation: 50,
      favor: 50,
      contractYears: 2,
    },
    careerCounters: { kills: 0, assists: 0, deaths: 0, wins: 0, losses: 0, mvps: 0, worldsAppearances: 0 },
    seasonRecord: {
      year: 2026,
      currentMeta: "均衡版本",
      stage1: { wins: 0, losses: 0, playoffResult: null },
      stage2: { wins: 0, losses: 0, playoffResult: null },
      stage3: { wins: 0, losses: 0, playoffResult: null },
      qualifiedEvents: [],
    },
    history: [],
    retired: false,
  };
}
