import type { SplitEvent } from './types';

// 四捨五入到小數點後兩位，避免浮點數誤差
export function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// 貨幣轉換
export function convertCurrency(
  amount: number,
  from: 'USD' | 'TWD',
  to: 'USD' | 'TWD',
  usdToTwdRate: number
): number {
  if (from === to) return round(amount);
  if (from === 'USD' && to === 'TWD') {
    return round(amount * usdToTwdRate);
  }
  // TWD to USD
  return round(amount / usdToTwdRate);
}

// 計算包含比例小費的帳單分攤
export interface BaseSplitInput {
  memberId: string;
  baseAmount: number;
}

export interface CalculatedSplitResult {
  memberId: string;
  baseAmount: number;
  tipAmount: number;
  amount: number; // 最終分攤金額 (base + tip)
}

export function calculateTipSplits(
  totalAmount: number, // 包含小費的總金額
  baseSplits: BaseSplitInput[]
): CalculatedSplitResult[] {
  const sumBase = baseSplits.reduce((acc, curr) => acc + curr.baseAmount, 0);
  const totalTip = Math.max(0, totalAmount - sumBase);

  // 如果總基礎金額為 0，且有總金額，則平均分配
  if (sumBase === 0) {
    if (baseSplits.length === 0) return [];
    const avg = round(totalAmount / baseSplits.length);
    const results = baseSplits.map((item, idx) => {
      const isLast = idx === baseSplits.length - 1;
      const amt = isLast ? round(totalAmount - avg * (baseSplits.length - 1)) : avg;
      return {
        memberId: item.memberId,
        baseAmount: 0,
        tipAmount: amt,
        amount: amt,
      };
    });
    return results;
  }

  // 按比例計算小費與最終金額
  let calculatedSplits = baseSplits.map((item) => {
    const ratio = item.baseAmount / sumBase;
    const tipAmount = round(totalTip * ratio);
    const amount = round(item.baseAmount + tipAmount);
    return {
      memberId: item.memberId,
      baseAmount: item.baseAmount,
      tipAmount,
      amount,
    };
  });

  // 檢查四捨五入後，所有人的最終金額加總是否等於 totalAmount
  const currentTotal = calculatedSplits.reduce((acc, curr) => acc + curr.amount, 0);
  const diff = round(totalAmount - currentTotal);

  if (diff !== 0 && calculatedSplits.length > 0) {
    // 將微小的差額補在分攤金額最大的人身上，若金額相同則補在第一個成員
    let maxIdx = 0;
    let maxAmt = -1;
    for (let i = 0; i < calculatedSplits.length; i++) {
      if (calculatedSplits[i].amount > maxAmt) {
        maxAmt = calculatedSplits[i].amount;
        maxIdx = i;
      }
    }
    calculatedSplits[maxIdx].amount = round(calculatedSplits[maxIdx].amount + diff);
    calculatedSplits[maxIdx].tipAmount = round(calculatedSplits[maxIdx].tipAmount + diff);
  }

  return calculatedSplits;
}

// 結算建議 (極小化轉帳次數演算法)
export interface SettlementTransaction {
  fromId: string;
  toId: string;
  amount: number; // 以事件預設幣別計算
}

export function calculateSettlements(event: SplitEvent): SettlementTransaction[] {
  const { members, expenses, defaultCurrency, usdToTwdRate } = event;
  if (members.length <= 1) return [];

  // 1. 初始化每位成員的收支平衡表 (Net Balance)
  const balances: { [memberId: string]: number } = {};
  members.forEach((m) => {
    balances[m.id] = 0;
  });

  // 2. 統計每筆消費
  expenses.forEach((exp) => {
    const expCurrency = exp.currency;
    const paidBy = exp.paidById;

    // 將整筆消費金額換算為事件預設幣別
    const totalAmountInDefault = convertCurrency(exp.amount, expCurrency, defaultCurrency, usdToTwdRate);

    // 付款人增加餘額
    if (balances[paidBy] !== undefined) {
      balances[paidBy] += totalAmountInDefault;
    }

    // 分攤人減少餘額
    exp.splits.forEach((split) => {
      const splitAmountInDefault = convertCurrency(split.amount, expCurrency, defaultCurrency, usdToTwdRate);
      if (balances[split.memberId] !== undefined) {
        balances[split.memberId] -= splitAmountInDefault;
      }
    });
  });

  // 四捨五入所有人的餘額
  const memberBalances = Object.keys(balances).map((id) => ({
    id,
    net: round(balances[id]),
  }));

  // 分類成債務人 (應付錢) 與債權人 (應收錢)
  // 容許值 0.01 元以內不計
  const debtors = memberBalances
    .filter((b) => b.net < -0.005)
    .sort((a, b) => a.net - b.net); // 負最多（欠最多）的在前面

  const creditors = memberBalances
    .filter((b) => b.net > 0.005)
    .sort((a, b) => b.net - a.net); // 正最多（收最多）的在前面

  const transactions: SettlementTransaction[] = [];

  let dIdx = 0;
  let cIdx = 0;

  // 雙指針貪婪匹配，最優化結算次數
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const oweAmount = -debtor.net;
    const getAmount = creditor.net;

    const settleAmount = round(Math.min(oweAmount, getAmount));

    if (settleAmount > 0) {
      transactions.push({
        fromId: debtor.id,
        toId: creditor.id,
        amount: settleAmount,
      });
    }

    debtor.net += settleAmount;
    creditor.net -= settleAmount;

    if (Math.abs(debtor.net) < 0.005) {
      dIdx++;
    }
    if (Math.abs(creditor.net) < 0.005) {
      cIdx++;
    }
  }

  return transactions;
}

// 壓縮與序列化 Event 用於 URL 分享
export function serializeEvent(event: SplitEvent): string {
  try {
    const jsonString = JSON.stringify(event);
    const encoded = btoa(encodeURIComponent(jsonString));
    return encoded;
  } catch (error) {
    console.error('Failed to serialize event:', error);
    return '';
  }
}

// 解序列化 Event
export function deserializeEvent(encoded: string): SplitEvent | null {
  try {
    const decoded = decodeURIComponent(atob(encoded));
    const event = JSON.parse(decoded) as SplitEvent;
    if (event && event.id && event.title && Array.isArray(event.members)) {
      return event;
    }
    return null;
  } catch (error) {
    console.error('Failed to deserialize event:', error);
    return null;
  }
}
