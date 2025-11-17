import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthForm } from '@/components/AuthForm';
import { supabase } from '@/integrations/supabase/client';

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 로그인 상태 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // 이미 로그인되어 있으면 바로 분석 페이지로 이동
        navigate('/analysis');
      }
    });

    // 로그인 이벤트 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // 로그인 성공 시 분석 페이지로 이동
        navigate('/analysis');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // 로그인 화면만 표시
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <AuthForm />
    </div>
  );
};

export default Index;
