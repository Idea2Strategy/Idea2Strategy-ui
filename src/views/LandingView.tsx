import { Suspense, lazy, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Bot, Boxes, FlaskConical, GitBranch, Trophy } from 'lucide-react';
import { Button } from '../components/common';
import { Localized } from '../lib/i18n';
import type { PageId } from '../lib/navigation';
import { ASSEMBLY_END, COPY_EXIT, clamp01, noteIndexAt } from '../lib/landingTimeline';

/* three.js stays out of the main bundle: nobody pays for the hero except the
   person actually looking at it. */
const LandingScene = lazy(() => import('../components/LandingScene'));

/*
  The landing page: what the visitor reaches from the brand logo before they
  know the product. One scroll-scrubbed 3D hero (blocks assembling — the
  product's own metaphor), then plain sections that say what the workspace
  does, then the boundary statement: virtual only, no real orders, no
  recommendations. Copy stays descriptive because the product's legal stance
  forbids performance claims and anything that reads as investment advice.
*/

interface LandingViewProps {
  setPage: (page: PageId) => void;
}

const CAPTIONS = [
  { title: '블록을 조립해 규칙을 만듭니다', detail: 'Basic 문장형 블록, Pro 노드 그래프' },
  { title: '봇은 서버에서 규칙 그대로 실행합니다', detail: '브라우저를 닫아도 계속 평가합니다' },
  { title: '모든 판단이 기록으로 남습니다', detail: '주문하지 않은 판단까지 근거와 함께' },
] as const;

const FEATURES = [
  { icon: Boxes, title: 'Basic·Pro 전략 편집기', body: '문장처럼 읽히는 블록과 노드 그래프로, 코드 없이 매수·매도 규칙을 조립합니다.' },
  { icon: Bot, title: '서버에서 실행되는 봇', body: '브라우저를 닫아도 봇은 서버에서 계속 시장을 평가합니다. 직접 주문을 내는 일은 없습니다.' },
  { icon: GitBranch, title: '판단 기록', body: '체결된 주문만이 아니라 주문으로 이어지지 않은 판단까지 근거와 함께 남습니다.' },
  { icon: FlaskConical, title: '자동 백테스트', body: '출시된 전략 버전을 같은 기간과 같은 비용 가정으로 검증합니다.' },
  { icon: Trophy, title: '모의투자 대회', body: '익명 봇끼리 같은 규칙에서 겨룹니다. 비교 대상은 사람이 아니라 봇입니다.' },
] as const;

/* Fade-and-rise on first view, straight out of the animation playbook:
   IntersectionObserver, run once, and instant when the environment reduces
   motion (or cannot observe at all). */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduceMotion = Boolean(el.closest('.reduce-motion'))
      || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className="landing-reveal" style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>;
}

export function LandingView({ setPage }: LandingViewProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const captionsRef = useRef<HTMLDivElement>(null);
  /* Refs and a data attribute, never state: scrolling must cause zero React
     renders. A re-render here walks the whole tree back through Localized's
     prop cloning, and the caption used to be state — three state flips per
     hero, three full re-renders, and (before the *Ref guard in i18n) three
     teardowns of the 3D scene. The 3D loop reads progressRef every frame and
     CSS reads data-active-caption; React is not in the scroll path at all. */
  const progressRef = useRef(0);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    let raf = 0;
    let appliedOffset = -1;
    const measure = () => {
      raf = 0;
      /* The sticky top bar owns the first strip of the viewport. Measured live
         (72px desktop, less on mobile) so the stage fills exactly the rest,
         pins from the very first scrolled pixel, and the scrub math and the
         CSS agree on the same offset. */
      const topbar = document.querySelector('.app-topbar');
      const navOffset = topbar ? Math.round(topbar.getBoundingClientRect().height) : 0;
      if (appliedOffset !== navOffset) {
        appliedOffset = navOffset;
        rootRef.current?.style.setProperty('--landing-nav-offset', `${navOffset}px`);
      }
      const rect = hero.getBoundingClientRect();
      const stageHeight = window.innerHeight - navOffset;
      const denominator = Math.max(1, rect.height - stageHeight);
      const progress = Math.min(1, Math.max(0, (navOffset - rect.top) / denominator));
      progressRef.current = progress;
      /* The three captions belong to the assembly act only, so their thirds
         are measured inside it rather than across the whole hero. */
      const assembly = clamp01(progress / ASSEMBLY_END);
      const stop = assembly < 1 / 3 ? '0' : assembly < 2 / 3 ? '1' : '2';
      const captions = captionsRef.current;
      if (captions && captions.dataset.activeCaption !== stop) captions.dataset.activeCaption = stop;
      /* Second act, DOM side: the hero copy leaves for the edges before the
         merge, and the five feature notes then surface one at a time. Data
         attributes + CSS transitions keep React out of the scroll path. */
      const root = rootRef.current;
      if (root) {
        const copy = progress >= COPY_EXIT ? 'hidden' : 'visible';
        if (root.dataset.heroCopy !== copy) root.dataset.heroCopy = copy;
        const note = String(noteIndexAt(progress));
        if (root.dataset.activeNote !== note) root.dataset.activeNote = note;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    /* Capture phase so the measurement fires no matter which ancestor is the
       actual scroller. */
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <Localized><div ref={rootRef} className="landing-page" data-testid="landing-page" data-hero-copy="visible" data-active-note="-1">
    <section ref={heroRef} className="landing-hero" aria-label="Idea2Strategy 소개">
      <div className="landing-stage">
        <div className="landing-stage-poster" aria-hidden="true" />
        <Suspense fallback={null}><LandingScene progressRef={progressRef} /></Suspense>
        <div className="landing-hero-copy">
          <p className="eyebrow">VIRTUAL TRADING WORKSPACE</p>
          <h1>아이디어를, 전략으로</h1>
          <p className="landing-sub">코드 없이 전략을 조립하고, 서버의 봇이 규칙 그대로 실행하는 가상 트레이딩 워크스페이스입니다.</p>
          <div className="landing-cta">
            <Button kind="primary" icon={ArrowRight} onClick={() => setPage('strategy')}>전략 만들기</Button>
            <Button onClick={() => setPage('home')}>대시보드 둘러보기</Button>
          </div>
        </div>
        <div ref={captionsRef} className="landing-captions" data-active-caption="0">
          {CAPTIONS.map((caption) => <p key={caption.title} className="landing-caption">
            <strong>{caption.title}</strong>
            <span>{caption.detail}</span>
          </p>)}
        </div>
        {/* Second act: the five features surface at centre stage one at a
            time — each rises as the previous sinks away. Decorative here
            (aria-hidden): the cards below carry the accessible copy. */}
        <div className="landing-notes" aria-hidden="true">
          {FEATURES.map((feature) => <p key={feature.title} className="landing-note">
            <strong>{feature.title}</strong>
            <span>{feature.body}</span>
          </p>)}
        </div>
        <p className="landing-scroll-hint" aria-hidden="true">스크롤해서 살펴보기</p>
      </div>
    </section>

    <section className="landing-features" aria-label="주요 기능">
      <Reveal><h2>거래 화면이 아니라, 전략을 검증하는 작업대</h2></Reveal>
      <div className="landing-feature-grid">
        {FEATURES.map((feature, index) => <Reveal key={feature.title} delay={index * 70}>
          <article className="landing-feature">
            <span className="landing-feature-icon"><feature.icon size={18} aria-hidden="true" /></span>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        </Reveal>)}
      </div>
    </section>

    <section className="landing-disclaimer" aria-label="서비스 안내">
      <Reveal><p>Idea2Strategy는 실제 계좌와 연결되지 않는 가상 모의투자 서비스입니다. 실제 주문을 내지 않으며, 특정 종목이나 전략을 추천하지 않습니다. 화면의 가격과 성과는 샘플 데이터입니다.</p></Reveal>
    </section>

    <section className="landing-final" aria-label="시작하기">
      <Reveal>
        <h2>첫 전략을 조립해 보세요</h2>
        <div className="landing-cta">
          <Button kind="primary" icon={ArrowRight} onClick={() => setPage('strategy')}>전략 만들기</Button>
        </div>
      </Reveal>
    </section>
  </div></Localized>;
}
