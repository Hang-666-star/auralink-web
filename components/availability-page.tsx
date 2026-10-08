import { StatePanel } from "@/components/state-panel";

export function AvailabilityPage({ title, pending = false, description }: { title: string; pending?: boolean; description: string }) {
  return (
    <main className="page-shell availability-page">
      <header className="page-header glass-panel"><div><h1>{title}</h1><p>{description}</p></div></header>
      <StatePanel
        kind={pending ? "pending" : "unavailable"}
        title={pending ? "正在接入" : "暂未开放"}
        description={pending ? "我们正在按真实后端能力和状态契约完成接入，不会展示模拟结果。" : "当前后端尚无可验证的产品接口，这里不会使用模拟数据或虚假操作。"}
        actionLabel="返回画廊"
        actionHref="/gallery"
      />
    </main>
  );
}
