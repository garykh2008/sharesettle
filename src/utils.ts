import type { Currency, SplitEvent } from './types';

// 四捨五入到小數點後兩位，避免浮點數誤差
export function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// 貨幣轉換 (支援舊單一匯率與新匯率字典模式)
export function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  exchangeRatesOrRate: number | { [key in Currency]?: number }
): number {
  if (from === to) return round(amount);

  // 如果第四個參數是數字，代表是舊版的 usdToTwdRate
  if (typeof exchangeRatesOrRate === 'number') {
    const usdToTwdRate = exchangeRatesOrRate;
    if (from === 'USD' && to === 'TWD') {
      return round(amount * usdToTwdRate);
    }
    if (from === 'TWD' && to === 'USD') {
      return round(amount / usdToTwdRate);
    }
    return round(amount);
  }

  // 新版：以結算貨幣做橋樑轉換
  // exchangeRates[C] 代表 1 單位 C 可以換多少單位的結算貨幣
  const rates = exchangeRatesOrRate || {};
  const fromRate = rates[from] || 1;
  const toRate = rates[to] || 1;
  
  if (toRate === 0) return 0;
  return round((amount * fromRate) / toRate);
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
  amount: number; // 以事件結算幣別計算
}

export function calculateSettlements(event: SplitEvent): SettlementTransaction[] {
  const { members, expenses, settlementCurrency, exchangeRates } = event;
  if (members.length <= 1) return [];

  // 相容舊版
  const baseCurrency = settlementCurrency || event.defaultCurrency || 'TWD';
  const rates = exchangeRates || {
    USD: baseCurrency === 'TWD' ? (event.usdToTwdRate || 32.5) : 1,
    TWD: baseCurrency === 'USD' ? (1 / (event.usdToTwdRate || 32.5)) : 1,
    JPY: 1,
  };

  // 1. 初始化每位成員的收支平衡表 (Net Balance)
  const balances: { [memberId: string]: number } = {};
  members.forEach((m) => {
    balances[m.id] = 0;
  });

  // 2. 統計每筆消費
  expenses.forEach((exp) => {
    const expCurrency = exp.currency;
    const paidBy = exp.paidById;

    // 將整筆消費金額換算為事件結算貨幣
    const totalAmountInBase = convertCurrency(exp.amount, expCurrency, baseCurrency, rates);

    // 付款人增加餘額
    if (balances[paidBy] !== undefined) {
      balances[paidBy] += totalAmountInBase;
    }

    // 分攤人減少餘額
    exp.splits.forEach((split) => {
      const splitAmountInBase = convertCurrency(split.amount, expCurrency, baseCurrency, rates);
      if (balances[split.memberId] !== undefined) {
        balances[split.memberId] -= splitAmountInBase;
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

export function getCurrencySymbol(c: Currency): string {
  if (c === 'USD') return 'US$';
  if (c === 'JPY') return '¥';
  return 'NT$';
}
