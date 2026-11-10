/**
 * Base de Datos de Cursos y RAG Histórico Multiclase
 * Soporta Macroeconomía, Probabilidades e Ingeniería Financiera.
 * Permite cerrar clases y agregar dinámicamente resúmenes como contexto para la siguiente sesión.
 */

export const COURSES_DB = {
  macro: {
    id: 'macro',
    code: 'IN4123',
    name: 'Macroeconomía Intermedia',
    instructor: 'Prof. Bruno Castro',
    badgeColor: '#2563EB',
    description: 'Equilibrio macroeconómico de corto y mediano plazo en economías cerradas y abiertas (IS-LM, AS-AD, Solow).',
    glossary: 'IS-LM, curva IS, curva LM, tasa de interés, gasto público, multiplicador keynesiano, propensión marginal a consumir, banco central, oferta monetaria, política fiscal, política monetaria, Solow, estado estacionario, inversión, consumo autónomo.',
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
    ]
  },

  probabilidades: {
    id: 'probabilidades',
    code: 'IN3401',
    name: 'Probabilidades y Estadística',
    instructor: 'Prof. Bruno Castro',
    badgeColor: '#7C3AED',
    description: 'Fundamentos de teoría de probabilidades, variables aleatorias, distribuciones y teoremas de límites para ingeniería.',
    glossary: 'espacio muestral, probabilidad condicional, Teorema de Bayes, probabilidad total, independencia estocástica, variable aleatoria, esperanza matemática, varianza, distribución normal, Bernoulli, Poisson, función de densidad, función de distribución acumulada, axiomas de Kolmogorov.',
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
    ]
  },

  finanzas: {
    id: 'finanzas',
    code: 'IN5233',
    name: 'Ingeniería Financiera y Portafolios',
    instructor: 'Prof. Bruno Castro',
    badgeColor: '#059669',
    description: 'Valorización de activos (CAPM), teoría de portafolios de Markowitz, estructura de tasas y derivados financieros.',
    glossary: 'CAPM, beta, riesgo sistemático, riesgo idiosincrático, diversificación, varianza del portafolio, correlación, retorno esperado, tasa libre de riesgo, prima por riesgo de mercado, frontera eficiente, swaps de tasa de interés, FRAs, convenciones 30/360, Act/365.',
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
        title: 'Clase 2: Estructura Temporal de Tasas, FRAs y Swaps',
        summary: 'Curva de tasas spot y bonos cupón cero. Valoración de un Forward Rate Agreement (FRA): fijación hoy de la tasa de interés para un préstamo futuro. Relación de no arbitraje: (1 + r2)^T2 = (1 + r1)^T1 * (1 + f)^(T2 - T1). Swaps de tasa de interés (IRS): intercambio periódico de flujos de tasa fija por tasa flotante sobre un nocional sin intercambiar el principal.',
        keyFormulas: [
          '(1 + r_{T_2})^{T_2} = (1 + r_{T_1})^{T_1} \\cdot (1 + f(0; T_1, T_2))^{T_2 - T_1}',
          '\\text{Payoff FRA} = \\frac{N \\cdot (L - R_K) \\cdot \\frac{d}{360}}{1 + L \\cdot \\frac{d}{360}}'
        ]
      }
    ],
    materials: [
      {
        id: 'MAT-F1',
        title: 'Apunte 1 — Valorización de Activos (CAPM), Portafolios y Derivados',
        pages: 'p. 1–15',
        content: 'Modelo CAPM: el retorno exigido de un activo depende de la tasa libre de riesgo (Rf), su beta y la prima por riesgo de mercado (E(Rm) - Rf). La beta mide únicamente el riesgo sistemático; el riesgo idiosincrático se elimina mediante diversificación al combinar activos con correlación menor que 1.'
      }
    ]
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
