import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TrendingUp, AlertTriangle, Scale, Sparkles, Loader2, Check, ChevronsUpDown, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface AnalysisPanelProps {
  ledgerData: any[];
  ledgerId?: string;
}

export const AnalysisPanel = ({ ledgerData, ledgerId }: AnalysisPanelProps) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, string>>({});
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('trend');
  const [openCombobox, setOpenCombobox] = useState(false);
  const { toast } = useToast();

  // 계정 목록 추출
  const accounts = useMemo(() => {
    const accountSet = new Set<string>();
    ledgerData.forEach(row => {
      if (row['시트명']) {
        accountSet.add(row['시트명']);
      }
    });
    return Array.from(accountSet).sort();
  }, [ledgerData]);

  // 선택된 계정의 데이터만 필터링
  const filteredData = useMemo(() => {
    if (selectedAccount === 'all') {
      return ledgerData;
    }
    return ledgerData.filter(row => row['시트명'] === selectedAccount);
  }, [ledgerData, selectedAccount]);

  const downloadAnalysis = (analysisType: string) => {
    const analysisKey = `${selectedAccount}-${analysisType}`;
    const analysisContent = analyses[analysisKey];
    
    if (!analysisContent) {
      toast({
        title: '오류',
        description: '다운로드할 분석 결과가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const typeName = analysisTypes.find(t => t.id === analysisType)?.name || analysisType;
    const accountName = selectedAccount === 'all' ? '전체계정' : selectedAccount;
    
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['분석 유형', typeName],
      ['계정', accountName],
      ['분석 일시', new Date().toLocaleString('ko-KR')],
      [],
      ['분석 결과'],
      [analysisContent],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 15 }, { wch: 80 }];
    
    XLSX.utils.book_append_sheet(wb, ws, '분석결과');
    XLSX.writeFile(wb, `AI분석_${typeName}_${accountName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: '다운로드 완료',
      description: '분석 결과를 엑셀 파일로 저장했습니다.',
    });
  };

  const runAnalysis = async (analysisType: string) => {
    setLoading(analysisType);

    try {
      const accountInfo = selectedAccount === 'all' 
        ? '전체 계정' 
        : `${selectedAccount} 계정`;
      
      const { data, error } = await supabase.functions.invoke('analyze-ledger', {
        body: { 
          ledgerData: filteredData, 
          analysisType,
          accountName: accountInfo
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: '오류',
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      const analysisKey = `${selectedAccount}-${analysisType}`;
      setAnalyses((prev) => ({ ...prev, [analysisKey]: data.analysis }));

      if (ledgerId) {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user) {
          await supabase.from('ledger_analysis').insert({
            ledger_id: ledgerId,
            user_id: session.session.user.id,
            analysis_type: analysisType,
            result: { analysis: data.analysis },
          });
        }
      }

      toast({
        title: '분석 완료',
        description: '분석이 성공적으로 완료되었습니다.',
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: '오류',
        description: '분석 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const analysisTypes = [
    { id: 'trend', name: '추세 분석', icon: TrendingUp, description: '계정별 추세와 패턴 분석' },
    { id: 'anomaly', name: '이상 거래 탐지', icon: AlertTriangle, description: '비정상적인 거래 패턴 찾기' },
    { id: 'balance', name: '차대 균형', icon: Scale, description: '차변과 대변의 균형 확인' },
    { id: 'insight', name: '재무 인사이트', icon: Sparkles, description: '전반적인 재무 분석' },
  ];

  const currentAnalysisType = analysisTypes.find(t => t.id === activeTab);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>AI 분석</CardTitle>
            <CardDescription>
              계정별원장 데이터를 AI로 분석하여 인사이트를 얻으세요
            </CardDescription>
          </div>
          <Button
            onClick={() => runAnalysis(activeTab)}
            disabled={loading === activeTab}
            size="lg"
          >
            {loading === activeTab ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                {currentAnalysisType && <currentAnalysisType.icon className="mr-2 h-4 w-4" />}
                분석 시작
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">분석할 계정 선택</label>
          <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openCombobox}
                className="w-full justify-between"
              >
                {selectedAccount === 'all' ? '전체 계정' : selectedAccount}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder="계정 검색..." />
                <CommandList>
                  <CommandEmpty>계정을 찾을 수 없습니다.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => {
                        setSelectedAccount('all');
                        setOpenCombobox(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedAccount === 'all' ? "opacity-100" : "opacity-0"
                        )}
                      />
                      전체 계정
                    </CommandItem>
                    {accounts.map((account) => (
                      <CommandItem
                        key={account}
                        value={account}
                        onSelect={() => {
                          setSelectedAccount(account);
                          setOpenCombobox(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedAccount === account ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {account}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground mt-2">
            선택된 계정: {selectedAccount === 'all' ? '전체' : selectedAccount} 
            ({filteredData.length}개 항목)
          </p>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            {analysisTypes.map((type) => (
              <TabsTrigger key={type.id} value={type.id}>
                <type.icon className="h-4 w-4 mr-1" />
                {type.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {analysisTypes.map((type) => (
            <TabsContent key={type.id} value={type.id} className="space-y-4">
              <p className="text-sm text-muted-foreground">{type.description}</p>

              {analyses[`${selectedAccount}-${type.id}`] && (
                <>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadAnalysis(type.id)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      엑셀 다운로드
                    </Button>
                  </div>
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{analyses[`${selectedAccount}-${type.id}`]}</ReactMarkdown>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};
