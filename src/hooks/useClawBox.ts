import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { StatusResponse, SystemInfo, SetupConfig, SetupProgressEvent } from '../types';

export function useClawBox() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupProgress, setSetupProgress] = useState<SetupProgressEvent | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await invoke<StatusResponse>('get_vm_status');
      setStatus(result);
    } catch (e) {
      console.error('Failed to get VM status:', e);
      // Set a default so app can continue
      setStatus({
        vm_status: 'notcreated',
        gateway_url: null,
        ready: false,
      });
    }
  }, []);

  const fetchSystemInfo = useCallback(async () => {
    try {
      const result = await invoke<SystemInfo>('get_system_info');
      setSystemInfo(result);
    } catch (e) {
      console.error('Failed to get system info:', e);
      // Set default so app can continue
      setSystemInfo({
        total_ram_mb: 16384,
        cpu_count: 4,
        setup_complete: false,
      });
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([fetchStatus(), fetchSystemInfo()]);
      } catch (e) {
        console.error('Init error:', e);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    init();

    // Listen for setup progress events
    const unlisten = listen<SetupProgressEvent>('setup-progress', (event) => {
      setSetupProgress(event.payload);
      if (event.payload.step === 'complete') {
        setIsSettingUp(false);
        fetchStatus();
        fetchSystemInfo();
      }
      if (event.payload.step === 'error') {
        setIsSettingUp(false);
        setError(event.payload.message);
      }
    });

    // Poll status every 5 seconds (only when not setting up)
    const interval = setInterval(() => {
      if (!isSettingUp) {
        fetchStatus();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      unlisten.then(fn => fn());
    };
  }, [fetchStatus, fetchSystemInfo, isSettingUp]);

  const runFullSetup = useCallback(async (config: SetupConfig) => {
    setIsSettingUp(true);
    setSetupProgress({ step: 'starting', progress: 0, message: 'Starting setup...' });
    setError(null);

    try {
      await invoke('run_full_setup', { config });
      await fetchStatus();
      await fetchSystemInfo();
    } catch (e) {
      setError(String(e));
      setIsSettingUp(false);
      throw e;
    }
  }, [fetchStatus, fetchSystemInfo]);

  const startVm = useCallback(async () => {
    setLoading(true);
    try {
      await invoke('start_vm');
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const stopVm = useCallback(async () => {
    setLoading(true);
    try {
      await invoke('stop_vm');
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const restartVm = useCallback(async () => {
    setLoading(true);
    try {
      await invoke('restart_vm');
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const isRunning = status?.vm_status === 'running';
  const isStopped = status?.vm_status === 'stopped';
  const needsSetup = !systemInfo?.setup_complete;

  return {
    status,
    systemInfo,
    loading,
    error,
    isRunning,
    isStopped,
    needsSetup,
    isSettingUp,
    setupProgress,
    runFullSetup,
    startVm,
    stopVm,
    restartVm,
    refreshStatus: fetchStatus,
  };
}
