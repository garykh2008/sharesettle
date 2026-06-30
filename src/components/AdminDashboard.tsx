import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Calendar, DollarSign, Search, ShieldCheck, User } from 'lucide-react';
import { supabase } from '../supabase';
import type { SplitEvent } from '../types';

interface AdminDashboardProps {
  onBack: () => void;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  is_admin: boolean;
  updated_at: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [events, setEvents] = useState<SplitEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'events'>('users');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        setLoading(true);
        // 抓取所有使用者
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .order('updated_at', { ascending: false });

        if (profilesError) throw profilesError;

        // 抓取所有活動
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .order('created_at', { ascending: false });

        if (eventsError) throw eventsError;

        if (profilesData) {
          setUsers(profilesData.map((p: any) => ({
            id: p.id,
            email: p.email,
            name: p.name,
            avatar_url: p.avatar_url,
            is_admin: p.is_admin || false,
            updated_at: p.updated_at
          })));
        }

        if (eventsData) {
          setEvents(eventsData.map((d: any) => ({
            id: d.id,
            title: d.title,
            description: d.description,
            defaultCurrency: d.default_currency,
            usdToTwdRate: Number(d.usd_to_twd_rate),
            supportedCurrencies: d.supported_currencies || ['TWD'],
            settlementCurrency: d.settlement_currency || d.default_currency || 'TWD',
            exchangeRates: d.exchange_rates,
            status: d.status as 'active' | 'settled',
            members: d.members || [],
            expenses: d.expenses || [],
            settlements: d.settlements,
            createdAt: d.created_at
          })));
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || '載入後台資料失敗，請確認您具有管理員權限。');
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, []);

  const totalExpenses = events.reduce((sum, e) => sum + e.expenses.length, 0);
  const totalSettledEvents = events.filter(e => e.status === 'settled').length;

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredEvents = events.filter(e => 
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    e.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '30px' }}>
      {/* 頭部導覽 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', position: 'sticky', top: 0, background: 'var(--bg-main)', zIndex: 10, padding: '15px 0' }}>
        <button className="btn btn-secondary btn-icon" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={24} style={{ color: '#8b5cf6' }} />
          系統管理後台
        </h2>
      </div>

      {error ? (
        <div style={{ background: 'rgba(244,63,94,0.1)', color: '#f87171', padding: '15px', borderRadius: '12px', border: '1px solid rgba(244,63,94,0.3)' }}>
          {error}
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-secondary)' }}>
          載入中...
        </div>
      ) : (
        <>
          {/* 統計資料區塊 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <div className="card-glass" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Users size={16} /> 總註冊用戶
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{users.length}</div>
            </div>
            <div className="card-glass" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Calendar size={16} /> 總建立活動
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {events.length} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}>({totalSettledEvents} 已結算)</span>
              </div>
            </div>
            <div className="card-glass" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <DollarSign size={16} /> 總記帳筆數
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalExpenses}</div>
            </div>
          </div>

          {/* 分頁與搜尋 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="tabs-container" style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
              <div 
                className={`tab ${activeTab === 'users' ? 'active' : ''}`}
                onClick={() => setActiveTab('users')}
              >
                使用者列表
              </div>
              <div 
                className={`tab ${activeTab === 'events' ? 'active' : ''}`}
                onClick={() => setActiveTab('events')}
              >
                活動列表
              </div>
            </div>

            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input-field"
                placeholder={activeTab === 'users' ? "搜尋姓名或信箱..." : "搜尋活動名稱..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 列表內容 */}
          {activeTab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredUsers.map(user => (
                <div key={user.id} className="card-glass" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={24} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{user.name}</span>
                      {user.is_admin && (
                        <span style={{ fontSize: '10px', background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(139,92,246,0.3)' }}>管理員</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {user.email}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                    <div style={{ marginBottom: '4px' }}>更新時間</div>
                    {new Date(user.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>找不到使用者</div>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredEvents.map(ev => (
                <div key={ev.id} className="card-glass" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>{ev.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>ID: <span style={{ fontFamily: 'monospace' }}>{ev.id.split('-')[0]}...</span></div>
                    </div>
                    {ev.status === 'settled' ? (
                      <span style={{ fontSize: '11px', background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '4px 8px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.3)' }}>已結算</span>
                    ) : (
                      <span style={{ fontSize: '11px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '4px 8px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.3)' }}>進行中</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={14} /> {ev.members.length} 人
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DollarSign size={14} /> {ev.expenses.length} 筆帳目
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                      建立於 {new Date(ev.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
              {filteredEvents.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>找不到活動</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
