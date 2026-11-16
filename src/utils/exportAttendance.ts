import { AttendanceRecord } from '../types/attendance';

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportAttendanceToCSV(records: AttendanceRecord[], filenameBase: string): void {
  const headers = [
    'Student Name',
    'Roll Number',
    'RFID UID',
    'Date (DD-MM-YYYY)',
    'Check-in Time (IST)',
    'Attendance Status',
  ];

  const rows = records.map((rec) =>
    [
      rec.studentName,
      rec.rollNumber,
      rec.rfidUid,
      rec.dateDisplay,
      rec.checkInTimeDisplay,
      rec.status,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  const csvContent = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filenameBase}.csv`);
}

export function exportAttendanceToExcel(
  records: AttendanceRecord[],
  filenameBase: string,
  sheetTitle = 'Attendance'
): void {
  const safeSheet = escapeXml(sheetTitle.slice(0, 31) || 'Attendance');
  const headers = [
    'Student Name',
    'Roll Number',
    'RFID UID',
    'Date (DD-MM-YYYY)',
    'Check-in Time (IST)',
    'Attendance Status',
  ];

  const headerCells = headers
    .map(
      (h) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
    )
    .join('');

  const dataRows = records
    .map((rec) => {
      const cells = [
        rec.studentName,
        rec.rollNumber,
        rec.rfidUid,
        rec.dateDisplay,
        rec.checkInTimeDisplay,
        rec.status,
      ]
        .map(
          (val) =>
            `<Cell ss:StyleID="Body"><Data ss:Type="String">${escapeXml(val)}</Data></Cell>`
        )
        .join('');
      return `<Row ss:Height="22">${cells}</Row>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Size="11" ss:Color="#0F172A"/>
   <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#38BDF8"/>
   </Borders>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Body">
   <Font ss:Size="10" ss:Color="#1E293B"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${safeSheet}">
  <Table>
   <Column ss:Width="170"/>
   <Column ss:Width="110"/>
   <Column ss:Width="130"/>
   <Column ss:Width="120"/>
   <Column ss:Width="140"/>
   <Column ss:Width="120"/>
   <Row ss:Height="26">${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, `${filenameBase}.xls`);
}
