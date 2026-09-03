import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Localized, useLanguage } from '../lib/i18n';

export interface CompetitionSchedule {
  recruitmentOpensAt: string;
  evaluationStartsAt: string;
  evaluationEndsAt: string;
}

type Milestone = keyof CompetitionSchedule;

const milestones: Array<{ key: Milestone; label: string; tone: string }> = [
  { key: 'recruitmentOpensAt', label: '모집 시작', tone: 'recruitment' },
  { key: 'evaluationStartsAt', label: '평가 시작', tone: 'evaluation' },
  { key: 'evaluationEndsAt', label: '평가 종료', tone: 'ending' },
];

const datePart = (value: string) => value.slice(0, 10);
const timePart = (value: string) => value.slice(11, 16);
const join = (date: string, time: string) => `${date}T${time}`;
const two = (value: number) => String(value).padStart(2, '0');
const isoDate = (year: number, monthIndex: number, day: number) => `${year}-${two(monthIndex + 1)}-${two(day)}`;
const formatMilestone = (value: string, language: 'ko' | 'en') => {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (language === 'en') return formatter.format(date);
  return formatter.formatToParts(date).map((part) => part.type === 'dayPeriod'
    ? (date.getHours() < 12 ? '오전' : '오후')
    : part.value).join('');
};

export function CompetitionSchedulePicker({ value, onChange }: { value: CompetitionSchedule; onChange: (value: CompetitionSchedule) => void }) {
  const { language, t } = useLanguage();
  const [active, setActive] = useState<Milestone>('recruitmentOpensAt');
  const initial = new Date(`${datePart(value.recruitmentOpensAt)}T12:00:00`);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cells = useMemo(() => Array.from({ length: Math.ceil((firstWeekday + dayCount) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= dayCount ? day : null;
  }), [dayCount, firstWeekday]);
  const weekdays = language === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['일', '월', '화', '수', '목', '금', '토'];
  const selectDate = (day: number) => {
    const selected = isoDate(year, month, day);
    onChange({ ...value, [active]: join(selected, timePart(value[active])) });
    const index = milestones.findIndex((item) => item.key === active);
    if (index < milestones.length - 1) setActive(milestones[index + 1].key);
  };
  const setTime = (key: Milestone, time: string) => {
    if (time) onChange({ ...value, [key]: join(datePart(value[key]), time) });
  };
  const activeLabel = milestones.find((item) => item.key === active)!.label;

  return <Localized><div className="competition-schedule-picker">
    <div className="competition-schedule-milestones" aria-label="대회 일정 단계">
      {milestones.map((item, index) => <button key={item.key} type="button" className={`competition-schedule-milestone is-${item.tone}`} aria-pressed={active === item.key} onClick={() => { setActive(item.key); const selected = new Date(`${datePart(value[item.key])}T12:00:00`); setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1)); }}>
        <span>{index + 1}</span><strong>{t(`${item.label} 선택`)}</strong><small>{formatMilestone(value[item.key], language)}</small>
      </button>)}
    </div>
    <div className="competition-schedule-calendar">
      <header>
        <button type="button" aria-label="이전 달" onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}><ChevronLeft size={18} /></button>
        <strong>{language === 'en' ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long' }).format(visibleMonth) : `${year}년 ${month + 1}월`}</strong>
        <button type="button" aria-label="다음 달" onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}><ChevronRight size={18} /></button>
      </header>
      <div className="competition-schedule-grid competition-schedule-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="competition-schedule-grid" role="grid" aria-label="대회 일정 달력">
        {Array.from({ length: cells.length / 7 }, (_, rowIndex) => <div role="row" key={`week-${rowIndex}`}>
          {cells.slice(rowIndex * 7, rowIndex * 7 + 7).map((day, cellIndex) => day === null
            ? <span key={`blank-${rowIndex}-${cellIndex}`} role="gridcell" aria-hidden="true" />
            : (() => {
              const date = isoDate(year, month, day);
              const marks = milestones.filter((item) => datePart(value[item.key]) === date);
              const inEvaluationRange = date > datePart(value.evaluationStartsAt) && date < datePart(value.evaluationEndsAt);
              const suffix = active === 'evaluationEndsAt' ? '로' : '으로';
              const rangeLabel = inEvaluationRange ? (language === 'en' ? ', evaluation period' : ', 평가 기간') : '';
              const aria = language === 'en' ? `Select ${new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`))} as ${t(activeLabel)}${rangeLabel}` : `${year}년 ${month + 1}월 ${day}일을 ${activeLabel}${suffix} 선택${rangeLabel}`;
              return <button key={date} type="button" role="gridcell" aria-label={aria} aria-selected={marks.length > 0} className={`${marks.length ? 'is-selected' : ''}${inEvaluationRange ? ' is-in-range' : ''}`.trim()} onClick={() => selectDate(day)}><b>{day}</b><span>{marks.map((mark) => <i key={mark.key} className={`is-${mark.tone}`} title={mark.label} />)}</span></button>;
            })())}
        </div>)}
      </div>
    </div>
    <div className="competition-schedule-times">
      {milestones.map((item) => <label key={item.key}>{t(`${item.label} 시간`)}<input aria-label={t(`${item.label} 시간`)} type="time" step="300" value={timePart(value[item.key])} onChange={(event) => setTime(item.key, event.target.value)} required /></label>)}
    </div>
  </div></Localized>;
}
