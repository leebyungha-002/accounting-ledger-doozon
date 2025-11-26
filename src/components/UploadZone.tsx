/**
 * UploadZone 컴포넌트
 * Google AI Studio에서 가져온 UploadZone.tsx를 현재 프로젝트에 맞게 변환
 * 파일 업로드 영역 컴포넌트 (드래그 앤 드롭, 클릭 업로드 지원)
 */

import React, { useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  onDemo?: () => void;
  loading?: boolean;
  error?: string | null;
}

const UploadZone: React.FC<UploadZoneProps> = ({ 
  onFileSelect, 
  onDemo, 
  loading = false, 
  error = null 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto text-center space-y-4">
      <Card 
        className="border-2 border-dashed hover:border-primary transition-all cursor-pointer hover:bg-muted/50"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <CardContent className="p-12">
          <input 
            type="file" 
            ref={inputRef} 
            className="hidden" 
            accept=".xlsx, .xls, .csv" 
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onFileSelect(e.target.files[0]);
              }
            }}
          />
          
          <div className="flex flex-col items-center pointer-events-none">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
              {loading ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-8 h-8" />
              )}
            </div>
            <h3 className="text-xl font-bold mb-2">
              더존 분개장 파일 업로드
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              더존(Douzone) SmartA, iCube 등에서 엑셀로 변환된 분개장(Journal Entry) 파일을 드래그하거나 클릭하여 업로드하세요.
            </p>
            <div className="bg-muted text-muted-foreground px-4 py-2 rounded text-sm font-medium">
              지원 형식: .xlsx, .xls (Header: 일자, 계정과목, 차변, 대변, 적요...)
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {onDemo && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-background text-muted-foreground">또는</span>
            </div>
          </div>

          <Button 
            onClick={onDemo}
            variant="outline"
            className="mt-2"
          >
            데모 데이터로 체험하기
          </Button>
        </>
      )}
    </div>
  );
};

export default UploadZone;

