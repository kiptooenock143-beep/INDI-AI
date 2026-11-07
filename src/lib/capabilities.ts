import { Home, Car, MessageSquare, Phone, Camera, Mic, Files, Search, Image as ImageIcon, Share2, Activity, ShieldCheck, MessageCircle, Wand2, Film, FileText, BookOpen, type LucideIcon } from 'lucide-react';

export type CapabilityStatus = 'live' | 'needs-setup' | 'locked' | 'native-only';

export interface Capability {
  id: string;
  name: string;
  icon: LucideIcon;
  status: CapabilityStatus;
  note: string;
  section?: string; // matches menu section id
}

export const CAPABILITIES: Capability[] = [
  { id: 'chat', name: 'Console', icon: MessageCircle, status: 'live', note: 'Cloud → Offline rules', section: 'chat' },
  { id: 'research', name: 'Research Briefing', icon: BookOpen, status: 'live', note: 'Structured briefings with sources', section: 'research' },
  { id: 'cinema', name: 'Cinema Storyboard', icon: Film, status: 'live', note: '4-frame cinematic keyframes', section: 'cinema' },
  { id: 'docs', name: 'Document Intelligence', icon: FileText, status: 'live', note: 'PDFs, images, notes → extraction', section: 'docs' },
  { id: 'analyze', name: 'Vision', icon: Search, status: 'live', note: 'Camera + image understanding', section: 'analysis' },
  { id: 'voice', name: 'Voice', icon: Mic, status: 'live', note: 'Web Speech API', section: 'voice' },
  { id: 'house', name: 'Home Assistant', icon: Home, status: 'needs-setup', note: 'Paste HA token to activate', section: 'house' },
  { id: 'car', name: 'Vehicle Fleet', icon: Car, status: 'needs-setup', note: 'Tesla / Smartcar OAuth', section: 'car' },
  { id: 'whatsapp', name: 'WhatsApp Relay', icon: MessageSquare, status: 'live', note: 'wa.me deep links', section: 'whatsapp' },
  { id: 'calls', name: 'Video / Voice Calls', icon: Phone, status: 'live', note: 'WebRTC in-browser', section: 'calls' },
  { id: 'camera', name: 'Optics', icon: Camera, status: 'live', note: 'Browser camera + capture', section: 'camera' },
  { id: 'files', name: 'File Vault', icon: Files, status: 'live', note: 'File System Access API', section: 'files' },
  { id: 'share', name: 'Share Hub', icon: Share2, status: 'live', note: 'Cross-app share', section: 'share' },
  { id: 'systems', name: 'Systems Monitor', icon: Activity, status: 'live', note: '15 cognitive subsystems', section: 'dashboard' },
  { id: 'access', name: 'System Access', icon: ShieldCheck, status: 'needs-setup', note: 'Grant permissions to unlock', section: 'system' },
];
