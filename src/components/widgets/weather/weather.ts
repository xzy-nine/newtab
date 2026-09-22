/**
 * 天气小部件的纯逻辑与数据访问。
 *
 * 数据来自 UAPI（https://uapis.cn/docs/api-reference/get-misc-weather）：
 * - `GET /api/v1/misc/weather`：实时天气，可选 extended/forecast/hourly 等模块；
 *   不带 `city` / `adcode` 时由服务端按客户端 IP 自动定位。
 *
 * 认证策略由 `@/lib/uapi` 统一处理：默认匿名（游客按 IP 计积分），
 * 触及限速/额度时自动回退到用户在设置页配置的密钥。
 *
 * 本模块把网络与纯计算分开：解析、映射、校验、URL 构造都是纯函数，
 * 便于单元测试；只有 fetchWeather / fetchForecast 会发请求。
 */

import { readCache, readThroughCache, readStaleCache } from "@/lib/cache-store";
import { UAPI_BASE, uapiFetch } from "@/lib/uapi";

/** 天气接口路径。 */
export const WEATHER_PATH = "/misc/weather";

/** 天气接口完整地址（保留导出，便于文档与调试引用）。 */
export const WEATHER_API = `${UAPI_BASE}${WEATHER_PATH}`;

/** 天气数据缓存时长（毫秒）：10 分钟。 */
export const WEATHER_TTL_MS = 10 * 60 * 1000;

/**
 * 预报数据缓存时长：24 小时。
 * 预报按天更新，且只在展开弹窗时按需拉取，用长 TTL 省配额。
 */
export const FORECAST_TTL_MS = 24 * 60 * 60 * 1000;

/** 预报缓存的键前缀（与 cache-store 的命名空间拼成最终键）。 */
const FORECAST_CACHE_PREFIX = "weather-forecast:";

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
 * 天气现象文本 → emoji。
 *
 * 逐小时与逐天预报的响应里**不含** `weather_icon`（只有当前天气有），
 * 所以这两处必须按文本映射，否则图标会全是问号。
 * 顺序敏感：更具体的词（晴间多云、雨夹雪、大雪）必须排在通用词之前。
 */
const WEATHER_TEXT_EMOJI: ReadonlyArray<readonly [RegExp, string]> = [
  [/晴间多云|partly\s*cloudy/i, "⛅"],
  [/少云|mostly\s*clear/i, "🌤️"],
  [/多云|cloudy/i, "⛅"],
  [/晴|clear|sunny/i, "☀️"],
  [/阴|overcast/i, "☁️"],
  [/雷阵雨|雷暴|thunder/i, "⛈️"],
  [/冰雹|hail/i, "🧊"],
  [/冻雨|freezing\s*rain/i, "🧊"],
  [/雨夹雪|sleet/i, "🌨️"],
  [/暴雨|大暴雨|特大暴雨|rainstorm|torrential/i, "🌊"],
  [/阵雨|shower/i, "🌦️"],
  [/毛毛雨|drizzle/i, "🌦️"],
  [/小雨|中雨|大雨|light\s*rain|moderate\s*rain|heavy\s*rain/i, "🌧️"],
  [/暴雪|blizzard/i, "❄️"],
  [/大雪|中雪|小雪|heavy\s*snow|moderate\s*snow|light\s*snow/i, "🌨️"],
  [/雪|snow/i, "❄️"],
  [/沙尘暴|sandstorm/i, "🏜️"],
  [/扬沙|浮尘|沙尘|dust|sand/i, "💨"],
  [/强浓雾|浓雾|大雾|特强浓雾|fog/i, "🌫️"],
  [/霾|haze|smog/i, "😶‍🌫️"],
  [/雨|rain/i, "🌧️"],
  [/热浪|酷热|高温|hot|heat/i, "🥵"],
  [/寒潮|严寒|寒冷|低温|cold|freez/i, "🥶"],
  [/台风|typhoon/i, "🌀"],
  [/龙卷风|tornado/i, "🌪️"],
];

/** 按天气文本猜一个 emoji；无法识别时返回空串。 */
export function weatherTextEmoji(weather: unknown): string {
  if (typeof weather !== "string" || weather.trim() === "") return "";
  const text = weather.trim();
  for (const [pattern, emoji] of WEATHER_TEXT_EMOJI) {
    if (pattern.test(text)) return emoji;
  }
  return "";
}

/**
 * 取天气图标：优先用接口给的图标代码，缺省时按天气文本兜底。
 * 逐小时/逐天预报只有文本，这是它们能正确显示图标的关键。
 */
export function weatherGlyph(iconCode: unknown, weatherText: unknown): string {
  const byCode = weatherEmoji(iconCode);
  if (byCode !== "❓") return byCode;
  return weatherTextEmoji(weatherText) || "❓";
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

/**
 * 由快照拼出地点名：取最细粒度的一级（区县 > 城市 > 省份）。
 *
 * 接口在按城市名查询时只回上层名（如查「綦江」可能回「重庆城区」），
 * 而按 IP 查询时才会带上 `district`。所以这里优先用 district。
 */
export function snapshotPlaceLabel(snapshot: WeatherSnapshot | undefined): string {
  if (!snapshot) return "";
  return snapshot.district || snapshot.city || snapshot.province || "";
}

/**
 * 磁贴与弹窗共用的地点显示名。
 *
 * 优先显示用户显式设置的城市（与输入一致，避免磁贴与弹窗各显示一个名字），
 * 未设置时才回落到接口返回的最细粒度地名。
 */
export function displayPlaceName(
  configuredCity: string | undefined,
  snapshot: WeatherSnapshot | undefined,
): string {
  const configured = configuredCity?.trim();
  if (configured) return configured;
  return snapshotPlaceLabel(snapshot);
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

async function fetchJson(url: string, options: { force?: boolean } = {}): Promise<unknown> {
  // 统一走 UAPI 客户端：匿名优先、限速时自动升级到密钥、必要时退避重试。
  // 主动刷新（force）会绕过本地节流与去重，立即发一次真实请求。
  return uapiFetch<unknown>(url, { force: options.force });
}

/** 实时天气的缓存键前缀（与 cache-store 命名空间拼成最终键）。 */
const WEATHER_CACHE_PREFIX = "weather-current:";

/** 实时天气缓存键：按城市与语言区分。 */
export function weatherCacheKey(params: { city?: string; adcode?: string; lang?: string }): string {
  const locator = params.adcode?.trim() || params.city?.trim() || "auto";
  const lang = params.lang === "en" ? "en" : "zh";
  return `${WEATHER_CACHE_PREFIX}${lang}:${locator}`;
}

/** 实时天气快照是否可用（防御旧版本或损坏缓存）。 */
export function isUsableWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<WeatherSnapshot>;
  return typeof snapshot.weather === "string" && typeof snapshot.temperature === "number";
}

/**
 * 查询实时天气。
 *
 * - 结果按 `WEATHER_TTL_MS`（10 分钟）缓存，多个磁贴共享同一份数据；
 * - **主动刷新**（`force`）忽略缓存与本地节流，立即联网；
 * - 联网失败时若本地已有（可能已过期的）快照，则继续返回它，
 *   保证界面不会因为一次失败就清空。
 *
 * @throws 无任何可用数据且请求失败时抛出（含 UapiError）。
 */
export async function fetchWeather(params: {
  city?: string;
  adcode?: string;
  lang?: string;
  /** 传 true 表示用户主动刷新：忽略缓存与本地节流。 */
  force?: boolean;
}): Promise<WeatherSnapshot> {
  const url = buildWeatherUrl(params);
  const snapshot = await readThroughCache(
    weatherCacheKey(params),
    async () => {
      const raw = await fetchJson(url, { force: params.force });
      const parsed = normalizeWeatherResponse(raw);
      if (!parsed) throw new Error("INVALID_WEATHER_RESPONSE");
      return parsed;
    },
    WEATHER_TTL_MS,
    isUsableWeatherSnapshot as (value: unknown) => boolean,
    { force: params.force === true },
  );
  return snapshot;
}

/**
 * 查询预报（逐小时 + 逐天）。
 *
 * 结果按 24 小时缓存到 localStorage：浏览器重启后仍在，且不参与云同步。
 * 供展开弹窗按需调用，避免每次渲染都占用免费 API 配额。
 * 主动刷新忽略缓存；联网失败时继续沿用已过期的预报。
 */
export async function fetchForecast(params: {
  city?: string;
  adcode?: string;
  lang?: string;
  /** 传 true 忽略缓存，强制重新拉取。 */
  force?: boolean;
}): Promise<WeatherForecast> {
  const key = forecastCacheKey(params);
  return readThroughCache(
    key,
    async () => {
      const raw = await fetchJson(buildForecastUrl(params), { force: params.force });
      const forecast = normalizeForecastResponse(raw);
      if (!forecast) throw new Error("INVALID_FORECAST_RESPONSE");
      return forecast;
    },
    FORECAST_TTL_MS,
    isUsableForecast as (value: unknown) => boolean,
    { force: params.force === true },
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
 * 读取**已过期**的实时天气快照（不发请求）。
 *
 * 供磁贴首屏兜底：远端暂时拿不到数据时，继续展示上一次的结果。
 */
export function readStaleWeather(params: {
  city?: string;
  adcode?: string;
  lang?: string;
}): WeatherSnapshot | null {
  const cached = readStaleCache<unknown>(weatherCacheKey(params));
  return isUsableWeatherSnapshot(cached) ? cached : null;
}
