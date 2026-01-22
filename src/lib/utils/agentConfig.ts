// todo：接口支持后，urlOption 字段支持对象参数，即不再需要这些解析的兼容方案

/**
 * Agent 聊天配置工具
 * 用于在 description 字段中存储和解析聊天配置
 */

export interface AgentChatConfig {
  chatApiUrl?: string; // 聊天 API 基础地址
  agentId?: string; // 外部服务的 agent ID
  modelId?: string; // 模型 ID
  systemPrompt?: string; // 系统提示词
  temperature?: number; // 温度参数 (0-2)
}

const CONFIG_SEPARATOR = "\n---CONFIG---\n";

/**
 * 编码：将描述文本和配置合并
 */
export function encodeAgentDescription(
  description: string,
  config?: AgentChatConfig,
): string {
  const cleanDescription = description.trim();

  if (!config || Object.keys(config).length === 0) {
    return cleanDescription;
  }

  return `${cleanDescription}${CONFIG_SEPARATOR}${JSON.stringify(config)}`;
}

/**
 * 解码：从描述文本中提取配置
 */
export function decodeAgentDescription(encodedDescription: string): {
  description: string;
  config: AgentChatConfig | null;
} {
  if (!encodedDescription) {
    return { description: "", config: null };
  }

  const parts = encodedDescription.split(CONFIG_SEPARATOR);

  if (parts.length === 1) {
    // 没有配置
    return { description: parts[0].trim(), config: null };
  }

  try {
    const config = JSON.parse(parts[1]) as AgentChatConfig;
    return {
      description: parts[0].trim(),
      config,
    };
  } catch (error) {
    console.error("解析 Agent 配置失败:", error);
    return {
      description: parts[0].trim(),
      config: null,
    };
  }
}

/**
 * 验证聊天配置
 */
export function validateChatConfig(config: Partial<AgentChatConfig>): string[] {
  const errors: string[] = [];

  if (config.chatApiUrl && !isValidUrl(config.chatApiUrl)) {
    errors.push("聊天 API 地址格式不正确");
  }

  if (config.temperature !== undefined) {
    const temp = Number(config.temperature);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      errors.push("温度参数必须在 0-2 之间");
    }
  }

  return errors;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取默认配置
 */
export function getDefaultChatConfig(): AgentChatConfig {
  return {
    chatApiUrl: "https://market-api.singulay.online/api",
    temperature: 0.7,
  };
}
