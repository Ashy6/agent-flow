'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, ArrowLeft, CheckCircle, XCircle, Send, Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { agentService, AgentDto } from '@/lib/api/services/agents';
import { useToast } from '@/contexts/ToastContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AgentChatClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDto | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // 从 URL 获取预选的 agent ID
  const preSelectedAgentId = searchParams.get('agentId');

  // 获取智能体列表
  useEffect(() => {
    const fetchAgents = async () => {
      setIsLoadingAgents(true);
      try {
        const response = await agentService.getAgentList({ page: 1, pageSize: 100 });
        setAgents(response.items);

        // 如果有预选的 agent ID，自动选中
        if (preSelectedAgentId) {
          const preSelectedAgent = response.items.find(a => a.id === preSelectedAgentId);
          if (preSelectedAgent) {
            setSelectedAgent(preSelectedAgent);
          }
        } else if (response.items.length > 0) {
          // 否则选中第一个
          setSelectedAgent(response.items[0]);
        }
      } catch (error) {
        console.error('获取智能体列表失败:', error);
        toast.error('获取智能体列表失败');
      } finally {
        setIsLoadingAgents(false);
      }
    };

    fetchAgents();
  }, [preSelectedAgentId]);

  // 选择智能体
  const handleSelectAgent = (agent: AgentDto) => {
    setSelectedAgent(agent);
    setMessages([]); // 切换智能体时清空消息
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedAgent || isSending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsSending(true);

    try {
      // TODO: 这里将来会调用实际的 AI 接口
      // 现在使用模拟响应
      await new Promise(resolve => setTimeout(resolve, 1000));

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `你好！我是 ${selectedAgent.name}。\n\n${selectedAgent.description || '我能帮助你解决各种问题。'}\n\n当前会话模式正在开发中，请稍后再试。`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('发送消息失败:', error);
      toast.error('发送消息失败');
    } finally {
      setIsSending(false);
    }
  };

  // 处理发起 Job
  const handleCreateJob = () => {
    if (!selectedAgent) return;
    router.push(`/jobs/create?agentId=${selectedAgent.id}`);
  };

  // 处理按下 Enter 键
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push('/agents')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4" />
            返回列表
          </button>
          <h1 className="text-xl font-semibold text-gray-800">智能体会话</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-[1600px] mx-auto px-6 py-6">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex">
            {/* Left Sidebar - Agent List */}
            <div className="w-80 border-r border-gray-200 flex flex-col">
              {/* Sidebar Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-600" />
                  <h2 className="font-semibold text-gray-800">可用 Agents</h2>
                </div>
              </div>

              {/* Agent List */}
              <div className="flex-1 overflow-y-auto">
                {isLoadingAgents ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                  </div>
                ) : agents.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    暂无可用智能体
                  </div>
                ) : (
                  agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => handleSelectAgent(agent)}
                      className={`w-full px-4 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors ${
                        selectedAgent?.id === agent.id ? 'bg-purple-50 border-l-4 border-l-purple-600' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          selectedAgent?.id === agent.id
                            ? 'bg-gradient-to-br from-purple-400 to-pink-600'
                            : 'bg-gray-200'
                        }`}>
                          <Bot className={`w-4 h-4 ${
                            selectedAgent?.id === agent.id ? 'text-white' : 'text-gray-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-medium text-sm truncate ${
                              selectedAgent?.id === agent.id ? 'text-purple-900' : 'text-gray-800'
                            }`}>
                              {agent.name}
                            </h3>
                            {selectedAgent?.id === agent.id && (
                              <div className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                            )}
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {agent.description || '暂无描述'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Browse More Agents */}
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => router.push('/agents')}
                  className="w-full text-center text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  浏览更多 Agents
                </button>
              </div>
            </div>

            {/* Right - Chat Area */}
            <div className="flex-1 flex flex-col">
              {selectedAgent ? (
                <>
                  {/* Chat Header */}
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-400 to-pink-600">
                          <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-gray-800">{selectedAgent.name}</h2>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={selectedAgent.status === 'enabled' ? 'success' : 'default'} className="text-xs">
                              {selectedAgent.status === 'enabled' ? (
                                <>
                                  <CheckCircle className="w-3 h-3" />
                                  Session Active
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3" />
                                  不可用
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button onClick={handleCreateJob}>
                        发起任务 (Job)
                      </Button>
                    </div>
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center max-w-md">
                          <div className="inline-flex p-4 rounded-full bg-purple-100 mb-4">
                            <Bot className="w-8 h-8 text-purple-600" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-800 mb-2">
                            你好！我是 {selectedAgent.name} Agent。
                          </h3>
                          <p className="text-gray-600 mb-4">
                            {selectedAgent.description || '提供高质量的文本分析服务，适用于内容管理、市场分析等场景。'}
                          </p>
                          <p className="text-sm text-gray-500">
                            当前会话模式下，您可以直接与我互动，或随时切换到 Agent 辅助业务流程。
                          </p>
                        </div>
                      </div>
                    ) : (
                      messages.map(message => (
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
                            className={`max-w-[70%] rounded-lg px-4 py-3 ${
                              message.role === 'user'
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            <p className={`text-xs mt-2 ${
                              message.role === 'user' ? 'text-purple-200' : 'text-gray-500'
                            }`}>
                              {message.timestamp.toLocaleTimeString('zh-CN', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          {message.role === 'user' && (
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-300 flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-600">你</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="px-6 py-4 border-t border-gray-200 bg-white">
                    <div className="flex items-center gap-3">
                      <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={`Send message to ${selectedAgent.name} Agent...`}
                        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        disabled={isSending}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!inputMessage.trim() || isSending}
                        className="px-6"
                      >
                        {isSending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      当前为 V1 会话模式，历史记录暂不存在本地。切换 Agent 可重新提起与该 Agent 可直接进行对话。
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <Bot className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p>请选择一个智能体开始对话</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
