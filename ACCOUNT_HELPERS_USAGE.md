# accountHelpers.ts 사용 가이드

## ✅ 통합 완료

Google AI Studio의 헬퍼 함수들이 `src/lib/accountHelpers.ts`에 통합되었습니다.

---

## 📦 사용 가능한 함수들

### 1. 계정 분류 함수들

```typescript
import { isSGAAccount, isSalesAccount, isManufacturingAccount, isLogisticsAccount } from '@/lib/accountHelpers';

// 판관비 계정 확인
if (isSGAAccount('급여(판)')) {
  // 판관비 계정
}

// 매출 계정 확인
if (isSalesAccount('매출액')) {
  // 매출 계정
}

// 제조원가 계정 확인
if (isManufacturingAccount('원재료(제)')) {
  // 제조원가 계정
}
```

### 2. 월별 집계 함수들

```typescript
import { 
  getSGAMonthlySummary, 
  getManufacturingMonthlySummary,
  getSalesVsSgaMonthlySummary 
} from '@/lib/accountHelpers';

// 판관비 월별 집계
const sgaSummary = getSGAMonthlySummary(transactions);
console.log(sgaSummary.summaryTable); // 마크다운 테이블
console.log(sgaSummary.rawData); // 원본 데이터

// 매출 vs 판관비 월별 비교
const salesVsSga = getSalesVsSgaMonthlySummary(transactions);
salesVsSga.forEach(data => {
  console.log(`${data.month}: 매출 ${data.sales}, 판관비 ${data.sga}, 비율 ${data.ratio}%`);
});
```

### 3. 벤포드 법칙 계산

```typescript
import { calculateBenfordStats } from '@/lib/accountHelpers';

const benfordResult = calculateBenfordStats(transactions);
if (typeof benfordResult === 'object') {
  console.log(`총 표본: ${benfordResult.total}건`);
  console.log(benfordResult.statsTable); // 통계 테이블
  console.log(`의심 숫자: ${benfordResult.suspectDigit}, 편차: ${benfordResult.maxDiff}%`);
}
```

### 4. 샘플링 함수들

```typescript
import { calculateSampleSize, getSampledTransactions } from '@/lib/accountHelpers';

// 샘플 크기 계산
const sampleSize = calculateSampleSize(10000); // 5% = 500개

// 하이브리드 샘플링 (중요거래 + 체계적)
const sampled = getSampledTransactions(transactions);
console.log(sampled.sampleInfo); // 샘플링 정보
console.log(sampled.csv); // CSV 형식 데이터
console.log(sampled.samples); // 샘플 거래 배열
```

### 5. 타입 변환 함수

```typescript
import { convertLedgerRowToTransaction, Transaction } from '@/lib/accountHelpers';

// 기존 LedgerRow를 Transaction으로 변환
const transaction = convertLedgerRowToTransaction(
  row,
  accountName,
  dateHeader,
  debitHeader,
  creditHeader,
  descriptionHeader
);

if (transaction) {
  // Transaction 타입으로 사용 가능
  const isSGA = isSGAAccount(transaction.accountName);
}
```

---

## 🔄 기존 컴포넌트에서 사용하기

### 예시 1: MonthlyTrendAnalysis.tsx에서 활용

```typescript
import { 
  isSGAAccount, 
  isSalesAccount, 
  isManufacturingAccount,
  convertLedgerRowToTransaction 
} from '@/lib/accountHelpers';

// 기존 계정 분류 로직을 헬퍼 함수로 대체
const categorizedAccounts = useMemo(() => {
  const sales: string[] = [];
  const expenses: string[] = [];
  const manufacturing: string[] = [];
  
  accountNames.forEach(name => {
    if (isSalesAccount(name)) {
      sales.push(name);
    } else if (isSGAAccount(name)) {
      expenses.push(name);
    } else if (isManufacturingAccount(name)) {
      manufacturing.push(name);
    }
  });
  
  return { sales, expenses, manufacturing };
}, [accountNames]);
```

### 예시 2: BenfordAnalysis.tsx에서 활용

```typescript
import { calculateBenfordStats, convertLedgerRowToTransaction } from '@/lib/accountHelpers';

// 거래 데이터를 Transaction 배열로 변환
const transactions: Transaction[] = rows
  .map(row => convertLedgerRowToTransaction(row, accountName, dateHeader, debitHeader, creditHeader))
  .filter((t): t is Transaction => t !== null);

// 벤포드 법칙 계산
const benfordResult = calculateBenfordStats(transactions);
```

### 예시 3: SamplingAnalysis.tsx에서 활용

```typescript
import { calculateSampleSize, getSampledTransactions } from '@/lib/accountHelpers';

// 샘플 크기 자동 계산
const targetSize = calculateSampleSize(accountData.length);

// 하이브리드 샘플링
const sampled = getSampledTransactions(transactions);
```

---

## 📝 타입 정의

### Transaction 인터페이스

```typescript
interface Transaction {
  accountName: string;
  date: string; // YYYY-MM-DD 형식
  debit: number;
  credit: number;
  description: string;
}
```

### AnalysisType

```typescript
type AnalysisType = 
  | 'general' 
  | 'expense' 
  | 'manufacturing' 
  | 'sales_vs_sga' 
  | 'audit_risk' 
  | 'benford' 
  | 'yoy';
```

---

## 🎯 다음 단계

이제 기존 컴포넌트에서 이 헬퍼 함수들을 활용할 수 있습니다:

1. ✅ **계정 분류 개선**: `MonthlyTrendAnalysis.tsx`에서 헬퍼 함수 사용
2. ✅ **벤포드 분석 개선**: `BenfordAnalysis.tsx`에서 계산 로직 활용
3. ✅ **샘플링 개선**: `SamplingAnalysis.tsx`에서 샘플링 로직 활용
4. ✅ **월별 집계 개선**: 월별 분석에 집계 함수 활용

---

## 💡 주의사항

1. **타입 변환**: 기존 `LedgerRow` 타입을 `Transaction`으로 변환할 때 `convertLedgerRowToTransaction` 함수 사용
2. **날짜 형식**: `Transaction.date`는 `YYYY-MM-DD` 형식의 문자열이어야 함
3. **null 체크**: `convertLedgerRowToTransaction`은 `null`을 반환할 수 있으므로 필터링 필요

---

## 🚀 사용 예시

더 자세한 사용 예시가 필요하시면 알려주세요. 특정 컴포넌트에 통합하는 것을 도와드릴 수 있습니다!




