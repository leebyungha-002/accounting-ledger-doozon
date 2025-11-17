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
    const { ledgerData, analysisType, accountName, question, benfordResults, totalCount } = await req.json();
    console.log('Analyzing ledger data, type:', analysisType, 'account:', accountName);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Handle Benford Analysis
    if (analysisType === 'benford') {
      const prompt = `
당신은 숙련된 회계 감사인입니다. 벤포드 법칙(Benford's Law)을 사용하여 데이터의 이상 징후를 분석하고 있습니다.

아래는 '${accountName}' 계정의 벤포드 법칙 분석 결과입니다:

- 총 유효 데이터 수: ${totalCount}
- 분석 결과:
${JSON.stringify(benfordResults, null, 2)}

## 분석 요청
1. 위 분석 결과를 해석해주세요.
2. 실제 분포가 벤포드 법칙의 이론적 분포와 유의미한 차이를 보이는 숫자가 있는지 식별해주세요.
3. 만약 유의미한 차이가 있다면, 회계적으로 어떤 의미를 가질 수 있는지 설명해주세요.
4. 추가적으로 어떤 검토 절차가 필요할지 구체적인 감사 절차를 제안해주세요.
5. 최종적인 전문가 의견을 요약해주세요.
      `;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'user', content: prompt }
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
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const analysisResult = data.choices[0].message.content;

      return new Response(
        JSON.stringify({ analysis: analysisResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle Account Analysis
    if (analysisType === 'account') {
      const dataForPrompt = JSON.stringify(ledgerData, null, 2);
      const prompt = `
당신은 전문 회계 분석가 AI입니다. 제공된 회계 장부 데이터를 바탕으로 사용자의 질문에 대해 전문적이고 이해하기 쉽게 분석해주세요.

## 분석 대상 계정
- 계정과목명: ${accountName}

## ${accountName} 관련 데이터 (샘플)
${dataForPrompt}

## 사용자 질문
"${question || '이 계정의 거래 내역을 요약하고, 특이사항이 있다면 알려주세요.'}"

## 분석 결과
위 데이터를 바탕으로 사용자 질문에 대한 분석 결과를 한국어로 작성해주세요. 결과를 명확하고 구조화된 형태로 제공해주세요.
      `;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'user', content: prompt }
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
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const analysisResult = data.choices[0].message.content;

      return new Response(
        JSON.stringify({ analysis: analysisResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // 월별로 데이터 집계
    const monthlyStats: any = {};
    for (let month = 1; month <= 12; month++) {
      monthlyStats[month] = { debit: 0, credit: 0, count: 0, clients: new Set() };
    }

    filteredData.forEach((row: any) => {
      const dateStr = row['__EMPTY'] || row['날짜'];
      if (!dateStr || typeof dateStr !== 'string') return;

      let month: number | null = null;
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 2) {
          month = parseInt(parts[0], 10);
        }
      }

      if (month && month >= 1 && month <= 12) {
        const debit = parseFloat(String(row['__EMPTY_3'] || row['차   변'] || 0).replace(/,/g, '')) || 0;
        const credit = parseFloat(String(row['__EMPTY_4'] || row['대   변'] || 0).replace(/,/g, '')) || 0;
        
        monthlyStats[month].debit += debit;
        monthlyStats[month].credit += credit;
        monthlyStats[month].count += 1;

        // 거래처 추출
        const possibleClientFields = ['계   정   별   원   장', '__EMPTY_1', '__EMPTY_2', '거래처'];
        for (const field of possibleClientFields) {
          const client = row[field];
          if (client && typeof client === 'string' && client.trim()) {
            monthlyStats[month].clients.add(client.trim());
            break;
          }
        }
      }
    });

    // Set을 배열로 변환하고 거래처 개수만 포함
    const monthlySummary = Object.entries(monthlyStats).map(([month, stats]: [string, any]) => ({
      month: parseInt(month),
      debit: stats.debit,
      credit: stats.credit,
      transactions: stats.count,
      uniqueClients: stats.clients.size,
    }));

    const dataSummary = JSON.stringify({
      totalRows: filteredData.length,
      monthlySummary,
      sampleRows: filteredData.slice(0, 20) // 샘플 데이터
    });

    let systemPrompt = '';
    let userPrompt = '';

    const accountPrefix = accountName ? `[${accountName}] ` : '';
    
    switch (analysisType) {
      case 'trend':
        systemPrompt = '당신은 회계 전문가입니다. 월별로 집계된 계정별원장 데이터를 분석하여 연간 추세와 패턴을 찾아주세요.';
        userPrompt = `${accountPrefix}다음은 월별로 집계된 계정별원장 데이터입니다:\n\n${dataSummary}\n\n1월부터 12월까지 전체 기간을 분석하여 다음을 설명해주세요:\n1. 월별 주요 추세 (증가/감소 패턴)\n2. 계절적 패턴이나 특이사항\n3. 거래량과 금액의 변화\n4. 주의가 필요한 월과 그 이유`;
        break;
      case 'anomaly':
        systemPrompt = '당신은 회계 감사 전문가입니다. 월별 집계 데이터에서 이상 패턴을 찾아주세요.';
        userPrompt = `${accountPrefix}다음은 월별로 집계된 계정별원장 데이터입니다:\n\n${dataSummary}\n\n1월부터 12월까지 전체 기간을 검토하여:\n1. 비정상적인 금액 변동이 있는 월\n2. 거래 패턴의 급격한 변화\n3. 차변/대변 불균형이 심한 기간\n4. 권장 조치사항`;
        break;
      case 'balance':
        systemPrompt = '당신은 회계 전문가입니다. 월별 집계 데이터로 차변/대변 균형을 분석해주세요.';
        userPrompt = `${accountPrefix}다음은 월별로 집계된 계정별원장 데이터입니다:\n\n${dataSummary}\n\n1월부터 12월까지:\n1. 월별 차변/대변 합계\n2. 연간 총 차변/대변\n3. 불균형이 큰 월과 원인\n4. 전체 균형 상태 평가`;
        break;
      default:
        systemPrompt = '당신은 회계 전문가입니다. 월별 집계 데이터로 전반적인 재무 인사이트를 제공해주세요.';
        userPrompt = `${accountPrefix}다음은 월별로 집계된 계정별원장 데이터입니다:\n\n${dataSummary}\n\n1월부터 12월까지 전체 기간을 분석하여:\n1. 연간 재무 흐름 요약\n2. 분기별/월별 주요 발견사항\n3. 개선이 필요한 영역\n4. 실행 가능한 권장사항`;
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
