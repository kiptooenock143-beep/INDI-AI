import { Brain, Search, Code, DollarSign, Shield, Palette, Megaphone, Scale, Plane, HeartPulse, Crown, type LucideIcon } from 'lucide-react';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'offline';

export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: LucideIcon;
  systemPrompt: string;
  online: boolean;
  keywords: string[];
}

export const AGENTS: Agent[] = [
  {
    id: 'ceo',
    name: 'CEO',
    role: 'Coordinator',
    icon: Crown,
    systemPrompt: 'You are the CEO agent inside INDI AI. Route the user request to the correct specialist or answer directly if trivial. Be concise.',
    online: true,
    keywords: [],
  },
  {
    id: 'research',
    name: 'Research',
    role: 'Web + citations',
    icon: Search,
    systemPrompt: 'You are the Research agent. Provide verified findings with citations. Prefer primary sources.',
    online: true,
    keywords: ['search', 'find', 'research', 'lookup', 'who', 'what', 'when', 'where', 'why'],
  },
  {
    id: 'coding',
    name: 'Coding',
    role: 'Build + debug',
    icon: Code,
    systemPrompt: 'You are the Coding agent. Write clean, tested code. Explain trade-offs briefly.',
    online: true,
    keywords: ['code', 'bug', 'function', 'deploy', 'refactor', 'typescript', 'python', 'error'],
  },
  {
    id: 'finance',
    name: 'Finance',
    role: 'Money + forecasts',
    icon: DollarSign,
    systemPrompt: 'You are the Finance agent. Track spending, subscriptions, forecasts. Never invent numbers.',
    online: true,
    keywords: ['spend', 'money', 'budget', 'invoice', 'subscription', 'cost', 'price', 'invest'],
  },
  {
    id: 'security',
    name: 'Security',
    role: 'Breach watch',
    icon: Shield,
    systemPrompt: 'You are the Security agent. Watch for breaches, leaks, suspicious activity. Be paranoid but precise.',
    online: true,
    keywords: ['leak', 'breach', 'hack', 'password', 'phishing', 'suspicious', 'login'],
  },
  { id: 'design', name: 'Design', role: 'UI/UX/brand', icon: Palette, systemPrompt: '', online: false, keywords: [] },
  { id: 'marketing', name: 'Marketing', role: 'Campaigns', icon: Megaphone, systemPrompt: '', online: false, keywords: [] },
  { id: 'legal', name: 'Legal', role: 'Contracts', icon: Scale, systemPrompt: '', online: false, keywords: [] },
  { id: 'travel', name: 'Travel', role: 'Flights + hotels', icon: Plane, systemPrompt: '', online: false, keywords: [] },
  { id: 'health', name: 'Health', role: 'Sleep + activity', icon: HeartPulse, systemPrompt: '', online: false, keywords: [] },
  { id: 'executive', name: 'Executive', role: 'Strategy', icon: Brain, systemPrompt: '', online: false, keywords: [] },
];

export function routeToAgent(input: string): Agent {
  const lower = input.toLowerCase();
  const specialists = AGENTS.filter((a) => a.online && a.id !== 'ceo');
  const scored = specialists.map((a) => ({
    agent: a,
    score: a.keywords.reduce((n, k) => (lower.includes(k) ? n + 1 : n), 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].agent : AGENTS[0];
}
