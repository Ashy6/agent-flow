/**
 * 外部聊天 API 客户端
 * 用于调用外部聊天服务（如 market-api.singulay.online）
 */

import { AgentChatConfig } from "../utils/agentConfig";

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<{ type: "text"; text: string }>;
}

export interface ChatRequestBody {
  messages: UIMessage[];
  modelId?: string;
  systemPrompt?: string;
  temperature?: number;
}

/**
 * 创建聊天客户端
 */
export function createChatClient(config: AgentChatConfig) {
  const baseUrl = config.chatApiUrl || "https://market-api.singulay.online/api";

  /**
   * 发送消息到聊天 API（流式）
   */
  async function sendMessage(
    messages: UIMessage[],
  ): Promise<ReadableStream<Uint8Array> | null> {
    const requestBody: ChatRequestBody = {
      messages,
    };

    // 添加配置参数
    if (config.modelId) {
      requestBody.modelId = config.modelId;
    }
    if (config.systemPrompt) {
      requestBody.systemPrompt = config.systemPrompt;
    }
    if (config.temperature !== undefined) {
      requestBody.temperature = config.temperature;
    }

    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.body;
  }

  /**
   * 发送消息并获取文本响应（非流式，用于简单场景）
   */
  async function sendMessageSimple(messages: UIMessage[]): Promise<string> {
    const stream = await sendMessage(messages);
    if (!stream) {
      throw new Error("No response stream");
    }

    // 使用统一的流解析函数
    return readSSEStream(stream);
  }

  /**
   * 获取可用的 agent 列表
   */
  async function getAgents(): Promise<{
    items: Array<{
      id: string;
      name: string;
      modelId: string;
      systemPrompt: string;
      temperature: number;
    }>;
  }> {
    const response = await fetch(`${baseUrl}/agents`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.status}`);
    }
    return response.json();
  }

  return {
    sendMessage,
    sendMessageSimple,
    getAgents,
  };
}

/**
 * 读取 SSE 流并返回完整文本（辅助函数）
 */
export async function readSSEStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            // 支持多种格式
            if (parsed.type === "text-delta") {
              // 尝试 textDelta 或 data 字段
              const deltaText = parsed.textDelta || parsed.data;
              if (deltaText) {
                fullText += deltaText;
              }
            } else if (parsed.type === "text" && parsed.text) {
              fullText = parsed.text;
            }
          } catch (e) {
            // 忽略解析错误
            console.warn("Failed to parse SSE line:", line, e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}
