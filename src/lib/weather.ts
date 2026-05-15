export interface WeatherData {
  tempMax:     number;
  tempMin:     number;
  weatherCode: number;
  precipSum:   number;
  description: string;
  emoji:       string;
}

// WMO weather interpretation codes → [emoji, description]
const WMO: Record<number, [string, string]> = {
  0:  ['☀️', '晴天'],
  1:  ['🌤️', '晴间多云'],
  2:  ['⛅',  '多云'],
  3:  ['☁️', '阴天'],
  45: ['🌫️', '雾'],
  48: ['🌫️', '冻雾'],
  51: ['🌦️', '小毛毛雨'],
  53: ['🌦️', '毛毛雨'],
  55: ['🌧️', '毛毛雨'],
  56: ['🌧️', '小冻雨'],
  57: ['🌧️', '冻雨'],
  61: ['🌧️', '小雨'],
  63: ['🌧️', '中雨'],
  65: ['🌧️', '大雨'],
  66: ['🌧️', '小冻雨'],
  67: ['🌧️', '冻雨'],
  71: ['🌨️', '小雪'],
  73: ['❄️',  '中雪'],
  75: ['❄️',  '大雪'],
  77: ['🌨️', '雪粒'],
  80: ['🌦️', '小阵雨'],
  81: ['🌦️', '阵雨'],
  82: ['⛈️',  '强阵雨'],
  85: ['🌨️', '小阵雪'],
  86: ['❄️',  '强阵雪'],
  95: ['⛈️',  '雷暴'],
  96: ['⛈️',  '雷暴伴冰雹'],
  99: ['⛈️',  '强雷暴伴冰雹'],
};

export const RAIN_CODES = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]);
export const SNOW_CODES = new Set([71,73,75,77,85,86]);
export const BAD_CODES  = new Set([...RAIN_CODES, ...SNOW_CODES]);

// WMO code → i18n key mapping
const WMO_KEY: Record<number, string> = {
  0: 'wmo.sunny',    1: 'wmo.mostlyClear',  2: 'wmo.partlyCloudy', 3: 'wmo.overcast',
  45: 'wmo.foggy',  48: 'wmo.foggy',
  51: 'wmo.drizzle', 53: 'wmo.drizzle',     55: 'wmo.drizzle',
  56: 'wmo.freezingDrizzle', 57: 'wmo.freezingDrizzle',
  61: 'wmo.rain',   63: 'wmo.rain',         65: 'wmo.heavyRain',
  66: 'wmo.freezingRain', 67: 'wmo.freezingRain',
  71: 'wmo.snow',   73: 'wmo.snow',         75: 'wmo.heavySnow',   77: 'wmo.snowGrains',
  80: 'wmo.showers', 81: 'wmo.showers',     82: 'wmo.heavyShowers',
  85: 'wmo.snowShowers', 86: 'wmo.snowShowers',
  95: 'wmo.thunderstorm', 96: 'wmo.thunderstormHail', 99: 'wmo.thunderstormHail',
};

type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** Returns the translated WMO weather description for the given code. */
export function wmoDescT(code: number, t: TFunc): string {
  return t(WMO_KEY[code] ?? 'wmo.unknown');
}

function decodeWMO(code: number): [string, string] {
  return WMO[code] ?? ['🌡️', 'Unknown'];
}

export function clothingAdvice(tempMax: number, code: number, t: TFunc): string {
  const rain = RAIN_CODES.has(code);
  const snow = SNOW_CODES.has(code);
  let layer: string;
  if      (tempMax >= 30) layer = t('clothing.veryHot');
  else if (tempMax >= 25) layer = t('clothing.hot');
  else if (tempMax >= 20) layer = t('clothing.warm');
  else if (tempMax >= 15) layer = t('clothing.cool');
  else if (tempMax >= 10) layer = t('clothing.cold');
  else if (tempMax >= 5)  layer = t('clothing.chilly');
  else                    layer = t('clothing.freezing');
  const extras: string[] = [];
  if (rain) extras.push(t('clothing.addRain'));
  if (snow) extras.push(t('clothing.addSnow'));
  if (extras.length > 0) layer += ' · ' + extras.join(' · ');
  return layer;
}

export async function fetchWeather(
  lat: number, lng: number, isoDate: string,
): Promise<WeatherData | null> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const diffDays = (new Date(isoDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86_400_000;

  // Open-Meteo free forecast covers 16 days; archive covers the past
  if (diffDays > 16) return null;

  const base   = diffDays < 0
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';

  const params = new URLSearchParams({
    latitude:   lat.toFixed(4),
    longitude:  lng.toFixed(4),
    daily:      'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode',
    timezone:   'auto',
    start_date: isoDate,
    end_date:   isoDate,
  });

  try {
    const res  = await fetch(`${base}?${params}`, { cache: 'default' });
    if (!res.ok) return null;
    const json = await res.json() as {
      daily?: {
        time?: string[];
        temperature_2m_max?: (number | null)[];
        temperature_2m_min?: (number | null)[];
        weathercode?: (number | null)[];
        precipitation_sum?: (number | null)[];
      };
    };
    const d = json.daily;
    if (!d?.time?.length) return null;

    const tempMax = d.temperature_2m_max?.[0];
    const tempMin = d.temperature_2m_min?.[0];
    if (tempMax == null || tempMin == null) return null;

    const code = d.weathercode?.[0] ?? 0;
    const [emoji, description] = decodeWMO(code);
    return {
      tempMax:     Math.round(tempMax),
      tempMin:     Math.round(tempMin),
      weatherCode: code,
      precipSum:   d.precipitation_sum?.[0] ?? 0,
      description,
      emoji,
    };
  } catch {
    return null;
  }
}
