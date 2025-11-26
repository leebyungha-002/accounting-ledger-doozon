/**
 * 시각화 분석 컴포넌트
 * Sankey 다이어그램과 계정간 거래빈도 히트맵을 제공
 */

import React, { useMemo } from 'react';
import { JournalEntry } from '@/types/analysis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp } from 'lucide-react';
import { SankeyDiagram } from './SankeyDiagram';
import { AccountHeatmap } from './AccountHeatmap';

interface VisualizationAnalysisProps {
  entries: JournalEntry[];
}

export const VisualizationAnalysis: React.FC<VisualizationAnalysisProps> = ({ entries }) => {
  // 계정간 거래 관계 추출 (전체 분개장 대상)
  // 같은 전표 내에서 차변-대변 관계를 찾되, 전체 분개장에서 집계
  const accountRelations = useMemo(() => {
    // source -> target -> { count: 거래건수, amount: 총금액 }
    const relationMap = new Map<string, Map<string, { count: number; amount: number }>>();
    
    // 전표번호별로 그룹핑 (같은 전표 내 관계 찾기)
    const entryGroups = new Map<string, JournalEntry[]>();
    entries.forEach(entry => {
      // 전표번호를 우선 사용
      let entryNum: string;
      if (entry.entryNumber) {
        entryNum = String(entry.entryNumber);
      } else if (entry.date) {
        // 전표번호가 없으면 날짜로 그룹핑 (같은 날짜의 항목들을 하나의 그룹으로)
        entryNum = String(entry.date);
      } else {
        // 전표번호도 날짜도 없으면 각 항목을 독립 그룹으로 처리
        entryNum = `unknown_${entry.id || Date.now()}_${Math.random()}`;
      }
      
      if (!entryGroups.has(entryNum)) {
        entryGroups.set(entryNum, []);
      }
      entryGroups.get(entryNum)!.push(entry);
    });
    
    // 디버깅: 그룹핑 결과 확인
    const groupSizes = Array.from(entryGroups.values()).map(g => g.length);
    console.log('전표 그룹 수:', entryGroups.size);
    console.log('그룹 크기 통계:', {
      min: Math.min(...groupSizes),
      max: Math.max(...groupSizes),
      avg: groupSizes.reduce((a, b) => a + b, 0) / groupSizes.length
    });

    // 전체 분개장에서 각 전표 내 차변-대변 관계를 집계
    entryGroups.forEach((group) => {
      const debitEntries = group.filter(e => e.debit > 0 && e.accountName);
      const creditEntries = group.filter(e => e.credit > 0 && e.accountName);

      // 같은 전표 내에서 차변-대변 관계 추출
      // 전체 분개장에서 집계하기 위해 각 관계를 카운트하고 금액 합산
      debitEntries.forEach(debitEntry => {
        creditEntries.forEach(creditEntry => {
          if (debitEntry.accountName !== creditEntry.accountName) {
            const source = debitEntry.accountName;
            const target = creditEntry.accountName;
            
            // 같은 전표 내에서 차변과 대변의 실제 관계
            // 간단하게 각 차변 항목과 대변 항목의 금액 중 작은 값을 사용
            // 같은 전표 내에서는 차변 합계 = 대변 합계이므로,
            // 각 항목의 금액 중 작은 값을 해당 관계의 자금 흐름량으로 설정
            const flowAmount = Math.min(debitEntry.debit, creditEntry.credit);
            
            if (flowAmount > 0) {
              if (!relationMap.has(source)) {
                relationMap.set(source, new Map());
              }
              const targetMap = relationMap.get(source)!;
              const existing = targetMap.get(target) || { count: 0, amount: 0 };
              
              // 전체 분개장에서 집계 (금액 합산)
              targetMap.set(target, {
                count: existing.count + 1,
                amount: existing.amount + flowAmount
              });
            }
          }
        });
      });
    });
    
    // 디버깅: 관계 맵 로그 출력
    const relationSummary: { source: string; target: string; count: number; amount: number }[] = [];
    relationMap.forEach((targetMap, source) => {
      targetMap.forEach((relation, target) => {
        relationSummary.push({ source, target, count: relation.count, amount: relation.amount });
      });
    });
    relationSummary.sort((a, b) => b.amount - a.amount);
    console.log('계정 관계 추출 결과 (상위 10개):', relationSummary.slice(0, 10));
    
    // 특정 계정 확인
    const commonAccounts = ['보통예금', '외상매출금', '외상매입금', '임차보증금', '상품매출'];
    commonAccounts.forEach(account => {
      const relations = Array.from(relationMap.entries()).filter(([source]) => 
        source.includes(account) || Array.from(relationMap.get(source)?.keys() || []).some(t => t.includes(account))
      );
      if (relations.length > 0) {
        console.log(`${account} 관련 관계:`, relations.slice(0, 3));
      }
    });

    return relationMap;
  }, [entries]);

  // Sankey 데이터 준비
  const sankeyData = useMemo(() => {
    const nodes: string[] = [];
    const nodeMap = new Map<string, number>();
    const links: { source: number; target: number; value: number }[] = [];

    // 모든 계정 수집
    accountRelations.forEach((targetMap, source) => {
      if (!nodeMap.has(source)) {
        nodeMap.set(source, nodes.length);
        nodes.push(source);
      }
      targetMap.forEach((relation, target) => {
        if (!nodeMap.has(target)) {
          nodeMap.set(target, nodes.length);
          nodes.push(target);
        }
      });
    });

    // 링크 생성 (상위 30개만 표시)
    // 금액 합계 기준으로 정렬 (실제 자금 흐름 규모를 반영)
    const linkArray: { source: string; target: string; value: number; count: number; amount: number }[] = [];
    accountRelations.forEach((targetMap, source) => {
      targetMap.forEach((relation, target) => {
        linkArray.push({ 
          source, 
          target, 
          value: relation.amount, // 금액을 value로 사용
          count: relation.count,
          amount: relation.amount
        });
      });
    });
    
    // 디버깅: 상위 링크 로그 출력
    console.log('Sankey 링크 (상위 10개):', linkArray.slice(0, 10));

    // 금액 기준으로 정렬하여 상위 링크만 선택
    linkArray.sort((a, b) => b.value - a.value);
    const topLinks = linkArray.slice(0, 30); // 상위 30개

    // Sankey 링크 생성
    topLinks.forEach(link => {
      const sourceIdx = nodeMap.get(link.source);
      const targetIdx = nodeMap.get(link.target);
      if (sourceIdx !== undefined && targetIdx !== undefined) {
        links.push({
          source: sourceIdx,
          target: targetIdx,
          value: link.value
        });
      }
    });

    return { nodes, links };
  }, [accountRelations]);

  // 히트맵 데이터 준비
  const heatmapData = useMemo(() => {
    const allAccounts = new Set<string>();
    accountRelations.forEach((targetMap, source) => {
      allAccounts.add(source);
      targetMap.forEach((count, target) => {
        allAccounts.add(target);
      });
    });

    const accountArray = Array.from(allAccounts).sort();
    const matrix: { source: string; target: string; value: number }[] = [];

    accountArray.forEach(source => {
      accountArray.forEach(target => {
        const relation = accountRelations.get(source)?.get(target);
        if (relation && relation.amount > 0) {
          matrix.push({ source, target, value: relation.amount }); // 금액 기준
        }
      });
    });

    return { accounts: accountArray, matrix };
  }, [accountRelations]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-purple-500" />
            <CardTitle>시각화 분석</CardTitle>
          </div>
          <CardDescription>
            계정간 자금 흐름과 거래 빈도를 시각적으로 분석합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sankey" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sankey">
                <TrendingUp className="w-4 h-4 mr-2" />
                Sankey 다이어그램
              </TabsTrigger>
              <TabsTrigger value="heatmap">
                <BarChart3 className="w-4 h-4 mr-2" />
                거래빈도 히트맵
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sankey" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>자금 흐름 Sankey 다이어그램</CardTitle>
                  <CardDescription>
                    계정 간 자금 흐름을 시각화합니다 (상위 {Math.min(sankeyData.links.length, 30)}개 순 흐름, 양방향 거래는 순액으로 표시)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SankeyDiagram nodes={sankeyData.nodes} links={sankeyData.links} />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="heatmap" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>계정간 거래 빈도 히트맵</CardTitle>
                  <CardDescription>
                    각 계정 쌍 간의 거래 빈도를 색상 강도로 나타냅니다. 진한 색일수록 빈번한 거래를 의미합니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AccountHeatmap accounts={heatmapData.accounts} matrix={heatmapData.matrix} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

