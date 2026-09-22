import { describe, it, expect, beforeEach } from "vitest";
import {
  FORECAST_TTL_MS,
  WEATHER_TTL_MS,
  buildForecastUrl,
  buildWeatherUrl,
  displayPlaceName,
  forecastCacheKey,
  formatTemperature,
  hasCachedForecast,
  isWeatherStale,
  normalizeForecastResponse,
  normalizeWeatherResponse,
  parseDailyForecast,
  parseHourlyForecast,
  parseRegion,
  regionToCity,
  snapshotPlaceLabel,
  timeLabel,
  weatherEmoji,
  weatherGlyph,
  weatherTextEmoji,
} from "./weather";

describe("weatherEmoji", () => {
  it("maps known icon codes to their emoji", () => {
    expect(weatherEmoji("100")).toBe("☀️");
    expect(weatherEmoji("104")).toBe("☁️");
    expect(weatherEmoji(305)).toBe("🌧️");
    expect(weatherEmoji("400")).toBe("🌨️");
    expect(weatherEmoji("501")).toBe("🌫️");
  });

  it("falls back to a warning sign for unknown warning-range codes", () => {
    expect(weatherEmoji("1050")).toBe("⚠️");
    expect(weatherEmoji("9999")).toBe("⚠️");
  });

  it("falls back to a question mark for unusable input", () => {
    expect(weatherEmoji("12345")).toBe("⚠️");
    expect(weatherEmoji("")).toBe("❓");
    expect(weatherEmoji(null)).toBe("❓");
    expect(weatherEmoji(undefined)).toBe("❓");
  });
});

describe("parseRegion", () => {
  it("parses country, province and city from the myip region string", () => {
    expect(parseRegion("中国 重庆 重庆")).toEqual({
      country: "中国",
      province: "重庆",
      city: "重庆",
    });
    expect(parseRegion("中国 广东 深圳")).toEqual({
      country: "中国",
      province: "广东",
      city: "深圳",
    });
  });

  it("falls back to the province when no city is present", () => {
    expect(parseRegion("中国 重庆")).toEqual({ country: "中国", province: "重庆", city: "重庆" });
  });

  it("handles a missing country prefix", () => {
    expect(parseRegion("广东 深圳")).toMatchObject({ province: "广东", city: "深圳" });
  });

  it("returns empty fields for unusable input", () => {
    expect(parseRegion("")).toEqual({ country: "", province: "", city: "" });
    expect(parseRegion(undefined)).toEqual({ country: "", province: "", city: "" });
    expect(parseRegion(123)).toEqual({ country: "", province: "", city: "" });
  });

  it("collapses extra whitespace", () => {
    expect(parseRegion("  中国   广东   深圳  ")).toMatchObject({
      province: "广东",
      city: "深圳",
    });
  });
});

describe("regionToCity", () => {
  it("prefers the city, then the province", () => {
    expect(regionToCity({ country: "中国", province: "广东", city: "深圳" })).toBe("深圳");
    expect(regionToCity({ country: "中国", province: "重庆", city: "" })).toBe("重庆");
    expect(regionToCity({ country: "", province: "", city: "" })).toBe("");
  });
});

describe("normalizeWeatherResponse", () => {
  const valid = {
    province: "北京市",
    city: "北京",
    weather: "晴",
    weather_icon: "100",
    temperature: 27,
    wind_direction: "西南风",
    wind_power: "3级",
    humidity: 54,
    report_time: "5 分钟前发布",
    feels_like: 25,
    temp_max: 30,
    temp_min: 18,
    aqi: 56,
    aqi_category: "良",
  };

  it("maps the response into a camelCase snapshot", () => {
    expect(normalizeWeatherResponse(valid)).toEqual({
      province: "北京市",
      city: "北京",
      district: undefined,
      adcode: undefined,
      weather: "晴",
      weatherIcon: "100",
      temperature: 27,
      windDirection: "西南风",
      windPower: "3级",
      humidity: 54,
      reportTime: "5 分钟前发布",
      feelsLike: 25,
      tempMax: 30,
      tempMin: 18,
      aqi: 56,
      aqiCategory: "良",
    });
  });

  it("keeps zero and negative temperatures", () => {
    expect(normalizeWeatherResponse({ ...valid, temperature: 0 })?.temperature).toBe(0);
    expect(normalizeWeatherResponse({ ...valid, temperature: -12 })?.temperature).toBe(-12);
  });

  it("accepts numeric strings from the API", () => {
    const snapshot = normalizeWeatherResponse({ ...valid, temperature: "18.3" });
    expect(snapshot?.temperature).toBe(18.3);
  });

  it("returns null when weather or temperature is missing", () => {
    expect(normalizeWeatherResponse({ ...valid, weather: undefined })).toBeNull();
    expect(normalizeWeatherResponse({ ...valid, temperature: undefined })).toBeNull();
    expect(normalizeWeatherResponse({ ...valid, weather: "" })).toBeNull();
    expect(normalizeWeatherResponse(null)).toBeNull();
    expect(normalizeWeatherResponse("nope")).toBeNull();
  });
});

describe("buildWeatherUrl", () => {
  it("uses city when no adcode is given", () => {
    const url = buildWeatherUrl({ city: "北京" });
    expect(url).toContain("city=%E5%8C%97%E4%BA%AC");
    expect(url).toContain("extended=true");
    expect(url).toContain("forecast=true");
    expect(url).not.toContain("adcode=");
  });

  it("prefers adcode over city", () => {
    const url = buildWeatherUrl({ city: "北京", adcode: "110000" });
    expect(url).toContain("adcode=110000");
    expect(url).not.toContain("city=");
  });

  it("omits location parameters to let the API use IP geolocation", () => {
    const url = buildWeatherUrl({});
    expect(url).not.toContain("city=");
    expect(url).not.toContain("adcode=");
  });

  it("passes a supported lang and ignores unsupported values", () => {
    expect(buildWeatherUrl({ city: "北京", lang: "en" })).toContain("lang=en");
    expect(buildWeatherUrl({ city: "北京", lang: "fr" })).not.toContain("lang=");
  });

  it("trims whitespace and ignores blank values", () => {
    expect(buildWeatherUrl({ city: "  北京  " })).toContain("city=%E5%8C%97%E4%BA%AC");
    expect(buildWeatherUrl({ city: "   " })).not.toContain("city=");
  });
});

describe("isWeatherStale", () => {
  const now = 1_000_000_000;

  it("is stale when there is no timestamp", () => {
    expect(isWeatherStale(undefined, now)).toBe(true);
    expect(isWeatherStale("yesterday", now)).toBe(true);
  });

  it("is fresh within the TTL and stale after it", () => {
    expect(isWeatherStale(now - 1000, now)).toBe(false);
    expect(isWeatherStale(now - WEATHER_TTL_MS + 1, now)).toBe(false);
    expect(isWeatherStale(now - WEATHER_TTL_MS, now)).toBe(true);
  });
});

describe("formatTemperature / snapshotPlaceLabel", () => {
  it("rounds temperatures and appends the degree sign", () => {
    expect(formatTemperature(18.3)).toBe("18°");
    expect(formatTemperature(-1.6)).toBe("-2°");
    expect(formatTemperature(0)).toBe("0°");
  });

  it("labels a snapshot by the finest available name", () => {
    const base = normalizeWeatherResponse({ weather: "晴", temperature: 1 })!;
    // 有区县时优先显示区县（按 IP 查询才会带上）
    expect(
      snapshotPlaceLabel({ ...base, district: "綦江区", city: "重庆城区", province: "重庆市" }),
    ).toBe("綦江区");
    expect(snapshotPlaceLabel({ ...base, city: "北京", province: "北京市" })).toBe("北京");
    expect(snapshotPlaceLabel({ ...base, city: "", province: "北京市" })).toBe("北京市");
    expect(snapshotPlaceLabel(undefined)).toBe("");
  });
});

describe("displayPlaceName", () => {
  const base = normalizeWeatherResponse({ weather: "晴", temperature: 1 })!;

  it("prefers the city the user configured so tile and popup agree", () => {
    // 用户设置了「綦江」，接口回的是上层名「重庆城区」——应显示用户设置的名字
    expect(displayPlaceName("綦江", { ...base, city: "重庆城区", province: "重庆市" })).toBe(
      "綦江",
    );
  });

  it("falls back to the API name when no city is configured", () => {
    expect(displayPlaceName("", { ...base, district: "綦江区", city: "重庆城区" })).toBe("綦江区");
    expect(displayPlaceName(undefined, { ...base, city: "北京" })).toBe("北京");
  });

  it("ignores blank configured values", () => {
    expect(displayPlaceName("   ", { ...base, city: "北京" })).toBe("北京");
  });

  it("returns an empty string when nothing is available", () => {
    expect(displayPlaceName("", undefined)).toBe("");
  });
});

describe("weatherTextEmoji / weatherGlyph", () => {
  it("maps weather text to an emoji when no icon code exists", () => {
    expect(weatherTextEmoji("晴")).toBe("☀️");
    expect(weatherTextEmoji("多云")).toBe("⛅");
    expect(weatherTextEmoji("阴")).toBe("☁️");
    expect(weatherTextEmoji("小雨")).toBe("🌧️");
    expect(weatherTextEmoji("雷阵雨")).toBe("⛈️");
    expect(weatherTextEmoji("小雪")).toBe("🌨️");
  });

  it("prefers the more specific phrase", () => {
    // 「晴间多云」不能命中「晴」
    expect(weatherTextEmoji("晴间多云")).toBe("⛅");
    // 「雨夹雪」不能命中「雨」
    expect(weatherTextEmoji("雨夹雪")).toBe("🌨️");
  });

  it("returns an empty string for unknown or empty text", () => {
    expect(weatherTextEmoji("")).toBe("");
    expect(weatherTextEmoji("未知现象")).toBe("");
    expect(weatherTextEmoji(undefined)).toBe("");
  });

  it("uses the icon code when present", () => {
    expect(weatherGlyph("100", "小雨")).toBe("☀️");
    expect(weatherGlyph(305, "晴")).toBe("🌧️");
  });

  it("falls back to text for the forecast sections that omit weather_icon", () => {
    // 逐小时/逐天响应里没有 weather_icon，这正是此前图标全为问号的原因
    expect(weatherGlyph(undefined, "多云")).toBe("⛅");
    expect(weatherGlyph("", "中雨")).toBe("🌧️");
  });

  it("still yields a placeholder when neither is usable", () => {
    expect(weatherGlyph(undefined, "未知现象")).toBe("❓");
    expect(weatherGlyph(undefined, undefined)).toBe("❓");
  });
});

describe("timeLabel", () => {
  it("extracts HH:MM from ISO and plain timestamps", () => {
    expect(timeLabel("2026-02-19T17:00:00+0900")).toBe("17:00");
    expect(timeLabel("2026-02-19 09:05")).toBe("09:05");
    expect(timeLabel("7:30")).toBe("07:30");
  });

  it("returns the raw value when no time is present", () => {
    expect(timeLabel("明天")).toBe("明天");
    expect(timeLabel(undefined)).toBe("");
  });
});

describe("parseHourlyForecast", () => {
  it("keeps usable entries and drops malformed ones", () => {
    const hourly = parseHourlyForecast([
      { time: "2026-02-19T17:00:00+0900", temperature: 8, weather: "晴", pop: 10 },
      { time: "2026-02-19T18:00:00+0900" }, // 缺温度
      { temperature: 9 }, // 缺时间
      null,
    ]);
    expect(hourly).toHaveLength(1);
    expect(hourly[0]).toMatchObject({
      time: "2026-02-19T17:00:00+0900",
      label: "17:00",
      temperature: 8,
      weather: "晴",
      pop: 10,
    });
  });

  it("returns an empty array for non-arrays", () => {
    expect(parseHourlyForecast(undefined)).toEqual([]);
    expect(parseHourlyForecast({})).toEqual([]);
  });
});

describe("parseDailyForecast", () => {
  it("parses days with temperature range and sun times", () => {
    const daily = parseDailyForecast([
      {
        date: "2026-02-19",
        week: "星期四",
        temp_max: 14,
        temp_min: -1,
        weather_day: "晴",
        weather_night: "多云",
        sunrise: "06:52",
        sunset: "17:56",
      },
      { week: "星期五" }, // 缺日期
    ]);
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({
      date: "2026-02-19",
      week: "星期四",
      tempMax: 14,
      tempMin: -1,
      weatherDay: "晴",
      weatherNight: "多云",
      sunrise: "06:52",
      sunset: "17:56",
    });
  });
});

describe("normalizeForecastResponse", () => {
  it("returns null when neither hourly nor daily data is usable", () => {
    expect(normalizeForecastResponse({})).toBeNull();
    expect(normalizeForecastResponse(null)).toBeNull();
    expect(normalizeForecastResponse({ hourly_forecast: [], forecast: [] })).toBeNull();
  });

  it("returns whichever section is present", () => {
    const onlyDaily = normalizeForecastResponse({
      forecast: [{ date: "2026-02-19", temp_max: 5, temp_min: 1 }],
    });
    expect(onlyDaily?.hourly).toEqual([]);
    expect(onlyDaily?.daily).toHaveLength(1);

    const onlyHourly = normalizeForecastResponse({
      hourly_forecast: [{ time: "2026-02-19T17:00:00+0900", temperature: 8 }],
    });
    expect(onlyHourly?.hourly).toHaveLength(1);
    expect(onlyHourly?.daily).toEqual([]);
  });
});

describe("forecast URL and cache key", () => {
  it("enables the hourly module on top of the weather query", () => {
    const url = buildForecastUrl({ city: "北京" });
    expect(url).toContain("hourly=true");
    expect(url).toContain("forecast=true");
    expect(url).toContain("city=%E5%8C%97%E4%BA%AC");
  });

  it("separates cache entries by city and language", () => {
    expect(forecastCacheKey({ city: "北京", lang: "zh" })).toBe("weather-forecast:zh:北京");
    expect(forecastCacheKey({ city: "北京", lang: "en" })).toBe("weather-forecast:en:北京");
    expect(forecastCacheKey({ city: "上海", lang: "zh" })).toBe("weather-forecast:zh:上海");
    // 无城市时归入 auto（走 IP 定位）
    expect(forecastCacheKey({})).toBe("weather-forecast:zh:auto");
  });

  it("prefers adcode in the cache key", () => {
    expect(forecastCacheKey({ city: "北京", adcode: "110000" })).toBe("weather-forecast:zh:110000");
  });
});

describe("hasCachedForecast", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is false with an empty cache", () => {
    expect(hasCachedForecast({ city: "北京" })).toBe(false);
  });

  it("is true right after writing a forecast", () => {
    localStorage.setItem(
      `newtab:cache:${forecastCacheKey({ city: "北京" })}`,
      JSON.stringify({
        savedAt: Date.now(),
        ttl: FORECAST_TTL_MS,
        value: { hourly: [], daily: [{ date: "2026-02-19" }], fetchedAt: Date.now() },
      }),
    );
    expect(hasCachedForecast({ city: "北京" })).toBe(true);
    // 其他城市互不影响
    expect(hasCachedForecast({ city: "上海" })).toBe(false);
  });
});
