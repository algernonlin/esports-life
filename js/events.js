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
    text: "知名球評在直播上逐幀分析你這場的操作，評價「爛到流湯」，留言區瞬間洗版。",
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
    text: "贊助商私下邀你去唱商K放鬆，順便交流交流，去不去？",
    choices: [
      {
        label: "答應赴約",
        outcomes: [
          { probability: 0.5, resultText: "聚會氣氛不錯，認識了不少妹子，你放鬆了不少，心態明顯變好。", effects: [
            { type: "dynamic_delta", stat: "心態", value: 6 },
            { type: "dynamic_delta", stat: "壓力", value: -10 },
            { type: "fame_delta", value: 3 },
          ]},
          { probability: 0.5, resultText: "有人把你去商k的畫面PO上小紅書，輿論一片譁然。", effects: [
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
        outcomes: [{ effects: [{ type: "flag_set", flag: "待轉位置" }] }],
      },
      {
        label: "堅持守住原本位置",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -2 }, { type: "personality_delta", stat: "自我評價", value: 3 }] }],
      },
    ],
  },


  // ---- 1 + 3：粉絲告白 → 懷孕抉擇（要求墮胎）→ 有機率外流 ----
  {
    id: "event_fan_confession",
    category: "感情",
    weight: 3,
    cooldown: 999,
    conditions: [{ fame_min: 20 }, { flag_not: "有秘密女友" }, { flag_not: "有女友" }],
    title: "粉絲的告白",
    text: "一位長期支持你的粉絲私訊表白，希望能私下認識你。",
    choices: [
      {
        label: "私下交往",
        outcomes: [{ effects: [{ type: "flag_set", flag: "有秘密女友" }, { type: "dynamic_delta", stat: "心態", value: 5 }] }],
      },
      {
        label: "婉拒",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 1 }] }],
      },
    ],
  },
  {
    id: "event_pregnancy_dilemma",
    category: "感情",
    weight: 1,
    cooldown: 999,
    conditions: [{ OR: [{ flag: "有秘密女友" }, { flag: "有女友" }] }, { flag_not: "已處理感情危機" }],
    title: "意外的消息",
    text: "她告訴你，她懷孕了，想知道你的想法。",
    choices: [
      {
        label: "支持她的決定，一起面對",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: 6 },
          { type: "flag_set", flag: "已處理感情危機" },
        ]}],
      },
      {
        label: "要求她墮胎",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: -4 },
          { type: "flag_set", flag: "曾要求墮胎" },
          { type: "flag_set", flag: "已處理感情危機" },
        ]}],
      },
    ],
  },
  {
    id: "event_relationship_leak",
    category: "醜聞",
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
            { type: "personality_delta", stat: "驕傲度", value: 5 },
          ]},
        ],
      },
    ],
  },

  // ---- 2：感情關係中的衝突失控 ----
  {
    id: "event_relationship_conflict",
    category: "感情",
    weight: 1,
    cooldown: 999,
    conditions: [{ OR: [{ flag: "有秘密女友" }, { flag: "有女友" }] }, { personality: "決斷風格", min: 40 }],
    title: "失控的爭執",
    text: "你們大吵一架，你情緒完全失控動手打了她，事後你自己也嚇到。",
    choices: [
      {
        label: "坦承錯誤，積極挽回",
        outcomes: [{ effects: [
          { type: "dynamic_delta", stat: "心態", value: -6 },
          { type: "personality_delta", stat: "自我評價", value: -5 },
        ]}],
      },
      {
        label: "威脅對方別聲張出去",
        outcomes: [
          { probability: 0.5, resultText: "這件事暫時被壓下來了。", effects: [{ type: "dynamic_delta", stat: "心態", value: -3 }] },
          { probability: 0.5, resultText: "事情還是被「最強聯盟」起底爆出來，輿論一片撻伐，要求你退賽。", effects: [
            { type: "fame_delta", value: -35 }, { type: "team_delta", stat: "reputation", value: -20 },
            { type: "flag_set", flag: "家暴爭議" },
          ]},
        ],
      },
    ],
  },

  // ---- 4：地下賭盤登門（比原本的線上簽賭邀約更進一步） ----
  {
    id: "event_bookie_visit",
    category: "道德抉擇",
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
            { type: "career_counter_delta", counter: "money", value: 800 },
            { type: "flag_set", flag: "涉賭未爆" },
          ]},
          { probability: 0.55, resultText: "數據異常被聯盟抓包，職業生涯就此終結。", effects: [
            { type: "fame_delta", value: -70 }, { type: "flag_set", flag: "生涯終止_涉賭" },
          ]},
        ],
      },
    ],
  },

  // ---- 5：賽前吃壞肚子 ----
  {
    id: "event_bad_noodles",
    category: "日常",
    weight: 4,
    cooldown: 3,
    conditions: [],
    title: "賽前的牛肉麵",
    text: "比賽前你嘴饞吃了一碗路邊牛肉麵，比賽前突然開始鬧肚子。",
    choices: [
      {
        label: "硬撐上場",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: -5 }, { type: "stat_delta", stat: "抗壓", value: 1 }] }],
      },
      {
        label: "衝去更衣室廁所，耽誤了熱身",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -3 }, { type: "team_delta", stat: "chemistry", value: -2 }] }],
      },
    ],
  },

  // ---- 6：跟隊友起衝突 ----
  {
    id: "event_teammate_fight",
    category: "團隊衝突",
    weight: 2,
    cooldown: 2,
    conditions: [{ OR: [{ path: "team.chemistry", max: 35 }, { personality: "驕傲度", min: 40 }] }],
    title: "更衣室的火藥味",
    text: "覆盤會議上你跟隊友為了一次團戰決策吵了起來，你氣得一腳踹翻了他的椅子。",
    choices: [
      {
        label: "冷靜下來，主動道歉",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: 4 }, { type: "personality_delta", stat: "自我評價", value: -2 }] }],
      },
      {
        label: "絕不退讓",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: -10 }, { type: "personality_delta", stat: "驕傲度", value: 4 }] }],
      },
    ],
  },

  // ---- 12：跟教練爆氣甩門 ----
  {
    id: "event_coach_conflict",
    category: "團隊衝突",
    weight: 2,
    cooldown: 3,
    conditions: [{ path: "team.favor", max: 35 }],
    title: "跟教練的分歧",
    text: "戰術會議上教練否決了你的想法，你氣得摔門離開會議室。",
    choices: [
      {
        label: "事後找教練談開",
        outcomes: [{ effects: [{ type: "team_delta", stat: "favor", value: 6 } ] }],
      },
      {
        label: "已讀不回，冷戰到底",
        outcomes: [{ effects: [{ type: "team_delta", stat: "favor", value: -10 }, { type: "dynamic_delta", stat: "心態", value: -4 }] }],
      },
    ],
  },

  // ---- 7：打排位相關的小插曲（三則輪流出現） ----
  {
    id: "event_soloqueue_afk",
    category: "日常",
    weight: 3,
    cooldown: 2,
    conditions: [],
    title: "排位上的插曲",
    text: "練習賽空檔你上線打排位放鬆，結果隊友不合直接在泉水掛機不玩了。",
    choices: [
      {
        label: "跟著擺爛",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -2 }] }],
      },
      {
        label: "獨自carry到底",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "抗壓", value: 1 }, { type: "dynamic_delta", stat: "體能", value: -2 }] }],
      },
    ],
  },
  {
    id: "event_soloqueue_int",
    category: "日常",
    weight: 3,
    cooldown: 2,
    conditions: [],
    title: "心態上頭",
    text: "排位連跪讓你心態上頭，一時衝動送了幾波人頭洩憤。",
    choices: [
      {
        label: "馬上下線冷靜",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 2 }] }],
      },
      {
        label: "越打越氣，繼續掛著",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -5 }] }],
      },
    ],
  },
  {
    id: "event_soloqueue_afk_shower",
    category: "日常",
    weight: 2,
    cooldown: 2,
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
          { probability: 0.3, effects: [{ type: "fame_delta", value: -6 }, { type: "personality_delta", stat: "驕傲度", value: 3 }] },
          { probability: 0.7, resultText: "隊友把你落跑洗澡的錄影PO上網，被瘋傳嘲笑，能力值也跟著崩了一下。", effects: [
            { type: "fame_delta", value: -18 },
            { type: "stat_delta", stat: "抗壓", value: -3 },
            { type: "dynamic_delta", stat: "心態", value: -6 },
          ]},
        ],
      },
    ],
  },

  // ---- 8：LPL特殊事件 — 排位遇到演員 ----
  {
    id: "event_lpl_scripted_player",
    category: "日常",
    weight: 2,
    cooldown: 3,
    conditions: [{ path: "meta.region", equals: "LPL" }],
    title: "遇到演員",
    text: "排位遇到疑似消極比賽的「演員」，你在語音上直接開罵，被對方截圖檢舉。",
    choices: [
      {
        label: "去申訴說明狀況",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -2 }] }],
      },
      {
        label: "不理會，反正檢舉不會怎樣",
        outcomes: [
          { probability: 0.7, effects: [{ type: "dynamic_delta", stat: "心態", value: -1 }] },
          { probability: 0.3, resultText: "帳號真的被短期禁言，還上了論壇被討論。", effects: [{ type: "fame_delta", value: -5 }] },
        ],
      },
    ],
  },

  // ---- 9：嫖娼 / 外遇 ----
  {
    id: "event_paid_companionship",
    category: "醜聞",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 45 }],
    title: "嫖娼邀約",
    text: "應酬結束後，朋友問你要不要一起去嫖，順便介紹了「服務」。",
    choices: [
      {
        label: "婉拒離開",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 2 }] }],
      },
      {
        label: "留下來",
        outcomes: [
          { probability: 0.7, effects: [{ type: "dynamic_delta", stat: "心態", value: 4 }] },
          { probability: 0.3, resultText: "嫖娼被「最強聯盟」起底爆料，全網公審，形象重創。", effects: [
            { type: "fame_delta", value: -40 }, { type: "team_delta", stat: "reputation", value: -20 },
          ]},
        ],
      },
    ],
  },
  {
    id: "event_workplace_affair",
    category: "醜聞",
    weight: 1,
    cooldown: 999,
    conditions: [{ OR: [{ flag: "有秘密女友" }, { flag: "有女友" }] }, { fame_min: 40 }],
    title: "圈內的曖昧",
    text: "戰隊的一位工作人員開始對你表現出明顯的好感，關係逐漸曖昧。",
    choices: [
      {
        label: "保持距離",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 2 }] }],
      },
      {
        label: "順勢發展",
        outcomes: [
          { probability: 0.55, effects: [{ type: "dynamic_delta", stat: "心態", value: 5 }, { type: "flag_set", flag: "外遇中" }] },
          { probability: 0.45, resultText: "行蹤被拍到，「最強聯盟」直接開串公審，外遇消息瞬間登上熱搜。", effects: [
            { type: "fame_delta", value: -45 }, { type: "team_delta", stat: "reputation", value: -20 },
          ]},
        ],
      },
    ],
  },

  // ---- 10：線下賽不擊掌被罰 ----
  {
    id: "event_no_highfive_fine",
    category: "紀律",
    weight: 2,
    cooldown: 3,
    conditions: [{ fame_min: 25 }],
    title: "選手通道的插曲",
    text: "賽後選手通道，你因為心情不好沒有跟等候的粉絲擊掌，被聯盟認定違反選手規範罰了15萬。",
    choices: [
      {
        label: "接受裁罰",
        outcomes: [{ effects: [{ type: "career_counter_delta", counter: "money", value: -15 }, { type: "fame_delta", value: -3 }] }],
      },
      {
        label: "公開表達不滿",
        outcomes: [{ effects: [{ type: "career_counter_delta", counter: "money", value: -15 }, { type: "fame_delta", value: 4 }, { type: "team_delta", stat: "reputation", value: -5 }] }],
      },
    ],
  },

  // ---- 11：私訊爆氣辱罵 ----
  {
    id: "event_rage_text",
    category: "醜聞",
    weight: 2,
    cooldown: 2,
    conditions: [{ OR: [{ personality: "驕傲度", min: 45 }, { personality: "決斷風格", min: 45 }] }],
    title: "已讀不回引爆的怒火",
    text: "私訊對方遲遲沒有即時回覆，你越想越氣，情緒失控傳了一句「你這乳牛」洩憤。",
    choices: [
      {
        label: "訊息傳出後馬上撤回道歉",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -2 }] }],
      },
      {
        label: "不當一回事",
        outcomes: [
          { probability: 0.6, effects: [] },
          { probability: 0.4, resultText: "對話截圖被貼上「最強聯盟」，網路上罵聲一片，人設崩壞。", effects: [
            { type: "fame_delta", value: -15 }, { type: "team_delta", stat: "reputation", value: -8 },
          ]},
        ],
      },
    ],
  },

  // ---- 13：採訪嘴砲對手 ----
  {
    id: "event_trash_talk_interview",
    category: "輿論",
    weight: 3,
    cooldown: 2,
    conditions: [{ flag: "剛奪冠" }],
    title: "賽後採訪",
    text: "拿下勝利後，記者把麥克風遞到你面前，等著你發表感言。",
    choices: [
      {
        label: "「除了我，在座的各位都是垃圾」",
        outcomes: [{ effects: [{ type: "fame_delta", value: 12 }, { type: "team_delta", stat: "reputation", value: -6 }, { type: "personality_delta", stat: "驕傲度", value: 6 }] }],
      },
      {
        label: "「我已經在研究MSI的對手了」",
        outcomes: [{ effects: [{ type: "fame_delta", value: 8 }, { type: "stat_delta", stat: "抗壓", value: 1 }] }],
      },
      {
        label: "「回家養豬」",
        outcomes: [{ effects: [{ type: "fame_delta", value: 15 }, { type: "team_delta", stat: "reputation", value: -10 }, { type: "flag_set", flag: "毒舌人設" }] }],
      },
      {
        label: "感謝隊友跟教練，保持低調",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: 4 } ] }],
      },
    ],
  },

  // ---- 14：交友軟體照騙驚魂 ----
  {
    id: "event_catfish_shock",
    category: "感情",
    weight: 2,
    cooldown: 999,
    conditions: [{ fame_min: 10 }],
    title: "見面驚魂",
    text: "你在網路上聊了很久、互有好感的對象，實際碰面後發現性別跟你原本想像的完全不一樣，你一時難以接受，心態受到不小衝擊。",
    choices: [
      {
        label: "來都來了",
        outcomes: [{ effects: [{ type: "personality_delta", stat: "自我評價", value: 2 }] }],
      },
      {
        label: "當場失態離開",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: -8 }] }],
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
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: 5 }, { type: "fame_delta", value: 1 }, { type: "dynamic_delta", stat: "壓力", value: -5 }] }],
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
    category: "醜聞",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 40 }],
    title: "投資風波",
    text: "你私下投資的拉麵店被爆出販賣過期泡麵，消費者上網公審，你的名字也被一起提起。",
    choices: [
      {
        label: "公開道歉並下架商品",
        outcomes: [{ effects: [{ type: "fame_delta", value: -8 }, { type: "career_counter_delta", counter: "money", value: -50 }] }],
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
    category: "意外",
    weight: 2,
    cooldown: 2,
    conditions: [],
    title: "意外的一跤",
    text: "你在浴室滑倒，重重摔了一下，腰部傳來一陣刺痛。",
    choices: [
      {
        label: "去醫院檢查",
        outcomes: [{ effects: [
          { type: "add_injury", id: "slip_back", name: "腰部扭傷", severity: 1, affectedStats: { "反應": -3 }, duration: 2 },
        ]}],
      },
    ],
  },

  // ---- 20：割雙眼皮（彩蛋） ----
  {
    id: "event_eyelid_surgery",
    category: "彩蛋",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 30 }],
    title: "微整型",
    text: "在網上看到有人批評你的顏質，你去割了雙眼皮，鏡頭前的形象更上相了。",
    choices: [
      {
        label: "順其自然",
        outcomes: [{ effects: [{ type: "fame_delta", value: 5 }, { type: "dynamic_delta", stat: "心態", value: 3 }] }],
      },
    ],
  },

  // ---- 21：輸球粉絲抗議 ----
  {
    id: "event_fan_protest",
    category: "輿論",
    weight: 2,
    cooldown: 3,
    conditions: [{ path: "team.favor", max: 25 }, { fame_min: 20 }],
    title: "戰隊大樓前的抗議",
    text: "連續輸球後，一批粉絲開著卡車到戰隊大樓樓下抗議，要求管理層做出改變。",
    choices: [
      {
        label: "出面跟粉絲溝通",
        outcomes: [{ effects: [{ type: "fame_delta", value: 3 }, { type: "dynamic_delta", stat: "心態", value: -3 }] }],
      },
      {
        label: "留在室內不出面",
        outcomes: [{ effects: [{ type: "team_delta", stat: "reputation", value: -8 }] }],
      },
    ],
  },

  // ---- 22：私訊傳錯群組 ----
  {
    id: "event_wrong_chat_screenshot",
    category: "醜聞",
    weight: 1,
    cooldown: 999,
    conditions: [{ fame_min: 30 }],
    title: "傳錯群組",
    text: "你滑IG看到一張照片，手滑打了一句「幹這人真的很大，但好像有點病」的評論訊息，結果傳錯傳到了當事人私訊，當事人立馬截圖公審。",
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

  // ---- 衰退曲線觸發的心態轉折點 ----
  {
    id: "event_decline_awareness",
    category: "心態",
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
          { type: "stat_delta", stat: "意識", value: 4 },
        ]}],
      },
      {
        label: "堅持巔峰期的打法",
        outcomes: [{ effects: [
          { type: "flag_set", flag: "已回應衰退" },
          { type: "flag_set", flag: "堅持巔峰打法" },
          { type: "dynamic_delta", stat: "心態", value: 3 },
        ]}],
      },
    ],
  },

  // ---- 23：連續沒有版本英雄，被隊友嗆 ----
  {
    id: "event_no_meta_champ_scolded",
    category: "團隊衝突",
    weight: 2,
    cooldown: 2,
    conditions: [{ path: "team.chemistry", max: 45 }],
    title: "隊友的怒火",
    text: "隊友在覆盤時敲椅子開罵:「一個賽季練個版本英雄這麼難嗎？」",
    choices: [
      {
        label: "認了，加緊練版本英雄",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: -3 }, { type: "dynamic_delta", stat: "心態", value: -3 }] }],
      },
      {
        label: "反嗆回去，憑什麼說我",
        outcomes: [{ effects: [{ type: "team_delta", stat: "chemistry", value: -10 }, { type: "personality_delta", stat: "驕傲度", value: 4 }] }],
      },
    ],
  },

  // ---- 日常向事件----
  {
    id: "event_extra_practice",
    category: "日常",
    weight: 4,
    cooldown: 2,
    conditions: [],
    title: "加練",
    text: "訓練結束後，你留下來多練了一小時個人操作。",
    choices: [
      {
        label: "紮實地練基本功",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "反應", value: 2 }, { type: "dynamic_delta", stat: "體能", value: -3 }] }],
      },
      {
        label: "算了，早點回去休息",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 4 }] }],
      },
    ],
  },
  {
    id: "event_team_review",
    category: "日常",
    weight: 4,
    cooldown: 2,
    conditions: [],
    title: "戰術覆盤",
    text: "教練找你一起看之前的比賽錄影，討論這幾波團戰的決策。",
    choices: [
      {
        label: "認真提出自己的想法",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "意識", value: 2 }, { type: "team_delta", stat: "favor", value: 3 }] }],
      },
      {
        label: "隨便應付過去",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 2 }] }],
      },
    ],
  },
  {
    id: "event_shoutcaster_chat",
    category: "日常",
    weight: 3,
    cooldown: 2,
    conditions: [{ fame_min: 15 }],
    title: "賽評的閒聊",
    text: "賽前等待區，一位資深賽評找你聊了幾句，問你對這個版本的看法。",
    choices: [
      {
        label: "認真分析給對方聽",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "版本適應力", value: 2 }, { type: "fame_delta", value: 2 }] }],
      },
      {
        label: "隨口敷衍幾句",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "心態", value: 1 }] }],
      },
    ],
  },
  {
    id: "event_teammate_bonding",
    category: "日常",
    weight: 3,
    cooldown: 2,
    conditions: [],
    title: "隊友揪團",
    text: "隊友下班後揪你一起吃飯打牌，放鬆一下。",
    choices: [
      {
        label: "一起去，順便聊聊戰術",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "溝通", value: 2 }, { type: "team_delta", stat: "chemistry", value: 4 }] }],
      },
      {
        label: "婉拒，自己在家休息",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "體能", value: 3 }, { type: "team_delta", stat: "chemistry", value: -1 }] }],
      },
    ],
  },
  {
    id: "event_call_shots",
    category: "日常",
    weight: 3,
    cooldown: 2,
    conditions: [],
    title: "指揮權",
    text: "這場練習賽隊友把指揮權交給你，讓你來喊團戰時機。",
    choices: [
      {
        label: "大膽指揮，扛起責任",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "領導", value: 2 }, { type: "dynamic_delta", stat: "壓力", value: 3 }] }],
      },
      {
        label: "交還給比較有經驗的隊友",
        outcomes: [{ effects: [{ type: "dynamic_delta", stat: "壓力", value: -2 }] }],
      },
    ],
  },
  {
    id: "event_new_gear",
    category: "日常",
    weight: 3,
    cooldown: 3,
    conditions: [],
    title: "新設備",
    text: "贊助商送來一批新的滑鼠鍵盤，你試用了一下手感。",
    choices: [
      {
        label: "花時間慢慢適應新設備",
        outcomes: [{ effects: [{ type: "stat_delta", stat: "反應", value: 1 }, { type: "dynamic_delta", stat: "心態", value: 2 }] }],
      },
      {
        label: "繼續用習慣的舊設備",
        outcomes: [{ effects: [] }],
      },
    ],
  },

  // ---- 懷孕抉擇的後續報應：如果當初選了要求墮胎，有機率被這個事件找上 ----
  {
    id: "event_baby_spirit_gate",
    category: "感情",
    weight: 1,
    cooldown: 999,
    conditions: [{ flag: "曾要求墮胎" }, { flag_not: "已渡化嬰靈" }],
    title: "嬰靈之門",
    text: "最近夜裡總是睡不安穩，你總覺得有什麼東西在盯著你，教練都說你這陣子練習心不在焉、手感掉得離譜。",
    choices: [
      {
        label: "找廟裡做法事超度",
        outcomes: [{ resultText: "花了一筆錢做完法事，心裡的陰影總算淡了一些。", effects: [
          { type: "stat_delta", stat: "反應", value: -6 },
          { type: "stat_delta", stat: "意識", value: -6 },
          { type: "stat_delta", stat: "抗壓", value: -4 },
          { type: "dynamic_delta", stat: "心態", value: -10 },
          { type: "career_counter_delta", counter: "money", value: -100 },
          { type: "flag_set", flag: "已渡化嬰靈" },
        ]}],
      },
      {
        label: "不理會，硬撐過去",
        outcomes: [{ resultText: "你選擇硬撐，但這股陰影似乎還沒有真正離開。", effects: [
          { type: "stat_delta", stat: "反應", value: -10 },
          { type: "stat_delta", stat: "意識", value: -10 },
          { type: "stat_delta", stat: "抗壓", value: -8 },
          { type: "dynamic_delta", stat: "心態", value: -18 },
        ]}],
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
