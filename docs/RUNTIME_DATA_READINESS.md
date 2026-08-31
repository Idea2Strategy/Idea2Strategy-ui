# Runtime data readiness

## Production UI rule

Production screens display only values confirmed by their runtime API. Seeded
strategies, bots, balances, positions, and performance curves remain available
only to the explicit test/prototype path. Loading, failure, and genuine empty
results must not fall back to those samples.

The production dashboard is intentionally unavailable until an approved
aggregate read contract and provider API exist. Rendering deterministic sample
equity as if it were a live account result would be a false-success state.

## What the current APIs can confirm

- Bot operations confirms bot identity, name, lifecycle state, lifecycle-change
  timestamp, execution blocks, and judgment sequence.
- Bot trading confirms a selected bot's current budget projection, positions,
  orders, fills, decisions, and stop-settlement actions.
- Competition reads confirm room and leaderboard-specific data.
- Backtest performance is historical simulation output. It is not evidence of
  a live or paper-trading account's equity.

These surfaces do not provide account-scoped historical equity, cash-flow
events needed to calculate time-weighted return, bot ownership/type summaries,
or a combined competition participation summary.

## Prerequisite

Dashboard activation requires an implemented service/API contract that defines:

- account-scoped bot identity and personal/competition classification;
- valuation history and its freshness and provenance;
- deposits, withdrawals, and bot capital transfers used to neutralize cash
  flows in return calculations;
- the canonical return and drawdown definitions;
- competition participation summary fields;
- authorization, pagination/range limits, empty-state, and failure semantics.

This document does not propose or approve those protected product meanings. It
records the exact blocker so the UI does not invent a contract.

## External runtime prerequisite

After that contract is approved and implemented, activation still requires a
deployed provider, a real authenticated browser session, and the configured
operator OIDC/AWS trust path. Browser mocks are not acceptable release
evidence. These external prerequisites are separate from the UI's loading,
error, and empty-state implementation.
