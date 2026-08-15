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
        character.dynamic[eff.stat] = clamp((character.dynamic[eff.stat] ?? 50) + delta, 0, 100);
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
      default:
        console.warn("未知的 effect type：", eff.type);
    }
  }
  if (log && effects.length) log.push({ effects, year: character.meta.careerYear, stage: character.meta.currentStageName });
  return character;
}
