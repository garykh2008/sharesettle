import React, { useState } from 'react';
import { Mail, User, ShieldCheck } from 'lucide-react';
import type { UserSession } from '../types';

interface LoginScreenProps {
  onLogin: (session: UserSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !name.trim()) {
      setError('請填寫所有欄位！');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('請輸入有效的電子信箱格式！');
      return;
    }

    onLogin({
      email: email.trim().toLowerCase(),
      name: name.trim(),
    });
  };

  return (
    <div className="animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'calc(100vh - 100px)' }}>
      <div className="card-glass" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.15)', marginBottom: '20px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <ShieldCheck size={40} className="title-gradient" style={{ stroke: 'url(#indigo-emerald-grad)' }} />
          {/* SVG gradient definition fallback in main page */}
        </div>

        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>
          <span className="title-gradient">ShareSettle</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '28px' }}>
          極簡、流暢的多人分帳與債務優化系統
        </p>

        {error && (
          <div className="alert-banner alert-banner-warning" style={{ textAlign: 'left' }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="form-group">
            <label className="form-label">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={16} /> 電子信箱
              </span>
            </label>
            <input
              type="email"
              className="input-field"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={16} /> 您的暱稱
              </span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="例如：小明"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px' }}>
            登入並開始分帳
          </button>
        </form>
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        <p>此為免密碼 Email 模擬登入，登入資訊將安全儲存於本地瀏覽器。</p>
      </div>
    </div>
  );
};
