export interface PaymentMethod {
  type: 'cash' | 'transfer' | 'linepay';
  bankCode?: string;
  bankAccount?: string;
  lineId?: string;
}export interface Member {
  id: string;
  name: string;
  email: string;
  paymentMethods?: PaymentMethod[];
  status?: 'active' | 'pending';
  isTemporary?: boolean;
}
export type SplitType = 'equal' | 'selected_equal' | 'custom' | 'itemized';

export interface ExpenseItem {
  id: string;
  name: string;
  amount: number; // 該品項的單價金額
  memberIds: string[]; // 參與平分該品項的成員 ID
}

export interface ExpenseSplit {
  memberId: string;
  amount: number;      // 最終分攤金額 (包含小費)
  baseAmount?: number; // 基礎分攤金額 (不含小費，用於自訂比例)
  tipAmount?: number;  // 分配到的小費金額
}

export interface Expense {
  id: string;
  title: string;
  amount: number;       // 總金額 (包含小費)
  paidById: string;     // 付款人 Member ID
  currency: 'USD' | 'TWD';
  date: string;
  splitType: SplitType;
  splits: ExpenseSplit[];
  items?: ExpenseItem[]; // 交易明細清單 (適用於 itemized 模式)
}

export interface SettlementRecord {
  fromId: string;
  toId: string;
  amount: number; // 以事件 defaultCurrency 計
  paid: boolean;
}

export interface SplitEvent {
  id: string;
  title: string;
  description?: string;
  defaultCurrency: 'USD' | 'TWD';
  usdToTwdRate: number; // 匯率 (1 USD = X TWD)
  members: Member[];
  expenses: Expense[];
  createdAt: string;
  status?: 'active' | 'settled'; // 活動狀態
  settlements?: SettlementRecord[]; // 鎖定的結算付款條目
}

export interface UserSession {
  id?: string; // Supabase Auth UID
  email: string;
  name: string;
  paymentMethods?: PaymentMethod[];
}
