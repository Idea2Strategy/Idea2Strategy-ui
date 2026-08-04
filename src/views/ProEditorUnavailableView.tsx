import { LockKeyhole } from 'lucide-react';
import { Button, EmptyState, PageHeading, Panel } from '../components/common';
import { Localized } from '../lib/i18n';

export function ProEditorUnavailableView({ goBack }: { goBack: () => void }) {
  return <Localized><div className="page">
    <PageHeading
      eyebrow="STRATEGY DESK / PRO"
      title="Pro 편집기는 준비 중입니다"
      description="완성되지 않은 기능이 전략에 반영되지 않도록 현재 접근을 잠갔습니다."
    />
    <Panel>
      <EmptyState
        icon={LockKeyhole}
        title="현재 사용할 수 없습니다"
        detail="Pro 편집기의 저장·검증 흐름이 준비되면 다시 열립니다. 지금은 Basic 편집기를 이용해 주세요."
        action={<Button kind="primary" onClick={goBack}>전략 목록으로 돌아가기</Button>}
      />
    </Panel>
  </div></Localized>;
}
