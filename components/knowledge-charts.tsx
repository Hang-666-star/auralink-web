"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, PieChart, LineChart, GraphChart } from "echarts/charts";
import { TooltipComponent, GridComponent, AriaComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { StatePanel } from "@/components/state-panel";
import type { CountItem, PoetryNode, PoetryLink } from "@/lib/knowledge-contracts";
import { neighborIds } from "@/lib/knowledge-contracts";
import { resizeMeasuredChart } from "@/lib/chart-resize";
import { paintingChartHeight } from "@/lib/knowledge-presentation";

echarts.use([BarChart, PieChart, LineChart, GraphChart, TooltipComponent, GridComponent, AriaComponent, CanvasRenderer]);
const palette = ["#8b6b52", "#657763", "#ad875d", "#778b8c", "#986b6a", "#baa07b", "#78727e", "#9f956b"];
const textStyle = { color: "#6b5f4e", fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' };
const base: EChartsOption = {
  color: palette, textStyle, animationDuration: 250,
  // Canvas rich text never inserts labels or descriptions into HTML.
  tooltip: { renderMode: "richText", confine: true, backgroundColor: "#fcf8f2", borderColor: "#d8cabc", textStyle },
  aria: { enabled: true },
};

type Click = { dataType?: string; data?: { id?: string; source?: string; target?: string }; dataIndex?: number };
function CanvasChart({ option, label, onClick, className = "", height }: { option: EChartsOption; label: string; onClick?: (event: Click) => void; className?: string; height?: number }) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.EChartsType | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const container = element.current;
    const chart = echarts.init(container, undefined, { renderer: "canvas" });
    instance.current = chart;
    const observer = new ResizeObserver(() => { resizeMeasuredChart(chart, container); });
    observer.observe(container);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => {
    if (!instance.current) return;
    try { instance.current.setOption(option, { notMerge: true }); setFailed(false); }
    catch { setFailed(true); }
  }, [option]);
  useEffect(() => {
    const chart = instance.current;
    if (!chart || !onClick) return;
    const handle = (event: unknown) => onClick(event as Click);
    chart.on("click", handle);
    return () => { chart.off("click", handle); };
  }, [onClick]);
  return <>
    <div className={`knowledge-chart ${className}`} style={height === undefined ? undefined : { height }} ref={element} role="img" aria-label={label} />
    {failed ? <StatePanel compact kind="error" title="图表暂时无法绘制" description="可在下方数据列表查看数值。请重新加载页面后重试。" /> : null}
  </>;
}

export function MetricChart({ items, kind, unit, label, compact = false }: { items: CountItem[]; kind: "bar" | "pie" | "line"; unit: string; label: string; compact?: boolean }) {
  const option = useMemo<EChartsOption>(() => {
    const common = { ...base, tooltip: { ...base.tooltip, valueFormatter: (value: unknown) => `${String(value)} ${unit}` } };
    if (kind === "pie") return { ...common, series: [{ type: "pie", radius: ["46%", "72%"], center: ["50%", "48%"], label: { show: false }, emphasis: { label: { show: true, formatter: "{b}\n{c}", color: "#5c3a26" } }, data: items }] };
    if (kind === "line") return {
      ...common, grid: { top: 22, right: 18, left: 45, bottom: 68 },
      xAxis: { type: "category", data: items.map((item) => item.name), axisLabel: { rotate: 30, width: 65, overflow: "truncate" } },
      yAxis: { type: "value", min: 0, max: 100, splitLine: { lineStyle: { color: "#e5dcd0" } } },
      series: [{ type: "line", data: items.map((item) => item.value), symbolSize: 8, smooth: false, lineStyle: { color: palette[1] }, itemStyle: { color: palette[1] } }],
    };
    return {
      ...common, grid: { top: 14, right: 38, left: 105, bottom: 24 },
      xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#e5dcd0" } } },
      yAxis: { type: "category", inverse: true, data: items.map((item) => item.name), axisLabel: { width: 90, overflow: "truncate" }, axisTick: { show: false }, axisLine: { show: false } },
      series: [{ type: "bar", data: items.map((item) => item.value), barMaxWidth: 19, label: { show: true, position: "right", color: "#6b5f4e" }, itemStyle: { borderRadius: [0, 3, 3, 0] } }],
    };
  }, [items, kind, unit]);
  return <><CanvasChart option={option} label={label} height={compact ? paintingChartHeight(kind, items.length) : undefined} />{kind === "pie" ? <><ul className="knowledge-legend" aria-label={`${label}图例`}>{items.slice(0, 21).map((item, index) => <li key={`${item.name}-${index}`}><span style={{ background: palette[index % palette.length] }} aria-hidden="true" /><b>{item.name}</b><em>{item.value}</em></li>)}</ul>{items.length > 21 ? <p className="knowledge-method">图例列出前 21 项，完整数值见下方列表；环图仍包含全部项目。</p> : null}</> : null}</>;
}

export function PoetryChart({ nodes, links, selectedId, focused, onNode, onEdge }: {
  nodes: PoetryNode[]; links: PoetryLink[]; selectedId: string | null; focused: boolean;
  onNode: (id: string) => void; onEdge: (link: PoetryLink) => void;
}) {
  const option = useMemo<EChartsOption>(() => {
    const categories = [...new Set(nodes.map((node) => node.category))];
    const neighbors = selectedId ? neighborIds(links, selectedId) : null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return {
      ...base, animation: !reducedMotion,
      series: [{
        type: "graph", layout: "force", roam: true, draggable: true, zoom: !focused && nodes.length > 100 ? 0.35 : 1, center: ["50%", "50%"],
        scaleLimit: { min: 0.15, max: 8 },
        force: { repulsion: focused ? 240 : 100, gravity: 0.07, edgeLength: [40, 105], layoutAnimation: !reducedMotion },
        categories: categories.map((name) => ({ name })),
        label: { show: focused || nodes.length < 45, position: "right", color: "#514534", fontSize: 11 },
        edgeSymbol: ["none", "none"],
        emphasis: { focus: "adjacency", label: { show: true }, lineStyle: { width: 3 } },
        data: nodes.map((node) => ({ id: node.id, name: node.name, category: categories.indexOf(node.category), symbolSize: node.id === selectedId ? 27 : Math.min(20, Math.max(7, node.size / 1.4)), itemStyle: { opacity: !neighbors || neighbors.has(node.id) ? 1 : 0.14, borderWidth: node.id === selectedId ? 3 : 1, borderColor: node.id === selectedId ? "#332b20" : "#fbf7ed" }, label: { show: node.id === selectedId || focused || nodes.length < 45 } })),
        links: links.map((link) => ({ source: link.source, target: link.target, value: link.value, name: link.label, lineStyle: { opacity: !selectedId || link.source === selectedId || link.target === selectedId ? 0.58 : 0.06, width: selectedId && (link.source === selectedId || link.target === selectedId) ? 2 : 0.8, color: "#8d9a86", curveness: 0.08 } })),
      }],
    };
  }, [focused, links, nodes, selectedId]);
  return <CanvasChart option={option} label={`诗词力导向图，${nodes.length} 个实体、${links.length} 条关系；可通过下方实体卡和关系列表进行键盘操作`} className="knowledge-graph" onClick={(event) => {
    if (event.dataType === "edge" && typeof event.dataIndex === "number" && links[event.dataIndex]) onEdge(links[event.dataIndex]);
    else if (event.data?.id) onNode(event.data.id);
  }} />;
}
