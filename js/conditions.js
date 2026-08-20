// ============================================================
// conditions.js — 通用條件判定器
// 事件、成就、傷病、轉會都吃同一套條件格式，方便日後純資料擴充
// ============================================================
import { SEASON_FLOW } from "./state.js";

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function checkCondition(character, cond) {
  if (cond.OR) return cond.OR.some((c) => checkCondition(character, c));
  if (cond.AND) return cond.AND.every((c) => checkCondition(character, c));

  if (cond.stat) {
    const v = character.stats[cond.stat];
    if (cond.min !== undefined && v < cond.min) return false;
    if (cond.max !== undefined && v > cond.max) return false;
    return true;
  }
  if (cond.personality) {
    const v = character.personality[cond.personality];
    if (cond.min !== undefined && v < cond.min) return false;
    if (cond.max !== undefined && v > cond.max) return false;
    return true;
  }
  if (cond.path) {
    const v = getPath(character, cond.path);
    if (cond.min !== undefined && v < cond.min) return false;
    if (cond.max !== undefined && v > cond.max) return false;
    if (cond.equals !== undefined && v !== cond.equals) return false;
    return true;
  }
  if (cond.flag) return !!character.flags[cond.flag];
  if (cond.flag_not) return !character.flags[cond.flag_not];
  if (cond.fame_min !== undefined) return character.fame >= cond.fame_min;
  if (cond.fame_max !== undefined) return character.fame <= cond.fame_max;
  if (cond.stage) return cond.stage.some((s) => character.meta.currentStageName === s || character.meta.currentStageName.endsWith("世界大賽") && s.endsWith("世界大賽"));
  if (cond.region) return cond.region.includes(character.meta.region);
  if (cond.is_international) {
    // 不綁定特定賽事名稱(先鋒賽/MSI/EWC/世界賽都算)，也不分年分——用當下賽段的type判斷，
    // 比寫死"S16世界大賽"這種含年分的名稱更泛用，之後年分往上加也不用回頭改事件資料
    const stageDef = SEASON_FLOW.find((s) => s.stage === character.meta.currentStageName);
    return stageDef?.type === "international";
  }

  return true; // 未知條件類型預設放行，避免資料寫錯就整包擋死
}

export function checkAllConditions(character, conditions = []) {
  return conditions.every((c) => checkCondition(character, c));
}
