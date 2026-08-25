import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { presentServerValidationFinding } from './views/StrategyViews';

describe('strategy server validation presentation', () => {
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

  test('keeps partition header controls above freely positioned strategy cards', () => {
    const styles = readFileSync('src/styles/balanced.css', 'utf8');
    const headerRule = styles.match(/\.strategy-section-header\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(headerRule).toMatch(/position:\s*relative/);
    expect(headerRule).toMatch(/z-index:\s*3/);
  });
});
