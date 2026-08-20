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
  // ==================== 日常 ====================
  // ---- 衰退期限定事件：一旦觸發過年齡衰退就會標記進入衰退期，這幾個事件只在那之後才會出現，
  // 讓「巔峰後」的能力值增減期望值跟「巔峰前」有明確區隔，衰退期是真的在扣分，不是持平 ----
  {
    id: "event_decline_stamina_warning",
    category: "日常",
    weight: 3,
    cooldown: 6,
    conditions: [{ flag: "衰退期" }],
    title: "體能拉警報",
    text: "隊醫在賽後檢查時皺著眉頭，說你這個年紀的身體數值已經跟年輕選手有明顯落差。",
    choices: [
      {
        label: "加強保養，正視現實",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 6 }, { type: "dynamic_delta", stat: "心態", value: -4 }] }],
      },
      {
        label: "不想面對，繼續高強度訓練",
        outcomes: [
          { probability: 0.4, resultText: "勉強撐過這陣子，但身體發出的警訊沒有消失。", effects: [{ type: "dynamic_delta", stat: "體能", value: -8 }] },
          { probability: 0.6, resultText: "硬撐的代價還是來了，反應速度明顯掉了一截。", effects: [{ type: "stat_delta", stat: "反應", value: -4 }, { type: "dynamic_delta", stat: "體能", value: -8 }] },
        ],
      },
    ],
  },
  {
    id: "event_decline_rookie_challenge",
    category: "團隊",
    weight: 3,
    cooldown: 6,
    conditions: [{ flag: "衰退期" }],
    title: "後輩的挑戰",
    text: "隊上一位新秀在訓練賽的數據隱隱壓過你，媒體開始討論「世代交替」是不是要來了。",
    choices: [
      {
        label: "正面迎戰，證明自己還沒過氣",
        outcomes: [
          { probability: 0.45, resultText: "你用一場漂亮的表現堵住了質疑的聲音。", effects: [{ type: "fame_delta", value: 6 }, { type: "dynamic_delta", stat: "壓力", value: 10 }] },
          { probability: 0.55, resultText: "求勝心切反而亂了節奏，這波交手你落了下風。", effects: [{ type: "stat_delta", stat: "版本適應力", value: -3 }, { type: "dynamic_delta", stat: "心態", value: -8 } ] },
        ],
      },
      {
        label: "放寬心態，準備扶植接班人",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "領導", value: 4 }, { type: "dynamic_delta", stat: "心態", value: 4 }] }],
      },
    ],
  },
  {
    id: "event_decline_meta_gap",
    category: "日常",
    weight: 3,
    cooldown: 6,
    conditions: [{ flag: "衰退期" }],
    title: "追不上的版本",
    text: "這個版本的節奏比以前快得多，年輕選手上手新機制的速度讓你有點吃力。",
    choices: [
      {
        label: "花更多時間鑽研版本",
        outcomes: [
          { probability: 0.45, resultText: "多花的時間有回報，勉強跟上了節奏。", effects: [{ type: "dynamic_delta", stat: "體能", value: -6 }] },
          { probability: 0.55, resultText: "終究還是追不上這個版本的速度。", effects: [{ type: "stat_delta", stat: "版本適應力", value: -4 }, { type: "dynamic_delta", stat: "體能", value: -6 }] },
        ],
      },
      {
        label: "承認差距，靠經驗彌補",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 3 }, { type: "stat_delta", stat: "版本適應力", value: -2 }] }],
      },
    ],
  },

  // ---- 反應/意識/版本適應力只能靠訓練主動練，事件只會扣不會加(骰輸的懲罰)，
  // 這樣訓練點數投入才有意義，不會被事件隨機性稀釋掉 ----
  {
    id: "event_reaction_choke",
    category: "日常",
    weight: 3,
    cooldown: 6,
    conditions: [],
    title: "關鍵一瞬間",
    text: "團戰爆發的瞬間，你的手速要跟上腦袋的判斷——這種時刻，容不下一絲遲疑。",
    choices: [
      {
        label: "放手一搏",
        outcomes: [
          { probability: 0.6, resultText: "手感全開，這波操作行雲流水。", effects: [{ type: "dynamic_delta", stat: "心態", value: 5 }] },
          { probability: 0.4, resultText: "手速還是慢了半拍，這波操作明顯卡頓。", effects: [{ type: "stat_delta", stat: "反應", value: -3 }, { type: "dynamic_delta", stat: "壓力", value: 8 }] },
        ],
      },
    ],
  },
  {
    id: "event_insight_lapse",
    category: "日常",
    weight: 3,
    cooldown: 6,
    conditions: [],
    title: "視野死角",
    text: "比賽中場休息看回放，教練指出你有一波團戰前的關鍵讀圖出現盲區。",
    choices: [
      {
        label: "檢討這波的判斷",
        outcomes: [
          { probability: 0.6, resultText: "重新推演後發現其實你的判斷沒有問題，只是運氣不好。", effects: [{ type: "dynamic_delta", stat: "心態", value: 5 }] },
          { probability: 0.4, resultText: "確實是判斷失誤，這種盲區之後還會繼續困擾你。", effects: [{ type: "stat_delta", stat: "意識", value: -3 }, { type: "dynamic_delta", stat: "壓力", value: 8 }] },
        ],
      },
    ],
  },
  {
    id: "event_meta_misread",
    category: "日常",
    weight: 3,
    cooldown: 6,
    conditions: [],
    title: "版本誤判",
    text: "新版本上線一週，你對某個改動的理解跟實際測試結果不太一樣。",
    choices: [
      {
        label: "重新研究版本改動",
        outcomes: [
          { probability: 0.6, resultText: "重新研究後抓到了關鍵細節，算是有驚無險。", effects: [{ type: "dynamic_delta", stat: "心態", value: 5 }] },
          { probability: 0.4, resultText: "你對這個版本的理解方向確實出了偏差，這陣子的選角策略要跟著調整。", effects: [{ type: "stat_delta", stat: "版本適應力", value: -3 }, { type: "dynamic_delta", stat: "壓力", value: 8 }] },
        ],
      },
    ],
  },

  {
    id: "event_patch_scouting",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [{ path: "meta.age", min: 19 }],
    title: "版本前瞻研究",
    text: "新版本改動預告釋出，你熬夜研究了幾個可能翻紅的英雄跟走位技巧。",
    choices: [
      {
        label: "整理筆記跟隊友分享",
        outcomes: [
          { probability: 0.55, resultText: "整理的筆記大受好評，隊友都覺得你講得特別清楚。", effects: [{ type: "stat_delta", stat: "領導", value: 9 }, { type: "team_delta", stat: "chemistry", value: 3 }, { type: "dynamic_delta", stat: "體能", value: -4 }] },
          { probability: 0.45, resultText: "講得有點零散，隊友聽得一頭霧水。", effects: [{ type: "dynamic_delta", stat: "體能", value: -4 }] },
        ],
      },
      {
        label: "自己偷偷練，先保留優勢",
        outcomes: [
          { probability: 0.55, resultText: "獨自鑽研出不少心得，實戰時果然派上用場。", effects: [{ type: "stat_delta", stat: "領導", value: 9 }, { type: "personality_delta", stat: "團隊取向", value: -8 }] },
          { probability: 0.45, resultText: "研究方向猜錯了，白忙一場。", effects: [{ type: "personality_delta", stat: "團隊取向", value: -8 }] },
        ],
      },
    ],
  },
  {
    id: "event_analyst_suggestion",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [{ path: "meta.age", min: 19 }],
    title: "數據分析師的建議",
    text: "分析師拿著一份對手習慣的統計報告來找你，建議你調整某個英雄的出場策略。",
    choices: [
      {
        label: "採納建議，調整策略",
        outcomes: [
          { probability: 0.55, resultText: "調整後效果立竿見影，你對策略的掌握度明顯提升。", effects: [{ type: "stat_delta", stat: "領導", value: 8 }, { type: "stat_delta", stat: "溝通", value: 8 }] },
          { probability: 0.45, resultText: "調整後效果不如預期，還得再摸索。", effects: [] },
        ],
      },
      {
        label: "相信自己的直覺，維持原本打法",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 6 }, { type: "team_delta", stat: "favor", value: -2 }] }],
      },
    ],
  },
  // ---- 5：賽前吃壞肚子 ----
  {
    id: "event_bad_noodles",
    category: "日常",
    weight: 4,
    cooldown: 10,
    conditions: [],
    title: "賽前的牛肉麵",
    text: "比賽前你嘴饞吃了一碗路邊牛肉麵，比賽前突然開始鬧肚子。",
    choices: [
      {
        label: "硬撐上場",
        outcomes: [
          { probability: 0.55, resultText: "咬牙撐過去了，這種逆境訓練意外磨出了心理韌性。", effects: [{ type: "dynamic_delta", stat: "體能", value: -10 }, { type: "stat_delta", stat: "抗壓", value: 9 }] },
          { probability: 0.45, resultText: "撐是撐過去了，但整場都不太舒服，沒什麼額外收穫。", effects: [{ type: "dynamic_delta", stat: "體能", value: -10 }] },
        ],
      },
      {
        label: "衝去更衣室廁所，耽誤了熱身",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -6 }, { type: "team_delta", stat: "chemistry", value: -2 }] }],
      },
    ],
  },
  // ---- 7：打排位相關的小插曲（三則輪流出現） ----
  {
    id: "event_soloqueue_afk",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [],
    title: "排位上的插曲",
    text: "練習賽空檔你上線打排位放鬆，結果隊友不合直接在泉水掛機不玩了。",
    choices: [
      {
        label: "跟著擺爛",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -4 }] }],
      },
      {
        label: "獨自carry到底",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 3 }, { type: "dynamic_delta", stat: "體能", value: -4 }] }],
      },
    ],
  },
  {
    id: "event_soloqueue_int",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [],
    title: "心態上頭",
    text: "排位連跪讓你心態上頭，一時衝動送了幾波人頭洩憤。",
    choices: [
      {
        label: "馬上下線冷靜",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 4 }, { type: "stat_delta", stat: "溝通", value: 2 }] }],
      },
      {
        label: "越打越氣，繼續掛著",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -10 }, { type: "stat_delta", stat: "抗壓", value: 3 }] }],
      },
    ],
  },
  // ---- 8：LPL特殊事件 — 排位遇到演員 ----
  {
    id: "event_lpl_scripted_player",
    category: "日常",
    weight: 2,
    cooldown: 10,
    conditions: [{ path: "meta.region", equals: "LPL" }],
    title: "遇到演員",
    text: "排位遇到疑似消極比賽的「演員」，你在語音上直接開罵，被對方截圖檢舉。",
    choices: [
      {
        label: "去申訴說明狀況",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -4 }, { type: "stat_delta", stat: "溝通", value: 2 }] }],
      },
      {
        label: "不理會，反正檢舉不會怎樣",
        outcomes: [
          { probability: 0.7, resultText: "還真沒怎麼樣，檢舉系統還是挺公正的。", effects: [{ type: "dynamic_delta", stat: "心態", value: -2 }] },
          { probability: 0.3, resultText: "帳號真的被短期禁言，還上了論壇被討論。", effects: [{ type: "fame_delta", value: -5 }] },
        ],
      },
    ],
  },
  // ---- 衰退曲線觸發的心態轉折點 ----
  {
    id: "event_decline_awareness",
    category: "日常",
    weight: 3,
    cooldown: 999,
    conditions: [{ path: "decline.totalReactionLoss", min: 10 }, { flag_not: "已回應衰退" }],
    title: "手感不再",
    text: "最近你明顯感覺到反應速度跟不上以前，教練私下提醒你，或許該調整打法了。",
    choices: [
      {
        label: "轉型意識流，靠經驗彌補手速",
        outcomes: [{ effects: [
          { type: "flag_set", flag: "已回應衰退" },
          { type: "flag_set", flag: "轉型意識流" },
          { type: "stat_delta", stat: "溝通", value: 10 },
        ]}],
      },
      {
        label: "堅持巔峰期的打法",
        outcomes: [{ effects: [
          { type: "flag_set", flag: "已回應衰退" },
          { type: "flag_set", flag: "堅持巔峰打法" },
          { type: "dynamic_delta", stat: "心態", value: 6 },
        ]}],
      },
    ],
  },
  // ---- 補充的日常向事件（正面/中性居多，順便平衡冷門能力值）----
  {
    id: "event_extra_practice",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [{ path: "meta.age", min: 19 }],
    title: "加練",
    text: "訓練結束後，你留下來多練了一小時個人操作。",
    choices: [
      {
        label: "紮實地練基本功",
        outcomes: [
          { probability: 0.55, resultText: "這次的加練特別扎實，抗壓能力明顯提升。", effects: [{ type: "stat_delta", stat: "抗壓", value: 10 }, { type: "dynamic_delta", stat: "體能", value: -6 }] },
          { probability: 0.45, resultText: "練到後面有點分心，效果打了折扣。", effects: [{ type: "dynamic_delta", stat: "體能", value: -6 }] },
        ],
      },
      {
        label: "算了，早點回去休息",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 8 }] }],
      },
    ],
  },
  {
    id: "event_team_review",
    category: "日常",
    weight: 4,
    cooldown: 10,
    conditions: [{ path: "meta.age", min: 19 }],
    title: "戰術覆盤",
    text: "教練找你一起看之前的比賽錄影，討論這幾波團戰的決策。",
    choices: [
      {
        label: "認真提出自己的想法",
        outcomes: [
          { probability: 0.55, resultText: "你的觀點切中要害，教練當場稱讚。", effects: [{ type: "stat_delta", stat: "溝通", value: 7 }, { type: "team_delta", stat: "favor", value: 5 }] },
          { probability: 0.45, resultText: "你的想法有點文不對題，教練委婉糾正。", effects: [{ type: "team_delta", stat: "favor", value: 1 }] },
        ],
      },
      {
        label: "隨便應付過去",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 4 }] }],
      },
    ],
  },
  {
    id: "event_shoutcaster_chat",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [{ fame_min: 15 }, { path: "meta.age", min: 19 }],
    title: "賽評的閒聊",
    text: "賽前等待區，一位資深賽評找你聊了幾句，問你對這個版本的看法。",
    choices: [
      {
        label: "認真分析給對方聽",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "領導", value: 2 }, { type: "stat_delta", stat: "溝通", value: 2 }, { type: "fame_delta", value: 2 }] }],
      },
      {
        label: "隨口敷衍幾句",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 2 }] }],
      },
    ],
  },
  {
    id: "event_teammate_bonding",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [{ path: "meta.age", min: 19 }],
    title: "隊友揪團",
    text: "隊友下班後揪你一起吃飯打牌，放鬆一下。",
    choices: [
      {
        label: "一起去，順便聊聊戰術",
        outcomes: [
          { probability: 0.55, resultText: "聊得特別投機，隊伍氣氛明顯升溫。", effects: [{ type: "stat_delta", stat: "溝通", value: 7 }, { type: "team_delta", stat: "chemistry", value: 6 }] },
          { probability: 0.45, resultText: "話題有點尬聊，不過氣氛還算融洽。", effects: [{ type: "team_delta", stat: "chemistry", value: 2 }] },
        ],
      },
      {
        label: "婉拒，自己在家休息",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 6 }, { type: "team_delta", stat: "chemistry", value: -1 }] }],
      },
    ],
  },
  {
    id: "event_call_shots",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [{ path: "meta.age", min: 19 }],
    title: "指揮權",
    text: "這場練習賽隊友把指揮權交給你，讓你來喊團戰時機。",
    choices: [
      {
        label: "大膽指揮，扛起責任",
        outcomes: [
          { probability: 0.5, resultText: "幾波指揮都精準命中節奏，隊友對你刮目相看。", effects: [{ type: "stat_delta", stat: "領導", value: 10 }, { type: "stat_delta", stat: "溝通", value: 4 }, { type: "dynamic_delta", stat: "壓力", value: 6 }] },
          { probability: 0.5, resultText: "喊錯了幾次時機，隊友雖然沒說什麼，但氣氛有點尷尬。", effects: [{ type: "dynamic_delta", stat: "壓力", value: 10 }] },
        ],
      },
      {
        label: "交還給比較有經驗的隊友",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "壓力", value: -4 }] }],
      },
    ],
  },
  {
    id: "event_new_gear",
    category: "日常",
    weight: 3,
    cooldown: 10,
    conditions: [],
    title: "新設備",
    text: "贊助商送來一批新的滑鼠鍵盤，你試用了一下手感。",
    choices: [
      {
        label: "花時間慢慢適應新設備",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 3 }, { type: "stat_delta", stat: "領導", value: 2 }, { type: "dynamic_delta", stat: "心態", value: 4 }] }],
      },
      {
        label: "繼續用習慣的舊設備",
        outcomes: [{ effects: [] }],
      },
    ],
  },
  // ---- 補充：溝通/抗壓/領導 的被動成長來源（這三項不開放主動訓練）----
  {
    id: "event_food_delivery",
    category: "日常",
    weight: 4,
    cooldown: 10,
    conditions: [],
    title: "跑腿外送",
    text: "團練到一半大家都餓了，你主動問一輪要吃什麼，順手包辦點餐跟拿餐。",
    choices: [
      {
        label: "主動包辦，順便聊聊天",
        outcomes: [
          { probability: 0.55, resultText: "邊點餐邊閒聊，跟大家的距離感又拉近了一點。", effects: [{ type: "stat_delta", stat: "溝通", value: 7 }, { type: "team_delta", stat: "chemistry", value: 4 }] },
          { probability: 0.45, resultText: "點餐點得手忙腳亂，沒能好好聊上幾句。", effects: [{ type: "team_delta", stat: "chemistry", value: 1 }] },
        ],
      },
      {
        label: "推給別人處理",
        outcomes: [{ effects: [] }],
      },
    ],
  },

  // ==================== 團隊 ====================
  // ---- 領導觸發次數偏少，新增一個高頻率的專屬事件補足變異度 ----
  {
    id: "event_draft_pick_call",
    category: "團隊",
    weight: 3,
    cooldown: 6,
    conditions: [{ path: "meta.age", min: 19 }],
    title: "BP階段的最終決定",
    text: "教練組在BP討論卡關，最後把最終選角的拍板權交給了你。",
    choices: [
      {
        label: "頂住壓力，親自拍板",
        outcomes: [
          { probability: 0.5, resultText: "你的判斷完全正確，這套陣容打出了教科書級的勝利。", effects: [{ type: "stat_delta", stat: "領導", value: 10 }, { type: "team_delta", stat: "favor", value: 5 }] },
          { probability: 0.5, resultText: "這套陣容打得不上不下，教練組事後有點微詞。", effects: [{ type: "dynamic_delta", stat: "壓力", value: 10 }] },
        ],
      },
      {
        label: "推給教練決定",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "壓力", value: -6 }] }],
      },
    ],
  },

  // ---- 新增電競職業向事件（稀釋日常/感情類佔比，補強戰隊經營/戰術/媒體公關/職涯抉擇這些原本缺乏的面向） ----
  {
    id: "event_scrim_review",
    category: "團隊",
    weight: 4,
    cooldown: 10,
    conditions: [],
    title: "練習賽數據覆盤",
    text: "分析師把這週練習賽的數據整理出來，你的補刀/視野數據被拿出來公開檢討。",
    choices: [
      {
        label: "虛心接受，記下來改進",
        outcomes: [
          { probability: 0.55, resultText: "你把數據問題徹底消化，這次覆盤收穫特別大。", effects: [{ type: "stat_delta", stat: "溝通", value: 9 }, { type: "stat_delta", stat: "領導", value: 5 }, { type: "dynamic_delta", stat: "心態", value: -4 }] },
          { probability: 0.45, resultText: "檢討過程有點打擊信心，收穫不如預期。", effects: [{ type: "dynamic_delta", stat: "心態", value: -4 }] },
        ],
      },
      {
        label: "認為分析師搞錯情境，當場反駁",
        outcomes: [
          { probability: 0.4, resultText: "你指出的盲點確實成立，分析師修正了報告，你的意見被採納。", effects: [{ type: "stat_delta", stat: "領導", value: 2 }, { type: "team_delta", stat: "favor", value: 4 }] },
          { probability: 0.6, resultText: "你的反駁站不住腳，教練組覺得你有點不受教。", effects: [{ type: "team_delta", stat: "favor", value: -6 } ] },
        ],
      },
    ],
  },
  {
    id: "event_coaching_staff_change",
    category: "團隊",
    weight: 2,
    cooldown: 10,
    conditions: [{ fame_min: 15 }],
    title: "教練組異動",
    text: "戰隊突然宣布更換戰術教練，新教練上任後想徹底翻新戰術體系。",
    choices: [
      {
        label: "全力配合新體系",
        outcomes: [
          { probability: 0.55, resultText: "新體系跟你的打法意外契合，適應得特別快。", effects: [{ type: "stat_delta", stat: "領導", value: 9 }, { type: "dynamic_delta", stat: "心態", value: -8 }] },
          { probability: 0.45, resultText: "新體系水土不服，磨合期比預想的長。", effects: [{ type: "dynamic_delta", stat: "心態", value: -8 }] },
        ],
      },
      {
        label: "私下抱持保留態度",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: -4 }, { type: "personality_delta", stat: "驕傲度", value: 6 }] }],
      },
    ],
  },
  {
    id: "event_boot_camp",
    category: "團隊",
    weight: 2,
    cooldown: 10,
    conditions: [{ fame_min: 25 }],
    title: "海外集訓",
    text: "戰隊安排了兩週的海外集訓，密集跟當地強隊約練習賽磨合節奏。",
    choices: [
      {
        label: "把握機會多打多學",
        outcomes: [
          { probability: 0.55, resultText: "這趟集訓收穫遠超預期，狀態明顯提升一個檔次。", effects: [{ type: "stat_delta", stat: "抗壓", value: 10 }, { type: "stat_delta", stat: "溝通", value: 7 }, { type: "dynamic_delta", stat: "體能", value: -12 }] },
          { probability: 0.45, resultText: "水土不服加上時差，這趟集訓效果打了折扣。", effects: [{ type: "dynamic_delta", stat: "體能", value: -12 }] },
        ],
      },
      {
        label: "身心俱疲，只想早點回家",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -10 }, { type: "dynamic_delta", stat: "體能", value: -6 }] }],
      },
    ],
  },
  // ---- 6：跟隊友起衝突 ----
  {
    id: "event_teammate_fight",
    category: "團隊",
    weight: 2,
    cooldown: 10,
    conditions: [{ OR: [{ path: "team.chemistry", max: 35 }, { personality: "驕傲度", min: 40 }] }],
    title: "更衣室的火藥味",
    text: "覆盤會議上你跟隊友為了一次團戰決策吵了起來，你氣得一腳踹翻了他的椅子。",
    choices: [
      {
        label: "冷靜下來，主動道歉",
        outcomes: [
          { probability: 0.5, resultText: "這次道歉讓你更懂得怎麼處理隊內的分歧，收穫超乎預期。", effects: [{ type: "team_delta", stat: "chemistry", value: 4 }, { type: "personality_delta", stat: "自我評價", value: -4 }, { type: "stat_delta", stat: "領導", value: 9 }] },
          { probability: 0.5, resultText: "道歉是道歉了，但心裡還是有點不服氣，沒能真正想通。", effects: [{ type: "team_delta", stat: "chemistry", value: 4 }, { type: "personality_delta", stat: "自我評價", value: -4 }] },
        ],
      },
      {
        label: "絕不退讓",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: -10 }, { type: "personality_delta", stat: "驕傲度", value: 8 }] }],
      },
    ],
  },
  // ---- 12：跟教練爆氣甩門 ----
  {
    id: "event_coach_conflict",
    category: "團隊",
    weight: 2,
    cooldown: 10,
    conditions: [{ path: "team.favor", max: 35 }],
    title: "跟教練的分歧",
    text: "戰術會議上教練否決了你的想法，你氣得摔門離開會議室。",
    choices: [
      {
        label: "事後找教練談開",
        outcomes: [{ effects: [{ type: "team_delta", stat: "favor", value: 6 }, { type: "stat_delta", stat: "溝通", value: 2 } ] }],
      },
      {
        label: "已讀不回，冷戰到底",
        outcomes: [{ effects: [{ type: "team_delta", stat: "favor", value: -10 }, { type: "dynamic_delta", stat: "心態", value: -8 }, { type: "personality_delta", stat: "驕傲度", value: 4 }] }],
      },
    ],
  },
  // ---- 23：連續沒有版本英雄，被隊友嗆 ----
  {
    id: "event_no_meta_champ_scolded",
    category: "團隊",
    weight: 5,
    cooldown: 10,
    conditions: [{ path: "team.chemistry", max: 45 }],
    title: "隊友的怒火",
    text: "隊友在覆盤時敲椅子開罵:「一個賽季練個版本英雄這麼難嗎？」",
    choices: [
      {
        label: "認了，加緊練版本英雄",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: -3 }, { type: "dynamic_delta", stat: "心態", value: -6 }, { type: "stat_delta", stat: "領導", value: 2 }] }],
      },
      {
        label: "反嗆回去，憑什麼說我",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: -10 }, { type: "personality_delta", stat: "驕傲度", value: 8 }] }],
      },
    ],
  },
  {
    id: "event_pep_talk",
    category: "團隊",
    weight: 3,
    cooldown: 10,
    conditions: [{ fame_min: 10 }],
    title: "賽前的精神喊話",
    text: "教練在賽前把大家集合起來，講了一段關於逆境跟堅持的話。",
    choices: [
      {
        label: "認真聽進去",
        outcomes: [
          { probability: 0.55, resultText: "這段話深深觸動了你，抗壓能力明顯提升一截。", effects: [{ type: "stat_delta", stat: "抗壓", value: 10 }, { type: "dynamic_delta", stat: "心態", value: 6 }] },
          { probability: 0.45, resultText: "聽是聽進去了，但實際上場還是有點緊張。", effects: [{ type: "dynamic_delta", stat: "心態", value: 6 }] },
        ],
      },
      {
        label: "左耳進右耳出",
        outcomes: [
          { probability: 0.5, resultText: "雖然嘴上不在意，但賽後跟隊友聊起這段話，意外聊出心得。", effects: [{ type: "stat_delta", stat: "溝通", value: 6 }] },
          { probability: 0.5, resultText: "確實什麼都沒留下。", effects: [] },
        ],
      },
    ],
  },
  {
    id: "event_mentor_rookie",
    category: "團隊",
    weight: 3,
    cooldown: 10,
    conditions: [{ fame_min: 20 }],
    title: "帶新人",
    text: "隊上剛補進一位新秀，教練希望你這個老將能多帶帶他。",
    choices: [
      {
        label: "耐心指導，扛起責任",
        outcomes: [
          { probability: 0.55, resultText: "新人進步神速，你也在教學過程中理清了自己的思路。", effects: [{ type: "stat_delta", stat: "領導", value: 5 }, { type: "stat_delta", stat: "溝通", value: 5 }, { type: "team_delta", stat: "chemistry", value: 3 }] },
          { probability: 0.45, resultText: "新人不太買帳，帶起來有點吃力。", effects: [{ type: "team_delta", stat: "chemistry", value: 1 }] },
        ],
      },
      {
        label: "讓他自己摸索就好",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "溝通", value: 2 }] }],
      },
    ],
  },

  // ==================== 場外 ====================
  {
    id: "event_sponsor_appearance",
    category: "場外",
    weight: 3,
    cooldown: 10,
    conditions: [{ fame_min: 20 }],
    title: "贊助商活動通告",
    text: "隊伍的硬體贊助商邀你出席一場產品發表會，需要配合拍攝跟簡短致詞。",
    choices: [
      {
        label: "認真準備，展現親和力",
        outcomes: [
          { probability: 0.55, resultText: "台風意外地好，現場反應熱烈，贊助商相當滿意。", effects: [{ type: "fame_delta", value: 6 }, { type: "stat_delta", stat: "溝通", value: 7 }, { type: "dynamic_delta", stat: "體能", value: -6 }] },
          { probability: 0.45, resultText: "有點放不開，整場略顯生硬。", effects: [{ type: "fame_delta", value: 3 }, { type: "dynamic_delta", stat: "體能", value: -6 }] },
        ],
      },
      {
        label: "應付了事，能推就推",
        outcomes: [{ effects: [{ type: "team_delta", stat: "reputation", value: -3 }] }],
      },
    ],
  },
  {
    id: "event_content_creation",
    category: "場外",
    weight: 3,
    cooldown: 10,
    conditions: [{ fame_min: 10 }],
    title: "官方直播企劃",
    text: "戰隊的社群小編找你錄一支排位直播，想增加粉絲互動、提升官方帳號流量。",
    choices: [
      {
        label: "開播順便聊聊版本心得",
        outcomes: [{ effects: [{ type: "fame_delta", value: 5 }, { type: "stat_delta", stat: "領導", value: 2 }] }],
      },
      {
        label: "婉拒，不想曝光私下排位",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 4 }] }],
      },
    ],
  },
  {
    id: "event_carry_but_lose",
    category: "場外",
    weight: 3,
    cooldown: 10,
    conditions: [{ flag: "本場carry但輸" }],
    title: "帶不動",
    text: "你打出了生涯級的數據，隊伍還是輸了。論壇已經吵翻了「這隊到底在幹嘛」。",
    choices: [
      {
        label: "檢討自己還能做更多",
        outcomes: [
          { probability: 0.55, resultText: "這場檢討讓你想通了不少細節，之後帶隊能力更上一層樓。", effects: [{ type: "stat_delta", stat: "溝通", value: 7 }, { type: "stat_delta", stat: "抗壓", value: 9 }, { type: "stat_delta", stat: "領導", value: 6 }, { type: "team_delta", stat: "chemistry", value: -3 }] },
          { probability: 0.45, resultText: "越想越不是滋味，這次的反思沒帶來太多實質收穫。", effects: [{ type: "team_delta", stat: "chemistry", value: -3 }] },
        ],
      },
      {
        label: "在心裡認定是隊友拖累",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "團隊取向", value: -16 }, { type: "stat_delta", stat: "溝通", value: -2 }, { type: "team_delta", stat: "chemistry", value: -6 }] }],
      },
    ],
  },
  {
    id: "event_meme_sponsorship",
    category: "場外",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "洗澡狗" }],
    title: "迷因業配邀約",
    text: "一個手遊品牌看上你的「洗澡狗」梗，邀你拍一支自嘲風格的沐浴乳廣告，劇本寫得相當浮誇。",
    choices: [
      {
        label: "接演，順便自嘲一波",
        outcomes: [{ effects: [{ type: "fame_delta", value: 10 }, { type: "money_percent", value: 0.06 }] }],
      },
      {
        label: "婉拒，不想把失誤當賣點",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 4 }] }],
      },
    ],
  },

  // ==================== 輿論 ====================
  {
    id: "event_roster_rumor",
    category: "輿論",
    weight: 3,
    cooldown: 21,
    conditions: [{ fame_min: 20 }],
    title: "轉隊傳聞",
    text: "論壇上開始流傳你即將轉隊的傳聞，隊友看你的眼神都變得有點微妙。",
    choices: [
      {
        label: "主動找隊友澄清",
        outcomes: [
          { probability: 0.55, resultText: "你把話說開了，隊友反而更信任你，你在隊內的話語權也提升了。", effects: [{ type: "team_delta", stat: "chemistry", value: 6 }, { type: "stat_delta", stat: "溝通", value: 4 }, { type: "stat_delta", stat: "領導", value: 6 }] },
          { probability: 0.45, resultText: "澄清是澄清了，氣氛還是有點尷尬。", effects: [{ type: "team_delta", stat: "chemistry", value: 2 }] },
        ],
      },
      {
        label: "不予置評，讓子彈飛一會",
        outcomes: [
          { probability: 0.5, resultText: "傳聞很快就被新的話題蓋過去了。", effects: [] },
          { probability: 0.5, resultText: "隊伍內部因為猜疑氣氛變得緊繃。", effects: [{ type: "team_delta", stat: "chemistry", value: -6 }] },
        ],
      },
    ],
  },
  {
    id: "event_yt_roast",
    category: "輿論",
    weight: 4,
    cooldown: 10,
    conditions: [{ fame_min: 20 }],
    title: "被實況主酸爆",
    text: "知名UP主最強聯盟在上本場比賽精華評價你這場的操作「爛到流湯」，留言區瞬間洗版。",
    choices: [
      {
        label: "不理會，專心練習",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 6 }, { type: "stat_delta", stat: "溝通", value: 2 }] }],
      },
      {
        label: "在社群上回嗆",
        outcomes: [{ effects: [
          { type: "fame_delta", value: 8 },
          { type: "dynamic_delta", stat: "心態", value: -10 },
          { type: "team_delta", stat: "reputation", value: -4 },
          { type: "flag_set", flag: "曾公開回嗆評論" },
        ]}],
      },
    ],
  },
  {
    id: "event_fake_esports_diss",
    category: "輿論",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "曾公開回嗆評論" }],
    title: "另一個UP主的銳評",
    text: "「虛假電競」發了一支影片，逐幀分析你上次回嗆的畫面，還補刀說「那個位置栓條狗都能贏」，這句話瞬間變成迷因到處被轉發。",
    choices: [
      {
        label: "忍不了，正面對決",
        outcomes: [
          { probability: 0.4, resultText: "你的反擊夠犀利，網友反而覺得你很有梗，風向逆轉。", effects: [{ type: "fame_delta", value: 10 }] },
          { probability: 0.6, resultText: "越描越黑，這句話變成你甩不掉的黑歷史迷因。", effects: [{ type: "fame_delta", value: -6 }, { type: "dynamic_delta", stat: "心態", value: -12 }] },
        ],
      },
      {
        label: "冷處理，讓話題自己過去",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -6 }, { type: "stat_delta", stat: "抗壓", value: 3 }] }],
      },
    ],
  },
  // ---- 13：採訪嘴砲對手 ----
  {
    id: "event_trash_talk_interview",
    category: "輿論",
    weight: 3,
    cooldown: 10,
    conditions: [{ flag: "剛奪冠" }],
    title: "賽後採訪",
    text: "拿下勝利後，記者把麥克風遞到你面前，等著你發表感言。",
    choices: [
      {
        label: "「除了我，在座的各位都是垃圾」",
        outcomes: [{ effects: [{ type: "fame_delta", value: 12 }, { type: "team_delta", stat: "reputation", value: -6 }, { type: "personality_delta", stat: "驕傲度", value: 12 }] }],
      },
      {
        label: "「我已經在研究下個版本的對手了」",
        outcomes: [{ effects: [{ type: "fame_delta", value: 8 }, { type: "stat_delta", stat: "領導", value: 2 }] }],
      },
      {
        label: "「回家養豬」",
        outcomes: [{ effects: [{ type: "fame_delta", value: 15 }, { type: "team_delta", stat: "reputation", value: -10 }, { type: "flag_set", flag: "毒舌人設" }] }],
      },
      {
        label: "感謝隊友跟教練，保持低調",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: 4 }, { type: "stat_delta", stat: "領導", value: 2 } ] }],
      },
    ],
  },
  // ---- 21：輸球粉絲抗議 ----
  {
    id: "event_fan_protest",
    category: "輿論",
    weight: 3,
    cooldown: 10,
    conditions: [{ path: "team.favor", max: 25 }, { fame_min: 20 }],
    title: "戰隊大樓前的抗議",
    text: "連續輸球後，一批粉絲開著卡車到戰隊大樓樓下抗議，要求管理層做出改變。",
    choices: [
      {
        label: "出面跟粉絲溝通",
        outcomes: [{ effects: [{ type: "fame_delta", value: 3 }, { type: "dynamic_delta", stat: "心態", value: -6 }, { type: "stat_delta", stat: "溝通", value: 2 }, { type: "stat_delta", stat: "領導", value: 2 }] }],
      },
      {
        label: "留在室內不出面",
        outcomes: [{ effects: [{ type: "team_delta", stat: "reputation", value: -8 }] }],
      },
    ],
  },

  // ==================== 感情 ====================
  // 拿過世界賽FMVP + 沒女友 + 知名度夠高，才會觸發這個廣告邀約
  {
    id: "event_idol_ad_offer",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [
      { path: "careerCounters.fmvps", min: 1 },
      { flag_not: "有女友" },
      { fame_min: 60 },
    ],
    title: "廣告邀約",
    text: "戰隊收到一份合作邀約，某知名品牌想找你跟當紅女團「星映」成員恩靜一起拍一支廣告，宣傳期間會有不少直接互動的橋段。",
    choices: [
      {
        label: "女人只會影響我拔劍的速度",
        outcomes: [{ effects: [{ type: "fame_delta", value: 5 }, { type: "stat_delta", stat: "溝通", value: 2 }] }],
      },
      {
        label: "私下要了聯繫方式",
        outcomes: [
          { probability: 0.5, resultText: "後續聊得不錯，你們私下開始有聯繫。", effects: [
            { type: "fame_delta", value: 5 }, { type: "dynamic_delta", stat: "心態", value: 10 },
            { type: "flag_set", flag: "認識女明星" },
          ]},
          { probability: 0.5, resultText: "對方只是客氣回應，沒有進一步發展，你自己也覺得有點尷尬。", effects: [
            { type: "fame_delta", value: 5 }, { type: "dynamic_delta", stat: "心態", value: -4 },
          ]},
        ],
      },
    ],
  },
  {
    id: "event_idol",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "認識女明星" },],
    title: "女明星後續",
    text: "當初拍廣告認識的恩靜想約你一起逛街。",
    choices: [
      {
        label: "你們喬裝打扮偷偷約在咖啡廳見面會合",
        outcomes: [
          { probability: 0.4, resultText: "沒人發現你們偷偷去約會，你們感情漸漸加深。", effects: [
            { type: "fame_delta", value: 5 }, { type: "dynamic_delta", stat: "心態", value: 10 },
            { type: "flag_set", flag: "跟女明星成功約會" },
          ]},
          { probability: 0.6, resultText: "被私生飯拍到，你們登上娛樂頭條，恩靜所屬星耀娛樂發表聲明說只是普通朋友。", effects: [
            { type: "fame_delta", value: 5 }, { type: "dynamic_delta", stat: "心態", value: -5 },{ type: "stat_delta", stat: "抗壓", value: 4 },{ type: "flag_set", flag: "跟女明星成為一般朋友" },
          ]},
        ],
      },
    ],
  },

  {
    id: "event_idol2",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [
      { path: "careerCounters.fmvps", min: 3 },
      { flag: "跟女明星成功約會" },
      { flag_not: "女明星結局" },
      { fame_min: 80 },
    ],
    title: "女明星後續2",
    text: "跟女團成員恩靜的感情漸漸加深，你決定...?",
    choices: [
      {
        label: "女人只會影響我拔劍的速度",
        outcomes: [
          { probability: 0.55, resultText: "斷得乾脆，反而讓你把全部心力都放回訓練上，狀態出奇地好。", effects: [{ type: "fame_delta", value: -2 }, { type: "dynamic_delta", stat: "心態", value: -5 },{ type: "stat_delta", stat: "領導", value: 8 }] },
          { probability: 0.45, resultText: "嘴上狠話說得漂亮，心裡還是有點在意，沒能完全靜下心。", effects: [{ type: "fame_delta", value: -2 }, { type: "dynamic_delta", stat: "心態", value: -5 }] },
        ],
      },
      {
        label: "跟她確定關係",
        outcomes: [
          { probability: 0.4, resultText: "你們成功確定關係，你甚至在她家住了一晚。", effects: [
            { type: "dynamic_delta", stat: "心態", value: 10 },{ type: "stat_delta", stat: "抗壓", value: 8 },{ type: "dynamic_delta", stat: "壓力", value: -10 },{ type: "dynamic_delta", stat: "體能", value: -6 },
            { type: "flag_set", flag: "跟女明星更進一步" },
          ]},
          { probability: 0.6, resultText: "她想了一下，還是決定以事業為重。", effects: [
            { type: "dynamic_delta", stat: "心態", value: -5 },{ type: "stat_delta", stat: "抗壓", value: -2 },{ type: "flag_set", flag: "跟女明星成為一般朋友" },
          ]},
        ],
      },
    ],
  },

  {
    id: "event_idol3",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "跟女明星成為一般朋友" },{ flag_not: "有女友" },{ flag_not: "女明星結局" },],
    title: "女明星後續3",
    text: "你收到了恩靜結婚的消息，男方是知名演員。",
    choices: [
      {
        label: "無所謂，祝福她幸福",
        outcomes: [
          { probability: 0.4, resultText: "你的灑脫心態助力你的實力更進一步。", effects: [
            { type: "dynamic_delta", stat: "心態", value: 10 },
            { type: "stat_delta", stat: "抗壓", value: 8 },
            { type: "dynamic_delta", stat: "壓力", value: -10 },
            { type: "stat_delta", stat: "溝通", value: 4 },{ type: "stat_delta", stat: "領導", value: 2 },
            { type: "flag_set", flag: "女明星結局" },
          ]},
          { probability: 0.6, resultText: "嘴上說無所謂，其實心裡很痛，你借酒澆愁連續打了rank 48小時。", effects: [
            { type: "dynamic_delta", stat: "心態", value: -5 },
            { type: "stat_delta", stat: "抗壓", value: -4 },
            { type: "dynamic_delta", stat: "壓力", value: 30 },
            { type: "flag_set", flag: "女明星結局" },
          ]},
        ],
      },
      {
        label: "試著約她出來",
        outcomes: [
          { probability: 0.4, resultText: "原來她心裡一直有你，你成功給男明星戴了一頂綠帽子。", effects: [
            { type: "dynamic_delta", stat: "心態", value: 10 },{ type: "stat_delta", stat: "抗壓", value: 8 },{ type: "dynamic_delta", stat: "壓力", value: -10 },{ type: "dynamic_delta", stat: "體能", value: -6 },
            { type: "flag_set", flag: "ntr" },
          ]},
          { probability: 0.6, resultText: "約她的訊息恰好被男明星看到，他在社交平台發文指名批評，輿論一片譁然。", effects: [
            { type: "dynamic_delta", stat: "心態", value: -5 },
            { type: "stat_delta", stat: "抗壓", value: -4 },
            { type: "dynamic_delta", stat: "壓力", value: 30 },
            { type: "flag_set", flag: "女明星結局" },
          ]},
        ],
      },
    ],
  },

  {
    id: "event_idol4",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "跟女明星更進一步" },{ path: "dynamic.體能", max: 0 },],
    title: "女明星後續4",
    text: "你兼顧跟女明星的索求及訓練，體力逐漸不支。",
    choices: [
      {
        label: "男人怎麼能說不行",
        outcomes: [
          { probability: 0.2, resultText: "你狂吃了一陣子瑪卡，勉強應付了過去。", effects: [
            { type: "dynamic_delta", stat: "體能", value: 20 },{ type: "dynamic_delta", stat: "壓力", value: 10 },
          ]},
          { probability: 0.8, resultText: "恩靜知道你無法給他足夠的幸福，提出分手。", effects: [
            { type: "dynamic_delta", stat: "心態", value: -5 },
            { type: "stat_delta", stat: "抗壓", value: -6 },
            { type: "flag_set", flag: "跟女明星成為一般朋友" },
          ]},
        ],
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
          { type: "dynamic_delta", stat: "心態", value: 16 },
          { type: "flag_set", flag: "有女友" },
        ]}],
      },
      {
        label: "婉拒，專注生涯",
        outcomes: [
          { probability: 0.55, resultText: "拒絕之後整個人反而更加專心，抗壓能力有感提升。", effects: [{ type: "stat_delta", stat: "抗壓", value: 7 }] },
          { probability: 0.45, resultText: "拒絕之後心裡還是有點不踏實，沒能完全放下。", effects: [] },
        ],
      },
    ],
  },
  // flag 驅動的情侶事件池示範（有女友之後才可能抽到）
  // ---- 賽事期間限定事件：用 is_international 廣義判定，任何國際賽期間都可能觸發，不綁定特定年分/賽事名稱 ----
  {
    id: "event_worlds_girlfriend_date",
    category: "感情",
    weight: 4,
    cooldown: 10,
    conditions: [{ is_international: true }, { flag: "有女友" }],
    title: "國際賽期間的約會邀約",
    text: "國際賽備戰正緊繃，女友傳訊息說很想你，問你能不能抽空視訊或見一面。",
    choices: [
      {
        label: "抽空陪她，稍微放鬆一下",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: 10 },
          { type: "dynamic_delta", stat: "壓力", value: -12 },
          { type: "dynamic_delta", stat: "體能", value: -6 },
        ]}],
      },
      {
        label: "婉拒，全心準備比賽",
        outcomes: [{ effects: [
          { type: "stat_delta", stat: "抗壓", value: 3 },
          { type: "dynamic_delta", stat: "心態", value: -8 },
        ]}],
      },
    ],
  },
  {
    id: "event_midnight_noodle_demand",
    category: "感情",
    weight: 3,
    cooldown: 6,
    conditions: [{ flag: "有女友" }],
    title: "凌晨三點的牛肉麵",
    text: "連跪好幾把排位，心情差到谷底，你半夜三點打給女友，任性地要她現在就過來幫你煮碗牛肉麵壓壓驚。",
    choices: [
      {
        label: "打了就打了",
        outcomes: [
          { probability: 0.5, resultText: "她碎念歸碎念，還是提著食材摸黑趕來，你們就著宵夜聊開了，你也把這份底氣帶回了訓練場上。", effects: [{ type: "stat_delta", stat: "領導", value: 7 }, { type: "dynamic_delta", stat: "心態", value: 6 }] },
          { probability: 0.5, resultText: "她直接已讀不回，你們大吵一架，整晚沒睡好，隔天研究版本的心思全被搞砸了。", effects: [{ type: "stat_delta", stat: "版本適應力", value: -4 }, { type: "dynamic_delta", stat: "心態", value: -8 } ] },
        ],
      },
    ],
  },
  {
    id: "event_relationship_strain",
    category: "感情",
    weight: 3,
    cooldown: 10,
    conditions: [{ flag: "有女友" }],
    title: "聚少離多",
    text: "長期征戰讓你們見面時間越來越少，她開始抱怨你只在乎比賽。",
    choices: [
      {
        label: "抽時間多陪伴",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "體能", value: -8 },
          { type: "dynamic_delta", stat: "心態", value: 10 },
        ]}],
      },
      {
        label: "以比賽為重",
        outcomes: [
          { probability: 0.5, effects: [{ type: "dynamic_delta", stat: "心態", value: -16 }, { type: "flag_clear", flag: "有女友" }] },
          { probability: 0.5, effects: [{ type: "stat_delta", stat: "抗壓", value: 6 }] },
        ],
      },
    ],
  },
  // ---- 1 + 3：粉絲告白 → 懷孕抉擇（要求墮胎）→ 有機率外流 ----
  {
    id: "event_fan_confession",
    category: "感情",
    weight: 3,
    cooldown: 15,
    conditions: [{ fame_min: 20 }, { flag_not: "有秘密女友" }, { flag_not: "有女友" }],
    title: "粉絲的告白",
    text: "一位長期支持你的粉絲私訊表白，希望能私下認識你。",
    choices: [
      {
        label: "私下交往",
        outcomes: [{ effects: [{ type: "flag_set", flag: "有秘密女友" }, { type: "dynamic_delta", stat: "心態", value: 10 }] }],
      },
      {
        label: "婉拒",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 3 }] }],
      },
    ],
  },
  {
    id: "event_pregnancy_dilemma",
    category: "感情",
    weight: 4,
    cooldown: 20,
    conditions: [{ OR: [{ flag: "有秘密女友" }, { flag: "有女友" }, { flag: "出軌中" }, { flag: "外遇中" }] }, { flag_not: "已處理感情危機" }],
    title: "意外的消息",
    text: "她告訴你，她懷孕了，想知道你的想法。",
    choices: [
      {
        label: "支持她的決定，一起面對",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: 12 },
          { type: "flag_set", flag: "已處理感情危機" },
        ]}],
      },
      {
        label: "要求她墮胎",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: -8 },
          { type: "flag_set", flag: "曾要求墮胎" },
          { type: "flag_set", flag: "已處理感情危機" },
        ]}],
      },
    ],
  },
  // ---- 2：感情關係中的衝突失控 ----
  {
    id: "event_relationship_conflict",
    category: "感情",
    weight: 1,
    cooldown: 20,
    conditions: [{ OR: [{ flag: "有秘密女友" }, { flag: "有女友" }] }, { personality: "決斷風格", min: 40 }],
    title: "失控的爭執",
    text: "你們大吵一架，你情緒完全失控動手打了她，事後你自己也嚇到。",
    choices: [
      {
        label: "事情爆發",
        outcomes: [
          { probability: 0.55, resultText: "你當下坦承錯誤，積極挽回，這件事沒有進一步擴大。", effects: [
            { type: "dynamic_delta", stat: "心態", value: -12 },
            { type: "personality_delta", stat: "自我評價", value: -10 },
          ]},
          { probability: 0.45, resultText: "事情被「最強聯盟」起底爆出來，輿論一片撻伐，要求你退賽。", effects: [
            { type: "fame_delta", value: -35 }, { type: "team_delta", stat: "reputation", value: -20 },
            { type: "flag_set", flag: "家暴爭議" },
          ]},
        ],
      },
    ],
  },
  {
    id: "event_workplace_affair",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ OR: [{ flag: "有秘密女友" }, { flag: "有女友" }] }, { fame_min: 40 }],
    title: "圈內的曖昧",
    text: "戰隊的一位工作人員開始對你表現出明顯的好感，關係逐漸曖昧。",
    choices: [
      {
        label: "保持距離",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 4 }] }],
      },
      {
        label: "順勢發展",
        outcomes: [
          { probability: 0.55, resultText: "沒人發現你們私會，你們越來越囂張，把訓練室當炮房。", effects: [{ type: "dynamic_delta", stat: "心態", value: 10 }, { type: "flag_set", flag: "外遇中" }] },
          { probability: 0.45, resultText: "行蹤被拍到，「最強聯盟」直接開串公審，外遇消息瞬間登上熱搜。", effects: [
            { type: "fame_delta", value: -45 }, { type: "team_delta", stat: "reputation", value: -20 },
          ]},
        ],
      },
    ],
  },
  // ---- 粉絲心動瞬間 → 地下戀情 → (若已有女友則是出軌) → 可能東窗事發／可能懷孕 ----
  {
    id: "event_fan_meetup_spark",
    category: "感情",
    weight: 3,
    cooldown: 20,
    conditions: [{ fame_min: 15 },{ flag_not: "偷偷聯繫粉絲" }],
    title: "簽名會上的心動瞬間",
    text: "戰隊辦的粉絲見面會上，有位粉絲跟你聊了幾句，感覺特別合拍，讓你一整天都在想這件事。",
    choices: [
      {
        label: "偷偷記下對方的社群帳號",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 4 }, { type: "flag_set", flag: "偷偷聯繫粉絲" }] }],
      },
      {
        label: "提醒自己保持專業距離",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 3 }] }],
      },
    ],
  },
  {
    id: "event_secret_fan_romance",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "偷偷聯繫粉絲" }, { flag_not: "有女友" }],
    title: "跟粉絲的地下戀情",
    text: "你們私下聯繫了一段時間，關係漸漸從聊天變成了戀愛，只是你們都刻意低調，沒有公開。",
    choices: [
      {
        label: "順其自然，繼續這段關係",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 8 }, { type: "flag_set", flag: "有秘密女友" }] }],
      },
      {
        label: "覺得風險太高，主動結束",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -6 }] }],
      },
    ],
  },
  {
    id: "event_secret_fan_affair",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "偷偷聯繫粉絲" }, { flag: "有女友" }],
    title: "越界的曖昧",
    text: "你明明已經有女友，卻還是沒能控制住跟這位粉絲的聯繫，關係在你也說不清的狀態下越滑越深。",
    choices: [
      {
        label: "不小心滑進去了",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: 6 },
          { type: "dynamic_delta", stat: "壓力", value: 16 },
          { type: "flag_set", flag: "有秘密女友" },
          { type: "flag_set", flag: "出軌中" },
        ]}],
      },
      {
        label: "懸崖勒馬，狠心切斷聯繫",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -10 }, { type: "personality_delta", stat: "自我評價", value: 4 }] }],
      },
    ],
  },
  // ---- 14：交友軟體照騙驚魂 ----
  {
    id: "event_catfish_shock",
    category: "感情",
    weight: 4,
    cooldown: 999,
    conditions: [{ fame_min: 10 }],
    title: "見面驚魂",
    text: "你在網路上聊了很久、互有好感的對象，實際碰面後發現性別跟你原本想像的完全不一樣，你一時難以接受，心態受到不小衝擊。",
    choices: [
      {
        label: "來都來了",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 4 }, { type: "stat_delta", stat: "溝通", value: 2 }, { type: "stat_delta", stat: "領導", value: 2 }] }],
      },
      {
        label: "當場失態離開",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -16 }, { type: "personality_delta", stat: "決斷風格", value: 6 }] }],
      },
    ],
  },
  // ---- 懷孕抉擇的後續報應：如果當初選了要求墮胎，有機率被這個事件找上 ----
  {
    id: "event_baby_spirit_gate",
    category: "感情",
    weight: 5,
    cooldown: 999,
    conditions: [{ flag: "曾要求墮胎" }, { flag_not: "已渡化嬰靈" }],
    title: "嬰靈之門",
    text: "最近夜裡總是睡不安穩，你總覺得有什麼東西在盯著你，教練都說你這陣子練習心不在焉、手感掉得離譜。",
    choices: [
      {
        label: "找廟裡做法事超度",
        outcomes: [{ resultText: "花了一筆錢做完法事，心裡的陰影總算淡了一些。", effects: [
          { type: "stat_delta", stat: "抗壓", value: -12 },
          { type: "stat_delta", stat: "溝通", value: -12 },
          { type: "stat_delta", stat: "抗壓", value: -8 },
          { type: "dynamic_delta", stat: "心態", value: -20 },
          { type: "money_percent", value: -0.5 },
          { type: "flag_set", flag: "已渡化嬰靈" },
        ]}],
      },
      {
        label: "不理會，硬撐過去",
        outcomes: [{ resultText: "你選擇硬撐，但這股陰影似乎還沒有真正離開。", effects: [
          { type: "stat_delta", stat: "抗壓", value: -20 },
          { type: "stat_delta", stat: "溝通", value: -20 },
          { type: "stat_delta", stat: "抗壓", value: -16 },
          { type: "dynamic_delta", stat: "心態", value: -36 },
        ]}],
      },
    ],
  },

  // ==================== 醜聞 ====================
  {
    id: "event_affair_exposed",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ flag: "出軌中" }],
    title: "紙包不住火",
    text: "你以為藏得很好的秘密，還是被女友發現了蛛絲馬跡，他跟你開爆，爆料你想要她幫你繳房貸還私約女優。",
    choices: [
      {
        label: "爆就爆",
        outcomes: [
          { probability: 0.8, resultText: "對話截圖被貼上「最強聯盟」，出軌實錘，網友紛紛到你出軌的對象底下朝聖。", effects: [
            { type: "fame_delta", value: -30 }, { type: "team_delta", stat: "reputation", value: -15 },
            { type: "flag_set", flag: "已被抓到出軌" }, { type: "flag_set", flag: "外遇中" },
          ]},
          { probability: 0.2, resultText: "對話截圖被貼上「最強聯盟」，大家覺得沒什麼，你只是犯了天下男人都會犯的錯。", effects: [
            { type: "dynamic_delta", stat: "壓力", value: 20 }, { type: "dynamic_delta", stat: "心態", value: 16 },
          ]},
        ],
      },
    ],
  },

  // ==================== 簽賭 ====================
  {
    id: "event_match_fixing_offer",
    category: "簽賭",
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
            { type: "money_percent", value: 0.15 },
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
  // ---- 4：地下賭盤登門（比原本的線上簽賭邀約更進一步） ----
  {
    id: "event_bookie_visit",
    category: "簽賭",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 55 }, { flag_not: "涉賭未爆" }, { flag_not: "生涯終止_涉賭" }],
    title: "組頭登門",
    text: "決賽前夕，一名自稱地下賭盤組頭的人堵在你的租屋樓下，要你放水這場比賽。",
    choices: [
      {
        label: "自首並向聯盟坦白",
        outcomes: [{ effects: [
          { type: "fame_delta", value: 10 }, { type: "team_delta", stat: "favor", value: 8 },
          { type: "flag_set", flag: "已拒絕過簽賭" },
        ]}],
      },
      {
        label: "屈服，打假賽",
        outcomes: [
          { probability: 0.45, resultText: "假賽做得很乾淨，暫時沒被發現。", effects: [
            { type: "money_percent", value: 0.3 },
            { type: "flag_set", flag: "涉賭未爆" },
          ]},
          { probability: 0.55, resultText: "數據異常被聯盟抓包，職業生涯就此終結。", effects: [
            { type: "fame_delta", value: -70 }, { type: "flag_set", flag: "生涯終止_涉賭" },
          ]},
        ],
      },
    ],
  },

  // ==================== 轉會 ====================
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
        outcomes: [{ effects: [{ type: "flag_set", flag: "待轉隊" }, { type: "dynamic_delta", stat: "心態", value: 12 }] }],
      },
      {
        label: "留下來，試圖修復關係",
        outcomes: [{ effects: [{ type: "team_delta", stat: "favor", value: 10 }] }],
      },
    ],
  },

  // ==================== 轉路 ====================
  {
    id: "event_position_change_offer",
    category: "轉路",
    weight: 2,
    cooldown: 999,
    conditions: [
      { path: "rosterStatus", equals: "bench" },
    ],
    title: "教練的提議",
    text: "教練發現隊上另一個位置長期缺人，問你願不願意嘗試轉位置，搶一個先發機會。",
    choices: [
      {
        label: "願意嘗試轉位置",
        outcomes: [{ effects: [{ type: "flag_set", flag: "待轉位置" }, { type: "stat_delta", stat: "領導", value: 2 }] }],
      },
      {
        label: "堅持守住原本位置",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -4 }, { type: "personality_delta", stat: "自我評價", value: 6 }] }],
      },
    ],
  },

  // ==================== 彩蛋 ====================
  {
    id: "event_ktv_invite",
    category: "彩蛋",
    weight: 3,
    cooldown: 15,
    conditions: [{ fame_min: 15 }],
    title: "商業聚會邀約",
    text: "贊助商私下邀你去商K放鬆，順便交流交流，去不去？",
    choices: [
      {
        label: "答應赴約",
        outcomes: [
          { probability: 0.5, resultText: "聚會氣氛不錯，你放鬆了不少，要到了很多小姐姐的LINE，心態明顯變好。", effects: [
            { type: "dynamic_delta", stat: "心態", value: 12 },
            { type: "dynamic_delta", stat: "壓力", value: -20 },
          ]},
          { probability: 0.5, resultText: "有人把你去商K的畫面PO上網，媒體大做文章。", effects: [
            { type: "team_delta", stat: "reputation", value: -15 },
            { type: "flag_set", flag: "禁賽兩場" },
            { type: "stat_delta", stat: "抗壓", value: -6 },
			{ type: "fame_delta", value: 5 },
          ]},
        ],
      },
      {
        label: "婉拒，早點休息",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 6 }] }],
      },
    ],
  },
  {
    id: "event_relationship_leak",
    category: "彩蛋",
    weight: 1,
    cooldown: 999,
    conditions: [{ OR: [{ flag: "曾要求墮胎" }, { flag: "有秘密女友" }] }, { fame_min: 35 }],
    title: "私密對話外流",
    text: "你們之間的私密對話截圖-我射四次，你高潮幾次? 被貼到「最強聯盟」Discord，內容直接坐實了要求墮胎的指控，話題瞬間炸開，罵聲一片。",
    choices: [
      {
        label: "公開發聲道歉",
        outcomes: [
          { probability: 0.6, resultText: "你的態度被認為誠懇，風波比預期小。", effects: [
            { type: "fame_delta", value: -8 }, { type: "team_delta", stat: "reputation", value: -5 },
          ]},
          { probability: 0.4, resultText: "道歉聲明被認為毫無誠意，罵聲反而更大。", effects: [
            { type: "fame_delta", value: -20 }, { type: "team_delta", stat: "reputation", value: -15 },
          ]},
        ],
      },
      {
        label: "否認到底，委任律師處理",
        outcomes: [
          { probability: 0.35, resultText: "強硬的態度成功壓下話題，事件逐漸冷卻。", effects: [
            { type: "fame_delta", value: -3 },
          ]},
          { probability: 0.65, resultText: "否認被起底打臉，誠信徹底破產。", effects: [
            { type: "fame_delta", value: -30 }, { type: "team_delta", stat: "reputation", value: -20 },
            { type: "personality_delta", stat: "驕傲度", value: 10 },
          ]},
        ],
      },
    ],
  },
  {
    id: "event_soloqueue_afk_shower",
    category: "彩蛋",
    weight: 2,
    cooldown: 999,
    conditions: [],
    title: "洗澡去了",
    text: "訓練賽中場休息你上線打排位，結果打到一半跑去洗澡，隊友在語音上罵翻。",
    choices: [
      {
        label: "回來後道歉",
        outcomes: [{ effects: [{ type: "fame_delta", value: -2 }] }],
      },
      {
        label: "不當一回事",
        outcomes: [
          { probability: 0.6, resultText: "隊友沒發現你是選手，無事發生。", effects: [{ type: "fame_delta", value: -6 }, { type: "personality_delta", stat: "驕傲度", value: 6 }] },
          { probability: 0.4, resultText: "隊友把你落跑洗澡的錄影PO上網，被瘋傳嘲笑，能力值也跟著崩了一下。", effects: [
            { type: "fame_delta", value: -18 },
            { type: "stat_delta", stat: "抗壓", value: -6 },
            { type: "dynamic_delta", stat: "心態", value: -12 },
			{ type: "flag_set", flag: "洗澡狗" }
          ]},
        ],
      },
    ],
  },
  {
    id: "event_paid_companionship",
    category: "彩蛋",
    weight: 3,
    cooldown: 999,
    conditions: [{ fame_min: 45 }],
    title: "嫖娼邀約",
    text: "應酬結束後，朋友問你要不要一起去嫖，順便介紹了「服務」。",
    choices: [
      {
        label: "婉拒離開",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 4 }] }],
      },
      {
        label: "留下來",
        outcomes: [
          { probability: 0.6, resultText: "沒被發現，釋放了長久以來比賽累積的壓力，你走進俱樂部練習室大喊一句舒服!!隊友覺得你今天莫名其妙。", effects: [{ type: "dynamic_delta", stat: "心態", value: 8 }] },
          { probability: 0.4, resultText: "嫖娼被「最強聯盟」起底爆料，全網公審，形象重創。", effects: [
            { type: "fame_delta", value: -40 }, { type: "team_delta", stat: "reputation", value: -20 },
          ]},
        ],
      },
    ],
  },
  // ---- 10：線下賽不擊掌被罰 ----
  {
    id: "event_no_highfive_fine",
    category: "彩蛋",
    weight: 3,
    cooldown: 50,
    conditions: [{ fame_min: 25 }],
    title: "選手通道的插曲",
    text: "賽後選手通道，你因為心情不好沒有跟等候的粉絲擊掌，被聯盟認定違反選手規範，被罰了一筆錢。",
    choices: [
      {
        label: "接受裁罰",
        outcomes: [{ effects: [{ type: "money_percent", value: -0.03 }, { type: "fame_delta", value: -3 }] }],
      },
      {
        label: "公開表達不滿",
        outcomes: [{ effects: [{ type: "money_percent", value: -0.03 }, { type: "fame_delta", value: 4 }, { type: "team_delta", stat: "reputation", value: -5 }, { type: "stat_delta", stat: "溝通", value: 2 }] }],
      },
    ],
  },
  // ---- 11：私訊爆氣辱罵 ----
  {
    id: "event_rage_text",
    category: "彩蛋",
    weight: 2,
    cooldown: 999,
    conditions: [{ OR: [{ personality: "驕傲度", min: 45 }, { personality: "決斷風格", min: 45 }] }],
    title: "已讀不回引爆的怒火",
    text: "私訊粉絲遲遲沒有即時回覆，你越想越氣，情緒失控傳了一句「你這乳牛」洩憤。",
    choices: [
      {
        label: "情緒失控",
          outcomes: [              
			  { probability: 0.4, resultText: "對話截圖被貼上「最強聯盟」，網路上罵聲一片，人設崩壞。", effects: [
                { type: "fame_delta", value: -15 }, { type: "team_delta", stat: "reputation", value: -8 },
              ]},
			  { probability: 0.6, resultText: "被對方家長發現曝光，原來對方只是高中生，網路上一片譁然。", effects: [
                { type: "fame_delta", value: -10 }, 
                { type: "team_delta", stat: "reputation", value: -15 }, 
                { type: "dynamic_delta", stat: "心態", value: -16 }, 
                { type: "flag_set", flag: "禁賽兩場" },
                { type: "stat_delta", stat: "抗壓", value: -6 },
				{ type: "flag_set", flag: "乳牛" }
              ]},
            ],
      },
    ],
  },
  // ---- 16：團練放屁（彩蛋） ----
  {
    id: "event_fart_break",
    category: "彩蛋",
    weight: 1,
    cooldown: 999,
    conditions: [],
    title: "團練中斷",
    text: "團練練到一半，不知道是誰突然放了一個驚天動地的屁，全隊瞬間笑到練不下去。",
    choices: [
      {
        label: "承認是自己",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: 5 }, { type: "fame_delta", value: 1 }, { type: "dynamic_delta", stat: "壓力", value: -10 }] }],
      },
      {
        label: "死不承認",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: 3 }] }],
      },
    ],
  },
  // ---- 17：投資糾紛 ----
  {
    id: "event_expired_noodles_shop",
    category: "彩蛋",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 40 }],
    title: "投資風波",
    text: "你私下投資的拉麵店被爆出販賣過期泡麵，消費者上網公審，你的名字也被一起提起。",
    choices: [
      {
        label: "公開道歉並下架商品",
        outcomes: [{ effects: [{ type: "fame_delta", value: -8 }, { type: "money_percent", value: -0.3 }] }],
      },
      {
        label: "沉默不回應",
        outcomes: [{ effects: [{ type: "fame_delta", value: -18 }] }],
      },
    ],
  },
  // ---- 19：意外受傷 ----
  {
    id: "event_slip_injury",
    category: "彩蛋",
    weight: 2,
    cooldown: 50,
    conditions: [],
    title: "意外的一跤",
    text: "你在浴室滑倒，重重摔了一下，腰部傳來一陣刺痛。",
    choices: [
      {
        label: "檢查傷勢",
        outcomes: [
          { probability: 0.6, resultText: "還好只是輕微拉傷，冰敷休息一下就沒事了。", effects: [
            { type: "add_injury", id: "slip_back_minor", name: "腰部輕微拉傷", severity: 1, affectedStats: { "反應": -1 }, duration: 1 },
          ]},
          { probability: 0.4, resultText: "送醫檢查後發現傷得比想像中嚴重，得住院一個月靜養。", effects: [
            { type: "add_injury", id: "slip_back_severe", name: "腰椎重度扭傷", severity: 3, affectedStats: { "反應": -6, "意識": -2 }, duration: 4 },
            { type: "dynamic_delta", stat: "體能", value: -60 },
          ]},
        ],
      },
    ],
  },
  // ---- 20：割雙眼皮（彩蛋） ----
  {
    id: "event_eyelid_surgery",
    category: "彩蛋",
    weight: 3,
    cooldown: 999,
    conditions: [{ fame_min: 30 }],
    title: "微整型",
    text: "在網上看到有人批評你的顏質，你決定去割了雙眼皮，鏡頭前的形象更上相了。",
    choices: [
      {
        label: "帥就一個字",
        outcomes: [{ effects: [{ type: "fame_delta", value: 5 }, { type: "dynamic_delta", stat: "心態", value: 6 }, { type: "flag_set", flag: "雙眼皮" }] }],
      },
    ],
  },
  // ---- 22：私訊傳錯群組 ----
  {
    id: "event_wrong_chat_screenshot",
    category: "彩蛋",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 30 }],
    title: "傳錯群組",
    text: "你滑IG看到一張照片，手滑打了一句「幹這人真的很大，但好像有點病」的評論訊息，結果傳錯傳到了當事人私訊，當事人立馬截圖公審你。",
    choices: [
      {
        label: "馬上撤回並道歉",
        outcomes: [{ effects: [{ type: "fame_delta", value: -10 }, { type: "team_delta", stat: "chemistry", value: -5 }] }],
      },
      {
        label: "假裝沒事發生",
        outcomes: [{ effects: [{ type: "fame_delta", value: -18 }, { type: "team_delta", stat: "chemistry", value: -12 }] }],
      },
    ],
  },
];

// 動態權重保底：指定分類每次「這輪符合資格但沒被抽中」就累加miss次數，權重跟著提高；
// 一旦抽中就歸零重來。彩蛋/感情基礎權重很小(彩蛋只有2，總池124)，用「乘倍率」幾乎沒感覺，
// 改用「加法」直接疊加權重值，才能在真實遊戲一年僅約7次抽選的頻率下，有效逼近保底
const PITY_CATEGORIES = ["彩蛋", "感情"]; // 想加其他分類進保底機制，直接加進這個陣列就好
const PITY_ADD_PER_MISS = 3; // 每次沒抽到，該分類權重直接加10（相對池子總權重~124是有感的漲幅）
const PITY_MAX_ADD = 120; // 上限，避免長期沒資格符合的分類權重無限膨脹

export function pickEvent(character, rng, stageType) {
  const cooldowns = character.flags.__eventCooldowns ?? {};
  const pool = EVENTS.filter((e) => {
    if (cooldowns[e.id] && cooldowns[e.id] > character.meta.currentStageIndex) return false;
    return checkAllConditions(character, e.conditions ?? []);
  });
  if (pool.length === 0) return null;

  const missStreak = character.flags.__pityMissStreak ?? (character.flags.__pityMissStreak = {});
  const weightedPool = pool.map((e) => {
    if (!PITY_CATEGORIES.includes(e.category)) return e;
    const streak = missStreak[e.category] ?? 0;
    const addWeight = Math.min(streak * PITY_ADD_PER_MISS, PITY_MAX_ADD);
    return { ...e, weight: e.weight + addWeight };
  });

  const picked = pickWeighted(rng, weightedPool);

  for (const cat of PITY_CATEGORIES) {
    const hadEligibleThisRound = pool.some((e) => e.category === cat);
    if (!hadEligibleThisRound) continue;
    missStreak[cat] = picked.category === cat ? 0 : (missStreak[cat] ?? 0) + 1;
  }

  return picked;
}

// 保底機制用：在指定分類裡符合資格的事件中抽一個（還是照weight抽，只是先篩選分類）
export function forceEventByCategory(character, rng, category) {
  const cooldowns = character.flags.__eventCooldowns ?? {};
  const pool = EVENTS.filter((e) => {
    if (e.category !== category) return false;
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

// 選項結算：outcomes.length===1 直接套用；>1 用機率換算成2d6骰子門檻值判定
export function resolveChoiceOutcome(choice, rng) {
  const outs = choice.outcomes;
  if (outs.length === 1) {
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
