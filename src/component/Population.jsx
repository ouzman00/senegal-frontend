"use client";

import React from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

// Enregistrement des modules
ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

export default function Population({ selectedFeature }) {
  const communeNameRaw = selectedFeature
    ? selectedFeature.CCRCA || selectedFeature.CCRCA_1 || " "
    : null;

  const communeName =
    communeNameRaw &&
    communeNameRaw.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  const pieData = selectedFeature
    ? {
        labels: ["Hommes", "Femmes"],
        datasets: [
          {
            label: `Population de ${communeName}`,
            data: [
              selectedFeature.Hommes || selectedFeature.hommes || 0,
              selectedFeature.Femmes || selectedFeature.femmes || 0,
            ],
            backgroundColor: ["#36A2EB", "#FF6384"],
            borderColor: "#fff",
            borderWidth: 1,
          },
        ],
      }
    : {
        labels: ["Sélectionnez une commune"],
        datasets: [
          {
            data: [1],
            backgroundColor: ["#ddd"],
          },
        ],
      };

  const options = {
    plugins: {
      legend: {
        position: "bottom",
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context) => `${context.parsed} personnes`,
        },
      },
      datalabels: {
        color: "#fff",
        formatter: (value, context) => {
          const total = context.chart.data.datasets[0].data.reduce(
            (acc, val) => acc + val,
            0
          );
          const percentage = ((value / total) * 100).toFixed(1);
    // \n force le retour à la ligne
    return `${value}\n(${percentage}%)`
        },
        font: {
          weight: "bold",
          size: 12,
        },
      },
    },
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-md border border-gray-300 lg:sticky lg:top-4">
      <h3 className="font-semibold mb-2">
        {selectedFeature
          ? `Population de ${communeName}`
          : "Sélectionnez une commune"}
      </h3>
      <Pie data={pieData} options={options} />
    </div>
  );
}
