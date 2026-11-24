import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import type { Chart as ChartInstance } from 'chart.js';

export interface SavedModuleRecord {
  id: string;
  name: string;
  htmlCode: string;
  hasPieChart: boolean;
  chartTitle: string;
  chartLabels: string[];
  chartValues: number[];
  createdAt: string;
}

interface GenerateModuleResponse {
  moduleTitle?: string;
  htmlCode?: string;
  hasPieChart?: boolean;
  chartTitle?: string;
  chartLabels?: string[];
  chartValues?: number[];
  error?: string;
}

const STORAGE_KEY = 'industrial_modules_db_v1';

const STARTER_HTML = `<div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-6">
  <div class="border-b border-slate-200 pb-4 flex items-center justify-between">
    <div>
      <h2 class="text-lg font-bold text-slate-900">Control de Eficiencia y Mermas por Línea</h2>
      <p class="text-xs text-slate-500">Vista previa inicial del constructor · Sube un boceto para regenerar con IA</p>
    </div>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
    <div class="md:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center">
      <div class="w-full max-w-xs aspect-square flex items-center justify-center">
        <canvas data-chart="pie" class="w-full h-full"></canvas>
      </div>
      <p class="mt-3 text-xs font-semibold text-slate-700 text-center">Gráfico Pastel: Distribución por Turno</p>
    </div>
    <div class="md:col-span-7 border border-slate-200 rounded-xl overflow-hidden">
      <table class="w-full border-collapse text-left">
        <thead>
          <tr class="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-600">
            <th class="px-4 py-3">Turno</th>
            <th class="px-4 py-3">Línea</th>
            <th class="px-4 py-3 text-right">Kg</th>
            <th class="px-4 py-3 text-right">Costo</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 text-sm">
          <tr>
            <td class="px-4 py-3 font-medium text-slate-900">Matutino</td>
            <td class="px-4 py-3 text-slate-700">Línea 1 · Estampado</td>
            <td class="px-4 py-3 font-mono tabular-nums text-right text-slate-700">124.5 kg</td>
            <td class="px-4 py-3 font-mono tabular-nums font-semibold text-right text-slate-900">$16,185.00</td>
          </tr>
          <tr>
            <td class="px-4 py-3 font-medium text-slate-900">Vespertino</td>
            <td class="px-4 py-3 text-slate-700">Línea 2 · Inyección</td>
            <td class="px-4 py-3 font-mono tabular-nums text-right text-slate-700">158.2 kg</td>
            <td class="px-4 py-3 font-mono tabular-nums font-semibold text-right text-slate-900">$20,566.00</td>
          </tr>
          <tr>
            <td class="px-4 py-3 font-medium text-slate-900">Nocturno</td>
            <td class="px-4 py-3 text-slate-700">Línea 4 · Termoformado</td>
            <td class="px-4 py-3 font-mono tabular-nums text-right text-slate-700">184.0 kg</td>
            <td class="px-4 py-3 font-mono tabular-nums font-semibold text-right text-slate-900">$23,920.00</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`;

@Component({
  selector: 'app-module-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            CONSTRUCTOR DE MÓDULOS (IA)
          </h1>
          <p class="mt-1.5 text-sm text-slate-600">
            Sube la foto de un boceto o wireframe industrial para generar su interfaz HTML/Tailwind, previsualizarla con Chart.js y guardarla en la base de datos local.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3 shrink-0">
          <input
            #sketchFileInput
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            (change)="onSketchSelected($event)"
            class="hidden"
            aria-label="Subir boceto o wireframe industrial"
          />
          <button
            type="button"
            (click)="triggerSketchUpload()"
            [disabled]="isGenerating()"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <mat-icon class="text-[16px]! h-4! w-4! leading-4!">
              {{ isGenerating() ? 'hourglass_top' : 'upload_file' }}
            </mat-icon>
            <span>{{ isGenerating() ? 'Generando módulo...' : 'Subir Boceto / Wireframe' }}</span>
          </button>

          <button
            type="button"
            (click)="saveModuleToDb()"
            class="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <mat-icon class="text-[16px]! h-4! w-4! leading-4!">save</mat-icon>
            <span>Guardar Módulo en BD</span>
          </button>
        </div>
      </div>

      <section class="rounded-xl border border-slate-200 bg-white p-5">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div class="md:col-span-6">
            <label for="module-name-input" class="block text-xs font-semibold text-slate-700">
              Nombre del Módulo Industrial
            </label>
            <input
              id="module-name-input"
              type="text"
              [formControl]="moduleNameControl"
              placeholder="Ej. Reporte de Paros por Línea"
              class="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div class="md:col-span-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pb-1">
            <div class="flex items-center gap-2">
              @if (chartInjectedCount() > 0) {
                <span class="font-medium text-emerald-700">
                  Chart.js inyectado automáticamente en {{ chartInjectedCount() }} gráfico(s) de pastel
                </span>
              } @else {
                <span class="text-slate-500">
                  Sin elementos &lt;canvas&gt; detectados en el código actual
                </span>
              }
            </div>

            @if (statusMessage(); as status) {
              <span class="font-medium text-sky-700">{{ status }}</span>
            }
          </div>
        </div>

        @if (isGenerating() || sketchPreviewUrl() || generationError()) {
          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div class="flex items-center gap-3 min-w-0">
              @if (sketchPreviewUrl(); as preview) {
                <img
                  [src]="preview"
                  alt="Vista previa del boceto cargado"
                  referrerpolicy="no-referrer"
                  class="h-14 w-14 rounded-md border border-slate-200 object-cover shrink-0"
                />
              }
              <div class="min-w-0">
                @if (isGenerating()) {
                  <p class="text-xs font-semibold text-slate-900">
                    Analizando wireframe con Gemini 2.5 Flash...
                  </p>
                  <p class="text-xs text-slate-500">
                    Generando estructura responsiva HTML/Tailwind y datos de gráfico.
                  </p>
                } @else if (generationError(); as err) {
                  <p class="text-xs font-semibold text-red-700">
                    No se pudo generar el módulo
                  </p>
                  <p class="text-xs text-red-600">{{ err }}</p>
                } @else {
                  <p class="text-xs font-semibold text-emerald-800">
                    Boceto interpretado y renderizado en vivo
                  </p>
                  <p class="text-xs text-slate-600">
                    Puedes editar el código HTML a la izquierda o guardarlo en la base de datos local.
                  </p>
                }
              </div>
            </div>

            @if (!isGenerating()) {
              <button
                type="button"
                (click)="dismissSketchBanner()"
                aria-label="Cerrar vista previa del boceto"
                class="rounded-md p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 self-start sm:self-center cursor-pointer"
              >
                <mat-icon class="text-[18px]! h-[18px]! w-[18px]! leading-[18px]!">close</mat-icon>
              </button>
            }
          </div>
        }
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section class="lg:col-span-5 flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/70 px-5 py-3.5">
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800">
              Código HTML / Tailwind Generado
            </h2>
            <button
              type="button"
              (click)="copyGeneratedHtml()"
              class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <mat-icon class="text-[14px]! h-3.5! w-3.5! leading-3.5!">
                {{ copied() ? 'check' : 'content_copy' }}
              </mat-icon>
              <span>{{ copied() ? 'Copiado' : 'Copiar' }}</span>
            </button>
          </div>
          <div class="flex-1 flex flex-col bg-slate-950 p-4">
            <textarea
              [formControl]="htmlCodeControl"
              aria-label="Código HTML y Tailwind CSS generado"
              spellcheck="false"
              rows="20"
              class="h-full min-h-[420px] w-full flex-1 resize-none bg-transparent font-mono text-xs leading-relaxed text-slate-100 focus:outline-none"
            ></textarea>
          </div>
        </section>

        <section class="lg:col-span-7 flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/70 px-5 py-3.5">
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800">
              Renderizado Dinámico en Vivo
            </h2>
            <span class="text-xs text-slate-500 font-mono">
              Tailwind + Chart.js
            </span>
          </div>
          <div
            #livePreviewHost
            [innerHTML]="safePreviewHtml()"
            class="flex-1 bg-slate-50/70 p-4 sm:p-6 overflow-auto"
          ></div>
        </section>
      </div>

      <section class="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div class="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-100/70 px-6 py-4">
          <div>
            <h2 class="text-sm font-bold uppercase tracking-wider text-slate-900">
              Módulos Guardados en BD (localStorage)
            </h2>
            <p class="mt-0.5 text-xs text-slate-500">
              Selecciona cualquier módulo almacenado para recargarlo en el editor y vista previa.
            </p>
          </div>
          <span class="font-mono tabular-nums text-xs text-slate-500">
            {{ savedModules().length }} guardados
          </span>
        </div>

        @if (savedModules().length > 0) {
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th scope="col" class="px-6 py-3">Nombre del Módulo</th>
                  <th scope="col" class="px-6 py-3">Visualización</th>
                  <th scope="col" class="px-6 py-3">Fecha de Guardado</th>
                  <th scope="col" class="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                @for (mod of savedModules(); track mod.id) {
                  <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="px-6 py-3.5 text-sm font-semibold text-slate-900">
                      {{ mod.name }}
                    </td>
                    <td class="px-6 py-3.5 text-xs text-slate-600">
                      {{ mod.hasPieChart ? 'Incluye Gráfico Pastel (Chart.js)' : 'Estructura HTML / Tabla' }}
                    </td>
                    <td class="px-6 py-3.5 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {{ mod.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                    </td>
                    <td class="px-6 py-3.5 text-right whitespace-nowrap">
                      <div class="inline-flex items-center gap-2">
                        <button
                          type="button"
                          (click)="loadModule(mod)"
                          class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <mat-icon class="text-[15px]! h-[15px]! w-[15px]! leading-[15px]!">
                            open_in_new
                          </mat-icon>
                          <span>Cargar</span>
                        </button>
                        <button
                          type="button"
                          (click)="deleteSavedModule(mod.id)"
                          [attr.aria-label]="'Eliminar módulo ' + mod.name"
                          class="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <mat-icon class="text-[18px]! h-[18px]! w-[18px]! leading-[18px]!">
                            delete_outline
                          </mat-icon>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="px-6 py-12 text-center">
            <mat-icon class="text-[32px]! h-8! w-8! leading-8! text-slate-300">
              inventory_2
            </mat-icon>
            <p class="mt-2 text-sm font-medium text-slate-700">
              Aún no hay módulos guardados en la base de datos local
            </p>
            <p class="mt-1 text-xs text-slate-500">
              Sube un boceto o edita el HTML actual y presiona "Guardar Módulo en BD".
            </p>
          </div>
        }
      </section>
    </div>
  `,
})
export class ModuleBuilder implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly sketchFileInput = viewChild<ElementRef<HTMLInputElement>>('sketchFileInput');
  private readonly livePreviewHost = viewChild<ElementRef<HTMLDivElement>>('livePreviewHost');

  readonly moduleNameControl = new FormControl<string>('Control de Eficiencia y Mermas', {
    nonNullable: true,
  });
  readonly htmlCodeControl = new FormControl<string>(STARTER_HTML, {
    nonNullable: true,
  });

  readonly currentHtml = signal<string>(STARTER_HTML);
  readonly currentHasPieChart = signal<boolean>(true);
  readonly currentChartTitle = signal<string>('Distribución por Turno');
  readonly currentChartLabels = signal<string[]>([
    'Turno Matutino',
    'Turno Vespertino',
    'Turno Nocturno',
  ]);
  readonly currentChartValues = signal<number[]>([16185, 20566, 23920]);

  readonly isGenerating = signal<boolean>(false);
  readonly sketchPreviewUrl = signal<string | null>(null);
  readonly generationError = signal<string | null>(null);
  readonly statusMessage = signal<string | null>(null);
  readonly copied = signal<boolean>(false);
  readonly chartInjectedCount = signal<number>(0);

  readonly savedModules = signal<SavedModuleRecord[]>([]);

  readonly safePreviewHtml = computed<SafeHtml>(() => {
    const cleaned = this.stripUnsafeTags(this.currentHtml());
    return this.sanitizer.bypassSecurityTrustHtml(cleaned);
  });

  private activeCharts: ChartInstance[] = [];
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.savedModules.set(this.readModulesFromStorage());
    }

    this.htmlCodeControl.valueChanges.subscribe((value) => {
      this.currentHtml.set(value);
      this.currentHasPieChart.set(value.toLowerCase().includes('<canvas'));
    });

    effect(() => {
      const html = this.currentHtml();
      const labels = this.currentChartLabels();
      const values = this.currentChartValues();
      const title = this.currentChartTitle();
      const host = this.livePreviewHost();

      if (!isPlatformBrowser(this.platformId) || !host) {
        return;
      }

      if (this.renderTimer !== null) {
        clearTimeout(this.renderTimer);
      }

      this.renderTimer = setTimeout(() => {
        void this.injectChartJsIntoPreview(host.nativeElement, html, title, labels, values);
      }, 30);
    });
  }

  ngOnDestroy(): void {
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
    }
    this.destroyCharts();
  }

  triggerSketchUpload(): void {
    this.sketchFileInput()?.nativeElement.click();
  }

  async onSketchSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (!file) return;

    inputEl.value = '';
    this.generationError.set(null);
    this.statusMessage.set(null);

    const detectedMime = this.resolveImageMimeType(file);
    if (!detectedMime) {
      this.generationError.set(
        'Formato no soportado. Selecciona una imagen JPEG, JPG, PNG o WebP.'
      );
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      this.generationError.set(
        'La imagen supera el límite de 8 MB. Intenta con una captura más ligera.'
      );
      return;
    }

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      this.sketchPreviewUrl.set(dataUrl);

      const commaIndex = dataUrl.indexOf(',');
      const base64Data =
        commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;

      this.isGenerating.set(true);

      const rawResponse = await firstValueFrom(
        this.http.post(
          '/api/generate-module',
          {
            imageBase64: base64Data,
            mimeType: detectedMime,
          },
          { responseType: 'text' }
        )
      );

      const cleanedJson = rawResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(cleanedJson) as GenerateModuleResponse;
      if (parsed.error) {
        this.generationError.set(parsed.error);
        return;
      }

      const generatedHtml = (parsed.htmlCode ?? '')
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      if (!generatedHtml) {
        this.generationError.set(
          'Gemini no devolvió código HTML válido para esta imagen.'
        );
        return;
      }

      const title = parsed.moduleTitle?.trim() || 'Módulo Industrial Generado';
      const labels =
        Array.isArray(parsed.chartLabels) && parsed.chartLabels.length > 0
          ? parsed.chartLabels
          : ['Turno Matutino', 'Turno Vespertino', 'Turno Nocturno'];
      const values =
        Array.isArray(parsed.chartValues) && parsed.chartValues.length > 0
          ? parsed.chartValues
          : [28, 35, 37];

      this.moduleNameControl.setValue(title);
      this.currentChartTitle.set(parsed.chartTitle?.trim() || title);
      this.currentChartLabels.set(labels);
      this.currentChartValues.set(values);
      this.currentHasPieChart.set(
        Boolean(parsed.hasPieChart) || generatedHtml.toLowerCase().includes('<canvas')
      );
      this.htmlCodeControl.setValue(generatedHtml);
      this.currentHtml.set(generatedHtml);
      this.statusMessage.set('Módulo generado con Gemini 2.5 Flash.');
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        let errorMsg = `Error del servidor (HTTP ${err.status}).`;
        if (typeof err.error === 'string') {
          try {
            const parsedErr = JSON.parse(err.error) as { error?: string };
            if (parsedErr.error) errorMsg = parsedErr.error;
          } catch {
            // Keep HTTP status fallback
          }
        }
        this.generationError.set(errorMsg);
      } else {
        this.generationError.set(
          'No se pudo procesar la imagen del boceto. Inténtalo de nuevo.'
        );
      }
    } finally {
      this.isGenerating.set(false);
    }
  }

  dismissSketchBanner(): void {
    this.sketchPreviewUrl.set(null);
    this.generationError.set(null);
  }

  saveModuleToDb(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const name = this.moduleNameControl.value.trim() || 'Módulo sin título';
    const htmlCode = this.currentHtml().trim();
    if (!htmlCode) {
      this.statusMessage.set('No hay código HTML para guardar.');
      return;
    }

    const record: SavedModuleRecord = {
      id: `mod-${Date.now()}`,
      name,
      htmlCode,
      hasPieChart:
        this.currentHasPieChart() || htmlCode.toLowerCase().includes('<canvas'),
      chartTitle: this.currentChartTitle(),
      chartLabels: this.currentChartLabels(),
      chartValues: this.currentChartValues(),
      createdAt: new Date().toISOString(),
    };

    const updated = [record, ...this.savedModules()];
    this.savedModules.set(updated);
    this.writeModulesToStorage(updated);
    this.statusMessage.set(`Módulo "${name}" guardado en BD.`);
  }

  loadModule(mod: SavedModuleRecord): void {
    this.moduleNameControl.setValue(mod.name);
    this.currentChartTitle.set(mod.chartTitle || mod.name);
    this.currentChartLabels.set(
      mod.chartLabels.length > 0
        ? mod.chartLabels
        : ['Turno Matutino', 'Turno Vespertino', 'Turno Nocturno']
    );
    this.currentChartValues.set(
      mod.chartValues.length > 0 ? mod.chartValues : [28, 35, 37]
    );
    this.currentHasPieChart.set(mod.hasPieChart);
    this.htmlCodeControl.setValue(mod.htmlCode);
    this.currentHtml.set(mod.htmlCode);
    this.statusMessage.set(`Módulo "${mod.name}" cargado en vista previa.`);
  }

  deleteSavedModule(id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const updated = this.savedModules().filter((m) => m.id !== id);
    this.savedModules.set(updated);
    this.writeModulesToStorage(updated);
    this.statusMessage.set('Módulo eliminado de BD.');
  }

  async copyGeneratedHtml(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      await navigator.clipboard.writeText(this.currentHtml());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      this.copied.set(false);
    }
  }

  private async injectChartJsIntoPreview(
    hostEl: HTMLElement,
    html: string,
    title: string,
    labels: string[],
    values: number[]
  ): Promise<void> {
    this.destroyCharts();

    const canvases = hostEl.querySelectorAll('canvas');
    if (canvases.length === 0) {
      this.chartInjectedCount.set(0);
      return;
    }

    const shouldRenderPie =
      this.currentHasPieChart() || html.toLowerCase().includes('<canvas');
    if (!shouldRenderPie) {
      this.chartInjectedCount.set(0);
      return;
    }

    const { default: Chart } = await import('chart.js/auto');
    const palette = ['#0284c7', '#d97706', '#dc2626', '#059669', '#475569'];

    let count = 0;
    canvases.forEach((canvasEl) => {
      const ctx = canvasEl.getContext('2d');
      if (!ctx) return;

      const chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels,
          datasets: [
            {
              label: title,
              data: values,
              backgroundColor: labels.map((_, idx) => palette[idx % palette.length]),
              borderColor: '#ffffff',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                font: {
                  family: "'DM Sans', sans-serif",
                  size: 11,
                },
              },
            },
          },
        },
      });
      this.activeCharts.push(chart);
      count += 1;
    });

    this.chartInjectedCount.set(count);
  }

  private destroyCharts(): void {
    for (const chart of this.activeCharts) {
      chart.destroy();
    }
    this.activeCharts = [];
  }

  private stripUnsafeTags(raw: string): string {
    return raw.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }

  private readModulesFromStorage(): SavedModuleRecord[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SavedModuleRecord[]) : [];
    } catch {
      return [];
    }
  }

  private writeModulesToStorage(modules: SavedModuleRecord[]): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
    } catch {
      // Ignore storage quota errors cleanly
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
    if (allowed.has(type)) return type;

    const name = file.name.toLowerCase();
    if (name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.jpg')) return 'image/jpg';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    return null;
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
}
