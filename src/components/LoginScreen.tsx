import React, { useState } from 'react';
import { Mail, User, ShieldCheck, Lock } from 'lucide-react';
import type { UserSession } from '../types';
import { supabase, isSupabaseConfigured } from '../supabase';

interface LoginScreenProps {
  onLogin: (session: UserSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'mock'>((isSupabaseConfigured) ? 'login' : 'mock');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 處理 Mock 登入
  const handleMockSubmit = (e: React.FormEvent) => {
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

  // 處理 Supabase 真實認證 (登入或註冊)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('請輸入有效的電子信箱格式！');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('密碼長度必須至少為 6 個字元！');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'signup') {
        if (!name.trim()) {
          setError('請填寫您的稱呼/姓名！');
          setLoading(false);
          return;
        }
        // 註冊，並加上 dynamic emailRedirectTo 指向當前網頁 Host URL (無論是 localhost 或是區域網路 IP)
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              name: name.trim(),
            },
            emailRedirectTo: window.location.origin,
          },
        });        if (signUpError) throw signUpError;

        if (data.user) {
          setError('註冊成功！正在為您自動登入並進入系統...');
        }
      } else {
        // 登入
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (signInError) throw signInError;

        if (data.session) {
          // 登入成功，這會被 App.tsx 中的 onAuthStateChange 捕捉
        }
      }
    } catch (err: any) {
      setError(err.message || '認證程序發生錯誤，請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'calc(100vh - 100px)' }}>
      <div className="card-glass" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.15)', marginBottom: '20px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <ShieldCheck size={40} className="title-gradient" style={{ stroke: 'url(#indigo-emerald-grad)' }} />
        </div>

        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>
          <span className="title-gradient">ShareSettle</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
          極簡、流暢的多人分帳與債務優化系統
        </p>

        {/* 雲端模式下的登入 / 註冊切換分頁 */}
        {isSupabaseConfigured && (
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '4px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => { setMode('login'); setError(''); }}
              style={{ flex: 1, padding: '8px', border: 'none', background: mode === 'login' ? 'var(--color-primary)' : 'transparent', color: mode === 'login' ? 'white' : 'var(--text-secondary)', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              登入
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              style={{ flex: 1, padding: '8px', border: 'none', background: mode === 'signup' ? 'var(--color-primary)' : 'transparent', color: mode === 'signup' ? 'white' : 'var(--text-secondary)', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              註冊帳號
            </button>
          </div>
        )}

        {error && (
          <div className="alert-banner alert-banner-warning" style={{ textAlign: 'left', marginBottom: '16px' }}>
            <span>{error}</span>
          </div>
        )}

        {/* 模擬登入表單 */}
        {mode === 'mock' ? (
          <form onSubmit={handleMockSubmit} style={{ textAlign: 'left' }}>
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
        ) : (
          /* 真實 Supabase 登入 / 註冊表單 */
          <form onSubmit={handleAuthSubmit} style={{ textAlign: 'left' }}>
            {mode === 'signup' && (
              <div className="form-group">
                <label className="form-label">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={16} /> 您的稱呼/姓名
                  </span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="例如：王小明"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

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
                  <Lock size={16} /> 密碼 (至少 6 個字元)
                </span>
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="請輸入密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {loading ? '處理中...' : mode === 'login' ? '登入系統' : '註冊帳號'}
            </button>
          </form>
        )}
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        {isSupabaseConfigured ? (
          <p>🔒 已啟用 Supabase 雲端安全身分驗證模式</p>
        ) : (
          <p>此為免密碼 Email 模擬登入，登入資訊將安全儲存於本地瀏覽器。</p>
        )}
      </div>
    </div>
  );
};
