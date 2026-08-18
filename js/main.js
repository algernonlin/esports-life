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
  previewContract, computePrizeMoney, snapshotYearRecord, buildDomesticPlayoffOpponentPool,
  generateWorldsNewsFlash,
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
  character.talents = rollTalents(seedRng);
  character.stats = rollStats(seedRng, pendingRoll.position, character.talents);
  character.personality = rollPersonality(seedRng);
  character.champions = rollInitialChampions(seedRng, pendingRoll.position, character.talents);

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

  const logEl = el("event-log");
  logEl.scrollTop = logEl.scrollHeight; // 新的紀錄在下面，渲染完自動捲到底部，不用手動往下拉
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

const ROSTER_LABEL = { starter: "先發", rotation: "輪換", bench: "替補" };

// 例行賽晉級季後賽的門檻：隊伍整體戰績要過半勝率（用隊伍戰績，不是你個人出賽場次的戰績）
function qualifiesForPlayoff(stageRecord) {
  const total = (stageRecord.teamWins ?? 0) + (stageRecord.teamLosses ?? 0);
  if (total === 0) return false;
  return stageRecord.teamWins / total >= 0.5;
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
      <div class="invite-status">邀請你加入擔任${character.meta.position}${ROSTER_LABEL[r.contract.predictedRoster]}</div>
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
      character.rosterStatus = row.contract.predictedRoster;
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
  log.push({ year: character.meta.careerYear, stage: character.meta.currentStageName, text });
  if (log.length > 40) log.shift();
}

function renderDashboard() {
  if (character.retired) return renderSummary();

  el("dash-name").textContent = character.meta.name;
  el("dash-seed").innerHTML = currentSeed ? `選手種子<span class="seed-code">${currentSeed}</span>` : "";
  el("dash-info").textContent = `${character.meta.position} · ${character.team.name} · ${character.meta.age}歲 · ${character.meta.careerYear}年`;
  const season = 16 + (character.meta.careerYear - 2026);
  el("dash-stage").textContent = `S${season} ${character.meta.currentStageName}`;
  el("dash-meta").innerHTML = `版本：<span class="log-positive">${character.seasonRecord.currentMeta}</span>`;
  el("dash-roster").textContent = { starter: "先發", rotation: "輪換", bench: "替補" }[character.rosterStatus];
  el("dash-roster").className = "badge badge-" + character.rosterStatus;

  // 專精能力值(節奏/單線抗壓/運營/視野控制，依位置而定)之前漏掉沒顯示在左欄，
  // 只有擲骰畫面有正確帶到，這裡補上同樣的邏輯
  el("dash-stats").innerHTML = STAT_KEYS.concat(Object.keys(character.stats).filter((k) => !STAT_KEYS.includes(k)))
    .map((k) => statBarHtml(k, character.stats[k])).join("");
  el("dash-dynamic").innerHTML = `
    ${statBarHtml("心態", character.dynamic["心態"])}
    ${statBarHtml("體能", character.dynamic["體能"])}
    ${statBarHtml("壓力", character.dynamic["壓力"])}
  `;
  el("dash-team").innerHTML =
    statBarHtml("隊伍化學反應", character.team.chemistry) +
    statBarHtml("隊伍好感度", character.team.favor) +
    statBarHtml("媒體評價", character.team.reputation);
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
  // 體能歸零時鎖定三個核心訓練按鈕(視覺上也要看得出來，不能只靠click handler擋)
  const staminaEmpty = (character.dynamic["體能"] ?? 100) <= 0;
  document.querySelectorAll(".btn-core-train").forEach((b) => { b.disabled = staminaEmpty; });

  const myPos = character.meta.position;
  const metaIds = character.seasonRecord.metaChampions ?? [];

  // 本賽段版本英雄：只顯示自己這一路，不用五路都列出來
  const myMetaChamps = metaIds.map((id) => getChampion(id)).filter((c) => c && c.primary === myPos);
  el("meta-champion-list").innerHTML = myMetaChamps.length
    ? `<div class="meta-champ-chips">${myMetaChamps.map((c) => `<span class="meta-champ-chip ${character.champions[c.id] ? "owned" : ""}">${c.name}</span>`).join("")}</div>`
    : `<div class="empty-hint">本賽段你這個位置沒有特別強勢的版本英雄。</div>`;

  // 左側欄：隊伍平均戰力（併入隊伍區塊）
  const posStrengths = Object.values(character.team.positionStrength ?? {});
  const avgStrength = posStrengths.length ? Math.round(posStrengths.reduce((a, b) => a + b, 0) / posStrengths.length) : character.team.baseStrength;
  el("team-avg-strength").textContent = avgStrength;

  // 擅長英雄：熟練度前五（依有效熟練度排序，只取前5）——訓練不用選英雄了，
  // 但保留這個面板讓玩家看得到底層練了什麼
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
    : `<div class="empty-hint">尚未練習任何英雄，練練看加強項目吧。</div>`;
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
  if (c.flags["生涯終止_涉賭"]) return "涉賭";
  if (c.flags["家暴爭議"]) return "家暴";
  if (c.flags["已渡化嬰靈"]) return "嬰靈之王";
  if (c.flags["已被抓到出軌"]) return "渣男";
  if (c.flags["外遇中"]) return "花花公子";
  if (c.flags["毒舌人設"]) return "嘴強王者";
  if (c.flags["曾要求墮胎"]) return "胎男";
  if (c.flags["偷偷聯繫粉絲"]) return "草粉";
  if (c.flags["洗澡狗"]) return "洗澡狗";
  if (c.flags["乳牛"]) return "乳牛";
  if (c.careerCounters.worldsAppearances >= 2) return "世界賽常客";
  if (c.careerCounters.kills >= 1000) return "生涯千殺傳奇";
  if (c.fame >= 85) return "話題王者";
  if (c.chronicInjuries.length >= 2) return "傷病纏身的老將";
  if (c.team.chemistry <= 25) return "隊伍毒瘤";
  if (c.careerCounters.wins >= 150) return "傳奇老兵";
  if (c.careerCounters.wins >= 100) return "百勝老兵";
  if (c.flags["轉型意識流"]) return "以智取勝";
  if (c.flags["主動退役"]) return "急流勇退";
  if (c.flags["戰績淘汰"]) return "賴著不退役";
  if (c.meta.careerYear - 2026 <= 2 && c.retired) return "曇花一現";
  return "職業選手";
}

function retirementReasonText(c) {
  if (c.flags["主動退役"]) return "生涯末段選擇急流勇退，主動宣布退役。";
  if (c.flags["自然衰退退役"]) return "隨著年齡與狀態自然衰退，結束了職業生涯。";
  if (c.flags["戰績淘汰"]) return "因長期戰績低迷被隊伍放棄，黯然離開賽場。";
  return "職業生涯畫下句點。";
}

// ---------------- 賽段推進主邏輯 ----------------
// 訓練類log合併：同一賽段內多次點擊訓練按鈕，不要每次都各自一行洗版，
// 累積到緩衝區，等賽段推進時才合併成一行輸出
function bufferTraining(kind, detail) {
  const buf = character.flags.__trainingBuffer ?? (character.flags.__trainingBuffer = { core: {}, champBonusHit: false, champGains: {}, fitnessClicks: 0, relaxClicks: 0, therapyClicks: 0 });
  if (kind === "core") {
    buf.core[detail.stat] = (buf.core[detail.stat] ?? 0) + detail.gain;
    if (detail.champBonus) buf.champBonusHit = true;
    if (detail.champGains) {
      for (const [id, g] of Object.entries(detail.champGains)) {
        buf.champGains[id] = (buf.champGains[id] ?? 0) + g;
      }
    }
  } else if (kind === "fitness") {
    buf.fitnessClicks++;
  } else if (kind === "relax") {
    buf.relaxClicks++;
  } else if (kind === "therapy") {
    buf.therapyClicks++;
  }
}

function flushTrainingLog() {
  const buf = character.flags.__trainingBuffer;
  if (!buf) return;
  const parts = [];
  const coreEntries = Object.entries(buf.core);
  if (coreEntries.length) {
    parts.push("本賽段訓練：" + coreEntries.map(([stat, gain]) => `${stat}+${gain.toFixed(1)}`).join("、"));
  }
  if (buf.fitnessClicks > 0) parts.push(`保養體能${buf.fitnessClicks}次`);
  if (buf.relaxClicks > 0) parts.push(`紓壓${buf.relaxClicks}次`);
  if (buf.therapyClicks > 0) parts.push(`心理諮商${buf.therapyClicks}次`);
  if (parts.length) {
    const bonusNote = buf.champBonusHit ? "，練習時順便帶動了部分英雄的手感" : "";
    // 不列一堆抽象的「N人次」，直接講清楚：這賽段練最多的那隻英雄漲了多少熟練度
    const gainEntries = Object.entries(buf.champGains ?? {});
    let topChampNote = "";
    if (gainEntries.length) {
      const [topId, topGain] = gainEntries.sort((a, b) => b[1] - a[1])[0];
      const champ = getChampion(topId);
      if (champ && topGain > 0) topChampNote = `，${champ.name}提高了${Math.round(topGain)}熟練度`;
    }
    pushLog(parts.join("，") + bonusNote + topChampNote + "。");
  }
  delete character.flags.__trainingBuffer;
}

// 三個加強項目按鈕現在同時帶動不同熟練度區間的英雄：
// 個人操作→熟練度最高的幾隻（練你的招牌）；教練覆盤→熟練度中段的幾隻（補強半生不熟的）；
// 研究版本情報→當前版本、你這個位置的版本英雄（追版本）
function applyTierChampionTraining(stat, points = 1) {
  const myPos = character.meta.position;
  const eligible = CHAMPIONS.filter((c) => c.primary === myPos || c.secondary.includes(myPos));
  // 涵蓋你已擁有跟還沒練過的該路英雄（沒練過的預設熟練度0），才能真的排出「最高/最低」
  const withEff = eligible.map((c) => ({
    id: c.id,
    eff: character.champions[c.id] ? effectiveProficiency(character, c.id, myPos) : 0,
  })).sort((a, b) => b.eff - a.eff);

  const randomEligibleId = () => eligible[Math.floor(runtimeRng() * eligible.length)]?.id;

  let targets = [];
  if (stat === "反應") {
    // 個人操作：熟練度最高2隻(練你的招牌)，但排除已經滿熟練度(100)的——
    // 練滿的英雄再選中也不會再漲，等於浪費訓練機會 + 隨機1隻該路英雄
    const notMaxed = withEff.filter((o) => o.eff < 100);
    const top2 = notMaxed.slice(0, 2).map((o) => o.id);
    targets = [...new Set([...top2, randomEligibleId()])];
  } else if (stat === "意識") {
    // 教練覆盤：熟練度最低2隻(但排除完全沒練過的0分英雄，要真的是「有基礎但不夠熟」才符合覆盤的語意)
    // + 隨機1隻該路英雄。如果已經練過的英雄不到2隻，就從剩下有練過的裡面盡量湊
    const practiced = withEff.filter((o) => o.eff > 0);
    const bottom2 = practiced.slice(-2).map((o) => o.id);
    targets = [...new Set([...bottom2, randomEligibleId()])];
  } else if (stat === "版本適應力") {
    // 研究版本情報：當前版本、該路的版本英雄裡隨機挑3個（不是全部都練）
    const metaIds = character.seasonRecord.metaChampions ?? [];
    const myMetaChamps = metaIds.filter((id) => {
      const c = getChampion(id);
      return c && (c.primary === myPos || c.secondary.includes(myPos));
    });
    const shuffled = [...myMetaChamps].sort(() => runtimeRng() - 0.5);
    targets = shuffled.slice(0, 3);
  }

  targets = targets.filter(Boolean);
  const gains = {};
  targets.forEach((id) => {
    const before = character.champions[id]?.proficiency ?? 0;
    trainChampion(character, id, points, character.meta.currentStageIndex);
    gains[id] = (gains[id] ?? 0) + (character.champions[id].proficiency - before);
  });
  return { count: targets.length, gains };
}

function advance() {
  if (!character || character.retired) return;
  flushTrainingLog(); // 上個賽段累積的訓練，合併輸出成一行
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
    const { wins, losses, teamWins, teamLosses, longestWinStreak, longestLossStreak, totalGames, stageMvpCount } = simulateRegularStage(character, runtimeRng);
    // 隊伍整體戰績跟你個人出賽戰績分開存：季後賽晉級看隊伍的，生涯數據看你個人的
    character.seasonRecord[stageKey].wins += wins;
    character.seasonRecord[stageKey].losses += losses;
    character.seasonRecord[stageKey].teamWins = (character.seasonRecord[stageKey].teamWins ?? 0) + teamWins;
    character.seasonRecord[stageKey].teamLosses = (character.seasonRecord[stageKey].teamLosses ?? 0) + teamLosses;
    let streakNote = "";
    if (longestWinStreak >= 3) streakNote = `，其中一度打出${longestWinStreak}連勝，隊伍士氣明顯提升`;
    else if (longestLossStreak >= 3) streakNote = `，其中一度吞下${longestLossStreak}連敗，氣氛一度低迷`;
    const rosterNote = character.rosterStatus !== "starter" ? `（你出場${wins + losses}場，個人${wins}勝${losses}敗）` : "";
    pushLog(`例行賽戰績 ${teamWins}勝${teamLosses}敗${streakNote}。${rosterNote}`);

    const honors = evaluateStageHonors(character, stageMvpCount, wins + losses, wins, losses, totalGames);
    if (honors.regularSeasonMVP) { character.fame = clamp(character.fame + 5, 0, 100); character.trainingPoints += 5; pushLog(`🏆 榮獲本賽段常規賽MVP！`); }
    else if (honors.bestXI) { character.fame = clamp(character.fame + 3, 0, 100); character.trainingPoints += 3; pushLog(`⭐ 入選本賽段最佳陣容。`); }

    checkMilestones(character, log);
    const injury = rollInjuryChance(character, runtimeRng);
    if (injury) pushLog(`不幸受傷：${injury.name}。`);
    finishAdvance();
  } else if (stageType === "playoff" || stageType === "international") {
    const isInternational = stageType === "international";
    const stageKey = currentStageRecordKey();

    // 國內季後賽：看隊伍整體戰績夠不夠格，不是你個人出賽場次的戰績——
    // 不明講「過半勝率」這個具體門檻，現實中晉級也不是單純看勝率過半這麼簡單（賽區排名/名額都有影響）
    if (!isInternational && !qualifiesForPlayoff(character.seasonRecord[stageKey])) {
      const rec = character.seasonRecord[stageKey];
      character.seasonRecord[stageKey].playoffResult = "未晉級";
      pushLog(`隊伍例行賽戰績 ${rec.teamWins}勝${rec.teamLosses}敗，無緣季後賽。`);
      // 事件卡片開著的時候不能讓賽段搶跑，要等玩家真的選完才能推進（跟合約續約同一個修法）
      maybeTriggerEvent(finishAdvance);
      return;
    }

    runInteractivePlayoff(isInternational, (result) => {
      if (isInternational) {
        character.seasonRecord.qualifiedEvents.push({ name: character.meta.currentStageName, result });
        character.careerCounters.worldsAppearances += character.meta.currentStageName.endsWith("世界大賽") ? 1 : 0;
        character.fame = clamp(character.fame + 10, 0, 100);
        pushLog(`${character.meta.currentStageName} 結果：${result}，知名度提升。`);
        if (character.talents.some((t) => t.id === "semifinal_enough")) {
          character.dynamic["心態"] = clamp(character.dynamic["心態"] - 10, 0, 100);
          pushLog(`打完國際賽後有點鬆懈，狀態出現下滑。`);
        }
        // 事件觸發點集中在「季後賽/國際賽後」跟「長休賽期」，不再每個例行賽/短休賽期都觸發——
        // 次數變少，但保留在生涯重要節點上，賽事限定事件(例如世界賽期間女友約會)也還是吃得到
        if (result === "冠軍") character.flags["剛奪冠"] = true;
        maybeTriggerEvent(finishAdvance); // 事件卡片開著時不能讓賽段搶跑，等玩家真的選完才推進
        delete character.flags["剛奪冠"];
      } else {
        character.seasonRecord[stageKey].playoffResult = result;
        if (result === "冠軍" || result === "亞軍") character.team.favor = clamp(character.team.favor + 8, 0, 100);
        pushLog(`季後賽結果：${result}。`);
        // 國內季後賽不管有沒有奪冠，都給一次事件觸發機會（原本只有奪冠才觸發，現在事件次數變少，季後賽後本身就是重要節點）
        if (result === "冠軍") character.flags["剛奪冠"] = true;
        maybeTriggerEvent(finishAdvance);
        delete character.flags["剛奪冠"];
      }
    });
    return; // 互動流程會非同步跑完才呼叫finishAdvance，這裡先中斷
  } else if (stageType === "offseason_short") {
    tickInjuries(character, runtimeRng);
    finishAdvance();
  } else if (stageType === "offseason_long") {
    tickInjuries(character, runtimeRng);
    applyAgeDecay(character, runtimeRng);
    snapshotYearRecord(character); // 存這年的逐年戰績快照，要在seasonRecord跨年重置前呼叫
    const yearHonors = evaluateYearEndHonors(character);
    if (yearHonors.yearEndMVP) pushLog(`🏆 榮獲年度常規賽MVP！`);
    else if (yearHonors.yearEndBestPosition) pushLog(`⭐ 入選年度賽區最佳${character.meta.position}。`);

    if (!checkRetirement()) {
      character.team.contractYears -= 1;
      if (character.team.contractYears <= 0) {
        // 合約到期：等玩家真的選完續約/自由市場才能繼續推進，不能像之前一樣搶跑
        // (finishAdvance如果搶先跑，賽段/年份會在玩家還沒點任何按鈕前就先推進，
        //  合約年限卻還停在舊的到期狀態，兩邊對不上，就是你看到的年份落差問題)
        handleContractRenewal(finishAdvance);
        return;
      } else {
        // 事件卡片開著時不能讓finishAdvance搶跑，退休機率判定要等事件解決後才跑
        maybeTriggerEvent(() => {
          if (!el("event-inline").classList.contains("open")) {
            maybeOfferRetirement();
          }
          finishAdvance();
        });
        return;
      }
    } else {
      maybeTriggerEvent(finishAdvance);
      return;
    }
  } else {
    finishAdvance();
  }
}

// 季後賽/國際賽互動流程：四強賽只有決勝局(2:2)骰骰子，冠軍賽每一場都骰
function runInteractivePlayoff(isInternational, onComplete) {
  const opponentPool = isInternational
    ? buildInternationalOpponentPool(character)
    : buildDomesticPlayoffOpponentPool(character);

  function playSeries(isFinal, seriesDone) {
    let wins = 0, losses = 0;
    const gameResults = []; // 累積每場結果，系列賽結束後合併成一行log，不逐場記錄

    // 對手整個系列賽(BO5)只抽一次，不是每場重抽——原本每場重新抽對手是bug，
    // 導致一輪四強賽打了好幾支不同隊伍，這裡改成賽前先確定對手，全系列打同一支
    const opponent = opponentPool.length
      ? pickWeighted(runtimeRng, opponentPool.map((t) => ({ ...t, weight: t.baseStrength })))
      : null;
    const opponentTeam = opponent ?? { baseStrength: character.team.baseStrength, positionStrength: {} };

    function playNextGame() {
      const isDecidingGame = losses === 2; // 再輸一場就淘汰(2:2/1:2/0:2都算)，不是只有2:2平手才算絕境
      const showDice = isDecidingGame; // 冠軍賽跟四強賽用同一套邏輯，只有絕境(再輸一場就淘汰)才骰，不是每場都骰
      const seriesGameIndex = wins + losses;

      const matchContext = { isMajorEvent: true, isInternational, isDecidingGame, seriesGameIndex };
      const { winProb, fullContext } = computeMatchWinProbability(character, opponentTeam, matchContext, runtimeRng);

      const afterGame = (result) => {
        applyGameResult(character, result);
        result.win ? wins++ : losses++;
        gameResults.push(result);

        if (wins >= 3 || losses >= 3) {
          // 系列賽結束，合併成一行log：比分、勝負、平均KDA
          const roundLabel = isFinal ? "冠軍賽" : "四強賽";
          const seriesWon = wins >= 3;
          const totalKills = gameResults.reduce((s, r) => s + r.kills, 0);
          const totalDeaths = gameResults.reduce((s, r) => s + r.deaths, 0);
          const totalAssists = gameResults.reduce((s, r) => s + r.assists, 0);
          // 死亡數0時不要直接顯示擊殺+助攻的原始總和(容易變成KDA 55這種失真的誇張數字)，
          // 改成明確標示「完美」並附上實際數字，讓玩家看得懂這是什麼意思
          const kdaText = totalDeaths === 0
            ? `KDA 完美（0死亡，${totalKills}殺${totalAssists}助攻）`
            : `平均KDA ${Math.round((totalKills + totalAssists) / totalDeaths * 100) / 100}`;
          const oppName = opponent?.name ?? "未知隊伍";
          const scoreText = `${wins}:${losses}`; // 一律是「我方:對方」，不用因勝負而反轉，之前反轉的邏輯是bug
          pushLog(`${roundLabel} ${character.team.name} ${scoreText} ${oppName}，${seriesWon ? "系列賽勝出" : "系列賽落敗"}，${kdaText}。`);
          seriesDone(seriesWon);
        } else {
          playNextGame();
        }
      };

      if (showDice) {
        // 最後大魔王：BO5絕境(2:2決勝局)有50%機率覺醒，覺醒才會直接骰出雙6保證過關，
        // 而且數據也要跟得上「carry隊伍」的份量，不是只保證贏但KDA照樣難看；沒覺醒就正常骰
        const hasFinalBossTalent = isDecidingGame && character.talents.some((t) => t.id === "final_boss");
        const finalBossAwakened = hasFinalBossTalent && runtimeRng() < 0.5;
        const roll = finalBossAwakened ? { d1: 6, d2: 6, sum: 12 } : rollTwoDice(runtimeRng);
        const { target, prob: actualProb } = probabilityToTarget(winProb);
        const passed = finalBossAwakened ? true : roll.sum >= target;
        const result = resolveMatchWithResult(character, fullContext, passed, runtimeRng, winProb, finalBossAwakened);
        const moment = finalBossAwakened
          ? "絕境時刻，你彷彿變了一個人——這一波，沒有人能阻止你。"
          : hasFinalBossTalent
            ? "你已經盡力了，但這次沒能carry隊友。"
            : rollMatchMoment(runtimeRng);

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
    if (!wonSemifinal) { onComplete(isInternational ? "止步八強" : "止步四強"); return; }
    playSeries(true, (wonFinal) => {
      // 國際賽要分開累計是哪個賽事的冠亞軍，不能只看籠統加總的internationalTitles，
      // 不然大滿貫/三冠王這種要求「特定賽事」的成就沒辦法判斷
      const specificCounterKey = (result) => {
        const name = character.meta.currentStageName;
        const suffix = result === "冠軍" ? "Titles" : "RunnerUps";
        if (name === "先鋒賽") return "pioneer" + suffix;
        if (name === "季中邀請賽") return "msi" + suffix;
        if (name === "電競世界盃EWC") return "ewc" + suffix;
        if (name.endsWith("世界大賽")) return "worlds" + suffix;
        return null;
      };

      if (wonFinal) {
        if (isInternational) {
          character.careerCounters.internationalTitles++;
          const key = specificCounterKey("冠軍");
          if (key) character.careerCounters[key]++;
        } else character.careerCounters.domesticTitles++;
        const gotFmvp = rollFinalsMVP(character, runtimeRng);
        const prize = computePrizeMoney(character, isInternational, character.meta.currentStageName, "冠軍");
        character.careerCounters.prizeMoney += prize;
        const fmvpBonus = isInternational && character.meta.currentStageName === "電競世界盃EWC" && gotFmvp ? 30 : 0;
        character.careerCounters.prizeMoney += fmvpBonus;
        character.fame = clamp(character.fame + (isInternational ? 15 : 8), 0, 100); // 奪冠帶來的知名度，國際賽份量更重
        character.trainingPoints += isInternational ? 10 : 5;
        pushLog(`🏆 拿下冠軍！${gotFmvp ? "並獲選FMVP！" : ""}獲得獎金 ${(prize + fmvpBonus).toLocaleString()}萬。`);
        onComplete("冠軍");
      } else {
        if (isInternational) {
          character.careerCounters.internationalRunnerUps++;
          const key = specificCounterKey("亞軍");
          if (key) character.careerCounters[key]++;
        } else character.careerCounters.domesticRunnerUps++;
        const prize = computePrizeMoney(character, isInternational, character.meta.currentStageName, "亞軍");
        character.careerCounters.prizeMoney += prize;
        character.fame = clamp(character.fame + (isInternational ? 8 : 4), 0, 100);
        character.trainingPoints += isInternational ? 6 : 3;
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
    const { skippedInternationals } = advanceStage(character);
    // 沒資格參加、被跳過的國際賽，用場外快訊給個交代——純敘事包裝，不代表真的模擬了完整賽程
    (skippedInternationals ?? []).forEach((eventName) => {
      const flash = generateWorldsNewsFlash(runtimeRng, eventName, character.team.name);
      if (flash) pushLog(flash);
    });
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
  character.rosterStatus = contract.predictedRoster;
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
function handleContractRenewal(onDone) {
  const willRenew = evaluateContractRenewal(character);
  showContractPrompt(willRenew, onDone);
}

function showContractPrompt(teamWantsRenew, onDone) {
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
        onDone(); // 玩家真的選完了，這時候才能繼續推進賽段
      } else {
        showFreeAgencyPrompt(onDone);
      }
    }, { once: true })
  );
}

// 自由市場改成分層選單：先選本賽區/外賽區，本賽區直接列（原隊+2隊），外賽區先選賽區再列3隊
function showFreeAgencyPrompt(onDone) {
  const allRows = evaluateInvitations(character, runtimeRng, true).filter((r) => r.invited && r.team.name !== character.team.name);
  const byRegion = {};
  allRows.forEach((r) => {
    const reg = r.team.region;
    (byRegion[reg] ??= []).push(r);
  });
  Object.keys(byRegion).forEach((reg) => {
    byRegion[reg].sort((a, b) => b.prob - a.prob);
  });

  const myRegion = character.meta.region;
  const otherRegions = REGIONS.filter((r) => r !== myRegion);

  function renderChoices(title, text, buttonsHtml, onClickMap) {
    el("event-title").textContent = title;
    el("event-text").textContent = text;
    el("dice-area").innerHTML = "";
    el("dice-area").classList.remove("show");
    el("event-choices").classList.remove("hidden");
    el("event-choices").innerHTML = buttonsHtml;
    openEventCard();
    el("event-choices").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => onClickMap(b), { once: true })
    );
  }

  function showStep1() {
    renderChoices(
      "自由市場",
      "合約到期，你想留在本賽區，還是去外賽區闖闖看？",
      `<button class="btn-choice" data-act="domestic">留在本賽區（${myRegion}）</button>
       <button class="btn-choice" data-act="abroad">前進外賽區</button>`,
      (b) => (b.dataset.act === "domestic" ? showDomesticStep() : showAbroadRegionStep())
    );
  }

  function showDomesticStep() {
    // 原隊(留隊) + 本賽區最多2隊有意向的隊伍，共3個選項
    const domesticOffers = (byRegion[myRegion] ?? []).slice(0, 2).map((r) => ({ ...r, contract: previewContract(character, r.team, runtimeRng) }));
    const stayContract = previewContract(character, character.team, runtimeRng); // 留隊：用原隊強度重新議價一次

    const buttons = [
      `<button class="btn-choice" data-team="__stay__">留在 ${character.team.name}（${ROSTER_LABEL[stayContract.predictedRoster]}・${stayContract.years}年約・總價${stayContract.totalValue.toLocaleString()}萬）</button>`,
      ...domesticOffers.map((r) => `<button class="btn-choice" data-team="${r.team.name}">${r.team.name}（${ROSTER_LABEL[r.contract.predictedRoster]}・${r.contract.years}年約・總價${r.contract.totalValue.toLocaleString()}萬）</button>`),
    ].join("");

    renderChoices(`本賽區（${myRegion}）`, "選一支隊伍加入，或留在原隊：", buttons, (b) => {
      if (b.dataset.team === "__stay__") {
        finalizeStay(stayContract);
      } else {
        finalizeSign(domesticOffers.find((r) => r.team.name === b.dataset.team));
      }
    });
  }

  function showAbroadRegionStep() {
    const buttons = otherRegions.map((r) => `<button class="btn-choice" data-region="${r}">${r}</button>`).join("");
    renderChoices("選擇外賽區", "想去哪個賽區發展？", buttons, (b) => showAbroadTeamStep(b.dataset.region));
  }

  function showAbroadTeamStep(region) {
    const teams = (byRegion[region] ?? []).slice(0, 3).map((r) => ({ ...r, contract: previewContract(character, r.team, runtimeRng) }));
    const buttons = teams.length
      ? teams.map((r) => `<button class="btn-choice" data-team="${r.team.name}">${r.team.name}（${ROSTER_LABEL[r.contract.predictedRoster]}・${r.contract.years}年約・總價${r.contract.totalValue.toLocaleString()}萬）</button>`).join("")
      : `<div class="empty-hint">這個賽區目前沒有隊伍向你招手。</div><button class="btn-choice" data-act="back">回上一步</button>`;
    renderChoices(`${region} 隊伍選擇`, "選一支隊伍加入：", buttons, (b) => {
      if (b.dataset.act === "back") { showAbroadRegionStep(); return; }
      finalizeSign(teams.find((r) => r.team.name === b.dataset.team));
    });
  }

  function finalizeStay(contract) {
    character.team.contractYears = contract.years;
    character.team.contractSalary = contract.annualSalary;
    character.rosterStatus = contract.predictedRoster;
    pushLog(`合約到期，跟 ${character.team.name} 重新議價續留，簽下${contract.years}年約，總價${contract.totalValue.toLocaleString()}萬。`);
    closeEventCard();
    renderDashboard();
    saveGame();
    onDone();
  }

  function finalizeSign(row) {
    const t = row.team;
    const oldTeam = character.team.name;
    const oldRegion = character.meta.region;
    character.team = {
      ...character.team, name: t.name, baseStrength: t.baseStrength, positionStrength: t.positionStrength,
      reputation: t.reputation, chemistry: 50, favor: 50, contractYears: row.contract.years,
    };
    character.team.contractSalary = row.contract.annualSalary;
    character.rosterStatus = row.contract.predictedRoster;
    character.meta.teamName = t.name;
    character.meta.region = t.region;
    const regionNote = t.region !== oldRegion ? `，跨賽區轉戰 ${t.region}` : "";
    pushLog(`合約到期後在自由市場，從 ${oldTeam} 轉會加入 ${t.name}${regionNote}，簽下${row.contract.years}年約，總價${row.contract.totalValue.toLocaleString()}萬。`);
    closeEventCard();
    renderDashboard();
    saveGame();
    onDone();
  }

  showStep1();
}

function applyPositionChange() {
  delete character.flags["待轉位置"];
  const oldPos = character.meta.position;

  const candidates = Object.keys(character.team.positionStrength).filter((p) => p !== oldPos);
  const targetPos = candidates.reduce((weakest, p) =>
    character.team.positionStrength[p] < character.team.positionStrength[weakest] ? p : weakest, candidates[0]);

  // 專精值(節奏/單線抗壓/運營/視野控制)現在是即時從6個核心能力值算出來的，
  // 換位置不用再手動搬移數值/打折——同樣的核心能力值，換一個位置套用的公式自然就不同
  character.meta.position = targetPos;
  pushLog(`轉位置：從「${oldPos}」轉為「${targetPos}」。`);
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

function maybeTriggerEvent(onDone) {
  const event = pickEvent(character, runtimeRng);
  if (!event) { onDone?.(); return; }
  markEventCooldown(character, event);
  showEventModal(event, onDone);
}

// ---------------- 事件彈窗 ----------------
function showEventModal(event, onDone) {
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
        finishEvent(event, choice, outcome, undefined, onDone);
        return;
      }
      el("event-choices").classList.add("hidden");
      runDiceAnimation(dice, () => finishEvent(event, choice, outcome, dice, onDone));
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

function finishEvent(event, choice, outcome, dice, onDone) {
  applyEffects(character, outcome.effects ?? [], log);
  const resultNote = outcome.resultText ? `　${outcome.resultText}` : "";
  const diceNote = dice ? `（骰${dice.d1}+${dice.d2}=${dice.sum}，${dice.passed ? "過關" : "失敗"}）` : "";
  const statSummary = summarizeEffects(outcome.effects ?? [], character);
  const statNote = statSummary ? `　[${statSummary}]` : "";
  pushLog(`【${event.title}】選擇了「${choice.label}」${diceNote}${resultNote}${statNote}`);
  closeEventCard();
  renderDashboard();
  saveGame();
  onDone?.(); // 玩家真的選完了，這時候才能繼續推進賽段（沒有事件的話onDone在maybeTriggerEvent就已經呼叫過了）
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

el("btn-fitness").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  character.trainingPoints -= 1;
  character.fitnessBoost = (character.fitnessBoost ?? 0) + 0.1;
  const staminaGain = Math.round(8 + runtimeRng() * 7); // 8~15隨機
  character.dynamic["體能"] = clamp(character.dynamic["體能"] + staminaGain, 0, 100);
  bufferTraining("fitness");
  renderDashboard();
  saveGame();
});
el("btn-relax").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  character.trainingPoints -= 1;
  character.dynamic["壓力"] = clamp(character.dynamic["壓力"] - 15, 0, 100);
  bufferTraining("relax");
  renderDashboard();
  saveGame();
});
el("btn-therapy").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  character.trainingPoints -= 1;
  const moodGain = Math.round(8 + runtimeRng() * 7); // 8~15隨機，跟保養體能同量級
  character.dynamic["心態"] = clamp(character.dynamic["心態"] + moodGain, 0, 100);
  bufferTraining("therapy");
  renderDashboard();
  saveGame();
});
document.querySelectorAll(".btn-core-train").forEach((b) =>
  b.addEventListener("click", () => {
    if (!character || character.trainingPoints < 1 || character.dynamic["體能"] <= 0) return;
    const stat = b.dataset.stat;
    character.trainingPoints -= 1;
    const staminaCost = Math.round(3 + runtimeRng() * 4); // 訓練會消耗體能，3~7隨機
    character.dynamic["體能"] = clamp(character.dynamic["體能"] - staminaCost, 0, 100);
    const { gain, champBonus } = trainCoreStat(character, stat, character.meta.currentStageIndex, runtimeRng);
    const { gains: tierGains } = applyTierChampionTraining(stat, 1);
    bufferTraining("core", { stat, gain, champBonus, champGains: tierGains });
    renderChampionPanel();
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
