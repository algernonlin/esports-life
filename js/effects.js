// ============================================================
// effects.js — 效果結算器：把事件/成就/傷病的 outcome 寫回角色狀態
// 統一入口，事件系統只需要輸出資料，不用直接碰 state
// ============================================================
import { clamp } from "./rng.js";

export function applyEffects(character, effects = [], log = []) {
  for (const eff of effects) {
    switch (eff.type) {
      case "stat_delta": {
        character.stats[eff.stat] = clamp((character.stats[eff.stat] ?? 50) + eff.value, 1, 99);
        break;
      }
      case "stat_percent": {
        if (eff.stat === "all") {
          for (const k of Object.keys(character.stats)) {
            character.stats[k] = clamp(Math.round(character.stats[k] * (1 + eff.value)), 1, 99);
          }
        } else {
          character.stats[eff.stat] = clamp(Math.round(character.stats[eff.stat] * (1 + eff.value)), 1, 99);
        }
        break;
      }
      case "personality_delta": {
        const isUnipolar = eff.stat === "神經刀";
        const min = isUnipolar ? 0 : -100;
        character.personality[eff.stat] = clamp((character.personality[eff.stat] ?? 0) + eff.value, min, 100);
        break;
      }
      case "dynamic_delta": {
        let delta = eff.value;
        // 情緒穩定：只針對「心態」的波動幅度縮小，大好大壞都比較不明顯
        if (eff.stat === "心態" && character.talents?.some((t) => t.id === "emotional_stability")) {
          delta *= 0.8;
        }
        character.dynamic[eff.stat] = clamp(Math.round((character.dynamic[eff.stat] ?? 50) + delta), 0, 100);
        break;
      }
      case "fame_delta": {
        character.fame = clamp(character.fame + eff.value, 0, 100);
        break;
      }
      case "team_delta": {
        character.team[eff.stat] = clamp((character.team[eff.stat] ?? 50) + eff.value, 0, 100);
        break;
      }
      case "flag_set": {
        character.flags[eff.flag] = eff.value ?? true;
        break;
      }
      case "flag_clear": {
        delete character.flags[eff.flag];
        break;
      }
      case "add_injury": {
        character.injuries.push({
          id: eff.id, name: eff.name, severity: eff.severity,
          affectedStats: eff.affectedStats, duration: eff.duration, chronic: false,
        });
        break;
      }
      case "career_counter_delta": {
        character.careerCounters[eff.counter] = (character.careerCounters[eff.counter] ?? 0) + eff.value;
        break;
      }
      case "money_percent": {
        // 罰款/獎金用「合約年薪的百分比」計算，category決定算進哪一類收入
        const amount = Math.round((character.team.contractSalary ?? 0) * eff.value);
        const cat = eff.category === "prize" ? "prizeMoney" : "otherIncome";
        character.careerCounters[cat] = (character.careerCounters[cat] ?? 0) + amount;
        break;
      }
      case "prize_money": {
        // 賽事獎金：固定金額，不因個人薪水高低而變動（真實世界獎金池是固定的，不看你薪水多少）
        character.careerCounters.prizeMoney = (character.careerCounters.prizeMoney ?? 0) + eff.value;
        break;
      }
      default:
        console.warn("未知的 effect type：", eff.type);
    }
  }
  return character;
}

// -------------------------------------------------------------
// 效果摘要：把一組effects轉成人看得懂的文字，例如「反應+3、心態-5、知名度+2」
// 給事件log顯示用，flag/受傷這類非數值效果不列入
// -------------------------------------------------------------
const TEAM_STAT_LABELS = { chemistry: "化學反應", favor: "隊伍好感度", reputation: "媒體評價" };
const COUNTER_LABELS = { money: "獎金" };

export function summarizeEffects(effects = [], character = null) {
  const parts = [];
  const sign = (v) => (v >= 0 ? "+" : "") + v;
  for (const eff of effects) {
    switch (eff.type) {
      case "stat_delta":
      case "personality_delta":
      case "dynamic_delta":
        parts.push(`${eff.stat}${sign(eff.value)}`);
        break;
      case "fame_delta":
        parts.push(`知名度${sign(eff.value)}`);
        break;
      case "team_delta":
        parts.push(`${TEAM_STAT_LABELS[eff.stat] ?? eff.stat}${sign(eff.value)}`);
        break;
      case "career_counter_delta":
        parts.push(`${COUNTER_LABELS[eff.counter] ?? eff.counter}${sign(eff.value)}`);
        break;
      case "money_percent": {
        if (character) {
          const amount = Math.round((character.team.contractSalary ?? 0) * eff.value);
          parts.push(`獎金${sign(amount)}萬`);
        } else {
          parts.push(`獎金${sign(Math.round(eff.value * 100))}%`);
        }
        break;
      }
      default:
        break; // flag_set / flag_clear / add_injury 不是數值變化，不列入摘要
    }
  }
  return parts.join("、");
}
