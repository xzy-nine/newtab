/**
 * 天气小部件的纯逻辑与数据访问。
 *
 * 数据来自 UAPI（https://uapis.cn/docs/api-reference/get-misc-weather）：
 * - `GET /api/v1/misc/weather`：实时天气，可选 extended/forecast 等模块；
 * - `GET /api/v1/network/myip`：按 IP 定位，用于预填城市。
 *
 * 本模块把网络与纯计算分开：解析、映射、校验、URL 构造都是纯函数，
 * 便于单元测试；只有 fetchWeather / fetchForecast / fetchMyRegion 会发请求。
 */

import { readCache, readThroughCache, removeCache } from "@/lib/cache-store";

const WEATHER_API = "https://uapis.cn/api/v1/misc/weather";
const MYIP_API = "https://uapis.cn/api/v1/network/myip";

/** 天气数据缓存时长（毫秒）：10 分钟。 */
export const WEATHER_TTL_MS = 10 * 60 * 1000;

/**
 * 预报数据缓存时长：24 小时。
 * 预报按天更新，且只在展开弹窗时按需拉取，用长 TTL 省配额。
 */
export const FORECAST_TTL_MS = 24 * 60 * 60 * 1000;

/** 预报缓存的键前缀（与 cache-store 的命名空间拼成最终键）。 */
const FORECAST_CACHE_PREFIX = "weather-forecast:";

/** 网络请求超时（毫秒）。 */
const FETCH_TIMEOUT_MS = 12 * 1000;

/** 一次天气查询的结果快照（已规范化为 camelCase）。 */
export interface WeatherSnapshot {
  province: string;
  city: string;
  district?: string;
  adcode?: string;
  /** 天气现象文本，如「晴」（非固定枚举）。 */
  weather: string;
  /** 天气图标代码，如 "100"。 */
  weatherIcon: string;
  /** 当前温度 °C。 */
  temperature: number;
  windDirection?: string;
  windPower?: string;
  humidity?: number;
  reportTime?: string;
  feelsLike?: number;
  tempMax?: number;
  tempMin?: number;
  aqi?: number;
  aqiCategory?: string;
}

/** IP 定位解析出的行政区。 */
export interface RegionInfo {
  country: string;
  province: string;
  city: string;
}

/** 天气图标代码 → emoji（取自官方枚举表）。 */
const WEATHER_EMOJI: Record<string, string> = {
  // 晴 / 多云 / 阴
  "100": "☀️",
  "101": "⛅",
  "102": "🌤️",
  "103": "⛅",
  "104": "☁️",
  // 夜间
  "150": "🌙",
  "151": "🌙",
  "152": "🌙",
  "153": "🌙",
  // 雨
  "300": "🌦️",
  "301": "🌧️",
  "302": "⛈️",
  "303": "⛈️",
  "304": "⛈️",
  "305": "🌧️",
  "306": "🌧️",
  "307": "🌧️",
  "308": "🌧️",
  "309": "🌦️",
  "310": "🌊",
  "311": "🌊",
  "312": "🌊",
  "313": "🧊",
  "314": "🌧️",
  "315": "🌧️",
  "316": "🌊",
  "317": "🌊",
  "318": "🌊",
  "350": "🌙",
  "351": "🌙",
  "399": "🌧️",
  // 雪
  "400": "🌨️",
  "401": "🌨️",
  "402": "❄️",
  "403": "❄️",
  "404": "🌨️",
  "405": "🌨️",
  "406": "🌨️",
  "407": "🌨️",
  "408": "🌨️",
  "409": "❄️",
  "410": "❄️",
  "456": "🌙",
  "457": "🌙",
  "499": "❄️",
  // 雾 / 霾 / 沙尘
  "500": "🌫️",
  "501": "🌫️",
  "502": "😶‍🌫️",
  "503": "💨",
  "504": "💨",
  "507": "🏜️",
  "508": "🏜️",
  "509": "🌫️",
  "510": "🌫️",
  "511": "😶‍🌫️",
  "512": "😶‍🌫️",
  "513": "😶‍🌫️",
  "514": "🌫️",
  "515": "🌫️",
  // 月相
  "800": "🌑",
  "801": "🌒",
  "802": "🌓",
  "803": "🌔",
  "804": "🌕",
  "805": "🌖",
  "806": "🌗",
  "807": "🌘",
  // 体感
  "900": "🥵",
  "901": "🥶",
  "999": "❓",
  "9999": "⚠️",
  // 灾害 / 预警
  "1001": "🌀",
  "1002": "🌪️",
  "1003": "🌊",
  "1004": "❄️",
  "1005": "🥶",
  "1006": "💨",
  "1007": "🏜️",
  "1008": "🧊",
  "1009": "🌡️",
  "1010": "🥵",
  "1014": "⚡",
  "1015": "🧊",
  "1016": "🥶",
};

/**
 * 天气图标代码映射为 emoji。
 * 未知代码按区间兜底：1000 以上属预警/灾害类，统一用警示图标。
 */
export function weatherEmoji(iconCode: unknown): string {
  if (typeof iconCode !== "string" && typeof iconCode !== "number") return "❓";
  const code = String(iconCode).trim();
  if (!code) return "❓";
  const exact = WEATHER_EMOJI[code];
  if (exact) return exact;
  const numeric = Number(code);
  if (Number.isFinite(numeric) && numeric >= 1000) return "⚠️";
  return "❓";
}

/**
 * 解析 IP 定位返回的 `region` 字段（形如 "中国 重庆 重庆" / "中国 广东 深圳"）。
 *
 * 只取到"大行政区"一级：省份与城市。城市缺省时回落到省份，
 * 因为天气接口的 `city` 对直辖市同样接受省份名。
 */
export function parseRegion(region: unknown): RegionInfo {
  const empty: RegionInfo = { country: "", province: "", city: "" };
  if (typeof region !== "string") return empty;
  const parts = region.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return empty;

  let rest = parts;
  let country = "";
  if (parts.length > 1 && /^(中国|china)$/i.test(parts[0]!)) {
    country = parts[0]!;
    rest = parts.slice(1);
  }
  if (rest.length === 0) return { country, province: "", city: "" };

  const province = rest[0]!;
  const city = rest.length > 1 ? rest[1]! : province;
  return { country, province, city };
}

/** 由 IP 定位结果选出适合查询天气的城市名。 */
export function regionToCity(region: RegionInfo): string {
  return region.city || region.province || "";
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * 把天气接口的响应规范化为快照；缺少必要字段（天气与温度）时返回 null。
 */
export function normalizeWeatherResponse(raw: unknown): WeatherSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const weather = str(r.weather);
  const temperature = num(r.temperature);
  // 温度可以为 0，负数也合法，所以只判断是否为有限数字。
  if (!weather || temperature === undefined) return null;

  return {
    province: str(r.province) ?? "",
    city: str(r.city) ?? "",
    district: str(r.district),
    adcode: str(r.adcode),
    weather,
    weatherIcon: str(r.weather_icon) ?? "",
    temperature,
    windDirection: str(r.wind_direction),
    windPower: str(r.wind_power),
    humidity: num(r.humidity),
    reportTime: str(r.report_time),
    feelsLike: num(r.feels_like),
    tempMax: num(r.temp_max),
    tempMin: num(r.temp_min),
    aqi: num(r.aqi),
    aqiCategory: str(r.aqi_category),
  };
}

/** 构造天气查询 URL；city 与 adcode 都为空时不带定位参数（走 IP 自动定位）。 */
export function buildWeatherUrl(params: { city?: string; adcode?: string; lang?: string }): string {
  const search = new URLSearchParams();
  const adcode = params.adcode?.trim();
  const city = params.city?.trim();
  // adcode 优先级高于 city，同时传时按文档由服务端取 adcode。
  if (adcode) search.set("adcode", adcode);
  else if (city) search.set("city", city);

  search.set("extended", "true");
  search.set("forecast", "true");
  if (params.lang === "en" || params.lang === "zh") search.set("lang", params.lang);
  return `${WEATHER_API}?${search.toString()}`;
}

/** 天气数据是否已过期（无时间戳视为过期）。 */
export function isWeatherStale(updatedAt: unknown, now: number, ttlMs = WEATHER_TTL_MS): boolean {
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return true;
  return now - updatedAt >= ttlMs;
}

/** 温度显示：四舍五入到整数并带单位。 */
export function formatTemperature(value: number): string {
  return `${Math.round(value)}°`;
}

/** 由快照拼出地点显示名（城市优先，回落省份）。 */
export function snapshotPlaceLabel(snapshot: WeatherSnapshot | undefined): string {
  if (!snapshot) return "";
  return snapshot.city || snapshot.province || "";
}

/** 逐小时预报的一个时间点。 */
export interface HourlyForecast {
  /** 原始时间字符串（ISO8601 或 "YYYY-MM-DD HH:MM"）。 */
  time: string;
  /** 仅用于显示的 `HH:MM`。 */
  label: string;
  temperature: number;
  weather: string;
  weatherIcon?: string;
  /** 降水概率 %。 */
  pop?: number;
  humidity?: number;
}

/** 逐天预报的一天。 */
export interface DailyForecast {
  date: string;
  /** 星期，如「星期四」。 */
  week?: string;
  tempMax?: number;
  tempMin?: number;
  weatherDay?: string;
  weatherNight?: string;
  /** 白天天气图标代码（服务端在预报项里返回时才解析得到）。 */
  weatherIcon?: string;
  sunrise?: string;
  sunset?: string;
}

/** 展开弹窗使用的预报数据。 */
export interface WeatherForecast {
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  /** 拉取时间戳。 */
  fetchedAt: number;
}

/** 从时间字符串里取出 `HH:MM`，解析失败时原样返回。 */
export function timeLabel(value: unknown): string {
  const raw = str(value);
  if (!raw) return "";
  const match = /(\d{1,2}):(\d{2})/.exec(raw);
  if (!match) return raw;
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

/** 解析逐小时预报。 */
export function parseHourlyForecast(raw: unknown): HourlyForecast[] {
  if (!Array.isArray(raw)) return [];
  const result: HourlyForecast[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const temperature = num(r.temperature);
    const time = str(r.time);
    if (temperature === undefined || !time) continue;
    result.push({
      time,
      label: timeLabel(time),
      temperature,
      weather: str(r.weather) ?? "",
      weatherIcon: str(r.weather_icon),
      pop: num(r.pop),
      humidity: num(r.humidity),
    });
  }
  return result;
}

/** 解析逐天预报。 */
export function parseDailyForecast(raw: unknown): DailyForecast[] {
  if (!Array.isArray(raw)) return [];
  const result: DailyForecast[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const date = str(r.date);
    if (!date) continue;
    result.push({
      date,
      week: str(r.week),
      tempMax: num(r.temp_max),
      tempMin: num(r.temp_min),
      weatherDay: str(r.weather_day),
      weatherNight: str(r.weather_night),
      weatherIcon: str(r.weather_icon),
      sunrise: str(r.sunrise),
      sunset: str(r.sunset),
    });
  }
  return result;
}

/** 把预报响应规范化为弹窗所需结构；完全没有可用数据时返回 null。 */
export function normalizeForecastResponse(raw: unknown): WeatherForecast | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const hourly = parseHourlyForecast(r.hourly_forecast);
  const daily = parseDailyForecast(r.forecast);
  if (hourly.length === 0 && daily.length === 0) return null;
  return { hourly, daily, fetchedAt: Date.now() };
}

/** 构造预报查询 URL：额外开启 hourly 模块。 */
export function buildForecastUrl(params: {
  city?: string;
  adcode?: string;
  lang?: string;
}): string {
  const base = buildWeatherUrl(params);
  return `${base}&hourly=true`;
}

/** 预报缓存键：按城市与语言区分。 */
export function forecastCacheKey(params: {
  city?: string;
  adcode?: string;
  lang?: string;
}): string {
  const locator = params.adcode?.trim() || params.city?.trim() || "auto";
  const lang = params.lang === "en" ? "en" : "zh";
  return `${FORECAST_CACHE_PREFIX}${lang}:${locator}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * 查询实时天气。
 * @throws 网络错误、超时、非 2xx，或响应缺少必要字段。
 */
export async function fetchWeather(params: {
  city?: string;
  adcode?: string;
  lang?: string;
}): Promise<WeatherSnapshot> {
  const raw = await fetchJson(buildWeatherUrl(params));
  const snapshot = normalizeWeatherResponse(raw);
  if (!snapshot) throw new Error("INVALID_WEATHER_RESPONSE");
  return snapshot;
}

/**
 * 查询预报（逐小时 + 逐天）。
 *
 * 结果按 24 小时缓存到 localStorage：浏览器重启后仍在，且不参与云同步。
 * 供展开弹窗按需调用，避免每次渲染都占用免费 API 配额。
 */
export async function fetchForecast(params: {
  city?: string;
  adcode?: string;
  lang?: string;
  /** 传 true 忽略缓存，强制重新拉取。 */
  force?: boolean;
}): Promise<WeatherForecast> {
  const key = forecastCacheKey(params);
  if (params.force) removeCache(key);
  return readThroughCache(
    key,
    async () => {
      const raw = await fetchJson(buildForecastUrl(params));
      const forecast = normalizeForecastResponse(raw);
      if (!forecast) throw new Error("INVALID_FORECAST_RESPONSE");
      return forecast;
    },
    FORECAST_TTL_MS,
    isUsableForecast as (value: unknown) => boolean,
  );
}

/** 预报缓存是否已有可用数据（用于不请求就判断能否秒开弹窗）。 */
export function hasCachedForecast(params: {
  city?: string;
  adcode?: string;
  lang?: string;
}): boolean {
  const cached = readCache<unknown>(forecastCacheKey(params));
  return isUsableForecast(cached);
}

/**
 * 结构校验：缓存里可能是旧版本写入或外部损坏的数据，
 * 直接拿去渲染会在读取 hourly/daily 时崩溃。
 */
export function isUsableForecast(value: unknown): value is WeatherForecast {
  if (!value || typeof value !== "object") return false;
  const f = value as Partial<WeatherForecast>;
  return Array.isArray(f.hourly) && Array.isArray(f.daily);
}

/**
 * 按当前 IP 解析所在行政区，用于预填城市。
 * @throws 网络错误、超时或非 2xx。
 */
export async function fetchMyRegion(): Promise<RegionInfo> {
  const raw = await fetchJson(MYIP_API);
  const record = (raw ?? {}) as Record<string, unknown>;
  const region = parseRegion(record.region);
  // myip 的 district 仅在商业数据源返回，存在时优先作为城市。
  const district = str(record.district);
  if (district && district !== region.city) {
    return { ...region, city: region.city || district };
  }
  return region;
}
