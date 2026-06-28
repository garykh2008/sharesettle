import { useState, useEffect } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { EventSelector } from './components/EventSelector';
import { EventDashboard } from './components/EventDashboard';
import type { SplitEvent, UserSession, Member, PaymentMethod, Expense } from './types';
import { deserializeEvent } from './utils';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabase';

function App() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [events, setEvents] = useState<SplitEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Toast 訊息狀態
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // 1. 於元件掛載時訂閱 Supabase Auth 狀態，並處理 Hash 連結
  useEffect(() => {
    if (isSupabaseConfigured) {
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

      // 載入本機活動快取作為預載
      const savedEvents = localStorage.getItem('sharesettle_events');
      if (savedEvents) {
        setEvents(JSON.parse(savedEvents));
      }

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // B. 傳統 Mock 登入模式
      const storedSession = localStorage.getItem('sharesettle_session');
      if (storedSession) {
        setCurrentUser(JSON.parse(storedSession));
      }
      const savedEvents = localStorage.getItem('sharesettle_events');
      if (savedEvents) {
        setEvents(JSON.parse(savedEvents));
      }
    }
  }, []);

  // 當 URL Hash 改變時，檢查是否有加入連結
  useEffect(() => {
    const handleHashImport = () => {
      const hash = window.location.hash;

      // 雲端 Event ID 匯入: #/join/[event_id]
      if (hash && hash.startsWith('#/join/')) {
        const eventId = hash.replace('#/join/', '');
        if (eventId) {
          if (isSupabaseConfigured) {
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
          } else {
            alert("本機尚未設定 Supabase 雲端金鑰，無法使用雲端加入功能。");
          }
          window.location.hash = '';
        }
      }

      // 舊版 Base64 匯入相容
      if (hash && hash.startsWith('#/import/')) {
        const encodedData = hash.replace('#/import/', '');
        if (encodedData) {
          const importedEvent = deserializeEvent(encodedData);
          if (importedEvent) {
            setEvents((prevEvents) => {
              const existsIdx = prevEvents.findIndex((e) => e.id === importedEvent.id);
              let updated = [...prevEvents];
              if (existsIdx >= 0) {
                updated[existsIdx] = importedEvent;
              } else {
                updated = [importedEvent, ...updated];
              }
              localStorage.setItem('sharesettle_events', JSON.stringify(updated));
              return updated;
            });
            setSelectedEventId(importedEvent.id);
            window.location.hash = '';
            setToastMsg(`已成功匯入本機活動「${importedEvent.title}」！`);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
          }
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
      }
    } catch (e) {
      console.warn("User profile details not yet in profiles table, using auth metadata", e);
    }

    const updatedSession: UserSession = {
      id: session.user.id,
      email,
      name,
      paymentMethods
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
    if (!currentUser || !isSupabaseConfigured) return;

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
        () => {
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
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();
      
      if (error) throw error;
      if (data) {
        const membersList = data.members as Member[];
        const isMember = membersList.some(m => m.email.toLowerCase() === sessionUser.email.toLowerCase());
        
        if (!isMember) {
          if (window.confirm(`您被邀請參與分帳活動「${data.title}」，是否確定加入此活動？`)) {
            const newMember: Member = {
              id: Math.random().toString(36).substring(2, 9),
              name: sessionUser.name,
              email: sessionUser.email,
              paymentMethods: sessionUser.paymentMethods || []
            };
            const updatedMembers = [...membersList, newMember];
            
            const { error: updateError } = await supabase
              .from('events')
              .update({ members: updatedMembers })
              .eq('id', eventId);
            
            if (updateError) throw updateError;
            setToastMsg(`成功加入活動「${data.title}」！`);
          } else {
            return;
          }
        }
        
        const mappedEvent: SplitEvent = {
          id: data.id,
          title: data.title,
          description: data.description,
          defaultCurrency: data.default_currency as 'USD' | 'TWD',
          usdToTwdRate: Number(data.usd_to_twd_rate),
          status: data.status as 'active' | 'settled',
          members: isMember ? membersList : [...membersList, {
            id: Math.random().toString(36).substring(2, 9),
            name: sessionUser.name,
            email: sessionUser.email,
            paymentMethods: sessionUser.paymentMethods || []
          }],
          expenses: data.expenses as Expense[],
          settlements: data.settlements as any,
          createdAt: data.created_at
        };

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
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
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

  // 登入處理 (傳統模擬模式的後備)
  const handleLogin = (session: UserSession) => {
    setCurrentUser(session);
    localStorage.setItem('sharesettle_session', JSON.stringify(session));
    setToastMsg(`歡迎回來，${session.name}！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 登出處理
  const handleLogout = async () => {
    if (window.confirm('確定要登出嗎？')) {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      setCurrentUser(null);
      setSelectedEventId(null);
      setEvents([]);
      localStorage.removeItem('sharesettle_session');
    }
  };

  // 建立新活動
  const handleCreateEvent = async (title: string, currency: 'USD' | 'TWD', rate: number, desc?: string) => {
    if (!currentUser) return;

    const newMember: Member = {
      id: Math.random().toString(36).substring(2, 9),
      name: currentUser.name,
      email: currentUser.email,
      paymentMethods: currentUser.paymentMethods || []
    };

    const newEvent: SplitEvent = {
      id: Math.random().toString(36).substring(2, 9),
      title,
      description: desc,
      defaultCurrency: currency,
      usdToTwdRate: rate,
      members: [newMember],
      expenses: [],
      createdAt: new Date().toISOString(),
    };

    // A. 寫入 Supabase 雲端
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('events').insert({
          id: newEvent.id,
          title: newEvent.title,
          description: newEvent.description,
          default_currency: newEvent.defaultCurrency,
          usd_to_twd_rate: newEvent.usdToTwdRate,
          status: newEvent.status || 'active',
          members: newEvent.members,
          expenses: newEvent.expenses,
          settlements: newEvent.settlements
        });
        if (error) throw error;
      } catch (e) {
        console.error("Failed to create event in Supabase", e);
        alert("建立雲端活動失敗，將暫存於本機。");
      }
    }

    // B. 更新本地快取
    const updated = [newEvent, ...events];
    saveEventsToStorage(updated);
    setSelectedEventId(newEvent.id);

    setToastMsg(`活動「${title}」已建立！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 匯入活動
  const handleImportEventString = async (input: string): Promise<boolean> => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return false;

    // 1. 先嘗試以舊版 Base64 解碼
    const importedEvent = deserializeEvent(trimmedInput);
    if (importedEvent) {
      const existsIdx = events.findIndex((e) => e.id === importedEvent.id);
      let updated = [...events];
      if (existsIdx >= 0) {
        updated[existsIdx] = importedEvent;
      } else {
        updated = [importedEvent, ...updated];
      }
      saveEventsToStorage(updated);
      setSelectedEventId(importedEvent.id);
      
      if (isSupabaseConfigured) {
        supabase.from('events').insert({
          id: importedEvent.id,
          title: importedEvent.title,
          description: importedEvent.description,
          default_currency: importedEvent.defaultCurrency,
          usd_to_twd_rate: importedEvent.usdToTwdRate,
          status: importedEvent.status || 'active',
          members: importedEvent.members,
          expenses: importedEvent.expenses,
          settlements: importedEvent.settlements
        }).then(({ error }) => {
          if (error && error.code !== '23505') {
            console.error("Supabase back-write error", error);
          }
        });
      }
      return true;
    }

    // 2. 雲端連結或 ID 加入
    if (isSupabaseConfigured && currentUser) {
      let eventId = trimmedInput;
      if (eventId.includes('#/join/')) {
        eventId = eventId.substring(eventId.indexOf('#/join/') + 7);
      }
      if (eventId.includes('?')) {
        eventId = eventId.split('?')[0];
      }

      await handleJoinEventById(eventId, currentUser);
      return true;
    }
    return false;
  };

  // 更新單一活動 (推動至 Supabase)
  const handleUpdateEvent = (updatedEvent: SplitEvent) => {
    const updated = events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
    saveEventsToStorage(updated);

    if (isSupabaseConfigured) {
      supabase
        .from('events')
        .update({
          title: updatedEvent.title,
          description: updatedEvent.description,
          default_currency: updatedEvent.defaultCurrency,
          usd_to_twd_rate: updatedEvent.usdToTwdRate,
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
    }
  };

  // 切換模擬身分視角
  const handleSwitchSimulatedUser = (session: UserSession) => {
    setCurrentUser(session);
    setToastMsg(`已切換為「${session.name}」的視角！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 儲存使用者個人收款設定 (更新 profiles 表與雲端觸發同步)
  const handleSaveUserPaymentMethods = async (methods: PaymentMethod[]) => {
    if (!currentUser) return;

    if (isSupabaseConfigured && currentUser.id) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ payment_methods: methods })
          .eq('id', currentUser.id);
        
        if (error) throw error;
        setToastMsg('個人收款設定已儲存至雲端！');
      } catch (e) {
        console.error("Failed to save profiles to database", e);
        setToastMsg('雲端儲存失敗，已暫存至本地。');
      }
    } else {
      setToastMsg('個人收款設定已儲存！');
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

  // 刪除/退出雲端或本地活動
  const handleDeleteEvent = async (id: string) => {
    // 1. 本地移出
    const updated = events.filter((e) => e.id !== id);
    saveEventsToStorage(updated);
    if (selectedEventId === id) {
      setSelectedEventId(null);
    }

    // 2. 雲端同步刪除 (會受 RLS 安全限制，防範越權刪除)
    if (isSupabaseConfigured) {
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
    } else {
      setToastMsg('活動已成功刪除。');
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
            {isSupabaseConfigured ? (
              <span className="badge badge-emerald" style={{ fontSize: '9px', textTransform: 'none', background: 'rgba(16, 185, 129, 0.08)' }}>
                ☁️ 雲端同步中
              </span>
            ) : (
              <span className="badge badge-rose" style={{ fontSize: '9px', textTransform: 'none', background: 'rgba(244, 63, 94, 0.08)' }}>
                ⚠️ 離線 LocalStorage 模式
              </span>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>v1.0.0</span>
          </div>
        </header>

        <main className="content-body">
          {!currentUser ? (
            <LoginScreen onLogin={handleLogin} />
          ) : currentEvent ? (
            <EventDashboard
              event={currentEvent}
              onBack={() => setSelectedEventId(null)}
              onUpdateEvent={handleUpdateEvent}
              currentUser={currentUser}
              onSwitchSimulatedUser={handleSwitchSimulatedUser}
            />
          ) : (
            <EventSelector
              events={events}
              onCreateEvent={handleCreateEvent}
              onSelectEvent={(id) => setSelectedEventId(id)}
              onImportEvent={handleImportEventString}
              currentUser={currentUser}
              onLogout={handleLogout}
              onSaveUserPaymentMethods={handleSaveUserPaymentMethods}
              onDeleteEvent={handleDeleteEvent}
              onAcceptInvite={handleAcceptInvite}
              onDeclineInvite={handleDeclineInvite}
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
    </>
  );
}

export default App;
