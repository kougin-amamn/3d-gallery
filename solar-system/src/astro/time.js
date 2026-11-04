// 時刻の換算。内部時刻は「J2000.0からの経過日数(TT)」で持つ。

export const J2000_JD = 2451545.0;
const MS_PER_DAY = 86400000;
// TT − UTC(2017年以降 69.184 秒)。表示上の影響は無視できるが、明示しておく
const TT_MINUS_UTC_SEC = 69.184;

export const dateToJD = (ms) => ms / MS_PER_DAY + 2440587.5;
export const jdToDate = (jd) => (jd - 2440587.5) * MS_PER_DAY;

/** UTCのミリ秒 → J2000からの日数(TT) */
export const msToDays = (ms) => dateToJD(ms) + TT_MINUS_UTC_SEC / 86400 - J2000_JD;
/** J2000からの日数(TT) → UTCのミリ秒 */
export const daysToMs = (d) => jdToDate(d + J2000_JD - TT_MINUS_UTC_SEC / 86400);
