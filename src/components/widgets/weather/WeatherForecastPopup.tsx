import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Sunrise, Sunset } from "lucide-react";
import { getCurrentLanguage, getMessage } from "@/lib/i18n";
import {
  fetchForecast,
  formatTemperature,
  isUsableForecast,
  weatherEmoji,
  type WeatherForecast,
} from "@/components/widgets/weather/weather";

interface WeatherForecastPopupProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
}

function readCity(data?: Record<string, unknown>): string {
  return typeof data?.city === "string" ? data.city : "";
}

/**
 * 天气小部件的展开内容：逐小时与逐天预报。
 *
 * 该组件只在弹窗打开时挂载，因此预报请求也是"展开后才发出"，
 * 减少对免费 API 的占用；结果按 24 小时缓存（localStorage，
 * 浏览器重启后仍在，且不参与云同步）。
 */
export function WeatherForecastPopup({ data }: WeatherForecastPopupProps) {
  const city = readCity(data);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError("");
      try {
        const lang = getCurrentLanguage() === "en" ? "en" : "zh";
        const next = await fetchForecast({ city: city || undefined, lang, force });
        // 防御畸形数据：只接受结构可用的结果，避免渲染时崩溃。
        setForecast(isUsableForecast(next) ? next : null);
        if (!isUsableForecast(next)) setError(getMessage("weatherForecastFailed", "预报获取失败"));
      } catch {
        setError(getMessage("weatherForecastFailed", "预报获取失败"));
      } finally {
        setLoading(false);
      }
    },
    [city],
  );

  // 挂载（即展开）时才发起请求；命中 24h 缓存则不会真正联网。
  // 放进 async 包装里，避免在 effect 内同步 setState。
  useEffect(() => {
    void (async () => {
      await load(false);
    })();
  }, [load]);

  return (
    <div className="weather-forecast">
      <div className="weather-forecast-bar">
        <span className="weather-forecast-city">
          {city || getMessage("weatherCurrent", "当前位置")}
        </span>
        <button
          className="weather-forecast-refresh"
          title={getMessage("weatherRefresh", "刷新")}
          onClick={() => void load(true)}
          disabled={loading}
        >
          <RefreshCw className={`weather-forecast-refresh-icon ${loading ? "is-spinning" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="weather-forecast-state">
          <AlertTriangle className="weather-forecast-state-icon" />
          <span>{error}</span>
        </div>
      ) : !forecast ? (
        <div className="weather-forecast-state">
          <Loader2 className="weather-forecast-state-icon is-spinning" />
          <span>{getMessage("weatherLoading", "加载中...")}</span>
        </div>
      ) : (
        <>
          {forecast.hourly.length > 0 && (
            <section className="weather-forecast-section">
              <h4 className="weather-forecast-heading">
                {getMessage("weatherHourly", "逐小时预报")}
              </h4>
              <div className="weather-hourly">
                {forecast.hourly.map((hour) => (
                  <div key={hour.time} className="weather-hourly-item">
                    <span className="weather-hourly-time">{hour.label}</span>
                    <span className="weather-hourly-emoji">
                      {weatherEmoji(hour.weatherIcon ?? "")}
                    </span>
                    <span className="weather-hourly-temp">
                      {formatTemperature(hour.temperature)}
                    </span>
                    {hour.pop !== undefined && hour.pop > 0 && (
                      <span className="weather-hourly-pop">{hour.pop}%</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {forecast.daily.length > 0 && (
            <section className="weather-forecast-section">
              <h4 className="weather-forecast-heading">{getMessage("weatherDaily", "逐天预报")}</h4>
              <div className="weather-daily">
                {forecast.daily.map((day) => (
                  <div key={day.date} className="weather-daily-row">
                    <span className="weather-daily-day">{day.week || day.date}</span>
                    <span className="weather-daily-emoji">
                      {weatherEmoji(day.weatherIcon ?? "")}
                    </span>
                    <span className="weather-daily-desc">
                      {day.weatherDay}
                      {day.weatherNight && day.weatherNight !== day.weatherDay
                        ? ` / ${day.weatherNight}`
                        : ""}
                    </span>
                    <span className="weather-daily-sun">
                      {day.sunrise && (
                        <span className="weather-daily-sun-item">
                          <Sunrise className="weather-daily-sun-icon" />
                          {day.sunrise}
                        </span>
                      )}
                      {day.sunset && (
                        <span className="weather-daily-sun-item">
                          <Sunset className="weather-daily-sun-icon" />
                          {day.sunset}
                        </span>
                      )}
                    </span>
                    <span className="weather-daily-temp">
                      {day.tempMin !== undefined && day.tempMax !== undefined
                        ? `${formatTemperature(day.tempMin)}~${formatTemperature(day.tempMax)}`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
