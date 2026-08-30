import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import type { StrategyValidationFinding } from './api/strategies';
import { collapseServerValidationFindings, presentServerValidationFinding } from './views/StrategyViews';

describe('strategy server validation presentation', () => {
  test('keeps legacy validation findings without requirements renderable', () => {
    const finding = {
      severity: 'WARNING',
      code: 'REPEATED_ORDER_EXPOSURE',
      message: 'Repeated order exposure',
      location: 'groups[0].blocks[2].parameters.maxExecutions',
    } as StrategyValidationFinding;

    expect(collapseServerValidationFindings([finding], { groups: [] })).toEqual([finding]);
  });

  test('turns execution warnings and semantic paths into actionable Korean copy', () => {
    expect(presentServerValidationFinding({
      severity: 'WARNING',
      code: 'REPEATED_ORDER_EXPOSURE',
      location: 'groups[0].blocks[2].parameters.maxExecutions',
      message: 'Repeated execution can increase exposure',
      requirements: [],
    })).toEqual({
      message: '반복 매수는 한 종목의 보유 비중을 빠르게 높일 수 있습니다.',
      location: '첫 번째 전략 흐름 · 3번째 블록 · 최대 실행 횟수',
    });

    expect(presentServerValidationFinding({
      severity: 'WARNING',
      code: 'SELL_REQUIRES_POSITION',
      location: 'groups[1].container',
      message: 'A sell flow is skipped when no position is held',
      requirements: [],
    })).toEqual({
      message: '보유 수량이 없을 때는 이 매도 조건이 충족되어도 주문하지 않습니다.',
      location: '두 번째 전략 흐름 · 매수/매도 구분',
    });
  });

  test('keeps unknown server detail while removing raw JSON-path notation', () => {
    expect(presentServerValidationFinding({
      severity: 'ERROR', code: 'NEW_SERVER_RULE',
      location: 'groups[2].blocks[0].parameters.threshold',
      message: '새 서버 규칙을 확인해 주세요.', requirements: [],
    })).toEqual({
      message: '새 서버 규칙을 확인해 주세요.',
      location: '3번째 전략 흐름 · 1번째 블록 · 기준값',
    });
  });

  test('presents backtest input requirements as information in Korean', () => {
    expect(presentServerValidationFinding({
      severity: 'INFORMATION', code: 'BACKTEST_FEATURE_REQUIRED',
      location: 'groups[2].blocks[1].elementCode',
      message: 'Backtest requires this exact historical feature', requirements: ['feature:rsi:14'],
    })).toEqual({
      message: '백테스트 계산에 필요한 보조 지표가 자동으로 준비됩니다.',
      location: '백테스트 입력 데이터',
    });
  });

  test('collapses the same card warning expanded once per instrument', () => {
    const findings = [0, 1].map((group) => ({
      severity: 'WARNING' as const,
      code: 'REPEATED_ORDER_EXPOSURE',
      location: `groups[${group}].blocks[2].parameters.maxExecutions`,
      message: 'Repeated execution can increase exposure',
      requirements: [],
    }));
    const semantic = { groups: [
      { allocationGroupId: 'trend-buy' },
      { allocationGroupId: 'trend-buy' },
    ] };

    expect(collapseServerValidationFindings(findings, semantic)).toHaveLength(1);
  });

  test('keeps partition header controls above freely positioned strategy cards', () => {
    const styles = readFileSync('src/styles/balanced.css', 'utf8');
    const headerRule = styles.match(/\.strategy-section-header\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(headerRule).toMatch(/position:\s*relative/);
    expect(headerRule).toMatch(/z-index:\s*3/);
  });
});
