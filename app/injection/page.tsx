"use client";

import LineChartContainer from "@/components/LineChartContainer";

export default function InjectionPage() {
 
  console.log("Isi Component:", LineChartContainer);

  return <LineChartContainer dept="INJECTION" />;
}