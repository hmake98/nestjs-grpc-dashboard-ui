export interface GrpcServiceInfo {
  id: string;
  name: string;
  methods: string[];
  package: string;
  status: 'active' | 'inactive';
  url: string;
  lastActivity?: string; // ISO date string
}

export interface GrpcConnection {
  id: string;
  clientId: string;
  service: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  established: string; // ISO date string
  lastActivity: string; // ISO date string
  metadata?: Record<string, string>;
}

export interface StatsData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
}

export interface SystemInfo {
  version: string;
  uptime: number;
  nodeVersion: string;
  platform: string;
  servicesCount: number;
  connectionsCount: number;
  logsCount: number;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

export interface LogEntry {
  id: string;
  timestamp: string; // ISO date string
  level: LogLevel;
  message: string;
  context: string;
  service?: string;
  method?: string;
  traceId?: string;
}
