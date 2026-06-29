import { useState, useEffect, useRef } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { EventSelector } from './components/EventSelector';
import { EventDashboard } from './components/EventDashboard';
import type { SplitEvent, UserSession, Member, PaymentMethod, Expense, Currency } from './types';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { supabase } from './supabase';
import { getCurrencySymbol } from './utils';
import { ProfileModal } from './components/ProfileModal';

function App() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [events, setEvents] = useState<SplitEvent[]>([]);
  const eventsRef = useRef<SplitEvent[]>([]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Toast 訊息狀態
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);

  // 1. 於元件掛載時訂閱 Supabase Auth 狀態，並處理 Hash 連結
  useEffect(() => {
    // A-1. 獲取當前已登入 Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        syncSession(session);
      } else {
        // 嘗試載入本機登入快取做緩衝
        const storedSession = localStorage.getItem('sharesettle_session');
        if (storedSession) {
          setCurrentUser(JSON.parse(storedSession));
        }
      }
    });

    // A-2. 監聽 Auth 狀態改變
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        syncSession(session);
      } else {
        setCurrentUser(null);
        setEvents([]);
        localStorage.removeItem('sharesettle_session');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 處理瀏覽器「上一頁」按鈕 (包含 Android 實體/手勢返回鍵)
  useEffect(() => {
    // 初始化首頁歷史狀態
    if (window.history.state === null) {
      window.history.replaceState({ type: 'list' }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state && state.type === 'event') {
        setSelectedEventId(state.eventId);
      } else {
        setSelectedEventId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // 監聽 selectedEventId 變更，同步 push/pop 瀏覽器歷史紀錄
  useEffect(() => {
    if (selectedEventId) {
      // 避免重複 pushState (如 popstate 觸發時)
      if (!window.history.state || window.history.state.eventId !== selectedEventId) {
        window.history.pushState({ type: 'event', eventId: selectedEventId }, '');
      }
    } else {
      // 若是點選 App 內部返回按鈕且當前歷史還在 event 狀態，退回上一頁
      if (window.history.state && window.history.state.type === 'event') {
        window.history.back();
      }
    }
  }, [selectedEventId]);

  // 當 URL Hash 改變時，檢查是否有加入連結
  useEffect(() => {
    const handleHashImport = () => {
      const hash = window.location.hash;

      // 雲端 Event ID 匯入: #/join/[event_id]
      if (hash && hash.startsWith('#/join/')) {
        const eventId = hash.replace('#/join/', '');
        if (eventId) {
          // 檢查是否已登入
          const storedSession = localStorage.getItem('sharesettle_session');
          if (storedSession) {
            const sessionUser = JSON.parse(storedSession) as UserSession;
            handleJoinEventById(eventId, sessionUser);
          } else {
            // 未登入，先儲存待加入 ID，引導登入
            localStorage.setItem('sharesettle_pending_join', eventId);
            alert("您需要先登入或註冊帳號。登入成功後，將會自動為您開啟並加入該分帳活動！");
          }
          window.location.hash = '';
        }
      }
    };

    handleHashImport();
    window.addEventListener('hashchange', handleHashImport);
    return () => {
      window.removeEventListener('hashchange', handleHashImport);
    };
  }, [currentUser]);

  // 同步 Auth 使用者會話與雲端 Profile
  const syncSession = async (session: any) => {
    const email = session.user.email || '';
    let name = session.user.user_metadata?.name || email.split('@')[0];
    let paymentMethods: PaymentMethod[] = [];
    let avatarUrl = '';

    try {
      // 向 profiles 表查詢詳細收款與姓名資料
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (profile) {
        name = profile.name;
        paymentMethods = profile.payment_methods || [];
        avatarUrl = profile.avatar_url || '';
      }
    } catch (e) {
      console.warn("User profile details not yet in profiles table, using auth metadata", e);
    }

    const updatedSession: UserSession = {
      id: session.user.id,
      email,
      name,
      paymentMethods,
      avatarUrl
    };
    
    setCurrentUser(updatedSession);
    localStorage.setItem('sharesettle_session', JSON.stringify(updatedSession));
    
    // 檢查是否有未完成的受邀加入活動
    const pendingJoinId = localStorage.getItem('sharesettle_pending_join');
    if (pendingJoinId) {
      localStorage.removeItem('sharesettle_pending_join');
      handleJoinEventById(pendingJoinId, updatedSession);
    }
  };

  // 訂閱當前登入者有權限檢視的所有雲端活動更新 (結合 Postgres RLS 過濾)
  useEffect(() => {
    if (!currentUser) return;

    // 系統級 OS 通知輔助函式 (優先使用 Service Worker 以支援行動裝置與背景執行)
    const sendSystemNotification = (title: string, body: string) => {
      if (typeof window === 'undefined') return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body: body,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: 'sharesettle-alert'
          }).catch((err) => {
            console.warn("Service Worker showNotification 失敗，使用 window.Notification fallback:", err);
            new Notification(title, { body, icon: '/favicon.svg' });
          });
        }).catch(() => {
          new Notification(title, { body, icon: '/favicon.svg' });
        });
      } else {
        try {
          new Notification(title, { body, icon: '/favicon.svg' });
        } catch (err) {
          console.warn("Native Notification 失敗:", err);
        }
      }
    };

    const fetchUserEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        if (data) {
          const mapped: SplitEvent[] = data.map(d => ({
            id: d.id,
            title: d.title,
            description: d.description,
            defaultCurrency: d.default_currency as 'USD' | 'TWD',
            usdToTwdRate: Number(d.usd_to_twd_rate),
            supportedCurrencies: (d.supported_currencies || ['TWD']) as Currency[],
            settlementCurrency: (d.settlement_currency || d.default_currency || 'TWD') as Currency,
            exchangeRates: (d.exchange_rates || { TWD: 1, USD: Number(d.usd_to_twd_rate || 32.5) }) as { [key in Currency]?: number },
            status: d.status as 'active' | 'settled',
            members: d.members as Member[],
            expenses: d.expenses as Expense[],
            settlements: d.settlements as any,
            createdAt: d.created_at
          }));
          setEvents(mapped);
          localStorage.setItem('sharesettle_events', JSON.stringify(mapped));
        }
      } catch (e) {
        console.error("Failed to load user events from Supabase", e);
      }
    };

    fetchUserEvents();

    // 訂閱活動表的所有變更
    const channel = supabase
      .channel('user-events-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          // 在刷新資料前比對變更以進行系統推播
          if (payload.eventType === 'UPDATE' && payload.new && currentUser) {
            const newRaw = payload.new;
            const oldEvent = eventsRef.current.find(e => e.id === newRaw.id);
            
            if (oldEvent) {
              const newExpenses = (newRaw.expenses || []) as Expense[];
              const oldExpenses = oldEvent.expenses || [];
              const newSettlements = (newRaw.settlements || []) as any[];
              const oldSettlements = (oldEvent.settlements || []) as any[];
              const newStatus = newRaw.status;
              const oldStatus = oldEvent.status;

              // 1. 新增記帳比對
              if (newExpenses.length > oldExpenses.length) {
                const addedExpense = newExpenses.find(
                  newExp => !oldExpenses.some(oldExp => oldExp.id === newExp.id)
                );
                
                if (addedExpense && addedExpense.paidById !== currentUser.id) {
                  const payerName = (newRaw.members as Member[])?.find(
                    m => m.id === addedExpense.paidById
                  )?.name || '其他成員';

                  const title = `活動「${newRaw.title}」有新記帳`;
                  const body = `${payerName} 新增了「${addedExpense.title}」消費，金額：${getCurrencySymbol(addedExpense.currency as Currency)}${addedExpense.amount.toFixed(2)}`;
                  
                  sendSystemNotification(title, body);

                  setToastMsg(`🔔 ${title}：${body}`);
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 5000);
                }
              }

              // 2. 修改記帳比對
              if (newExpenses.length === oldExpenses.length) {
                const modifiedExpense = newExpenses.find(newExp => {
                  const oldExp = oldExpenses.find(o => o.id === newExp.id);
                  if (!oldExp) return false;
                  return (
                    newExp.title !== oldExp.title ||
                    newExp.amount !== oldExp.amount ||
                    newExp.currency !== oldExp.currency ||
                    JSON.stringify(newExp.splits) !== JSON.stringify(oldExp.splits)
                  );
                });

                if (modifiedExpense && modifiedExpense.paidById !== currentUser.id) {
                  const payerName = (newRaw.members as Member[])?.find(
                    m => m.id === modifiedExpense.paidById
                  )?.name || '其他成員';

                  const title = `活動「${newRaw.title}」有帳目修改`;
                  const body = `「${modifiedExpense.title}」已被更新。付款人：${payerName}，金額：${getCurrencySymbol(modifiedExpense.currency as Currency)}${modifiedExpense.amount.toFixed(2)}`;

                  sendSystemNotification(title, body);

                  setToastMsg(`🔔 ${title}：${body}`);
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 5000);
                }
              }

              // 3. 刪除記帳比對
              if (newExpenses.length < oldExpenses.length) {
                const deletedExpense = oldExpenses.find(
                  oldExp => !newExpenses.some(newExp => newExp.id === oldExp.id)
                );
 
                if (deletedExpense) {
                  const title = `活動「${newRaw.title}」有帳目刪除`;
                  const body = `「${deletedExpense.title}」已被刪除，原金額：${getCurrencySymbol(deletedExpense.currency as Currency)}${deletedExpense.amount.toFixed(2)}`;
 
                  sendSystemNotification(title, body);
 
                  setToastMsg(`🔔 ${title}：${body}`);
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 5000);
                }
              }
 
              // 4. 結算流程狀態與對象比對
              let statusTitle = '';
              let statusBody = '';
 
              // 4A. 開始結算 (鎖定帳目)
              if (oldSettlements.length === 0 && newSettlements.length > 0) {
                statusTitle = `活動「${newRaw.title}」已開始結算！`;
                statusBody = `帳目已被鎖定，系統已規劃最少轉帳方案，請前往查看。`;
              }
              // 4B. 取消結算 (解鎖帳目)
              else if (oldSettlements.length > 0 && newSettlements.length === 0 && newStatus !== 'settled') {
                statusTitle = `活動「${newRaw.title}」已取消結算並解鎖`;
                statusBody = `帳目已重新開放編輯，您可以繼續記帳。`;
              }
              // 4C. 完全結清 (歸檔)
              else if (newStatus === 'settled' && oldStatus !== 'settled') {
                statusTitle = `活動「${newRaw.title}」已完全結清！`;
                statusBody = `所有成員皆已完成匯款收付款，活動已正式歸檔。`;
              }
              // 4D. 重啟活動 (解除歸檔)
              else if ((newStatus === 'active' || !newStatus) && oldStatus === 'settled') {
                statusTitle = `活動「${newRaw.title}」已重啟解鎖`;
                statusBody = `活動已重新開啟，您可以調整帳目或重新結算。`;
              }
 
              if (statusTitle && statusBody) {
                sendSystemNotification(statusTitle, statusBody);
                setToastMsg(`🔔 ${statusTitle}`);
                setShowToast(true);
                setTimeout(() => setShowToast(false), 5000);
              }
 
              // 5. 確認付款比對
              const newlyPaid = newSettlements.find(newSet => {
                const oldSet = oldSettlements.find(
                  o => o.fromId === newSet.fromId && o.toId === newSet.toId
                );
                return oldSet && !oldSet.paid && newSet.paid;
              });
 
              if (newlyPaid) {
                const fromName = oldEvent.members.find(m => m.id === newlyPaid.fromId)?.name || '有人';
                const toName = oldEvent.members.find(m => m.id === newlyPaid.toId)?.name || '有人';
                const title = `活動「${newRaw.title}」有付款確認`;
                const body = `${fromName} 已確認向 ${toName} 支付了 ${getCurrencySymbol(oldEvent.settlementCurrency as Currency || oldEvent.defaultCurrency as Currency || 'TWD')}${newlyPaid.amount.toFixed(2)}`;
 
                sendSystemNotification(title, body);
                setToastMsg(`🔔 ${title}：${body}`);
                setShowToast(true);
                setTimeout(() => setShowToast(false), 5000);
              }
            }
          }

          fetchUserEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // 處理點擊雲端連結加入分帳活動的邏輯
  const handleJoinEventById = async (eventId: string, sessionUser: UserSession) => {
    try {
      // 1. 取得活動名稱與描述預覽 (繞過 RLS 以供加入確認)
      const { data: preview, error: previewError } = await supabase
        .rpc('get_event_preview', { event_id: eventId });

      if (previewError) throw previewError;
      if (!preview) {
        alert("找不到此雲端活動！");
        return;
      }

      // 2. 確認是否加入
      if (window.confirm(`您被邀請參與分帳活動「${preview.title}」，是否確定加入此活動？`)) {
        // 3. 呼叫 join_event 函數在資料庫端安全地將自己寫入成員 (繞過 RLS)
        const { data: joinedEventData, error: joinError } = await supabase
          .rpc('join_event', {
            event_id: eventId,
            user_name: sessionUser.name,
            user_email: sessionUser.email
          });

        if (joinError) throw joinError;

        if (joinedEventData) {
          // 4. 對齊前端 SplitEvent 介面型別
          const mappedEvent: SplitEvent = {
            id: joinedEventData.id,
            title: joinedEventData.title,
            description: joinedEventData.description,
            defaultCurrency: joinedEventData.default_currency as 'USD' | 'TWD',
            usdToTwdRate: Number(joinedEventData.usd_to_twd_rate),
            supportedCurrencies: (joinedEventData.supported_currencies || ['TWD']) as Currency[],
            settlementCurrency: (joinedEventData.settlement_currency || joinedEventData.default_currency || 'TWD') as Currency,
            exchangeRates: (joinedEventData.exchange_rates || { TWD: 1, USD: Number(joinedEventData.usd_to_twd_rate || 32.5) }) as { [key in Currency]?: number },
            status: joinedEventData.status as 'active' | 'settled',
            members: joinedEventData.members as Member[],
            expenses: joinedEventData.expenses as Expense[],
            settlements: joinedEventData.settlements as any,
            createdAt: joinedEventData.created_at
          };

          // 5. 更新本地 Events 狀態與選定活動 ID
          setEvents((prev) => {
            const idx = prev.findIndex(e => e.id === mappedEvent.id);
            let updated = [...prev];
            if (idx >= 0) {
              updated[idx] = mappedEvent;
            } else {
              updated = [mappedEvent, ...updated];
            }
            localStorage.setItem('sharesettle_events', JSON.stringify(updated));
            return updated;
          });

          setSelectedEventId(mappedEvent.id);
          setToastMsg(`成功加入活動「${preview.title}」！`);
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
        }
      }
    } catch (e) {
      console.error("Failed to join event", e);
      alert("無法載入或加入此雲端活動，請確認連結是否正確。");
    }
  };

  // 當 events 改變時寫入本機快取
  const saveEventsToStorage = (updatedEvents: SplitEvent[]) => {
    setEvents(updatedEvents);
    localStorage.setItem('sharesettle_events', JSON.stringify(updatedEvents));
  };

  // 登出處理
  const handleLogout = async () => {
    if (window.confirm('確定要登出嗎？')) {
      await supabase.auth.signOut();
      setCurrentUser(null);
      setSelectedEventId(null);
      setEvents([]);
      localStorage.removeItem('sharesettle_session');
    }
  };

  // 建立新活動
  const handleCreateEvent = async (
    title: string,
    supportedCurrencies: Currency[],
    settlementCurrency: Currency,
    exchangeRates: { [key in Currency]?: number },
    desc?: string
  ) => {
    if (!currentUser) return;

    const newMember: Member = {
      id: Math.random().toString(36).substring(2, 9),
      name: currentUser.name,
      email: currentUser.email,
      paymentMethods: currentUser.paymentMethods || [],
      avatarUrl: currentUser.avatarUrl || ''
    };

    const newEvent: SplitEvent = {
      id: Math.random().toString(36).substring(2, 9),
      title,
      description: desc,
      // 舊版降級相容欄位
      defaultCurrency: settlementCurrency === 'JPY' ? 'TWD' : settlementCurrency as any,
      usdToTwdRate: exchangeRates['USD'] || 32.5,
      supportedCurrencies,
      settlementCurrency,
      exchangeRates,
      members: [newMember],
      expenses: [],
      createdAt: new Date().toISOString(),
    };

    // 寫入 Supabase 雲端
    try {
      const { error } = await supabase.from('events').insert({
        id: newEvent.id,
        title: newEvent.title,
        description: newEvent.description,
        default_currency: newEvent.defaultCurrency,
        usd_to_twd_rate: newEvent.usdToTwdRate,
        supported_currencies: newEvent.supportedCurrencies,
        settlement_currency: newEvent.settlementCurrency,
        exchange_rates: newEvent.exchangeRates,
        status: newEvent.status || 'active',
        members: newEvent.members,
        expenses: newEvent.expenses,
        settlements: newEvent.settlements
      });
      if (error) throw error;
    } catch (e) {
      console.error("Failed to create event in Supabase", e);
      alert("建立雲端活動失敗，請檢查網路連線。");
      return;
    }

    // 更新本地快取作為載入備緩
    const updated = [newEvent, ...events];
    saveEventsToStorage(updated);
    setSelectedEventId(newEvent.id);

    setToastMsg(`活動「${title}」已建立！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 更新單一活動 (推動至 Supabase)
  const handleUpdateEvent = (updatedEvent: SplitEvent) => {
    const updated = events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
    saveEventsToStorage(updated);

    supabase
      .from('events')
      .update({
        title: updatedEvent.title,
        description: updatedEvent.description,
        default_currency: updatedEvent.defaultCurrency,
        usd_to_twd_rate: updatedEvent.usdToTwdRate,
        supported_currencies: updatedEvent.supportedCurrencies,
        settlement_currency: updatedEvent.settlementCurrency,
        exchange_rates: updatedEvent.exchangeRates,
        status: updatedEvent.status,
        members: updatedEvent.members,
        expenses: updatedEvent.expenses,
        settlements: updatedEvent.settlements,
        updated_at: new Date().toISOString()
      })
      .eq('id', updatedEvent.id)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase real-time update push failed:", error);
        }
      });
  };

  // 儲存使用者個人收款設定 (更新 profiles 表與雲端觸發同步)
  const handleSaveUserPaymentMethods = async (methods: PaymentMethod[]) => {
    if (!currentUser || !currentUser.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ payment_methods: methods })
        .eq('id', currentUser.id);
      
      if (error) throw error;
      setToastMsg('個人收款設定已儲存至雲端！');
    } catch (e) {
      console.error("Failed to save profiles to database", e);
      setToastMsg('雲端儲存失敗，請檢查網路連線。');
    }

    const updatedSession = { ...currentUser, paymentMethods: methods };
    setCurrentUser(updatedSession);
    localStorage.setItem('sharesettle_session', JSON.stringify(updatedSession));
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 接受雲端活動邀請
  const handleAcceptInvite = async (eventId: string) => {
    if (!currentUser) return;
    const evt = events.find((e) => e.id === eventId);
    if (!evt) return;

    const updatedMembers = evt.members.map((m) =>
      m.email.toLowerCase() === currentUser.email.toLowerCase()
        ? { ...m, status: 'active' as const }
        : m
    );

    const updatedEvent = { ...evt, members: updatedMembers };
    handleUpdateEvent(updatedEvent);
    setToastMsg(`已接受活動「${evt.title}」的邀請！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 拒絕雲端活動邀請
  const handleDeclineInvite = async (eventId: string) => {
    if (!currentUser) return;
    const evt = events.find((e) => e.id === eventId);
    if (!evt) return;

    // 將自己移出 members 陣列
    const updatedMembers = evt.members.filter((m) =>
      m.email.toLowerCase() !== currentUser.email.toLowerCase()
    );

    const updatedEvent = { ...evt, members: updatedMembers };
    handleUpdateEvent(updatedEvent);
    setToastMsg(`已拒絕活動「${evt.title}」的邀請。`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 刪除/退出雲端活動
  const handleDeleteEvent = async (id: string) => {
    // 1. 本地移出
    const updated = events.filter((e) => e.id !== id);
    saveEventsToStorage(updated);
    if (selectedEventId === id) {
      setSelectedEventId(null);
    }

    // 2. 雲端同步刪除 (會受 RLS 安全限制，防範越權刪除)
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setToastMsg('活動已成功移出！');
    } catch (e) {
      console.error("Failed to delete event", e);
      setToastMsg('已將活動從列表移出。');
    }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 找出當前選取的活動
  const currentEvent = events.find((e) => e.id === selectedEventId);

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="indigo-emerald-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>
      </svg>

      <div className="app-container">
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={24} style={{ stroke: 'url(#indigo-emerald-grad)' }} />
            <span style={{ fontWeight: 'bold', fontSize: '18px' }} className="title-gradient">
              ShareSettle
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>v1.0.0</span>
          </div>
        </header>

        <main className="content-body">
          {!currentUser ? (
            <LoginScreen />
          ) : currentEvent ? (
            <EventDashboard
              event={currentEvent}
              onBack={() => setSelectedEventId(null)}
              onUpdateEvent={handleUpdateEvent}
              currentUser={currentUser}
            />
          ) : (
            <EventSelector
              events={events}
              onCreateEvent={handleCreateEvent}
              onSelectEvent={(id) => setSelectedEventId(id)}
              currentUser={currentUser}
              onLogout={handleLogout}
              onSaveUserPaymentMethods={handleSaveUserPaymentMethods}
              onDeleteEvent={handleDeleteEvent}
              onAcceptInvite={handleAcceptInvite}
              onDeclineInvite={handleDeclineInvite}
              onShowProfileModal={() => setShowProfileModal(true)}
            />
          )}
        </main>

        {/* 全域 Toast */}
        {showToast && (
          <div className="toast-msg">
            <CheckCircle2 size={16} style={{ color: 'var(--color-secondary-light)' }} />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>

      {currentUser && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          currentUser={currentUser}
          events={events}
          onUpdateCurrentUser={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem('sharesettle_session', JSON.stringify(updated));
          }}
          onUpdateEventsState={(updatedEvents) => {
            setEvents(updatedEvents);
            localStorage.setItem('sharesettle_events', JSON.stringify(updatedEvents));
          }}
        />
      )}
    </>
  );
}

export default App;
