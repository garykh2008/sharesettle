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

  // 取得全域個人收款設定
  const getUserProfile = (email: string): PaymentMethod[] => {
    try {
      const profilesStr = localStorage.getItem('sharesettle_user_profiles');
      if (profilesStr) {
        const profiles = JSON.parse(profilesStr);
        if (profiles[email.toLowerCase()]) {
          return profiles[email.toLowerCase()].paymentMethods || [];
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  // 保存全域個人收款設定
  const saveUserProfile = (email: string, name: string, paymentMethods: PaymentMethod[]) => {
    try {
      const profilesStr = localStorage.getItem('sharesettle_user_profiles') || '{}';
      const profiles = JSON.parse(profilesStr);
      profiles[email.toLowerCase()] = { name, email, paymentMethods };
      localStorage.setItem('sharesettle_user_profiles', JSON.stringify(profiles));
    } catch (e) {
      console.error(e);
    }
  };

  // 同步收款設定到本機所有活動中該 Email 對應的成員
  const syncUserPaymentMethodsToEvents = (email: string, methods: PaymentMethod[]) => {
    setEvents((prevEvents) => {
      const updated = prevEvents.map(evt => {
        const memberIdx = evt.members.findIndex(m => m.email.toLowerCase() === email.toLowerCase());
        if (memberIdx !== -1) {
          const updatedMembers = [...evt.members];
          updatedMembers[memberIdx] = {
            ...updatedMembers[memberIdx],
            paymentMethods: methods
          };
          return { ...evt, members: updatedMembers };
        }
        return evt;
      });
      localStorage.setItem('sharesettle_events', JSON.stringify(updated));
      return updated;
    });
  };

  // 1. 於元件掛載時從 LocalStorage 載入資料，並檢查 URL 分享連結
  useEffect(() => {
    // 載入登入狀態
    const storedSession = localStorage.getItem('sharesettle_session');
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession) as UserSession;
        const paymentMethods = getUserProfile(session.email);
        setCurrentUser({ ...session, paymentMethods });
      } catch (e) {
        console.error('Failed to parse session', e);
      }
    }

    // 載入本機活動快取
    const savedEvents = localStorage.getItem('sharesettle_events');
    if (savedEvents) {
      setEvents(JSON.parse(savedEvents));
    }

    // 2. 檢查 URL 是否帶有匯入 Hash: #/import/[serialized_data] 或 #/join/[event_id]
    const handleHashImport = () => {
      const hash = window.location.hash;
      
      // A. 舊型 Base64 匯入
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

            setToastMsg(`已成功匯入「${importedEvent.title}」活動！`);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
          } else {
            alert('分享代碼解析失敗，請確認網址完整性。');
            window.location.hash = '';
          }
        }
      }

      // B. 新型雲端 Event ID 匯入: #/join/[event_id]
      if (hash && hash.startsWith('#/join/')) {
        const eventId = hash.replace('#/join/', '');
        if (eventId) {
          if (isSupabaseConfigured) {
            supabase
              .from('events')
              .select('*')
              .eq('id', eventId)
              .single()
              .then(({ data, error }) => {
                if (error) {
                  console.error(error);
                  alert("無法載入該雲端活動，請確認活動 ID 是否正確。");
                  return;
                }
                if (data) {
                  const mappedEvent: SplitEvent = {
                    id: data.id,
                    title: data.title,
                    description: data.description,
                    defaultCurrency: data.default_currency as 'USD' | 'TWD',
                    usdToTwdRate: Number(data.usd_to_twd_rate),
                    status: data.status as 'active' | 'settled',
                    members: data.members as Member[],
                    expenses: data.expenses as Expense[],
                    settlements: data.settlements as any,
                    createdAt: data.created_at
                  };

                  setEvents((prevEvents) => {
                    const existsIdx = prevEvents.findIndex((e) => e.id === mappedEvent.id);
                    let updated = [...prevEvents];
                    if (existsIdx >= 0) {
                      updated[existsIdx] = mappedEvent;
                    } else {
                      updated = [mappedEvent, ...updated];
                    }
                    localStorage.setItem('sharesettle_events', JSON.stringify(updated));
                    return updated;
                  });

                  setSelectedEventId(mappedEvent.id);
                  setToastMsg(`已成功加入雲端活動「${mappedEvent.title}」！`);
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 3000);
                }
              });
          } else {
            alert("本機尚未設定 Supabase 雲端金鑰，無法使用雲端加入網址。");
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
  }, []);

  // 訂閱雲端即時自動同步 (當選取某個活動時)
  useEffect(() => {
    if (!selectedEventId || !isSupabaseConfigured) return;

    // 進入活動時，先向 Supabase 獲取最新狀態更新本機
    const fetchFreshEvent = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', selectedEventId)
          .single();
        
        if (error) throw error;
        if (data) {
          const mappedEvent: SplitEvent = {
            id: data.id,
            title: data.title,
            description: data.description,
            defaultCurrency: data.default_currency as 'USD' | 'TWD',
            usdToTwdRate: Number(data.usd_to_twd_rate),
            status: data.status as 'active' | 'settled',
            members: data.members as Member[],
            expenses: data.expenses as Expense[],
            settlements: data.settlements as any,
            createdAt: data.created_at
          };

          setEvents((prev) => {
            const idx = prev.findIndex(e => e.id === selectedEventId);
            let updated = [...prev];
            if (idx >= 0) {
              updated[idx] = mappedEvent;
            } else {
              updated = [mappedEvent, ...updated];
            }
            localStorage.setItem('sharesettle_events', JSON.stringify(updated));
            return updated;
          });
        }
      } catch (e) {
        console.error("Failed to fetch fresh event from Supabase", e);
      }
    };

    fetchFreshEvent();

    // 訂閱活動更新通道
    const channel = supabase
      .channel(`event-changes-${selectedEventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${selectedEventId}` },
        (payload) => {
          const data = payload.new as any;
          if (data) {
            const mappedEvent: SplitEvent = {
              id: data.id,
              title: data.title,
              description: data.description,
              defaultCurrency: data.default_currency as 'USD' | 'TWD',
              usdToTwdRate: Number(data.usd_to_twd_rate),
              status: data.status as 'active' | 'settled',
              members: data.members as Member[],
              expenses: data.expenses as Expense[],
              settlements: data.settlements as any,
              createdAt: data.created_at
            };

            setEvents((prev) => {
              const idx = prev.findIndex(e => e.id === selectedEventId);
              let updated = [...prev];
              if (idx >= 0) {
                updated[idx] = mappedEvent;
              } else {
                updated = [mappedEvent, ...updated];
              }
              localStorage.setItem('sharesettle_events', JSON.stringify(updated));
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedEventId]);

  // 當 events 改變時，自動寫入 LocalStorage 備份快取
  const saveEventsToStorage = (updatedEvents: SplitEvent[]) => {
    setEvents(updatedEvents);
    localStorage.setItem('sharesettle_events', JSON.stringify(updatedEvents));
  };

  // 登入處理
  const handleLogin = (session: UserSession) => {
    const paymentMethods = getUserProfile(session.email);
    const updatedSession = { ...session, paymentMethods };
    setCurrentUser(updatedSession);
    localStorage.setItem('sharesettle_session', JSON.stringify(updatedSession));
    
    // 同步到本機所有活動
    syncUserPaymentMethodsToEvents(updatedSession.email, paymentMethods);

    setToastMsg(`歡迎回來，${session.name}！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 登出處理
  const handleLogout = () => {
    if (window.confirm('確定要登出嗎？登出將清除本機身分記錄。')) {
      setCurrentUser(null);
      setSelectedEventId(null);
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
      paymentMethods: currentUser.paymentMethods || [] // 帶入個人收款設定
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

    // B. 更新本地 cache
    const updated = [newEvent, ...events];
    saveEventsToStorage(updated);
    setSelectedEventId(newEvent.id);

    setToastMsg(`活動「${title}」已建立！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 匯入分帳活動 (同時支援手動貼上 Legacy 壓縮碼，或新版雲端 Event ID / Share URL)
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
      
      // 嘗試回寫雲端以防止雲端沒有此活動
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
          if (error && error.code !== '23505') { // 23505 = unique_violation, 忽略已存在錯誤
            console.error("Supabase back-write error", error);
          }
        });
      }
      return true;
    }

    // 2. 如果不是 Base64，且雲端已配置，視為 Event ID 或 /join/ 網址
    if (isSupabaseConfigured) {
      let eventId = trimmedInput;
      if (eventId.includes('#/join/')) {
        eventId = eventId.substring(eventId.indexOf('#/join/') + 7);
      }
      // 移除可能附加的任何 query params
      if (eventId.includes('?')) {
        eventId = eventId.split('?')[0];
      }

      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .single();
        
        if (error) throw error;
        if (data) {
          const cloudEvent: SplitEvent = {
            id: data.id,
            title: data.title,
            description: data.description,
            defaultCurrency: data.default_currency as 'USD' | 'TWD',
            usdToTwdRate: Number(data.usd_to_twd_rate),
            status: data.status as 'active' | 'settled',
            members: data.members as Member[],
            expenses: data.expenses as Expense[],
            settlements: data.settlements as any,
            createdAt: data.created_at
          };

          setEvents((prevEvents) => {
            const existsIdx = prevEvents.findIndex((e) => e.id === cloudEvent.id);
            let updated = [...prevEvents];
            if (existsIdx >= 0) {
              updated[existsIdx] = cloudEvent;
            } else {
              updated = [cloudEvent, ...updated];
            }
            localStorage.setItem('sharesettle_events', JSON.stringify(updated));
            return updated;
          });

          setSelectedEventId(cloudEvent.id);
          return true;
        }
      } catch (e) {
        console.error("Supabase import error", e);
      }
    }
    return false;
  };

  // 更新單一活動 (同步推送到 Supabase 雲端，並觸發所有用戶端的訂閱更新)
  const handleUpdateEvent = (updatedEvent: SplitEvent) => {
    // A. 樂觀更新本機 cache
    const updated = events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
    saveEventsToStorage(updated);

    // B. 非同步寫入 Supabase (不卡 UI 進度)
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
    const paymentMethods = getUserProfile(session.email);
    const updatedSession = { ...session, paymentMethods };
    setCurrentUser(updatedSession);
    localStorage.setItem('sharesettle_session', JSON.stringify(updatedSession));

    // 同步到本機所有活動
    syncUserPaymentMethodsToEvents(updatedSession.email, paymentMethods);
    
    setToastMsg(`已切換為「${session.name}」的視角！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 儲存使用者個人收款設定
  const handleSaveUserPaymentMethods = (methods: PaymentMethod[]) => {
    if (!currentUser) return;
    const updatedSession = { ...currentUser, paymentMethods: methods };
    setCurrentUser(updatedSession);
    localStorage.setItem('sharesettle_session', JSON.stringify(updatedSession));

    saveUserProfile(currentUser.email, currentUser.name, methods);
    syncUserPaymentMethodsToEvents(currentUser.email, methods);

    setToastMsg('您的個人收款設定已儲存！');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 找出當前選取的活動
  const currentEvent = events.find((e) => e.id === selectedEventId);

  return (
    <>
      {/* 定義全域 SVG 漸層，提供 Lucide 等圖示使用 */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="indigo-emerald-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>
      </svg>

      <div className="app-container">
        {/* 標題欄：非登入狀態與活動詳情狀態有不同標題 */}
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
                ☁️ 雲端已連線
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
