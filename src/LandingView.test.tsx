import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { App } from './App';
import { Localized } from './lib/i18n';
import {
  ASSEMBLY_END,
  COPY_EXIT,
  EXPLODE_END,
  MERGE_END,
  MERGE_START,
  NOTES_END,
  NOTES_START,
  NOTE_COUNT,
  SHAKE_END,
  noteIndexAt,
} from './lib/landingTimeline';

/*
  The landing introduction. jsdom has no WebGL and no IntersectionObserver, so
  these tests also pin the degraded path: the 3D stage must fall back to its
  poster and the reveal sections must be visible immediately — a crash in
  either guard would blank the first screen a visitor ever sees.
*/
describe('Landing page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/landing');
  });

  test('opens from the brand logo', async () => {
    window.history.replaceState({}, '', '/');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Idea2Strategy 소개' }));

    expect(window.location.pathname).toBe('/landing');
    expect(screen.getByRole('heading', { name: '아이디어를, 전략으로' })).toBeInTheDocument();
  });

  test('introduces the product areas and states the virtual-trading boundary', () => {
    render(<App />);

    const features = screen.getByRole('region', { name: '주요 기능' });
    ['Basic·Pro 전략 편집기', '서버에서 실행되는 봇', '판단 기록', '자동 백테스트', '모의투자 대회']
      .forEach((title) => expect(within(features).getByRole('heading', { name: title })).toBeInTheDocument());

    /* The boundary statement is not decoration: virtual only, no real orders,
       no recommendations, sample data. */
    const disclaimer = screen.getByRole('region', { name: '서비스 안내' });
    expect(within(disclaimer).getByText(/실제 주문을 내지 않으며/)).toBeInTheDocument();
    expect(within(disclaimer).getByText(/추천하지 않습니다/)).toBeInTheDocument();
    expect(within(disclaimer).getByText(/샘플 데이터/)).toBeInTheDocument();
  });

  test('the hero call to action leads to the strategy workspace', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: '전략 만들기' })[0]);

    expect(window.location.pathname).toBe('/strategies');
    expect(screen.getByRole('heading', { name: '전략' })).toBeInTheDocument();
  });

  test('keeps the poster and instant reveals when WebGL and observers are missing', async () => {
    const { container } = render(<App />);

    // jsdom: the WebGL constructor throws → the scene bails to the poster.
    expect(container.querySelector('.landing-stage-poster')).toBeInTheDocument();
    // jsdom: no IntersectionObserver → sections reveal immediately.
    container.querySelectorAll('.landing-reveal').forEach((el) => expect(el).toHaveClass('is-visible'));

    /* Let the lazy 3D chunk settle inside the test so its failed WebGL mount
       cannot crash anything after the assertions. */
    await screen.findByTestId('landing-page');
    expect(screen.getByRole('heading', { name: '아이디어를, 전략으로' })).toBeInTheDocument();
  });

  test('the second-act timeline is ordered and the notes visit all five features', () => {
    /* The 3D scene and the DOM overlays import these same boundaries; if the
       ordering breaks, acts overlap or leave dead scroll. */
    expect(ASSEMBLY_END).toBeLessThan(COPY_EXIT);
    expect(COPY_EXIT).toBeLessThan(MERGE_START);
    expect(MERGE_START).toBeLessThan(MERGE_END);
    expect(MERGE_END).toBeLessThan(SHAKE_END);
    expect(SHAKE_END).toBeLessThan(EXPLODE_END);
    expect(EXPLODE_END).toBeLessThanOrEqual(1);
    /* Notes surface only after the merge snap and clear before release. */
    expect(NOTES_START).toBeGreaterThanOrEqual(MERGE_END);
    expect(NOTES_END).toBeLessThanOrEqual(1);

    expect(noteIndexAt(NOTES_START - 0.001)).toBe(-1);
    expect(noteIndexAt(NOTES_START)).toBe(0);
    expect(noteIndexAt(NOTES_END - 0.001)).toBe(NOTE_COUNT - 1);
    expect(noteIndexAt(NOTES_END)).toBe(-1);
    expect(noteIndexAt(1)).toBe(-1);

    const seen = new Set<number>();
    for (let p = 0; p <= 1; p += 0.0005) seen.add(noteIndexAt(p));
    expect([...seen].sort((a, b) => a - b)).toEqual([-1, 0, 1, 2, 3, 4]);
  });

  test('the stage carries the five feature notes, hidden until their act', () => {
    render(<App />);

    const page = screen.getByTestId('landing-page');
    expect(page).toHaveAttribute('data-hero-copy', 'visible');
    expect(page).toHaveAttribute('data-active-note', '-1');
    /* Decorative duplicates of the cards below — hidden from the tree. */
    const notes = page.querySelectorAll('.landing-notes .landing-note');
    expect(notes).toHaveLength(NOTE_COUNT);
    expect(notes[0].closest('.landing-notes')).toHaveAttribute('aria-hidden', 'true');
  });

  test('Localized hands *Ref props to children by identity, not as clones', () => {
    /* The regression that made the hero snap between three frozen states:
       Localized deep-clones plain-object props, and a useRef box IS a plain
       object. The scene received a copy — never seeing scroll progress — and
       its effect saw a "new" ref every render, rebuilding the WebGL scene on
       each caption change. */
    const seen: Array<{ current: number }> = [];
    function Probe({ progressRef }: { progressRef: { current: number } }) {
      seen.push(progressRef);
      return null;
    }
    const box = { current: 0.5 };
    render(<Localized><Probe progressRef={box} /></Localized>);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(box);
  });
});
