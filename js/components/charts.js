/**
 * Componente Charts - Gráficos com Chart.js
 */

import { generateRankingCausa, generateRankingAlimentador } from '../services/data-service.js';

let chartCausa = null;
let chartAlimentador = null;

/**
 * Renderizar gráfico de pizza - Ranking por CAUSA
 */
export function renderChartCausa(data) {
    const ranking = generateRankingCausa(data);
    const ctx = document.getElementById('chartCausa');
    
    if (!ctx) return;

    // Destruir gráfico anterior se existir
    if (chartCausa) {
        chartCausa.destroy();
    }

    const labels = ranking.map(item => item.causa);
    const values = ranking.map(item => item.count);
    
    // Paleta de cores profissional ENEL - Gradientes modernos
    const colors = [
        '#0A4A8C', '#1E7CE8', '#00B4FF', '#4DC8FF',
        '#80D9FF', '#B3E8FF', '#E6F4FD', '#FFD700',
        '#FFB84D', '#FF8C69', '#10B981', '#F59E0B'
    ];

    chartCausa = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: '#FFFFFF',
                borderWidth: 3,
                hoverBorderWidth: 4,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 18,
                        font: {
                            size: 13,
                            weight: '600',
                            family: "'Inter', 'Segoe UI', sans-serif"
                        },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        color: '#1A1F2E'
                    }
                },
                title: {
                    display: true,
                    text: 'Top 10 Causas',
                    font: {
                        size: 18,
                        weight: '700',
                        family: "'Inter', 'Segoe UI', sans-serif"
                    },
                    color: '#0A4A8C',
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(26, 31, 46, 0.95)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: '600'
                    },
                    bodyFont: {
                        size: 13
                    },
                    borderColor: '#1E7CE8',
                    borderWidth: 2,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

/**
 * Renderizar gráfico radar - Ranking por ALIMENTADOR
 */
export function renderChartAlimentador(data) {
    const ranking = generateRankingAlimentador(data);
    const ctx = document.getElementById('chartAlimentador');
    
    if (!ctx) return;

    // Destruir gráfico anterior se existir
    if (chartAlimentador) {
        chartAlimentador.destroy();
    }

    const labels = ranking.map(item => item.alimentador);
    const values = ranking.map(item => item.count);

    chartAlimentador = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ocorrências',
                data: values,
                backgroundColor: 'rgba(30, 124, 232, 0.25)',
                borderColor: '#1E7CE8',
                borderWidth: 3,
                pointBackgroundColor: '#0A4A8C',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 3,
                pointRadius: 5,
                pointHoverBackgroundColor: '#00B4FF',
                pointHoverBorderColor: '#FFFFFF',
                pointHoverRadius: 7,
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: {
                            size: 11,
                            weight: '600',
                            family: "'Inter', 'Segoe UI', sans-serif"
                        },
                        color: '#5A6C7D',
                        backdropColor: 'transparent'
                    },
                    grid: {
                        color: 'rgba(30, 124, 232, 0.15)',
                        lineWidth: 1.5
                    },
                    angleLines: {
                        color: 'rgba(30, 124, 232, 0.1)',
                        lineWidth: 1.5
                    },
                    pointLabels: {
                        font: {
                            size: 12,
                            weight: '600',
                            family: "'Inter', 'Segoe UI', sans-serif"
                        },
                        color: '#1A1F2E',
                        padding: 12
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Top 10 Alimentadores',
                    font: {
                        size: 18,
                        weight: '700',
                        family: "'Inter', 'Segoe UI', sans-serif"
                    },
                    color: '#0A4A8C',
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(26, 31, 46, 0.95)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: '600'
                    },
                    bodyFont: {
                        size: 13
                    },
                    borderColor: '#1E7CE8',
                    borderWidth: 2,
                    cornerRadius: 8,
                    displayColors: true
                }
            },
            animation: {
                duration: 1200,
                easing: 'easeOutQuart'
            }
        }
    });
}

/**
 * Atualizar todos os gráficos
 */
export function updateCharts(data) {
    renderChartCausa(data);
    renderChartAlimentador(data);
}

