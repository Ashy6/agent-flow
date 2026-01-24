'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/contexts/ToastContext';
import { AgentDto, agentService } from '@/lib/api/services/agents';
import { JobDto, jobService } from '@/lib/api/services/jobs';
import {
  approvePlatformToken,
  getPlatformTokenAllowance,
  getPlatformTokenBalance,
} from '@/lib/contracts/utils';
import { jobStatusConfig } from '@/lib/statusConfig';
import {
  AgentChatConfig,
  decodeAgentDescription,
} from '@/lib/utils/agentConfig';
import { useWalletStore } from '@/store/walletStore';
import { Chat as AIChat, useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function JobDetailClient() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const jobId = params.id as string;
  const { isConnected } = useWalletStore();

  // Job 相关状态
  const [job, setJob] = useState<JobDto | null>(null);
  const [agent, setAgent] = useState<AgentDto | null>(null);
  const [agentConfig, setAgentConfig] = useState<AgentChatConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [resultText, setResultText] = useState('');
  const [submitStep, setSubmitStep] = useState<'idle' | 'checking' | 'approving' | 'submitting'>('idle');

  // 聊天相关
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 创建 Chat 实例
  const chat = useMemo(() => {
    return new AIChat<UIMessage>({
      transport: new DefaultChatTransport({
        api: agentConfig?.chatApiUrl
          ? `${agentConfig.chatApiUrl}/chat`
          : '/__noop-chat',
      }),
      messages: [],
    });
  }, [agentConfig?.chatApiUrl]);

  // 使用 useChat hook
  const { messages, setMessages, sendMessage, status } = useChat({ chat });
  const isStreaming = status === 'submitted' || status === 'streaming';

  // 获取任务详情和 Agent 信息
  const fetchJobDetail = async () => {
    if (!isConnected) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const jobData = await jobService.getJobDetail(jobId);
      setJob(jobData);

      // 获取关联的 Agent 信息
      if (jobData.agentId) {
        try {
          const agentData = await agentService.getAgentDetail(jobData.agentId);
          setAgent(agentData);
          const { config } = decodeAgentDescription(agentData.description || '');
          setAgentConfig(config);
        } catch (error) {
          console.error('获取 Agent 详情失败:', error);
        }
      }
    } catch (error) {
      console.error('获取任务详情失败:', error);
      toast.error('获取任务详情失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobDetail();
  }, [jobId, isConnected]);


  // 提交任务完成
  const handleCompleteJob = async () => {
    if (!job) return;

    setIsSubmitting(true);
    setSubmitStep('checking');

    try {
      // 1. 获取结算金额（Agent 价格）
      const agentDetail = await agentService.getAgentDetail(job.agentId);
      const settleAmount = agentDetail.price;

      // 2. 检查 PlatformToken 余额是否足够
      const balance = await getPlatformTokenBalance();
      if (parseFloat(balance) < parseFloat(settleAmount)) {
        toast.error(`APT 余额不足，需要 ${settleAmount} APT，当前余额 ${balance} APT`);
        return;
      }

      // 3. 检查对 Treasury 的授权额度
      const allowance = await getPlatformTokenAllowance();
      if (parseFloat(allowance) < parseFloat(settleAmount)) {
        setSubmitStep('approving');
        toast.info('需要授权 APT 才能完成结算，请在钱包中确认');
        await approvePlatformToken(settleAmount);
        toast.success('授权成功');
      }

      // 4. 提交结算
      setSubmitStep('submitting');
      const updatedJob = await jobService.submitJobResult(jobId, {
        resultText: resultText.trim() || undefined,
      });
      setJob(updatedJob);
      setShowCompleteDialog(false);
      setResultText('');
      toast.success('任务已标记为完成！');
    } catch (error: any) {
      console.error('提交任务结果失败:', error);
      if (error?.code === 4001 || error?.message?.includes('User rejected')) {
        toast.error('用户取消了交易');
      } else if (error?.message?.includes('insufficient')) {
        toast.error('余额不足，请先充值');
      } else {
        toast.error(error instanceof Error ? error.message : '提交失败，请重试');
      }
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  };

  // 发送消息
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !agent || isStreaming) return;

    if (agentConfig?.chatApiUrl && chat) {
      try {
        await sendMessage(
          { text },
          {
            body: {
              agentId: agentConfig.agentId,
              modelId: agentConfig.modelId,
              systemPrompt: agentConfig.systemPrompt,
              temperature: agentConfig.temperature,
            },
          }
        );
      } catch (error) {
        console.error('发送消息失败:', error);
        toast.error(error instanceof Error ? error.message : '发送消息失败');
      }
    } else {
      const { description } = decodeAgentDescription(agent.description || '');
      const notConfiguredMessage: UIMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: `你好！我是 ${agent.name}。\n\n${description || '我能帮助你解决各种问题。'}\n\n当前 Agent 未配置聊天 API，无法进行实时对话。`,
          },
        ],
      };
      setMessages([...messages, notConfiguredMessage]);
    }
  };

  // 提取消息文本
  const getMessageText = (message: UIMessage): string => {
    return message.parts
      .filter((p) => p.type === 'text')
      .map((p: any) => p.text)
      .join('');
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-gray-600 mb-4">请先连接钱包以查看任务详情</p>
          <Link href="/jobs">
            <Button>返回任务列表</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">任务不存在</h2>
          <p className="text-gray-600 mb-6">未找到 ID 为 {jobId} 的任务</p>
          <Link href="/jobs">
            <Button>返回任务列表</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const statusInfo = jobStatusConfig[job.status] || { label: job.status, variant: 'default' as const };
  const canComplete = job.status === 'running' || job.status === 'open';

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ========== 顶部：任务基本信息 ========== */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-6xl mx-auto">
          {/* 返回链接 */}
          <Link href="/jobs" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" />
            返回列表
          </Link>

          {/* 任务标题和状态 */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-2xl font-bold text-gray-800 truncate">{job.title}</h1>
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Tag className="w-4 h-4" />
                  {job.category}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(job.createdAt)}
                </span>
                {agent && (
                  <span className="flex items-center gap-1">
                    <Bot className="w-4 h-4" />
                    {agent.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 任务描述（折叠显示） */}
          {job.description && (
            <details className="mt-3">
              <summary className="text-sm text-purple-600 cursor-pointer hover:text-purple-700">
                查看任务描述
              </summary>
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                {job.description}
              </p>
            </details>
          )}
        </div>
      </div>

      {/* ========== 中间：聊天组件 ========== */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-6xl mx-auto px-6 py-4">
          <Card className="h-full flex flex-col overflow-hidden">
            {/* 聊天头部 */}
            <CardHeader className="flex-shrink-0 border-b bg-gray-50 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-400 to-pink-600">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {agent?.name || '加载中...'}
                    </CardTitle>
                    <p className="text-xs text-gray-500">
                      {agentConfig?.chatApiUrl ? '在线 · 可对话' : '未配置聊天 API'}
                    </p>
                  </div>
                </div>
                {messages.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setMessages([])}>
                    清空对话
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* 消息区域 */}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="inline-flex p-4 rounded-full bg-purple-100 mb-4">
                      <Bot className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      与 {agent?.name || 'Agent'} 对话
                    </h3>
                    <p className="text-gray-600 text-sm mb-2">
                      {agent ? decodeAgentDescription(agent.description || '').description || '这个 Agent 可以帮助你完成任务。' : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      {agentConfig?.chatApiUrl
                        ? '发送消息开始对话，Agent 会协助你完成任务。'
                        : '当前 Agent 未配置聊天 API，无法实时对话。'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-pink-600 flex items-center justify-center">
                          <Bot className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <div
                        className={`rounded-lg px-4 py-3 max-w-[75%] ${
                          message.role === 'user'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <div className="text-sm prose prose-sm max-w-none">
                          <ReactMarkdown>{getMessageText(message)}</ReactMarkdown>
                        </div>
                      </div>
                      {message.role === 'user' && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-600">你</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {isStreaming && (
                    <div className="flex gap-3 justify-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-pink-600 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div className="bg-gray-100 rounded-lg px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </CardContent>

            {/* 输入区域 */}
            <div className="flex-shrink-0 px-4 py-3 border-t bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.currentTarget.querySelector('input') as HTMLInputElement;
                  handleSendMessage(input.value);
                  input.value = '';
                }}
                className="flex items-center gap-3"
              >
                <button type="button" className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  placeholder={`发送消息给 ${agent?.name || 'Agent'}...`}
                  className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  disabled={isStreaming || !agent}
                />
                <Button type="submit" disabled={isStreaming || !agent} size="sm">
                  {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>

      {/* ========== 底部：操作区 ========== */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* 左侧：执行结果（如果有） */}
            <div className="flex-1 min-w-0">
              {job.resultText && (
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-green-700">执行结果：</span>
                    <span className="text-gray-600 line-clamp-2">{job.resultText}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧：操作按钮 */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {canComplete && (
                <Button
                  onClick={() => setShowCompleteDialog(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  完成任务
                </Button>
              )}
              <Button variant="outline" onClick={() => fetchJobDetail()} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                返回
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ========== 完成任务弹窗 ========== */}
      {showCompleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                完成任务
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                确认将此任务标记为完成？完成后将进行结算。
              </p>

              <div>
                <label htmlFor="resultText" className="block text-sm font-medium text-gray-700 mb-2">
                  执行结果（可选）
                </label>
                <textarea
                  id="resultText"
                  rows={4}
                  value={resultText}
                  onChange={(e) => setResultText(e.target.value)}
                  className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400 resize-none"
                  placeholder="描述任务执行结果..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleCompleteJob}
                  disabled={isSubmitting}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {submitStep === 'checking' && '检查中...'}
                      {submitStep === 'approving' && '授权中...'}
                      {submitStep === 'submitting' && '提交中...'}
                    </>
                  ) : (
                    '确认完成'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCompleteDialog(false);
                    setResultText('');
                  }}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
