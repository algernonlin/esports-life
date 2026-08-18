// ============================================================
// achievements.js — 生涯累積型成就（里程碑），跟事件共用效果結算器
// ============================================================
import { applyEffects, summarizeEffects } from "./effects.js";
import { clamp } from "./rng.js";

export const MILESTONES = [
  // ==================== 擊殺 (Kills) ====================
  { id: "kills_100",  track: "kills",  threshold: 100,  title: "奪命書生（入門）", effects: [{ type: "fame_delta", value: 1 }] },
  { id: "kills_500",  track: "kills",  threshold: 500,  title: "殺人不眨眼", effects: [{ type: "fame_delta", value: 2 }] },
  { id: "kills_1000", track: "kills",  threshold: 1000, title: "千人斬魔頭", effects: [{ type: "fame_delta", value: 3 }] },
  { id: "kills_2500", track: "kills",  threshold: 2500, title: "人間太歲", effects: [{ type: "fame_delta", value: 4 }] },
  { id: "kills_5000", track: "kills",  threshold: 5000, title: "閻王爺本人", effects: [{ type: "fame_delta", value: 5 }] },

  // ==================== 助攻 (Assists) ====================
  { id: "assists_100",  track: "assists",  threshold: 100,  title: "佛系助攻", effects: [{ type: "fame_delta", value: 1 }] },
  { id: "assists_500",  track: "assists",  threshold: 500,  title: "專業擦玻璃", effects: [{ type: "fame_delta", value: 2 }] },
  { id: "assists_1000", track: "assists",  threshold: 1000, title: "最強工具人", effects: [{ type: "fame_delta", value: 3 }] },
  { id: "assists_2500", track: "assists",  threshold: 2500, title: "最佳綠葉獎", effects: [{ type: "fame_delta", value: 4 }] },
  { id: "assists_5000", track: "assists",  threshold: 5000, title: "我只要助攻（不要頭）", effects: [{ type: "fame_delta", value: 5 }] },

  // ==================== 勝場 (Wins) ====================
  { id: "wins_10",   track: "wins",  threshold: 10,   title: "運氣流玩家", effects: [{ type: "fame_delta", value: 1 }] },
  { id: "wins_50",   track: "wins",  threshold: 50,   title: "躺分仔的春天", effects: [{ type: "fame_delta", value: 2 }] },
  { id: "wins_100",  track: "wins",  threshold: 100,  title: "帶飛全場", effects: [{ type: "fame_delta", value: 3 }] },
  { id: "wins_250",  track: "wins",  threshold: 250,  title: "常勝將軍", effects: [{ type: "fame_delta", value: 4 }] },
  { id: "wins_500",  track: "wins",  threshold: 500,  title: "天選之人", effects: [{ type: "fame_delta", value: 5 }] },

  // ==================== 死亡 (Deaths) - 反向趣味梗 ====================
  { id: "deaths_100",  track: "deaths",  threshold: 100,  title: "送頭學徒", effects: [{ type: "fame_delta", value: 1 }] },
  { id: "deaths_500",  track: "deaths",  threshold: 500,  title: "峽谷觀光客", effects: [{ type: "fame_delta", value: 2 }] },
  { id: "deaths_1000", track: "deaths",  threshold: 1000, title: "死神不來找我（我找死神）", effects: [{ type: "fame_delta", value: 3 }] },
  { id: "deaths_2500", track: "deaths",  threshold: 2500, title: "移動提款機", effects: [{ type: "fame_delta", value: 4 }] },
  { id: "deaths_5000", track: "deaths",  threshold: 5000, title: "地縛靈", effects: [{ type: "fame_delta", value: 5 }] },

  // ==================== MVP次數 ====================
  { id: "mvps_10",  track: "mvps",  threshold: 10,  title: "大腿初現", effects: [{ type: "fame_delta", value: 1 }] },
  { id: "mvps_25",  track: "mvps",  threshold: 25,  title: "全隊的希望", effects: [{ type: "fame_delta", value: 2 }] },
  { id: "mvps_50",  track: "mvps",  threshold: 50,  title: "把把C（Carry）", effects: [{ type: "fame_delta", value: 3 }] },
  { id: "mvps_100", track: "mvps",  threshold: 100, title: "一人帶四坑", effects: [{ type: "fame_delta", value: 4 }] },
  { id: "mvps_200", track: "mvps",  threshold: 200, title: "神一般的存在", effects: [{ type: "fame_delta", value: 5 }] },

  // ==================== 出場次數 (Appearances) ====================
  { id: "appearances_50",   track: "appearances",  threshold: 50,   title: "電競新鮮人", effects: [{ type: "fame_delta", value: 1 }] },
  { id: "appearances_100",  track: "appearances",  threshold: 100,  title: "老屁股", effects: [{ type: "fame_delta", value: 2 }] },
  { id: "appearances_300",  track: "appearances",  threshold: 300,  title: "職業釘子戶", effects: [{ type: "fame_delta", value: 3 }] },
  { id: "appearances_500",  track: "appearances",  threshold: 500,  title: "電競公務員", effects: [{ type: "fame_delta", value: 4 }] },
  { id: "appearances_1000", track: "appearances",  threshold: 1000, title: "傳奇化石", effects: [{ type: "fame_delta", value: 5 }] },
];

export function checkMilestones(character, log) {
  const unlocked = character.flags.__milestones ?? {};
  for (const m of MILESTONES) {
    if (unlocked[m.id]) continue;
    if ((character.careerCounters[m.track] ?? 0) >= m.threshold) {
      unlocked[m.id] = true;
      applyEffects(character, m.effects, log);
      const summary = summarizeEffects(m.effects, character);
      log.push({ stage: character.meta.currentStageName, year: character.meta.careerYear, text: `達成成就：${m.title}${summary ? `　[${summary}]` : ""}` });
    }
  }
  character.flags.__milestones = unlocked;

  checkCompoundMilestones(character, log, unlocked);
  character.flags.__milestones = unlocked;
}

// 三冠王/五冠王/十冠王、大滿貫/大滿亞：這種「多條件同時成立」的成就，
// 不是單一數值累積到門檻，跟MILESTONES的形狀不一樣，另外寫判斷邏輯
const WORLDS_CROWN_TIERS = [
  { id: "worlds_crown_3", threshold: 3, title: "三冠王" },
  { id: "worlds_crown_5", threshold: 5, title: "五冠王" },
  { id: "worlds_crown_10", threshold: 10, title: "十冠王" },
];

function checkCompoundMilestones(character, log, unlocked) {
  const cc = character.careerCounters;

  // 三冠王/五冠王/十冠王：世界大賽冠軍次數達標
  for (const tier of WORLDS_CROWN_TIERS) {
    if (unlocked[tier.id]) continue;
    if ((cc.worldsTitles ?? 0) >= tier.threshold) {
      unlocked[tier.id] = true;
      character.fame = clamp(character.fame + tier.threshold, 0, 100);
      log.push({ stage: character.meta.currentStageName, year: character.meta.careerYear, text: `達成成就：${tier.title}（世界大賽${tier.threshold}冠）　[知名度+${tier.threshold}]` });
    }
  }

  // 大滿貫：先鋒賽/MSI/EWC/世界大賽都拿過冠軍(不用同一年，生涯湊齊就算)
  if (!unlocked["grand_slam_champion"]) {
    const allChampion = (cc.pioneerTitles ?? 0) >= 1 && (cc.msiTitles ?? 0) >= 1 && (cc.ewcTitles ?? 0) >= 1 && (cc.worldsTitles ?? 0) >= 1;
    if (allChampion) {
      unlocked["grand_slam_champion"] = true;
      character.fame = clamp(character.fame + 20, 0, 100);
      log.push({ stage: character.meta.currentStageName, year: character.meta.careerYear, text: `達成成就：大滿貫（先鋒賽/季中邀請賽/EWC/世界大賽冠軍集滿）　[知名度+20]` });
    }
  }

  // 大滿亞：同樣四個賽事，改成都拿過亞軍
  if (!unlocked["grand_slam_runnerup"]) {
    const allRunnerUp = (cc.pioneerRunnerUps ?? 0) >= 1 && (cc.msiRunnerUps ?? 0) >= 1 && (cc.ewcRunnerUps ?? 0) >= 1 && (cc.worldsRunnerUps ?? 0) >= 1;
    if (allRunnerUp) {
      unlocked["grand_slam_runnerup"] = true;
      character.fame = clamp(character.fame + 10, 0, 100);
      log.push({ stage: character.meta.currentStageName, year: character.meta.careerYear, text: `達成成就：大滿亞（先鋒賽/季中邀請賽/EWC/世界大賽亞軍集滿）　[知名度+10]` });
    }
  }
}
