# Idea2Strategy UI design system

## Status and scope

This document is the implementation guide for the standalone `prototype/` product UI. Signal Studio (concept C) is the only product visual system. Terminal and balanced variants, variant labels, and their switch are retired.

The design goal is a calm, information-dense trading workspace. Every screen should feel like the same product before it feels like a different feature.

## Layout

- Desktop content width: `1280px` maximum on every page — the Tailwind `max-w-7xl` convention. One container value app-wide; it keeps margins on a 1366px laptop and calm gutters at 1920px. Never fork it per page.
- Product navigation: `72px` tall, horizontal, sticky. Each primary navigation target is `86px` wide.
- The logo and wordmark open the landing introduction (`/landing`); the HOME menu item remains the operational dashboard, and the product still opens on Home.
- Primary navigation order is Home, Strategies, Bots, Backtest, Competition.
- Account and security live together under the `KIM` My account control. Admin and watchlist entry points are not part of the product navigation.
- Notifications and help are navigation tools, not primary destinations: the bell opens a popover that links into `/notifications`, and the question mark opens `/help`. They are reachable from every screen without competing with the five product areas.
- Global search is a working control, not an ornament. It matches screens, strategies, bots and competitions and navigates on selection.
- Page outer padding: `32px` desktop, `16px` narrow.
- Page section gap: `24px`.
- Component grid gap: `16px`.
- Dense control gap: `8px`.
- Use one alignment edge for the page heading, primary action, panels, and tables.
- Do not introduce a local margin when an existing parent `gap` can express the relationship.

## Spacing scale

Only use the shared 4px-based scale:

| Token | Value | Use |
| --- | ---: | --- |
| `--space-1` | `4px` | icon/text micro gap |
| `--space-2` | `8px` | compact controls |
| `--space-3` | `12px` | control padding |
| `--space-4` | `16px` | card padding and grid gap |
| `--space-5` | `24px` | section separation |
| `--space-6` | `32px` | page padding |
| `--space-8` | `48px` | major vertical separation |

Arbitrary values are reserved for geometry such as chart coordinates and block notches, not normal layout spacing.

## Type system

- Product font: `Pretendard`, `Inter`, `Noto Sans KR`, system sans-serif.
- Code, values, timestamps, tickers, and micro labels: `Cascadia Code`, `SFMono-Regular`, `Consolas`, monospace.
- Do not mix display fonts between pages.
- Headings use the product font, not monospace.
- English uppercase is reserved for navigation, editor mode, ticker symbols, and short eyebrow labels.
- Korean and English body copy use the same size and line-height.

| Role | Size / line-height | Weight |
| --- | --- | ---: |
| Page title | `40px / 1.1` | 700 |
| Section title | `16px / 1.35` | 700 |
| Card title | `14px / 1.4` | 700 |
| Body | `13px / 1.6` | 400 |
| Control | `12px / 1.4` | 650 |
| Caption | `11px / 1.45` | 500 |
| Micro label | `9px / 1.3` | 700 |

`9px` is the floor. Nothing that carries meaning may be smaller; sizes below it are not decoration, they are unreadable content. The scale is available as `--fs-micro` through `--fs-section`.

Use `-0.035em` tracking only for page titles. Body text and Korean labels use normal tracking. Uppercase micro labels may use `0.08em`.

## Color and material

- `src/styles/tokens.css` is the only place a palette value may be declared. A second declaration further down the cascade outranks the theme classes, and one theme then silently inherits the other theme's colours. This is what previously broke light mode.
- Both themes define the same variable names. Adding a token to one theme means adding it to the other in the same order.
- **Neutrals stay neutral** (2026-07-26 repaint): the earlier palettes tinted
  every grey green (sage backgrounds, olive accent), which made both themes —
  light especially — read as muddy. Greys carry at most a hint of cool; the
  semantic colours must be the only visible hue on the page.
- The brand hue is teal, taken from the product logo (`#347d7e` family) —
  the default of six **colour templates** (틸·블루·바이올렛·그린·앰버·로즈)
  picked from a fixed dock at the bottom-right of the screen and persisted as
  `i2s-palette`. A template swaps only the `--accent` triple per theme;
  neutrals, status colours and price colours never follow the template.
- Dark is the default product theme. Background `#0f1214`; surface `#15191b`; main text `#dce3e4`; accent pastel teal `#5ecfca` with dark ink.
- Light is a full peer of dark, not an override of it. Background `#f1f4f4`; surface `#ffffff`; main text `#1a2224`. The brand teal is darkened to `#0e7476` (≈5.5:1 on white), because a pastel only reaches ~2:1.
- Ink printed on top of `--accent` comes from `--accent-ink`, which flips per theme: dark ink on the pale dark-theme accent, light ink on the dark light-theme accent.
- Every foreground token is held to at least 4.5:1 against `--surface` in its own theme, including `--text-faint`, which carries captions and micro labels in about fifty places.
- The accent is used for current selection, one primary action, focus, and live state.
- Accent glows are not used on navigation or primary buttons. Small operational live dots may use a restrained `4px` halo.
- Green, amber, red, and blue are semantic. Buy and sell colors must not become general decoration.
- **Price direction is a user-chosen convention, separate from state colours.**
  `--gain`/`--loss` carry it (Korean default: gains red, losses blue;
  `data-updown="us"` flips to gains green, losses red). The switch lives in
  the topbar next to the language select (2026-07-26 decision) and also in
  the account page's 화면 설정 — both drive the same state.
  The `.positive`/`.negative` utility classes mark price direction only and
  read from these tokens. State semantics never flip: running is green
  (`--positive`), evaluating is blue (`--info`), attention is amber
  (`--warning`) — and **two different states must never share a colour**.
- Chart grammar (consumer brokerage, e.g. Toss): the whole chart (plot and
  date labels) sits in one bounded card — a hairline border with a soft
  surface tint — so the plot never floats unframed on the page. Inside it,
  **the line owns the full width; annotations sit in the plot's own empty
  space.** The period high is
  a small value directly above its peak and the low directly below its trough
  — by definition nothing else is there (hidden when the extreme is exactly
  zero; the baseline already says it). The current value is the endpoint dot;
  the large summary figure above the chart is its label — no right-edge price
  tag, no extra guide line, no side gutters.
- Chart lines: **every horizontal line means something** — no decorative
  grid. The subtle solid neutral zero baseline is the ONLY reference line;
  percentage context lives in the summary figure and the tooltip, never in
  grid lines (percentage rails were tried and cut on 2026-07-26 — they read
  as clutter, not context). **Direction colour belongs to the segment, not
  the series**: the line is clipped at the zero baseline, so stretches above
  zero wear the gain colour and only stretches below zero wear the loss
  colour, each with a soft gradient fill toward zero.
- Basic buy blocks use a clean red ramp from `#f2c7c7` to `#cf4545`.
- Basic sell blocks use a clean blue ramp from `#dce5ff` to `#4f73df`.
- Do not mix ochre, purple, gray-green, or other category colors into the buy/sell flow.
- Category tones for ranking badges, competition cards, chart series, template icons and Pro node headers come from the `--tone-*` tokens. They are drawn as thin strokes and small text on the page surface, so each theme carries its own value.
- Strategy block fills are saturated chips, so their label colour comes from `--block-tone-ink`: dark ink on the dark theme's bright pastels, white ink on the light theme's darkened fills. White ink on a pale fill measures under 2:1 and is not acceptable in either theme.
- Borders are one pixel. Shadow ink comes from `--shadow-rgb` so a shadow authored against the dark canvas does not become a grey smudge on white.
- Product background grids stay below `2%` opacity and must not compete with content.
- Radius scale: `--radius-xs` `4px` for chips and small controls, `--radius-sm` `8px` for buttons and inputs, `--radius-md` `12px` for panels, `--radius-lg` `16px` for overlays. This supersedes the earlier 4px/8px pair: at 2–3px the combination of hairline borders and dense data read as visual noise. Strategy blocks keep their functional geometry.

## Component rules

- Primary buttons are `40px` high. Compact icon controls are `36px`.
- Inputs and selects are `36px` high.
- Panels use consistent border, radius, and `16px` internal padding.
- Table rows are at least `64px` high and share one baseline.
- Page headings have `24px` below them.
- Every product page uses the shared `PageHeading` composition: `9px` eyebrow, `40px/44px` title, and `13px/20px` support copy.
- The browser always reserves the vertical scrollbar gutter so navigation never moves when page height changes.
- Popovers overlay content and never cause layout movement.
- Basic strategy groups start with a colored header and end with a full-width fixed output. Buy and sell groups have equal height.

## Page-opening pattern — "looks easy"

The product's core promise is that it looks easy. Strategy editing is inherently
complex, so every other page compensates: full capability, minimal visual
dispersion. Each page opens the same way, so a person always knows what page
they are on and what to do first.

1. **The description line states the situation and the next action in plain
   words.** Not what the page is ("확인이 필요한 작업과 성과를 확인하세요") but
   what is true right now and what to do ("봇 3개가 정상 운영 중이에요. 아래
   2가지만 확인하면 됩니다."). If there is nothing to do, say that.
2. **Exactly one visually raised element class per page** — the most actionable
   thing. On Home that is the tinted alert banners. Everything else is quiet:
   borderless sections with a small title and a hairline under the section
   head. Alerts are slim single-line banners, never a large panel: warnings the
   size of the page make the whole product read as broken.
3. **The page container is the same width on every page.** Narrowing one page
   makes its content edge jump relative to every other screen, which reads as
   broken, not calm. Ease comes from the single bordered surface and quiet
   sections, never from shrinking the container. Within the standard width,
   quiet context sections may sit side by side to keep a check-in page short.
4. **Context is a sentence, not a strip of boxes.** Summary numbers render as
   one line of plain text under the focal panel.
5. **One primary button per page**, in the heading, and it is the page's main
   verb.

Applied so far: Home. Remaining pages adopt this pattern one at a time.

## Bot operations

- Master list left, selected bot's detail right; overview, positions, decision
  log and the strategy snapshot stay behind tabs.
- **The detail header is the emoji tile, the name and the state — nothing
  else** (2026-07-26 decision). Where the bot runs is on its list row and the
  strategy belongs to the snapshot tab; repeating them as a header subtitle
  ("개인 봇 · Opening Range Flow · v4") was noise.
- **Bot persona emoji.** Each bot carries an emoji picked from six presets
  (집중 🎯 · 공격적 🔥 · 균형 ⚖️ · 방어적 🛡️ · 릴렉스 🌊 · 고성장 🚀). It
  renders in the exact tile the generic robot icon used — list row and detail
  header — so the layout does not change, only the glyph. The header tile is
  the setting: clicking it opens the preset picker.
- **Cash IS the buying power.** The product has no margin, so a separate
  buying-power figure would repeat the cash number; the 현금 stat carries the
  "주문 가능 금액" caption instead. The 투자 중 stat carries no caption.
- Position heatmap (P&L-coloured tiles sized by weight): **noted as a
  consideration, not built** — the composition bar plus the holdings table
  covers 2–3 positions; revisit if realistic bots hold 8+.
- The description line is a situation sentence (how many bots are healthy,
  which one needs a look), not a mission statement. No metric strip above the
  workspace: total equity is Home's number and the concurrent-run cap belongs
  to the launch flow.
- **A budget-cap deferral is normal operation, not a problem.** The strategy is
  locked while the bot runs, conflict handling is the strategy's own policy,
  and the bot retries on the next evaluation — so there is no problem banner,
  no cause dialog, and no attention state for it. It is recorded in the
  decision log (muted tone, "다음 평가에서 재시도") and as an info
  notification. Attention states are reserved for things a person must act on,
  e.g. a lost connection.
- The overview chart is the same seeded P&L simulation as Home (currency line,
  return in the tooltip), so the two pages agree.
- **Positions is current state only**: a stacked composition bar (each
  holding's share of equity plus cash, with a numeric legend so colour is
  never the only signal) above the holdings table, which carries both P&L and
  return per position. Anything with a time axis lives in the decision log.
- **The decision log is the single timeline.** Fills are decisions that
  produced orders, so they appear there — side chip, quantity and price, the
  **partition whose strategy created the order**, and the block chain in one
  plain-language line — alongside checks, deferrals and unmet conditions. The
  same event is never told in two places.
- **One row grammar for every log entry** (2026-07-26): kind chip (매수 /
  매도 / 기록) · what happened (strong line + one plain-language detail line)
  · where and when (right-aligned). Fills and engine records share the exact
  same grid so the log reads as a table.
- **Fills only by default.** The log's day-to-day question is "뭘 사고팔았지";
  engine records (unmet conditions, deferrals, passed checks) appear only when
  the person switches the kind filter to 전체 기록. The toolbar carries a
  text search (symbol, rule, partition, detail) and a period select (전체
  기간 · 오늘 · 최근 1주 · 최근 1개월); an empty filter result offers a reset,
  never a blank panel.
- **전략 스냅샷 tab**: launching severs the link to the source strategy
  entirely, so "whether the source changed since" is not a concept — the tab
  shows only what this bot runs, with one note stating that later edits or
  deletion of the source have no effect. A **Basic** snapshot keeps the real
  hierarchy — bot > partitions (symbol and allocation) > buy/sell strategy
  groups (edged with the semantic buy/sell colours) > blocks with the user's
  own values. A **Pro** snapshot is a single graph and renders as a numbered
  execution-order list with branch/merge notes: free node placement makes
  saved coordinates heavy to render and hard to scan, and the editor spec
  already defines the linear execution order as the accessible reading of a
  graph. A **자연어 설명 toggle** rewrites each buy/sell group (or the Pro
  graph) as one plain-language sentence, mirroring the editor's own
  natural-language affordance. A read-only canvas view can be added later
  without changing this default.

## Density and what each screen leaves out

Deciding what not to show is part of the design, not an omission. The rules below are the current decisions.

- Prefer a compact metric row (`MetricRow`, about `70px`) over a grid of `130px` stat cards. The cards spent most of their height on padding.
- Never show the same number twice on one screen. A count that already appears as a panel badge does not also get a tile.
- When a screen owns one subject with several facets, use a master list plus a detail panel with tabs rather than stacking every panel. The bot list drives the bot detail; the previous layout showed one bot's chart above a table of all bots, so the figures never matched the row just read.
- Data-limit disclosure lives in exactly one place: the help page's "이 시험판의 한계" section, with the data timestamp on the account page. Per-page "샘플 데이터" chips were removed (2026-07-26 product decision) — repeating the same disclaimer in every heading was noise. Generated prices and performance are still never presented as live market truth.
- Every surface that can come back empty, fail, or still be working uses the shared `EmptyState`, `ErrorState` and `LoadingState`, so the same situation always looks the same and always says what to do next.

## Home dashboard

Home is a daily check-in, not a work surface, and is sized to fit one desktop
viewport without scrolling. Work pages (bots, backtest) may be long; Home may
not. It uses the standard page width like every other screen. It shows exactly
four things:

**The heading is the standard page heading** — same divider and margins as
every other page; Home gets no special treatment there. The title is a
personal greeting ("반갑습니다, ○○○님", 2026-07-26 decision) and the
description line is the situation sentence — the greeting says "this is your
place", the sentence says whether today needs anything. Below it the alert
unit (count label + banners, `8px` apart) is followed by a full `32px` section
break before the context row, so the actionable unit and the context read as
two distinct groups.

1. **확인이 필요한 작업** — slim one-line alert banners under a small count
   label, not a hero panel: two warnings must not make the whole page read like
   an error screen. **When there is nothing to check, the section does not
   render at all** — an empty inbox showing "all clear" still claims attention;
   the situation sentence in the heading already says today needs nothing. **Only user-actionable, time-bound items
   qualify** — e.g. the independent-bot renewal deadline. Routine engine events
   (rejected orders, unmet conditions) are never tasks: a running bot's strategy
   is locked, so there is nothing to act on, and they are frequent by design —
   they belong to the bot's decision log and notifications. Unfinished drafts
   belong to the strategy page. **A task resolves in place**: its action asks
   for confirmation and the banner disappears once confirmed.
2. **전체 성과** — the aggregate of the bots the person chooses to include.
   P&L and return are one story in two units, so there is **one chart, no view
   toggle**: the line is net P&L in currency (equity minus invested principal,
   zero-based), the summary always shows total · net P&L · time-weighted
   return, and the hovered day's tooltip carries both the P&L and the return.
   A raw equity-sum view is deliberately not offered because it jumps whenever
   a budget is added, and **a bigger budget must never read as profit** —
   injections are neutralised and the return is chain-linked excluding inflow
   days. The subtle solid zero line is the chart's only reference line.
   Bots launch on different dates with different budgets, so each launch
   draws as a dotted vertical marker. Bot selection is a dropdown with label
   groups (each listing the bots it contains) plus per-bot checkboxes; up to
   ten bots can run, so one chip per bot does not scale. Benchmark comparison
   belongs to the backtest page, not here. Left column.
3. **운용 중인 봇** — one compact row per bot: name, where it runs, state,
   return and equity. The competition scope keeps the same small-text format
   as "개인 운용" — only its colour and a tiny trophy differ; a pill chip
   there outweighed the bot's own name (2026-07-26 decision). Right column.
4. **참여 중인 대회** — one row per room a bot is entered in: phase, time
   remaining, and the standing *within that room*. Right column, under the
   bots.

Deliberately not on Home:

- **A single competition rank.** A person can be in several rooms at once, so
  one number is wrong by construction. Standing is always shown per room.
- **The strategy list.** Drafts belong to the strategy page; an unfinished
  strategy already surfaces here as an action item.
- **An activity feed.** It repeated the notification popover and the
  notification centre; activity lives on `/notifications`.
- **Market-status strips, index tickers, watchlist registration.**

## Competition (모의투자)

- The page is titled 모의투자 (nav label too); English locale keeps
  "Competition".
- **One board, pinned officials** (#54, 2026-07-29 decision — replaces the
  2026-07-27 carousel/showcase). The lobby is a left filter rail (232px) plus
  a single bulletin board. Official competitions sit pinned at the top like a
  community board's notices — accent tint plus a 3px inset edge bar, a thick
  divider where the pin block ends — and **never follow the filters**: a
  notice does not get pushed out by a search. Community rooms follow below in
  the same board. The UI assumes exactly three official competitions.
- **Row grammar** (four columns, no table header): kind/number 76px ·
  competition 1fr · D-day 88px · participants 72px, row height 68px. The
  first column carries a 라이브/백테스트 chip for officials (live and
  backtest are scored differently — real-time prices vs a replayed past
  window) and the row number for community rooms, both centre-aligned. The
  name line holds the tone-coloured scoring badge (11px in-row) and, when my
  bot competes there, an accent Bot icon at the end (tooltip carries my
  rank). The sub-line is the host name, or ✔BadgeCheck + "Official" for
  official rows — hosts' names never appear for officials. **Rows end with
  two numbers**; there is no per-row join CTA, arrow, or rank badge — the
  whole row is the button and the detail page says the rest.
- **The view axis is one of three**: 모집 중 (default — people come here to
  find a room to enter) / 진행 중 / 참여 중 (my rooms regardless of status).
  Because the list always shows a single status, rows repeat no status text.
  The old 참가 상태 filter group is absorbed by 참여 중. Remaining rail
  filters: text search (name or host), scoring-method checkboxes, 남은 기간.
  The reset button shows the active-filter count and is disabled at rest.
- **Sorting is fixed at closing-soonest (D-day ascending)** — the row number
  doubles as the urgency order. Column-header sorting and pagination were
  removed with the table (2026-07-29); at ~10 rooms they were cost without
  benefit.
- **Rooms have no participant cap** (2026-07-27 product rule). There is no
  정원, no capacity bar, no "N / M" anywhere — only how many bots joined.
- The scoring method is called 채점 방식 (never "산정 방식"); its badge and
  the `--tone-*` colours are shared with the detail page. Only one
  participating official competition is shown at a time (UI decision,
  2026-07-29).
- **Detail page** (#54, 2026-07-30). The header carries only the lobby
  eyebrow grammar (kind chip + ✔Official, or 개설자 name), the title, one
  description line, the state + D-day text and the single entry button. The
  old title-row progress bar is gone — a percent duplicates the D-day, and
  during recruiting it read 0%. Progress survives in exactly one place: a
  mini bar inside the 기간 cell of the conditions table.
- **Conditions fold inline** behind a `대회 조건 ⌄` toggle attached to the
  bottom edge of the header card (the old info modal is deleted), collapsed
  by default — the title and description read first. **종목 범위 is
  per-competition data** (`universe`): a base universe optionally narrowed by
  an exclude list or replaced by an only-these-tickers list; the fact cell
  shows the summary ("미국 상장 ETF · 2종목 제외", "지정 3종목") with every
  ticker as a chip underneath.
- **Recruiting and running are different screens.** While recruiting, no
  bot is executing, so there is no leaderboard and no fake interim ranking:
  registered bots show as "등록 완료 · 시작 대기", and a notice panel says
  when scoring happens — for a backtest competition, that the whole field
  replays the same past window and is scored in one batch after close.
  While running, the leaderboard leads.
- **The scoring method sits beside the detail title**, not in the leaderboard
  — it decides whether the competition suits a strategy, so it ranks with the
  name. The badge is the button that opens the scoring help dialog; nothing
  repeats it further down.
- **Leaderboard columns are user-chosen** (2026-07-30): a `지표 n/7` popover
  toggles which metrics render as columns — **all seven may be on** (only the
  last one cannot be turned off), with 전체 선택/기본값 shortcuts. Beyond
  three columns the metric columns take a fixed 96px and the table scrolls
  horizontally inside its own container rather than squeezing. **Clicking a
  column header sorts by that metric**; the sort-metric select is gone.
- **The leaderboard folds instead of paginating** — the goal is every one of
  my bots' standings on one screen. Rules: at most `RANKING_FULL_LIMIT` (14)
  entrants shows everything; otherwise keep top 5 (top 10 when I have no
  bot), each of my bots ±1, and **the last place** (how deep the field runs
  is what gives my rank meaning), folding the rest. A run of ≤2 hidden rows
  is never folded (the fold row costs a row itself), and folding is skipped
  entirely when it would save ≤2 rows. **Each fold row expands only its own
  range** — a full-width button reading `N개 더 보기` with the range on the
  right — and a footer line states `전체 N개 중 M개 표시 · K개 접힘` with
  모두 펼치기 / 접어서 보기.
- **`내 봇만 N` toggles a my-bots-only view** of the same table, so bots
  scattered across the field can be compared side by side.
- **One frame only** (2026-07-30): the leaderboard section owns the border and
  radius; the table inside is borderless and header/table/footer are separated
  by hairlines — the same grammar as the lobby board. Legacy
  `.competition-ranking` rules in `base.css` (border, 10px radius, 64px left
  margin) were the source of the stacked-border look and are deleted. Row
  padding is `--space-4` on both edges so the last metric column never touches
  the frame, whatever the column count.
- **My bots' rank spread is stated explicitly**: when two or more of my bots
  compete, a strip above the table reads `내 봇 격차 #1 ↓4 #5 ↓4 #9` with
  `최고 · 최저 · N계단` — during a competition sibling bots can drift hundreds
  of places apart, and that gap is the interesting number.
- **Clicking my bot's name opens it in 봇 운영** (only for bots that exist
  there): `RoomsView` takes an `openBot` callback, App navigates to `/bots`
  with router state, and `BotsView` accepts `initialBot` and switches its
  personal/competition filter so the bot is actually visible.
- **The scoring badge opens a help dialog** listing every scoring method
  with its formula, the current competition's method highlighted — the badge
  name alone does not explain how methods differ. The lobby keeps its hover
  tooltip; the dialog is a detail-page affordance.

## Language

- Supported languages: Korean (`ko`) and English (`en`).
- The language selector lives in the global product navigation.
- The selected language is persisted locally and applied to `document.documentElement.lang`.
- Brand names, ticker symbols, Basic/Pro, Competition, and financial abbreviations remain unchanged.
- Translation must cover visible text, placeholder text, and accessible labels.
- Layouts must not depend on Korean text length; controls allow English labels without clipping.

## Responsive behavior

- At `1380px`, global search collapses before it can overlap primary navigation.
- At `1120px`, the wordmark may collapse before primary navigation.
- At `800px`, primary navigation moves to a horizontally scrollable second row.
- Editors switch to the existing read-only narrow-screen notice.
- Content order and language selection remain available at every supported width.

## Review checklist

- Uses only the shared font roles and spacing tokens.
- No palette value is declared outside `tokens.css`.
- Both themes were opened and compared, not just the dark one.
- Every foreground colour clears 4.5:1 against the surface it actually sits on, including tinted and selected rows.
- No text carries meaning below `9px`.
- Page edges and section baselines align.
- No terminal/balanced terminology or switch remains.
- Korean and English can both complete the same interaction.
- No translated label is clipped at 1280px.
- Focus is visible on every focusable control, including selects and disclosure summaries, and icon-only controls have accessible labels.
- A control that looks interactive does something, or states why it cannot.
- `role="listitem"` is not placed on the control itself; wrap the control in the list item so the button semantics survive.
- Hover and click do not shift surrounding layout.
- No page scrolls horizontally at `375px`; wide tables and charts scroll inside their own container.
