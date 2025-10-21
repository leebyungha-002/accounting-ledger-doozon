import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface FileUploadProps {
  onFileUpload: (data: any[], fileName: string) => void;
}

export const FileUpload = ({ onFileUpload }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      toast({
        title: '오류',
        description: 'Excel 파일(.xlsx, .xls)만 업로드 가능합니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      // 모든 시트의 데이터를 합치기
      let allData: any[] = [];
      let sheetCount = 0;
      
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length > 0) {
          // 각 데이터에 시트 이름 추가
          const dataWithSheet = jsonData.map((row: any) => ({
            ...(row as object),
            '시트명': sheetName
          }));
          allData = [...allData, ...dataWithSheet];
          sheetCount++;
        }
      });

      if (allData.length === 0) {
        toast({
          title: '오류',
          description: '파일에 데이터가 없습니다.',
          variant: 'destructive',
        });
        return;
      }

      onFileUpload(allData, file.name);
      toast({
        title: '성공',
        description: `${sheetCount}개 시트에서 총 ${allData.length}개의 데이터를 불러왔습니다.`,
      });
    } catch (error) {
      console.error('File parsing error:', error);
      toast({
        title: '오류',
        description: '파일을 읽는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragging ? 'border-primary bg-primary/5' : 'border-border'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-primary/10 p-4">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">계정별원장 파일 업로드</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Excel 파일을 드래그하거나 클릭하여 선택하세요
          </p>
        </div>
        <label htmlFor="file-upload">
          <Button variant="default" asChild>
            <span className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              파일 선택
            </span>
          </Button>
        </label>
        <input
          id="file-upload"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>
    </div>
  );
};
