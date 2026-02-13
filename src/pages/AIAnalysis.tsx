/**
 * AI Analysis 페이지
 * Google AI Studio에서 가져온 컴포넌트들을 사용하는 독립적인 페이지
 * 기존 장부 분석 프로그램과 완전히 분리되어 별도로 사용
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  const [ledgerWorkbook, setLedgerWorkbook] = useState<XLSX.WorkBook | null>(null); // 계정별원장 데이터
  const [ledgerFileName, setLedgerFileName] = useState<string>('');
  
  type ViewType = 'upload' | 'table' | 'ai';
  const [currentView, setCurrentView] = useState<ViewType>('upload');
  
  // 스크롤 중 클릭 방지
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mouseDownPositionRef = useRef<{ x: number; y: number } | null>(null);
  const mouseDownTimeRef = useRef<number>(0);
  const isMouseMovingRef = useRef(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const isScrollbarClickRef = useRef(false);
  
  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;
      
      // 스크롤이 끝난 후 500ms 후에 클릭 허용
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        isScrollbarClickRef.current = false;
      }, 500);
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      mouseDownPositionRef.current = { x: e.clientX, y: e.clientY };
      mouseDownTimeRef.current = Date.now();
      isMouseMovingRef.current = false;
      
      // 스크롤바 영역 클릭 감지 (오른쪽 끝 30px)
      const windowWidth = window.innerWidth;
      const scrollbarWidth = 17; // 일반적인 스크롤바 너비
      if (e.clientX >= windowWidth - scrollbarWidth) {
        isScrollbarClickRef.current = true;
        isScrollingRef.current = true;
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingRef.current = false;
          isScrollbarClickRef.current = false;
        }, 1000); // 1초 동안 클릭 차단
        return;
      }
      
      // 헤더 영역에서 버튼 외부 클릭 감지
      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect();
        const isInHeader = e.clientY >= headerRect.top && e.clientY <= headerRect.bottom;
        if (isInHeader) {
          const target = e.target as HTMLElement;
          const button = target.closest('button');
          // 헤더 영역에서 버튼이 아닌 곳을 클릭한 경우
          if (!button && e.clientX >= windowWidth - 50) {
            isScrollbarClickRef.current = true;
            isScrollingRef.current = true;
            if (scrollTimeoutRef.current) {
              clearTimeout(scrollTimeoutRef.current);
            }
            scrollTimeoutRef.current = setTimeout(() => {
              isScrollingRef.current = false;
              isScrollbarClickRef.current = false;
            }, 1000);
          }
        }
      }
    };
    
    const handleClick = (e: MouseEvent) => {
      // 스크롤바 클릭이면 모든 클릭 차단
      if (isScrollbarClickRef.current) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
      
      // 스크롤바 영역 클릭 확인
      const windowWidth = window.innerWidth;
      const scrollbarWidth = 17;
      if (e.clientX >= windowWidth - scrollbarWidth) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('스크롤바 영역 클릭 차단');
        return false;
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (mouseDownPositionRef.current) {
        const dx = Math.abs(e.clientX - mouseDownPositionRef.current.x);
        const dy = Math.abs(e.clientY - mouseDownPositionRef.current.y);
        // 3px 이상 움직이면 드래그로 간주
        if (dx > 3 || dy > 3) {
          isMouseMovingRef.current = true;
          isScrollingRef.current = true;
        }
      }
    };
    
    const handleMouseUp = () => {
      mouseDownPositionRef.current = null;
      if (isMouseMovingRef.current) {
        // 드래그 후 클릭 무시 시간 연장
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingRef.current = false;
          isMouseMovingRef.current = false;
        }, 500);
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousedown', handleMouseDown, true); // capture phase
    window.addEventListener('click', handleClick, true); // capture phase - 가장 먼저 실행
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);
  
  // 안전한 클릭 핸들러
  const handleSafeClick = (callback: () => void, e?: React.MouseEvent) => {
    if (!e) {
      return;
    }
    
    // 스크롤바 클릭이면 무조건 차단
    if (isScrollbarClickRef.current) {
      console.log('스크롤바 클릭 - 차단');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // 스크롤바 영역 클릭 확인
    const windowWidth = window.innerWidth;
    const scrollbarWidth = 17;
    if (e.clientX && e.clientX >= windowWidth - scrollbarWidth) {
      console.log('스크롤바 영역 클릭 - 차단');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // 스크롤 중이면 클릭 무시
    if (isScrollingRef.current || isMouseMovingRef.current) return;
    const timeSinceMouseDown = Date.now() - mouseDownTimeRef.current;
    if (timeSinceMouseDown < 150 && timeSinceMouseDown > 0) return;
    const target = e.target as HTMLElement;
    const button = target.closest('button');
    if (!button || button.disabled) return;
    
    callback();
  };

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
            // AI 화면 전환은 'AI 심층 분석 시작' 버튼 클릭 시에만 수행
            toast({
              title: '파일 업로드 성공',
              description: `${entries.length}건의 데이터를 불러왔습니다. 'AI 심층 분석 시작'을 눌러 분석 화면으로 이동하세요.`,
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
      <header ref={headerRef} className="border-b bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">분개장 분석</h1>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Google AI Studio</span>
            </div>
            <div className="flex items-center gap-2">
              {currentView !== 'upload' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={(e) => {
                    // 클릭 위치가 버튼 영역 내인지 확인
                    const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const clickX = e.clientX;
                    const clickY = e.clientY;
                    
                    // 버튼 영역 외부 클릭 무시
                    if (clickX < buttonRect.left || clickX > buttonRect.right || 
                        clickY < buttonRect.top || clickY > buttonRect.bottom) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    
                    // 스크롤바 영역 클릭 무시
                    const windowWidth = window.innerWidth;
                    if (clickX >= windowWidth - 17) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                    handleSafeClick(() => setCurrentView('upload'), e);
                  }}
                  onMouseDown={(e) => {
                    const windowWidth = window.innerWidth;
                    if (e.clientX >= windowWidth - 17) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  다른 파일 업로드
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  // 클릭 위치가 버튼 영역 내인지 확인
                  const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const clickX = e.clientX;
                  const clickY = e.clientY;
                  
                  // 버튼 영역 외부 클릭 무시
                  if (clickX < buttonRect.left || clickX > buttonRect.right || 
                      clickY < buttonRect.top || clickY > buttonRect.bottom) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  
                  // 스크롤바 영역 클릭 무시
                  const windowWidth = window.innerWidth;
                  if (clickX >= windowWidth - 17) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  
                  e.preventDefault();
                  e.stopPropagation();
                  handleSafeClick(() => navigate('/analysis'), e);
                }}
                onMouseDown={(e) => {
                  const windowWidth = window.innerWidth;
                  if (e.clientX >= windowWidth - 17) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
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
            {/* 분개장 업로드 */}
            <Card className="border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                  분개장 파일 업로드 (필수)
                </CardTitle>
                <CardDescription>
                  Google AI Studio 기반 AI 분석을 위해 분개장 파일을 업로드하세요.
                  <br />
                  <span className="text-xs text-muted-foreground">
                    기존 장부 분석과 별도로 작동하며, 소량 데이터에 최적화되어 있습니다.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {journalEntries.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <div>
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                          ✓ 업로드 완료: {fileName}
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                          데이터 건수: {journalEntries.length.toLocaleString()}건
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setWorkbook(null);
                          setFileName('');
                          setJournalEntries([]);
                        }}
                      >
                        제거
                      </Button>
                    </div>
                  </div>
                ) : (
                <UploadZone
                  onFileSelect={handleFileSelect}
                  onDemo={handleDemo}
                  loading={false}
                  error={null}
                />
                )}
              </CardContent>
            </Card>

            {/* 계정별원장 업로드 */}
            <Card className="border-2 border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                  계정별원장 파일 업로드 (선택사항)
                </CardTitle>
                <CardDescription>
                  계정별원장을 업로드하면 기초잔액 정보를 확인할 수 있습니다.
                  <br />
                  <span className="text-xs text-muted-foreground">
                    전기이월 항목을 자동으로 찾아 기초잔액으로 표시합니다.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ledgerWorkbook ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div>
                        <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                          ✓ 업로드 완료: {ledgerFileName}
                        </p>
                        <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                          시트 수: {ledgerWorkbook.SheetNames.length}개
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setLedgerWorkbook(null);
                          setLedgerFileName('');
                        }}
                      >
                        제거
                      </Button>
                    </div>
                  </div>
                ) : (
                  <UploadZone
                    onFileSelect={async (file: File) => {
                      try {
                        const data = await file.arrayBuffer();
                        const loadedWorkbook = XLSX.read(data, { type: 'array', cellDates: true });
                        setLedgerWorkbook(loadedWorkbook);
                        setLedgerFileName(file.name);
                        toast({
                          title: '계정별원장 업로드 성공',
                          description: `${file.name} 파일이 업로드되었습니다.`,
                        });
                      } catch (error: any) {
                        toast({
                          title: '오류',
                          description: `파일 처리 중 오류가 발생했습니다: ${error.message}`,
                          variant: 'destructive',
                        });
                      }
                    }}
                    onDemo={undefined}
                    loading={false}
                    error={null}
                  />
                )}
              </CardContent>
            </Card>

            {/* 분석 시작 버튼 */}
            {journalEntries.length > 0 && (
              <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-2 border-blue-300 dark:border-blue-700">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        준비 완료
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {journalEntries.length.toLocaleString()}건의 분개장 데이터
                        {ledgerWorkbook && ` + ${ledgerWorkbook.SheetNames.length}개 계정별원장 시트`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setCurrentView('ai')}
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      AI 심층 분석 시작
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 안내 카드 */}
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="text-base">💡 사용 안내</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• 이 페이지는 Google AI Studio의 AI 분석 기능을 별도로 사용합니다.</p>
                <p>• 기존 장부 분석 프로그램과 완전히 분리되어 작동합니다.</p>
                <p>• <strong>분개장 파일은 필수</strong>이며, <strong>계정별원장 파일은 선택사항</strong>입니다.</p>
                <p>• 계정별원장을 업로드하면 전기이월 항목을 찾아 기초잔액으로 표시합니다.</p>
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSafeClick(() => setCurrentView('table'), e);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    분개장 테이블
                  </Button>
                  <Button
                    variant={(currentView as ViewType) === 'ai' ? 'default' : 'outline'}
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSafeClick(() => setCurrentView('ai'), e);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    AI 심층 분석
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 파일 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                      <p className="text-xs font-bold text-green-700 dark:text-green-300 uppercase mb-1">
                        분개장 파일
                      </p>
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        {fileName}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      데이터 건수: {cleanedEntries.length.toLocaleString()}건
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSafeClick(() => {
                        setWorkbook(null);
                        setFileName('');
                        setJournalEntries([]);
                        setCurrentView('upload');
                      }, e);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                      변경
                  </Button>
                </div>
              </CardContent>
            </Card>

              {ledgerWorkbook ? (
                <Card className="bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase mb-1">
                          계정별원장 파일
                        </p>
                        <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                          {ledgerFileName}
                        </p>
                        <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                          시트 수: {ledgerWorkbook.SheetNames.length}개
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setLedgerWorkbook(null);
                          setLedgerFileName('');
                          toast({
                            title: '계정별원장 제거',
                            description: '계정별원장이 제거되었습니다.',
                          });
                        }}
                      >
                        제거
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                        계정별원장 파일 (선택사항)
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        업로드되지 않음
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        기초잔액 정보를 보려면 업로드하세요
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSafeClick(() => setCurrentView('upload'), e);
                        }}
                      >
                        업로드 화면으로 이동
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <AIInsights 
              entries={cleanedEntries} 
              ledgerWorkbook={ledgerWorkbook}
              getDataFromSheet={ledgerWorkbook ? (worksheet: XLSX.WorkSheet | undefined) => {
                // 간단한 getDataFromSheet 구현
                if (!worksheet) return { data: [], headers: [], orderedHeaders: [] };
                
                const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
                if (sheetDataAsArrays.length < 2) return { data: [], headers: [], orderedHeaders: [] };
                
                // 헤더 찾기 (첫 번째 비어있지 않은 행)
                let headerIndex = -1;
                for (let i = 0; i < Math.min(20, sheetDataAsArrays.length); i++) {
                  const row = sheetDataAsArrays[i];
                  if (row && row.length >= 3 && row.some(cell => cell !== null && String(cell).trim() !== '')) {
                    headerIndex = i;
                    break;
                  }
                }
                
                if (headerIndex === -1) return { data: [], headers: [], orderedHeaders: [] };
                
                const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { range: headerIndex });
                const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
                const orderedHeaders = (sheetDataAsArrays[headerIndex] || []).map(h => String(h || '').trim());
                
                return { data: rawData, headers, orderedHeaders };
              } : undefined}
            />
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSafeClick(() => setCurrentView('table'), e);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    분개장 테이블
                  </Button>
                  <Button
                    variant={(currentView as ViewType) === 'ai' ? 'default' : 'outline'}
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSafeClick(() => setCurrentView('ai'), e);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
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

