// ============================================================
// careerStats.js — 從 careerCounters 原始累積數字，算出場均/比率這類衍生數據
// 儀表板跟結算分享卡共用同一份計算邏輯，避免兩邊各寫一套容易兜不起來
// ============================================================

export function computeCareerStats(character) {
  const c = character.careerCounters;
  const appearances = c.wins + c.losses; // 出場次數 = 勝場+敗場，兩者互斥不會重複

  const avg = (total) => (appearances > 0 ? Math.round((total / appearances) * 10) / 10 : 0);
  const kda = c.deaths > 0 ? Math.round(((c.kills + c.assists) / c.deaths) * 100) / 100 : c.kills + c.assists;

  return {
    kda,
    mvps: c.mvps,
    appearances,
    wins: c.wins,
    losses: c.losses,
    kills: c.kills,
    avgKills: avg(c.kills),
    assists: c.assists,
    avgAssists: avg(c.assists),
    deaths: c.deaths,
    avgDeaths: avg(c.deaths),
  };
}
