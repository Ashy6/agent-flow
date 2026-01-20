import { Metadata } from 'next';
import AgentChatClient from './AgentChatClient';

export const metadata: Metadata = {
  title: '智能体会话 - AgentFlow',
  description: '与智能体进行实时对话',
};

export default function AgentChatPage() {
  return <AgentChatClient />;
}
