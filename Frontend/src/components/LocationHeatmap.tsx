'use client';

import React, { useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';

const geoUrl =
  'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@ef25ebc/geojson/india.geojson';

export interface MapData {
  state: string;
  coords: [number, number];
  severity: string;
  disease: string;
  count: number;
}

interface LocationHeatmapProps {
  data: MapData[];
}

export default function LocationHeatmap({ data }: LocationHeatmapProps) {
  // Map severity to color
  const getColor = (severity: string) => {
    if (severity === 'High') return '#ef4444'; // red-500
    if (severity === 'Medium') return '#f97316'; // orange-500
    return '#22c55e'; // green-500
  };

  return (
    <div className="w-full h-full relative bg-[#f8fafc] rounded-lg border border-border overflow-hidden">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          center: [82.0, 22.0],
          scale: 900,
        }}
        width={800}
        height={600}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup zoom={1} maxZoom={4}>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: {
                      fill: '#f1f5f9',
                      stroke: '#cbd5e1',
                      strokeWidth: 0.5,
                      outline: 'none',
                    },
                    hover: {
                      fill: '#e2e8f0',
                      stroke: '#94a3b8',
                      strokeWidth: 0.5,
                      outline: 'none',
                    },
                    pressed: {
                      fill: '#cbd5e1',
                      stroke: '#64748b',
                      strokeWidth: 0.5,
                      outline: 'none',
                    },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Markers */}
          {data.map((marker, index) => {
            const color = getColor(marker.severity);
            const size = Math.min(Math.max(marker.count * 4, 8), 24);
            return (
              <Marker key={index} coordinates={marker.coords}>
                {/* Halo effect */}
                <circle
                  r={size + 8}
                  fill={color}
                  opacity={0.15}
                />
                {/* Core dot */}
                <circle
                  r={size}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                {/* State Label */}
                <text
                  x={size + 6}
                  y={4}
                  style={{
                    fontFamily: "system-ui",
                    fontSize: "11px",
                    fontWeight: 600,
                    fill: "#334155",
                    pointerEvents: "none",
                  }}
                >
                  {marker.state}
                </text>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
      
      {/* Legend inside map container */}
      <div className="absolute top-4 right-4 bg-white border border-border rounded-md shadow-sm p-3">
        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Severity</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] text-foreground font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" /> High (Stage 3)
          </div>
          <div className="flex items-center gap-2 text-[11px] text-foreground font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" /> Medium
          </div>
          <div className="flex items-center gap-2 text-[11px] text-foreground font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" /> Low
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 flex-shrink-0" /> No Alert
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-4 left-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          India · State-Level Disease Overview
        </div>
      </div>
    </div>
  );
}
