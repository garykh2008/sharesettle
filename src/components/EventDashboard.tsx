import React, { useState } from 'react';
import { ArrowLeft, Plus, Users, DollarSign, Share2, Settings, Trash2, Edit2, CheckCircle2, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { SplitEvent, Member, Expense, UserSession, PaymentMethod } from '../types';
import { calculateSettlements, convertCurrency, serializeEvent, round } from '../utils';
import { isSupabaseConfigured } from '../supabase';
import { ExpenseModal } from './ExpenseModal';

interface EventDashboardProps {
  event: SplitEvent;
  onBack: () => void;
  onUpdateEvent: (updatedEvent: SplitEvent) => void;
  currentUser: UserSession;
  onSwitchSimulatedUser: (session: UserSession) => void;
}

export const EventDashboard: React.FC<EventDashboardProps> = ({
  event,
  onBack,
  onUpdateEvent,
  currentUser,
  onSwitchSimulatedUser,
}) => {
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement' | 'members'>('expenses');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');

  // 編輯活動基本設定
  const [eventTitle, setEventTitle] = useState(event.title);
  const [eventDesc, setEventDesc] = useState(event.description || '');
  const [eventRate, setEventRate] = useState(event.usdToTwdRate);

  // 記帳 Modal 控制
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  // 展開/收合款項明細
  const [expandedExpenses, setExpandedExpenses] = useState<{ [id: string]: boolean }>({});

  // 複製連結的 Toast 狀態
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');


  // 計算結算
  const settlements = calculateSettlements(event);

  // 複製分享代碼與 URL
  const handleShare = () => {
    const shareUrl = isSupabaseConfigured
      ? `${window.location.origin}${window.location.pathname}#/join/${event.id}`
      : `${window.location.origin}${window.location.pathname}#/import/${serializeEvent(event)}`;
    
    // 試圖複製到剪貼簿
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setToastMsg('分享連結已複製到剪貼簿！');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      })
      .catch(() => {
        // 退回複製代碼
        const fallbackText = isSupabaseConfigured ? event.id : serializeEvent(event) || '';
        navigator.clipboard.writeText(fallbackText);
        setToastMsg('分享代碼已複製到剪貼簿！');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      });
  };

  // 複製單純的分享代碼
  const handleCopyCode = () => {
    const codeText = isSupabaseConfigured ? event.id : serializeEvent(event) || '';
    navigator.clipboard.writeText(codeText);
    setToastMsg(isSupabaseConfigured ? '雲端活動 ID 已複製！' : '活動代碼已複製！');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // 新增成員
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError('');

    if (!newMemberName.trim() || !newMemberEmail.trim()) {
      setMemberError('請填寫完整資訊！');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newMemberEmail.trim())) {
      setMemberError('請輸入正確的電子信箱格式！');
      return;
    }

    // 檢查 email 是否重複
    const exists = event.members.some(
      (m) => m.email.toLowerCase() === newMemberEmail.trim().toLowerCase()
    );
    if (exists) {
      setMemberError('該 Email 已在成員列表中！');
      return;
    }

    let paymentMethods: PaymentMethod[] = [];
    try {
      const profilesStr = localStorage.getItem('sharesettle_user_profiles');
      if (profilesStr) {
        const profiles = JSON.parse(profilesStr);
        const emailKey = newMemberEmail.trim().toLowerCase();
        if (profiles[emailKey] && profiles[emailKey].paymentMethods) {
          paymentMethods = profiles[emailKey].paymentMethods;
        }
      }
    } catch (e) {
      console.error(e);
    }

    const newMember: Member = {
      id: Math.random().toString(36).substring(2, 9),
      name: newMemberName.trim(),
      email: newMemberEmail.trim().toLowerCase(),
      paymentMethods
    };

    onUpdateEvent({
      ...event,
      members: [...event.members, newMember],
    });

    setNewMemberName('');
    setNewMemberEmail('');
    setShowAddMember(false);
  };

  // 刪除成員 (若該成員有交易記錄則不允許刪除)
  const handleDeleteMember = (memberId: string) => {
    const hasExpenses = event.expenses.some(
      (exp) => exp.paidById === memberId || exp.splits.some((s) => s.memberId === memberId && s.amount > 0)
    );

    if (hasExpenses) {
      alert('該成員在此活動中已有帳目記錄，無法刪除。');
      return;
    }

    onUpdateEvent({
      ...event,
      members: event.members.filter((m) => m.id !== memberId),
    });
  };

  // 儲存活動設定變更
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateEvent({
      ...event,
      title: eventTitle.trim(),
      description: eventDesc.trim() || undefined,
      usdToTwdRate: parseFloat(eventRate.toString()) || 32.0,
    });
    setShowSettings(false);
    setToastMsg('活動設定已更新！');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 新增或更新交易
  const handleSaveExpense = (expenseData: Omit<Expense, 'id'> & { id?: string }) => {
    let updatedExpenses = [...event.expenses];
    
    if (expenseData.id) {
      // 編輯
      updatedExpenses = updatedExpenses.map((exp) =>
        exp.id === expenseData.id ? (expenseData as Expense) : exp
      );
      setToastMsg('帳目已修改！');
    } else {
      // 新增
      const newExpense: Expense = {
        ...expenseData,
        id: Math.random().toString(36).substring(2, 9),
      };
      updatedExpenses = [newExpense, ...updatedExpenses];
      setToastMsg('帳目已新增！');
    }

    onUpdateEvent({
      ...event,
      expenses: updatedExpenses,
    });
    setExpenseToEdit(null);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 刪除交易
  const handleDeleteExpense = (expenseId: string) => {
    if (window.confirm('確定要刪除此筆交易嗎？')) {
      onUpdateEvent({
        ...event,
        expenses: event.expenses.filter((e) => e.id !== expenseId),
      });
      setToastMsg('帳目已刪除！');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  };

  const toggleExpandExpense = (id: string) => {
    setExpandedExpenses((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 取得成員名稱
  const getMemberName = (id: string) => {
    const m = event.members.find((mem) => mem.id === id);
    return m ? m.name : '未知成員';
  };

  // 計算每個人在結算本位幣下的收支平衡
  const getMemberBalances = () => {
    const balances: { [id: string]: number } = {};
    event.members.forEach((m) => {
      balances[m.id] = 0;
    });

    event.expenses.forEach((exp) => {
      const expInDefault = convertCurrency(exp.amount, exp.currency, event.defaultCurrency, event.usdToTwdRate);
      balances[exp.paidById] += expInDefault;

      exp.splits.forEach((s) => {
        const splitInDefault = convertCurrency(s.amount, exp.currency, event.defaultCurrency, event.usdToTwdRate);
        balances[s.memberId] -= splitInDefault;
      });
    });

    return Object.keys(balances).map((id) => ({
      id,
      name: getMemberName(id),
      net: round(balances[id]),
    }));
  };

  const memberBalances = getMemberBalances();

  // 判定當前模擬使用者在 event 中所對應的 Member 物件
  const activeEventMember = event.members.find(
    (m) => m.email.toLowerCase() === currentUser.email.toLowerCase()
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
      {/* 頂部導航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button className="btn btn-secondary btn-icon" onClick={onBack} style={{ width: '36px', height: '36px' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '19px', fontWeight: '700', lineHeight: 1.2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            {event.title}
            {event.status === 'settled' ? (
              <span className="badge badge-emerald" style={{ textTransform: 'none', fontSize: '10px' }}>已結清</span>
            ) : (event.settlements && event.settlements.length > 0 ? (
              <span className="badge badge-warning" style={{ textTransform: 'none', fontSize: '10px' }}>結算中</span>
            ) : null)}
          </h2>
          {event.description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{event.description}</p>
          )}
        </div>
        <button className="btn btn-secondary btn-icon" onClick={handleShare} style={{ width: '36px', height: '36px' }} title="分享此活動">
          <Share2 size={16} />
        </button>
        <button className="btn btn-secondary btn-icon" onClick={() => setShowSettings(!showSettings)} style={{ width: '36px', height: '36px' }} title="活動設定">
          <Settings size={16} />
        </button>
      </div>

      {/* 活動設定編輯面板 */}
      {showSettings && (
        <div className="card-glass animate-slide-up" style={{ padding: '16px', marginBottom: '16px', border: '1px solid var(--color-primary)' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>編輯活動設定</h3>
          <form onSubmit={handleSaveSettings}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>活動名稱</label>
              <input
                type="text"
                className="input-field"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '14px' }}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>活動說明</label>
              <input
                type="text"
                className="input-field"
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '14px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontSize: '12px' }}>美元兌台幣匯率 (1 USD = ? TWD)</label>
              <input
                type="number"
                className="input-field"
                step="0.01"
                value={eventRate}
                onChange={(e) => setEventRate(parseFloat(e.target.value) || 0)}
                style={{ padding: '8px 12px', fontSize: '14px' }}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSettings(false)} style={{ padding: '6px 12px', fontSize: '13px' }}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }}>
                儲存設定
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 切換模擬帳號功能 (幫助使用者在本機切換視角測試) */}
      <div className="card-glass" style={{ padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '13px', background: 'rgba(99, 102, 241, 0.05)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>當前模擬視角:</span>
        {activeEventMember ? (
          <span style={{ fontWeight: 'bold', color: 'var(--color-primary-light)' }}>
            {activeEventMember.name} ({activeEventMember.email})
          </span>
        ) : (
          <span style={{ color: 'var(--color-danger)' }}>
            非活動成員 ({currentUser.email})
          </span>
        )}
        
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>模擬切換:</span>
          <select
            className="input-field"
            value={activeEventMember?.id || ''}
            onChange={(e) => {
              const m = event.members.find((mem) => mem.id === e.target.value);
              if (m) {
                onSwitchSimulatedUser({ email: m.email, name: m.name });
              }
            }}
            style={{ padding: '2px 8px', fontSize: '12px', width: 'auto', background: 'var(--bg-main)', height: '26px', borderRadius: '4px' }}
          >
            <option value="" disabled>選擇活動成員</option>
            {event.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 功能分頁選單 */}
      <div className="tabs-container" style={{ marginBottom: '16px' }}>
        <button
          className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          帳目歷史 ({event.expenses.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'settlement' ? 'active' : ''}`}
          onClick={() => setActiveTab('settlement')}
        >
          結算分析
        </button>
        <button
          className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          成員管理 ({event.members.length})
        </button>
      </div>

      {/* 分頁內容 */}
      <div style={{ flex: 1 }}>
        {activeTab === 'expenses' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px' }}>消費項目列表</h3>
              {(!event.settlements || event.settlements.length === 0) ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setExpenseToEdit(null);
                    setIsExpenseModalOpen(true);
                  }}
                  style={{ padding: '8px 16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={14} /> 記一筆
                </button>
              ) : (
                event.status === 'settled' ? (
                  <span className="badge badge-emerald" style={{ padding: '6px 10px', fontSize: '11px', textTransform: 'none' }}>
                    已結清
                  </span>
                ) : (
                  <span className="badge badge-rose" style={{ padding: '6px 10px', fontSize: '11px', textTransform: 'none' }}>
                    記帳鎖定中
                  </span>
                )
              )}
            </div>
            {event.settlements && event.settlements.length > 0 && event.status !== 'settled' && (
              <div className="alert-banner alert-banner-warning animate-fade-in" style={{ fontSize: '13px', margin: '4px 0 4px 0' }}>
                <span>🔒 活動結算中，交易明細已暫時鎖定。如需修改帳目，請先至「結算分析」分頁取消結算。</span>
              </div>
            )}

            {event.expenses.length === 0 ? (
              <div className="card-glass" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', marginTop: '10px' }}>
                <DollarSign size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontSize: '14px' }}>此活動目前沒有記帳項目。</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  請點擊右上角「記一筆」新增第一筆消費！
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                {event.expenses.map((exp) => {
                  const isExpanded = !!expandedExpenses[exp.id];
                  const paidByName = getMemberName(exp.paidById);
                  const expCurrencySym = exp.currency === 'USD' ? '$' : 'NT$';

                  // 判定當前模擬帳號在此筆款項中的分攤金額
                  const mySplit = exp.splits.find((s) => s.memberId === activeEventMember?.id);
                  const isPayer = exp.paidById === activeEventMember?.id;

                  return (
                    <div key={exp.id} className="card-glass" style={{ padding: '14px', marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div onClick={() => toggleExpandExpense(exp.id)} style={{ cursor: 'pointer', flex: 1 }}>
                          <h4 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {exp.title}
                            {/* 如果有包含比例小費標記 */}
                            {exp.splits.some((s) => s.baseAmount !== undefined && s.baseAmount > 0) && (
                              <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 5px' }}>
                                小費
                              </span>
                            )}
                          </h4>
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            由 <strong>{paidByName}</strong> 支付 {expCurrencySym}{exp.amount.toFixed(2)} · {new Date(exp.date).toLocaleDateString()}
                          </p>
                        </div>

                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                            {expCurrencySym}{exp.amount.toFixed(2)}
                          </div>
                          
                          {/* 針對當前使用者的個人化提示 */}
                          {activeEventMember && (
                            <span style={{ fontSize: '11px' }}>
                              {isPayer ? (
                                <span style={{ color: 'var(--color-secondary-light)' }}>您付了款</span>
                              ) : mySplit && mySplit.amount > 0 ? (
                                <span style={{ color: 'var(--color-warning)' }}>您需付 {expCurrencySym}{mySplit.amount.toFixed(2)}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>無您分攤</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 展開之分攤詳細清單 */}
                      {isExpanded ? (
                        <div className="animate-fade-in" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '13px' }}>
                          
                          {/* 品項明細顯示 */}
                          {exp.items && exp.items.length > 0 && (
                            <div style={{ marginBottom: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>品項細項明細：</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                                {exp.items.map((it) => (
                                  <div key={it.id} style={{ display: 'flex', flexDirection: 'column', padding: '4px 0', borderBottom: '1px dashed rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontWeight: '500' }}>{it.name}</span>
                                      <span style={{ fontWeight: 'bold' }}>{expCurrencySym}{it.amount.toFixed(2)}</span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                                      由 {it.memberIds.map(mid => getMemberName(mid)).join(', ')} 平分 ({it.memberIds.length} 人，每人 {expCurrencySym}{round(it.amount / it.memberIds.length).toFixed(2)})
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>
                            {exp.items && exp.items.length > 0 ? '成員應付總計 (含小費分攤)：' : '分攤明細：'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {exp.splits.map((s) => {
                              if (s.amount <= 0) return null;
                              return (
                                <div key={s.memberId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{getMemberName(s.memberId)}</span>
                                  <span style={{ color: 'var(--text-primary)' }}>
                                    {expCurrencySym}{s.amount.toFixed(2)}
                                    {s.baseAmount !== undefined && s.baseAmount > 0 && (
                                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                        (底:{s.baseAmount} + 費:{s.tipAmount?.toFixed(2)})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* 編輯與刪除按鈕 (結算中鎖定) */}
                          {(!event.settlements || event.settlements.length === 0) ? (
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => {
                                  setExpenseToEdit(exp);
                                  setIsExpenseModalOpen(true);
                                }}
                                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Edit2 size={12} /> 編輯
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => handleDeleteExpense(exp.id)}
                                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Trash2 size={12} /> 刪除
                              </button>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                              🔒 本筆交易已鎖定，解鎖後方可修改。
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* 展開收合指示 */}
                      <div
                        onClick={() => toggleExpandExpense(exp.id)}
                        style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', marginTop: '6px', paddingTop: '4px' }}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settlement' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* 1. 成員收支總覽 (本位幣) */}
            <div className="card-glass" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} className="title-gradient" /> 成員收支狀態 ({event.defaultCurrency})
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {memberBalances.map((mb) => {
                  const isPositive = mb.net > 0;
                  const isZero = Math.abs(mb.net) <= 0.005;

                  return (
                    <div key={mb.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ fontWeight: mb.id === activeEventMember?.id ? 'bold' : 'normal' }}>
                        {mb.name} {mb.id === activeEventMember?.id && <span style={{ fontSize: '10px', color: 'var(--color-primary-light)' }}>(您)</span>}
                      </span>
                      
                      <span style={{
                        fontWeight: 'bold',
                        color: isZero ? 'var(--text-muted)' : (isPositive ? 'var(--color-secondary-light)' : 'var(--color-danger)')
                      }}>
                        {isZero ? '已結清' : (isPositive ? `應收 +${mb.net.toFixed(2)}` : `應付 ${mb.net.toFixed(2)}`)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 結算追蹤與控制 */}
            {event.settlements && event.settlements.length > 0 ? (
              <div className="card-glass animate-slide-up" style={{ padding: '16px', border: event.status === 'settled' ? '1px solid var(--color-secondary)' : '1px solid var(--color-primary)' }}>
                {event.status === 'settled' ? (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--color-secondary-light)', marginBottom: '8px' }}>本活動已完全結清！</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      所有成員皆已完成收付款。若要恢復活動以進行修改，可隨時重啟。
                    </p>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        onUpdateEvent({
                          ...event,
                          status: undefined,
                          settlements: undefined
                        });
                        setToastMsg('活動已重啟解鎖。');
                        setShowToast(true);
                        setTimeout(() => setShowToast(false), 2000);
                      }}
                      style={{ width: '100%', padding: '10px' }}
                    >
                      重啟活動 (解鎖)
                    </button>
                  </div>
                ) : (
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-warning)', marginBottom: '6px' }}>
                      ⏳ 結算進行中
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                      帳目與成員清單已鎖定。待所有條目支付完成後，活動將自動封存為「已結清」。
                    </p>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        onUpdateEvent({
                          ...event,
                          status: undefined,
                          settlements: undefined
                        });
                        setToastMsg('已取消結算，帳目已解鎖。');
                        setShowToast(true);
                        setTimeout(() => setShowToast(false), 2000);
                      }}
                      style={{ width: '100%', padding: '10px', fontSize: '13px' }}
                    >
                      取消結算 (解鎖)
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {/* 2. 建議收付款方案 / 結算進度追蹤 */}
            <div className="card-glass" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} className="title-gradient" /> 
                {event.settlements && event.settlements.length > 0 ? '結算支付進度追蹤' : '建議收付款方案'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                {event.settlements && event.settlements.length > 0 
                  ? '請點選「確認支付」以更新轉帳記錄。付款按鈕僅在您切換至該付款人視角時顯示。' 
                  : '系統已自動計算並最佳化簡化轉帳路徑，以減少不必要的轉帳次數。'}
              </p>

              {/* 顯示結算進度 */}
              {event.settlements && event.settlements.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {event.settlements.map((tx, idx) => {
                    const fromName = getMemberName(tx.fromId);
                    const toName = getMemberName(tx.toId);
                    const currencySym = event.defaultCurrency === 'USD' ? '$' : 'NT$';

                    const altCurrency = event.defaultCurrency === 'TWD' ? 'USD' : 'TWD';
                    const altAmount = convertCurrency(tx.amount, event.defaultCurrency, altCurrency, event.usdToTwdRate);
                    const altCurrencySym = altCurrency === 'USD' ? '$' : 'NT$';

                    const isPayer = tx.fromId === activeEventMember?.id;
                    const isReceiver = tx.toId === activeEventMember?.id;

                    const receiver = event.members.find(m => m.id === tx.toId);
                    const receiverMethods = receiver?.paymentMethods || [];

                    return (
                      <div
                        key={idx}
                        className="balance-item-box"
                        style={{
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderLeft: tx.paid ? '4px solid var(--color-secondary)' : '4px solid var(--color-primary)',
                          opacity: tx.paid ? 0.7 : 1,
                        }}
                      >
                        <div style={{ flex: 1, marginRight: '16px' }}>
                          <div style={{ fontSize: '14px', textDecoration: tx.paid ? 'line-through' : 'none', color: tx.paid ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                            <strong>{fromName}</strong> 應支付給 <strong>{toName}</strong>
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0', textDecoration: tx.paid ? 'line-through' : 'none' }} className={tx.paid ? '' : 'title-gradient'}>
                            {currencySym}{tx.amount.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            或換算為：{altCurrencySym}{altAmount.toFixed(2)} {altCurrency} (以匯率 {event.usdToTwdRate} 計算)
                          </div>
                          
                          {/* 收款方式展示 */}
                          {!tx.paid && (
                            receiverMethods && receiverMethods.length > 0 ? (
                              <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '11px', border: '1px dashed rgba(255,255,255,0.08)' }}>
                                <div style={{ fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>{toName} 的收款方式：</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {receiverMethods.map((pm, pmIdx) => (
                                    <div key={pmIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      {pm.type === 'cash' && <span>💵 現金支付</span>}
                                      {pm.type === 'transfer' && <span>🏦 銀行轉帳：代碼 {pm.bankCode} / 帳號 {pm.bankAccount}</span>}
                                      {pm.type === 'linepay' && <span>💬 Line ID: {pm.lineId}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                ℹ️ {toName} 尚未設定收款方式
                              </div>
                            )
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {tx.paid ? (
                            <span className="badge badge-emerald" style={{ padding: '4px 8px' }}>
                              已支付
                            </span>
                          ) : (
                            <>
                              {isPayer ? (
                                <button
                                  className="btn btn-emerald"
                                  onClick={() => {
                                    const updatedRecords = event.settlements!.map((r, rIdx) =>
                                      rIdx === idx ? { ...r, paid: true } : r
                                    );
                                    const allPaid = updatedRecords.every(r => r.paid);
                                    onUpdateEvent({
                                      ...event,
                                      settlements: updatedRecords,
                                      status: allPaid ? 'settled' : 'active'
                                    });
                                    setToastMsg(allPaid ? '🎉 所有成員已結清，本活動已結案！' : '已確認支付！');
                                    setShowToast(true);
                                    setTimeout(() => setShowToast(false), 2500);
                                  }}
                                  style={{ padding: '6px 12px', fontSize: '13px' }}
                                >
                                  確認支付
                                </button>
                              ) : (
                                <span className="badge badge-warning" style={{ padding: '4px 8px' }}>
                                  等待支付
                                </span>
                              )}
                              {isReceiver && (
                                <span className="badge badge-emerald" style={{ padding: '4px 8px' }}>
                                  您將收到
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // 尚未開啟結算模式，動態顯示即時建議
                <div>
                  {settlements.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-secondary-light)', fontWeight: '500', fontSize: '14px' }}>
                      🎉 目前帳目已完全結清，無需再轉帳！
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                        {settlements.map((tx, idx) => {
                          const fromName = getMemberName(tx.fromId);
                          const toName = getMemberName(tx.toId);
                          const currencySym = event.defaultCurrency === 'USD' ? '$' : 'NT$';

                          // 備用幣別換算
                          const altCurrency = event.defaultCurrency === 'TWD' ? 'USD' : 'TWD';
                          const altAmount = convertCurrency(tx.amount, event.defaultCurrency, altCurrency, event.usdToTwdRate);
                          const altCurrencySym = altCurrency === 'USD' ? '$' : 'NT$';

                          const receiver = event.members.find(m => m.id === tx.toId);
                          const receiverMethods = receiver?.paymentMethods || [];

                          return (
                            <div
                              key={idx}
                              className="balance-item-box"
                              style={{
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                borderLeft: '4px solid var(--color-primary)',
                              }}
                            >
                              <div style={{ flex: 1, marginRight: '16px' }}>
                                <div style={{ fontSize: '14px' }}>
                                  <strong>{fromName}</strong> 應支付給 <strong>{toName}</strong>
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0' }} className="title-gradient">
                                  {currencySym}{tx.amount.toFixed(2)}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  或換算為：{altCurrencySym}{altAmount.toFixed(2)} {altCurrency} (以匯率 {event.usdToTwdRate} 計算)
                                </div>
                                
                                {/* 收款方式展示 */}
                                {receiverMethods && receiverMethods.length > 0 ? (
                                  <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '11px', border: '1px dashed rgba(255,255,255,0.08)' }}>
                                    <div style={{ fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>{toName} 的收款方式：</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      {receiverMethods.map((pm, pmIdx) => (
                                        <div key={pmIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          {pm.type === 'cash' && <span>💵 現金支付</span>}
                                          {pm.type === 'transfer' && <span>🏦 轉帳：代碼 {pm.bankCode} / 帳號 {pm.bankAccount}</span>}
                                          {pm.type === 'linepay' && <span>💬 Line ID: {pm.lineId}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    ℹ️ {toName} 尚未設定收款方式
                                  </div>
                                )}
                              </div>

                              {tx.fromId === activeEventMember?.id && (
                                <span className="badge badge-rose" style={{ padding: '4px 8px' }}>
                                  您需轉帳
                                </span>
                              )}
                              {tx.toId === activeEventMember?.id && (
                                <span className="badge badge-emerald" style={{ padding: '4px 8px' }}>
                                  您將收到
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          const records = settlements.map(s => ({
                            fromId: s.fromId,
                            toId: s.toId,
                            amount: s.amount,
                            paid: false
                          }));
                          onUpdateEvent({
                            ...event,
                            status: 'active',
                            settlements: records
                          });
                          setToastMsg('結算已開始，帳目與成員已被鎖定。');
                          setShowToast(true);
                          setTimeout(() => setShowToast(false), 2000);
                        }}
                        style={{ width: '100%', padding: '12px', fontWeight: '600' }}
                      >
                        開始結算 (鎖定帳目)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. 分享與匯入提示 */}
            <div className="card-glass" style={{ padding: '16px', textAlign: 'center' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>與朋友同步此帳本</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                因為本程式為前端免伺服器運作，您可以點擊「分享活動」複製分享連結，發送給好友，對方即可直接匯入整本帳目。
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={handleCopyCode} style={{ flex: 1, padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Copy size={13} /> 複製代碼
                </button>
                <button className="btn btn-primary" onClick={handleShare} style={{ flex: 2, padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Share2 size={13} /> 複製分享連結
                </button>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'members' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px' }}>成員清單 ({event.members.length})</h3>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMemberError('');
                  setShowAddMember(!showAddMember);
                }}
                style={{ padding: '8px 16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} /> 邀請成員
              </button>
            </div>

            {/* 新增成員表單 */}
            {showAddMember && (
              <div className="card-glass animate-slide-up" style={{ padding: '16px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>新增活動成員</h4>
                
                {memberError && (
                  <div className="alert-banner alert-banner-warning" style={{ fontSize: '13px', padding: '6px 10px', marginBottom: '12px' }}>
                    {memberError}
                  </div>
                )}

                <form onSubmit={handleAddMember}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>成員姓名/暱稱 *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="如：小華、Bob"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '14px' }}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label" style={{ fontSize: '12px' }}>電子信箱 *</label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="example@email.com"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '14px' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)} style={{ padding: '6px 12px', fontSize: '13px' }}>
                      取消
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }}>
                      加入成員
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 成員清單 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {event.members.map((m) => {
                const isCurrentUser = m.email.toLowerCase() === currentUser.email.toLowerCase();
                
                return (
                  <div
                    key={m.id}
                    className="card-glass"
                    style={{
                      padding: '12px 16px',
                      marginBottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderLeft: isCurrentUser ? '4px solid var(--color-primary)' : '1px solid var(--border-color)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {m.name}
                        {isCurrentUser && (
                          <span className="badge badge-indigo" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            您
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{m.email}</div>
                      
                      {/* 顯示已設定收款方式簡述 */}
                      {m.paymentMethods && m.paymentMethods.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                          {m.paymentMethods.map((pm, idx) => (
                            <span key={idx} className="badge" style={{ fontSize: '10px', padding: '1px 5px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.05)', textTransform: 'none' }}>
                              {pm.type === 'cash' && '💵 現金'}
                              {pm.type === 'transfer' && `🏦 轉帳 (${pm.bankCode})`}
                              {pm.type === 'linepay' && '💬 LinePay'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {!isCurrentUser && (!event.settlements || event.settlements.length === 0) && (
                      <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => handleDeleteMember(m.id)}
                        style={{ width: '32px', height: '32px', border: 'none', background: 'transparent' }}
                        title="刪除成員"
                      >
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部浮動記帳按鈕 (僅在帳目分頁且有成員時顯示) */}
      {activeTab === 'expenses' && event.members.length > 0 && (!event.settlements || event.settlements.length === 0) && (
        <button
          className="fab-btn"
          onClick={() => {
            setExpenseToEdit(null);
            setIsExpenseModalOpen(true);
          }}
          title="記一筆"
        >
          <Plus size={24} />
        </button>
      )}

      {/* 記帳視窗 */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setExpenseToEdit(null);
        }}
        onSave={handleSaveExpense}
        members={event.members}
        expenseToEdit={expenseToEdit}
        defaultCurrency={event.defaultCurrency}
      />

      {/* Toast 訊息 */}
      {showToast && (
        <div className="toast-msg">
          <CheckCircle2 size={16} style={{ color: 'var(--color-secondary-light)' }} />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
