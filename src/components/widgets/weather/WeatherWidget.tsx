import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Droplets, MapPin, RefreshCw, Wind } from "lucide-react";
import { getCurrentLanguage, getMessage } from "@/lib/i18n";
import {
  fetchMyRegion,
  fetchWeather,
  formatTemperature,
  isWeatherStale,
  regionToCity,
  snapshotPlaceLabel,
  weatherEmoji,
  type WeatherSnapshot,
} from "@/components/widgets/weather/weather";

interface WeatherWidgetProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

/** 该 IP 定位只在没有已存城市时执行一次，避免每次渲染都请求。 */
function readCity(data?: Record<string, unknown>): string {
  return typeof data?.city === "string" ? data.city : "";
}

function readSnapshot(data?: Record<string, unknown>): WeatherSnapshot | undefined {
  const raw = data?.snapshot;
  // 存储里的快照可能来自旧版本，字段缺失时按无快照处理。
  if (raw && typeof raw === "object" && typeof (raw as WeatherSnapshot).weather === "string") {
    return raw as WeatherSnapshot;
  }
  return undefined;
}

/**
 * 天气小部件。
 *
 * 数据来自 UAPI 实时天气接口；城市未设置时先用 IP 定位接口预填所在地
 * （取到"大行政区"一级，即省份/城市），再查询天气。
 *
 * 结果连同时间戳一起存入小部件数据，10 分钟内复用缓存，点击右上角可手动刷新。
 */
export function WeatherWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight = 150,
}: WeatherWidgetProps) {
  const [city, setCity] = useState(() => readCity(data));
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | undefined>(() => readSnapshot(data));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const persist = useCallback(
    (next: { city: string; snapshot?: WeatherSnapshot }) => {
      if (!onDataChange) return;
      onDataChange({ city: next.city, snapshot: next.snapshot, updatedAt: Date.now() });
    },
    [onDataChange],
  );

  /** 查询天气；targetCity 为空时交给接口按 IP 自动定位。 */
  const load = useCallback(
    async (targetCity: string) => {
      setLoading(true);
      setError("");
      try {
        const lang = getCurrentLanguage() === "en" ? "en" : "zh";
        const next = await fetchWeather({ city: targetCity || undefined, lang });
        setSnapshot(next);
        setCity(targetCity || next.city);
        persist({ city: targetCity || next.city, snapshot: next });
      } catch (e) {
        setError(
          e instanceof Error && e.message.includes("HTTP 404")
            ? getMessage("weatherCityNotFound", "未找到该城市")
            : getMessage("weatherLoadFailed", "天气获取失败"),
        );
      } finally {
        setLoading(false);
      }
    },
    [persist],
  );

  // 首次挂载后拉取数据。有效缓存已由 useState 初始化直接采用，
  // 这里只在缓存缺失或过期时请求；状态更新都发生在异步流程里。
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const storedCity = readCity(data);
      const storedSnapshot = readSnapshot(data);
      // 有新鲜缓存就不请求（初始 state 已经用了它）。
      if (storedSnapshot && !isWeatherStale(data?.updatedAt, Date.now())) return;

      if (storedCity) {
        await load(storedCity);
        return;
      }

      // 没有城市：先用 IP 定位预填大行政区，再查天气。
      let prefilled = "";
      try {
        prefilled = regionToCity(await fetchMyRegion());
        if (prefilled) setCity(prefilled);
      } catch {
        /* 定位失败就退回接口自身的 IP 定位 */
      }
      await load(prefilled);
    })();
  }, [data, load]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleRefresh = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (loading) return;
      void load(city);
    },
    [city, load, loading],
  );

  const handleEditStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDraft(city);
      setEditing(true);
    },
    [city],
  );

  const handleEditCommit = useCallback(() => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === city) return;
    setCity(next);
    void load(next);
  }, [city, draft, load]);

  const compact = containerWidth <= 150 || containerHeight <= 110;
  const place = snapshotPlaceLabel(snapshot) || city;

  return (
    <div className="weather-widget" style={{ padding: compact ? "6px" : "10px" }}>
      {/* 顶部：地点 + 刷新 */}
      <div className="weather-widget-top">
        {editing ? (
          <input
            ref={inputRef}
            className="weather-widget-input"
            value={draft}
            placeholder={getMessage("weatherCityPlaceholder", "城市，如 北京")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleEditCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEditCommit();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            className="weather-widget-place"
            title={getMessage("weatherChangeCity", "点击修改城市")}
            onClick={handleEditStart}
          >
            <MapPin className="weather-widget-pin" />
            <span className="weather-widget-place-text">
              {place || getMessage("weatherLocating", "定位中...")}
            </span>
          </button>
        )}
        <button
          className="weather-widget-refresh"
          title={getMessage("weatherRefresh", "刷新")}
          onClick={handleRefresh}
        >
          <RefreshCw className={`weather-widget-refresh-icon ${loading ? "is-spinning" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="weather-widget-error">
          <AlertTriangle className="weather-widget-error-icon" />
          <span>{error}</span>
        </div>
      ) : !snapshot ? (
        <div className="weather-widget-loading">
          {loading
            ? getMessage("weatherLoading", "加载中...")
            : getMessage("weatherNoData", "暂无天气数据")}
        </div>
      ) : (
        <>
          {/* 主体：图标 + 温度 + 天气 */}
          <div className="weather-widget-main">
            <span className="weather-widget-emoji">{weatherEmoji(snapshot.weatherIcon)}</span>
            <div className="weather-widget-temp-group">
              <span className="weather-widget-temp">{formatTemperature(snapshot.temperature)}</span>
              <span className="weather-widget-desc">{snapshot.weather}</span>
            </div>
          </div>

          {/* 次要信息：温度区间、体感、湿度、风力 */}
          <div className="weather-widget-meta">
            {snapshot.tempMin !== undefined && snapshot.tempMax !== undefined && (
              <span className="weather-widget-meta-item">
                {formatTemperature(snapshot.tempMin)}~{formatTemperature(snapshot.tempMax)}
              </span>
            )}
            {snapshot.feelsLike !== undefined && (
              <span className="weather-widget-meta-item">
                {getMessage("weatherFeelsLike", "体感")} {formatTemperature(snapshot.feelsLike)}
              </span>
            )}
            {snapshot.humidity !== undefined && (
              <span className="weather-widget-meta-item">
                <Droplets className="weather-widget-meta-icon" />
                {snapshot.humidity}%
              </span>
            )}
            {snapshot.windPower && (
              <span className="weather-widget-meta-item">
                <Wind className="weather-widget-meta-icon" />
                {snapshot.windDirection ? `${snapshot.windDirection} ` : ""}
                {snapshot.windPower}
              </span>
            )}
            {snapshot.aqiCategory && (
              <span className="weather-widget-meta-item">
                AQI {snapshot.aqi ?? "-"}
                {snapshot.aqiCategory ? ` ${snapshot.aqiCategory}` : ""}
              </span>
            )}
          </div>

          {snapshot.reportTime && !compact && (
            <div className="weather-widget-foot">
              <Check className="weather-widget-foot-icon" />
              {snapshot.reportTime}
            </div>
          )}
        </>
      )}
    </div>
  );
}
