import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '@/components/FileUpload';
import { LedgerDataTable } from '@/components/LedgerDataTable';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { AuthForm } from '@/components/AuthForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [ledgerId, setLedgerId] = useState<string | undefined>();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleFileUpload = async (data: any[], name: string) => {
    setLedgerData(data);
    setFileName(name);

    if (user) {
      try {
        const { data: insertedData, error } = await supabase
          .from('general_ledgers')
          .insert({
            user_id: user.id,
            file_name: name,
            data: data,
          })
          .select()
          .single();

        if (error) throw error;

        setLedgerId(insertedData.id);
        toast({
          title: '저장 완료',
          description: '데이터가 저장되었습니다.',
        });
      } catch (error) {
        console.error('Error saving ledger:', error);
        toast({
          title: '오류',
          description: '데이터 저장 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setLedgerData([]);
    setFileName('');
    setLedgerId(undefined);
    toast({
      title: '로그아웃',
      description: '로그아웃되었습니다.',
    });
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <AuthForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">계정별원장 분석</h1>
          </div>
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            로그아웃
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>파일 업로드</CardTitle>
            <CardDescription>
              엑셀 형식의 계정별원장 파일을 업로드하여 분석을 시작하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload onFileUpload={handleFileUpload} />
          </CardContent>
        </Card>

        {ledgerData.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>데이터 미리보기</CardTitle>
                    <CardDescription>
                      업로드된 파일: {fileName} ({ledgerData.length}개 항목)
                    </CardDescription>
                  </div>
                  <Button onClick={() => navigate('/dual-offset-analysis')} variant="outline">
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    이중/상계 거래처 분석
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <LedgerDataTable data={ledgerData} />
              </CardContent>
            </Card>

            <AnalysisPanel ledgerData={ledgerData} ledgerId={ledgerId} />
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
