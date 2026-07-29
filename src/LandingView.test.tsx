import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { App } from './App';
import { Localized } from './lib/i18n';

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
