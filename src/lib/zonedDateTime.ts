interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatter = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new Error('시간대를 확인해 주세요.');
  }
};

function readWallClock(value: string): WallClock {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('날짜와 시간을 확인해 주세요.');
  const [, year, month, day, hour, minute] = match;
  const result = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute) };
  const normalized = new Date(Date.UTC(result.year, result.month - 1, result.day, result.hour, result.minute));
  if (normalized.getUTCFullYear() !== result.year || normalized.getUTCMonth() + 1 !== result.month
    || normalized.getUTCDate() !== result.day || result.hour > 23 || result.minute > 59) {
    throw new Error('날짜와 시간을 확인해 주세요.');
  }
  return result;
}

function clockAt(instant: Date, timeZone: string): WallClock {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
  };
}

const epoch = (clock: WallClock) => Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
const sameClock = (left: WallClock, right: WallClock) => epoch(left) === epoch(right);

export function zonedLocalToIso(value: string, timeZone: string): string {
  const requested = readWallClock(value);
  formatter(timeZone);
  let candidate = epoch(requested);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = clockAt(new Date(candidate), timeZone);
    candidate += epoch(requested) - epoch(observed);
  }
  const result = new Date(candidate);
  if (!sameClock(clockAt(result, timeZone), requested)) {
    throw new Error('선택한 시간대에 존재하지 않는 현지 시각입니다.');
  }
  return result.toISOString();
}

export function formatDateTimeLocal(value: Date, timeZone: string): string {
  const clock = clockAt(value, timeZone);
  const two = (part: number) => String(part).padStart(2, '0');
  return `${clock.year}-${two(clock.month)}-${two(clock.day)}T${two(clock.hour)}:${two(clock.minute)}`;
}
