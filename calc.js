/*
 * 온라인 효율 계산기 계산 (화면과 분리, 브라우저와 node 둘 다에서 씀).
 * - 스테이지 1마리 보상 = 층 기본 보상 x (1 + 보너스 합 % / 100), 보너스는 전부 더함
 * - 요정의 축복: 경험치·골드에 축복 %의 2배 (획득 기록 실측: 25% → 1.5배, 50% → 2배), 정수 없음
 * - 오프라인과 온라인 공통: 요정 x2 (켜진 칸), VIP 사냥 보너스, 길드 스킬, 상점 효과 패키지 (+100)
 * - 온라인만: 음식, 효과 버프 아이템 (이벤트 +100)
 * - 오프라인 처치 수 = (200 + 패키지 20) 마리 / (60 - VIP 시간 감소 - 패키지 10) 초, 광고 배수 = 1 + (20 + VIP + 패키지 20) / 100
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

  /** 오프라인 분당 처치 수 */
  function offlinePerMinute(input) {
    const pkg = input.offlinePackage;
    const kills = OFFLINE.kills + (pkg ? OFFLINE.pkgKills : 0);
    const seconds = OFFLINE.seconds - pick(VIP_TIME_DOWN, input.vip) - (pkg ? OFFLINE.pkgSeconds : 0);
    const ad = input.ad ? 1 + (OFFLINE.adPercent + pick(VIP_AD_UP, input.vip) + (pkg ? OFFLINE.pkgAdPercent : 0)) / 100 : 1;
    return (kills / seconds) * ad * 60;
  }

  /**
   * 자원별 보너스 % : { offline, online }
   * 요정의 축복: 광고 제거면 상시, 아니면 경험치·골드 칸을 광고로 따로 1시간씩 켬.
   * 켜진 칸은 온라인·오프라인 모두 적용 (오프라인은 접속할 때까지 켜져 있어야 함, 실측: 골드만 켜고 4분 → 골드만 x1.518).
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

  const api = { RESOURCES, offlinePerMinute, bonusPercent, rewardLog, breakeven, formatGame, fairyPercent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FloorCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
