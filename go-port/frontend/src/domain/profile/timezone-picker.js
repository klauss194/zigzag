import { TimeZone } from '../time/time-zone.js';
import { NameMatch } from '../search/name-match.js';

const TZ_ALIASES = {
  nyc: 'America/New_York', sf: 'America/Los_Angeles', la: 'America/Los_Angeles',
  cdmx: 'America/Mexico_City', bcn: 'Europe/Madrid', bombay: 'Asia/Kolkata',
  peking: 'Asia/Shanghai', saigon: 'Asia/Ho_Chi_Minh',
};

const fold = (s) => NameMatch.fold(s).replace(/[\s_-]+/g, ' ').trim();

export class TimezonePicker {
  static list() {
    try {
      const all = Intl.supportedValuesOf?.('timeZone');
      if (all?.length) return all;
    } catch (_) {  }
    return ['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York',
      'America/Chicago', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo'];
  }

  static async candidates(query, max = 3) {
    const q = fold(String(query || ''));
    if (!q) return [];
    const asTz = String(query).trim();
    if (TimeZone.isValid(asTz) && asTz.includes('/')) return [{ timezone: asTz, localTime: TimeZone.localTimeIn(asTz) }];
    const out = [];
    const push = (tz) => { if (tz && TimeZone.isValid(tz) && !out.includes(tz)) out.push(tz); };
    push(TZ_ALIASES[q.replace(/ /g, '')]);
    const zones = TimezonePicker.list().map((z) => ({ z, city: fold(z.split('/').pop() || '') }));
    for (const { z, city } of zones) if (city === q) push(z);
    for (const { z, city } of zones) if (city.startsWith(q)) push(z);
    for (const { z, city } of zones) if (city.includes(q) || q.includes(city)) push(z);
    return out.slice(0, max).map((timezone) => ({ timezone, localTime: TimeZone.localTimeIn(timezone) }));
  }
}
