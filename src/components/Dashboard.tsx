/**
 * Dashboard 컴포넌트
 * Google AI Studio에서 가져온 Dashboard.tsx를 현재 프로젝트에 맞게 변환
 * 차트와 통계를 보여주는 대시보드
 */

import React, { useMemo } from 'react';
import { JournalEntry, AnalysisSummary } from '@/types/analysis';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell 
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardProps {
  entries: JournalEntry[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// Helper to extract month from date
const getMonthFromDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date();
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Helper to format date string
const formatDateString = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date();
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

const Dashboard: React.FC<DashboardProps> = ({ entries }) => {
  
  const summary = useMemo<AnalysisSummary>(() => {
    const totalDebit = entries.reduce((acc, cur) => acc + cur.debit, 0);
    const totalCredit = entries.reduce((acc, cur) => acc + cur.credit, 0);
    
    // Monthly Trend - date에서 month 추출
    const monthMap = new Map<string, { debit: number; credit: number }>();
    entries.forEach(e => {
      const month = getMonthFromDate(e.date);
      if (!month) return;
      
      const current = monthMap.get(month) || { debit: 0, credit: 0 };
      monthMap.set(month, {
        debit: current.debit + e.debit,
        credit: current.credit + e.credit
      });
    });
    
    const monthlyTrend = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, val]) => ({ month, ...val }));

    // Top Expenses (Debit side only)
    const accountMap = new Map<string, number>();
    entries.filter(e => e.debit > 0).forEach(e => {
      accountMap.set(e.accountName, (accountMap.get(e.accountName) || 0) + e.debit);
    });
    
    const topExpenses = Array.from(accountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));

    // Date Range
    const dates = entries
      .map(e => {
        const d = typeof e.date === 'string' ? new Date(e.date) : e.date instanceof Date ? e.date : new Date();
        return isNaN(d.getTime()) ? null : d;
      })
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    
    const dateRange = {
      start: dates.length > 0 ? formatDateString(dates[0]) : '',
      end: dates.length > 0 ? formatDateString(dates[dates.length - 1]) : ''
    };
    
    return {
      totalDebit,
      totalCredit,
      entryCount: entries.length,
      dateRange,
      monthlyTrend,
      topExpenses
    };
  }, [entries]);

  const StatCard = ({ title, value, sub, icon: Icon, color }: {
    title: string;
    value: string;
    sub?: string;
    icon: any;
    color: string;
  }) => (
    <Card>
      <CardContent className="p-6 flex items-center space-x-4">
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <h3 className="text-2xl font-bold">{value}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
          title="총 차변금액 (Total Debit)" 
          value={`₩${summary.totalDebit.toLocaleString()}`} 
          sub={`${summary.entryCount} entries processed`}
          icon={TrendingUp}
          color="bg-blue-500"
        />
        <StatCard 
          title="총 대변금액 (Total Credit)" 
          value={`₩${summary.totalCredit.toLocaleString()}`} 
          sub="Double entry verified"
          icon={TrendingDown}
          color="bg-emerald-500"
        />
        <StatCard 
          title="기간 (Period)" 
          value={summary.dateRange.start || '-'} 
          sub={`~ ${summary.dateRange.end}`}
          icon={Activity}
          color="bg-violet-500"
        />
        <StatCard 
          title="주요 비용 계정" 
          value={summary.topExpenses[0]?.name || 'N/A'} 
          sub={`₩${summary.topExpenses[0]?.value.toLocaleString() || 0}`}
          icon={DollarSign}
          color="bg-amber-500"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>월별 추세 (Monthly Trend)</CardTitle>
            <CardDescription>월별 차변/대변 추이를 보여줍니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#64748b" 
                    fontSize={12}
                    tickFormatter={(value) => {
                      // "2024-01" -> "1월"
                      const parts = value.split('-');
                      if (parts.length === 2) {
                        const month = parseInt(parts[1], 10);
                        return `${month}월`;
                      }
                      return value;
                    }}
                  />
                  <YAxis 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickFormatter={(val) => `${(val / 10000).toFixed(0)}만`} 
                  />
                  <Tooltip 
                    formatter={(val: number) => `₩${val.toLocaleString()}`}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  <Legend />
                  <Bar dataKey="debit" name="차변 (Debit)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="credit" name="대변 (Credit)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Structure */}
        <Card>
          <CardHeader>
            <CardTitle>계정별 비용 구조 (Top Expenses)</CardTitle>
            <CardDescription>상위 6개 비용 계정의 구성비를 보여줍니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.topExpenses}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => {
                      // 긴 이름은 줄임
                      const shortName = name.length > 10 ? name.substring(0, 10) + '...' : name;
                      return `${shortName} ${(percent * 100).toFixed(0)}%`;
                    }}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {summary.topExpenses.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: number) => `₩${val.toLocaleString()}`}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;


