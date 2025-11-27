/**
 * 계정간 거래 빈도 히트맵 컴포넌트
 */

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface HeatmapData {
  source: string;
  target: string;
  value: number;
}

interface AccountHeatmapProps {
  accounts: string[];
  matrix: HeatmapData[];
}

export const AccountHeatmap: React.FC<AccountHeatmapProps> = ({ accounts, matrix }) => {
  // 매트릭스 맵 생성 (빠른 조회를 위해)
  const matrixMap = useMemo(() => {
    const map = new Map<string, number>();
    matrix.forEach(item => {
      const key = `${item.source}|${item.target}`;
      map.set(key, item.value);
    });
    return map;
  }, [matrix]);

  // 최대값 계산 (색상 강도 정규화용)
  const maxValue = useMemo(() => {
    return Math.max(...matrix.map(m => m.value), 1);
  }, [matrix]);

  // 색상 계산 (값이 높을수록 진한 색)
  const getColor = (value: number) => {
    if (value === 0) return 'bg-gray-50';
    const intensity = value / maxValue;
    if (intensity > 0.8) return 'bg-red-600';
    if (intensity > 0.6) return 'bg-red-500';
    if (intensity > 0.4) return 'bg-orange-500';
    if (intensity > 0.2) return 'bg-yellow-400';
    return 'bg-yellow-200';
  };

  // 표시할 계정 수 제한 (너무 많으면 UI가 복잡해짐)
  const displayAccounts = useMemo(() => {
    // 각 계정의 총 거래 빈도 계산
    const accountFreq = new Map<string, number>();
    accounts.forEach(account => {
      let total = 0;
      matrix.forEach(m => {
        if (m.source === account || m.target === account) {
          total += m.value;
        }
      });
      accountFreq.set(account, total);
    });

    // 상위 계정만 선택
    const sorted = Array.from(accountFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30) // 상위 30개만 표시
      .map(([account]) => account);

    return sorted;
  }, [accounts, matrix]);

  if (displayAccounts.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <p>표시할 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="text-sm text-muted-foreground mb-4">
        상위 {displayAccounts.length}개 계정간 거래 빈도 (색이 진할수록 빈번한 거래)
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border p-2 bg-gray-100 font-medium text-left sticky left-0 z-10 min-w-[150px]">
                  계정 (Source)
                </th>
                {displayAccounts.map(account => (
                  <th 
                    key={account} 
                    className="border p-2 bg-gray-100 font-medium text-center text-xs min-w-[120px]"
                    title={account}
                  >
                    <div className="truncate max-w-[120px]" title={account}>
                      {account.length > 12 ? `${account.substring(0, 12)}...` : account}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayAccounts.map(source => (
                <tr key={source}>
                  <td 
                    className="border p-2 bg-gray-100 font-medium sticky left-0 z-10 min-w-[150px]"
                    title={source}
                  >
                    <div className="truncate max-w-[150px]" title={source}>
                      {source.length > 15 ? `${source.substring(0, 15)}...` : source}
                    </div>
                  </td>
                  {displayAccounts.map(target => {
                    const key = `${source}|${target}`;
                    const value = matrixMap.get(key) || 0;
                    return (
                      <td
                        key={target}
                        className={`border p-2 text-center text-xs cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all ${getColor(value)}`}
                        title={`${source} → ${target}: ${value}건`}
                      >
                        {value > 0 ? (
                          <div>
                            <div className="font-bold text-gray-900">{value}</div>
                          </div>
                        ) : (
                          <div className="text-gray-400">-</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-50 border"></div>
          <span>0건</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-200"></div>
          <span>낮음</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-400"></div>
          <span>보통</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500"></div>
          <span>높음</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500"></div>
          <span>매우 높음</span>
        </div>
      </div>
    </div>
  );
};













