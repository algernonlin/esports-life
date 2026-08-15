// ============================================================
// main.js — UI 綁定與遊戲主迴圈
// ============================================================
import {
  POSITIONS, REGIONS, TEAMS, STAT_KEYS, PERSONALITY_TRAITS, POSITION_SPECIALTY,
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
  evaluateInvitations, grantTrainingPoints, tickChampionDecay, pickTradeDestination,
} from "./season.js";
import { checkMilestones } from "./achievements.js";
import { rollInjuryChance, tickInjuries } from "./injuries.js";
import { CHAMPIONS, getChampion, trainChampion, effectiveProficiency } from "./champions.js";

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
  const rows = evaluateInvitations(character, runtimeRng);

  el("invitation-list").innerHTML = rows.map((r) => `
    <div class="invite-row ${r.invited ? "invited" : "declined"}">
      <div class="invite-team">
        <span class="invite-name">${r.team.name}</span>
        <span class="invite-strength mono">該路戰力 ${r.team.positionStrength[character.meta.position]}</span>
      </div>
      <div class="invite-status">${r.invited ? (r.guaranteed ? "小聯盟球探邀請" : "一軍正式邀請") : "暫無邀約"}</div>
      ${r.invited ? `<button class="btn-small" data-team="${r.team.name}">加入</button>` : ""}
    </div>
  `).join("");

  el("invitation-list").querySelectorAll("button[data-team]").forEach((b) =>
    b.addEventListener("click", () => {
      const row = rows.find((r) => r.team.name === b.dataset.team);
      const t = row.team;
      character.team = { ...character.team, name: t.name, baseStrength: t.baseStrength, positionStrength: t.positionStrength, reputation: t.reputation };
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

  renderChampionPanel();
}

function renderChampionPanel() {
  el("training-points").textContent = character.trainingPoints;

  const myPos = character.meta.position;
  const relevant = CHAMPIONS.filter((c) => c.primary === myPos || c.secondary.includes(myPos));
  el("champion-select").innerHTML = relevant.map((c) => `<option value="${c.id}">${c.name}（${c.primary === myPos ? "本命" : "可兼"}）</option>`).join("");

  const owned = Object.keys(character.champions);
  el("champion-list").innerHTML = owned.length
    ? owned.map((id) => {
        const champ = getChampion(id);
        if (!champ) return "";
        const eff = Math.round(effectiveProficiency(character, id, myPos));
        const isMeta = champ.flavor === character.seasonRecord.currentMeta;
        return `
          <div class="champ-row">
            <span class="champ-name">${champ.name}${isMeta ? ' <span class="meta-tag">版本英雄</span>' : ""}</span>
            <div class="stat-track"><div class="stat-fill" style="width:${eff}%"></div></div>
            <span class="stat-value mono">${eff}</span>
          </div>`;
      }).join("")
    : `<div class="empty-hint">尚未練習任何英雄，選一隻開始吧。</div>`;
}

function renderSummary() {
  showScreen("screen-summary");
  const c = character;
  el("summary-name").textContent = c.meta.name;
  el("summary-title").textContent = generateTitle(c);
  el("summary-stats").innerHTML = `
    <div>${retirementReasonText(c)}</div>
    <div>生涯年資：${c.meta.careerYear - 2026} 年</div>
    <div>累積戰績：${c.careerCounters.wins}勝 ${c.careerCounters.losses}敗</div>
    <div>累積 K/D/A：${c.careerCounters.kills} / ${c.careerCounters.deaths} / ${c.careerCounters.assists}</div>
    <div>世界賽次數：${c.careerCounters.worldsAppearances}</div>
    <div>知名度：${Math.round(c.fame)}</div>
    <div>慢性傷病：${c.chronicInjuries.join("、") || "無"}</div>
  `;
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

  if (character.flags["待轉位置"]) {
    applyPositionChange();
  }
  if (character.flags["待轉隊"]) {
    applyTrade();
  }

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
    if (result === "冠軍") {
      character.flags["剛奪冠"] = true;
      maybeTriggerEvent();
      delete character.flags["剛奪冠"];
    }
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
    if (!checkRetirement()) {
      maybeOfferRetirement();
    }
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

function applyTrade() {
  delete character.flags["待轉隊"];
  const dest = pickTradeDestination(character, runtimeRng);
  if (!dest) {
    pushLog(`轉隊邀約最終沒有下文，繼續留在 ${character.team.name}。`);
    return;
  }

  const oldTeam = character.team.name;
  const messyExit = character.team.favor < 20; // 對應「魚死網破」曝光劇本

  character.team = {
    ...character.team,
    name: dest.name,
    baseStrength: dest.baseStrength,
    positionStrength: dest.positionStrength,
    reputation: dest.reputation,
    chemistry: 50,   // 新隊伍化學反應歸零重新累積
    favor: 50,
    contractYears: 2,
  };
  character.meta.teamName = dest.name;

  if (messyExit) {
    character.fame = clamp(character.fame + 10, 0, 100); // 話題性上升
    character.team.reputation = clamp(character.team.reputation - 10, 0, 100);
    pushLog(`從 ${oldTeam} 火爆離隊，私訊「魚死網破，今晚就走」被截圖流出，話題性暴衝但新東家對你多留了個心眼。`);
  } else {
    pushLog(`完成轉隊，從 ${oldTeam} 加入 ${dest.name}。`);
  }
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
  if (el("event-modal").classList.contains("open")) return false;
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
  el("event-modal").classList.add("open");

  el("event-choices").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      el("event-modal").classList.remove("open");
      if (b.dataset.act === "retire") {
        character.retired = true;
        character.flags["主動退役"] = true;
        pushLog(`${character.meta.name} 主動宣布退役，結束職業生涯。`);
        renderSummary();
      } else {
        pushLog(`${character.meta.age}歲，決定繼續留在賽場上奮戰。`);
        renderDashboard();
      }
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
el("btn-train").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  const championId = el("champion-select").value;
  if (!championId) return;
  trainChampion(character, championId, 1, character.meta.currentStageIndex);
  character.trainingPoints -= 1;
  renderChampionPanel();
});
el("btn-fitness").addEventListener("click", () => {
  if (character.trainingPoints < 1) return;
  character.trainingPoints -= 1;
  character.fitnessBoost = (character.fitnessBoost ?? 0) + 0.1;
  pushLog(`花費訓練點數保養身體，下次衰退判定機率降低。`);
  renderDashboard();
});
el("btn-restart").addEventListener("click", () => {
  location.reload();
});

renderSetup();
