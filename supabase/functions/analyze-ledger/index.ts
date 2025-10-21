import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ledgerData, analysisType, accountName } = await req.json();
    console.log('Analyzing ledger data, type:', analysisType, 'account:', accountName);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // 합계 행 제외 패턴
    const excludePatterns = [
      '합계',
      '총합계',
      '[ 월',
      '[ 누',
      ']',
      '계   정   별   원   장',
      '회사명',
      '날짜',
      '적    요    란',
      '차   변',
      '대   변',
      '잔   액',
      '코드'
    ];

    // 합계 행 필터링
    const filteredData = ledgerData.filter((row: any) => {
      // 거래처명 확인
      const possibleClientFields = ['계   정   별   원   장', '__EMPTY_1', '__EMPTY_2', '거래처', '거래처명'];
      
      for (const field of possibleClientFields) {
        const value = row[field];
        if (value) {
          const strValue = String(value).trim();
          // 제외 패턴과 매칭되면 필터링
          if (excludePatterns.some(pattern => strValue.includes(pattern))) {
            return false;
          }
        }
      }
      
      return true;
    });

    console.log(`Filtered ${ledgerData.length} rows to ${filteredData.length} rows`);

    // Prepare data summary for AI
    const dataSummary = JSON.stringify(filteredData).slice(0, 10000); // Limit size

    let systemPrompt = '';
    let userPrompt = '';

    const accountPrefix = accountName ? `[${accountName}] ` : '';
    
    switch (analysisType) {
      case 'trend':
        systemPrompt = '당신은 회계 전문가입니다. 계정별원장 데이터를 분석하여 주요 추세와 패턴을 찾아주세요.';
        userPrompt = `${accountPrefix}다음 계정별원장 데이터를 분석하여 주요 추세를 설명해주세요:\n\n${dataSummary}\n\n다음 형식으로 답변해주세요:\n1. 주요 발견사항 (3-5개)\n2. 추세 분석\n3. 주의사항`;
        break;
      case 'anomaly':
        systemPrompt = '당신은 회계 감사 전문가입니다. 계정별원장에서 이상 거래나 비정상적인 패턴을 찾아주세요.';
        userPrompt = `${accountPrefix}다음 계정별원장 데이터에서 이상 거래나 비정상적인 패턴을 찾아주세요:\n\n${dataSummary}\n\n다음 항목을 확인해주세요:\n1. 비정상적으로 큰 금액의 거래\n2. 불균형한 차변/대변\n3. 의심스러운 거래 패턴\n4. 권장사항`;
        break;
      case 'balance':
        systemPrompt = '당신은 회계 전문가입니다. 계정별원장의 차변과 대변의 균형을 확인해주세요.';
        userPrompt = `${accountPrefix}다음 계정별원장 데이터의 차변/대변 균형을 분석해주세요:\n\n${dataSummary}\n\n다음 정보를 제공해주세요:\n1. 전체 차변 합계\n2. 전체 대변 합계\n3. 차이 분석\n4. 균형 상태 평가`;
        break;
      default:
        systemPrompt = '당신은 회계 전문가입니다. 계정별원장 데이터에 대한 전반적인 재무 인사이트를 제공해주세요.';
        userPrompt = `${accountPrefix}다음 계정별원장 데이터를 분석하여 전반적인 재무 인사이트를 제공해주세요:\n\n${dataSummary}\n\n다음 내용을 포함해주세요:\n1. 전체 요약\n2. 주요 발견사항\n3. 개선 제안\n4. 주의사항`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: '크레딧이 부족합니다. 크레딧을 추가해주세요.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysisResult = data.choices[0].message.content;

    console.log('Analysis completed successfully');

    return new Response(
      JSON.stringify({ analysis: analysisResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-ledger function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
