import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LedgerDataTableProps {
  data: any[];
}

export const LedgerDataTable = ({ data }: LedgerDataTableProps) => {
  if (data.length === 0) return null;

  const columns = Object.keys(data[0]);

  return (
    <div className="border rounded-lg">
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column} className="font-semibold">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 100).map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column}>
                    {typeof row[column] === 'number'
                      ? row[column].toLocaleString()
                      : String(row[column] || '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      {data.length > 100 && (
        <div className="p-2 text-sm text-muted-foreground text-center border-t">
          처음 100개 항목만 표시됩니다 (전체: {data.length}개)
        </div>
      )}
    </div>
  );
};
