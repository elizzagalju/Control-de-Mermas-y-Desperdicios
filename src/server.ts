import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';
import {join} from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json({ limit: '12mb' }));

interface ExtractScrapBody {
  imageBase64?: string;
  mimeType?: string;
}

function cleanMarkdownJson(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

app.post('/api/extract-scrap', async (req, res) => {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    res.status(500).json({
      error: 'GEMINI_API_KEY no está configurada en el servidor. Configúrala en Settings > Secrets.',
    });
    return;
  }

  const body = (req.body ?? {}) as ExtractScrapBody;
  if (!body.imageBase64 || !body.mimeType) {
    res.status(400).json({
      error: 'Se requiere una imagen válida en formato base64 y su tipo MIME.',
    });
    return;
  }

  const normalizedMimeType =
    body.mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : body.mimeType;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMimeType,
              data: body.imageBase64,
            },
          },
          {
            text:
              'Analiza la foto de este formato físico de registro de scrap/mermas industriales y extrae los datos escritos o impresos. ' +
              'Responde únicamente con un objeto JSON válido con exactamente estas 5 llaves: ' +
              '"turno" (normalizado a "Matutino", "Vespertino" o "Nocturno"), ' +
              '"linea" (normalizado a "Línea 1 · Estampado", "Línea 2 · Inyección", "Línea 3 · Ensamble" o "Línea 4 · Termoformado"), ' +
              '"motivo" (tipo de defecto o motivo de merma escrito; si no aparece, usa "Merma registrada por formato"), ' +
              '"pesoKg" (número decimal con el peso en kilogramos), ' +
              '"costoKg" (número decimal con el costo por kilogramo; si solo aparece el costo total y los kg, calcula costoTotal / pesoKg).',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            turno: {
              type: Type.STRING,
              description: 'Turno normalizado: Matutino, Vespertino o Nocturno',
            },
            linea: {
              type: Type.STRING,
              description: 'Línea de producción normalizada',
            },
            motivo: {
              type: Type.STRING,
              description: 'Tipo de defecto o motivo de merma',
            },
            pesoKg: {
              type: Type.NUMBER,
              description: 'Peso en kilogramos como número',
            },
            costoKg: {
              type: Type.NUMBER,
              description: 'Costo unitario por kilogramo como número',
            },
          },
          required: ['turno', 'linea', 'motivo', 'pesoKg', 'costoKg'],
        },
      },
    });

    const cleaned = cleanMarkdownJson(response.text ?? '{}');
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const pesoKg = Number(parsed['pesoKg']);
    const costoKg = Number(parsed['costoKg']);

    res.status(200).json({
      turno: typeof parsed['turno'] === 'string' ? parsed['turno'] : 'Matutino',
      linea:
        typeof parsed['linea'] === 'string'
          ? parsed['linea']
          : 'Línea 1 · Estampado',
      motivo:
        typeof parsed['motivo'] === 'string' && parsed['motivo'].trim() !== ''
          ? parsed['motivo'].trim()
          : 'Merma registrada por formato',
      pesoKg: Number.isFinite(pesoKg) && pesoKg > 0 ? Number(pesoKg.toFixed(2)) : 0,
      costoKg:
        Number.isFinite(costoKg) && costoKg > 0 ? Number(costoKg.toFixed(2)) : 0,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'Error al procesar la imagen con la API de Gemini.';
    res.status(502).json({
      error: `No se pudo extraer la información de la imagen: ${message}`,
    });
  }
});

app.post('/api/generate-module', async (req, res) => {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    res.status(500).json({
      error: 'GEMINI_API_KEY no está configurada en el servidor. Configúrala en Settings > Secrets.',
    });
    return;
  }

  const body = (req.body ?? {}) as ExtractScrapBody;
  if (!body.imageBase64 || !body.mimeType) {
    res.status(400).json({
      error: 'Se requiere una imagen válida del boceto o wireframe en formato base64 y su tipo MIME.',
    });
    return;
  }

  const normalizedMimeType =
    body.mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : body.mimeType;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMimeType,
              data: body.imageBase64,
            },
          },
          {
            text:
              'Eres un arquitecto frontend experto en sistemas industriales y Tailwind CSS. ' +
              'Analiza el boceto o wireframe de la imagen y genera un módulo web industrial limpio y responsivo. ' +
              'Reglas estrictas para el campo "htmlCode": ' +
              '- Usa exclusivamente etiquetas HTML limpias (<div> con Flexbox o Grid de Tailwind CSS, <table>, <canvas>, encabezados y párrafos), SIN etiquetas <script> ni bloques markdown ```html. ' +
              '- Si identificas un área para un gráfico de pastel o circular, crea un contenedor <div> con un elemento <canvas data-chart="pie" class="w-full h-full"></canvas> dentro de un contenedor de tamaño fijo/aspect-square (por ejemplo max-w-xs aspect-square mx-auto). ' +
              '- Si identificas una tabla, créala con encabezados claros y 4-6 filas de datos de ejemplo relacionados con control industrial, mermas, producción, eficiencia o costos por turno. ' +
              '- Si identificas tarjetas KPI o métricas, inclúyelas con tipografía numérica tabular (font-mono tabular-nums). ' +
              'Devuelve un JSON con exactamente estas llaves: ' +
              '"moduleTitle" (nombre descriptivo del módulo detectado en la imagen), ' +
              '"htmlCode" (código HTML limpio con clases Tailwind CSS), ' +
              '"hasPieChart" (booleano true si detectas un gráfico de pastel en el boceto), ' +
              '"chartTitle" (título del gráfico de pastel si existe), ' +
              '"chartLabels" (arreglo de 3 a 5 etiquetas de texto para las porciones del gráfico), ' +
              '"chartValues" (arreglo de 3 a 5 valores numéricos correspondientes).',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            moduleTitle: {
              type: Type.STRING,
              description: 'Título sugerido para el módulo industrial',
            },
            htmlCode: {
              type: Type.STRING,
              description: 'Código HTML limpio con clases de Tailwind CSS (sin etiquetas script ni markdown)',
            },
            hasPieChart: {
              type: Type.BOOLEAN,
              description: 'Indica si el wireframe contiene un gráfico de pastel',
            },
            chartTitle: {
              type: Type.STRING,
              description: 'Título del gráfico de pastel',
            },
            chartLabels: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Etiquetas del gráfico de pastel',
            },
            chartValues: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
              description: 'Valores numéricos del gráfico de pastel',
            },
          },
          required: ['moduleTitle', 'htmlCode', 'hasPieChart', 'chartLabels', 'chartValues'],
        },
      },
    });

    const cleaned = cleanMarkdownJson(response.text ?? '{}');
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const rawHtml = typeof parsed['htmlCode'] === 'string' ? parsed['htmlCode'] : '';
    const cleanedHtml = rawHtml
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const labels = Array.isArray(parsed['chartLabels'])
      ? parsed['chartLabels'].filter((v): v is string => typeof v === 'string')
      : [];
    const values = Array.isArray(parsed['chartValues'])
      ? parsed['chartValues'].map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 0)
      : [];

    res.status(200).json({
      moduleTitle:
        typeof parsed['moduleTitle'] === 'string' && parsed['moduleTitle'].trim() !== ''
          ? parsed['moduleTitle'].trim()
          : 'Módulo Industrial Generado',
      htmlCode: cleanedHtml,
      hasPieChart: Boolean(parsed['hasPieChart']) || cleanedHtml.includes('<canvas'),
      chartTitle:
        typeof parsed['chartTitle'] === 'string' && parsed['chartTitle'].trim() !== ''
          ? parsed['chartTitle'].trim()
          : 'Distribución por categoría',
      chartLabels: labels.length > 0 ? labels : ['Turno Matutino', 'Turno Vespertino', 'Turno Nocturno'],
      chartValues: values.length > 0 ? values : [28, 35, 37],
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'Error al generar el módulo con la API de Gemini.';
    res.status(502).json({
      error: `No se pudo generar el módulo desde la imagen: ${message}`,
    });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
