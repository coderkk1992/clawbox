export type VmStatus =
  | 'notcreated'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | { error: string };

export interface StatusResponse {
  vm_status: VmStatus;
  gateway_url: string | null;
  ready: boolean;
}

export interface SystemInfo {
  total_ram_mb: number;
  cpu_count: number;
  setup_complete: boolean;
}

export interface SetupConfig {
  ram_mb: number;
  cpus: number;
  anthropic_api_key?: string;
  openai_api_key?: string;
}

export interface SetupProgressEvent {
  step: string;
  progress: number;
  message: string;
}

export type AppView = 'loading' | 'setup' | 'dashboard';
