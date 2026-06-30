import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, Upload } from 'lucide-react';
import type { Member, Expense, SplitType, ExpenseSplit, Currency } from '../types';
import { round, calculateTipSplits, getCurrencySymbol, compressImage } from '../utils';
import { supabase } from '../supabase';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id'> & { id?: string }) => void;
  members: Member[];
  expenseToEdit?: Expense | null;
  supportedCurrencies: Currency[];
  defaultCurrency: Currency;
  eventId: string;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  members,
  expenseToEdit,
  supportedCurrencies,
  defaultCurrency,
  eventId,
}) => {
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [paidById, setPaidById] = useState('');
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  
  const [splitType, setSplitType] = useState<SplitType>('equal');
  // 記錄哪些成員被選中（適用於平分與部分平分）
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  // 記錄自訂分攤金額輸入字串 (當總金額大於此加總時，自動作為基礎分攤比例)
  const [customAmounts, setCustomAmounts] = useState<{ [memberId: string]: string }>({});
  
  // 自訂項目明細輸入
  const [itemInputs, setItemInputs] = useState<{ id: string; name: string; amountStr: string; memberIds: string[] }[]>([]);

  // 收據上傳相關狀態 (支援最多 2 張)
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [localPreviewUrls, setLocalPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // 載入編輯資料或初始化
  useEffect(() => {
    if (expenseToEdit) {
      // 取得目前有效的成員 ID 集合（用於過濾殘留的舊 temp ID）
      const validMemberIds = new Set(members.map((m) => m.id));

      setTitle(expenseToEdit.title);
      setReceiptUrls(expenseToEdit.receiptUrls || (expenseToEdit.receiptUrl ? [expenseToEdit.receiptUrl] : []));
      setReceiptFiles([]);
      setLocalPreviewUrls([]);
      setAmountStr(expenseToEdit.amount.toString());
      // 若付款人 ID 已失效（舊 temp ID），自動 fallback 到第一位成員
      setPaidById(validMemberIds.has(expenseToEdit.paidById) ? expenseToEdit.paidById : (members[0]?.id || ''));
      setCurrency(expenseToEdit.currency);
      setDate(expenseToEdit.date);
      setSplitType(expenseToEdit.splitType);

      const selIds: string[] = [];
      const custAmts: { [memberId: string]: string } = {};

      expenseToEdit.splits.forEach((s) => {
        // 過濾掉已不存在於成員清單的舊 temp ID
        if (!validMemberIds.has(s.memberId)) return;
        if (s.amount > 0) {
          selIds.push(s.memberId);
        }
        custAmts[s.memberId] = s.baseAmount !== undefined && s.baseAmount > 0
          ? s.baseAmount.toString()
          : (s.amount ? s.amount.toString() : '');
      });

      setSelectedMemberIds(selIds);
      setCustomAmounts(custAmts);

      if (expenseToEdit.splitType === 'itemized') {
        setItemInputs((expenseToEdit.items || []).map(item => ({
          id: item.id,
          name: item.name,
          amountStr: item.amount.toString(),
          // 過濾掉品項中已失效的 temp ID
          memberIds: item.memberIds.filter((mid) => validMemberIds.has(mid))
        })));
      } else {
        setItemInputs([]);
      }
    } else {
      // 新增模式
      setTitle('');
      setReceiptUrls([]);
      setReceiptFiles([]);
      setLocalPreviewUrls([]);
      setAmountStr('');
      setPaidById(members[0]?.id || '');
      setCurrency(defaultCurrency);
      setDate(new Date().toISOString().substring(0, 10));
      setSplitType('equal');
      setSelectedMemberIds(members.map((m) => m.id));
      
      const initialMap: { [memberId: string]: string } = {};
      members.forEach((m) => {
        initialMap[m.id] = '';
      });
      setCustomAmounts({ ...initialMap });

      setItemInputs([{
        id: Math.random().toString(36).substring(2, 9),
        name: '',
        amountStr: '',
        memberIds: []
      }]);
    }
  }, [expenseToEdit, isOpen, members, defaultCurrency]);

  if (!isOpen) return null;

  // 1. 計算自訂金額的加總 (適用於 custom 模式)
  const customAmountsSum = members.reduce((acc, m) => acc + (parseFloat(customAmounts[m.id]) || 0), 0);

  // 2. 計算自訂明細的加總 (適用於 itemized 模式)
  const itemizedTotal = itemInputs.reduce((sum, item) => sum + (parseFloat(item.amountStr) || 0), 0);

  // 3. 基礎分攤的加總金額
  const baseAmountsSum = splitType === 'itemized' 
    ? itemizedTotal 
    : (splitType === 'custom' ? customAmountsSum : 0);

  // 4. 計算最終採用的交易總金額
  // 在自訂與明細模式下，如果使用者把總額欄位留空，則自動同步為基礎分攤的合計
  const totalAmount = ((splitType === 'custom' || splitType === 'itemized') && amountStr === '')
    ? baseAmountsSum
    : (parseFloat(amountStr) || 0);

  // 5. 計算自訂明細下每位成員分得的「基礎消費金額」
  const memberBaseShares: { [memberId: string]: number } = {};
  members.forEach(m => {
    memberBaseShares[m.id] = 0;
  });

  if (splitType === 'itemized') {
    itemInputs.forEach(item => {
      const amt = parseFloat(item.amountStr) || 0;
      const count = item.memberIds.length;
      if (amt <= 0 || count === 0) return;
      const avg = round(amt / count);
      item.memberIds.forEach((mId, idx) => {
        const isLast = idx === count - 1;
        const share = isLast ? round(amt - avg * (count - 1)) : avg;
        memberBaseShares[mId] = round(memberBaseShares[mId] + share);
      });
    });
  }

  // 是否自動判定為小費分攤模式：當總金額大於基礎加總，且基礎加總大於 0
  const isAutoTipMode = currency === 'USD' && (splitType === 'custom' || splitType === 'itemized') && totalAmount > baseAmountsSum && baseAmountsSum > 0;
  const calculatedTip = isAutoTipMode ? Math.max(0, totalAmount - baseAmountsSum) : 0;

  // 計算預覽分攤結果
  const getPreviewSplits = (): { memberId: string; name: string; amount: number; baseAmount?: number; tipAmount?: number }[] => {
    if (totalAmount <= 0) {
      return members.map((m) => ({ memberId: m.id, name: m.name, amount: 0 }));
    }

    // A. 如果是自訂或明細模式，且觸發自動小費分配
    if (isAutoTipMode) {
      const baseSplitsInput = splitType === 'itemized'
        ? members.map(m => ({ memberId: m.id, baseAmount: memberBaseShares[m.id] }))
        : members.map(m => ({ memberId: m.id, baseAmount: parseFloat(customAmounts[m.id]) || 0 }));

      const results = calculateTipSplits(totalAmount, baseSplitsInput);
      return results.map((r) => {
        const m = members.find((mem) => mem.id === r.memberId);
        return {
          memberId: r.memberId,
          name: m ? m.name : 'Unknown',
          amount: r.amount,
          baseAmount: r.baseAmount,
          tipAmount: r.tipAmount,
        };
      });
    }

    // B. 一般分攤模式 (無小費)
    if (splitType === 'equal') {
      const count = members.length;
      if (count === 0) return [];
      const avg = round(totalAmount / count);
      return members.map((m, idx) => {
        const isLast = idx === count - 1;
        const amt = isLast ? round(totalAmount - avg * (count - 1)) : avg;
        return { memberId: m.id, name: m.name, amount: amt };
      });
    } else if (splitType === 'selected_equal') {
      const count = selectedMemberIds.length;
      if (count === 0) return members.map((m) => ({ memberId: m.id, name: m.name, amount: 0 }));
      const avg = round(totalAmount / count);
      return members.map((m) => {
        const isSelected = selectedMemberIds.includes(m.id);
        if (!isSelected) return { memberId: m.id, name: m.name, amount: 0 };
        const selectedIdx = selectedMemberIds.indexOf(m.id);
        const isLastSelected = selectedIdx === count - 1;
        const amt = isLastSelected ? round(totalAmount - avg * (count - 1)) : avg;
        return { memberId: m.id, name: m.name, amount: amt };
      });
    } else if (splitType === 'custom') {
      // 無小費自訂
      return members.map((m) => {
        const amt = parseFloat(customAmounts[m.id]) || 0;
        return { memberId: m.id, name: m.name, amount: amt };
      });
    } else {
      // 'itemized' 無小費明細
      return members.map((m) => ({
        memberId: m.id,
        name: m.name,
        amount: memberBaseShares[m.id],
      }));
    }
  };

  const previewSplits = getPreviewSplits();

  // 檢查資料合法性
  const validateForm = (): { valid: boolean; errorMsg?: string } => {
    if (!title.trim()) return { valid: false, errorMsg: '項目名稱不可為空！' };
    if (totalAmount <= 0) return { valid: false, errorMsg: '總金額必須大於 0！' };
    if (!paidById) return { valid: false, errorMsg: '請選擇付款人！' };

    if (splitType === 'itemized') {
      if (itemInputs.length === 0) {
        return { valid: false, errorMsg: '明細分攤模式下，請至少新增一個子項目！' };
      }
      for (let i = 0; i < itemInputs.length; i++) {
        const it = itemInputs[i];
        if (!it.name.trim()) return { valid: false, errorMsg: `請填寫第 ${i + 1} 個項目的名稱！` };
        const val = parseFloat(it.amountStr) || 0;
        if (val <= 0) return { valid: false, errorMsg: `項目「${it.name}」的金額必須大於 0！` };
        if (it.memberIds.length === 0) return { valid: false, errorMsg: `項目「${it.name}」必須至少選擇一位成員平分！` };
      }

      if (currency !== 'USD') {
        if (Math.abs(totalAmount - itemizedTotal) >= 0.005) {
          return { valid: false, errorMsg: `總金額 (${totalAmount.toFixed(2)}) 必須與明細合計 (${itemizedTotal.toFixed(2)}) 完全一致！` };
        }
      } else {
        if (totalAmount < itemizedTotal) {
          return { valid: false, errorMsg: `總金額 (${totalAmount.toFixed(2)}) 不可小於明細合計 (${itemizedTotal.toFixed(2)})！` };
        }
      }
    } else if (splitType === 'custom') {
      if (currency !== 'USD') {
        if (Math.abs(totalAmount - customAmountsSum) >= 0.005) {
          return { valid: false, errorMsg: `總金額 (${totalAmount.toFixed(2)}) 必須與自訂分攤合計 (${customAmountsSum.toFixed(2)}) 完全一致！` };
        }
      } else {
        if (totalAmount < customAmountsSum) {
          return { valid: false, errorMsg: `總金額 (${totalAmount.toFixed(2)}) 不可小於自訂分攤合計 (${customAmountsSum.toFixed(2)})！` };
        }
      }
    } else if (splitType === 'selected_equal') {
      if (selectedMemberIds.length === 0) {
        return { valid: false, errorMsg: '請至少選擇一位成員參與分攤！' };
      }
    }

    return { valid: true };
  };

  const handleSave = async () => {
    const { valid } = validateForm();
    if (!valid) return;

    let uploadedUrls: string[] = [];
    if (receiptFiles.length > 0) {
      setUploading(true);
      try {
        for (const file of receiptFiles) {
          // 在前端等比例將收據照片最大邊長壓縮至 1200px (以完美保留發票上的細部文字，同時將檔案大小從 5MB+ 降至 150KB 內)
          const compressedBlob = await compressImage(file, 1200, 1200);
          const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.jpg`;
          const filePath = `${eventId}/${fileName}`;

          const { error } = await supabase.storage
            .from('receipts')
            .upload(filePath, compressedBlob, {
              contentType: 'image/jpeg'
            });

          if (error) throw error;

          // 取得公開 URL
          const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);
          
          uploadedUrls.push(urlData.publicUrl);
        }
      } catch (err: any) {
        console.error('Failed to upload receipt:', err);
        alert('上傳收據失敗，請重試！');
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    const finalReceiptUrls = [...receiptUrls, ...uploadedUrls];

    // 彙整最終的 splits
    const finalSplits: ExpenseSplit[] = previewSplits.map((p) => {
      const split: ExpenseSplit = {
        memberId: p.memberId,
        amount: p.amount,
      };
      // 如果有小費差額，我們在 splits 中記下 baseAmount 與 tipAmount 便於日後還原與明細展示
      if (p.baseAmount !== undefined && p.tipAmount !== undefined) {
        split.baseAmount = p.baseAmount;
        split.tipAmount = p.tipAmount;
      }
      return split;
    });

    onSave({
      title: title.trim(),
      amount: totalAmount,
      paidById,
      currency,
      date,
      splitType,
      splits: finalSplits,
      receiptUrl: finalReceiptUrls[0] || '',
      receiptUrls: finalReceiptUrls,
      ...(splitType === 'itemized'
        ? {
            items: itemInputs.map((it) => ({
              id: it.id,
              name: it.name.trim(),
              amount: parseFloat(it.amountStr) || 0,
              memberIds: it.memberIds,
            })),
          }
        : {}),
      ...(expenseToEdit ? { id: expenseToEdit.id } : {}),
    });
    onClose();
  };

  const toggleMemberSelection = (id: string) => {
    if (selectedMemberIds.includes(id)) {
      setSelectedMemberIds(selectedMemberIds.filter((mid) => mid !== id));
    } else {
      setSelectedMemberIds([...selectedMemberIds, id]);
    }
  };

  const handleCustomAmountChange = (id: string, val: string) => {
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      setCustomAmounts({
        ...customAmounts,
        [id]: val,
      });
    }
  };

  const formStatus = validateForm();

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-content animate-scale-up" style={{ maxHeight: '95vh' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '18px' }}>
            {expenseToEdit ? '編輯帳目' : '新增帳目'}
          </h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* 基本輸入欄位 */}
          <div className="form-group">
            <label className="form-label">項目名稱 *</label>
            <input
              type="text"
              className="input-field"
              placeholder="例如：週末聚餐、民宿費用"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }} className="form-group">
            <div>
              <label className="form-label">
                {splitType === 'custom' || splitType === 'itemized'
                  ? (isAutoTipMode 
                      ? `總金額 (已分配小費差額 ${calculatedTip.toFixed(2)}) *` 
                      : '總金額 (留空自動採用加總) *')
                  : '總金額 *'
                }
              </label>
              <input
                type="number"
                className="input-field"
                placeholder={(splitType === 'custom' || splitType === 'itemized') ? baseAmountsSum.toFixed(2) : "0.00"}
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">幣別</label>
              <select
                className="input-field select-field"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {supportedCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c} {getCurrencySymbol(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="form-group">
            <div>
              <label className="form-label">付款人 *</label>
              <select
                className="input-field select-field"
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
              >
                <option value="" disabled>選擇付款人</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">交易日期</label>
              <input
                type="date"
                className="input-field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* 收據上傳欄位 */}
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">發票 / 收據憑證 (選填，最多 2 張)</label>
            <div 
              style={{ 
                border: '1px dashed var(--border-color)', 
                borderRadius: '8px', 
                padding: '16px', 
                textAlign: 'center', 
                background: 'rgba(255,255,255,0.02)',
                position: 'relative'
              }}
            >
              {/* 已選取 / 已上傳的縮圖預覽列表 */}
              {(receiptUrls.length > 0 || localPreviewUrls.length > 0) && (
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: (receiptUrls.length + localPreviewUrls.length < 2) ? '16px' : '0' }}>
                  {/* 已儲存在雲端的收據 */}
                  {receiptUrls.map((url, index) => (
                    <div key={`cloud-${index}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <img 
                        src={url} 
                        alt="雲端收據" 
                        style={{ maxHeight: '100px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} 
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => setReceiptUrls(receiptUrls.filter((_, i) => i !== index))}
                        style={{ padding: '2px 8px', fontSize: '10px', height: '22px', color: 'var(--color-danger)' }}
                      >
                        移除
                      </button>
                    </div>
                  ))}

                  {/* 本機新選取的收據 */}
                  {localPreviewUrls.map((previewUrl, index) => (
                    <div key={`local-${index}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <img 
                        src={previewUrl} 
                        alt="本機選取收據" 
                        style={{ maxHeight: '100px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} 
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => {
                          setReceiptFiles(receiptFiles.filter((_, i) => i !== index));
                          setLocalPreviewUrls(localPreviewUrls.filter((_, i) => i !== index));
                        }}
                        style={{ padding: '2px 8px', fontSize: '10px', height: '22px', color: 'var(--color-danger)' }}
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 圖片選取按鈕 (未達上限 2 張時顯示) */}
              {(receiptUrls.length + localPreviewUrls.length < 2) ? (
                <label 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    gap: '6px', 
                    cursor: 'pointer',
                    padding: '12px 0',
                    color: 'var(--text-secondary)',
                    fontSize: '13px'
                  }}
                >
                  <Upload size={20} style={{ color: 'var(--color-primary-light)' }} />
                  <span>
                    {receiptUrls.length + localPreviewUrls.length === 1 
                      ? "點擊上傳第 2 張收據" 
                      : "點擊上傳收據相片 (可選多張，最多 2 張)"}
                  </span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const currentTotal = receiptUrls.length + receiptFiles.length;
                      const allowed = 2 - currentTotal;
                      if (allowed <= 0 || files.length === 0) return;

                      const filesToUpload = files.slice(0, allowed);
                      setReceiptFiles((prev) => [...prev, ...filesToUpload]);

                      const newPreviews = filesToUpload.map(f => URL.createObjectURL(f));
                      setLocalPreviewUrls((prev) => [...prev, ...newPreviews]);
                    }} 
                    style={{ display: 'none' }} 
                  />
                </label>
              ) : null}
            </div>
          </div>

          <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />

          {/* 分攤方式選擇 */}
          <div className="form-group">
            <label className="form-label">分攤方式</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <button
                type="button"
                className={`tab-btn ${splitType === 'equal' ? 'active' : ''}`}
                onClick={() => setSplitType('equal')}
                style={{ fontSize: '13px', padding: '6px' }}
              >
                全員平分
              </button>
              <button
                type="button"
                className={`tab-btn ${splitType === 'selected_equal' ? 'active' : ''}`}
                onClick={() => {
                  setSplitType('selected_equal');
                  if (selectedMemberIds.length === 0) setSelectedMemberIds(members.map(m => m.id));
                }}
                style={{ fontSize: '13px', padding: '6px' }}
              >
                部分平分
              </button>
              <button
                type="button"
                className={`tab-btn ${splitType === 'custom' ? 'active' : ''}`}
                onClick={() => setSplitType('custom')}
                style={{ fontSize: '13px', padding: '6px' }}
              >
                個別自訂
              </button>
              <button
                type="button"
                className={`tab-btn ${splitType === 'itemized' ? 'active' : ''}`}
                onClick={() => {
                  setSplitType('itemized');
                  if (itemInputs.length === 0) {
                    setItemInputs([{
                      id: Math.random().toString(36).substring(2, 9),
                      name: '',
                      amountStr: '',
                      memberIds: []
                    }]);
                  }
                }}
                style={{ fontSize: '13px', padding: '6px' }}
              >
                明細分攤
              </button>
            </div>
          </div>

          {/* 1. 自訂項目明細編輯區域 */}
          {splitType === 'itemized' && (
            <div className="form-group animate-fade-in" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>項目明細編輯器</h4>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setItemInputs([...itemInputs, { id: Math.random().toString(36).substring(2, 9), name: '', amountStr: '', memberIds: [] }])}
                  style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={12} /> 新增明細
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {itemInputs.map((item, idx) => (
                  <div key={item.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="明細名稱 (如：牛排、可樂)"
                        value={item.name}
                        onChange={(e) => {
                          const updated = [...itemInputs];
                          updated[idx].name = e.target.value;
                          setItemInputs(updated);
                        }}
                        style={{ flex: 2, padding: '6px 10px', fontSize: '13px' }}
                      />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="金額"
                        value={item.amountStr}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            const updated = [...itemInputs];
                            updated[idx].amountStr = val;
                            setItemInputs(updated);
                          }
                        }}
                        style={{ flex: 1, padding: '6px 10px', fontSize: '13px', textAlign: 'right' }}
                      />
                      {itemInputs.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-icon"
                          onClick={() => setItemInputs(itemInputs.filter(it => it.id !== item.id))}
                          style={{ width: '32px', height: '32px', flexShrink: 0 }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>分攤成員:</span>
                      {members.map(m => {
                        const isChecked = item.memberIds.includes(m.id);
                        return (
                          <label key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer', background: isChecked ? 'rgba(99,102,241,0.1)' : 'transparent', padding: '1px 5px', borderRadius: '4px', border: '1px solid', borderColor: isChecked ? 'rgba(99,102,241,0.2)' : 'transparent' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = [...itemInputs];
                                if (isChecked) {
                                  updated[idx].memberIds = item.memberIds.filter(mid => mid !== m.id);
                                } else {
                                  updated[idx].memberIds = [...item.memberIds, m.id];
                                }
                                setItemInputs(updated);
                              }}
                              style={{ cursor: 'pointer', width: '11px', height: '11px', accentColor: 'var(--color-primary)' }}
                            />
                            <span>{m.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. 成員最終分攤預覽列表 */}
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
              {splitType === 'itemized' 
                ? '明細分攤與小費分配預覽' 
                : (splitType === 'custom' ? '自訂分攤與小費分配預覽' : '分攤成員與金額')}
            </h4>
            
            {members.map((m) => {
              const isSelected = selectedMemberIds.includes(m.id);
              const preview = previewSplits.find((p) => p.memberId === m.id);
              const formattedPreview = preview ? preview.amount.toFixed(2) : '0.00';

              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  
                  {/* 成員選擇按鈕 (適用於部分平分) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {splitType === 'selected_equal' ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMemberSelection(m.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                      />
                    ) : null}
                    <span style={{ fontSize: '15px', color: (splitType === 'selected_equal' && !isSelected) ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {m.name}
                    </span>
                  </div>

                  {/* 輸入框或唯讀金額預覽 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {splitType === 'itemized' && isAutoTipMode ? (
                      // 明細小費自動分攤預覽
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>底:</span>
                          <span style={{ fontSize: '13px', fontWeight: '500' }}>
                            {getCurrencySymbol(currency)}{memberBaseShares[m.id].toFixed(2)}
                          </span>
                        </div>
                        {preview && preview.tipAmount !== undefined && preview.tipAmount > 0 && (
                          <span style={{ fontSize: '11px', color: 'var(--color-secondary-light)' }}>
                            +費: {preview.tipAmount.toFixed(2)}
                          </span>
                        )}
                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                          共: {getCurrencySymbol(currency)}{formattedPreview}
                        </span>
                      </div>
                    ) : splitType === 'custom' ? (
                      // 自訂模式：輸入分攤金額與小費預覽
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{getCurrencySymbol(currency)}</span>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="0.00"
                            value={customAmounts[m.id] || ''}
                            onChange={(e) => handleCustomAmountChange(m.id, e.target.value)}
                            style={{ width: '90px', padding: '6px 10px', fontSize: '14px', textAlign: 'right' }}
                          />
                        </div>
                        {isAutoTipMode && preview && preview.tipAmount !== undefined && preview.tipAmount > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--color-secondary-light)', textAlign: 'right' }}>
                            +小費: {getCurrencySymbol(currency)}{preview.tipAmount.toFixed(2)} (共 {getCurrencySymbol(currency)}{formattedPreview})
                          </div>
                        )}
                      </div>
                    ) : splitType === 'itemized' ? (
                      // 明細分攤唯讀預覽 (無小費時)
                      <span style={{ fontSize: '15px', fontWeight: 'bold' }}>
                        {getCurrencySymbol(currency)}{memberBaseShares[m.id].toFixed(2)}
                      </span>
                    ) : (
                      // 平分/部分平分模式：唯讀顯示
                      <span style={{ fontSize: '15px', fontWeight: '500', color: (splitType === 'selected_equal' && !isSelected) ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {getCurrencySymbol(currency)}{formattedPreview}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 小費分配統計欄位 */}
            {isAutoTipMode && totalAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px' }}>
                <span>基礎總計: {baseAmountsSum.toFixed(2)}</span>
                <span style={{ color: 'var(--color-secondary-light)' }}>計算小費: {calculatedTip.toFixed(2)}</span>
                <span>總帳單: {totalAmount.toFixed(2)}</span>
              </div>
            )}

            {/* 明細或自訂加總統計 (無小費時) */}
            {!isAutoTipMode && (splitType === 'custom' || splitType === 'itemized') && totalAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px' }}>
                <span>分配合計: {baseAmountsSum.toFixed(2)}</span>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: Math.abs(totalAmount - baseAmountsSum) < 0.005 ? 'var(--color-secondary-light)' : 'var(--color-danger)' 
                }}>
                  {Math.abs(totalAmount - baseAmountsSum) < 0.005 ? '已完全平衡 ✓' : `尚差: ${(totalAmount - baseAmountsSum).toFixed(2)}`}
                </span>
                <span>總帳單: {totalAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* 錯誤/警告提示 */}
          {!formStatus.valid && formStatus.errorMsg && (
            <div className="alert-banner alert-banner-warning" style={{ marginTop: '16px', fontSize: '13px' }}>
              <span>{formStatus.errorMsg}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
            取消
          </button>
          <button
            className={`btn btn-primary ${(!formStatus.valid || uploading) ? 'btn-disabled' : ''}`}
            onClick={handleSave}
            style={{ flex: 2 }}
            disabled={!formStatus.valid || uploading}
          >
            {uploading ? '上傳收據中...' : '儲存項目'}
          </button>
        </div>
      </div>
    </div>
  );
};
