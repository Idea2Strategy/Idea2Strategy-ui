import { describe, expect, test } from 'vitest';
import { formatDateTimeLocal, zonedLocalToIso } from './zonedDateTime';

describe('zoned local date-time conversion', () => {
  test('converts the displayed wall clock with the selected IANA timezone', () => {
    expect(zonedLocalToIso('2026-08-10T09:00', 'Asia/Seoul')).toBe('2026-08-10T00:00:00.000Z');
    expect(zonedLocalToIso('2026-08-10T09:00', 'America/New_York')).toBe('2026-08-10T13:00:00.000Z');
  });

  test('round-trips an instant to a datetime-local value in that timezone', () => {
    expect(formatDateTimeLocal(new Date('2026-08-10T00:00:00Z'), 'Asia/Seoul')).toBe('2026-08-10T09:00');
  });

  test('rejects malformed values, unknown zones and DST gaps', () => {
    expect(() => zonedLocalToIso('not-a-date', 'Asia/Seoul')).toThrow('날짜와 시간을 확인');
    expect(() => zonedLocalToIso('2026-08-10T09:00', 'Mars/Olympus')).toThrow('시간대를 확인');
    expect(() => zonedLocalToIso('2026-03-08T02:30', 'America/New_York')).toThrow('존재하지 않는 현지 시각');
  });
});
