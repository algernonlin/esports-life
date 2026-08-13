// ============================================================
// events.js — 事件資料表 + 抽選器
// 之後要擴充事件，只需要在 EVENTS 陣列裡新增物件，不用動這支檔案的邏輯
// ============================================================
import { checkAllConditions } from "./conditions.js";
import { pickWeighted } from "./rng.js";
import { probabilityToTarget, rollTwoDice } from "./dice.js";

// -------------------------------------------------------------
// 事件資料範例（示範用，實際內容之後大量擴充）
// category 用於防重複冷卻；chainPool 用於解鎖後續事件池（flag 驅動）
// -------------------------------------------------------------
export const EVENTS = [
  {
    id: "event_yt_roast",
    category: "輿論",
    weight: 4,
    cooldown: 2,
    conditions: [{ fame_min: 20 }],
    title: "被實況主酸爆",
    text: "知名球評在直播上逐幀分析你這場的操作，評價「濫到流湯」，留言區瞬間洗版。",
    choices: [
      {
        label: "不理會，專心練習",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 3 }] }],
      },
      {
        label: "在社群上回嗆",
        outcomes: [{ effects: [
          { type: "fame_delta", value: 8 },
          { type: "dynamic_delta", stat: "心態", value: -5 },
          { type: "team_delta", stat: "reputation", value: -4 },
        ]}],
      },
    ],
  },
  {
    id: "event_ktv_invite",
    category: "社交",
    weight: 3,
    cooldown: 3,
    conditions: [{ fame_min: 15 }],
    title: "商業聚會邀約",
    text: "贊助商私下邀你去唱K放鬆，順便交流交流，去不去？",
    choices: [
      {
        label: "答應赴約",
        outcomes: [
          { probability: 0.75, resultText: "聚會氣氛不錯，你放鬆了不少，心態明顯變好。", effects: [
            { type: "dynamic_delta", stat: "心態", value: 6 },
            { type: "fame_delta", value: 3 },
          ]},
          { probability: 0.25, resultText: "有人把你唱歌的畫面PO上網，媒體大做文章。", effects: [
            { type: "team_delta", stat: "reputation", value: -15 },
            { type: "flag_set", flag: "禁賽兩場" },
            { type: "stat_delta", stat: "抗壓", value: -3 },
          ]},
        ],
      },
      {
        label: "婉拒，早點休息",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 3 }] }],
      },
    ],
  },
  {
    id: "event_confession",
    category: "感情",
    weight: 2,
    cooldown: 999,
    conditions: [{ fame_min: 25 }, { flag_not: "有女友" }],
    title: "私訊表白",
    text: "一位常在賽後轉播出現的主持人私下向你表白，要不要試著交往看看？",
    choices: [
      {
        label: "答應交往",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: 8 },
          { type: "flag_set", flag: "有女友" },
        ]}],
      },
      {
        label: "婉拒，專注生涯",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 2 }] }],
      },
    ],
  },
  // flag 驅動的情侶事件池示範（有女友之後才可能抽到）
  {
    id: "event_relationship_strain",
    category: "感情",
    weight: 3,
    cooldown: 2,
    conditions: [{ flag: "有女友" }],
    title: "聚少離多",
    text: "長期征戰讓你們見面時間越來越少，她開始抱怨你只在乎比賽。",
    choices: [
      {
        label: "抽時間多陪伴",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "體能", value: -4 },
          { type: "dynamic_delta", stat: "心態", value: 5 },
        ]}],
      },
      {
        label: "以比賽為重",
        outcomes: [
          { probability: 0.5, effects: [{ type: "dynamic_delta", stat: "心態", value: -8 }, { type: "flag_clear", flag: "有女友" }] },
          { probability: 0.5, effects: [{ type: "stat_delta", stat: "抗壓", value: 3 }] },
        ],
      },
    ],
  },
  {
    id: "event_match_fixing_offer",
    category: "道德抉擇",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 40 }, { flag_not: "已拒絕過簽賭" }, { flag_not: "涉賭未爆" }],
    title: "簽賭邀約",
    text: "一個陌生帳號私訊你，開價買你放水這場比賽的結果。",
    choices: [
      {
        label: "答應",
        outcomes: [
          { probability: 0.5, resultText: "這場比賽你放水放得不著痕跡，賺了一筆但良心不安。", effects: [
            { type: "career_counter_delta", counter: "money", value: 500 },
            { type: "flag_set", flag: "涉賭未爆" },
          ]},
          { probability: 0.5, resultText: "資料被起底，你的職業生涯就此蒙上污點。", effects: [
            { type: "fame_delta", value: -60 },
            { type: "flag_set", flag: "生涯終止_涉賭" },
          ]},
        ],
      },
      {
        label: "拒絕並回報",
        outcomes: [{ effects: [
          { type: "fame_delta", value: 5 },
          { type: "flag_set", flag: "已拒絕過簽賭" },
        ]}],
      },
    ],
  },
  {
    id: "event_carry_but_lose",
    category: "心態",
    weight: 3,
    cooldown: 1,
    conditions: [{ flag: "本場carry但輸" }],
    title: "帶不動",
    text: "你打出了生涯級的數據，隊伍還是輸了。論壇已經吵翻了「這隊到底在幹嘛」。",
    choices: [
      {
        label: "檢討自己還能做更多",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "意識", value: 2 }, { type: "team_delta", stat: "chemistry", value: -3 }] }],
      },
      {
        label: "在心裡認定是隊友拖累",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "團隊取向", value: -8 }, { type: "team_delta", stat: "chemistry", value: -6 }] }],
      },
    ],
  },
  {
    id: "event_midseason_trade",
    category: "轉會",
    weight: 2,
    cooldown: 999,
    conditions: [
      { path: "team.favor", max: 30 },
      { OR: [{ path: "team.chemistry", max: 25 }, { path: "seasonRecord.stage1.losses", min: 8 }] },
    ],
    title: "意外的轉隊邀約",
    text: "隊伍似乎不太滿意你的表現，這時另一支隊伍私下探詢你的轉隊意願。",
    choices: [
      {
        label: "接受，尋求新機會",
        outcomes: [{ effects: [{ type: "flag_set", flag: "待轉隊" }, { type: "dynamic_delta", stat: "心態", value: 6 }] }],
      },
      {
        label: "留下來，試圖修復關係",
        outcomes: [{ effects: [{ type: "team_delta", stat: "favor", value: 10 }] }],
      },
    ],
  },
];

// -------------------------------------------------------------
// 抽選器：先過濾符合條件且不在冷卻中的事件，再依權重抽
// -------------------------------------------------------------
export function pickEvent(character, rng, stageType) {
  const cooldowns = character.flags.__eventCooldowns ?? {};
  const pool = EVENTS.filter((e) => {
    if (cooldowns[e.id] && cooldowns[e.id] > character.meta.currentStageIndex) return false;
    return checkAllConditions(character, e.conditions ?? []);
  });
  if (pool.length === 0) return null;
  return pickWeighted(rng, pool);
}

export function markEventCooldown(character, event) {
  if (!character.flags.__eventCooldowns) character.flags.__eventCooldowns = {};
  character.flags.__eventCooldowns[event.id] = character.meta.currentStageIndex + (event.cooldown ?? 1);
}

// 事件選項結算：outcomes 只有一個 → 沒有不確定性，直接套用，不擲骰
// outcomes 有兩個（含機率）→ 換算成 2d6 門檻值，交給 UI 做擲骰動畫再判定
// 回傳 { outcome, dice } — dice 為 null 代表這個選項是確定結果，不用骰
export function resolveChoiceOutcome(choice, rng) {
  const outs = choice.outcomes;
  if (outs.length === 1 && outs[0].probability === undefined) {
    return { outcome: outs[0], dice: null };
  }

  // 目前只支援二分支（成功/失敗）的骰子判定，這也是絕大多數抉擇事件的形狀
  const successProb = outs[0].probability ?? 0.5;
  const { target, prob: actualProb } = probabilityToTarget(successProb);
  const roll = rollTwoDice(rng);
  const passed = roll.sum >= target;
  const outcome = passed ? outs[0] : outs[1];

  return {
    outcome,
    dice: { ...roll, target, actualProb, passed },
  };
}
