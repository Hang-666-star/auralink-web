import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { api, ApiError } from "../lib/api.ts";
import { chronologicalItems, filterNodes, graphPage, KnowledgeContractError, metricNames, neighborIds, parsePaintingStatistics, parsePoetryGraph, topGroups, type PaintingStatistics, type PoetryGraph } from "../lib/knowledge-contracts.ts";

// Deliberately synthetic. No production CSV or poetry runtime snapshot is committed.
function statistics(): PaintingStatistics {
  return {
    schemaVersion: 1, population: { key: "gallery-displayable", label: "可浏览画作", count: 3 },
    authorNames: { count: 1, eligibleRecords: 2 },
    metrics: Object.fromEntries(metricNames.map((name) => [name, {
      status: "available", reason: null, eligibleRecords: 2, missingOrRestrictedRecords: 1,
      unmatchedRecords: 0, items: [{ name: "合成标签", value: 2 }], truncated: false, unit: "幅", method: "合成规则",
    }])) as PaintingStatistics["metrics"],
  };
}
function graph(): PoetryGraph {
  return {
    schemaVersion: 1, source: "legacy-poetry-snapshot", graphSha256: "a".repeat(64), statsSha256: "b".repeat(64), nodeCount: 3, edgeCount: 1,
    nodes: [
      { id: "a", name: "合成诗人", category: "人物", size: 15, description: '<img src=x onerror="alert(1)">' },
      { id: "b", name: "合成诗歌", category: "作品", size: 12, description: "测试作品" },
      { id: "c", name: "孤立节点", category: "作品", size: 12, description: "没有关系" },
    ],
    links: [{ source: "a", target: "b", label: "创作", summary: "创作", detail: "原始关系说明", value: 1 }],
    entityTypes: [{ name: "人物", value: 1 }, { name: "作品", value: 2 }], relationTypes: [{ name: "创作", value: 1 }], sourceLimits: ["合成测试，不是真实图谱"],
  };
}

describe("Knowledge public response contracts", () => {
  it("accepts bounded aggregate coverage, missing fields and signed rule estimates", () => {
    const input = statistics();
    input.metrics.style = { ...input.metrics.style, status: "unavailable", reason: "未公开风格字段", eligibleRecords: 0, missingOrRestrictedRecords: 3, items: [] };
    input.metrics.sentimentByDynasty.items = [{ name: "合成朝代", value: 25.5 }];
    assert.deepEqual(parsePaintingStatistics(input), input);
  });
  it("rejects inconsistent coverage, invalid counts, excessive groups and incompatible versions", () => {
    const input = statistics();
    input.metrics.dynasty.eligibleRecords = 4;
    assert.throws(() => parsePaintingStatistics(input), KnowledgeContractError);
    assert.throws(() => parsePaintingStatistics({ ...statistics(), schemaVersion: 2 }), KnowledgeContractError);
    assert.throws(() => parsePaintingStatistics({ ...statistics(), authorNames: { count: 3, eligibleRecords: 2 } }), KnowledgeContractError);
    const tooMany = statistics(); tooMany.metrics.category.items = Array(101).fill({ name: "标签", value: 1 });
    assert.throws(() => parsePaintingStatistics(tooMany), KnowledgeContractError);
  });
  it("accepts an empty population without fabricating charts", () => {
    const input = statistics(); input.population.count = 0; input.authorNames = { count: 0, eligibleRecords: 0 };
    for (const item of Object.values(input.metrics)) Object.assign(item, { status: "unavailable", eligibleRecords: 0, missingOrRestrictedRecords: 0, items: [] });
    assert.equal(parsePaintingStatistics(input).population.count, 0);
  });
  it("retains original text and relationships, ignoring legacy HTML tooltip payloads", () => {
    const input = graph();
    const parsed = parsePoetryGraph({ ...input, nodes: input.nodes.map((node) => ({ ...node, tooltip: "<script>alert(1)</script>" })) });
    assert.deepEqual(parsed, input);
    assert.equal("tooltip" in parsed.nodes[0], false);
  });
  it("rejects duplicate IDs, dangling endpoints and mismatched entity summaries", () => {
    const duplicate = graph(); duplicate.nodes[1].id = "a";
    assert.throws(() => parsePoetryGraph(duplicate), KnowledgeContractError);
    const dangling = graph(); dangling.links[0].target = "missing";
    assert.throws(() => parsePoetryGraph(dangling), KnowledgeContractError);
    const mismatch = graph(); mismatch.entityTypes[0].value = 2;
    assert.throws(() => parsePoetryGraph(mismatch), KnowledgeContractError);
    assert.throws(() => parsePoetryGraph({ ...graph(), nodeCount: 4 }), KnowledgeContractError);
  });
  it("verifies relation summaries using the original first-comma-token rule", () => {
    const input = graph(); input.links[0].label = "创作,合成附加标签";
    assert.equal(parsePoetryGraph(input).relationTypes[0].value, 1);
    input.relationTypes.push({ name: "合成附加标签", value: 1 });
    assert.throws(() => parsePoetryGraph(input), KnowledgeContractError);
  });
  it("preserves geographic pair counts separately from painting coverage", () => {
    const input = statistics();
    input.metrics.geography = {
      status: "available", reason: null, eligibleRecords: 2, missingOrRestrictedRecords: 1,
      unmatchedRecords: 0, items: [{ name: "浙江省", value: 1 }], truncated: false,
      unit: "作者名与出生地组合", method: "公开名称与出生地文本去重；未核验人物身份。",
    };
    const parsed = parsePaintingStatistics(input);
    assert.deepEqual(parsed.metrics.geography, input.metrics.geography);
    assert.equal(parsed.population.count, 3);
    assert.equal(parsed.authorNames.count, 1);
    assert.equal(parsed.metrics.geography.eligibleRecords, 2);
    assert.equal(parsed.metrics.geography.items[0].value, 1);
  });
});

describe("Knowledge graph interactions", () => {
  it("searches names and categories while category filtering remains exact", () => {
    assert.deepEqual(filterNodes(graph().nodes, " 合成 ", "作品").map((node) => node.id), ["b"]);
    assert.deepEqual(filterNodes(graph().nodes, "人物", "").map((node) => node.id), ["a"]);
    assert.deepEqual(filterNodes(graph().nodes, "不存在", ""), []);
  });
  it("clamps an old page after filtering and handles empty results", () => {
    const nodes = Array.from({ length: 41 }, (_, index) => ({ ...graph().nodes[0], id: String(index) }));
    assert.equal(graphPage(nodes, 2).items.length, 1);
    assert.equal(graphPage(filterNodes(nodes, "诗人", "" ).slice(0, 1), 2).page, 0);
    assert.deepEqual(graphPage([], 8), { page: 0, pageCount: 1, items: [] });
  });
  it("finds one-hop neighbors in both directions and preserves isolated nodes", () => {
    assert.deepEqual(neighborIds(graph().links, "a"), new Set(["a", "b"]));
    assert.deepEqual(neighborIds(graph().links, "b"), new Set(["b", "a"]));
    assert.deepEqual(neighborIds(graph().links, "c"), new Set(["c"]));
  });
  it("orders dynasty labels without rewriting unknown values or modern labels", () => {
    const input = ["清", "未核实某时期", "现代", "唐代", "五代", "宋"].map((name) => ({ name, value: 1 }));
    assert.deepEqual(chronologicalItems(input).map((item) => item.name), ["唐代", "五代", "宋", "清", "现代", "未核实某时期"]);
    assert.equal(input[0].name, "清");
  });
  it("keeps the complete denominator when limiting relation groups", () => {
    const input = [{ name: "甲", value: 3 }, { name: "乙", value: 2 }, { name: "丙", value: 1 }];
    assert.deepEqual(topGroups(input, 1), [{ name: "甲", value: 3 }, { name: "其余关系标签（2 项）", value: 3 }]);
    assert.deepEqual(topGroups(input, 0), input);
  });
});

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
describe("Knowledge API transport", () => {
  it("loads both no-map resources without requesting a geographic asset", async () => {
    const paths: string[] = [];
    globalThis.fetch = async (url, init) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer isolated-test-token");
      const body = path === "/api/v1/knowledge/painting-statistics" ? statistics()
        : path === "/api/v1/knowledge/poetry-graph" ? graph() : assert.fail(`Unexpected request: ${path}`);
      return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    };
    const [paintings, poetry] = await Promise.all([api.paintingStatistics("isolated-test-token"), api.poetryGraph("isolated-test-token")]);
    assert.equal(paintings.population.count, 3);
    assert.equal(poetry.nodeCount, 3);
    assert.deepEqual(paths.sort(), ["/api/v1/knowledge/painting-statistics", "/api/v1/knowledge/poetry-graph"]);
    assert.equal("chinaMap" in api, false);
  });
  it("uses authenticated GET, JSON negotiation and an abort signal", async () => {
    const controller = new AbortController();
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).endsWith("/api/v1/knowledge/painting-statistics"));
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer isolated-test-token");
      assert.equal(new Headers(init?.headers).get("Accept"), "application/json");
      assert.equal(init?.signal, controller.signal);
      assert.equal(init?.body, undefined);
      return new Response(JSON.stringify(statistics()), { headers: { "Content-Type": "application/json" } });
    };
    assert.equal((await api.paintingStatistics("isolated-test-token", controller.signal)).population.count, 3);
  });
  it("surfaces unavailable snapshots and unauthorized responses without mutating the session", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ code: "KNOWLEDGE_SNAPSHOT_UNAVAILABLE", message: "快照未配置" }), { status: 503, headers: { "Content-Type": "application/json" } });
    await assert.rejects(api.poetryGraph("isolated-test-token"), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === "KNOWLEDGE_SNAPSHOT_UNAVAILABLE");
    globalThis.fetch = async () => new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } });
    await assert.rejects(api.paintingStatistics("expired-test-token"), (error: unknown) => error instanceof ApiError && error.kind === "unauthorized");
  });
  it("rejects successful HTML or malformed JSON responses as an incompatible contract", async () => {
    globalThis.fetch = async () => new Response("<html>proxy page</html>", { headers: { "Content-Type": "text/html" } });
    await assert.rejects(api.poetryGraph("isolated-test-token"), KnowledgeContractError);
  });
});
