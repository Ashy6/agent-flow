"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { useToast } from "@/contexts/ToastContext";
import { agentService } from "@/lib/api/services/agents";
import { ragService } from "@/lib/api/services/rag";
import { useWalletStore } from "@/store/walletStore";
import {
  AgentChatConfig,
  encodeAgentDescription,
} from "@/lib/utils/agentConfig";

export default function CreateAgentPage() {
  const router = useRouter();
  const toast = useToast();
  const { isConnected } = useWalletStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    description: "",
    price: "",
  });

  // 聊天配置 - 简化版
  const [chatConfig, setChatConfig] = useState<Partial<AgentChatConfig>>({
    agentId: "",
    modelId: "",
    temperature: 0.7,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected) {
      toast.error("请先连接钱包");
      return;
    }

    if (!formData.name.trim()) {
      toast.error("请输入 Agent 名称");
      return;
    }

    if (!formData.url.trim()) {
      toast.error("请输入 Agent 地址");
      return;
    }

    const agentUrl = formData.url.trim();
    try {
      new URL(agentUrl);
    } catch {
      toast.error("Agent 执行地址格式不正确");
      return;
    }

    const baseDescription = formData.description.trim();
    const temperature = chatConfig.temperature ?? 0.7;
    if (temperature < 0 || temperature > 2) {
      toast.error("温度参数必须在 0-2 之间");
      return;
    }

    setIsSubmitting(true);
    try {
      const fullChatConfig: AgentChatConfig = {
        chatApiUrl: agentUrl,
        agentId: chatConfig.agentId?.trim() || undefined,
        modelId: chatConfig.modelId?.trim() || undefined,
        systemPrompt: baseDescription,
        temperature,
      };

      // 将配置编码到 description 中
      const encodedDescription = encodeAgentDescription(
        baseDescription,
        fullChatConfig,
      );

      const createdAgent = await agentService.createAgent({
        name: formData.name.trim(),
        url: agentUrl,
        description: encodedDescription || undefined,
        price: formData.price || "0",
      });

      // todo2: 后期走接口实现。将 Agent 信息追加到 RAG 向量库（用于后续智能匹配）
      try {
        await ragService.appendDocuments({
          namespace: "agents",
          documents: [
            {
              id: createdAgent.id,
              content: `Agent名称: ${createdAgent.name}\n描述: ${baseDescription}\n价格: ${createdAgent.price} APT`,
              metadata: {
                agentId: createdAgent.id,
                name: createdAgent.name,
                price: createdAgent.price,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });
      } catch (ragError) {
        // RAG 追加失败不影响主流程，仅打印警告
        console.warn("RAG 文档追加失败:", ragError);
      }

      toast.success("Agent 注册成功！");
      router.push("/agents");
    } catch (error) {
      console.error("注册失败:", error);
      toast.error(error instanceof Error ? error.message : "注册失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateChatConfig = (updates: Partial<AgentChatConfig>) => {
    setChatConfig((prev) => ({ ...prev, ...updates }));
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600 mb-4">请先连接钱包以注册 Agent</p>
            <Link href="/agents">
              <Button variant="outline">返回列表</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Back Button */}
        <Link
          href="/agents"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">注册新 Agent</CardTitle>
            <p className="text-sm text-gray-500 mt-2">
              创建一个智能体，可以通过外部 API 提供聊天能力
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 基础信息 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  基础信息
                </h3>

                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Agent 名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                    placeholder="例如：智能文本分析 Agent"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label
                    htmlFor="url"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Agent 执行地址 (URL) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    id="url"
                    required
                    value={formData.url}
                    onChange={(e) =>
                      setFormData({ ...formData, url: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                    placeholder="https://market-api.singulay.online/api"
                    disabled={isSubmitting}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Agent 的主要执行接口地址（用于 Job 调用和聊天功能）
                  </p>
                </div>

                {/* 高级配置 */}
                <div className="border-t pt-6">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-purple-600" />
                      高级配置（可选）
                    </h3>
                    {showAdvanced ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  <p className="text-sm text-gray-500 mt-2 mb-4">
                    配置 AI 模型的高级参数
                  </p>

                  {showAdvanced && (
                    <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium mb-1">配置说明</p>
                          <p>
                            这些参数将影响 AI
                            的回答行为。如无特殊需求，使用默认值即可。
                          </p>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="modelId"
                          className="block text-sm font-medium text-gray-700 mb-2"
                        >
                          模型 ID（可选）
                        </label>
                        <input
                          type="text"
                          id="modelId"
                          value={chatConfig.modelId || ""}
                          onChange={(e) =>
                            updateChatConfig({ modelId: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                          placeholder="doubao-pro-32k"
                          disabled={isSubmitting}
                        />
                        <p className="mt-1 text-sm text-gray-500">
                          指定使用的模型 ID，如不填写则使用默认模型
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="temperature"
                          className="block text-sm font-medium text-gray-700 mb-2"
                        >
                          温度参数（0-2）
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            id="temperature"
                            min="0"
                            max="2"
                            step="0.1"
                            value={chatConfig.temperature ?? 0.7}
                            onChange={(e) =>
                              updateChatConfig({
                                temperature: parseFloat(e.target.value),
                              })
                            }
                            className="flex-1"
                            disabled={isSubmitting}
                          />
                          <span className="text-sm font-mono text-gray-700 w-12 text-right">
                            {(chatConfig.temperature ?? 0.7).toFixed(1)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          控制回答的随机性。0 = 更确定，2 = 更随机创造
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {/* 描述 */}
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    描述 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="description"
                    rows={4}
                    required
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400 resize-none"
                    placeholder="描述 Agent 的功能和用途，例如：提供高质量的文本分析服务，擅长长文本处理和总结"
                    disabled={isSubmitting}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    这段描述将显示在 Agent 列表和详情页，同时作为 AI
                    的系统提示词
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="price"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    服务费用 (APT) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="price"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
                    placeholder="0"
                    disabled={isSubmitting}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    设置为 0 表示免费服务
                  </p>
                </div>
              </div>

              {/* 注册按钮 */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      提交中...
                    </>
                  ) : (
                    "提交注册"
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

        {/* 帮助提示 */}
        <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-medium text-purple-900 mb-2">创建提示</h4>
          <ul className="text-sm text-purple-800 space-y-1">
            <li>• Agent 地址用于执行 Job 任务和聊天功能</li>
            <li>• 描述内容将作为 AI 的系统提示词，影响其回答风格</li>
            <li>• 高级配置为可选项，如无特殊需求使用默认值即可</li>
            <li>• 配置完成后，用户可以在会话页面与你的 Agent 对话</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
