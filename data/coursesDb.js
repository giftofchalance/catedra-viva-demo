/**
 * Base de Datos de Cursos, Materiales Dinámicos y RAG Histórico Multiclase.
 * Soporta cursos base + creación de asignaturas personalizadas con degradación limpia a Pizarra Libre.
 */

import { extractMeaningfulTokens, normalizeSearchText } from '../services/textUtils.js';

export const COURSES_DB = {
  macro: {
    id: 'macro',
    code: 'IN4123',
    name: 'Macroeconomía Intermedia',
    instructor: 'Prof. Bruno Castro',
    badgeColor: '#2563EB',
    description: 'Equilibrio macroeconómico de corto y mediano plazo en economías cerradas y abiertas (IS-LM, AS-AD, Solow).',
    glossary: 'IS-LM, curva IS, curva LM, tasa de interés, gasto público, multiplicador keynesiano, propensión marginal a consumir, banco central, oferta monetaria, política fiscal, política monetaria, Solow, estado estacionario, inversión, consumo autónomo.',
    ucursosSync: {
      synced: true,
      sourceLabel: 'U-Cursos • Material Docente (Auto-Sync)',
      deckTitle: 'Cátedra 12 — Equilibrio Conjunto IS-LM.pptx',
      slides: [
        {
          id: 'SLIDE-1',
          number: 1,
          title: 'Mercado de Bienes y Curva IS',
          keywords: ['curva is', 'mercado de bienes', 'inversión', 'gasto público', 'pib', 'pendiente negativa', 'tasa de interés'],
          bulletPoints: [
            'Equilibrio producción = demanda agregada: Y = C(Y-T) + I(r) + G',
            'Relación inversa entre tasa de interés real (r) e ingreso de equilibrio (Y)'
          ]
        },
        {
          id: 'SLIDE-2',
          number: 2,
          title: 'Multiplicador y Política Fiscal',
          keywords: ['multiplicador', 'propensión marginal', 'consumo', 'política fiscal', 'crowding out', 'desplazamiento'],
          bulletPoints: [
            'Multiplicador keynesiano α = 1 / (1 - c(1-t))',
            'Efecto desplazamiento (crowding out) sobre la inversión privada'
          ]
        },
        {
          id: 'SLIDE-3',
          number: 3,
          title: 'Mercado Monetario y Curva LM',
          keywords: ['curva lm', 'mercado monetario', 'dinero', 'banco central', 'oferta monetaria', 'liquidez', 'pendiente positiva'],
          bulletPoints: [
            'Equilibrio saldos reales: M/P = L(r, Y) = kY - hr',
            'Política monetaria y sensibilidad de la demanda de dinero a r'
          ]
        },
        {
          id: 'SLIDE-4',
          number: 4,
          title: 'Equilibrio Simultáneo IS-LM',
          keywords: ['is-lm', 'islm', 'equilibrio simultáneo', 'un solo gráfico', 'mix de políticas', 'estado macroeconómico'],
          bulletPoints: [
            'Intersección (r*, Y*) con equilibrio conjunto en bienes y dinero',
            'Análisis de shocks de demanda y coordinación fiscal-monetaria'
          ]
        }
      ]
    },
    historicalClasses: [
      {
        id: 'HIST-M1',
        classNumber: 1,
        title: 'Clase 1: Cuentas Nacionales, PIB y Mercado de Bienes',
        summary: 'Medición del producto e ingreso agregado. Identidad fundamental del PIB: Y = C + I + G + XN. Función consumo keynesiana C = C0 + c(Y - T), donde c es la propensión marginal a consumir. Determinación del multiplicador keynesiano alpha = 1 / (1 - c(1-t)).',
        keyFormulas: [
          'Y = C_0 + c(Y - T) + I + G',
          '\\alpha = \\frac{1}{1 - c(1 - t)}',
          '\\Delta Y = \\alpha \\cdot \\Delta G'
        ]
      },
      {
        id: 'HIST-M2',
        classNumber: 2,
        title: 'Clase 2: Mercado Monetario y Derivación de la Curva LM',
        summary: 'Demanda de saldos reales de dinero L(r, Y) = kY - hr. Oferta monetaria real fijada por el Banco Central M/P. Condición de equilibrio monetario M/P = kY - hr. La curva LM representa las combinaciones de tasa de interés r e ingreso Y que equilibran el mercado del dinero, teniendo pendiente positiva.',
        keyFormulas: [
          '\\frac{M}{P} = kY - hr',
          'r = \\frac{k}{h}Y - \\frac{1}{h}\\left(\\frac{M}{P}\\right)'
        ]
      }
    ],
    materials: [
      {
        id: 'MAT-M1',
        title: 'Guía 2 — Política Fiscal y Monetaria en el Modelo IS-LM',
        pages: 'p. 1–4',
        content: 'Efecto desplazamiento (crowding out): un aumento del gasto público desplaza la curva IS hacia la derecha, elevando el ingreso y la tasa de interés. La mayor tasa de interés reduce la inversión privada. Eficacia de la política monetaria según la sensibilidad de la demanda de dinero a la tasa de interés.'
      }
    ],
    longitudinalInsights: {
      semestersAnalyzed: ['Otoño 2025', 'Primavera 2025'],
      topBottlenecks: [
        {
          topic: 'Efecto Desplazamiento (Crowding Out) en IS-LM',
          inClassPct: 38,
          postClassPct: 44,
          strategyTested: 'Al mostrar primero el canal causal ΔG ↑ ➔ Y ↑ ➔ Md ↑ ➔ r ↑ ➔ I ↓ en pizarra antes de dibujar la nueva IS, las dudas post-clase bajaron 31% en Primavera 2025.'
        },
        {
          topic: 'Pendiente Curva LM y Trampa de Liquidez',
          inClassPct: 24,
          postClassPct: 33,
          strategyTested: 'Comparar explícitamente el caso extremo horizontal (trampa de liquidez) vs. clásico vertical facilita el análisis de eficacia fiscal/monetaria.'
        }
      ]
    }
  },

  probabilidades: {
    id: 'probabilidades',
    code: 'IN3401',
    name: 'Probabilidades y Estadística',
    instructor: 'Prof. Bruno Castro',
    badgeColor: '#7C3AED',
    description: 'Fundamentos de teoría de probabilidades, variables aleatorias, distribuciones y teoremas de límites para ingeniería.',
    glossary: 'espacio muestral, probabilidad condicional, Teorema de Bayes, probabilidad total, independencia estocástica, variable aleatoria, esperanza matemática, varianza, distribución normal, Bernoulli, Poisson, función de densidad, función de distribución acumulada, axiomas de Kolmogorov.',
    ucursosSync: {
      synced: true,
      sourceLabel: 'U-Cursos • Material Docente (Auto-Sync)',
      deckTitle: 'Clase 05 — Condicionalidad, Particiones y Bayes.pptx',
      slides: [
        {
          id: 'SLIDE-1',
          number: 1,
          title: 'Axiomas y Espacio Muestral',
          keywords: ['kolmogorov', 'axioma', 'espacio muestral', 'sigma', 'disjuntos', 'unión'],
          bulletPoints: [
            'P(Ω) = 1, P(A) ≥ 0, σ-aditividad',
            'Eventos disjuntos vs. unión general'
          ]
        },
        {
          id: 'SLIDE-2',
          number: 2,
          title: 'Probabilidad Condicional',
          keywords: ['condicional', 'dado que', 'regla de la multiplicación', 'intersección'],
          bulletPoints: [
            'P(A|B) = P(A ∩ B) / P(B)',
            'Reducción del espacio muestral al evento condicionante'
          ]
        },
        {
          id: 'SLIDE-3',
          number: 3,
          title: 'Independencia Estocástica',
          keywords: ['independencia', 'independiente', 'independientes', 'factorización'],
          bulletPoints: [
            'A ⊥ B ⇔ P(A ∩ B) = P(A)·P(B)',
            'Advertencia: Disjuntos (P>0) NO son independientes'
          ]
        },
        {
          id: 'SLIDE-4',
          number: 4,
          title: 'Probabilidad Total y Teorema de Bayes',
          keywords: ['bayes', 'probabilidad total', 'partición', 'priori', 'posteriori', 'sensibilidad', 'especificidad', 'prevalencia'],
          bulletPoints: [
            'Actualización de creencias a priori ➔ a posteriori',
            'Aplicaciones en test clínicos y detección de fallas'
          ]
        }
      ]
    },
    historicalClasses: [
      {
        id: 'HIST-P1',
        classNumber: 1,
        title: 'Clase 1: Espacios de Probabilidad, Axiomas y Condicionalidad',
        summary: 'Definición de espacio muestral Omega y sigma-álgebra F. Tres axiomas de Kolmogorov: P(A) >= 0, P(Omega) = 1, y sigma-aditividad para eventos disjuntos. Definición de probabilidad condicional: P(A|B) = P(A inter B) / P(B) con P(B) > 0. Independencia: A y B son independientes si P(A inter B) = P(A)P(B).',
        keyFormulas: [
          'P(A|B) = \\frac{P(A \\cap B)}{P(B)}',
          'P(A \\cup B) = P(A) + P(B) - P(A \\cap B)',
          'P(A \\cap B) = P(A)P(B) \\iff A \\perp B'
        ]
      },
      {
        id: 'HIST-P2',
        classNumber: 2,
        title: 'Clase 2: Particiones, Probabilidad Total y Teorema de Bayes',
        summary: 'Partición del espacio muestral {B1, B2, ..., Bn}. Teorema de las Probabilidades Totales: P(A) = suma P(A|Bi)P(Bi). Teorema de Bayes para actualización de probabilidades a priori a posteriori: P(Bk|A) = [P(A|Bk)P(Bk)] / [suma P(A|Bi)P(Bi)]. Aplicación a pruebas de diagnóstico médico, sensibilidad y especificidad.',
        keyFormulas: [
          'P(A) = \\sum_{i=1}^n P(A|B_i)P(B_i)',
          'P(B_k|A) = \\frac{P(A|B_k)P(B_k)}{\\sum_{i=1}^n P(A|B_i)P(B_i)}'
        ]
      }
    ],
    materials: [
      {
        id: 'MAT-P1',
        title: 'Formulario y Guía 1 — Probabilidad Condicional y Bayes',
        pages: 'p. 1–3',
        content: 'Regla de la multiplicación: P(A inter B) = P(A|B)P(B). Diagnóstico clínico: prevalencia P(E), sensibilidad P(+|E), especificidad P(-|no E). El Teorema de Bayes permite calcular el valor predictivo positivo P(E|+).'
      }
    ],
    longitudinalInsights: {
      semestersAnalyzed: ['Otoño 2025', 'Primavera 2025'],
      topBottlenecks: [
        {
          topic: 'Disjuntos vs. Independencia Estocástica',
          inClassPct: 41,
          postClassPct: 36,
          strategyTested: 'Contrastar ambos conceptos con un diagrama de Venn (área nula vs. proporción geométrica) redujo los errores de control C1 en un 28%.'
        },
        {
          topic: 'Construcción de Partición previa al Teorema de Bayes',
          inClassPct: 32,
          postClassPct: 49,
          strategyTested: 'Exigir dibujar el árbol completo con frecuencias naturales de 1.000 personas antes de usar la fórmula cerrada de Bayes.'
        }
      ]
    }
  },

  finanzas: {
    id: 'finanzas',
    code: 'IN5233',
    name: 'Ingeniería Financiera y Portafolios',
    instructor: 'Prof. Bruno Castro',
    badgeColor: '#059669',
    description: 'Valorización de activos (CAPM), teoría de portafolios de Markowitz, WACC, evaluación de proyectos (VAN y TIR) y derivados.',
    glossary: 'CAPM, WACC, TIR, VAN, beta, riesgo sistemático, riesgo idiosincrático, diversificación, varianza del portafolio, correlación, retorno esperado, retorno exigido, tasa libre de riesgo, prima por riesgo de mercado, flujos de caja libres, swaps, FRAs.',
    ucursosSync: {
      synced: true,
      sourceLabel: 'U-Cursos • Material Docente (Auto-Sync)',
      deckTitle: 'Sesión 07 — Valorización CAPM, Portafolios y WACC.pptx',
      slides: [
        {
          id: 'SLIDE-1',
          number: 1,
          title: 'Teoría de Portafolios y Diversificación',
          keywords: ['portafolio', 'portafolios', 'correlación', 'varianza', 'diversificación', 'idiosincrático', 'rentabilidad'],
          bulletPoints: [
            'Combinar activos con ρ < 1 reduce σ² del portafolio',
            'Riesgo idiosincrático se elimina diversificando'
          ]
        },
        {
          id: 'SLIDE-2',
          number: 2,
          title: 'Modelo CAPM y Riesgo Sistemático',
          keywords: ['capm', 'beta', 'riesgo sistemático', 'libre de riesgo', 'prima por riesgo', 'retorno exigido', 'retorno esperado'],
          bulletPoints: [
            'E(R_i) = R_f + β_i (E(R_m) - R_f)',
            'Beta mide únicamente riesgo sistemático, no riesgo total'
          ]
        },
        {
          id: 'SLIDE-3',
          number: 3,
          title: 'Valorización de Empresas (WACC)',
          keywords: ['wacc', 'valorización', 'flujos de caja', 'financiamiento', 'costo promedio ponderado', 'deuda', 'patrimonio'],
          bulletPoints: [
            'WACC pondera costo de deuda (después de impuestos) y patrimonio',
            'Consistencia entre flujo de caja libre de la firma y riesgo'
          ]
        },
        {
          id: 'SLIDE-4',
          number: 4,
          title: 'Criterios de Decisión: VAN vs. TIR',
          keywords: ['van', 'tir', 'proyecto', 'crear valor', 'crea más valor', 'control'],
          bulletPoints: [
            'TIR alta ≠ mayor creación de valor monetario',
            'VAN mide creación neta de riqueza descontada al costo de oportunidad'
          ]
        }
      ]
    },
    historicalClasses: [
      {
        id: 'HIST-F1',
        classNumber: 1,
        title: 'Clase 1: Teoría de Portafolios de Markowitz, Varianza y Diversificación',
        summary: 'Retorno esperado y varianza de un portafolio de dos activos. Efecto de la correlación menor que 1 en la reducción del riesgo total del portafolio sin sacrificar retorno esperado. Distinción entre riesgo idiosincrático (diversificable) y riesgo sistemático o de mercado (no diversificable).',
        keyFormulas: [
          'E(R_p) = w_1 E(R_1) + w_2 E(R_2)',
          '\\sigma_p^2 = w_1^2 \\sigma_1^2 + w_2^2 \\sigma_2^2 + 2 w_1 w_2 \\rho_{1,2} \\sigma_1 \\sigma_2',
          '\\text{CAPM}: E(R_i) = R_f + \\beta_i \\cdot (E(R_m) - R_f)'
        ]
      },
      {
        id: 'HIST-F2',
        classNumber: 2,
        title: 'Clase 2: Valorización de Empresas (WACC) y Evaluación de Proyectos (VAN vs TIR)',
        summary: 'El WACC (Weighted Average Cost of Capital) representa el costo promedio ponderado de las fuentes de financiamiento (deuda y patrimonio) y se utiliza para descontar los flujos de caja libres de la firma siempre que sea consistente con su nivel de riesgo. En evaluación de proyectos, una TIR alta no implica necesariamente mayor creación de valor; el criterio correcto para medir creación de valor es el VAN (Valor Actual Neto). Diferencia fundamental entre retorno esperado y retorno exigido.',
        keyFormulas: [
          '\\text{WACC} = \\frac{E}{V} R_e + \\frac{D}{V} R_d (1 - t_c)',
          '\\text{VAN} = -I_0 + \\sum_{t=1}^n \\frac{FCF_t}{(1 + \\text{WACC})^t}'
        ]
      }
    ],
    materials: [
      {
        id: 'MAT-F1',
        title: 'Apunte 1 — CAPM, Portafolios, WACC y Criterios VAN vs. TIR',
        pages: 'p. 1–15',
        content: 'Modelo CAPM: el retorno exigido de un activo depende de la tasa libre de riesgo (Rf), su beta y la prima por riesgo de mercado (E(Rm) - Rf). La beta mide únicamente el riesgo sistemático; el riesgo idiosincrático se reduce mediante diversificación al combinar activos con correlación menor que 1. Valorización de empresas: el WACC descuenta flujos de caja libres de la firma. Criterio de inversión: una TIR alta no garantiza mayor creación de valor; para eso se evalúa el VAN. No confundir retorno esperado (estimación estadística) con retorno exigido (compensación mínima por riesgo sistemático según CAPM).'
      }
    ],
    longitudinalInsights: {
      semestersAnalyzed: ['Otoño 2025', 'Primavera 2025'],
      topBottlenecks: [
        {
          topic: 'Criterios VAN vs. TIR (Escala y Reinversión)',
          inClassPct: 29,
          postClassPct: 46,
          strategyTested: 'Presentar el contraejemplo numérico (proyecto chico de TIR 80% vs. proyecto grande de TIR 22% y VAN mayor) antes de pasar a WACC eliminó la confusión en Primavera 2025.'
        },
        {
          topic: 'Retorno Esperado E(R) vs. Retorno Exigido CAPM',
          inClassPct: 35,
          postClassPct: 42,
          strategyTested: 'Anotar explícitamente una tabla comparativa entre alfa de Jensen (desequilibrio) y la recta SML en equilibrio.'
        }
      ]
    }
  }
};

/**
 * Obtener lista resumida de cursos disponibles
 */
export function getCoursesList() {
  return Object.values(COURSES_DB).map(c => ({
    id: c.id,
    code: c.code,
    name: c.name,
    instructor: c.instructor,
    badgeColor: c.badgeColor,
    description: c.description
  }));
}

/**
 * Obtener información completa de un curso
 */
export function getCourse(courseId) {
  return COURSES_DB[courseId] || COURSES_DB['macro'];
}

/**
 * Guardar una clase recién cerrada en el historial RAG del curso
 */
export function recordClosedClass(courseId, classData) {
  const course = getCourse(courseId);
  const nextNum = course.historicalClasses.length + 1;
  const newClass = {
    id: `HIST-${course.code.substring(2, 4)}${nextNum}`,
    classNumber: nextNum,
    title: classData.title || `Clase ${nextNum}: Resumen de la Sesión`,
    summary: classData.summary || 'Resumen de los temas y fórmulas tratados en la sesión.',
    keyFormulas: classData.keyFormulas || [],
    closedAt: new Date().toISOString()
  };
  course.historicalClasses.push(newClass);
  return newClass;
}

/**
 * Agregar material de estudio subido por el profesor
 */
export function addCourseMaterial(courseId, materialData) {
  const course = getCourse(courseId);
  const nextNum = course.materials.length + 1;
  const newMaterial = {
    id: `MAT-${course.code.substring(2, 4)}${nextNum}`,
    title: materialData.title || `Material Adicional #${nextNum}`,
    pages: materialData.pages || 'Doc',
    content: materialData.content || ''
  };
  course.materials.push(newMaterial);
  return newMaterial;
}

/**
 * Crea un curso personalizado al vuelo desde texto/slides opcionales.
 * Si no se entrega material, arranca en modo Pizarra Libre sin fricción.
 */
export function createCustomCourse({ code = 'CURSO-101', name = 'Clase Personalizada', instructor = 'Docente', slidesText = '', glossary = '' }) {
  const cleanCode = (code || 'CURSO-101').trim().toUpperCase().slice(0, 16);
  const cleanName = (name || 'Clase Personalizada').trim().slice(0, 80);
  const baseId = normalizeSearchText(cleanCode || cleanName).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'custom';
  const id = COURSES_DB[baseId] ? `${baseId}_${Date.now().toString().slice(-4)}` : baseId;

  const rawBlocks = (slidesText || '').trim()
    ? (slidesText.includes('---')
        ? slidesText.split(/^\s*---+\s*$/m)
        : slidesText.split(/\n\s*\n+/))
        .map(b => b.trim())
        .filter(Boolean)
    : [];

  const slides = rawBlocks.map((block, idx) => {
    const lines = block
      .split('\n')
      .map(l => l.replace(/^#+\s*/, '').replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
    const title = (lines[0] || `Lámina ${idx + 1}`).replace(/^L[áa]mina\s*\d+\s*[:.-]?\s*/i, '').trim() || `Lámina ${idx + 1}`;
    const bulletPoints = lines.length > 1 ? lines.slice(1, 6) : [title];
    return {
      id: `SLIDE-${idx + 1}`,
      number: idx + 1,
      title,
      keywords: [],
      bulletPoints
    };
  });

  const inferredTokens = [...new Set(extractMeaningfulTokens(`${cleanName} ${slidesText}`, 4))].slice(0, 20);
  const newCourse = {
    id,
    code: cleanCode,
    name: cleanName,
    instructor: (instructor || 'Docente').trim(),
    badgeColor: '#3B82F6',
    description: slides.length > 0
      ? `Asignatura cargada dinámicamente con ${slides.length} láminas de apoyo.`
      : 'Asignatura en modo Pizarra Libre (sin diapositivas previas).',
    glossary: (glossary || '').trim() || inferredTokens.join(', '),
    ucursosSync: slides.length > 0
      ? {
          synced: true,
          sourceLabel: 'Material Cargado en Sesión',
          deckTitle: `${cleanCode} — Láminas de Clase`,
          slides
        }
      : {
          synced: false,
          sourceLabel: 'Pizarra Libre',
          deckTitle: null,
          slides: []
        },
    historicalClasses: [],
    materials: [],
    longitudinalInsights: null
  };

  COURSES_DB[id] = newCourse;
  return newCourse;
}

/**
 * Mapeo Automático Voz-a-Lámina agnóstico al curso:
 * Evalúa tokens significativos de título y contenido de cada slide (además de keywords opcionales).
 * Si no hay coincidencia clara o no hay PPT, retorna null (Pizarra Libre).
 */
export function matchSlideForSegment(courseId, text) {
  const course = getCourse(courseId);
  const slides = course?.ucursosSync?.slides;
  if (!slides || slides.length === 0 || !text) return null;

  const normText = normalizeSearchText(text);
  const textTokenSet = new Set(extractMeaningfulTokens(text, 3));
  let bestMatch = null;
  let bestScore = 0;

  for (const slide of slides) {
    let score = 0;
    for (const kw of slide.keywords || []) {
      const normKw = normalizeSearchText(kw);
      if (normKw && normText.includes(normKw)) {
        score += 2;
      }
    }

    const titleTokens = extractMeaningfulTokens(slide.title || '', 3);
    for (const tt of titleTokens) {
      if (textTokenSet.has(tt)) score += 2;
    }

    const bulletTokens = extractMeaningfulTokens((slide.bulletPoints || []).join(' '), 4);
    for (const bt of bulletTokens) {
      if (textTokenSet.has(bt)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = slide;
    }
  }

  if (!bestMatch || bestScore < 2) return null;

  return {
    id: bestMatch.id,
    number: bestMatch.number,
    title: bestMatch.title,
    bulletPoints: bestMatch.bulletPoints
  };
}
