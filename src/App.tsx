import { useState, useEffect } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { EventSelector } from './components/EventSelector';
import { EventDashboard } from './components/EventDashboard';
import type { SplitEvent, UserSession, Member, PaymentMethod } from './types';
import { deserializeEvent } from './utils';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';

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
        // 同步載入全域最新收款方式
        const paymentMethods = getUserProfile(session.email);
        setCurrentUser({ ...session, paymentMethods });
      } catch (e) {
        console.error('Failed to parse session', e);
      }
    }

    // 載入分帳活動列表
    const storedEvents = localStorage.getItem('sharesettle_events');
    let loadedEvents: SplitEvent[] = [];
    if (storedEvents) {
      try {
        loadedEvents = JSON.parse(storedEvents);
        setEvents(loadedEvents);
      } catch (e) {
        console.error('Failed to parse events', e);
      }
    }

    // 2. 檢查 URL 是否帶有匯入 Hash: #/import/[serialized_data]
    const handleHashImport = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#/import/')) {
        const encodedData = hash.replace('#/import/', '');
        if (encodedData) {
          const importedEvent = deserializeEvent(encodedData);
          if (importedEvent) {
            // 檢查是否已有相同 ID 的活動
            setEvents((prevEvents) => {
              const existsIdx = prevEvents.findIndex((e) => e.id === importedEvent.id);
              let updated = [...prevEvents];
              if (existsIdx >= 0) {
                // 覆蓋舊資料
                updated[existsIdx] = importedEvent;
              } else {
                // 加入新資料
                updated = [importedEvent, ...updated];
              }
              // 存回 LocalStorage
              localStorage.setItem('sharesettle_events', JSON.stringify(updated));
              return updated;
            });

            // 自動選取該匯入的活動
            setSelectedEventId(importedEvent.id);
            
            // 清除 Hash 避免重複匯入
            window.location.hash = '';

            // 顯示 Toast 成功提示
            setToastMsg(`已成功匯入「${importedEvent.title}」活動！`);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
          } else {
            alert('分享代碼解析失敗，請確認網址完整性。');
            window.location.hash = '';
          }
        }
      }
    };

    // 初始檢查並監聽 Hash 改變
    handleHashImport();
    window.addEventListener('hashchange', handleHashImport);

    return () => {
      window.removeEventListener('hashchange', handleHashImport);
    };
  }, []);

  // 3. 當 events 改變時，自動寫入 LocalStorage
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
  const handleCreateEvent = (title: string, currency: 'USD' | 'TWD', rate: number, desc?: string) => {
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

    const updated = [newEvent, ...events];
    saveEventsToStorage(updated);
    setSelectedEventId(newEvent.id);

    setToastMsg(`活動「${title}」已建立！`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 匯入分帳活動 (透過手動貼上分享碼)
  const handleImportEventString = (encoded: string): boolean => {
    const importedEvent = deserializeEvent(encoded);
    if (importedEvent) {
      // 檢查是否已加入
      const existsIdx = events.findIndex((e) => e.id === importedEvent.id);
      let updated = [...events];
      if (existsIdx >= 0) {
        updated[existsIdx] = importedEvent;
      } else {
        updated = [importedEvent, ...updated];
      }
      saveEventsToStorage(updated);
      setSelectedEventId(importedEvent.id);
      return true;
    }
    return false;
  };

  // 更新單一活動 (包含新增消費、編輯消費、邀請成員等變更)
  const handleUpdateEvent = (updatedEvent: SplitEvent) => {
    const updated = events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
    saveEventsToStorage(updated);
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
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>v1.0.0</span>
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
