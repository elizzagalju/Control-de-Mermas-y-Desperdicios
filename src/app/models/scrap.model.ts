export type ShiftType = 'Matutino' | 'Vespertino' | 'Nocturno';

export const PRODUCTION_LINES = [
  'Línea 1 · Estampado',
  'Línea 2 · Inyección',
  'Línea 3 · Ensamble',
  'Línea 4 · Termoformado',
] as const;

export const DEFECT_REASONS = [
  'Rebaba / Exceso de material',
  'Deformación térmica',
  'Desalineación de troquel',
  'Burbuja / Rechupado',
  'Falla de acabado superficial',
  'Calibración de arranque',
] as const;

export interface ScrapRecord {
  id: string;
  turno: ShiftType;
  linea: string;
  motivo: string;
  kg: number;
  costoPorKg: number;
  costo: number;
}

export interface ShiftSummary {
  turno: ShiftType;
  totalKg: number;
  totalCosto: number;
  porcentaje: number;
  color: string;
}

export interface ExtractedScrapResponse {
  turno?: string;
  linea?: string;
  motivo?: string;
  pesoKg?: number;
  costoKg?: number;
  error?: string;
}

export const SHIFT_COLORS: Record<ShiftType, string> = {
  Matutino: '#0284c7',
  Vespertino: '#d97706',
  Nocturno: '#dc2626',
};

export const INITIAL_SCRAP_RECORDS: ScrapRecord[] = [
  {
    id: 'scr-01',
    turno: 'Matutino',
    linea: 'Línea 1 · Estampado',
    motivo: 'Desalineación de troquel',
    kg: 124.5,
    costoPorKg: 130.0,
    costo: 16185.0,
  },
  {
    id: 'scr-02',
    turno: 'Matutino',
    linea: 'Línea 2 · Inyección',
    motivo: 'Burbuja / Rechupado',
    kg: 96.0,
    costoPorKg: 130.0,
    costo: 12480.0,
  },
  {
    id: 'scr-03',
    turno: 'Vespertino',
    linea: 'Línea 1 · Estampado',
    motivo: 'Rebaba / Exceso de material',
    kg: 158.2,
    costoPorKg: 130.0,
    costo: 20566.0,
  },
  {
    id: 'scr-04',
    turno: 'Vespertino',
    linea: 'Línea 3 · Ensamble',
    motivo: 'Falla de acabado superficial',
    kg: 112.8,
    costoPorKg: 130.0,
    costo: 14664.0,
  },
  {
    id: 'scr-05',
    turno: 'Nocturno',
    linea: 'Línea 2 · Inyección',
    motivo: 'Calibración de arranque',
    kg: 184.0,
    costoPorKg: 130.0,
    costo: 23920.0,
  },
  {
    id: 'scr-06',
    turno: 'Nocturno',
    linea: 'Línea 4 · Termoformado',
    motivo: 'Deformación térmica',
    kg: 149.5,
    costoPorKg: 130.0,
    costo: 19435.0,
  },
];
