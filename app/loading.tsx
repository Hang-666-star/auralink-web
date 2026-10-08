import { StatePanel } from "@/components/state-panel";

export default function Loading() {
  return <main className="page-shell"><StatePanel kind="loading" title="正在铺展画卷" description="内容加载中，请稍候。" /></main>;
}
