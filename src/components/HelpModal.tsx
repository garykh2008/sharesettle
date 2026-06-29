import React, { useState } from 'react';
import { X, BookOpen } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = 'start' | 'splits' | 'currency' | 'payment';

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('start');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }}>
      <div className="modal-content animate-scale-up" style={{ maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '16px 20px' }}>
          <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <BookOpen className="title-gradient" size={20} />
            使用說明與功能引導
          </h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
            <X size={16} />
          </button>
        </div>

        {/* 說明分頁導覽 */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
          <button
            className={`tab-btn ${activeTab === 'start' ? 'active' : ''}`}
            onClick={() => setActiveTab('start')}
            style={{ flex: 1, padding: '12px 6px', fontSize: '12.5px', whiteSpace: 'nowrap', borderBottom: activeTab === 'start' ? '2px solid var(--color-primary)' : 'none', background: 'none', color: activeTab === 'start' ? 'var(--color-primary-light)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'start' ? 'bold' : 'normal' }}
          >
            🚀 快速上手
          </button>
          <button
            className={`tab-btn ${activeTab === 'splits' ? 'active' : ''}`}
            onClick={() => setActiveTab('splits')}
            style={{ flex: 1, padding: '12px 6px', fontSize: '12.5px', whiteSpace: 'nowrap', borderBottom: activeTab === 'splits' ? '2px solid var(--color-primary)' : 'none', background: 'none', color: activeTab === 'splits' ? 'var(--color-primary-light)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'splits' ? 'bold' : 'normal' }}
          >
            👥 分帳模式
          </button>
          <button
            className={`tab-btn ${activeTab === 'currency' ? 'active' : ''}`}
            onClick={() => setActiveTab('currency')}
            style={{ flex: 1, padding: '12px 6px', fontSize: '12.5px', whiteSpace: 'nowrap', borderBottom: activeTab === 'currency' ? '2px solid var(--color-primary)' : 'none', background: 'none', color: activeTab === 'currency' ? 'var(--color-primary-light)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'currency' ? 'bold' : 'normal' }}
          >
            💱 多幣結算
          </button>
          <button
            className={`tab-btn ${activeTab === 'payment' ? 'active' : ''}`}
            onClick={() => setActiveTab('payment')}
            style={{ flex: 1, padding: '12px 6px', fontSize: '12.5px', whiteSpace: 'nowrap', borderBottom: activeTab === 'payment' ? '2px solid var(--color-primary)' : 'none', background: 'none', color: activeTab === 'payment' ? 'var(--color-primary-light)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'payment' ? 'bold' : 'normal' }}
          >
            💵 收款設定
          </button>
        </div>

        {/* 說明內文區塊 */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
          {activeTab === 'start' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--color-primary-light)', margin: '0 0 4px 0' }}>👋 歡迎使用 ShareSettle 雲端分帳</h3>
              <p style={{ margin: 0 }}>這是一個專為團體出遊、聚餐合租設計的實時雲端記帳軟體。免去手動計算，簡單幾步即可完成最佳化分帳與收付款對帳。</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,242,254,0.12)', color: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>1</div>
                  <div>
                    <strong>建立活動</strong>：在首頁點選「建立新活動」，輸入活動名稱、簡介並自訂您要支援的交易幣別與結算本位幣。
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,242,254,0.12)', color: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>2</div>
                  <div>
                    <strong>邀請成員</strong>：進入活動後，點擊右上角「分享連結」，傳給您的朋友。他們點開即可透過雲端一鍵快速加入活動。
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,242,254,0.12)', color: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>3</div>
                  <div>
                    <strong>記帳與結清</strong>：點擊「記一筆」新增消費。旅程結束後，切換到「結算分析」進行鎖定，系統會自動規劃最少轉帳次數的建議方案。
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'splits' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--color-primary-light)', margin: '0 0 2px 0' }}>⚖️ 四種分帳模式，滿足所有記帳場景</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="card-glass" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '3px' }}>1. 👥 每人平分</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>最常見的預設模式。金額會平均分配給活動中的所有成員。</div>
                </div>
                
                <div className="card-glass" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '3px' }}>2. 🎯 部分平分</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>若某筆消費僅由部分人分攤（例如某些人喝酒、部分人吃素），可勾選指定特定的成員進行均分。</div>
                </div>
                
                <div className="card-glass" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '3px' }}>3. ✏️ 個別自訂</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>手動為每位成員輸入特定分攤金額。例如：A 付 $20、B 付 $30 等。</div>
                </div>
                
                <div className="card-glass" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '3px' }}>4. 📋 明細分攤（項目計價）</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>適合超市採購或合點菜色。可以逐筆新增子項目與價格，並勾選該項目由誰平分，系統會自動歸納每人應付總額。</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'currency' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--color-primary-light)', margin: '0 0 2px 0' }}>💱 支援多幣別與客製化匯率</h3>
              <p style={{ margin: 0 }}>我們支援 <strong>TWD (新台幣)</strong>、<strong>USD (美金)</strong> 與 <strong>JPY (日圓)</strong> 的跨國混合記帳：</p>
              
              <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                <li>在建立活動時，可以勾選該活動要使用的所有幣別，並設定以哪種貨幣為最終結算幣別。</li>
                <li>活動中支援設定各幣別對結算幣別的自訂匯率，記帳時選擇非本位幣消費，系統會**自動對照折合金額**。</li>
                <li><strong>美金小費/稅金自動分攤 (僅美金支援)</strong>：在自訂或明細分攤中，若總付款金額大於分攤明細合計，差額將自動等比例分攤為小費或稅金。</li>
                <li><strong>非美金之金額一致性校驗 (TWD/JPY)</strong>：台幣與日圓不支持小費比例分配。若輸入金額與總額不符，系統會動態提示相差金額，並要求完全一致後方可存檔，確保帳目完全精確。</li>
              </ul>
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--color-primary-light)', margin: '0 0 2px 0' }}>💳 設定收款管道，輕鬆對帳與付清</h3>
              <p style={{ margin: 0 }}>ShareSettle 設計了收款管道預載機制，方便成員在結帳時一眼看到您的收款資料：</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <div style={{ borderLeft: '3px solid var(--color-primary-light)', paddingLeft: '10px' }}>
                  <strong>收款設定</strong>：點選活動列表上方的「收款設定」，可以勾選接受現金、或輸入您的銀行轉帳代碼（如: 國泰世華 013 帳號 xxxxx）。
                </div>
                <div style={{ borderLeft: '3px solid var(--color-primary-light)', paddingLeft: '10px' }}>
                  <strong>自動同步</strong>：設定儲存後，該收款資料會即時同步到您參與的**所有活動成員名單**中。
                </div>
                <div style={{ borderLeft: '3px solid var(--color-primary-light)', paddingLeft: '10px' }}>
                  <strong>一鍵付款</strong>：結帳時，付款人可在轉帳清單中直接查閱收款人的收款管道並複製帳號，無需在群組中反覆詢問，收付款極致流暢！
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', background: 'rgba(0,0,0,0.1)' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: '8px 24px', fontSize: '13px' }}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};
