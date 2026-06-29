import React, { useState, useEffect } from 'react';
import { Plus, Users, DollarSign, Calendar, LogOut, CreditCard, Trash2, HelpCircle, Bell } from 'lucide-react';
import type { SplitEvent, UserSession, PaymentMethod, Currency } from '../types';
import { HelpModal } from './HelpModal';

interface EventSelectorProps {
  events: SplitEvent[];
  onCreateEvent: (
    title: string,
    supportedCurrencies: Currency[],
    settlementCurrency: Currency,
    exchangeRates: { [key in Currency]?: number },
    desc?: string
  ) => void;
  onSelectEvent: (eventId: string) => void;
  currentUser: UserSession;
  onLogout: () => void;
  onSaveUserPaymentMethods: (methods: PaymentMethod[]) => void;
  onDeleteEvent?: (eventId: string) => void;
  onAcceptInvite?: (eventId: string) => void;
  onDeclineInvite?: (eventId: string) => void;
}

export const EventSelector: React.FC<EventSelectorProps> = ({
  events,
  onCreateEvent,
  onSelectEvent,
  currentUser,
  onLogout,
  onSaveUserPaymentMethods,
  onDeleteEvent,
  onAcceptInvite,
  onDeclineInvite,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  
  // 多幣別與結算配置狀態
  const [supportedCurrencies, setSupportedCurrencies] = useState<Currency[]>(['TWD']);
  const [settlementCurrency, setSettlementCurrency] = useState<Currency>('TWD');
  const [exchangeRates, setExchangeRates] = useState<{ [key in Currency]?: number }>({
    TWD: 1.0,
    USD: 32.5,
    JPY: 0.22
  });

  const getDefaultRate = (c: Currency, target: Currency): number => {
    if (c === target) return 1.0;
    if (c === 'USD' && target === 'TWD') return 32.5;
    if (c === 'TWD' && target === 'USD') return 0.031;
    if (c === 'JPY' && target === 'TWD') return 0.22;
    if (c === 'TWD' && target === 'JPY') return 4.54;
    if (c === 'USD' && target === 'JPY') return 158.5;
    if (c === 'JPY' && target === 'USD') return 0.0063;
    return 1.0;
  };

  const handleSettlementCurrencyChange = (newTarget: Currency) => {
    setSettlementCurrency(newTarget);
    setExchangeRates((prev) => {
      const updated = { ...prev };
      (['TWD', 'USD', 'JPY'] as Currency[]).forEach((c) => {
        updated[c] = getDefaultRate(c, newTarget);
      });
      return updated;
    });
  };

  const [showPaymentEditor, setShowPaymentEditor] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("您的瀏覽器或設備不支援系統通知！");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        new Notification('🔔 系統通知已啟用！', {
          body: '當其他成員在此 App 內新增交易或變更活動狀態時，您將會收到即時通知。',
          icon: '/favicon.svg'
        });
      } else if (permission === 'denied') {
        alert("您已拒絕通知權限。若想啟用，請至瀏覽器設定中允許此網站的通知。");
      }
    } catch (err) {
      console.error("請求通知權限失敗:", err);
    }
  };

  const [userPaymentMethods, setUserPaymentMethods] = useState<PaymentMethod[]>(currentUser.paymentMethods || []);

  useEffect(() => {
    setUserPaymentMethods(currentUser.paymentMethods || []);
  }, [currentUser]);

  // 分類活動：已接受的活動 vs 待接受的邀請
  const activeEvents = events.filter((evt) => {
    const me = evt.members.find((m) => m.email.toLowerCase() === currentUser.email.toLowerCase());
    return me && (me.status === 'active' || !me.status);
  });

  const pendingInvites = events.filter((evt) => {
    const me = evt.members.find((m) => m.email.toLowerCase() === currentUser.email.toLowerCase());
    return me && me.status === 'pending';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (supportedCurrencies.length === 0) {
      alert("請至少選取一個支援的交易幣別！");
      return;
    }

    // 確保結算幣別必在支援交易幣別之中
    const actualSupported = supportedCurrencies.includes(settlementCurrency)
      ? supportedCurrencies
      : [...supportedCurrencies, settlementCurrency];

    onCreateEvent(
      title.trim(),
      actualSupported,
      settlementCurrency,
      exchangeRates,
      desc.trim() || undefined
    );
    setTitle('');
    setDesc('');
    setSupportedCurrencies(['TWD']);
    setSettlementCurrency('TWD');
    setExchangeRates({
      TWD: 1.0,
      USD: 32.5,
      JPY: 0.22
    });
    setShowCreateForm(false);
  };

  return (
    <div className="animate-fade-in">
      {/* 使用者資訊與登出 */}
      <div className="card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' }}>
              {currentUser.name[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: '600', fontSize: '15px' }}>{currentUser.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{currentUser.email}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              className={`btn ${notificationPermission === 'granted' ? 'btn-secondary' : 'btn-primary'}`}
              onClick={requestNotificationPermission}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: notificationPermission === 'granted' ? 'rgba(255, 255, 255, 0.05)' : undefined,
                border: notificationPermission === 'granted' ? '1px solid rgba(255, 255, 255, 0.1)' : undefined
              }}
              title={notificationPermission === 'granted' ? '通知已啟用' : '啟用通知'}
            >
              <Bell size={14} style={{ color: notificationPermission === 'granted' ? '#10b981' : undefined }} />
              {notificationPermission === 'granted' ? '通知已啟用 🟢' : '啟用通知'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowHelp(true)} style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <HelpCircle size={14} /> 使用說明
            </button>
            <button className="btn btn-secondary" onClick={() => setShowPaymentEditor(!showPaymentEditor)} style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CreditCard size={14} /> 收款設定
            </button>
            <button className="btn btn-secondary" onClick={onLogout} style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LogOut size={14} /> 登出
            </button>
          </div>
        </div>

        {showPaymentEditor && (
          <div className="animate-slide-up" style={{ marginTop: '4px', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-secondary)' }}>您的個人收款設定 (多選)</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 現金 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={userPaymentMethods.some(pm => pm.type === 'cash')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setUserPaymentMethods([...userPaymentMethods, { type: 'cash' }]);
                    } else {
                      setUserPaymentMethods(userPaymentMethods.filter(pm => pm.type !== 'cash'));
                    }
                  }}
                  style={{ width: '13px', height: '13px', cursor: 'pointer' }}
                />
                <span>💵 現金</span>
              </label>

              {/* 銀行轉帳 */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={userPaymentMethods.some(pm => pm.type === 'transfer')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setUserPaymentMethods([...userPaymentMethods, { type: 'transfer', bankCode: '', bankAccount: '' }]);
                      } else {
                        setUserPaymentMethods(userPaymentMethods.filter(pm => pm.type !== 'transfer'));
                      }
                    }}
                    style={{ width: '13px', height: '13px', cursor: 'pointer' }}
                  />
                  <span>🏦 銀行轉帳</span>
                </label>
                {userPaymentMethods.some(pm => pm.type === 'transfer') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', paddingLeft: '20px', marginTop: '6px' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="銀行代碼"
                      value={userPaymentMethods.find(pm => pm.type === 'transfer')?.bankCode || ''}
                      onChange={(e) => {
                        setUserPaymentMethods(userPaymentMethods.map(pm => pm.type === 'transfer' ? { ...pm, bankCode: e.target.value } : pm));
                      }}
                      style={{ padding: '4px 8px', fontSize: '12px', height: '28px' }}
                    />
                    <input
                      type="text"
                      className="input-field"
                      placeholder="帳號"
                      value={userPaymentMethods.find(pm => pm.type === 'transfer')?.bankAccount || ''}
                      onChange={(e) => {
                        setUserPaymentMethods(userPaymentMethods.map(pm => pm.type === 'transfer' ? { ...pm, bankAccount: e.target.value } : pm));
                      }}
                      style={{ padding: '4px 8px', fontSize: '12px', height: '28px' }}
                    />
                  </div>
                )}
              </div>

              {/* LinePay */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={userPaymentMethods.some(pm => pm.type === 'linepay')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setUserPaymentMethods([...userPaymentMethods, { type: 'linepay', lineId: '' }]);
                      } else {
                        setUserPaymentMethods(userPaymentMethods.filter(pm => pm.type !== 'linepay'));
                      }
                    }}
                    style={{ width: '13px', height: '13px', cursor: 'pointer' }}
                  />
                  <span>💬 LinePay</span>
                </label>
                {userPaymentMethods.some(pm => pm.type === 'linepay') && (
                  <div style={{ paddingLeft: '20px', marginTop: '6px' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Line ID"
                      value={userPaymentMethods.find(pm => pm.type === 'linepay')?.lineId || ''}
                      onChange={(e) => {
                        setUserPaymentMethods(userPaymentMethods.map(pm => pm.type === 'linepay' ? { ...pm, lineId: e.target.value } : pm));
                      }}
                      style={{ padding: '4px 8px', fontSize: '12px', height: '28px', width: '100%' }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowPaymentEditor(false);
                  setUserPaymentMethods(currentUser.paymentMethods || []);
                }}
                style={{ padding: '3px 8px', fontSize: '11px', height: '24px' }}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onSaveUserPaymentMethods(userPaymentMethods);
                  setShowPaymentEditor(false);
                }}
                style={{ padding: '3px 12px', fontSize: '11px', height: '24px' }}
              >
                儲存設定
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          className={`btn ${!showCreateForm ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowCreateForm(false)}
          style={{ flex: 1 }}
        >
          分帳活動列表
        </button>
        <button
          className={`btn ${showCreateForm ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowCreateForm(true)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <Plus size={16} /> 建立新活動
        </button>
      </div>

      {!showCreateForm ? (
        <div className="animate-fade-in">
          {/* 📩 新的活動邀請區塊 */}
          {pendingInvites.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary-light)' }}>
                📩 新的活動邀請 ({pendingInvites.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingInvites.map((evt) => (
                  <div key={evt.id} className="card-glass" style={{ borderLeft: '4px solid var(--color-primary-light)', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{evt.title}</h3>
                        {evt.description && (
                          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', lineClamp: 2, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {evt.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '12px', color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px' }}>
                          <span>👥 {evt.members.length} 位成員</span>
                          <span>📅 {new Date(evt.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => onAcceptInvite && onAcceptInvite(evt.id)}
                          style={{ padding: '6px 12px', fontSize: '12px', height: '28px' }}
                        >
                          接受
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => onDeclineInvite && onDeclineInvite(evt.id)}
                          style={{ padding: '6px 12px', fontSize: '12px', height: '28px', color: 'var(--color-danger)' }}
                        >
                          拒絕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>您的分帳活動</h2>

          {activeEvents.length === 0 ? (
            <div className="card-glass" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>
              <CreditCard size={48} style={{ margin: '0 auto 16px', opacity: 0.4, color: 'var(--color-primary-light)' }} />
              <p style={{ fontWeight: '500', marginBottom: '8px' }}>尚無分帳活動</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                您可以點擊上方「建立新活動」來開始，或向朋友索取分享連結/代碼。
              </p>
              <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
                立即建立活動
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="card-glass"
                  onClick={() => onSelectEvent(evt.id)}
                  style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: '600', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      {evt.title}
                      {evt.status === 'settled' && (
                        <span className="badge badge-emerald" style={{ textTransform: 'none', fontSize: '9px', padding: '1px 5px' }}>
                          已結清
                        </span>
                      )}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className={`badge ${evt.defaultCurrency === 'USD' ? 'badge-indigo' : 'badge-emerald'}`}>
                        {evt.defaultCurrency}
                      </span>
                    </div>
                  </div>
                  {evt.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineClamp: 2, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {evt.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Users size={12} /> {evt.members.length} 位成員
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <DollarSign size={12} /> {evt.expenses.length} 筆款項
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                      <Calendar size={12} /> {new Date(evt.createdAt).toLocaleDateString()}
                    </span>
                    {onDeleteEvent && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`確定要刪除/退出「${evt.title}」活動嗎？此操作將在雲端及本地永久刪除此活動。`)) {
                            onDeleteEvent(evt.id);
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: '8px' }}
                        title="刪除活動"
                      >
                        <Trash2 size={12} style={{ color: 'var(--color-danger)' }} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card-glass animate-slide-up" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus className="title-gradient" /> 建立新分帳事件
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">活動名稱 *</label>
              <input
                type="text"
                className="input-field"
                placeholder="例如：日本雙人遊、週末聚餐"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">簡介（選填）</label>
              <textarea
                className="input-field"
                placeholder="活動的備註說明..."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                style={{ resize: 'vertical', minHeight: '80px' }}
              />
            </div>

            {/* 交易幣別與結算配置 */}
            <div className="form-group">
              <label className="form-label">支援交易幣別 (複選)</label>
              <div style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                {(['TWD', 'USD', 'JPY'] as Currency[]).map((c) => {
                  const isChecked = supportedCurrencies.includes(c);
                  return (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSupportedCurrencies([...supportedCurrencies, c]);
                          } else {
                            // 至少留一個，且不能移除當前的結算幣別
                            if (supportedCurrencies.length > 1 && c !== settlementCurrency) {
                              setSupportedCurrencies(supportedCurrencies.filter((curr) => curr !== c));
                            }
                          }
                        }}
                        style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                      />
                      <span>{c}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">結算本位幣別</label>
                <select
                  className="input-field select-field"
                  value={settlementCurrency}
                  onChange={(e) => handleSettlementCurrencyChange(e.target.value as Currency)}
                >
                  {supportedCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c === 'TWD' ? '新台幣 (TWD)' : c === 'USD' ? '美金 (USD)' : '日圓 (JPY)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">匯率設定</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {supportedCurrencies
                    .filter((c) => c !== settlementCurrency)
                    .map((c) => (
                      <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <span style={{ whiteSpace: 'nowrap' }}>1 {c} = </span>
                        <input
                          type="number"
                          className="input-field"
                          value={exchangeRates[c] || ''}
                          step="0.0001"
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setExchangeRates((prev) => ({ ...prev, [c]: val }));
                          }}
                          style={{ width: '80px', padding: '4px 8px', height: '30px', fontSize: '13px' }}
                          required
                        />
                        <span style={{ whiteSpace: 'nowrap' }}>{settlementCurrency}</span>
                      </div>
                    ))}
                  {supportedCurrencies.filter((c) => c !== settlementCurrency).length === 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', paddingTop: '6px' }}>
                      無須匯率轉換 (單一幣別活動)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateForm(false)}
                style={{ flex: 1 }}
              >
                取消
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={!title.trim()}
              >
                確認建立
              </button>
            </div>
          </form>
        </div>
      )}

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};
