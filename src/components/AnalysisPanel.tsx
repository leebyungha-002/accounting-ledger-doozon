import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, AlertTriangle, Scale, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AnalysisPanelProps {
  ledgerData: any[];
  ledgerId?: string;
}

export const AnalysisPanel = ({ ledgerData, ledgerId }: AnalysisPanelProps) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const runAnalysis = async (analysisType: string) => {
    setLoading(analysisType);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-ledger', {
        body: { ledgerData, analysisType },
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

      setAnalyses((prev) => ({ ...prev, [analysisType]: data.analysis }));

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI 분석</CardTitle>
        <CardDescription>
          계정별원장 데이터를 AI로 분석하여 인사이트를 얻으세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="trend" className="w-full">
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{type.description}</p>
                <Button
                  onClick={() => runAnalysis(type.id)}
                  disabled={loading === type.id}
                >
                  {loading === type.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      분석 중...
                    </>
                  ) : (
                    <>
                      <type.icon className="mr-2 h-4 w-4" />
                      분석 시작
                    </>
                  )}
                </Button>
              </div>

              {analyses[type.id] && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{analyses[type.id]}</ReactMarkdown>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};
