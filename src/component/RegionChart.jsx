"use client"; // Obligatoire si Next.js App Router

import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

// Enregistrement des modules Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function RegionChart({ regionsData = [], selectedRegion = null }) {
  // Retour si pas de données
  if (!regionsData || regionsData.length === 0) return null;

  // Préparation des données
  const data = {
    labels: regionsData.map((r) => r.name),
    datasets: [
      {
        label: "Superficie (km²)",
        data: regionsData.map((r) => Number(r.superficie) || 0),
        backgroundColor: regionsData.map((r) =>
          r.name === selectedRegion
            ? "rgba(255, 99, 132, 0.9)" // barre sélectionnée
            : "rgba(54, 162, 235, 0.6)" // barre normale
        ),
        borderColor: regionsData.map((r) =>
          r.name === selectedRegion
            ? "rgb(255, 99, 132)"
            : "rgba(54, 162, 235, 1)"
        ),
        borderWidth: regionsData.map((r) => (r.name === selectedRegion ? 3 : 1)),
      },
    ],
  };

  // Options du graphique
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true, // true si tu veux la légende, false sinon
        position: "top",
      },
      tooltip: {
        enabled: true, // tooltips au survol
        callbacks: {
          label: (context) => `${context.parsed.y.toLocaleString()} km²`,
        },
      },
      // Désactivation des étiquettes sur les barres si chartjs-plugin-datalabels est chargé globalement
      datalabels: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Superficie (km²)",
        },
      },
      x: {
        title: {
          display: true,
          text: "Régions",
        },
      },
    },
  };

  return (
  <div className="p-4 bg-white rounded-xl shadow-md border border-gray-300 h-[260px] sm:h-[300px]">
    <h3 className="font-semibold mb-2">Superficie des régions</h3>
    <Bar data={data} options={options} />
  </div>
);

}
