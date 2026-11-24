import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { ModuleBuilder } from './components/module-builder';
import { ScrapPieChart } from './components/scrap-pie-chart';
import {
  DEFECT_REASONS,
  ExtractedScrapResponse,
  INITIAL_SCRAP_RECORDS,
  PRODUCTION_LINES,
  SHIFT_COLORS,
  ScrapRecord,
  ShiftSummary,
  ShiftType,
} from './models/scrap.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatIconModule,
    ScrapPieChart,
    ModuleBuilder,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('photoFileInput');
  private readonly lineaSelect = viewChild<ElementRef<HTMLSelectElement>>('lineaSelectEl');

  readonly activeTab = signal<'dashboard' | 'builder'>('dashboard');

  readonly shifts: readonly ShiftType[] = [
    'Matutino',
    'Vespertino',
    'Nocturno',
  ];
  readonly productionLines: readonly string[] = PRODUCTION_LINES;
  readonly defectReasons: readonly string[] = DEFECT_REASONS;
  readonly shiftFilters: readonly (ShiftType | 'Todos')[] = [
    'Todos',
    'Matutino',
    'Vespertino',
    'Nocturno',
  ];

  readonly records = signal<ScrapRecord[]>(INITIAL_SCRAP_RECORDS);
  readonly selectedShift = signal<ShiftType | 'Todos'>('Todos');
  readonly searchQuery = signal<string>('');
  readonly isHtmlModalOpen = signal<boolean>(false);
  readonly copiedHtml = signal<boolean>(false);

  readonly formKgValue = signal<number>(0);
  readonly formCostoPorKgValue = signal<number>(130);
  readonly justRegisteredMessage = signal<string | null>(null);

  readonly isExtractingPhoto = signal<boolean>(false);
  readonly photoPreviewUrl = signal<string | null>(null);
  readonly extractionError = signal<string | null>(null);
  readonly extractionSuccessNote = signal<string | null>(null);

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  readonly recordForm = new FormGroup({
    turno: new FormControl<ShiftType>('Matutino', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    linea: new FormControl<string>(PRODUCTION_LINES[0], {
      nonNullable: true,
      validators: [Validators.required],
    }),
    motivo: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    kg: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(0.1)],
    }),
    costoPorKg: new FormControl<number | null>(130, {
      validators: [Validators.required, Validators.min(0.1)],
    }),
  });

  readonly estimatedTotalCost = computed(() => {
    const kg = this.formKgValue();
    const rate = this.formCostoPorKgValue();
    if (!Number.isFinite(kg) || !Number.isFinite(rate) || kg <= 0 || rate <= 0) {
      return 0;
    }
    return kg * rate;
  });

  readonly filteredRecords = computed(() => {
    const shift = this.selectedShift();
    const query = this.searchQuery().trim().toLowerCase();

    return this.records().filter((item) => {
      const matchesShift = shift === 'Todos' || item.turno === shift;
      const matchesQuery =
        query === '' ||
        item.linea.toLowerCase().includes(query) ||
        item.turno.toLowerCase().includes(query) ||
        item.motivo.toLowerCase().includes(query);
      return matchesShift && matchesQuery;
    });
  });

  readonly shiftSummaries = computed<ShiftSummary[]>(() => {
    const allRecords = this.records();
    const grandTotalCosto = allRecords.reduce((sum, r) => sum + r.costo, 0);

    return this.shifts.map((turno) => {
      const shiftItems = allRecords.filter((r) => r.turno === turno);
      const totalKg = shiftItems.reduce((sum, r) => sum + r.kg, 0);
      const totalCosto = shiftItems.reduce((sum, r) => sum + r.costo, 0);
      const porcentaje =
        grandTotalCosto > 0 ? (totalCosto / grandTotalCosto) * 100 : 0;

      return {
        turno,
        totalKg,
        totalCosto,
        porcentaje,
        color: SHIFT_COLORS[turno],
      };
    });
  });

  readonly totalFilteredKg = computed(() =>
    this.filteredRecords().reduce((sum, item) => sum + item.kg, 0)
  );

  readonly totalFilteredCosto = computed(() =>
    this.filteredRecords().reduce((sum, item) => sum + item.costo, 0)
  );

  readonly totalGlobalKg = computed(() =>
    this.records().reduce((sum, item) => sum + item.kg, 0)
  );

  readonly totalGlobalCosto = computed(() =>
    this.records().reduce((sum, item) => sum + item.costo, 0)
  );

  readonly highestCostShift = computed(() => {
    const summaries = this.shiftSummaries();
    let top = summaries[0];
    for (const current of summaries) {
      if (current.totalCosto > top.totalCosto) {
        top = current;
      }
    }
    return top;
  });

  readonly cleanHtmlSnippet = computed(() => {
    const rows = this.filteredRecords()
      .map(
        (r) => `          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 text-sm font-medium text-slate-800">${r.turno}</td>
            <td class="px-4 py-3 text-sm text-slate-700">${r.linea}</td>
            <td class="px-4 py-3 text-sm font-mono tabular-nums text-right text-slate-700">${r.kg.toFixed(1)} kg</td>
            <td class="px-4 py-3 text-sm font-mono tabular-nums font-semibold text-right text-slate-900">$${r.costo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>`
      )
      .join('\n');

    return `<div class="min-h-screen bg-slate-50 p-4 sm:p-8 text-slate-900">
  <div class="mx-auto max-w-6xl">
    <div class="mb-6 border-b border-slate-200 pb-4">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-center">
        REPORTE DE SCRAP POR TURNO
      </h1>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <div class="lg:col-span-5 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-6">
        <div class="flex flex-1 items-center justify-center py-4">
          <div class="w-full max-w-[300px] aspect-square flex items-center justify-center">
            <canvas id="scrapPieChart" class="w-full h-full"></canvas>
          </div>
        </div>
        <div class="border-t border-slate-100 pt-4 text-center">
          <p class="text-sm font-semibold text-slate-700">
            Gráfico Pastel: Costo Scrap por turno
          </p>
        </div>
      </div>

      <div class="lg:col-span-7 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div class="border-b border-slate-200 bg-slate-100/70 px-4 py-3 text-center">
          <h2 class="text-sm font-bold tracking-wider text-slate-800 uppercase">
            TABLA RESUMEN
          </h2>
        </div>
        <div class="overflow-x-auto flex-1">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th class="px-4 py-3">Turno</th>
                <th class="px-4 py-3">Línea</th>
                <th class="px-4 py-3 text-right">Kg</th>
                <th class="px-4 py-3 text-right">Costo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
${rows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>`;
  });

  constructor() {
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchQuery.set(value);
    });

    this.recordForm.controls.kg.valueChanges.subscribe((value) => {
      this.formKgValue.set(typeof value === 'number' ? value : 0);
    });

    this.recordForm.controls.costoPorKg.valueChanges.subscribe((value) => {
      this.formCostoPorKgValue.set(typeof value === 'number' ? value : 0);
    });
  }

  getShiftColor(turno: ShiftType): string {
    return SHIFT_COLORS[turno];
  }

  selectShiftFilter(filter: ShiftType | 'Todos'): void {
    this.selectedShift.set(filter);
  }

  resetFilters(): void {
    this.selectedShift.set('Todos');
    this.searchControl.setValue('');
    this.searchQuery.set('');
  }

  setActiveTab(tab: 'dashboard' | 'builder'): void {
    this.activeTab.set(tab);
  }

  focusRegistrationForm(): void {
    this.activeTab.set('dashboard');
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const section = document.getElementById('registro-merma');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.lineaSelect()?.nativeElement.focus();
    }, 30);
  }

  triggerPhotoUpload(): void {
    this.fileInput()?.nativeElement.click();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (!file) return;

    inputEl.value = '';

    this.extractionError.set(null);
    this.extractionSuccessNote.set(null);
    this.justRegisteredMessage.set(null);

    const detectedMime = this.resolveImageMimeType(file);
    if (!detectedMime) {
      this.extractionError.set(
        'Formato no soportado. Selecciona una imagen JPEG, JPG, PNG o WebP.'
      );
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      this.extractionError.set(
        'La imagen supera el límite de 8 MB. Intenta con una foto más ligera.'
      );
      return;
    }

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      this.photoPreviewUrl.set(dataUrl);

      const commaIndex = dataUrl.indexOf(',');
      const base64Data =
        commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;

      this.isExtractingPhoto.set(true);

      const rawBody = await firstValueFrom(
        this.http.post(
          '/api/extract-scrap',
          {
            imageBase64: base64Data,
            mimeType: detectedMime,
          },
          { responseType: 'text' }
        )
      );

      const cleanedBody = rawBody
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let result: ExtractedScrapResponse;
      try {
        result = JSON.parse(cleanedBody) as ExtractedScrapResponse;
      } catch {
        this.extractionError.set(
          'El servidor devolvió una respuesta inesperada al analizar la imagen.'
        );
        return;
      }

      if (result.error) {
        this.extractionError.set(result.error);
        return;
      }

      const normalizedShift = this.normalizeShift(result.turno);
      const normalizedLine = this.normalizeLine(result.linea);
      const pesoKg =
        typeof result.pesoKg === 'number' &&
        Number.isFinite(result.pesoKg) &&
        result.pesoKg > 0
          ? Number(result.pesoKg.toFixed(2))
          : null;
      const costoKg =
        typeof result.costoKg === 'number' &&
        Number.isFinite(result.costoKg) &&
        result.costoKg > 0
          ? Number(result.costoKg.toFixed(2))
          : null;

      const motivo =
        typeof result.motivo === 'string' && result.motivo.trim().length > 0
          ? result.motivo.trim()
          : 'Merma registrada por formato físico';

      this.recordForm.patchValue({
        turno: normalizedShift,
        linea: normalizedLine,
        motivo,
        kg: pesoKg ?? this.recordForm.controls.kg.value,
        costoPorKg: costoKg ?? this.recordForm.controls.costoPorKg.value,
      });

      this.formKgValue.set(this.recordForm.controls.kg.value ?? 0);
      this.formCostoPorKgValue.set(
        this.recordForm.controls.costoPorKg.value ?? 0
      );

      const finalPeso = this.recordForm.controls.kg.value ?? 0;
      const finalCostoKg = this.recordForm.controls.costoPorKg.value ?? 0;
      this.extractionSuccessNote.set(
        `Extraído: ${normalizedShift} · ${normalizedLine} · ${finalPeso} kg × $${finalCostoKg}/kg`
      );
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        let errorMsg = `Error al analizar la imagen (HTTP ${err.status}).`;
        if (typeof err.error === 'string') {
          try {
            const parsedErr = JSON.parse(err.error) as { error?: string };
            if (parsedErr.error) errorMsg = parsedErr.error;
          } catch {
            // Keep HTTP fallback message
          }
        }
        this.extractionError.set(errorMsg);
      } else {
        this.extractionError.set(
          'No se pudo conectar con el servicio de análisis de imagen. Inténtalo de nuevo.'
        );
      }
    } finally {
      this.isExtractingPhoto.set(false);
    }
  }

  private resolveImageMimeType(file: File): string | null {
    const allowed = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]);
    const type = file.type.toLowerCase().trim();
    if (allowed.has(type)) {
      return type;
    }

    const name = file.name.toLowerCase();
    if (name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.jpg')) return 'image/jpg';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    return null;
  }

  clearPhotoExtraction(): void {
    this.photoPreviewUrl.set(null);
    this.extractionError.set(null);
    this.extractionSuccessNote.set(null);
  }

  submitRecord(): void {
    this.justRegisteredMessage.set(null);

    if (this.recordForm.invalid) {
      this.recordForm.markAllAsTouched();
      return;
    }

    const raw = this.recordForm.getRawValue();
    if (raw.kg === null || raw.costoPorKg === null) return;

    const kg = Number(raw.kg);
    const costoPorKg = Number(raw.costoPorKg);
    const totalCosto = Number((kg * costoPorKg).toFixed(2));

    const newRecord: ScrapRecord = {
      id: `scr-${Date.now()}`,
      turno: raw.turno,
      linea: raw.linea,
      motivo: raw.motivo.trim(),
      kg,
      costoPorKg,
      costo: totalCosto,
    };

    this.records.update((list) => [newRecord, ...list]);
    this.recordForm.reset({
      turno: raw.turno,
      linea: raw.linea,
      motivo: '',
      kg: null,
      costoPorKg: costoPorKg,
    });
    this.formKgValue.set(0);
    this.formCostoPorKgValue.set(costoPorKg);
    this.extractionSuccessNote.set(null);
    this.photoPreviewUrl.set(null);
    this.justRegisteredMessage.set(
      `Merma registrada en ${newRecord.linea} (${newRecord.turno}): ${newRecord.kg.toFixed(1)} kg.`
    );
  }

  removeRecord(id: string): void {
    this.records.update((list) => list.filter((item) => item.id !== id));
  }

  openHtmlModal(): void {
    this.copiedHtml.set(false);
    this.isHtmlModalOpen.set(true);
  }

  closeHtmlModal(): void {
    this.isHtmlModalOpen.set(false);
  }

  async copyHtmlCode(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      await navigator.clipboard.writeText(this.cleanHtmlSnippet());
      this.copiedHtml.set(true);
    } catch {
      this.copiedHtml.set(false);
    }
  }

  exportCsv(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const header = ['Turno', 'Línea', 'Defecto/Motivo', 'Kg', 'Costo/Kg', 'Costo Total'];
    const rows = this.filteredRecords().map((r) => [
      r.turno,
      `"${r.linea.replaceAll('"', '""')}"`,
      `"${r.motivo.replaceAll('"', '""')}"`,
      r.kg.toFixed(2),
      r.costoPorKg.toFixed(2),
      r.costo.toFixed(2),
    ]);

    const csvContent = [
      header.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reporte-scrap-por-turno.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('No se pudo leer la imagen'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Error al leer archivo'));
      reader.readAsDataURL(file);
    });
  }

  private normalizeShift(rawShift: string | undefined): ShiftType {
    const val = (rawShift ?? '').toLowerCase();
    if (val.includes('vesp') || val.includes('tarde') || val.includes('2')) {
      return 'Vespertino';
    }
    if (val.includes('noct') || val.includes('noche') || val.includes('3')) {
      return 'Nocturno';
    }
    return 'Matutino';
  }

  private normalizeLine(rawLine: string | undefined): string {
    const val = (rawLine ?? '').toLowerCase();
    if (val.includes('2') || val.includes('inyec')) {
      return PRODUCTION_LINES[1];
    }
    if (val.includes('3') || val.includes('ensamb')) {
      return PRODUCTION_LINES[2];
    }
    if (val.includes('4') || val.includes('termo')) {
      return PRODUCTION_LINES[3];
    }
    return PRODUCTION_LINES[0];
  }
}
