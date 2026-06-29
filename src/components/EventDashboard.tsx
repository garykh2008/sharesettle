import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Users, DollarSign, Share2, Settings, Trash2, Edit2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { SplitEvent, Member, Expense, UserSession, Currency } from '../types';
import { calculateSettlements, convertCurrency, round, getCurrencySymbol } from '../utils';
import { supabase } from '../supabase';
import { ExpenseModal } from './ExpenseModal';

interface EventDashboardProps {
  event: SplitEvent;
  onBack: () => void;
  onUpdateEvent: (updatedEvent: SplitEvent) => void;
  currentUser: UserSession;
}

export const EventDashboard: React.FC<EventDashboardProps> = ({
  event,
  onBack,
  onUpdateEvent,
  currentUser,
}) => {
  const baseCurrency = event.settlementCurrency || event.defaultCurrency || 'TWD';
  const rates = event.exchangeRates || {
    USD: baseCurrency === 'TWD' ? (event.usdToTwdRate || 32.5) : 1,
    TWD: baseCurrency === 'USD' ? (1 / (event.usdToTwdRate || 32.5)) : 1,
    JPY: 1,
  };

  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement' | 'members'>('expenses');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');

  // 編輯活動基本設定 (支援多幣別與匯率字典)
  const [eventTitle, setEventTitle] = useState(event.title);
  const [eventDesc, setEventDesc] = useState(event.description || '');
  const [eventSupportedCurrencies, setEventSupportedCurrencies] = useState<Currency[]>(event.supportedCurrencies || ['TWD']);
  const [eventSettlementCurrency, setEventSettlementCurrency] = useState<Currency>(event.settlementCurrency || event.defaultCurrency || 'TWD');
  const [eventExchangeRates, setEventExchangeRates] = useState<{ [key in Currency]?: number }>(
    event.exchangeRates || { TWD: 1, USD: event.usdToTwdRate || 32.5, JPY: 1 }
  );

  const getDashboardDefaultRate = (c: Currency, target: Currency): number => {
    if (c === target) return 1.0;
    if (c === 'USD' && target === 'TWD') return 32.5;
    if (c === 'TWD' && target === 'USD') return 0.031;
    if (c === 'JPY' && target === 'TWD') return 0.22;
    if (c === 'TWD' && target === 'JPY') return 4.54;
    if (c === 'USD' && target === 'JPY') return 158.5;
    if (c === 'JPY' && target === 'USD') return 0.0063;
    return 1.0;
  };

  const handleDashboardSettlementCurrencyChange = (newTarget: Currency) => {
    setEventSettlementCurrency(newTarget);
    setEventExchangeRates((prev) => {
      const updated = { ...prev };
      (['TWD', 'USD', 'JPY'] as Currency[]).forEach((c) => {
        updated[c] = getDashboardDefaultRate(c, newTarget);
      });
      return updated;
    });
  };

  // 當外部活動資料更新時，同步表單欄位
  useEffect(() => {
    setEventTitle(event.title);
    setEventDesc(event.description || '');
    setEventSupportedCurrencies(event.supportedCurrencies || ['TWD']);
    setEventSettlementCurrency(event.settlementCurrency || event.defaultCurrency || 'TWD');
    setEventExchangeRates(event.exchangeRates || { TWD: 1, USD: event.usdToTwdRate || 32.5, JPY: 1 });
  }, [event]);

  // 記帳 Modal 控制
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  // 收據放大預覽控制
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  // 展開/收合款項明細
  const [expandedExpenses, setExpandedExpenses] = useState<{ [id: string]: boolean }>({});

  // 複製連結的 Toast 狀態
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');


  // 計算結算
  const settlements = calculateSettlements(event);

  // 複製分享代碼與 URL
  // 複製分享邀請網址
  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#/join/${event.id}`;
    
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setToastMsg('分享邀請連結已複製！');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      })
      .catch(() => {
        navigator.clipboard.writeText(event.id);
        setToastMsg('活動 ID 已複製！');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      });
  };

  // 新增成員/發送邀請
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError('');

    const nameVal = newMemberName.trim();
    const inputVal = newMemberEmail.trim();

    if (!nameVal) {
      setMemberError('請輸入成員姓名/暱稱！');
      return;
    }

    if (inputVal) {
      // A. 邀請已註冊用戶
      const isEmail = inputVal.includes('@');
      
      try {
        let query = supabase.from('profiles').select('*');
        if (isEmail) {
          query = query.eq('email', inputVal.toLowerCase());
        } else {
          // 以信箱 @ 前綴搜尋 (例如: input 為 bob，則搜尋 bob@%)
          query = query.like('email', `${inputVal.toLowerCase()}@%`);
        }

        const { data: profiles, error } = await query.limit(2);

        if (error) throw error;

        if (!profiles || profiles.length === 0) {
          alert('找不到該使用者！受邀人必須先註冊 ShareSettle 帳號，請確認信箱或前綴是否正確。');
          setMemberError('找不到該使用者！受邀人必須先註冊帳號。');
          return;
        }

        if (profiles.length > 1) {
          alert('搜尋到多個符合該前綴的信箱，請輸入完整的 Email 進行邀請！');
          setMemberError('符合前綴的帳號不唯一，請輸入完整 Email。');
          return;
        }

        const profile = profiles[0];

        // 檢查是否重複
        const exists = event.members.some(
          (m) => m.email.toLowerCase() === profile.email.toLowerCase()
        );
        if (exists) {
          setMemberError('該成員已在成員清單中！');
          return;
        }

        const newMember: Member = {
          id: profile.id,
          name: nameVal, // 使用建立者填寫的暱稱（如「小明」），利於活動辨識
          email: profile.email,
          paymentMethods: profile.payment_methods || [],
          status: 'pending', // 標註為待接受邀請
          isTemporary: false
        };

        onUpdateEvent({
          ...event,
          members: [...event.members, newMember]
        });

        alert(`已成功向 ${profile.name} 發送邀請！待對方於首頁「接受」後即會加入活動。`);
        setNewMemberName('');
        setNewMemberEmail('');
        setShowAddMember(false);
      } catch (err: any) {
        console.error(err);
        setMemberError(err.message || '查詢雲端使用者發生錯誤。');
      }
    } else {
      // B. 建立臨時成員 (無信箱，isTemporary = true)
      const newMember: Member = {
        id: 'temp_' + Math.random().toString(36).substring(2, 9),
        name: nameVal,
        email: '',
        paymentMethods: [],
        status: 'active', // 臨時成員直接處於啟用狀態，可以直接記帳
        isTemporary: true
      };

      onUpdateEvent({
        ...event,
        members: [...event.members, newMember]
      });

      setNewMemberName('');
      setNewMemberEmail('');
      setShowAddMember(false);
    }
  };

  // 連結臨時成員到已註冊的雲端帳號
  const handleLinkAccount = async (memberId: string, currentName: string) => {
    const inputVal = window.prompt(`請輸入欲與「${currentName}」連結的成員電子信箱或信箱前綴：`);
    if (!inputVal || !inputVal.trim()) return;

    const searchVal = inputVal.trim();
    const isEmail = searchVal.includes('@');
    
    try {
      let query = supabase.from('profiles').select('*');
      if (isEmail) {
        query = query.eq('email', searchVal.toLowerCase());
      } else {
        // 以信箱 @ 前綴搜尋 (例如: input 為 bob，則搜尋 bob@%)
        query = query.like('email', `${searchVal.toLowerCase()}@%`);
      }

      const { data: profiles, error } = await query.limit(2);
      if (error) throw error;

      if (!profiles || profiles.length === 0) {
        alert('找不到該使用者！受邀人必須先註冊 ShareSettle 帳號，請確認信箱或前綴是否正確。');
        return;
      }

      if (profiles.length > 1) {
        alert('搜尋到多個符合該前綴的信箱，請輸入完整的 Email 進行邀請！');
        return;
      }

      const profile = profiles[0];

      // 檢查該帳號是否已經是活動成員
      const isAlreadyMember = event.members.some(
        (m) => m.email.toLowerCase() === profile.email.toLowerCase() && m.id !== memberId
      );
      if (isAlreadyMember) {
        alert('該帳號已在此活動的成員清單中，無法重複連結！');
        return;
      }

      if (!window.confirm(`確定要將臨時成員「${currentName}」連結至已註冊帳號「${profile.name} (${profile.email})」嗎？\n連結後會向對方發送活動邀請，對方接受後即可共同管理。`)) {
        return;
      }

      // 更新成員名單：將臨時欄位填上信箱與將 status 設為 pending
      const updatedMembers = event.members.map((m) => {
        if (m.id === memberId) {
          return {
            ...m,
            name: currentName, // 保持活動中已使用的名字，便於對帳
            email: profile.email,
            paymentMethods: profile.payment_methods || [],
            status: 'pending' as const, // 設定為待接受狀態
            isTemporary: false
          };
        }
        return m;
      });

      onUpdateEvent({
        ...event,
        members: updatedMembers
      });

      alert(`已成功連結！已向 ${profile.name} 發送邀請，待對方在首頁點選「接受」即會同步。`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || '連結帳號時發生錯誤。');
    }
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
    if (eventSupportedCurrencies.length === 0) {
      alert("請至少選取一個支援的交易幣別！");
      return;
    }

    const actualSupported = eventSupportedCurrencies.includes(eventSettlementCurrency)
      ? eventSupportedCurrencies
      : [...eventSupportedCurrencies, eventSettlementCurrency];

    onUpdateEvent({
      ...event,
      title: eventTitle.trim(),
      description: eventDesc.trim() || undefined,
      defaultCurrency: eventSettlementCurrency === 'JPY' ? 'TWD' : eventSettlementCurrency as any,
      usdToTwdRate: eventExchangeRates['USD'] || 32.5,
      supportedCurrencies: actualSupported,
      settlementCurrency: eventSettlementCurrency,
      exchangeRates: eventExchangeRates,
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
      const expInDefault = convertCurrency(exp.amount, exp.currency as Currency, baseCurrency, rates);
      balances[exp.paidById] += expInDefault;

      exp.splits.forEach((s) => {
        const splitInDefault = convertCurrency(s.amount, exp.currency as Currency, baseCurrency, rates);
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
            {/* 交易幣別與結算配置 */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>支援交易幣別 (複選)</label>
              <div style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                {(['TWD', 'USD', 'JPY'] as Currency[]).map((c) => {
                  const isChecked = eventSupportedCurrencies.includes(c);
                  return (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEventSupportedCurrencies([...eventSupportedCurrencies, c]);
                          } else {
                            if (eventSupportedCurrencies.length > 1 && c !== eventSettlementCurrency) {
                              setEventSupportedCurrencies(eventSupportedCurrencies.filter((curr) => curr !== c));
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '12px' }}>結算本位幣別</label>
                <select
                  className="input-field select-field"
                  value={eventSettlementCurrency}
                  onChange={(e) => handleDashboardSettlementCurrencyChange(e.target.value as Currency)}
                  style={{ padding: '8px 12px', fontSize: '14px' }}
                >
                  {eventSupportedCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c === 'TWD' ? '新台幣 (TWD)' : c === 'USD' ? '美金 (USD)' : '日圓 (JPY)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '12px' }}>匯率設定</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {eventSupportedCurrencies
                    .filter((c) => c !== eventSettlementCurrency)
                    .map((c) => (
                      <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <span style={{ whiteSpace: 'nowrap' }}>1 {c} = </span>
                        <input
                          type="number"
                          className="input-field"
                          value={eventExchangeRates[c] || ''}
                          step="0.0001"
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEventExchangeRates((prev) => ({ ...prev, [c]: val }));
                          }}
                          style={{ width: '80px', padding: '4px 8px', height: '30px', fontSize: '13px' }}
                          required
                        />
                        <span style={{ whiteSpace: 'nowrap' }}>{eventSettlementCurrency}</span>
                      </div>
                    ))}
                  {eventSupportedCurrencies.filter((c) => c !== eventSettlementCurrency).length === 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', paddingTop: '6px' }}>
                      無須匯率轉換 (單一幣別活動)
                    </span>
                  )}
                </div>
              </div>
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
                  const expCurrencySym = getCurrencySymbol(exp.currency as Currency);

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
                            {/* 如果交易附有收據憑證 */}
                            {(exp.receiptUrl || (exp.receiptUrls && exp.receiptUrls.length > 0)) && (
                              <span title="附有收據憑證" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                                🧾
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
                          {exp.currency !== baseCurrency && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              折合 {getCurrencySymbol(baseCurrency)}{(exp.amount * (rates[exp.currency] || 1)).toFixed(2)}
                            </div>
                          )}
                          
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

                          {/* 收據/憑證預覽 */}
                          {((exp.receiptUrls || []).filter(Boolean).length > 0 || exp.receiptUrl) && (
                            <div style={{ marginTop: '14px', padding: '10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>收據/發票憑證：</div>
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {((exp.receiptUrls || []).filter(Boolean).length > 0 
                                  ? (exp.receiptUrls || []).filter(Boolean) 
                                  : [exp.receiptUrl!]
                                ).map((url, idx) => (
                                  <div 
                                    key={idx}
                                    onClick={() => setPreviewReceiptUrl(url)}
                                    style={{ 
                                      position: 'relative', 
                                      display: 'inline-block', 
                                      cursor: 'pointer',
                                      borderRadius: '6px',
                                      overflow: 'hidden',
                                      border: '1px solid rgba(255,255,255,0.1)',
                                      lineHeight: 0
                                    }}
                                  >
                                    <img 
                                      src={url} 
                                      alt={`收據憑證-${idx + 1}`} 
                                      style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'contain' }} 
                                    />
                                    <div style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: 'white', lineHeight: 'normal' }}>
                                      🔍 點擊放大
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
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
                <Users size={16} className="title-gradient" /> 成員收支狀態 ({event.settlementCurrency || event.defaultCurrency || 'TWD'})
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {memberBalances.map((mb) => {
                  const isPositive = mb.net > 0;
                  const isZero = Math.abs(mb.net) <= 0.005;
                  const baseCurrency = event.settlementCurrency || event.defaultCurrency || 'TWD';

                  return (
                    <div key={mb.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ fontWeight: mb.id === activeEventMember?.id ? 'bold' : 'normal' }}>
                        {mb.name} {mb.id === activeEventMember?.id && <span style={{ fontSize: '10px', color: 'var(--color-primary-light)' }}>(您)</span>}
                      </span>
                      
                      <span style={{
                        fontWeight: 'bold',
                        color: isZero ? 'var(--text-muted)' : (isPositive ? 'var(--color-secondary-light)' : 'var(--color-danger)')
                      }}>
                        {isZero ? '已結清' : (isPositive ? `應收 +${getCurrencySymbol(baseCurrency)}${mb.net.toFixed(2)}` : `應付 ${getCurrencySymbol(baseCurrency)}${Math.abs(mb.net).toFixed(2)}`)}
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
                    const baseCurrency = event.settlementCurrency || event.defaultCurrency || 'TWD';
                    const rates = event.exchangeRates || {
                      USD: baseCurrency === 'TWD' ? (event.usdToTwdRate || 32.5) : 1,
                      TWD: baseCurrency === 'USD' ? (1 / (event.usdToTwdRate || 32.5)) : 1,
                      JPY: 1,
                    };
                    const currencySym = getCurrencySymbol(baseCurrency);

                    const altCurrency = (event.supportedCurrencies || []).find(c => c !== baseCurrency) || (baseCurrency === 'TWD' ? 'USD' : 'TWD');
                    const altAmount = convertCurrency(tx.amount, baseCurrency, altCurrency, rates);
                    const altCurrencySym = getCurrencySymbol(altCurrency);

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
                          const baseCurrency = event.settlementCurrency || event.defaultCurrency || 'TWD';
                          const rates = event.exchangeRates || {
                            USD: baseCurrency === 'TWD' ? (event.usdToTwdRate || 32.5) : 1,
                            TWD: baseCurrency === 'USD' ? (1 / (event.usdToTwdRate || 32.5)) : 1,
                            JPY: 1,
                          };
                          const currencySym = getCurrencySymbol(baseCurrency);

                          const altCurrency = (event.supportedCurrencies || []).find(c => c !== baseCurrency) || (baseCurrency === 'TWD' ? 'USD' : 'TWD');
                          const altAmount = convertCurrency(tx.amount, baseCurrency, altCurrency, rates);
                          const altCurrencySym = getCurrencySymbol(altCurrency);

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

            {/* 3. 分享與邀請提示 */}
            <div className="card-glass" style={{ padding: '16px', textAlign: 'center' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>邀請朋友共同分帳</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                將邀請連結發送給好友，對方點選連結後即可直接加入此雲端分帳帳本，共同進行即時同步記帳！
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" onClick={handleShare} style={{ flex: 1, padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Share2 size={13} /> 複製邀請連結
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
                    <label className="form-label" style={{ fontSize: '12px' }}>受邀人的電子信箱或信箱前綴 (選填)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例如: bob@test.com 或 bob (留空則為臨時成員)"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '14px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)} style={{ padding: '6px 12px', fontSize: '13px' }}>
                      取消
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }}>
                      {newMemberEmail.trim() ? "發送邀請" : "加入成員"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 成員清單 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {event.members.map((m) => {
                const isCurrentUser = m.email && m.email.toLowerCase() === currentUser.email.toLowerCase();
                
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
                        {m.status === 'pending' && (
                          <span className="badge badge-rose" style={{ fontSize: '9px', padding: '1px 5px', textTransform: 'none', background: 'rgba(244, 63, 94, 0.08)' }}>
                            待接受邀請
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {m.email ? m.email : '👤 臨時成員 (未連結帳號)'}
                      </div>
                      
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {(m.isTemporary || !m.email) && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleLinkAccount(m.id, m.name)}
                          style={{ padding: '4px 10px', fontSize: '11px', height: '28px', border: '1px solid var(--border-color)' }}
                        >
                          🔗 連結帳號
                        </button>
                      )}

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
        supportedCurrencies={event.supportedCurrencies}
        defaultCurrency={event.settlementCurrency || event.defaultCurrency || 'TWD'}
        eventId={event.id}
      />

      {/* 收據大圖預覽燈箱 (Lightbox) */}
      {previewReceiptUrl && (
        <div 
          onClick={() => setPreviewReceiptUrl(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'zoom-out',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          className="animate-fade-in"
        >
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
            <img 
              src={previewReceiptUrl} 
              alt="收據憑證大圖" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '90vh', 
                borderRadius: '8px', 
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                objectFit: 'contain'
              }} 
            />
            <button 
              onClick={(e) => { e.stopPropagation(); setPreviewReceiptUrl(null); }}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              關閉
            </button>
          </div>
        </div>
      )}

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
