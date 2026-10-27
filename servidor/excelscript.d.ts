// Declaración mínima de ExcelScript con SOLO lo que usa motor.ts, para
// compilarlo y probarlo fuera de Excel. Si motor.ts empieza a usar otra parte
// de la API, hay que declararla acá con la misma firma que la oficial:
// https://learn.microsoft.com/javascript/api/office-scripts/excelscript
declare namespace ExcelScript {
  interface Range {
    getValues(): (string | number | boolean)[][];
    setValues(values: (string | number | boolean)[][]): void;
    getRow(row: number): Range;
  }
  interface Table {
    getHeaderRowRange(): Range;
    getRangeBetweenHeaderAndTotal(): Range;
    getRowCount(): number;
    addRows(index?: number, values?: (string | number | boolean)[][]): void;
  }
  interface Workbook {
    getTable(key: string): Table | undefined;
  }
}
