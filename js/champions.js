// ============================================================
// champions.js — 英雄資料、位置適配折扣、熟練度養成與遺忘
//
// 完整173隻英雄清單（截至2026/6 Locke上線為止，資料來源：官方發布紀錄）。
// 中文譯名是憑訓練資料整理的最佳猜測，不是直接從Garena TW介面抓取，
// 少數翻譯可能跟遊戲內顯示有出入，你發現錯的直接改 CHAMPIONS 陣列裡的 name 即可。
// 之後 Riot 出新英雄，照這個格式在 RAW 陣列裡加一行就好，不用動其他邏輯。
// ============================================================
import { clamp } from "./rng.js";

// 位置 → 版本模板 flavor 的預設對應（沿用你之前定案的四種版本模板）
const POSITION_FLAVOR = {
  "上路": "上路強勢版本",
  "打野": "野核版本",
  "中路": "均衡版本",
  "ADC": "AD核心版本",
  "輔助": "均衡版本",
};

// [id, 中文名, 本命位置, 可兼位置陣列]
const RAW = [
  // ---- 上路 ----
  ["Aatrox", "亞托克斯", "上路", []],
  ["Camille", "卡蜜兒", "上路", []],
  ["Chogath", "科加斯", "上路", ["輔助"]],
  ["Darius", "達瑞斯", "上路", []],
  ["DrMundo", "蒙多醫生", "上路", []],
  ["Fiora", "菲歐拉", "上路", []],
  ["Gangplank", "剛普朗克", "上路", ["中路"]],
  ["Garen", "蓋倫", "上路", []],
  ["Gnar", "納爾", "上路", []],
  ["Gwen", "關", "上路", []],
  ["Illaoi", "伊羅旖", "上路", []],
  ["Irelia", "艾瑞莉婭", "上路", ["中路"]],
  ["Jax", "賈克斯", "上路", ["打野"]],
  ["Jayce", "杰西", "上路", ["中路"]],
  ["Kayle", "凱爾", "上路", ["中路"]],
  ["Kennen", "肯尼", "上路", ["中路"]],
  ["Kled", "克烈", "上路", []],
  ["Malphite", "墨菲特", "上路", ["輔助"]],
  ["Mordekaiser", "魔鐸凱薩", "上路", []],
  ["Nasus", "內瑟斯", "上路", []],
  ["Olaf", "歐拉夫", "上路", ["打野"]],
  ["Ornn", "歐恩", "上路", []],
  ["Pantheon", "潘森", "上路", ["輔助", "打野", "中路"]],
  ["Quinn", "逆命", "上路", []],
  ["Renekton", "雷尼克頓", "上路", ["打野"]],
  ["Riven", "銳雯", "上路", []],
  ["Rumble", "隆巴", "上路", ["中路"]],
  ["Sett", "賽特", "上路", ["輔助"]],
  ["Shen", "慎", "上路", ["輔助"]],
  ["Singed", "辛吉德", "上路", []],
  ["Sion", "賽恩", "上路", []],
  ["TahmKench", "塔姆肯奇", "上路", ["輔助"]],
  ["Teemo", "提摩", "上路", []],
  ["Trundle", "特朗德爾", "上路", ["打野"]],
  ["Tryndamere", "泰達米爾", "上路", []],
  ["Urgot", "厄加特", "上路", []],
  ["Volibear", "沃利貝爾", "上路", ["打野"]],
  ["Warwick", "沃里克", "上路", ["打野"]],
  ["MonkeyKing", "孫悟空", "上路", ["打野"]],
  ["Yorick", "約里克", "上路", []],
  ["KSante", "卡桑特", "上路", []],
  ["Ambessa", "安別薩", "上路", ["打野"]],
  ["Aurora", "極光", "上路", ["中路"]],
  ["Zaahen", "扎恆", "上路", []],
  ["Locke", "洛克", "上路", ["打野"]],

  // ---- 打野 ----
  ["Amumu", "阿姆姆", "打野", ["輔助"]],
  ["Belveth", "貝爾薇斯", "打野", []],
  ["Diana", "黛安娜", "打野", ["中路"]],
  ["Ekko", "艾克", "打野", ["中路"]],
  ["Elise", "伊莉絲", "打野", []],
  ["Evelynn", "伊芙琳", "打野", []],
  ["Fiddlesticks", "費德提克", "打野", ["輔助"]],
  ["Gragas", "古拉加斯", "打野", ["上路"]],
  ["Graves", "葛雷夫", "打野", []],
  ["Hecarim", "赫卡里姆", "打野", []],
  ["Ivern", "艾翁", "打野", ["輔助"]],
  ["JarvanIV", "嘉文四世", "打野", []],
  ["Karthus", "卡爾瑟斯", "打野", ["中路"]],
  ["Kayn", "凱恩", "打野", []],
  ["Khazix", "卡力斯", "打野", []],
  ["Kindred", "肯因德", "打野", []],
  ["LeeSin", "李星", "打野", []],
  ["Lillia", "莉莉亞", "打野", []],
  ["Maokai", "茂凱", "打野", ["上路", "輔助"]],
  ["MasterYi", "易大師", "打野", []],
  ["Nidalee", "妮德麗", "打野", []],
  ["Nocturne", "魔嵐", "打野", []],
  ["Nunu", "努努與威朗普", "打野", []],
  ["Rammus", "拉姆斯", "打野", []],
  ["RekSai", "銳凱塞", "打野", []],
  ["Rengar", "雷葛爾", "打野", ["上路"]],
  ["Sejuani", "瑟菈紋", "打野", []],
  ["Shaco", "薩科", "打野", ["輔助"]],
  ["Shyvana", "希瓦娜", "打野", []],
  ["Skarner", "斯卡納", "打野", []],
  ["Talon", "塔隆", "打野", ["中路"]],
  ["Udyr", "烏迪爾", "打野", []],
  ["Vi", "菲艾", "打野", []],
  ["Viego", "維谷", "打野", []],
  ["XinZhao", "信", "打野", []],
  ["Zac", "札克", "打野", ["上路"]],
  ["Briar", "布蕾爾", "打野", []],

  // ---- 中路 ----
  ["Ahri", "阿璃", "中路", []],
  ["Akali", "阿卡莉", "中路", ["上路"]],
  ["Anivia", "艾尼維亞", "中路", []],
  ["Annie", "安妮", "中路", ["輔助"]],
  ["AurelionSol", "奧瑞利安索爾", "中路", []],
  ["Azir", "阿祈爾", "中路", []],
  ["Cassiopeia", "卡莎碧亞", "中路", ["上路"]],
  ["Corki", "庫奇", "中路", []],
  ["Fizz", "飛斯", "中路", []],
  ["Galio", "加里歐", "中路", ["輔助"]],
  ["Heimerdinger", "黑默丁格", "中路", ["上路", "輔助"]],
  ["Kassadin", "卡薩丁", "中路", []],
  ["Katarina", "卡特蓮娜", "中路", []],
  ["Leblanc", "勒布朗", "中路", []],
  ["Lissandra", "麗珊卓", "中路", []],
  ["Lux", "拉克絲", "中路", ["輔助"]],
  ["Malzahar", "馬爾札哈", "中路", ["輔助"]],
  ["Naafiri", "納菲莉", "中路", []],
  ["Neeko", "妮可", "中路", ["輔助"]],
  ["Orianna", "奧莉安娜", "中路", []],
  ["Qiyana", "祈安娜", "中路", []],
  ["Ryze", "雷茲", "中路", []],
  ["Swain", "斯溫", "中路", ["輔助"]],
  ["Sylas", "希拉斯", "中路", ["打野", "上路"]],
  ["Syndra", "辛卓拉", "中路", []],
  ["Taliyah", "塔莉雅", "中路", ["打野"]],
  ["Tristana", "崔絲塔娜", "中路", ["ADC"]],
  ["TwistedFate", "崔斯特", "中路", []],
  ["Veigar", "維迦", "中路", ["輔助"]],
  ["Velkoz", "威寇茲", "中路", ["輔助"]],
  ["Vex", "薇可斯", "中路", []],
  ["Viktor", "維克特", "中路", []],
  ["Vladimir", "弗拉迪米爾", "中路", ["上路"]],
  ["Xerath", "齊拉斯", "中路", ["輔助"]],
  ["Yasuo", "亞索", "中路", ["上路"]],
  ["Yone", "永恩", "中路", ["上路"]],
  ["Zed", "劫", "中路", []],
  ["Ziggs", "吉格斯", "中路", ["輔助"]],
  ["Zoe", "柔依", "中路", []],
  ["Hwei", "赫威", "中路", ["輔助"]],
  ["Mel", "梅爾", "中路", ["輔助"]],
  ["Akshan", "阿卡辛", "中路", ["ADC"]],

  // ---- ADC ----
  ["Aphelios", "厄斐琉斯", "ADC", []],
  ["Ashe", "艾希", "ADC", ["輔助"]],
  ["Caitlyn", "凱特琳", "ADC", []],
  ["Draven", "達瑞文", "ADC", []],
  ["Ezreal", "伊澤瑞爾", "ADC", []],
  ["Jhin", "金", "ADC", []],
  ["Jinx", "金克絲", "ADC", []],
  ["Kaisa", "卡莎", "ADC", []],
  ["Kalista", "卡莉絲塔", "ADC", []],
  ["KogMaw", "寇格魔", "ADC", ["輔助"]],
  ["Lucian", "盧錫安", "ADC", []],
  ["MissFortune", "好運姐", "ADC", ["輔助"]],
  ["Nilah", "妮拉", "ADC", []],
  ["Samira", "莎米拉", "ADC", []],
  ["Senna", "賽娜", "ADC", ["輔助"]],
  ["Sivir", "希維爾", "ADC", []],
  ["Smolder", "斯摩德", "ADC", []],
  ["Twitch", "圖奇", "ADC", ["輔助"]],
  ["Varus", "瓦魯斯", "ADC", ["中路"]],
  ["Vayne", "薇恩", "ADC", ["上路"]],
  ["Xayah", "瑟雅", "ADC", []],
  ["Zeri", "婕莉", "ADC", []],
  ["Yunara", "永嵐", "ADC", []],

  // ---- 輔助 ----
  ["Alistar", "阿利斯塔", "輔助", []],
  ["Bard", "巴德", "輔助", []],
  ["Blitzcrank", "布里茨", "輔助", []],
  ["Brand", "布蘭德", "輔助", ["中路"]],
  ["Braum", "布郎姆", "輔助", []],
  ["Janna", "迦娜", "輔助", []],
  ["Karma", "卡瑪", "輔助", ["中路"]],
  ["Leona", "蕾歐娜", "輔助", []],
  ["Lulu", "露璐", "輔助", []],
  ["Milio", "米里歐", "輔助", []],
  ["Morgana", "莫甘娜", "輔助", ["中路"]],
  ["Nami", "娜美", "輔助", []],
  ["Nautilus", "納帝魯斯", "輔助", ["上路", "打野"]],
  ["Poppy", "波比", "輔助", ["上路"]],
  ["Pyke", "派克", "輔助", ["中路"]],
  ["Rakan", "銳空", "輔助", []],
  ["Rell", "芮兒", "輔助", []],
  ["Renata", "芮娜塔", "輔助", []],
  ["Seraphine", "撒拉芬", "輔助", ["中路", "ADC"]],
  ["Sona", "索娜", "輔助", []],
  ["Soraka", "索拉卡", "輔助", []],
  ["Taric", "塔里克", "輔助", []],
  ["Thresh", "瑟雷西", "輔助", []],
  ["Yuumi", "悠咪", "輔助", []],
  ["Zilean", "基蘭", "輔助", ["中路"]],
  ["Zyra", "婕拉", "輔助", ["中路"]],
];

export const CHAMPIONS = RAW.map(([id, name, primary, secondary]) => ({
  id, name, primary, secondary, flavor: POSITION_FLAVOR[primary],
}));

export function getChampion(id) {
  return CHAMPIONS.find((c) => c.id === id);
}

export function getChampionsByFlavor(flavor) {
  return CHAMPIONS.filter((c) => c.flavor === flavor);
}

// -------------------------------------------------------------
// 位置適配係數
// -------------------------------------------------------------
export function positionFitCoef(champion, position) {
  if (champion.primary === position) return 1.0;
  if (champion.secondary?.includes(position)) return 0.7;
  return 0.4;
}

// -------------------------------------------------------------
// 有效熟練度 = 原始熟練度 × 位置適配係數（0-100）
// -------------------------------------------------------------
export function effectiveProficiency(character, championId, position) {
  const champ = getChampion(championId);
  const entry = character.champions[championId];
  if (!champ || !entry) return 0;
  return entry.proficiency * positionFitCoef(champ, position);
}

// -------------------------------------------------------------
// 訓練：花訓練點數提升熟練度，越高越難漲（漸進遞減）
// 能力值(意識/版本適應力)影響訓練效率
// -------------------------------------------------------------
export function trainChampion(character, championId, points, currentStageIndex) {
  if (!character.champions[championId]) {
    character.champions[championId] = { proficiency: 0, lastPracticedStage: currentStageIndex };
  }
  const entry = character.champions[championId];
  const efficiency =
    1 + (character.stats["意識"] - 50) / 200 + (character.stats["版本適應力"] - 50) / 200;

  for (let i = 0; i < points; i++) {
    const diminish = 1 - entry.proficiency / 120; // 越接近滿熟練，單點效益越低
    const gain = clamp(6 * efficiency * Math.max(diminish, 0.15), 0.5, 8);
    entry.proficiency = clamp(entry.proficiency + gain, 0, 100);
  }
  entry.lastPracticedStage = currentStageIndex;
}

// -------------------------------------------------------------
// 遺忘機制：超過保鮮期(2個賽段)沒練，機率性衰退，有下限(30%)
// -------------------------------------------------------------
export function decayChampionProficiency(character, currentStageIndex, runtimeRng) {
  for (const [id, entry] of Object.entries(character.champions)) {
    const gap = currentStageIndex - entry.lastPracticedStage;
    if (gap <= 2) continue;
    const decayProb = clamp(0.1 * (gap - 2), 0, 0.5);
    if (runtimeRng() < decayProb) {
      const floor = entry.peakProficiency ? entry.peakProficiency * 0.3 : entry.proficiency * 0.3;
      entry.peakProficiency = Math.max(entry.peakProficiency ?? entry.proficiency, entry.proficiency);
      const drop = entry.proficiency * (0.05 + runtimeRng() * 0.1);
      entry.proficiency = clamp(entry.proficiency - drop, floor, 100);
    }
  }
}

// -------------------------------------------------------------
// 比賽用：從玩家已練過的英雄裡，挑一隻「本場最佳解」
// 綜合考量：位置適配後的有效熟練度 + 是否為本賽段版本英雄
// 就算完全沒練過任何英雄，也回傳 floor 0.4 的基礎值，不會卡死玩家
// -------------------------------------------------------------
export function pickMatchChampionFit(character, position, metaFlavor) {
  const owned = Object.keys(character.champions);
  if (owned.length === 0) return { championId: null, fit: 0.4 };

  let best = { championId: null, fit: 0.4 };
  for (const id of owned) {
    const champ = getChampion(id);
    if (!champ) continue;
    const eff = effectiveProficiency(character, id, position) / 100; // 0~1
    const metaBonus = champ.flavor === metaFlavor ? 0.15 : 0;
    const fit = clamp(0.4 + eff * 0.7 + metaBonus, 0.4, 1.2);
    if (fit > best.fit) best = { championId: id, fit };
  }
  return best;
}
