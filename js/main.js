// ============================================================
// main.js — UI 綁定與遊戲主迴圈
// ============================================================
import {
  POSITIONS, REGIONS, TEAMS, STAT_KEYS, PERSONALITY_TRAITS, POSITION_SPECIALTY,
  createCharacter, SEASON_FLOW,
} from "./state.js";
import { makeSeedRng, randomSeedString, runtimeRng, clamp, pickWeighted } from "./rng.js";
import { rollStats, rollPersonality, rollTalents, rollInitialChampions } from "./roll.js";
import { checkAllConditions } from "./conditions.js";
import { applyEffects, summarizeEffects } from "./effects.js";
import { pickEvent, markEventCooldown, resolveChoiceOutcome } from "./events.js";
import { faceChar, probabilityToTarget, rollTwoDice } from "./dice.js";
import { computeMatchWinProbability, resolveMatchWithResult } from "./match.js";
import { rollMatchMoment } from "./matchFlavor.js";
import {
  advanceStage, simulateRegularStage, checkQualification,
  rollMetaVersion, applyAgeDecay, evaluateRosterStatus,
  evaluateInvitations, grantTrainingPoints, tickChampionDecay, pickTradeDestination,
  evaluateContractRenewal, trainCoreStat, paySalary, evaluateStageHonors, evaluateYearEndHonors,
  computeContractSalary, buildInternationalOpponentPool, applyGameResult, rollFinalsMVP,
  previewContract, computePrizeMoney, snapshotYearRecord,
} from "./season.js";
import { checkMilestones } from "./achievements.js";
import { rollInjuryChance, tickInjuries } from "./injuries.js";
import { CHAMPIONS, getChampion, trainChampion, effectiveProficiency } from "./champions.js";
import { computeCareerStats } from "./careerStats.js";

const el = (id) => document.getElementById(id);

// 事件卡片開關：開啟時連帶把推進按鈕disable，逼玩家先處理完事件才能繼續
function openEventCard() {
  el("event-inline").classList.add("open");
  el("btn-advance").disabled = true;
}
function closeEventCard() {
  el("event-inline").classList.remove("open");
  el("btn-advance").disabled = false;
}
let character = null;
let currentSeed = "";
let pendingRoll = { position: "中路", region: "LPL" };
const log = [];

// ---------------- 存檔機制 ----------------
const SAVE_KEY = "esports_life_save_v1";

function saveGame() {
  if (!character || character.retired) return; // 已退役的生涯不用存，避免覆蓋掉renderSummary()清除的存檔
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), character, log }));
  } catch (e) {
    console.warn("存檔失敗", e);
  }
}

function loadSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

// ---------------- Screen 1: 基本設定 ----------------
function renderSetup() {
  const posWrap = el("position-select");
  posWrap.innerHTML = POSITIONS.map(
    (p) => `<button class="chip ${p === pendingRoll.position ? "active" : ""}" data-pos="${p}">${p}</button>`
  ).join("");
  posWrap.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { pendingRoll.position = b.dataset.pos; renderSetup(); })
  );

  const regWrap = el("region-select");
  regWrap.innerHTML = REGIONS.map(
    (r) => `<button class="chip ${r === pendingRoll.region ? "active" : ""}" data-reg="${r}">${r}</button>`
  ).join("");
  regWrap.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { pendingRoll.region = b.dataset.reg; renderSetup(); })
  );
}

function doRoll(seedStr) {
  currentSeed = seedStr;
  const seedRng = makeSeedRng(seedStr);
  const name = el("player-name").value.trim() || "無名選手";

  character = createCharacter({ name, position: pendingRoll.position, region: pendingRoll.region, teamName: null });
  character.stats = rollStats(seedRng, pendingRoll.position);
  character.personality = rollPersonality(seedRng);
  character.talents = rollTalents(seedRng);
  character.champions = rollInitialChampions(seedRng, pendingRoll.position);

  // 夜貓子：體能基礎值略低
  if (character.talents.some((t) => t.id === "night_owl")) {
    character.dynamic["體能"] = clamp(character.dynamic["體能"] - 5, 0, 100);
  }
  // 世一XX：自封世界第一，壓力基準值偏高
  if (character.talents.some((t) => t.id === "self_proclaimed_goat")) {
    character.dynamic["壓力"] = clamp(character.dynamic["壓力"] + 10, 0, 100);
  }

  renderRollResult();
  showScreen("screen-roll");
}

function renderRollResult() {
  el("seed-display").textContent = currentSeed;
  el("roll-name").textContent = character.meta.name;
  el("roll-pos-region").textContent = `${character.meta.position} · ${character.meta.region}`;

  const statBars = STAT_KEYS.concat(Object.keys(character.stats).filter((k) => !STAT_KEYS.includes(k)))
    .map((k) => statBarHtml(k, character.stats[k]))
    .join("");
  el("stat-bars").innerHTML = statBars;

  el("personality-bars").innerHTML = PERSONALITY_TRAITS.map((t) => {
    const v = character.personality[t.key];
    const pct = t.type === "unipolar" ? v : (v + 100) / 2;
    return `
      <div class="trait-row">
        <span class="trait-end left">${t.left}</span>
        <div class="trait-track"><div class="trait-fill" style="width:${pct}%"></div><div class="trait-marker" style="left:${pct}%"></div></div>
        <span class="trait-end right">${t.right}</span>
      </div>`;
  }).join("");

  el("talent-list").innerHTML = character.talents.length
    ? character.talents.map((t) => `<div class="talent-tag rarity-${t.rarity}"><b>${t.name}</b><span>${t.desc}</span></div>`).join("")
    : `<div class="empty-hint">本次開局沒有先天天賦</div>`;

  const champEntries = Object.entries(character.champions);
  el("initial-champion-list").innerHTML = champEntries.length
    ? champEntries.map(([id, entry]) => {
        const champ = getChampion(id);
        return `<div class="stat-row">
          <span class="stat-label">${champ?.name ?? id}</span>
          <div class="stat-track"><div class="stat-fill" style="width:${entry.proficiency}%"></div></div>
          <span class="stat-value mono">${Math.round(entry.proficiency)}</span>
        </div>`;
      }).join("")
    : `<div class="empty-hint">業餘時期沒有特別練過哪隻英雄</div>`;
}

// 正負值/關鍵字上色：反應+3 的 +3 上金色，心態-5 的 -5 上紅色，冠軍/FMVP等關鍵字也上金色
// 用單一正則一次比對，長字詞(FMVP)排在短字詞(MVP)前面，避免FMVP裡的MVP被重複包一層span
const LOG_GOLD_PATTERN = /(FMVP|冠軍|最佳陣容|年度最佳|MVP)/g;
function highlightLogText(text) {
  let html = text.replace(/([+-]\d+(?:\.\d+)?)/g, (m) =>
    `<span class="${m.startsWith("+") ? "log-positive" : "log-negative"}">${m}</span>`
  );
  html = html.replace(LOG_GOLD_PATTERN, (w) => `<span class="log-positive">${w}</span>`);
  return html;
}

// 生涯紀錄：依年份分組，開頭插入「S{season}・{year}年・{age}歲」分隔線，呼應YaKyoLife的年度分段呈現
function renderEventLog() {
  const groups = [];
  let lastYear = null;
  for (const l of log) {
    if (l.year !== lastYear) {
      groups.push({ year: l.year, entries: [] });
      lastYear = l.year;
    }
    groups[groups.length - 1].entries.push(l);
  }

  el("event-log").innerHTML = groups.map((g) => {
    const season = 16 + (g.year - 2026);
    const age = 16 + (g.year - 2026);
    const rows = g.entries.map((l) =>
      `<div class="log-row"><span class="log-tag">${l.stage}</span>${highlightLogText(l.text)}</div>`
    ).join("");
    return `<div class="log-year-divider"><span class="mono">S${season}</span>${g.year}年・${age}歲</div>${rows}`;
  }).join("");
}

function renderHonors() {
  const c = character.careerCounters;
  const rows = [
    ["賽區冠軍", c.domesticTitles],
    ["賽區亞軍", c.domesticRunnerUps],
    ["國際賽冠軍", c.internationalTitles],
    ["國際賽亞軍", c.internationalRunnerUps],
    ["FMVP", c.fmvps],
    ["賽段常規賽MVP", c.regularSeasonMVPs],
    ["賽段最佳陣容", c.bestXI],
    ["年度常規賽MVP", c.yearEndMVP],
    ["年度賽區最佳", c.yearEndBestPosition],
  ];
  const earned = rows.filter(([, v]) => v > 0);
  el("honors-list").innerHTML = earned.length
    ? earned.map(([label, v]) => `<div class="team-stat"><span>${label}</span><span class="mono">${v}</span></div>`).join("")
    : `<div class="empty-hint-inline">尚未拿下任何榮譽</div>`;
}

function statBarHtml(key, value) {
  const displayValue = Math.round(value * 10) / 10; // 顯示層兜底四捨五入，避免浮點數誤差顯示一長串小數
  return `
    <div class="stat-row">
      <span class="stat-label">${key}</span>
      <div class="stat-track"><div class="stat-fill" style="width:${value}%"></div></div>
      <span class="stat-value mono">${displayValue}</span>
    </div>`;
}

// ---------------- Screen 2: 隊伍邀請 ----------------
function renderInvitations() {
  const rows = evaluateInvitations(character, runtimeRng);
  const invitedRows = rows.filter((r) => r.invited).map((r) => ({ ...r, contract: previewContract(character, r.team, runtimeRng) })); // 只展示真的發出邀請的隊伍，並先預覽合約內容

  el("invitation-list").innerHTML = invitedRows.map((r) => `
    <div class="invite-row invited">
      <div class="invite-team">
        <span class="invite-name">${r.team.name}</span>
        <span class="invite-strength mono">該路戰力 ${r.team.positionStrength[character.meta.position]}・${r.contract.years}年約・總價${r.contract.totalValue.toLocaleString()}萬</span>
      </div>
      <div class="invite-status">${r.guaranteed ? "邀請你加入" : "一軍正式邀請"}</div>
      <button class="btn-small" data-team="${r.team.name}">加入</button>
    </div>
  `).join("");

  el("invitation-list").querySelectorAll("button[data-team]").forEach((b) =>
    b.addEventListener("click", () => {
      const row = invitedRows.find((r) => r.team.name === b.dataset.team);
      const t = row.team;
      character.team = { ...character.team, name: t.name, baseStrength: t.baseStrength, positionStrength: t.positionStrength, reputation: t.reputation };
      character.team.contractYears = row.contract.years;
      character.team.contractSalary = row.contract.annualSalary;
      character.meta.teamName = t.name;
      startCareer();
    })
  );

  el("no-invite-hint").style.display = "none";
}

// ---------------- Screen 3: 生涯主迴圈 ----------------
function startCareer() {
  character.meta.currentStageName = SEASON_FLOW[0].stage;
  rollMetaVersion(character, runtimeRng);
  pushLog(`加入 ${character.team.name}，正式展開職業生涯。`);
  showScreen("screen-dashboard");
  renderDashboard();
}

function pushLog(text) {
  log.unshift({ year: character.meta.careerYear, stage: character.meta.currentStageName, text });
  if (log.length > 40) log.pop();
}

function renderDashboard() {
  if (character.retired) return renderSummary();

  el("dash-name").textContent = character.meta.name;
  el("dash-info").textContent = `${character.meta.position} · ${character.team.name} · ${character.meta.age}歲 · ${character.meta.careerYear}年`;
  const season = 16 + (character.meta.careerYear - 2026);
  el("dash-stage").textContent = `S${season} ${character.meta.currentStageName}`;
  el("dash-meta").innerHTML = `版本：<span class="log-positive">${character.seasonRecord.currentMeta}</span>`;
  el("dash-roster").textContent = { starter: "先發", rotation: "輪換", bench: "替補" }[character.rosterStatus];
  el("dash-roster").className = "badge badge-" + character.rosterStatus;

  el("dash-stats").innerHTML = STAT_KEYS.map((k) => statBarHtml(k, character.stats[k])).join("");
  el("dash-dynamic").innerHTML = `
    ${statBarHtml("心態", character.dynamic["心態"])}
    ${statBarHtml("體能", character.dynamic["體能"])}
    ${statBarHtml("壓力", character.dynamic["壓力"])}
  `;
  el("dash-team").innerHTML = `
    <div class="team-stat"><span>隊伍化學反應</span><span class="mono">${Math.round(character.team.chemistry)}</span></div>
    <div class="team-stat"><span>隊伍好感度</span><span class="mono">${Math.round(character.team.favor)}</span></div>
    <div class="team-stat"><span>媒體評價</span><span class="mono">${Math.round(character.team.reputation)}</span></div>
  `;
  el("dash-fame").textContent = Math.round(character.fame);
  const cs = computeCareerStats(character);
  const cc = character.careerCounters;
  const totalIncome = (cc.salaryIncome ?? 0) + (cc.prizeMoney ?? 0) + (cc.otherIncome ?? 0);
  el("dash-total-income").textContent = totalIncome.toLocaleString();
  el("dash-contract-expiry").textContent = `${character.meta.careerYear + character.team.contractYears}`;

  el("dash-record").textContent = `${cs.wins}勝${cs.losses}敗`;
  el("dash-kda-detail").textContent = `${cs.kills}/${cs.deaths}/${cs.assists}（KDA ${cs.kda}，場均 ${cs.avgKills}/${cs.avgDeaths}/${cs.avgAssists}）`;
  el("dash-mvp").textContent = `${cs.mvps} 次`;
  el("dash-contract-info").textContent = `${character.team.contractYears}年約・年薪${character.team.contractSalary.toLocaleString()}萬`;
  el("dash-salary-income").textContent = `${(cc.salaryIncome ?? 0).toLocaleString()}萬`;
  el("dash-prize-income").textContent = `${(cc.prizeMoney ?? 0).toLocaleString()}萬`;
  el("dash-other-income").textContent = `${(cc.otherIncome ?? 0).toLocaleString()}萬`;

  el("yearly-history-list").innerHTML = character.yearlyHistory.length
    ? character.yearlyHistory.slice().reverse().map((y) => {
        const stageResults = [y.stage1, y.stage2, y.stage3]
          .map((s, i) => s.playoffResult ? `第${i + 1}賽段${s.playoffResult}` : null)
          .filter(Boolean).join("、");
        const intlResults = y.international.map((e) => `${e.name}${e.result}`).join("、");
        const summary = [stageResults, intlResults].filter(Boolean).join("、") || "尚無季後賽戰績";
        return `<div class="yearly-history-row"><span class="yh-year">${y.year}年 ${y.age}歲</span>${y.team}(${y.region})：${summary}</div>`;
      }).join("")
    : `<div class="empty-hint-inline">還沒有完整打過一年</div>`;

  renderHonors();

  el("dash-talents").innerHTML = character.talents.length
    ? character.talents.map((t) => `<div class="talent-tag rarity-${t.rarity}"><b>${t.name}</b><span>${t.desc}</span></div>`).join("")
    : `<div class="empty-hint">無先天天賦</div>`;

  el("dash-injuries").innerHTML = character.injuries.length
    ? character.injuries.map((i) => `<span class="injury-tag">${i.name}（${i.duration}階段）</span>`).join("")
    : `<span class="empty-hint-inline">目前健康</span>`;

  renderEventLog();

  renderChampionPanel();
}

function renderChampionPanel() {
  el("training-points").textContent = character.trainingPoints;

  const myPos = character.meta.position;
  const metaIds = character.seasonRecord.metaChampions ?? [];

  // 訓練下拉選單：依熟練度高到低排序，直接顯示數值
  const relevant = CHAMPIONS
    .filter((c) => c.primary === myPos || c.secondary.includes(myPos))
    .map((c) => ({ champ: c, proficiency: character.champions[c.id]?.proficiency ?? 0 }))
    .sort((a, b) => b.proficiency - a.proficiency);
  el("champion-select").innerHTML = relevant
    .map(({ champ, proficiency }) => `<option value="${champ.id}">${champ.name}（${Math.round(proficiency)}）</option>`)
    .join("");

  // 右側側欄：全部五個位置的版本英雄一覽，不只你自己的位置
  el("meta-champion-list").innerHTML = POSITIONS.map((pos) => {
    const champs = metaIds.map((id) => getChampion(id)).filter((c) => c && c.primary === pos);
    if (!champs.length) return "";
    return `
      <div class="meta-champ-group">
        <div class="meta-champ-title">${pos}</div>
        <div class="meta-champ-chips">${champs.map((c) => `<span class="meta-champ-chip ${character.champions[c.id] ? "owned" : ""}">${c.name}</span>`).join("")}</div>
      </div>`;
  }).join("");

  // 左側欄：隊伍平均戰力（併入隊伍區塊）
  const posStrengths = Object.values(character.team.positionStrength ?? {});
  const avgStrength = posStrengths.length ? Math.round(posStrengths.reduce((a, b) => a + b, 0) / posStrengths.length) : character.team.baseStrength;
  el("team-avg-strength").textContent = avgStrength;

  // 右側欄：個人熟練度前五英雄（依有效熟練度排序，只取前5）
  const owned = Object.keys(character.champions)
    .map((id) => ({ id, eff: effectiveProficiency(character, id, myPos) }))
    .sort((a, b) => b.eff - a.eff)
    .slice(0, 5);
  el("champion-list").innerHTML = owned.length
    ? owned.map(({ id, eff }) => {
        const champ = getChampion(id);
        if (!champ) return "";
        const isMeta = metaIds.includes(id);
        return `
          <div class="champ-row">
            <span class="champ-name">${champ.name}${isMeta ? ' <span class="meta-tag">版本英雄</span>' : ""}</span>
            <div class="stat-track"><div class="stat-fill" style="width:${Math.round(eff)}%"></div></div>
            <span class="stat-value mono">${Math.round(eff)}</span>
          </div>`;
      }).join("")
    : `<div class="empty-hint">尚未練習任何英雄，選一隻開始吧。</div>`;
}

function renderSummary() {
  showScreen("screen-summary");
  const c = character;
  const cs = computeCareerStats(c);
  el("summary-name").textContent = c.meta.name;
  el("summary-seed").textContent = currentSeed ? `SEED ${currentSeed}` : "";
  el("summary-title").textContent = generateTitle(c);
  el("summary-subline").textContent = retirementReasonText(c);

  el("stat-years").textContent = `${c.meta.careerYear - 2026} 年`;
  el("stat-appearances").textContent = `${cs.appearances} 場`;
  el("stat-wins").textContent = `${cs.wins} 勝`;
  el("stat-kda").textContent = cs.kda;
  el("stat-mvps").textContent = `${cs.mvps} 次`;
  el("stat-worlds").textContent = `${c.careerCounters.worldsAppearances} 次`;
  el("stat-kills").textContent = `${cs.kills} / ${cs.avgKills}`;
  el("stat-assists").textContent = `${cs.assists} / ${cs.avgAssists}`;
  el("stat-deaths").textContent = `${cs.deaths} / ${cs.avgDeaths}`;
  el("stat-fame").textContent = Math.round(c.fame);
  el("stat-salary").textContent = ((c.careerCounters.salaryIncome ?? 0) + (c.careerCounters.prizeMoney ?? 0) + (c.careerCounters.otherIncome ?? 0)).toLocaleString();

  const honorLabels = [
    ["🏆賽區冠軍", c.careerCounters.domesticTitles],
    ["🥈賽區亞軍", c.careerCounters.domesticRunnerUps],
    ["🌍國際賽冠軍", c.careerCounters.internationalTitles],
    ["國際賽亞軍", c.careerCounters.internationalRunnerUps],
    ["FMVP", c.careerCounters.fmvps],
    ["年度MVP", c.careerCounters.yearEndMVP],
    ["年度最佳", c.careerCounters.yearEndBestPosition],
  ].filter(([, v]) => v > 0);
  el("share-honors").innerHTML = honorLabels.length
    ? honorLabels.map(([label, v]) => `<span class="honor-chip">${label} ×${v}</span>`).join("")
    : "";

  clearSave(); // 生涯結束，這份存檔沒有繼續的意義
}

function downloadShareCard() {
  if (typeof html2canvas === "undefined") {
    alert("圖片匯出功能載入失敗，請檢查網路連線。");
    return;
  }
  html2canvas(el("share-card"), { backgroundColor: "#0a0a0b", scale: 2 }).then((canvas) => {
    const link = document.createElement("a");
    link.download = `${character.meta.name}_生涯結算.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

function generateTitle(c) {
  // 依嚴重程度/特殊性排序判斷，越前面優先權越高
  if (c.flags["生涯終止_涉賭"]) return "涉賭爭議球員";
  if (c.flags["家暴爭議"]) return "爭議纏身的問題選手";
  if (c.flags["外遇中"]) return "緋聞不斷的花花公子";
  if (c.flags["毒舌人設"]) return "嘴強王者";
  if (c.careerCounters.worldsAppearances >= 2) return "世界賽常客";
  if (c.careerCounters.kills >= 1000) return "生涯千殺傳奇";
  if (c.fame >= 85) return "話題王者";
  if (c.chronicInjuries.length >= 2) return "傷病纏身的老將";
  if (c.team.chemistry <= 25) return "更衣室的不安定因子";
  if (c.careerCounters.wins >= 150) return "傳奇老兵";
  if (c.careerCounters.wins >= 100) return "百勝老兵";
  if (c.flags["轉型意識流"]) return "以智取勝的智將";
  if (c.flags["主動退役"]) return "全身而退的職業選手";
  if (c.flags["戰績淘汰"]) return "被時代淘汰的選手";
  if (c.meta.careerYear - 2026 <= 2 && c.retired) return "曇花一現的新秀";
  return "職業選手";
}

function retirementReasonText(c) {
  if (c.flags["主動退役"]) return "生涯末段選擇急流勇退，主動宣布退役。";
  if (c.flags["自然衰退退役"]) return "隨著年齡與狀態自然衰退，結束了職業生涯。";
  if (c.flags["戰績淘汰"]) return "因長期戰績低迷被隊伍放棄，黯然離開賽場。";
  return "職業生涯畫下句點。";
}

// ---------------- 賽段推進主邏輯 ----------------
function advance() {
  if (!character || character.retired) return;
  const stageType = SEASON_FLOW[character.meta.currentStageIndex].type;

  grantTrainingPoints(character, stageType);
  tickChampionDecay(character, runtimeRng);
  paySalary(character); // 每個賽段發放一次薪水，不管當下是不是比賽賽段

  // 壓力累積／消退：接近大賽自動累積（抗壓值可以緩衝累積量），休賽期自然消退
  if (stageType === "playoff" || stageType === "international") {
    const gain = clamp(15 - (character.stats["抗壓"] - 50) / 5, 5, 25);
    const talentMod = character.talents?.some((t) => t.id === "self_proclaimed_goat") ? 1.3 : 1;
    character.dynamic["壓力"] = clamp(Math.round((character.dynamic["壓力"] ?? 20) + gain * talentMod), 0, 100);
  } else if (stageType === "offseason_short") {
    character.dynamic["壓力"] = clamp((character.dynamic["壓力"] ?? 20) - 8, 0, 100);
  } else if (stageType === "offseason_long") {
    character.dynamic["壓力"] = clamp((character.dynamic["壓力"] ?? 20) - 20, 0, 100);
  }

  if (character.flags["待轉位置"]) {
    applyPositionChange();
  }
  if (character.flags["待轉隊"]) {
    applyTrade();
  }

  if (stageType === "regular") {
    rollMetaVersion(character, runtimeRng);
    const stageKey = currentStageRecordKey();
    const { wins, losses, longestWinStreak, longestLossStreak, totalGames, stageMvpCount } = simulateRegularStage(character, runtimeRng);
    character.seasonRecord[stageKey].wins += wins;
    character.seasonRecord[stageKey].losses += losses;
    let streakNote = "";
    if (longestWinStreak >= 3) streakNote = `，其中一度打出${longestWinStreak}連勝，隊伍士氣明顯提升`;
    else if (longestLossStreak >= 3) streakNote = `，其中一度吞下${longestLossStreak}連敗，氣氛一度低迷`;
    const rosterNote = character.rosterStatus !== "starter" ? `（本賽段排定${totalGames}場，實際出場${wins + losses}場）` : "";
    pushLog(`例行賽戰績 ${wins}勝${losses}敗${streakNote}。${rosterNote}`);

    const honors = evaluateStageHonors(character, stageMvpCount, wins + losses, wins, losses);
    if (honors.regularSeasonMVP) pushLog(`🏆 榮獲本賽段常規賽MVP！`);
    else if (honors.bestXI) pushLog(`⭐ 入選本賽段最佳陣容。`);

    maybeTriggerEvent();
    checkMilestones(character, log);
    const injury = rollInjuryChance(character, runtimeRng);
    if (injury) pushLog(`不幸受傷：${injury.name}。`);
    finishAdvance();
  } else if (stageType === "playoff" || stageType === "international") {
    const isInternational = stageType === "international";
    const stageKey = currentStageRecordKey();
    runInteractivePlayoff(isInternational, (result) => {
      if (isInternational) {
        character.seasonRecord.qualifiedEvents.push({ name: character.meta.currentStageName, result });
        character.careerCounters.worldsAppearances += character.meta.currentStageName === "S16世界大賽" ? 1 : 0;
        character.fame = clamp(character.fame + 10, 0, 100);
        pushLog(`${character.meta.currentStageName} 結果：${result}，知名度提升。`);
        if (character.talents.some((t) => t.id === "semifinal_enough")) {
          character.dynamic["心態"] = clamp(character.dynamic["心態"] - 10, 0, 100);
          pushLog(`打完國際賽後有點鬆懈，狀態出現下滑。`);
        }
      } else {
        character.seasonRecord[stageKey].playoffResult = result;
        if (result === "冠軍" || result === "亞軍") character.team.favor = clamp(character.team.favor + 8, 0, 100);
        pushLog(`季後賽結果：${result}。`);
      }
      if (result === "冠軍") {
        character.flags["剛奪冠"] = true;
        maybeTriggerEvent();
        delete character.flags["剛奪冠"];
      }
      finishAdvance();
    });
    return; // 互動流程會非同步跑完才呼叫finishAdvance，這裡先中斷
  } else if (stageType === "offseason_short") {
    maybeTriggerEvent();
    tickInjuries(character, runtimeRng);
    finishAdvance();
  } else if (stageType === "offseason_long") {
    tickInjuries(character, runtimeRng);
    applyAgeDecay(character, runtimeRng);
    snapshotYearRecord(character); // 存這年的逐年戰績快照，要在seasonRecord跨年重置前呼叫
    const yearHonors = evaluateYearEndHonors(character);
    if (yearHonors.yearEndMVP) pushLog(`🏆 榮獲年度常規賽MVP！`);
    else if (yearHonors.yearEndBestPosition) pushLog(`⭐ 入選年度賽區最佳${character.meta.position}。`);
    maybeTriggerEvent();
    if (!checkRetirement()) {
      character.team.contractYears -= 1;
      const modalOpen = () => el("event-inline").classList.contains("open");
      if (character.team.contractYears <= 0 && !modalOpen()) {
        handleContractRenewal();
      } else if (!modalOpen()) {
        maybeOfferRetirement();
      }
    }
    finishAdvance();
  } else {
    finishAdvance();
  }
}

// 季後賽/國際賽互動流程：四強賽只有決勝局(2:2)骰骰子，冠軍賽每一場都骰
function runInteractivePlayoff(isInternational, onComplete) {
  const opponentPool = isInternational
    ? buildInternationalOpponentPool(character)
    : (TEAMS[character.meta.region] ?? []).filter((t) => t.name !== character.team.name);

  function playSeries(isFinal, seriesDone) {
    let wins = 0, losses = 0;

    // 對手整個系列賽(BO5)只抽一次，不是每場重抽——原本每場重新抽對手是bug，
    // 導致一輪四強賽打了好幾支不同隊伍，這裡改成賽前先確定對手，全系列打同一支
    const opponent = opponentPool.length
      ? pickWeighted(runtimeRng, opponentPool.map((t) => ({ ...t, weight: t.baseStrength })))
      : null;
    const opponentTeam = opponent ?? { baseStrength: character.team.baseStrength, positionStrength: {} };

    function playNextGame() {
      const isDecidingGame = wins === 2 && losses === 2;
      const showDice = isFinal || isDecidingGame;
      const seriesGameIndex = wins + losses;

      const matchContext = { isMajorEvent: true, isInternational, isDecidingGame, seriesGameIndex };
      const { winProb, fullContext } = computeMatchWinProbability(character, opponentTeam, matchContext, runtimeRng);

      const afterGame = (result) => {
        applyGameResult(character, result);
        result.win ? wins++ : losses++;
        const roundLabel = isFinal ? "冠軍賽" : "四強賽";
        pushLog(`${roundLabel} 第${seriesGameIndex + 1}場 vs ${opponent?.name ?? "未知隊伍"}：${result.win ? "勝" : "敗"}（${result.kills}/${result.deaths}/${result.assists}）`);
        if (wins >= 3 || losses >= 3) seriesDone(wins >= 3);
        else playNextGame();
      };

      if (showDice) {
        const roll = rollTwoDice(runtimeRng);
        const { target, prob: actualProb } = probabilityToTarget(winProb);
        const passed = roll.sum >= target;
        const result = resolveMatchWithResult(character, fullContext, passed, runtimeRng, winProb);
        const moment = rollMatchMoment(runtimeRng);

        el("event-title").textContent = `${isFinal ? "冠軍賽" : "四強賽"} 第${seriesGameIndex + 1}場 vs ${opponent?.name ?? "未知隊伍"}`;
        el("event-text").textContent = moment;
        el("event-choices").innerHTML = "";
        el("event-choices").classList.add("hidden");
        el("dice-area").innerHTML = "";
        el("dice-area").classList.remove("show");
        openEventCard();

        runDiceAnimation(
          { ...roll, target, actualProb, passed, extraText: `這場數據：${result.kills} / ${result.deaths} / ${result.assists}` },
          () => {
            closeEventCard();
            afterGame(result);
          }
        );
      } else {
        const win = runtimeRng() < winProb;
        const result = resolveMatchWithResult(character, fullContext, win, runtimeRng, winProb);
        afterGame(result);
      }
    }
    playNextGame();
  }

  playSeries(false, (wonSemifinal) => {
    if (!wonSemifinal) { onComplete("止步四強"); return; }
    playSeries(true, (wonFinal) => {
      if (wonFinal) {
        if (isInternational) character.careerCounters.internationalTitles++;
        else character.careerCounters.domesticTitles++;
        const gotFmvp = rollFinalsMVP(character, runtimeRng);
        const prize = computePrizeMoney(character, isInternational, character.meta.currentStageName, "冠軍");
        character.careerCounters.prizeMoney += prize;
        const fmvpBonus = isInternational && character.meta.currentStageName === "電競世界盃EWC" && gotFmvp ? 30 : 0;
        character.careerCounters.prizeMoney += fmvpBonus;
        pushLog(`🏆 拿下冠軍！${gotFmvp ? "並獲選FMVP！" : ""}獲得獎金 ${(prize + fmvpBonus).toLocaleString()}萬。`);
        onComplete("冠軍");
      } else {
        if (isInternational) character.careerCounters.internationalRunnerUps++;
        else character.careerCounters.domesticRunnerUps++;
        const prize = computePrizeMoney(character, isInternational, character.meta.currentStageName, "亞軍");
        character.careerCounters.prizeMoney += prize;
        pushLog(`惜敗，獲得亞軍，獎金 ${prize.toLocaleString()}萬。`);
        onComplete("亞軍");
      }
    });
  });
}

function finishAdvance() {
  delete character.flags["本場carry但輸"];
  character.rosterStatus = evaluateRosterStatus(character);

  if (!character.retired) {
    advanceStage(character);
    renderDashboard();
  } else {
    renderSummary();
  }
  saveGame();
}

function applyTrade() {
  delete character.flags["待轉隊"];
  const dest = pickTradeDestination(character, runtimeRng);
  if (!dest) {
    pushLog(`轉隊邀約最終沒有下文，繼續留在 ${character.team.name}。`);
    return;
  }

  const oldTeam = character.team.name;
  const oldRegion = character.meta.region;
  const messyExit = character.team.favor < 20; // 對應「魚死網破」曝光劇本
  const contract = previewContract(character, dest, runtimeRng);

  character.team = {
    ...character.team,
    name: dest.name,
    baseStrength: dest.baseStrength,
    positionStrength: dest.positionStrength,
    reputation: dest.reputation,
    chemistry: 50,   // 新隊伍化學反應歸零重新累積
    favor: 50,
    contractYears: contract.years,
  };
  character.team.contractSalary = contract.annualSalary;
  character.meta.teamName = dest.name;
  character.meta.region = dest.region; // 跨賽區轉會：賽區也要跟著更新

  const regionNote = dest.region !== oldRegion ? `，並跨賽區轉戰 ${dest.region}` : "";
  const contractNote = `簽下${contract.years}年約，總價${contract.totalValue.toLocaleString()}萬。`;
  if (messyExit) {
    character.fame = clamp(character.fame + 10, 0, 100); // 話題性上升
    character.team.reputation = clamp(character.team.reputation - 10, 0, 100);
    pushLog(`從 ${oldTeam} 火爆離隊${regionNote}，私訊「魚死網破，今晚就走」被截圖貼上「最強聯盟」，話題性暴衝但新東家對你多留了個心眼。${contractNote}`);
  } else {
    pushLog(`完成轉隊，從 ${oldTeam} 加入 ${dest.name}${regionNote}，${contractNote}`);
  }
}

// ---------------- 合約續約 ----------------
function handleContractRenewal() {
  const willRenew = evaluateContractRenewal(character);
  showContractPrompt(willRenew);
}

function showContractPrompt(teamWantsRenew) {
  el("event-title").textContent = "合約到期";
  el("dice-area").innerHTML = "";
  el("dice-area").classList.remove("show");
  const renewContract = previewContract(character, character.team, runtimeRng);
  el("event-choices").classList.remove("hidden");

  if (teamWantsRenew) {
    el("event-text").textContent = `${character.team.name} 對你這幾年的表現滿意，開出${renewContract.years}年的續約合約，總價${renewContract.totalValue.toLocaleString()}萬。`;
    el("event-choices").innerHTML = `
      <button class="btn-choice" data-act="renew">接受續約，留在 ${character.team.name}</button>
      <button class="btn-choice" data-act="explore">婉拒，出去看看自由市場</button>`;
  } else {
    el("event-text").textContent = `${character.team.name} 決定不與你續約，你必須尋找下一個東家。`;
    el("event-choices").innerHTML = `<button class="btn-choice" data-act="explore">前往自由市場</button>`;
  }

  openEventCard();
  el("event-choices").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      closeEventCard();
      if (b.dataset.act === "renew") {
        character.team.contractYears = renewContract.years;
        character.team.contractSalary = renewContract.annualSalary;
        pushLog(`與 ${character.team.name} 完成續約，簽下${renewContract.years}年新合約，年薪 ${renewContract.annualSalary.toLocaleString()}萬。`);
        renderDashboard();
        saveGame();
      } else {
        showFreeAgencyPrompt();
      }
    }, { once: true })
  );
}

function showFreeAgencyPrompt() {
  const rows = evaluateInvitations(character, runtimeRng, true).filter((r) => r.invited && r.team.name !== character.team.name);
  if (rows.length === 0) {
    // 理論上 evaluateInvitations 保底3隊，這裡防呆一下避免篩掉自己隊伍後剛好變0隊
    const fallback = evaluateInvitations(character, runtimeRng, true).filter((r) => r.team.name !== character.team.name)[0];
    rows.push(fallback);
  }
  const offers = rows.map((r) => ({ ...r, contract: previewContract(character, r.team, runtimeRng) }));

  el("event-title").textContent = "自由市場";
  el("event-text").textContent = "以下隊伍向你招手（不限賽區），選一支加入：";
  el("dice-area").innerHTML = "";
  el("dice-area").classList.remove("show");
  el("event-choices").classList.remove("hidden");
  el("event-choices").innerHTML = offers.map((r) =>
    `<button class="btn-choice" data-team="${r.team.name}">${r.team.name}（${r.team.region}・該路戰力 ${r.team.positionStrength[character.meta.position]}・${r.contract.years}年約・總價${r.contract.totalValue.toLocaleString()}萬）${r.guaranteed ? "・保底邀請" : ""}</button>`
  ).join("");
  openEventCard();

  el("event-choices").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const row = offers.find((r) => r.team.name === b.dataset.team);
      const t = row.team;
      const oldTeam = character.team.name;
      const oldRegion = character.meta.region;
      character.team = {
        ...character.team, name: t.name, baseStrength: t.baseStrength, positionStrength: t.positionStrength,
        reputation: t.reputation, chemistry: 50, favor: 50, contractYears: row.contract.years,
      };
      character.team.contractSalary = row.contract.annualSalary;
      character.meta.teamName = t.name;
      character.meta.region = t.region;
      const regionNote = t.region !== oldRegion ? `，跨賽區轉戰 ${t.region}` : "";
      pushLog(`合約到期後在自由市場，從 ${oldTeam} 轉會加入 ${t.name}${regionNote}，簽下${row.contract.years}年約，總價${row.contract.totalValue.toLocaleString()}萬。`);
      closeEventCard();
      renderDashboard();
      saveGame();
    }, { once: true })
  );
}

function applyPositionChange() {
  delete character.flags["待轉位置"];
  const oldPos = character.meta.position;
  const oldSpecialtyKey = POSITION_SPECIALTY[oldPos];
  const oldSpecialtyVal = character.stats[oldSpecialtyKey] ?? 50;

  const candidates = Object.keys(character.team.positionStrength).filter((p) => p !== oldPos);
  const targetPos = candidates.reduce((weakest, p) =>
    character.team.positionStrength[p] < character.team.positionStrength[weakest] ? p : weakest, candidates[0]);

  const newSpecialtyKey = POSITION_SPECIALTY[targetPos];
  delete character.stats[oldSpecialtyKey];
  character.stats[newSpecialtyKey] = clamp(Math.round(oldSpecialtyVal * 0.7), 1, 99);
  character.meta.position = targetPos;
  pushLog(`轉位置：從「${oldPos}」轉為「${targetPos}」，專精能力打七折延續。`);
}

function currentStageRecordKey() {
  const name = character.meta.currentStageName;
  if (name.startsWith("第一")) return "stage1";
  if (name.startsWith("第二")) return "stage2";
  return "stage3";
}

function checkRetirement() {
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  if (character.meta.age >= 34) {
    character.retired = true;
    character.flags["自然衰退退役"] = true;
    pushLog(`${character.meta.name} 因年齡與狀態自然衰退，宣布退役。`);
    return true;
  }
  if (character.meta.age >= 28 && statAvg < 35) {
    character.retired = true;
    character.flags["戰績淘汰"] = true;
    pushLog(`${character.meta.name} 因長期戰績低迷被隊伍放棄，黯然退役。`);
    return true;
  }
  return false;
}

// 主動退役：年齡達門檻後，有機率跳出「要不要退休」的抉擇，玩家可以自己決定
// 如果這個賽段已經有其他事件彈窗開著，就跳過，避免兩個彈窗互相覆蓋
function maybeOfferRetirement() {
  if (character.retired || character.meta.age < 27) return false;
  if (el("event-inline").classList.contains("open")) return false;
  const chance = clamp(0.15 + (character.meta.age - 27) * 0.08, 0.1, 0.9);
  if (runtimeRng() >= chance) return false;
  showRetirementPrompt();
  return true;
}

function showRetirementPrompt() {
  el("event-title").textContent = "生涯十字路口";
  el("event-text").textContent = `${character.meta.age}歲，你開始認真思考是不是該為職業生涯畫下句點。`;
  el("dice-area").innerHTML = "";
  el("dice-area").classList.remove("show");
  el("event-choices").classList.remove("hidden");
  el("event-choices").innerHTML = `
    <button class="btn-choice" data-act="retire">宣布退役，結束職業生涯</button>
    <button class="btn-choice" data-act="continue">繼續留在賽場上奮戰</button>
  `;
  openEventCard();

  el("event-choices").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      closeEventCard();
      if (b.dataset.act === "retire") {
        character.retired = true;
        character.flags["主動退役"] = true;
        pushLog(`${character.meta.name} 主動宣布退役，結束職業生涯。`);
        renderSummary();
      } else {
        pushLog(`${character.meta.age}歲，決定繼續留在賽場上奮戰。`);
        renderDashboard();
      }
      saveGame();
    }, { once: true })
  );
}

function maybeTriggerEvent() {
  const event = pickEvent(character, runtimeRng);
  if (!event) return;
  markEventCooldown(character, event);
  showEventModal(event);
}

// ---------------- 事件彈窗 ----------------
function showEventModal(event) {
  el("event-title").textContent = event.title;
  el("event-text").textContent = event.text;
  el("dice-area").innerHTML = "";
  el("dice-area").classList.remove("show");
  el("event-choices").classList.remove("hidden");
  el("event-choices").innerHTML = event.choices.map((c, i) => `<button class="btn-choice" data-idx="${i}">${c.label}</button>`).join("");
  openEventCard();

  el("event-choices").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const choice = event.choices[Number(b.dataset.idx)];
      const { outcome, dice } = resolveChoiceOutcome(choice, runtimeRng);

      if (!dice) {
        finishEvent(event, choice, outcome);
        return;
      }
      el("event-choices").classList.add("hidden");
      runDiceAnimation(dice, () => finishEvent(event, choice, outcome, dice));
    }, { once: true })
  );
}

function runDiceAnimation(dice, onDone) {
  const area = el("dice-area");
  area.classList.add("show");
  area.innerHTML = `
    <div class="dice-target mono">需要擲出 <span class="accent-text">${dice.target}</span> 點以上（機率約 ${Math.round(dice.actualProb * 100)}%）</div>
    <div class="dice-pair">
      <span class="die" id="die-1">${faceChar(1)}</span>
      <span class="die" id="die-2">${faceChar(1)}</span>
    </div>
    <div class="dice-result mono" id="dice-result"></div>
    <button class="btn-primary btn-block" id="btn-roll-dice" style="margin-top:14px;">擲骰 ▸</button>
  `;

  el("btn-roll-dice").addEventListener("click", () => {
    el("btn-roll-dice").remove();
    const d1El = el("die-1");
    const d2El = el("die-2");
    d1El.classList.add("rolling");
    d2El.classList.add("rolling");
    const spin = setInterval(() => {
      d1El.textContent = faceChar(1 + Math.floor(Math.random() * 6));
      d2El.textContent = faceChar(1 + Math.floor(Math.random() * 6));
    }, 70);

    setTimeout(() => {
      clearInterval(spin);
      d1El.textContent = faceChar(dice.d1);
      d2El.textContent = faceChar(dice.d2);
      d1El.classList.remove("rolling");
      d2El.classList.remove("rolling");
      d1El.classList.add(dice.passed ? "settle-pass" : "settle-fail");
      d2El.classList.add(dice.passed ? "settle-pass" : "settle-fail");

      const resEl = el("dice-result");
      resEl.textContent = `${dice.d1} + ${dice.d2} = ${dice.sum}　${dice.passed ? "▸ 判定成功" : "▸ 判定失敗"}`;
      resEl.className = "dice-result mono " + (dice.passed ? "pass" : "fail");

      if (dice.extraText) {
        const extraEl = document.createElement("div");
        extraEl.className = "dice-extra mono";
        extraEl.textContent = dice.extraText;
        area.appendChild(extraEl);
      }

      const cont = document.createElement("button");
      cont.className = "btn-primary btn-block";
      cont.textContent = "繼續 ▸";
      cont.style.marginTop = "16px";
      cont.addEventListener("click", onDone, { once: true });
      area.appendChild(cont);
    }, 900);
  });
}

function finishEvent(event, choice, outcome, dice) {
  applyEffects(character, outcome.effects ?? [], log);
  const resultNote = outcome.resultText ? `　${outcome.resultText}` : "";
  const diceNote = dice ? `（骰${dice.d1}+${dice.d2}=${dice.sum}，${dice.passed ? "過關" : "失敗"}）` : "";
  const statSummary = summarizeEffects(outcome.effects ?? [], character);
  const statNote = statSummary ? `　[${statSummary}]` : "";
  pushLog(`【${event.title}】選擇了「${choice.label}」${diceNote}${resultNote}${statNote}`);
  closeEventCard();
  renderDashboard();
  saveGame();
}

// ---------------- 畫面切換 ----------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  el(id).classList.add("active");
}

// ---------------- 綁定按鈕 ----------------
el("btn-roll").addEventListener("click", () => doRoll(randomSeedString()));
el("btn-reroll").addEventListener("click", () => doRoll(randomSeedString()));
el("btn-load-seed").addEventListener("click", () => {
  const v = el("seed-input").value.trim();
  if (v) doRoll(v);
});
el("btn-confirm-roll").addEventListener("click", () => {
  showScreen("screen-invite");
  renderInvitations();
});
el("btn-advance").addEventListener("click", advance);
el("btn-train").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  const championId = el("champion-select").value;
  if (!championId) return;
  trainChampion(character, championId, 1, character.meta.currentStageIndex);
  character.trainingPoints -= 1;
  renderChampionPanel();
  saveGame();
});
el("btn-fitness").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  character.trainingPoints -= 1;
  character.fitnessBoost = (character.fitnessBoost ?? 0) + 0.1;
  pushLog(`花費訓練點數保養身體，下次衰退判定機率降低。`);
  renderDashboard();
  saveGame();
});
el("btn-relax").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  character.trainingPoints -= 1;
  character.dynamic["壓力"] = clamp(character.dynamic["壓力"] - 15, 0, 100);
  pushLog(`花費訓練點數放鬆紓壓，壓力值下降。`);
  renderDashboard();
  saveGame();
});
document.querySelectorAll(".btn-core-train").forEach((b) =>
  b.addEventListener("click", () => {
    if (!character || character.trainingPoints < 1) return;
    const stat = b.dataset.stat;
    character.trainingPoints -= 1;
    const { gain, champBonus } = trainCoreStat(character, stat, character.meta.currentStageIndex, runtimeRng);
    const champNote = champBonus ? `，練習時順便帶動了「${getChampion(champBonus)?.name ?? champBonus}」的手感` : "";
    pushLog(`花費訓練點數加強「${stat}」，能力值提升了 ${gain.toFixed(1)}${champNote}。`);
    renderDashboard();
    saveGame();
  })
);
el("btn-new-career").addEventListener("click", () => {
  if (confirm("確定要放棄目前的生涯，重新開始嗎？這個動作無法復原。")) {
    clearSave();
    location.reload();
  }
});
el("btn-restart").addEventListener("click", () => {
  location.reload();
});
el("btn-download-card").addEventListener("click", downloadShareCard);

// ---------------- 啟動流程：檢查是否有存檔 ----------------
function showContinuePrompt(saved) {
  const c = saved.character;
  el("continue-name").textContent = c.meta.name;
  el("continue-info").textContent = `${c.meta.position} · ${c.team.name} · ${c.meta.age}歲 · ${c.meta.careerYear}年`;
  showScreen("screen-continue");

  el("btn-continue-yes").addEventListener("click", () => {
    character = c;
    log.length = 0;
    log.push(...(saved.log ?? []));
    showScreen("screen-dashboard");
    renderDashboard();
  }, { once: true });

  el("btn-continue-no").addEventListener("click", () => {
    clearSave();
    showScreen("screen-setup");
  }, { once: true });
}

const savedGame = loadSavedGame();
if (savedGame && savedGame.character && !savedGame.character.retired) {
  showContinuePrompt(savedGame);
} else {
  if (savedGame) clearSave(); // 上次已經退役結束的存檔，沒有繼續的意義，順便清掉
  renderSetup();
}
