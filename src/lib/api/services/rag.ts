/**
 * RAG (Retrieval-Augmented Generation) API 服务
 * 向量库管理与知识检索
 */

import { getToken } from '../client';

// ============ 配置 ============

const RAG_API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_RAG_API_URL || 'https://rag-api.rowlandw3ai.shop',
  TIMEOUT: 60000, // RAG 操作可能较慢，超时设置长一些
} as const;

// ============ 类型定义 ============

/** 文档元数据 */
export interface DocumentMetadata {
  source?: string;
  title?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/** 文档内容 */
export interface DocumentInput {
  id?: string;
  content: string;
  metadata?: DocumentMetadata;
}

/** 初始化向量库请求 */
export interface RagInitRequest {
  namespace: string;         // 向量库命名空间（如 agentId）
  documents: DocumentInput[]; // 文档列表
  dimension?: number;         // 向量维度，默认通常为 1536
}

/** 初始化向量库响应 */
export interface RagInitResponse {
  success: boolean;
  namespace: string;
  documentCount: number;
  message?: string;
}

/** 追加文档请求 */
export interface RagAppendRequest {
  namespace: string;
  documents: DocumentInput[];
}

/** 追加文档响应 */
export interface RagAppendResponse {
  success: boolean;
  namespace: string;
  addedCount: number;
  totalCount: number;
  message?: string;
}

/** 查询模式 */
export type AnswerMode = 'documents' | 'answer';

/** 查询/问答请求 */
export interface RagQueryRequest {
  namespace: string;
  query: string;
  topK?: number;              // 返回前 K 个结果，默认 5
  answerMode?: AnswerMode;    // 'documents' 返回文档列表，'answer' 返回 AI 生成的答案
  threshold?: number;         // 相似度阈值，0-1
}

/** 检索到的文档 */
export interface RetrievedDocument {
  id: string;
  content: string;
  score: number;              // 相似度分数
  metadata?: DocumentMetadata;
}

/** 查询响应（文档模式） */
export interface RagQueryDocumentsResponse {
  success: boolean;
  documents: RetrievedDocument[];
  query: string;
}

/** 查询响应（答案模式） */
export interface RagQueryAnswerResponse {
  success: boolean;
  answer: string;
  sources: RetrievedDocument[];
  query: string;
}

/** 统一查询响应 */
export type RagQueryResponse = RagQueryDocumentsResponse | RagQueryAnswerResponse;

/** RAG API 错误 */
export class RagApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'RagApiError';
    this.status = status;
    this.data = data;
  }
}

// ============ 内部请求方法 ============

interface RagRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function ragRequest<T>(
  endpoint: string,
  options: RagRequestOptions = {}
): Promise<T> {
  const { body, headers: customHeaders, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  // 添加 JWT 认证头（如果存在）
  const token = getToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...fetchOptions,
    headers,
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  const url = `${RAG_API_CONFIG.BASE_URL}${endpoint}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RAG_API_CONFIG.TIMEOUT);

    const response = await fetch(url, {
      ...config,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: T;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = (await response.text()) as unknown as T;
    }

    if (!response.ok) {
      throw new RagApiError(
        (data as { message?: string })?.message || `RAG 请求失败: ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof RagApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new RagApiError('RAG 请求超时', 408);
    }

    throw new RagApiError(
      error instanceof Error ? error.message : 'RAG 网络请求失败',
      0,
      error
    );
  }
}

// ============ API 方法 ============

/**
 * 初始化向量库（重建）
 * 会清空现有数据并重新构建
 * @param data 初始化请求参数
 */
export async function initVectorStore(data: RagInitRequest): Promise<RagInitResponse> {
  return ragRequest<RagInitResponse>('/rag/init', {
    method: 'POST',
    body: data,
  });
}

/**
 * 追加文档到向量库
 * 不会清空现有数据，仅追加新文档
 * @param data 追加请求参数
 */
export async function appendDocuments(data: RagAppendRequest): Promise<RagAppendResponse> {
  return ragRequest<RagAppendResponse>('/rag/append', {
    method: 'POST',
    body: data,
  });
}

/**
 * 查询向量库（返回相似文档）
 * @param data 查询请求参数
 */
export async function queryDocuments(
  data: Omit<RagQueryRequest, 'answerMode'> & { answerMode?: 'documents' }
): Promise<RagQueryDocumentsResponse> {
  return ragRequest<RagQueryDocumentsResponse>('/rag/query', {
    method: 'POST',
    body: { ...data, answerMode: 'documents' },
  });
}

/**
 * 问答查询（返回 AI 生成的答案）
 * @param data 查询请求参数
 */
export async function askQuestion(
  data: Omit<RagQueryRequest, 'answerMode'>
): Promise<RagQueryAnswerResponse> {
  return ragRequest<RagQueryAnswerResponse>('/rag/ask', {
    method: 'POST',
    body: { ...data, answerMode: 'answer' },
  });
}

/**
 * 通用查询方法
 * 根据 answerMode 返回不同类型的响应
 * @param data 查询请求参数
 */
export async function query(data: RagQueryRequest): Promise<RagQueryResponse> {
  const endpoint = data.answerMode === 'answer' ? '/rag/ask' : '/rag/query';
  return ragRequest<RagQueryResponse>(endpoint, {
    method: 'POST',
    body: data,
  });
}

// ============ 便捷方法 ============

/**
 * 为 Agent 初始化知识库
 * @param agentId Agent ID（作为 namespace）
 * @param documents 文档列表
 */
export async function initAgentKnowledge(
  agentId: string,
  documents: DocumentInput[]
): Promise<RagInitResponse> {
  return initVectorStore({
    namespace: agentId,
    documents,
  });
}

/**
 * 为 Agent 追加知识
 * @param agentId Agent ID
 * @param documents 文档列表
 */
export async function appendAgentKnowledge(
  agentId: string,
  documents: DocumentInput[]
): Promise<RagAppendResponse> {
  return appendDocuments({
    namespace: agentId,
    documents,
  });
}

/**
 * 从 Agent 知识库检索
 * @param agentId Agent ID
 * @param query 查询内容
 * @param topK 返回数量
 */
export async function retrieveFromAgent(
  agentId: string,
  query: string,
  topK = 5
): Promise<RetrievedDocument[]> {
  const response = await queryDocuments({
    namespace: agentId,
    query,
    topK,
  });
  return response.documents;
}

/**
 * 向 Agent 提问
 * @param agentId Agent ID
 * @param question 问题
 * @param topK 检索文档数量
 */
export async function askAgent(
  agentId: string,
  question: string,
  topK = 5
): Promise<RagQueryAnswerResponse> {
  return askQuestion({
    namespace: agentId,
    query: question,
    topK,
  });
}

// ============ 导出服务对象 ============

export const ragService = {
  // 核心方法
  initVectorStore,
  appendDocuments,
  queryDocuments,
  askQuestion,
  query,
  // Agent 便捷方法
  initAgentKnowledge,
  appendAgentKnowledge,
  retrieveFromAgent,
  askAgent,
};

export default ragService;
