"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Info,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { useToast } from "@/contexts/ToastContext";
import { jobService } from "@/lib/api/services/jobs";
import { agentService, AgentDto } from "@/lib/api/services/agents";
import { ragService, RetrievedDocument } from "@/lib/api/services/rag";
import { useWalletStore } from "@/store/walletStore";
import { decodeAgentDescription } from "@/lib/utils/agentConfig";

function CreateJobForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { isConnected } = useWalletStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [agents, setAgents] = useState<AgentDto[]>([]);

  // 防止 RAG 重复初始化
  const ragInitializedRef = useRef(false);

  // todo2 自动分配相关状态
  const [allocationMode, setAllocationMode] = useState<"manual" | "auto">(
    "manual",
  );
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [recommendedAgents, setRecommendedAgents] = useState<
    Array<{
      agent: AgentDto;
      score: number;
      reason?: string;
    }>
  >([]);

  const [formData, setFormData] = useState({
    title: "",
    category: "",
    description: "",
    expectedResult: "",
    agentId: searchParams.get("agentId") || "",
  });

  // 获取可用的 Agents 并初始化向量库
  useEffect(() => {
    const fetchAgentsAndInitRag = async () => {
      setIsLoadingAgents(true);
      try {
        const response = await agentService.getAgentList({
          page: 1,
          pageSize: 100,
        });
        const enabledAgents = response.items.filter(
          (a) => a.status === "enabled",
        );
        setAgents(enabledAgents);

        // todo2 初始化 RAG 向量库（用于自动匹配）- 仅初始化一次
        if (enabledAgents.length > 0 && !ragInitializedRef.current) {
          ragInitializedRef.current = true;
          try {
            const documents = enabledAgents.map((agent) => {
              // 解码获取原始描述（后期删除）
              const { baseDescription } = decodeAgentDescription(
                agent.description,
              );
              return {
                id: agent.id,
                content: `Agent名称: ${agent.name}\n描述: ${baseDescription}\n价格: ${agent.price} APT`,
                metadata: {
                  agentId: agent.id,
                  name: agent.name,
                  price: agent.price,
                },
              };
            });

            await ragService.initVectorStore({
              namespace: "agents",
              documents,
            });
          } catch (ragError) {
            console.warn("RAG 向量库初始化失败:", ragError);
            // 初始化失败时重置标记，允许重试
            ragInitializedRef.current = false;
          }
        }
      } catch (error) {
        console.error("获取 Agents 失败:", error);
        toast.error("获取 Agents 列表失败");
      } finally {
        setIsLoadingAgents(false);
      }
    };

    fetchAgentsAndInitRag();
  }, []);

  // todo2 检查是否可以自动分配（描述和预期结果都填写了）
  const canAutoMatch =
    formData.description.trim().length > 0 &&
    formData.expectedResult.trim().length > 0;

  // 自动匹配 Agent
  const handleAutoMatch = async () => {
    if (!canAutoMatch) {
      toast.error("请先填写任务描述和预期结果");
      return;
    }

    setIsAutoMatching(true);
    setRecommendedAgents([]);

    try {
      // 构建查询内容
      const queryContent = `任务描述: ${formData.description.trim()}\n预期结果: ${formData.expectedResult.trim()}`;

      // 调用 RAG 查询获取相似文档
      const response = await ragService.queryDocuments({
        namespace: "agents",
        query: queryContent,
        topK: 5,
      });

      // 接口直接返回数组
      const documents: RetrievedDocument[] = Array.isArray(response)
        ? response
        : [];

      if (documents.length > 0) {
        // 解析返回的文档，从 text 字段获取 agent 信息
        const matchedAgents = documents
          .map((doc) => {
            try {
              // 尝试从 text 字段解析 JSON
              let agentId: string | undefined;
              if (doc.text) {
                const parsed = JSON.parse(doc.text);
                agentId = parsed.id;
              }
              // 备选：从 metadata 获取
              if (!agentId) {
                agentId = doc.metadata?.agentId as string;
              }
              if (!agentId) {
                agentId = doc.id;
              }

              const agent = agents.find((a) => a.id === agentId);
              if (agent) {
                return {
                  agent,
                  score: doc.score,
                  reason: doc.content,
                };
              }
            } catch {
              // JSON 解析失败，尝试从 metadata 或 id 获取
              const agentId = (doc.metadata?.agentId as string) || doc.id;
              const agent = agents.find((a) => a.id === agentId);
              if (agent) {
                return {
                  agent,
                  score: doc.score,
                  reason: doc.content,
                };
              }
            }
            return null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        if (matchedAgents.length > 0) {
          setRecommendedAgents(matchedAgents);
          // 默认选中第一条
          setFormData((prev) => ({
            ...prev,
            agentId: matchedAgents[0].agent.id,
          }));
          toast.success(`找到 ${matchedAgents.length} 个匹配的 Agent`);
        } else {
          toast.info("未找到匹配的 Agent，请手动选择");
        }
      } else {
        toast.info("未找到匹配的 Agent，请手动选择");
      }
    } catch (error) {
      console.error("自动匹配失败:", error);
      toast.error("自动匹配失败，请手动选择 Agent");
    } finally {
      setIsAutoMatching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected) {
      toast.error("请先连接钱包");
      return;
    }

    if (!formData.title.trim()) {
      toast.error("请输入任务标题");
      return;
    }

    if (!formData.agentId) {
      toast.error("请选择 Agent");
      return;
    }

    if (!formData.category.trim()) {
      toast.error("请输入任务分类");
      return;
    }

    if (!formData.description.trim()) {
      toast.error("请输入任务描述");
      return;
    }

    if (!formData.expectedResult.trim()) {
      toast.error("请输入预期结果");
      return;
    }

    setIsSubmitting(true);
    try {
      await jobService.createJob({
        agentId: formData.agentId,
        title: formData.title.trim(),
        category: formData.category.trim(),
        description: formData.description.trim(),
        expectedResult: formData.expectedResult.trim(),
      });

      toast.success("任务创建成功！");
      router.push("/jobs");
    } catch (error) {
      console.error("创建任务失败:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === formData.agentId);

  if (!isConnected) {
    return (
      <div className="min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600 mb-4">请先连接钱包以创建任务</p>
            <Link href="/jobs">
              <Button variant="outline">返回列表</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">创建新任务</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  任务标题 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  required
                  maxLength={120}
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                  placeholder="输入任务标题（最多 120 字符）"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label
                  htmlFor="category"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  任务分类 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="category"
                  required
                  maxLength={80}
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                  placeholder="如：文本处理、数据分析、代码生成等"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  任务描述 <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  required
                  rows={4}
                  maxLength={2000}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400 resize-none"
                  placeholder="详细描述任务需求（最多 2000 字符）"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label
                  htmlFor="expectedResult"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  预期结果 <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="expectedResult"
                  required
                  rows={3}
                  maxLength={2000}
                  value={formData.expectedResult}
                  onChange={(e) =>
                    setFormData({ ...formData, expectedResult: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400 resize-none"
                  placeholder="描述期望的交付结果（最多 2000 字符）"
                  disabled={isSubmitting}
                />
              </div>

              {/* Agent 选择与费用 */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Agent 选择与费用
                </h3>

                {/* 分配模式选择 */}
                <div className="flex items-center gap-6 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="allocationMode"
                      checked={allocationMode === "manual"}
                      onChange={() => {
                        setAllocationMode("manual");
                        setRecommendedAgents([]);
                      }}
                      className="w-4 h-4 text-purple-600"
                      disabled={isSubmitting}
                    />
                    <span className="text-sm text-gray-700">指定 Agent</span>
                  </label>
                  <label
                    className={`flex items-center gap-2 ${canAutoMatch ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="radio"
                      name="allocationMode"
                      checked={allocationMode === "auto"}
                      onChange={() => {
                        if (canAutoMatch) {
                          setAllocationMode("auto");
                          handleAutoMatch();
                        }
                      }}
                      disabled={!canAutoMatch || isSubmitting}
                      className="w-4 h-4 text-purple-600"
                    />
                    <span className="text-sm text-gray-700">
                      自动分配 (系统匹配)
                    </span>
                  </label>
                </div>

                {/* 手动选择模式 */}
                {allocationMode === "manual" && (
                  <div>
                    <label
                      htmlFor="agentId"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      选择 Agent <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="agentId"
                      required
                      value={formData.agentId}
                      onChange={(e) =>
                        setFormData({ ...formData, agentId: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                      disabled={isSubmitting || isLoadingAgents}
                    >
                      <option value="">
                        {isLoadingAgents ? "加载中..." : "请选择 Agent"}
                      </option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} -{" "}
                          {parseFloat(agent.price) === 0
                            ? "免费"
                            : `${agent.price} APT`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 自动分配模式 */}
                {allocationMode === "auto" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="autoAgentId"
                        className="block text-sm font-medium text-gray-700"
                      >
                        推荐 Agent <span className="text-red-500">*</span>
                      </label>
                      {recommendedAgents.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleAutoMatch}
                          disabled={isAutoMatching}
                          className="text-purple-600 hover:text-purple-700"
                        >
                          <RefreshCw
                            className={`w-4 h-4 mr-1 ${isAutoMatching ? "animate-spin" : ""}`}
                          />
                          重新匹配
                        </Button>
                      )}
                    </div>
                    <div className="relative">
                      <select
                        id="autoAgentId"
                        value={formData.agentId}
                        onChange={(e) =>
                          setFormData({ ...formData, agentId: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                        disabled={isSubmitting || isAutoMatching}
                      >
                        {isAutoMatching ? (
                          <option value="">智能匹配中...</option>
                        ) : recommendedAgents.length > 0 ? (
                          recommendedAgents.map(({ agent, score }) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name} -{" "}
                              {parseFloat(agent.price) === 0
                                ? "免费"
                                : `${agent.price} APT`}{" "}
                              (匹配度: {(score * 100).toFixed(0)}%)
                            </option>
                          ))
                        ) : (
                          <option value="">未找到匹配的 Agent</option>
                        )}
                      </select>
                      {isAutoMatching && (
                        <div className="absolute right-10 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                        </div>
                      )}
                    </div>
                    {!isAutoMatching && recommendedAgents.length > 0 && (
                      <p className="mt-2 text-sm text-gray-500 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        已根据任务描述智能匹配，共找到{" "}
                        {recommendedAgents.length} 个推荐 Agent
                      </p>
                    )}
                  </div>
                )}

                {/* 预计费用显示 */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <span className="text-lg">$</span> 预计费用
                    </span>
                    <span className="font-medium text-gray-800">
                      {selectedAgent
                        ? parseFloat(selectedAgent.price) === 0
                          ? "免费"
                          : `${selectedAgent.price} APT`
                        : "根据匹配结果确定"}
                    </span>
                  </div>
                </div>

                {/* 提示信息 */}
                <div className="mt-3 flex items-start gap-2 text-sm text-gray-500">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>
                    Job 创建成功时，任务费用将被锁定。
                    {allocationMode === "auto" &&
                      "自动分配模式下，系统将为您匹配最合适的 Agent，费用将在匹配成功后锁定。"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    "创建任务"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                >
                  取消
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// 加载状态组件
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
    </div>
  );
}

// 主页面组件，使用 Suspense 包裹表单
export default function CreateJobPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CreateJobForm />
    </Suspense>
  );
}
