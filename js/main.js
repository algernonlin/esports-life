// ============================================================
// main.js — UI 綁定與遊戲主迴圈
// ============================================================
import {
  POSITIONS, REGIONS, TEAMS, STAT_KEYS, PERSONALITY_TRAITS,
  createCharacter, SEASON_FLOW,
} from "./state.js";
import { makeSeedRng, randomSeedString, runtimeRng, clamp } from "./rng.js";
import { rollStats, rollPersonality, rollTalents } from "./roll.js";
import { checkAllConditions } from "./conditions.js";
import { applyEffects } from "./effects.js";
import { pickEvent, markEventCooldown, resolveChoiceOutcome } from "./events.js";
import { faceChar } from "./dice.js";
import {
  advanceStage, simulateRegularStage, simulatePlayoff, checkQualification,
  rollMetaVersion, applyAgeDecay, evaluateRosterStatus,
} from "./season.js";
import { checkMilestones } from "./achievements.js";
import { rollInjuryChance, tickInjuries } from "./injuries.js";

const el = (id) => document.getElementById(id);
let character = null;
let currentSeed = "";
let pendingRoll = { position: "中路", region: "LPL" };
const log = [];

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
}

function statBarHtml(key, value) {
  return `
    <div class="stat-row">
      <span class="stat-label">${key}</span>
      <div class="stat-track"><div class="stat-fill" style="width:${value}%"></div></div>
      <span class="stat-value mono">${value}</span>
    </div>`;
}

// ---------------- Screen 2: 隊伍邀請 ----------------
function renderInvitations() {
  const teams = TEAMS[character.meta.region];
  const avgStat = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;

  const rows = teams.map((t) => {
    const prob = clamp(0.5 + (avgStat - t.baseStrength) / 60, 0.05, 0.95);
    const invited = runtimeRng() < prob;
    return { ...t, invited, prob };
  });

  el("invitation-list").innerHTML = rows.map((t) => `
    <div class="invite-row ${t.invited ? "invited" : "declined"}">
      <div class="invite-team">
        <span class="invite-name">${t.name}</span>
        <span class="invite-strength mono">戰力 ${t.baseStrength}</span>
      </div>
      <div class="invite-status">${t.invited ? "邀請你加入" : "暫無邀約"}</div>
      ${t.invited ? `<button class="btn-small" data-team="${t.name}">加入</button>` : ""}
    </div>
  `).join("");

  el("invitation-list").querySelectorAll("button[data-team]").forEach((b) =>
    b.addEventListener("click", () => {
      const team = teams.find((t) => t.name === b.dataset.team);
      character.team = { ...character.team, name: team.name, baseStrength: team.baseStrength, reputation: team.reputation };
      character.meta.teamName = team.name;
      startCareer();
    })
  );

  const anyInvited = rows.some((r) => r.invited);
  el("no-invite-hint").style.display = anyInvited ? "none" : "block";
  if (!anyInvited) {
    const weakest = teams.reduce((a, b) => (a.baseStrength < b.baseStrength ? a : b));
    el("no-invite-hint").querySelector("button").onclick = () => {
      character.team = { ...character.team, name: weakest.name, baseStrength: weakest.baseStrength, reputation: weakest.reputation };
      character.meta.teamName = weakest.name;
      startCareer();
    };
  }
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
  el("dash-stage").textContent = character.meta.currentStageName;
  el("dash-meta").textContent = `版本：${character.seasonRecord.currentMeta}`;
  el("dash-roster").textContent = { starter: "先發", rotation: "輪換", bench: "替補" }[character.rosterStatus];
  el("dash-roster").className = "badge badge-" + character.rosterStatus;

  el("dash-stats").innerHTML = STAT_KEYS.map((k) => statBarHtml(k, character.stats[k])).join("");
  el("dash-dynamic").innerHTML = `
    ${statBarHtml("心態", character.dynamic["心態"])}
    ${statBarHtml("體能", character.dynamic["體能"])}
  `;
  el("dash-team").innerHTML = `
    <div class="team-stat"><span>隊伍化學反應</span><span class="mono">${Math.round(character.team.chemistry)}</span></div>
    <div class="team-stat"><span>隊伍好感度</span><span class="mono">${Math.round(character.team.favor)}</span></div>
    <div class="team-stat"><span>媒體評價</span><span class="mono">${Math.round(character.team.reputation)}</span></div>
  `;
  el("dash-fame").textContent = Math.round(character.fame);
  el("dash-counters").textContent =
    `${character.careerCounters.kills}K / ${character.careerCounters.deaths}D / ${character.careerCounters.assists}A ・ ${character.careerCounters.wins}勝${character.careerCounters.losses}敗`;

  el("dash-injuries").innerHTML = character.injuries.length
    ? character.injuries.map((i) => `<span class="injury-tag">${i.name}（${i.duration}階段）</span>`).join("")
    : `<span class="empty-hint-inline">目前健康</span>`;

  el("event-log").innerHTML = log.slice(0, 8).map((l) => `<div class="log-row"><span class="log-tag">${l.stage}</span>${l.text}</div>`).join("");
}

function renderSummary() {
  showScreen("screen-summary");
  const c = character;
  el("summary-name").textContent = c.meta.name;
  el("summary-title").textContent = generateTitle(c);
  el("summary-stats").innerHTML = `
    <div>生涯年資：${c.meta.careerYear - 2026} 年</div>
    <div>累積戰績：${c.careerCounters.wins}勝 ${c.careerCounters.losses}敗</div>
    <div>累積 K/D/A：${c.careerCounters.kills} / ${c.careerCounters.deaths} / ${c.careerCounters.assists}</div>
    <div>世界賽次數：${c.careerCounters.worldsAppearances}</div>
    <div>知名度：${Math.round(c.fame)}</div>
    <div>慢性傷病：${c.chronicInjuries.join("、") || "無"}</div>
  `;
}

function generateTitle(c) {
  if (c.flags["生涯終止_涉賭"]) return "涉賭爭議球員";
  if (c.careerCounters.kills >= 1000) return "生涯千殺傳奇";
  if (c.fame >= 80) return "話題王者";
  if (c.chronicInjuries.length >= 2) return "傷病纏身的老將";
  if (c.careerCounters.wins >= 100) return "百勝老兵";
  return "職業選手";
}

// ---------------- 賽段推進主邏輯 ----------------
function advance() {
  if (!character || character.retired) return;
  const stageType = SEASON_FLOW[character.meta.currentStageIndex].type;

  if (stageType === "regular") {
    rollMetaVersion(character, runtimeRng);
    const stageKey = currentStageRecordKey();
    const { wins, losses } = simulateRegularStage(character, runtimeRng);
    character.seasonRecord[stageKey].wins += wins;
    character.seasonRecord[stageKey].losses += losses;
    pushLog(`例行賽戰績 ${wins}勝${losses}敗。`);
    maybeTriggerEvent();
    checkMilestones(character, log);
    const injury = rollInjuryChance(character, runtimeRng);
    if (injury) pushLog(`不幸受傷：${injury.name}。`);
  } else if (stageType === "playoff") {
    const stageKey = currentStageRecordKey();
    const result = simulatePlayoff(character, runtimeRng);
    character.seasonRecord[stageKey].playoffResult = result;
    pushLog(`季後賽結果：${result}。`);
    if (result === "冠軍" || result === "亞軍") character.team.favor = clamp(character.team.favor + 8, 0, 100);
  } else if (stageType === "international") {
    const result = simulatePlayoff(character, runtimeRng);
    character.seasonRecord.qualifiedEvents.push({ name: character.meta.currentStageName, result });
    character.careerCounters.worldsAppearances += character.meta.currentStageName === "S16世界大賽" ? 1 : 0;
    character.fame = clamp(character.fame + 10, 0, 100);
    pushLog(`${character.meta.currentStageName} 結果：${result}，知名度提升。`);
  } else if (stageType === "offseason_short") {
    maybeTriggerEvent();
    tickInjuries(character, runtimeRng);
  } else if (stageType === "offseason_long") {
    tickInjuries(character, runtimeRng);
    applyAgeDecay(character, runtimeRng);
    maybeTriggerEvent();
    checkRetirement();
  }

  delete character.flags["本場carry但輸"];
  character.rosterStatus = evaluateRosterStatus(character);

  if (!character.retired) {
    advanceStage(character);
    renderDashboard();
  } else {
    renderSummary();
  }
}

function currentStageRecordKey() {
  const name = character.meta.currentStageName;
  if (name.startsWith("第一")) return "stage1";
  if (name.startsWith("第二")) return "stage2";
  return "stage3";
}

function checkRetirement() {
  const statAvg = Object.values(character.stats).reduce((a, b) => a + b, 0) / Object.values(character.stats).length;
  if (character.meta.age >= 34 || (character.meta.age >= 28 && statAvg < 35)) {
    character.retired = true;
    pushLog(`${character.meta.name} 宣布退役，結束職業生涯。`);
  }
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
  el("event-modal").classList.add("open");

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
      <span class="die rolling" id="die-1">${faceChar(1)}</span>
      <span class="die rolling" id="die-2">${faceChar(1)}</span>
    </div>
    <div class="dice-result mono" id="dice-result"></div>
  `;

  const d1El = el("die-1");
  const d2El = el("die-2");
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

    const cont = document.createElement("button");
    cont.className = "btn-primary btn-block";
    cont.textContent = "繼續 ▸";
    cont.style.marginTop = "16px";
    cont.addEventListener("click", onDone, { once: true });
    area.appendChild(cont);
  }, 900);
}

function finishEvent(event, choice, outcome, dice) {
  applyEffects(character, outcome.effects ?? [], log);
  const resultNote = outcome.resultText ? `　${outcome.resultText}` : "";
  const diceNote = dice ? `（骰${dice.d1}+${dice.d2}=${dice.sum}，${dice.passed ? "過關" : "失敗"}）` : "";
  pushLog(`【${event.title}】選擇了「${choice.label}」${diceNote}${resultNote}`);
  el("event-modal").classList.remove("open");
  renderDashboard();
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
el("btn-restart").addEventListener("click", () => {
  location.reload();
});

renderSetup();
