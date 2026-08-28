import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { CompetitionSchedulePicker, type CompetitionSchedule } from './CompetitionSchedulePicker';

function Harness() {
  const [value, setValue] = useState<CompetitionSchedule>({
    recruitmentOpensAt: '2026-08-10T09:00',
    evaluationStartsAt: '2026-08-14T09:30',
    evaluationEndsAt: '2026-08-20T16:00',
  });
  return <CompetitionSchedulePicker value={value} onChange={setValue} />;
}

describe('competition schedule picker', () => {
  test('selects all three milestones from one calendar and keeps explicit times', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('grid', { name: '대회 일정 달력' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('2026-08-10T09:00')).not.toBeInTheDocument();

    await user.click(screen.getByRole('gridcell', { name: '2026년 8월 12일을 모집 시작으로 선택' }));
    expect(screen.getByRole('button', { name: /평가 시작 선택/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('모집 시작 시간')).toHaveValue('09:00');

    await user.click(screen.getByRole('gridcell', { name: /2026년 8월 16일을 평가 시작으로 선택/ }));
    expect(screen.getByRole('button', { name: /평가 종료 선택/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('평가 종료 시간'), { target: { value: '18:30' } });

    expect(screen.getByText('2026. 8. 12. 오전 9:00')).toBeInTheDocument();
    expect(screen.getByText('2026. 8. 16. 오전 9:30')).toBeInTheDocument();
    expect(screen.getByText('2026. 8. 20. 오후 6:30')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /2026년 8월 18일.*평가 기간/ })).toHaveClass('is-in-range');
  });

  test('uses valid row and gridcell semantics for every calendar position', () => {
    render(<Harness />);
    const grid = screen.getByRole('grid', { name: '대회 일정 달력' });
    expect(within(grid).getAllByRole('row')).toHaveLength(6);
    for (const row of within(grid).getAllByRole('row')) {
      expect(within(row).getAllByRole('gridcell', { hidden: true })).toHaveLength(7);
    }
  });

  test('moves between months without mutating the selected schedule', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CompetitionSchedulePicker value={{ recruitmentOpensAt: '2026-08-10T09:00', evaluationStartsAt: '2026-08-14T09:30', evaluationEndsAt: '2026-08-20T16:00' }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByText('2026년 9월')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
