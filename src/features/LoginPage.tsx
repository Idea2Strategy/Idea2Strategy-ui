import { ArrowRight, Blocks, ChartNoAxesCombined, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../components/AppShell';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="login-page">
      <section className="login-visual">
        <BrandMark />
        <div className="login-visual__copy">
          <span className="eyebrow">IDEA TO STRATEGY</span>
          <h1>아이디어를<br />직접 움직이는 구조로.</h1>
          <p>특정 종목이나 수치를 추천하지 않습니다. 원하는 종목과 모든 판단 기준을 직접 선택합니다.</p>
        </div>
        <div className="login-flow">
          <span><Blocks size={16} /> 구성</span><ArrowRight size={14} />
          <span><ChartNoAxesCombined size={16} /> 백테스트</span><ArrowRight size={14} />
          <span><ShieldCheck size={16} /> 라이브 모의</span>
        </div>
        <div className="login-visual__grid" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-card">
          <span className="eyebrow">DEMO LOGIN</span>
          <h2>다시 오신 것을 환영합니다</h2>
          <p>실제 인증 없이 개선된 사용자 흐름을 체험하는 실행형 샘플입니다.</p>
          <label className="field"><span>이메일</span><input defaultValue="student@i2s.demo" /></label>
          <label className="field"><span>비밀번호</span><input type="password" defaultValue="12345678" /></label>
          <button className="button button--primary button--full button--large" onClick={onLogin}>로그인하고 시작하기 <ArrowRight size={15} /></button>
          <small>로그인 이후부터 5분 첫 성공 흐름을 시작합니다.</small>
        </div>
      </section>
    </div>
  );
}
