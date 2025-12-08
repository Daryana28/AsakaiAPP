"use client";

// Import komponen yang sudah kita ubah logikanya tadi
import LineChartContainer from "@/components/LineChartContainer";

export default function StPage() {
  // Panggil komponen dengan dept="ST"
  return <LineChartContainer dept="ST" />;
}