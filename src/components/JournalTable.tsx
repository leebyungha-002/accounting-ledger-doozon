/**
 * JournalTable 컴포넌트
 * Google AI Studio에서 가져온 JournalTable.tsx를 현재 프로젝트에 맞게 변환
 * 분개장 내역을 테이블로 표시하고 검색, 페이지네이션, 엑셀 다운로드 기능 제공
 */

import React, { useState } from 'react';
import { JournalEntry } from '@/types/analysis';
import { Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface JournalTableProps {
  entries: JournalEntry[];
}

const JournalTable: React.FC<JournalTableProps> = ({ entries }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const filteredEntries = entries.filter(e => 
    e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.accountName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.vendor?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredEntries.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const currentRows = filteredEntries.slice(startIndex, startIndex + rowsPerPage);

  const handleExcelDownload = () => {
    const data = filteredEntries.map(e => ({
      '일자': typeof e.date === 'string' ? e.date : e.date instanceof Date ? e.date.toISOString().split('T')[0] : String(e.date),
      '계정과목': e.accountName || '',
      '차변': e.debit || 0,
      '대변': e.credit || 0,
      '거래처': e.vendor || '',
      '적요': e.description || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    
    // Column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 15 }, // Account
      { wch: 12 }, // Debit
      { wch: 12 }, // Credit
      { wch: 20 }, // Vendor
      { wch: 40 }  // Description
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "전표내역");
    
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Journal_List_${dateStr}.xlsx`);
  };

  // Date formatting helper
  const formatDate = (date: string | Date): string => {
    if (typeof date === 'string') {
      return date;
    }
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return String(date);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>전표 내역 (Journal Entries)</CardTitle>
            <CardDescription className="mt-1">
              검색, 페이지네이션, 엑셀 다운로드 기능이 제공됩니다
            </CardDescription>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Button 
              onClick={handleExcelDownload}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              엑셀 저장
            </Button>
            
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input 
                type="text" 
                placeholder="계정, 적요, 거래처 검색..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => { 
                  setSearchTerm(e.target.value); 
                  setPage(1); 
                }}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">일자</TableHead>
                <TableHead className="min-w-[150px]">계정과목</TableHead>
                <TableHead className="text-right w-[120px]">차변</TableHead>
                <TableHead className="text-right w-[120px]">대변</TableHead>
                <TableHead className="min-w-[150px]">거래처</TableHead>
                <TableHead className="min-w-[200px]">적요</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRows.length > 0 ? (
                currentRows.map((entry, idx) => (
                  <TableRow key={entry.id || idx} className="hover:bg-muted/50">
                    <TableCell className="font-medium whitespace-nowrap">
                      {formatDate(entry.date)}
                    </TableCell>
                    <TableCell className="text-primary font-medium whitespace-nowrap">
                      {entry.accountName || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.debit && entry.debit !== 0 ? entry.debit.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.credit && entry.credit !== 0 ? entry.credit.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap max-w-[150px] truncate">
                      {entry.vendor || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {entry.description || '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    검색 결과가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t text-sm text-muted-foreground">
          <span>
            {filteredEntries.length > 0 
              ? `${startIndex + 1}부터 ${Math.min(startIndex + rowsPerPage, filteredEntries.length)}까지 (전체 ${filteredEntries.length}건)`
              : '표시할 항목이 없습니다'
            }
          </span>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              페이지 {page} / {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default JournalTable;


