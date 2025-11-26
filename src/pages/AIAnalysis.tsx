/**
 * AI Analysis 페이지
 * Google AI Studio에서 가져온 컴포넌트들을 사용하는 독립적인 페이지
 * 기존 장부 분석 프로그램과 완전히 분리되어 별도로 사용
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { JournalEntry } from '@/types/analysis';
import { convertLedgerRowsToJournalEntries } from '@/services/geminiAnalysisService';

// Google AI Studio 컴포넌트들
import UploadZone from '@/components/UploadZone';
import JournalTable from '@/components/JournalTable';
import AIInsights from '@/components/AIInsights';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const AIAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  
  type ViewType = 'upload' | 'table' | 'ai';
  const [currentView, setCurrentView] = useState<ViewType>('upload');

  // 파일 처리
  const handleFileSelect = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const loadedWorkbook = XLSX.read(data, { type: 'array', cellDates: true });
      setWorkbook(loadedWorkbook);
      setFileName(file.name);

      // 첫 번째 시트의 데이터를 JournalEntry로 변환
      if (loadedWorkbook.SheetNames.length > 0) {
        const firstSheet = loadedWorkbook.Sheets[loadedWorkbook.SheetNames[0]];
        
        // 배열 방식으로 읽어서 헤더 행 직접 확인 (1행이 헤더)
        const sheetArray = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
        
        if (sheetArray.length === 0) {
          toast({
            title: '오류',
            description: 'Excel 파일에 데이터가 없습니다.',
            variant: 'destructive',
          });
          return;
        }
        
        // 첫 번째 행이 헤더 (0번 인덱스)
        const headerRow = sheetArray[0] || [];
        const headers = headerRow.map((cell: any) => String(cell || '').trim());
        
        console.log('=== Excel에서 읽은 원본 헤더 ===');
        console.log('헤더 배열:', headers);
        console.log('헤더 개수:', headers.length);
        headers.forEach((h, idx) => {
          console.log(`  ${idx + 1}. "${h}"`);
        });
        
        // 데이터 행 (2번째 행부터)
        const dataRows = sheetArray.slice(1);
        const rawData = dataRows.map((row, rowIdx) => {
          const obj: { [key: string]: any } = {};
          headers.forEach((header, colIdx) => {
            // 헤더가 비어있지 않으면 데이터 추가
            if (header && header.trim() !== '') {
              obj[header] = row[colIdx] !== null && row[colIdx] !== undefined ? row[colIdx] : '';
            }
          });
          return obj;
        }).filter(row => {
          // 빈 행 제외 (모든 값이 비어있거나 null인 행)
          return Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== '');
        });
        
        console.log('=== 최종 헤더 목록 (빈 헤더 제외) ===');
        const finalHeaders = headers.filter(h => h && h.trim() !== '');
        console.log('헤더 목록:', finalHeaders);
        console.log('차변 헤더 존재:', finalHeaders.includes('차변'));
        console.log('대변 헤더 존재:', finalHeaders.includes('대변'));
        console.log('읽은 데이터 행 수:', rawData.length);
        
        if (rawData.length > 0 && finalHeaders.length > 0) {
          const entries = convertLedgerRowsToJournalEntries(rawData, finalHeaders);
          
          // 헤더에 "차변"이 없는 경우 경고
          if (!finalHeaders.includes('차변')) {
            console.error('⚠️ 경고: 헤더 목록에 "차변"이 없습니다!');
            console.log('현재 헤더 목록:', finalHeaders);
          }
          
          if (entries.length > 0) {
            setJournalEntries(entries);
            setCurrentView('ai');
            toast({
              title: '파일 업로드 성공',
              description: `${entries.length}건의 데이터를 불러왔습니다.`,
            });
          } else {
            toast({
              title: '경고',
              description: '데이터를 변환할 수 없습니다. 파일 형식을 확인해주세요.',
              variant: 'destructive',
            });
          }
        }
      }
    } catch (error: any) {
      toast({
        title: '오류',
        description: `파일 처리 중 오류가 발생했습니다: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const handleDemo = () => {
    toast({
      title: '데모 기능',
      description: '데모 데이터 기능은 추후 구현 예정입니다.',
    });
  };

  // 데이터 정리 및 필터링 (성능 최적화)
  const cleanedEntries = useMemo(() => {
    // 월계, 누계 행 제거
    const summaryKeywords = ['월계', '누계', '합계', '총계'];
    return journalEntries.filter(e => {
      if (!e.accountName || e.accountName.trim() === '') return false;
      const dateClean = String(e.date).replace(/\s/g, '');
      if (summaryKeywords.some(k => dateClean === k)) return false;
      const accClean = e.accountName.replace(/\s/g, '');
      if (summaryKeywords.includes(accClean)) return false;
      return true;
    });
  }, [journalEntries]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">분개장 분석</h1>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Google AI Studio</span>
            </div>
            <div className="flex items-center gap-2">
              {currentView !== 'upload' && (
                <Button variant="outline" size="sm" onClick={() => setCurrentView('upload')}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  다른 파일 업로드
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                기존 분석으로
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentView === 'upload' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>파일 업로드</CardTitle>
                <CardDescription>
                  Google AI Studio 기반 AI 분석을 위해 분개장 파일을 업로드하세요.
                  <br />
                  <span className="text-xs text-muted-foreground">
                    기존 장부 분석과 별도로 작동하며, 소량 데이터에 최적화되어 있습니다.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UploadZone
                  onFileSelect={handleFileSelect}
                  onDemo={handleDemo}
                  loading={false}
                  error={null}
                />
              </CardContent>
            </Card>

            {/* 안내 카드 */}
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="text-base">💡 사용 안내</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• 이 페이지는 Google AI Studio의 AI 분석 기능을 별도로 사용합니다.</p>
                <p>• 기존 장부 분석 프로그램과 완전히 분리되어 작동합니다.</p>
                <p>• 대량 데이터(수십만 행 이상)도 업로드 가능하며, AI 분석은 통계적으로 유의미한 샘플을 기반으로 수행됩니다.</p>
                <p>• 100,000건 중 1,000건(1%) 샘플링은 통계적으로 충분히 유의미합니다. 각 분석별로 층화 샘플링을 적용하여 대표성을 확보합니다.</p>
                <p>• 일반사항 분석: 상위 고액 500개 + 무작위 500개 / 공휴일전표: 고액 300개 + 무작위 700개 / 적요 적합성: 계정과목별 균형 샘플 1,000개</p>
              </CardContent>
            </Card>
          </div>
        )}

        {currentView === 'ai' && cleanedEntries.length > 0 && (
          <div className="space-y-6">
            {/* 네비게이션 탭 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={(currentView as ViewType) === 'table' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentView('table')}
                  >
                    분개장 테이블
                  </Button>
                  <Button
                    variant={(currentView as ViewType) === 'ai' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentView('ai')}
                  >
                    AI 심층 분석
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 파일 정보 */}
            <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      업로드된 파일: {fileName}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      데이터 건수: {cleanedEntries.length.toLocaleString()}건
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWorkbook(null);
                      setFileName('');
                      setJournalEntries([]);
                      setCurrentView('upload');
                    }}
                  >
                    다른 파일 업로드
                  </Button>
                </div>
              </CardContent>
            </Card>

            <AIInsights entries={cleanedEntries} />
          </div>
        )}

        {currentView === 'table' && cleanedEntries.length > 0 && (
          <div className="space-y-6">
            {/* 네비게이션 탭 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={(currentView as ViewType) === 'table' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentView('table')}
                  >
                    분개장 테이블
                  </Button>
                  <Button
                    variant={(currentView as ViewType) === 'ai' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentView('ai')}
                  >
                    AI 심층 분석
                  </Button>
                </div>
              </CardContent>
            </Card>

            <JournalTable entries={cleanedEntries} />
          </div>
        )}
      </main>
    </div>
  );
};

export default AIAnalysis;

