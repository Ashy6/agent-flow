/**
 * Agents 相关 API 服务
 */

import apiClient from "../client";
import { API_CONFIG } from "../config";
import { mockAgents } from "../mock";

// ============ 类型定义 ============

// Agent 状态枚举
export type AgentStatus = "enabled" | "disabled";

// Agent 数据传输对象
export interface AgentDto {
  id: string; // Agent ID
  ownerUserId: string; // 创建者用户 ID
  name: string; // Agent 名称
  url: string; // 执行地址（非 owner 时返回空字符串）
  description: string; // 描述
  price: string; // 单次执行价格（平台币）
  status: AgentStatus; // 状态
  createdAt: string; // 创建时间（ISO 8601）
  updatedAt: string; // 更新时间（ISO 8601）
}

// 分页信息
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

// 创建 Agent 请求
export interface CreateAgentRequest {
  name: string; // Agent 名称
  url: string; // 执行地址（URL）
  urlOption?: any; // 配置选项（任意对象） todo: 接口支持后跳转对象参数
  description?: string; // 描述（可选）
  price: string; // 单次执行价格（字符串）
}

// 更新 Agent 请求
export interface UpdateAgentRequest {
  name?: string;
  url?: string;
  description?: string;
  price?: string;
  status?: AgentStatus;
}

// 列表查询参数
export interface AgentListParams {
  page?: number; // 页码（从 1 开始，默认 1）
  pageSize?: number; // 每页条数（默认 20，最大 100）
}

// 我的 Agent 列表查询参数
export interface MyAgentListParams extends AgentListParams {
  status?: AgentStatus; // 状态筛选
}

// ============ API 方法 ============

/**
 * 创建 Agent（需要登录）
 */
export async function createAgent(data: CreateAgentRequest): Promise<AgentDto> {
  if (API_CONFIG.USE_MOCK) {
    return mockAgents.createAgent(data) as Promise<AgentDto>;
  }
  return apiClient.post<AgentDto>("/agents", data);
}

/**
 * 获取 Agent 列表（公开，仅 enabled）
 */
export async function getAgentList(
  params?: AgentListParams,
): Promise<PaginatedResponse<AgentDto>> {
  if (API_CONFIG.USE_MOCK) {
    return mockAgents.getAgentList(params) as Promise<
      PaginatedResponse<AgentDto>
    >;
  }
  return apiClient.get<PaginatedResponse<AgentDto>>("/agents", {
    params: params as Record<string, string | number | undefined>,
    skipAuth: true,
  });
}

/**
 * 获取我的 Agent 列表（需要登录）
 */
export async function getMyAgents(
  params?: MyAgentListParams,
): Promise<PaginatedResponse<AgentDto>> {
  if (API_CONFIG.USE_MOCK) {
    return mockAgents.getMyAgents(params) as Promise<
      PaginatedResponse<AgentDto>
    >;
  }
  return apiClient.get<PaginatedResponse<AgentDto>>("/agents/me", {
    params: params as Record<string, string | number | undefined>,
  });
}

/**
 * 获取 Agent 详情（公开）
 * 注意：非 owner 时 url 返回空字符串
 */
export async function getAgentDetail(id: string): Promise<AgentDto> {
  if (API_CONFIG.USE_MOCK) {
    return mockAgents.getAgentDetail(id) as Promise<AgentDto>;
  }
  // 尝试带 token 获取（如果是 owner 可以看到 url）
  return apiClient.get<AgentDto>(`/agents/${id}`);
}

/**
 * 更新 Agent（需要登录，仅 owner）
 */
export async function updateAgent(
  id: string,
  data: UpdateAgentRequest,
): Promise<AgentDto> {
  if (API_CONFIG.USE_MOCK) {
    return mockAgents.updateAgent(id, data) as Promise<AgentDto>;
  }
  return apiClient.patch<AgentDto>(`/agents/${id}`, data);
}

/**
 * 下架 Agent（需要登录，仅 owner）
 */
export async function disableAgent(id: string): Promise<AgentDto> {
  if (API_CONFIG.USE_MOCK) {
    return mockAgents.disableAgent(id) as Promise<AgentDto>;
  }
  return apiClient.patch<AgentDto>(`/agents/${id}/disable`);
}

// 导出 Agent 服务对象
export const agentService = {
  createAgent,
  getAgentList,
  getMyAgents,
  getAgentDetail,
  updateAgent,
  disableAgent,
};
