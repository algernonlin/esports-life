// ============================================================
// achievements.js — 生涯累積型成就（里程碑），跟事件共用效果結算器
// ============================================================
import { applyEffects, summarizeEffects } from "./effects.js";

export const MILESTONES = [
  { id: "kills_100",  track: "kills",  threshold: 100,  title: "百殺新秀", effects: [{ type: "stat_delta", stat: "反應", value: 1 }, { type: "fame_delta", value: 3 }] },
  { id: "kills_500",  track: "kills",  threshold: 500,  title: "五百殺老將", effects: [{ type: "stat_delta", stat: "反應", value: 2 }, { type: "fame_delta", value: 6 }] },
  { id: "kills_1000", track: "kills",  threshold: 1000, title: "生涯千殺", effects: [{ type: "stat_delta", stat: "反應", value: 3 }, { type: "fame_delta", value: 12 }] },
  { id: "assists_1000", track: "assists", threshold: 1000, title: "千助攻大師", effects: [{ type: "stat_delta", stat: "溝通", value: 3 }, { type: "fame_delta", value: 10 }] },
  { id: "wins_100", track: "wins", threshold: 100, title: "百勝先鋒", effects: [{ type: "team_delta", stat: "favor", value: 5 }, { type: "fame_delta", value: 8 }] },
];

export function checkMilestones(character, log) {
  const unlocked = character.flags.__milestones ?? {};
  for (const m of MILESTONES) {
    if (unlocked[m.id]) continue;
    if ((character.careerCounters[m.track] ?? 0) >= m.threshold) {
      unlocked[m.id] = true;
      applyEffects(character, m.effects, log);
      const summary = summarizeEffects(m.effects);
      log.push({ stage: character.meta.currentStageName, year: character.meta.careerYear, text: `達成成就：${m.title}${summary ? `　[${summary}]` : ""}` });
    }
  }
  character.flags.__milestones = unlocked;
}
