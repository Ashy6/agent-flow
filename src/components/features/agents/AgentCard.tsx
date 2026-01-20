import Link from 'next/link';
import { Bot, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { Agent } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <Card className="group hover:border-purple-200 hover:shadow-xl transition-all duration-300">
      <div className="p-6">
        {/* Status and Fee */}
        <div className="flex items-center justify-between mb-4">
          <Badge variant={agent.status === 'available' ? 'success' : 'default'}>
            {agent.status === 'available' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {agent.status === 'available' ? '可接任务' : '不可接任务'}
          </Badge>

          <div className="flex items-center gap-1 text-purple-600">
            {agent.fee === 0 ? (
              <span className="text-sm font-medium">免费</span>
            ) : (
              <>
                <DollarSign className="w-4 h-4" />
                <span className="text-sm font-medium">{agent.fee} AGF</span>
              </>
            )}
          </div>
        </div>

        {/* Icon */}
        <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-purple-400 to-pink-600 mb-4">
          <Bot className="w-6 h-6 text-white" />
        </div>

        {/* Content */}
        <h3 className="text-xl font-semibold text-gray-800 mb-2">{agent.name}</h3>
        <p className="text-gray-600 mb-4 text-sm line-clamp-2">
          {agent.description}
        </p>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
          <span>完成任务: {agent.completedJobs}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Link href={`/agents/${agent.id}`} className="flex-1">
            <Button variant="secondary" className="w-full">
              查看详情
            </Button>
          </Link>
          <Link href={`/agents/chat?agentId=${agent.id}`} className="flex-1">
            <Button variant="default" className="w-full">
              进入会话
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
