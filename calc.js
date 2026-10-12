/*
 * 온라인 효율 계산기 계산 (화면과 분리, 브라우저와 node 둘 다에서 씀).
 * - 스테이지 1마리 보상 = 층 기본 보상 x (1 + 보너스 합 % / 100), 보너스는 전부 더함
 * - 요정의 축복: 경험치·골드에 축복 %의 2배 (획득 기록 실측: 25% → 1.5배, 50% → 2배), 정수 없음
 * - 오프라인과 온라인 공통: 요정 x2 (켜진 칸), VIP 사냥 보너스, 길드 스킬, 상점 효과 패키지 (+100)
 * - 온라인만: 음식, 효과 버프 아이템 (이벤트 +100)
 * - 오프라인 처치 수 = (200 + 패키지 20) 마리 / (60 - VIP 시간 감소 - 패키지 10) 초, 광고 배수 = 1 + (20 + VIP + 패키지 20) / 100
 * - 목표 레벨까지 시간 = (목표까지 누적 필요 경험치 - 지금 모은 경험치) / 그 층의 분당 경험치 (1마리 경험치 = 골드)
 */
(function (root) {
  const RESOURCES = ['exp', 'gold', 'ess'];
  const OFFLINE = { kills: 200, seconds: 60, adPercent: 20, pkgKills: 20, pkgSeconds: 10, pkgAdPercent: 20 };
  const VIP_TIME_DOWN = [[17, 14], [5, 4]];
  const VIP_AD_UP = [[11, 40], [6, 10]];
  const VIP_ONLINE = { exp: [12, 15, 20, 50], gold: [13, 15, 21, 50], ess: [14, 15, 22, 50] };
  const FAIRY = { base: 25, perLevel: 0.1, max: 50, times: 2 };
  const EFFECT_PACKAGE_PERCENT = 100;
  const EVENT_PERCENT = 100;

  function pick(table, level) {
    const hit = table.find(([minLevel]) => level >= minLevel);
    return hit ? hit[1] : 0;
  }

  function fairyPercent(level, on) {
    if (!on || level < 1) return 0;
    return Math.min(FAIRY.max, FAIRY.base + FAIRY.perLevel * (level - 1));
  }

  function vipOnline(vip, resource) {
    const [firstLevel, firstValue, secondLevel, secondValue] = VIP_ONLINE[resource];
    return vip >= secondLevel ? secondValue : vip >= firstLevel ? firstValue : 0;
  }

  /** 오프라인 분당 처치 수 (alwaysAd = 광고 보상 칸과 상관없이 광고 배수를 넣음, 도시락용) */
  function offlinePerMinute(input, alwaysAd = false) {
    const pkg = input.offlinePackage;
    const kills = OFFLINE.kills + (pkg ? OFFLINE.pkgKills : 0);
    const seconds = OFFLINE.seconds - pick(VIP_TIME_DOWN, input.vip) - (pkg ? OFFLINE.pkgSeconds : 0);
    const withAd = alwaysAd || input.ad;
    const ad = withAd ? 1 + (OFFLINE.adPercent + pick(VIP_AD_UP, input.vip) + (pkg ? OFFLINE.pkgAdPercent : 0)) / 100 : 1;
    return (kills / seconds) * ad * 60;
  }

  /*
   * 도시락 (먹으면 오프라인 보상을 그 시간만큼 바로 받음, 중급 1시간). 먹은 층이 아니라 최고 층 기준.
   * 보상 1분 = 오프라인 처치 (광고 배수 항상 포함) x 최고 층 1마리 x 오프라인 보너스
   */
  const LUNCHBOX_MINUTES = { medium: 60 };
  function lunchboxPerMinuteLog(data, input, highestFloor, resource) {
    const bonus = bonusPercent(input, resource);
    return Math.log10(offlinePerMinute(input, true)) + rewardLog(data, highestFloor, resource) + Math.log10(1 + bonus.offline / 100);
  }

  /**
   * 자원별 보너스 % : { offline, online }
   * 요정의 축복: 광고 제거면 상시, 아니면 경험치·골드 칸을 광고로 따로 1시간씩 켬.
   * 켜진 칸은 온라인·오프라인 모두 적용. 오프라인은 접속하는 순간 켜져 있으면 전체에, 그 전에 꺼지면 적용 안 됨
   * (실측: 골드만 켜고 4분 → 골드만 x1.518, 켜고 1시간 3분 → 도중에 꺼져 x1).
   */
  function bonusPercent(input, resource) {
    const fairyValue = resource === 'ess' ? 0 : fairyPercent(input.fairyLevel, true) * FAIRY.times;
    const fairy = input.adRemoved || (input.fairyOn && input.fairyOn[resource]) ? fairyValue : 0;
    const common = vipOnline(input.vip, resource) + (input.guild[resource] || 0)
      + (input.effectPackage[resource] ? EFFECT_PACKAGE_PERCENT : 0) + fairy;
    const online = common + (input.food[resource] || 0) + (input.event[resource] ? EVENT_PERCENT : 0);
    return { offline: common, online };
  }

  /** 층 보상 log10 (데이터: 가수 x100 정수 + 지수) */
  function rewardLog(data, floor, resource) {
    const index = floor - 1;
    const key = resource === 'ess' ? 'ess' : 'gold';
    return Math.log10(data[key + 'M'][index]) + data[key + 'E'][index];
  }

  /** 온라인 사냥 층에서 오프라인과 같아지는 분당 처치 수 */
  function breakeven(data, input, floor, resource) {
    const bonus = bonusPercent(input, resource);
    const offlineLog = rewardLog(data, input.offlineFloor, resource) + Math.log10(1 + bonus.offline / 100);
    const onlineLog = rewardLog(data, floor, resource) + Math.log10(1 + bonus.online / 100);
    return offlinePerMinute(input) * Math.pow(10, offlineLog - onlineLog);
  }

  /** 게임 표기: 1000 미만 소수 2자리, 그 위는 A..Z, AA.. 단위 + 소수 2자리 */
  function formatGame(log) {
    if (!isFinite(log)) return '-';
    if (log < 3) return (Math.round(Math.pow(10, log) * 100) / 100).toLocaleString('ko-KR');
    let unit = Math.floor(log / 3);
    let mantissa = Math.pow(10, log - unit * 3);
    if (mantissa >= 999.995) { mantissa /= 1000; unit += 1; }
    let letters;
    if (unit <= 26) letters = String.fromCharCode(64 + unit);
    else {
      const k = unit - 27;
      letters = String.fromCharCode(65 + Math.floor(k / 26)) + String.fromCharCode(65 + (k % 26));
    }
    return mantissa.toFixed(2) + letters;
  }

  /*
   * 계정 레벨업 필요 경험치 (레벨 구간별 식).
   * 값이 1e308 을 넘는 구간이 있어 모두 log10 으로 다룬다.
   */
  const LEVEL_EXP = {
    early: [[1, 1, 20000], [2, 15, 1000], [16, 30, 3000], [31, 148, 8000]],
    midEnd: 7799, midFirst: 3122.93, midStep: 9900, midGrowth: 1.57, midPerLevel: 100,
    highEnd: 140499, highBaseLog: Math.log10(4.1495685767029427) + 20, highBundleBase: 78,
    bundleGrowthLog: Math.log10(1.647715), perLevelRate: 0.0005, roundFrom: 60000, roundDigits: 1000,
    higherEnd: 299999, higherBaseLog: Math.log10(2.63289) + 308, higherBundleBase: 1405,
    topEnd: 315000, topBaseLog: Math.log10(2.225) + 654, topBundleBase: 3000,
    topBundleGrowthLog: Math.log10(1.6485), topInBundleLog: Math.log10(1.05),
    lastBaseLog: Math.log10(8.141) + 686, lastPerLevelLog: Math.log10(1.0004880206850599),
    lastBundleLog: Math.log10(1.5700708684432332),
    bundle: 100, maxSpan: 1000000,
  };
  const midBundleCache = [0, LEVEL_EXP.midFirst];

  /** 149~7799 구간의 묶음 바탕값 d_k: d_1 = 3122.93, d_(j+1) = (d_j + 9900 x j^2) x 1.57 */
  function midBundleBase(bundle) {
    for (let j = midBundleCache.length - 1; j < bundle; j += 1) {
      midBundleCache[j + 1] = (midBundleCache[j] + LEVEL_EXP.midStep * j * j) * LEVEL_EXP.midGrowth;
    }
    return midBundleCache[bundle];
  }

  /** 레벨 L 에서 L+1 로 가는 데 필요한 경험치 (log10) */
  function levelExpLog(level) {
    const E = LEVEL_EXP;
    const early = E.early.find(([from, to]) => level >= from && level <= to);
    if (early) return Math.log10(early[2]);
    const bundle = Math.floor(level / E.bundle);
    const inBundle = level % E.bundle;
    if (level <= E.midEnd) return Math.log10(midBundleBase(bundle) + E.midPerLevel * bundle * bundle * inBundle);
    if (level <= E.highEnd) {
      const log = E.highBaseLog + (bundle - E.highBundleBase) * E.bundleGrowthLog + Math.log10(1 + E.perLevelRate * inBundle);
      if (level < E.roundFrom) return log;
      // 가수를 소수 셋째 자리로 반올림, 지수는 그대로
      const exponent = Math.floor(log);
      return Math.log10(Math.round(Math.pow(10, log - exponent) * E.roundDigits) / E.roundDigits) + exponent;
    }
    if (level <= E.higherEnd) {
      return E.higherBaseLog + (bundle - E.higherBundleBase) * E.bundleGrowthLog + Math.log10(1 + E.perLevelRate * inBundle);
    }
    if (level <= E.topEnd) {
      return E.topBaseLog + (bundle - E.topBundleBase) * E.topBundleGrowthLog + (inBundle / E.bundle) * E.topInBundleLog;
    }
    const past = level - E.topEnd;
    const bundlesPast = Math.floor(past / E.bundle);
    return E.lastBaseLog + (past - bundlesPast) * E.lastPerLevelLog + bundlesPast * E.lastBundleLog;
  }

  /** log10 끼리 더하기 */
  function addLog(a, b) {
    if (!isFinite(a)) return b;
    const high = Math.max(a, b);
    return high + Math.log10(1 + Math.pow(10, Math.min(a, b) - high));
  }

  /**
   * 현재 레벨 (막대 % 만큼 모음) 에서 목표 레벨에 닿기까지 더 필요한 경험치 (log10).
   * 레벨이 비었거나 목표가 현재 이하, 너무 먼 목표면 null.
   */
  function expToTargetLog(currentLevel, currentPercent, targetLevel) {
    if (!(currentLevel >= 1) || !(targetLevel > currentLevel) || targetLevel - currentLevel > LEVEL_EXP.maxSpan) return null;
    let total = -Infinity;
    for (let level = currentLevel; level < targetLevel; level += 1) total = addLog(total, levelExpLog(level));
    const percent = Math.min(Math.max(currentPercent || 0, 0), 100);
    if (percent === 0) return total;
    const collected = levelExpLog(currentLevel) + Math.log10(percent / 100);
    return total + Math.log10(1 - Math.pow(10, collected - total));
  }

  const api = { RESOURCES, offlinePerMinute, bonusPercent, rewardLog, breakeven, formatGame, fairyPercent, levelExpLog, expToTargetLog, LUNCHBOX_MINUTES, lunchboxPerMinuteLog };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FloorCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
