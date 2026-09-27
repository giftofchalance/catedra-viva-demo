/**
 * Configuración del contenido permitido del curso (Macroeconomía IN4123).
 * 
 * ARQUITECTURA: Este archivo está ESTRICTAMENTE SEPARADO de la lógica del chat.
 * Para acotar o ampliar el alcance temático (ej. solo Unidad 2, o agregar Unidad 4),
 * basta con modificar este archivo sin tocar una sola línea de código del motor de chat.
 */

export const COURSE_CONFIG = {
  courseCode: "IN4123",
  courseName: "Macroeconomía",
  institution: "Universidad",
  description: "Curso de Macroeconomía intermedia enfocado en modelos de corto, mediano y largo plazo.",
  
  // Unidades curriculares oficiales permitidas:
  units: [
    {
      unitNumber: 1,
      title: "Unidad 1: Cuentas nacionales, índices de precios e inflación, ciclo económico",
      summary: "Cuentas nacionales, medición del producto e ingreso agregado, índices de precios (IPC, deflactor del PIB), inflación y fluctuaciones del ciclo económico.",
      topics: [
        "Cuentas nacionales y contabilidad macroeconómica",
        "Medición del PIB (nominal y real), PNB, ingreso nacional",
        "Índices de precios, IPC, deflactor del PIB y cálculo de inflación",
        "Ciclo económico, brecha del producto y fluctuaciones macroeconómicas de corto plazo"
      ]
    },
    {
      unitNumber: 2,
      title: "Unidad 2: Mercados financiero y monetario, modelo IS/LM, mercado laboral neoclásico, modelo AS/AD y curva de Phillips, expectativas, modelo Mundell-Fleming",
      summary: "Mercados financieros y monetarios, equilibrio simultáneo de bienes y dinero (modelo IS/LM), mercado de trabajo, oferta y demanda agregada (AS/AD), curva de Phillips, formación de expectativas y macroeconomía abierta (modelo Mundell-Fleming).",
      topics: [
        "Mercados financiero y monetario (demanda y oferta de dinero)",
        "Modelo IS/LM (curva IS, curva LM, equilibrio conjunto, multiplicadores, tipo de interés e ingreso)",
        "Políticas fiscales (expansivas/restrictivas) y políticas monetarias (tasas, encaje, operaciones de mercado abierto)",
        "Mercado laboral neoclásico y determinación del salario real y empleo",
        "Modelo AS/AD (oferta y demanda agregada)",
        "Curva de Phillips y relación entre inflación y desempleo",
        "Expectativas (adaptativas y racionales)",
        "Modelo Mundell-Fleming para economía abierta (tipos de cambio fijos y flexibles, flujos de capital)"
      ]
    },
    {
      unitNumber: 3,
      title: "Unidad 3: Modelo de Solow, convergencia, consumo intertemporal, Q de Tobin",
      summary: "Crecimiento económico de largo plazo, modelo de acumulación de capital de Solow-Swan, hipótesis de convergencia económica, teoría del consumo intertemporal y teoría de la inversión (Q de Tobin).",
      topics: [
        "Modelo de Solow-Swan (acumulación de capital, función de producción neoclásica, estado estacionario, regla de oro)",
        "Convergencia económica (absoluta y condicional entre países)",
        "Consumo intertemporal (hipótesis del ciclo de vida, ingreso permanente, tasa de descuento)",
        "Q de Tobin y determinantes de la inversión empresarial"
      ]
    }
  ],

  // Permite activar/desactivar unidades para demos específicas (ej: solo [2] o [1, 2, 3])
  activeUnitNumbers: [1, 2, 3],

  /**
   * Genera el texto formateado del alcance curricular activo para inyectar en el prompt del LLM.
   */
  getScopePromptText() {
    const activeUnits = this.units.filter(u => this.activeUnitNumbers.includes(u.unitNumber));
    let text = `CURSO: ${this.courseCode} - ${this.courseName}\n`;
    text += `CONTENIDO CURRICULAR PERMITIDO (Alcance del curso):\n`;
    activeUnits.forEach(u => {
      text += `- ${u.title}\n`;
      text += `  Temas incluidos: ${u.topics.join('; ')}\n`;
    });
    return text;
  }
};
