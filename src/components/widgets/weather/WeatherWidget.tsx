import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Droplets, MapPin, RefreshCw, Wind } from "lucide-react";
import { getCurrentLanguage, getMessage } from "@/lib/i18n";
import { UapiError, uapiErrorText } from "@/lib/uapi";
import { resolveWidgetSizeMode, widgetPadding } from "@/lib/widget-layout";
import {
  displayPlaceName,
  fetchWeather,
  formatTemperature,
  weatherDisplayText,
  weatherEmoji,
  type WeatherSnapshot,
} from "@/components/widgets/weather/weather";

interface WeatherWidgetProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

/** 读取用户已设置的城市；为空时交给接口按 IP 自动定位。 */
function readCity(data?: Record<string, unknown>): string {
  return typeof data?.city === "string" ? data.city : "";
}

/**
 * 该城市是否是用户**显式设置**的。
 *
 * 旧版本数据没有这个标记，此时一律视为用户设置（保持原有展示行为）。
 * 区分二者很重要：按 IP 定位得到的只是接口回显的上层地名（如「重庆城区」），
 * 若当成用户设置，就会盖掉接口返回的更细粒度 `district`（如「某某区」）。
 */
function readCityIsUserSet(data?: Record<string, unknown>): boolean {
  return data?.cityIsUserSet !== false;
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
 * 数据来自 UAPI 实时天气接口。城市未设置时不额外调用定位接口：
 * 天气接口在 `city` / `adcode` 均缺失时会按客户端 IP 自动定位，
 * 并直接回传 `province` / `city` / `district`，少一次请求与一份积分。
 *
 * 结果按 10 分钟 TTL 缓存；点右上角可**主动刷新**——主动刷新会绕过
 * 本地节流与缓存立即联网，且失败时保留当前数据不清空。
 */
export function WeatherWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight = 150,
}: WeatherWidgetProps) {
  const [city, setCity] = useState(() => readCity(data));
  /** 已存城市是否为用户显式设置（决定地名优先用设置值还是接口的细粒度值）。 */
  const [cityIsUserSet, setCityIsUserSet] = useState(() => readCityIsUserSet(data));
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | undefined>(() => readSnapshot(data));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const persist = useCallback(
    (next: { city: string; cityIsUserSet: boolean; snapshot?: WeatherSnapshot }) => {
      if (!onDataChange) return;
      onDataChange({
        city: next.city,
        cityIsUserSet: next.cityIsUserSet,
        snapshot: next.snapshot,
        updatedAt: Date.now(),
      });
    },
    [onDataChange],
  );

  /**
   * 查询天气；targetCity 为空时由接口按 IP 自动定位。
   *
   * @param force 用户主动刷新：忽略缓存与本地节流。
   * @param userSet 该城市是否为用户显式设置（IP 定位得到的不是）。
   */
  const load = useCallback(
    async (targetCity: string, force = false, userSet = true) => {
      setLoading(true);
      setError("");
      try {
        const lang = getCurrentLanguage() === "en" ? "en" : "zh";
        const next = await fetchWeather({ city: targetCity || undefined, lang, force });
        setSnapshot(next);
        setCity(targetCity || next.city);
        setCityIsUserSet(userSet && Boolean(targetCity));
        persist({
          city: targetCity || next.city,
          cityIsUserSet: userSet && Boolean(targetCity),
          snapshot: next,
        });
      } catch (e) {
        // 拿不到新数据时**保留**已有快照（可能已过期），只提示错误
        const fallback =
          e instanceof UapiError && e.info.kind === "not-found"
            ? getMessage("weatherCityNotFound", "未找到该城市")
            : undefined;
        const { key, fallback: text } = uapiErrorText(e, fallback);
        setError(getMessage(key, text));
      } finally {
        setLoading(false);
      }
    },
    [persist],
  );

  // 首次挂载后拉取数据。有效缓存由 fetchWeather 内部命中，
  // 因此这里直接调用即可：有新鲜数据就不会真正联网。
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const storedCity = readCity(data);
      // 已存城市：沿用其"是否用户设置"的语义；无城市则交给接口按 IP 定位
      await load(storedCity, false, readCityIsUserSet(data));
    })();
  }, [data, load]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  /** 主动刷新：绕过缓存与本地节流，立即联网。 */
  const handleRefresh = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (loading) return;
      void load(city, true, cityIsUserSet);
    },
    [city, cityIsUserSet, load, loading],
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
    setCityIsUserSet(true);
    // 换城市属用户明确操作：直接取新城市的实时数据，不沿用旧缓存
    void load(next, true, true);
  }, [city, draft, load]);

  // 高度模式五组件共用（宽或高偏小即紧凑）
  const mode = resolveWidgetSizeMode({ width: containerWidth, height: containerHeight });
  const compact = mode === "compact";
  // 只把「用户显式设置的城市」当作展示名；IP 定位得到的上层地名不应
  // 盖掉接口返回的更细粒度 district（如 某某区）。
  const place = displayPlaceName(cityIsUserSet ? city : "", snapshot);

  return (
    <div
      className="weather-widget"
      // 非控件区域可点击展开预报（控件自身的点击不会冒泡到这里）
      title={getMessage("widgetExpand", "展开详情")}
      style={{ padding: widgetPadding(mode) }}
    >
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
              <span className="weather-widget-desc">
                {weatherDisplayText(snapshot.weatherIcon, snapshot.weather)}
              </span>
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
