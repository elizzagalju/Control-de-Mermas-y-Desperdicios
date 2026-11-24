import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { ShiftSummary, ShiftType } from '../models/scrap.model';

interface SliceGeometry {
  turno: ShiftType;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  color: string;
  porcentaje: number;
  totalCosto: number;
}

@Component({
  selector: 'app-scrap-pie-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <div class="flex h-full flex-col justify-between bg-white border border-slate-200 rounded-xl p-6">
      <div class="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 class="text-base font-semibold text-slate-900">
            Gráfico Pastel: Costo Scrap por turno
          </h2>
          <p class="mt-1 text-xs text-slate-500">
            Distribución porcentual del costo de merma operativa
          </p>
        </div>
        @if (selectedShift() !== 'Todos') {
          <button
            type="button"
            (click)="shiftSelected.emit('Todos')"
            class="text-xs font-medium text-sky-700 hover:text-sky-900 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver todos
          </button>
        }
      </div>

      <div class="relative my-6 flex flex-1 flex-col items-center justify-center">
        @if (hasData()) {
          <div class="relative flex w-full max-w-[300px] aspect-square items-center justify-center">
            <canvas
              #pieCanvas
              (mousemove)="onCanvasMouseMove($event)"
              (mouseleave)="onCanvasMouseLeave()"
              (click)="onCanvasClick($event)"
              class="h-full w-full cursor-pointer"
              aria-label="Gráfico Pastel: Costo Scrap por turno"
            ></canvas>
          </div>

          @if (hoveredSummary(); as active) {
            <div
              class="mt-3 flex items-center gap-3 border border-slate-200 bg-slate-50 px-3 py-1.5 rounded-lg text-xs text-slate-700"
            >
              <span
                class="inline-block h-2.5 w-2.5 rounded-xs shrink-0"
                [style.background-color]="active.color"
              ></span>
              <span class="font-semibold text-slate-900">Turno {{ active.turno }}</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums font-medium">
                {{ active.totalCosto | currency: 'MXN' : 'symbol-narrow' : '1.0-0' }}
              </span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums text-slate-600">
                {{ active.porcentaje | number: '1.1-1' }}%
              </span>
            </div>
          } @else {
            <div class="mt-3 py-1.5 text-xs text-slate-500">
              Haz clic en un segmento para filtrar la tabla resumen
            </div>
          }
        } @else {
          <div
            class="flex h-64 w-full flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-center p-6"
          >
            <p class="text-sm font-medium text-slate-700">Sin datos de costo para graficar</p>
            <p class="mt-1 text-xs text-slate-500">
              Ajusta los filtros o registra una nueva merma para visualizar el pastel.
            </p>
          </div>
        }
      </div>

      <div class="border-t border-slate-100 pt-4">
        <div class="space-y-2">
          @for (item of summaries(); track item.turno) {
            <button
              type="button"
              (click)="toggleShift(item.turno)"
              (mouseenter)="hoveredShift.set(item.turno)"
              (mouseleave)="hoveredShift.set(null)"
              [class]="
                selectedShift() === item.turno
                  ? 'flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-100/80 px-3 py-2 text-left transition-colors cursor-pointer'
                  : 'flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:bg-slate-50 transition-colors cursor-pointer'
              "
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span
                  class="h-3 w-3 rounded-xs shrink-0"
                  [style.background-color]="item.color"
                ></span>
                <span class="text-sm font-medium text-slate-800 truncate">
                  {{ item.turno }}
                </span>
              </div>
              <div class="flex items-center gap-4 shrink-0 font-mono tabular-nums text-xs">
                <span class="text-slate-500 w-12 text-right">
                  {{ item.porcentaje | number: '1.1-1' }}%
                </span>
                <span class="font-semibold text-slate-900 w-24 text-right">
                  {{ item.totalCosto | currency: 'MXN' : 'symbol-narrow' : '1.0-0' }}
                </span>
              </div>
            </button>
          }
        </div>
        <p class="mt-4 text-center text-xs font-medium tracking-wide text-slate-600">
          Gráfico Pastel: Costo Scrap por turno
        </p>
      </div>
    </div>
  `,
})
export class ScrapPieChart {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly pieCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pieCanvas');

  readonly summaries = input.required<ShiftSummary[]>();
  readonly selectedShift = input<ShiftType | 'Todos'>('Todos');
  readonly shiftSelected = output<ShiftType | 'Todos'>();

  readonly hoveredShift = signal<ShiftType | null>(null);

  readonly hasData = computed(() =>
    this.summaries().some((item) => item.totalCosto > 0)
  );

  readonly hoveredSummary = computed(() => {
    const hovered = this.hoveredShift();
    if (!hovered) return null;
    return this.summaries().find((s) => s.turno === hovered) ?? null;
  });

  private slices: SliceGeometry[] = [];

  constructor() {
    effect(() => {
      const data = this.summaries();
      const selected = this.selectedShift();
      const hovered = this.hoveredShift();
      const canvasRef = this.pieCanvas();

      if (!isPlatformBrowser(this.platformId) || !canvasRef) {
        return;
      }

      this.drawPieChart(canvasRef.nativeElement, data, selected, hovered);
    });
  }

  toggleShift(turno: ShiftType): void {
    this.shiftSelected.emit(this.selectedShift() === turno ? 'Todos' : turno);
  }

  onCanvasMouseMove(event: MouseEvent): void {
    const hit = this.hitTestSlice(event);
    this.hoveredShift.set(hit ? hit.turno : null);
  }

  onCanvasMouseLeave(): void {
    this.hoveredShift.set(null);
  }

  onCanvasClick(event: MouseEvent): void {
    const hit = this.hitTestSlice(event);
    if (hit) {
      this.toggleShift(hit.turno);
    }
  }

  private hitTestSlice(event: MouseEvent): SliceGeometry | null {
    const canvasRef = this.pieCanvas();
    if (!canvasRef || this.slices.length === 0) return null;

    const rect = canvasRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const maxRadius = Math.min(rect.width, rect.height) * 0.42;

    if (dist > maxRadius) return null;

    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) {
      angle += Math.PI * 2;
    }

    for (const slice of this.slices) {
      if (angle >= slice.startAngle && angle <= slice.endAngle) {
        return slice;
      }
    }
    return null;
  }

  private drawPieChart(
    canvas: HTMLCanvasElement,
    data: ShiftSummary[],
    selected: ShiftType | 'Todos',
    hovered: ShiftType | null
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displaySize = canvas.clientWidth || 280;
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, displaySize, displaySize);

    const total = data.reduce((sum, item) => sum + item.totalCosto, 0);
    if (total <= 0) {
      this.slices = [];
      return;
    }

    const cx = displaySize / 2;
    const cy = displaySize / 2;
    const baseRadius = displaySize * 0.39;

    let currentAngle = -Math.PI / 2;
    const computedSlices: SliceGeometry[] = [];

    for (const item of data) {
      if (item.totalCosto <= 0) continue;
      const sliceAngle = (item.totalCosto / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      const midAngle = startAngle + sliceAngle / 2;

      computedSlices.push({
        turno: item.turno,
        startAngle,
        endAngle,
        midAngle,
        color: item.color,
        porcentaje: item.porcentaje,
        totalCosto: item.totalCosto,
      });

      const isActive =
        hovered === item.turno ||
        (selected !== 'Todos' && selected === item.turno);
      const isDimmed = selected !== 'Todos' && selected !== item.turno;

      const offset = isActive ? 7 : 0;
      const sliceCx = cx + Math.cos(midAngle) * offset;
      const sliceCy = cy + Math.sin(midAngle) * offset;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.35 : 1;
      ctx.beginPath();
      ctx.moveTo(sliceCx, sliceCy);
      ctx.arc(sliceCx, sliceCy, baseRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      if (item.porcentaje >= 8) {
        const labelRadius = baseRadius * 0.62;
        const lx = sliceCx + Math.cos(midAngle) * labelRadius;
        const ly = sliceCy + Math.sin(midAngle) * labelRadius;
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${item.porcentaje.toFixed(1)}%`, lx, ly);
      }

      ctx.restore();
      currentAngle = endAngle;
    }

    this.slices = computedSlices;
  }
}
