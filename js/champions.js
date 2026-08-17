// ============================================================
// champions.js — 英雄資料、位置適配折扣、熟練度養成與遺忘
//
// 完整173隻英雄清單（截至2026/6 Locke上線為止，資料來源：官方發布紀錄）。
// 中文譯名是憑訓練資料整理的最佳猜測，不是直接從Garena TW介面抓取，
// 少數翻譯可能跟遊戲內顯示有出入，你發現錯的直接改 CHAMPIONS 陣列裡的 name 即可。
// 之後 Riot 出新英雄，照這個格式在 RAW 陣列裡加一行就好，不用動其他邏輯。
// ============================================================
import { clamp, runtimeRng } from "./rng.js";

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
  ["Aatrox", "厄薩斯", "上路", ["打野"]],
  ["Camille", "卡蜜兒", "上路", ["輔助"]],
  ["Chogath", "科加斯", "上路", ["輔助"]],
  ["Darius", "達瑞斯", "上路", ["打野"]],
  ["DrMundo", "蒙多醫生", "上路", ["打野"]],
  ["Fiora", "菲歐拉", "上路", []],
  ["Gangplank", "剛普朗克", "上路", ["中路"]],
  ["Garen", "蓋倫", "上路", []],
  ["Gnar", "吶兒", "上路", []],
  ["Gwen", "關", "上路", []],
  ["Illaoi", "伊羅旖", "上路", []],
  ["Irelia", "伊瑞莉雅", "上路", ["中路"]],
  ["Jax", "賈克斯", "上路", ["打野"]],
  ["Jayce", "杰西", "上路", ["中路" , "打野"]],
  ["Kayle", "凱爾", "上路", ["中路"]],
  ["Kennen", "凱能", "上路", ["中路"]],
  ["Kled", "克雷德", "上路", []],
  ["Malphite", "墨菲特", "上路", ["輔助", "中路"]],
  ["Mordekaiser", "魔鬥凱薩", "上路", []],
  ["Nasus", "納瑟斯", "上路", ["中路", "打野"]],
  ["Olaf", "歐拉夫", "上路", ["打野"]],
  ["Ornn", "鄂爾", "上路", []],
  ["Pantheon", "潘森", "上路", ["輔助", "打野", "中路"]],
  ["Quinn", "葵恩", "上路", ["打野"]],
  ["Renekton", "雷尼克頓", "上路", ["打野"]],
  ["Riven", "雷玟", "上路", ["中路"]],
  ["Rumble", "藍寶", "上路", ["中路"]],
  ["Sett", "賽特", "上路", ["輔助"]],
  ["Shen", "慎", "上路", ["輔助"]],
  ["Singed", "辛吉德", "上路", []],
  ["Sion", "賽恩", "上路", ["中路"]],
  ["TahmKench", "貪啃奇", "上路", ["輔助"]],
  ["Teemo", "提摩", "上路", ["打野"]],
  ["Trundle", "特朗德", "上路", ["打野"]],
  ["Tryndamere", "泰達米爾", "上路", []],
  ["Urgot", "烏爾加特", "上路", []],
  ["Volibear", "弗力貝爾", "上路", ["打野"]],
  ["Warwick", "沃維克", "上路", ["打野"]],
  ["MonkeyKing", "悟空", "上路", ["打野"]],
  ["Yorick", "約瑞科", "上路", []],
  ["KSante", "卡桑帝", "上路", []],
  ["Ambessa", "安比薩", "上路", ["打野"]],
  ["Aurora", "歐羅拉", "上路", ["中路"]],
  ["Zaahen", "薩亨", "上路", []],
  ["Locke", "洛克", "中路", []],

  // ---- 打野 ----
  ["Amumu", "阿姆姆", "打野", ["輔助"]],
  ["Belveth", "貝爾薇斯", "打野", []],
  ["Diana", "黛安娜", "打野", ["中路"]],
  ["Ekko", "艾克", "打野", ["中路"]],
  ["Elise", "伊莉絲", "打野", ["輔助"]],
  ["Evelynn", "伊芙琳", "打野", []],
  ["Fiddlesticks", "費德提克", "打野", ["輔助"]],
  ["Gragas", "古拉格斯", "打野", ["上路", "輔助"]],
  ["Graves", "葛雷夫", "打野", []],
  ["Hecarim", "赫克林", "打野", []],
  ["Ivern", "埃爾文", "打野", ["輔助"]],
  ["JarvanIV", "嘉文四世", "打野", []],
  ["Karthus", "卡爾瑟斯", "打野", ["中路", "ADC", "打野"]],
  ["Kayn", "慨影", "打野", []],
  ["Khazix", "卡力斯", "打野", []],
  ["Kindred", "鏡爪", "打野", []],
  ["LeeSin", "李星", "打野", []],
  ["Lillia", "莉莉亞", "打野", []],
  ["Maokai", "茂凱", "打野", ["上路", "輔助"]],
  ["MasterYi", "易大師", "打野", ["上路"]],
  ["Nidalee", "奈德麗", "打野", []],
  ["Nocturne", "夜曲", "打野", []],
  ["Nunu", "努努", "打野", []],
  ["Rammus", "拉姆斯", "打野", []],
  ["RekSai", "雷珂煞", "打野", ["上路"]],
  ["Rengar", "雷葛爾", "打野", ["上路"]],
  ["Sejuani", "史瓦妮", "打野", []],
  ["Shaco", "薩科", "打野", ["輔助"]],
  ["Shyvana", "希瓦娜", "打野", []],
  ["Skarner", "史加納", "打野", []],
  ["Talon", "塔隆", "打野", ["中路"]],
  ["Udyr", "烏迪爾", "打野", ["上路"]],
  ["Vi", "菲艾", "打野", []],
  ["Viego", "維爾戈", "打野", []],
  ["XinZhao", "趙信", "打野", []],
  ["Zac", "札克", "打野", ["上路"]],
  ["Briar", "布蕾爾", "打野", []],

  // ---- 中路 ----
  ["Ahri", "阿璃", "中路", []],
  ["Akali", "阿卡莉", "中路", ["上路"]],
  ["Anivia", "艾妮維亞", "中路", ["上路"]],
  ["Annie", "安妮", "中路", ["輔助"]],
  ["AurelionSol", "翱銳龍獸", "中路", ["ADC"]],
  ["Azir", "阿祈爾", "中路", []],
  ["Cassiopeia", "卡莎碧雅", "中路", ["上路"]],
  ["Corki", "庫奇", "中路", ["ADC"]],
  ["Fizz", "飛斯", "中路", []],
  ["Galio", "加里歐", "中路", ["輔助"]],
  ["Heimerdinger", "漢默丁格", "中路", ["上路", "輔助"]],
  ["Kassadin", "卡薩丁", "中路", []],
  ["Katarina", "卡特蓮娜", "中路", ["ADC"]],
  ["Leblanc", "勒布朗", "中路", []],
  ["Lissandra", "麗珊卓", "中路", []],
  ["Lux", "拉克絲", "中路", ["輔助"]],
  ["Malzahar", "馬爾札哈", "中路", ["輔助"]],
  ["Naafiri", "娜菲芮", "中路", ["打野"]],
  ["Neeko", "妮可", "中路", ["輔助"]],
  ["Orianna", "奧莉安娜", "中路", []],
  ["Qiyana", "姬亞娜", "中路", ["打野"]],
  ["Ryze", "雷茲", "中路", ["上路"]],
  ["Swain", "斯溫", "中路", ["上路", "ADC"]],
  ["Sylas", "賽勒斯", "中路", ["打野", "上路"]],
  ["Syndra", "星朵拉", "中路", ["ADC"]],
  ["Taliyah", "塔莉雅", "中路", ["打野", "ADC"]],
  ["Tristana", "崔絲塔娜", "中路", ["ADC", "上路"]],
  ["TwistedFate", "逆命", "中路", []],
  ["Veigar", "維迦", "中路", ["輔助", "ADC"]],
  ["Velkoz", "威寇茲", "中路", ["輔助", "ADC"]],
  ["Vex", "薇可絲", "中路", []],
  ["Viktor", "維克特", "中路", ["ADC"]],
  ["Vladimir", "弗拉迪米爾", "中路", ["上路", "ADC"]],
  ["Xerath", "齊勒斯", "中路", ["輔助", "ADC"]],
  ["Yasuo", "犽宿", "中路", ["上路", "ADC"]],
  ["Yone", "犽凝", "中路", ["上路"]],
  ["Zed", "劫", "中路", ["打野"]],
  ["Ziggs", "希格斯", "中路", ["輔助", "ADC"]],
  ["Zoe", "柔依", "中路", []],
  ["Hwei", "赫威", "中路", ["輔助", "ADC"]],
  ["Mel", "梅爾", "中路", ["輔助", "ADC"]],
  ["Akshan", "埃可尚", "中路", ["ADC"]],

  // ---- ADC ----
  ["Aphelios", "亞菲利歐", "ADC", []],
  ["Ashe", "艾希", "ADC", ["輔助"]],
  ["Caitlyn", "凱特琳", "ADC", []],
  ["Draven", "達瑞文", "ADC", []],
  ["Ezreal", "伊澤瑞爾", "ADC", []],
  ["Jhin", "燼", "ADC", []],
  ["Jinx", "吉茵珂絲", "ADC", []],
  ["Kaisa", "凱莎", "ADC", []],
  ["Kalista", "克黎思妲", "ADC", []],
  ["KogMaw", "寇格魔", "ADC", ["輔助"]],
  ["Lucian", "路西恩", "ADC", []],
  ["MissFortune", "好運姐", "ADC", ["輔助"]],
  ["Nilah", "淣菈", "ADC", []],
  ["Samira", "煞蜜拉", "ADC", []],
  ["Senna", "姍娜", "ADC", ["輔助"]],
  ["Sivir", "希維爾", "ADC", []],
  ["Smolder", "史矛德", "ADC", ["中路"]],
  ["Twitch", "圖奇", "ADC", []],
  ["Varus", "法洛士", "ADC", ["上路"]],
  ["Vayne", "汎", "ADC", ["上路"]],
  ["Xayah", "剎雅", "ADC", []],
  ["Zeri", "婕莉", "ADC", []],
  ["Yunara", "尤娜拉", "ADC", []],

  // ---- 輔助 ----
  ["Alistar", "亞歷斯塔", "輔助", []],
  ["Bard", "巴德", "輔助", []],
  ["Blitzcrank", "布里茨", "輔助", []],
  ["Brand", "布蘭德", "輔助", ["中路", "打野"]],
  ["Braum", "布郎姆", "輔助", []],
  ["Janna", "珍娜", "輔助", []],
  ["Karma", "卡瑪", "輔助", ["中路"]],
  ["Leona", "雷歐娜", "輔助", []],
  ["Lulu", "露璐", "輔助", []],
  ["Milio", "米里歐", "輔助", []],
  ["Morgana", "魔甘娜", "輔助", ["中路"]],
  ["Nami", "娜米", "輔助", []],
  ["Nautilus", "納帝魯斯", "輔助", ["上路", "打野"]],
  ["Poppy", "波比", "輔助", ["上路", "打野"]],
  ["Pyke", "派克", "輔助", ["中路", "上路"]],
  ["Rakan", "銳空", "輔助", []],
  ["Rell", "銳兒", "輔助", []],
  ["Renata", "睿娜妲", "輔助", []],
  ["Seraphine", "瑟菈紛", "輔助", ["中路", "ADC"]],
  ["Sona", "索娜", "輔助", []],
  ["Soraka", "索拉卡", "輔助", []],
  ["Taric", "塔里克", "輔助", []],
  ["Thresh", "瑟雷西", "輔助", []],
  ["Yuumi", "悠咪", "輔助", []],
  ["Zilean", "極靈", "輔助", ["中路"]],
  ["Zyra", "枷蘿", "輔助", ["中路", "打野"]],
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
// 版本英雄抽選：每個位置各自抽「該位置英雄池的固定比例」，
// 而不是固定數字。這樣英雄池小的位置（ADC/輔助）跟英雄池大的位置
// （上路/中路）單次命中率會被拉齊，不會有位置天生佔便宜的問題。
// targetHitRate 抓 12%：單次命中率約11-13%，一年3次重骰累積約
// 30%機率至少中一次版本英雄。
// -------------------------------------------------------------
export function rollMetaChampions(runtimeRng, targetHitRate = 0.12) {
  const positions = ["上路", "打野", "中路", "ADC", "輔助"];
  const result = [];
  for (const pos of positions) {
    const pool = CHAMPIONS.filter((c) => c.primary === pos);
    const count = Math.max(1, Math.round(pool.length * targetHitRate));
    const poolCopy = [...pool];
    for (let i = 0; i < count && poolCopy.length; i++) {
      const idx = Math.floor(runtimeRng() * poolCopy.length);
      result.push(poolCopy[idx].id);
      poolCopy.splice(idx, 1);
    }
  }
  return result;
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
  let efficiency =
    1 + (character.stats["意識"] - 50) / 200 + (character.stats["版本適應力"] - 50) / 200;

  // 峽谷發明家：練英雄特別快；玻璃體質：熟練度成長更快（呼應受傷機率提高的代價）
  if (character.talents?.some((t) => t.id === "rift_inventor")) efficiency *= 1.3;
  if (character.talents?.some((t) => t.id === "glass_body")) efficiency *= 1.15;

  // 三板斧：只有開局那3隻簽名英雄能正常練，練其他英雄效率只剩20%——已經定型，很難再學新英雄
  if (character.talents?.some((t) => t.id === "three_axes") && !entry.signature) {
    efficiency *= 0.2;
  }

  for (let i = 0; i < points; i++) {
    const diminish = 1 - entry.proficiency / 120; // 越接近滿熟練，單點效益越低
    const randomFactor = 0.75 + runtimeRng() * 0.5; // ±25%隨機浮動，不再是每次都固定同一個數字
    const gain = clamp(3 * efficiency * Math.max(diminish, 0.15) * randomFactor, 0.3, 4); // 基準值從6降到3，整體成長速度減半
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
// 綜合考量：位置適配後的有效熟練度 + 是否在本賽段版本英雄清單裡
// metaChampions 是具體的英雄id清單（來自 rollMetaChampions），不是flavor字串
// 就算完全沒練過任何英雄，也回傳 floor 0.4 的基礎值，不會卡死玩家
// -------------------------------------------------------------
export function pickMatchChampionFit(character, position, metaChampions = []) {
  const owned = Object.keys(character.champions);
  if (owned.length === 0) return { championId: null, fit: 0.4 };

  let best = { championId: null, fit: 0.4 };
  for (const id of owned) {
    const champ = getChampion(id);
    if (!champ) continue;
    const eff = effectiveProficiency(character, id, position) / 100; // 0~1
    const metaBonus = metaChampions.includes(id) ? 0.15 : 0;
    const fit = clamp(0.4 + eff * 0.7 + metaBonus, 0.4, 1.2);
    if (fit > best.fit) best = { championId: id, fit };
  }
  return best;
}
