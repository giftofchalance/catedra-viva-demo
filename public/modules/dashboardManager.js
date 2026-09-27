/**
 * Gestor del Dashboard del Profesor (Cátedra Viva)
 * 
 * Principios:
 * - Capa 2: 100% Anónima y agregada (identidad del estudiante completamente protegida).
 * - Cero fricción: El docente visualiza métricas de comprensión sin configurar nada.
 * - Gráficos visuales de distribución temática y densidad temporal de dudas.
 */

export class DashboardManager {
  constructor() {
    this.barChartEl = document.getElementById('topicsBarChart');
    this.timelineChartEl = document.getElementById('timelineDensityChart');
    this.isLoaded = false;
  }

  async loadStats() {
    if (this.isLoaded) return;

    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      if (response.ok && data) {
        this.renderBarChart(data.topicDistribution);
        this.renderTimeline(data.timelineDensity);
        this.isLoaded = true;
      }
    } catch (err) {
      console.error('Error cargando estadísticas del dashboard:', err);
    }
  }

  renderBarChart(topics) {
    if (!this.barChartEl || !Array.isArray(topics)) return;
    this.barChartEl.innerHTML = '';

    topics.forEach(item => {
      const barItem = document.createElement('div');
      barItem.className = 'chart-bar-item';
      barItem.innerHTML = `
        <div class="bar-meta">
          <span>${item.topic}</span>
          <span><strong>${item.percentage}%</strong> (${item.count} dudas)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${item.percentage}%; background-color: ${item.color};"></div>
        </div>
      `;
      this.barChartEl.appendChild(barItem);
    });
  }

  renderTimeline(timeline) {
    if (!this.timelineChartEl || !Array.isArray(timeline)) return;
    this.timelineChartEl.innerHTML = '';

    const maxCount = Math.max(...timeline.map(t => t.count), 1);

    timeline.forEach(item => {
      const heightPercent = Math.round((item.count / maxCount) * 100);
      const isPeak = item.count === maxCount;

      const col = document.createElement('div');
      col.className = 'density-col';
      col.title = `${item.interval}: ${item.count} preguntas (${item.label})`;
      col.innerHTML = `
        <span class="density-val">${item.count}</span>
        <div class="density-bar ${isPeak ? 'peak' : ''}" style="height: ${heightPercent}%;"></div>
        <span class="density-label">${item.interval}</span>
      `;
      this.timelineChartEl.appendChild(col);
    });
  }
}
