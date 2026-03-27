import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import ReactMarkdown from 'react-markdown';
import type { StatusResponse } from '../types';
import { getPixelCharacter } from '../components/PixelCharacters';
import { initNotifications, parseReminderFromResponse, scheduleReminder } from '../utils/notifications';

interface MessageAttachment {
  name: string;
  preview?: string;
  type: 'image' | 'file';
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  pending?: boolean;
  channel?: string;
  attachments?: MessageAttachment[];
}

interface AttachedFile {
  name: string;
  path: string;
  preview?: string;
  type: 'image' | 'file';
}

interface Props {
  status: StatusResponse;
  onBack: () => void;
  onOpenSettings?: () => void;
  activeAgentId?: string | null;
}

type ConnectionState = 'connecting' | 'authenticating' | 'connected' | 'disconnected' | 'error';

type ChannelType = 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'signal' | 'imessage' | 'googlechat' | 'line' | 'irc' | 'matrix' | 'nostr' | 'tlon';

interface ChannelInfo {
  id: ChannelType;
  name: string;
  requiresToken?: boolean;
  requiresPhone?: boolean;
  requiresWebhook?: boolean;
  tokenLabel?: string;
  instructions?: string;
}

const CHANNELS: ChannelInfo[] = [
  { id: 'telegram', name: 'Telegram', requiresToken: true, tokenLabel: 'Bot Token', instructions: 'Create a bot with @BotFather and paste the token here' },
  { id: 'whatsapp', name: 'WhatsApp', requiresPhone: true, instructions: 'Enter your phone number to link WhatsApp' },
  { id: 'discord', name: 'Discord', requiresToken: true, tokenLabel: 'Bot Token', instructions: 'Create a Discord application and add a bot to get the token' },
  { id: 'slack', name: 'Slack', requiresToken: true, tokenLabel: 'App Token', instructions: 'Create a Slack app and get the app-level token' },
  { id: 'signal', name: 'Signal', requiresPhone: true, instructions: 'Enter your phone number to link Signal' },
  { id: 'imessage', name: 'iMessage', instructions: 'iMessage integration requires macOS with Messages app' },
  { id: 'googlechat', name: 'Google Chat', requiresWebhook: true, instructions: 'Create a Google Chat webhook and paste the URL' },
  { id: 'line', name: 'LINE', requiresToken: true, tokenLabel: 'Channel Access Token', instructions: 'Get your LINE Messaging API channel access token' },
  { id: 'irc', name: 'IRC', instructions: 'IRC will be configured with default settings' },
  { id: 'matrix', name: 'Matrix', requiresToken: true, tokenLabel: 'Access Token', instructions: 'Enter your Matrix homeserver access token' },
  { id: 'nostr', name: 'Nostr', instructions: 'Nostr will generate a new keypair' },
  { id: 'tlon', name: 'Tlon', instructions: 'Tlon/Urbit integration will be configured' },
];

export function Chat({ status, onBack: _onBack, onOpenSettings: _onOpenSettings, activeAgentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [_connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_debugInfo, setDebugInfo] = useState('initializing...');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelInfo | null>(null);
  const [channelInput, setChannelInput] = useState('');
  const [configuredChannels, setConfiguredChannels] = useState<string[]>([]);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelSuccess, setChannelSuccess] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(activeAgentId || null);
  const [workspaceFiles, setWorkspaceFiles] = useState<{ name: string; path: string; size: number; is_dir: boolean }[]>([]);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [downloadedFile, setDownloadedFile] = useState<{ name: string; path: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageIdRef = useRef(0);
  const gatewayTokenRef = useRef<string | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Upload file to VM
  const uploadFile = async (file: File): Promise<AttachedFile | null> => {
    try {
      const base64 = await fileToBase64(file);
      const result = await invoke('upload_file', {
        name: file.name,
        content: base64,
      }) as { path: string; name: string };

      const isImage = file.type.startsWith('image/');
      return {
        name: result.name,
        path: result.path,
        preview: isImage ? `data:${file.type};base64,${base64}` : undefined,
        type: isImage ? 'image' : 'file',
      };
    } catch (e) {
      console.error('Failed to upload file:', e);
      setError(`Failed to upload ${file.name}: ${e}`);
      return null;
    }
  };

  // Handle paste event
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const filesToUpload: File[] = [];

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          filesToUpload.push(file);
        }
      }
    }

    if (filesToUpload.length > 0) {
      e.preventDefault(); // Prevent pasting as text
      for (const file of filesToUpload) {
        const uploaded = await uploadFile(file);
        if (uploaded) {
          setAttachedFiles(prev => [...prev, uploaded]);
        }
      }
    }
  };

  // Handle drag events
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const uploaded = await uploadFile(file);
      if (uploaded) {
        setAttachedFiles(prev => [...prev, uploaded]);
      }
    }
  };

  // Remove attached file
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle file input change (from button click)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const uploaded = await uploadFile(file);
      if (uploaded) {
        setAttachedFiles(prev => [...prev, uploaded]);
      }
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Open file picker
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Fetch workspace files
  const fetchWorkspaceFiles = useCallback(async () => {
    try {
      const files = await invoke('list_workspace_files', { path: null }) as { name: string; path: string; size: number; is_dir: boolean }[];
      // Filter out directories, hidden files, and system files
      const systemFiles = ['AGENTS.md', 'HEARTBEAT.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'USER.md', 'package.json', 'package-lock.json'];
      // User file extensions we want to show
      const userExtensions = ['.docx', '.doc', '.pdf', '.txt', '.csv', '.xlsx', '.xls', '.pptx', '.ppt', '.png', '.jpg', '.jpeg', '.gif', '.zip', '.mp3', '.mp4'];
      setWorkspaceFiles(files.filter(f => {
        if (f.is_dir) return false;
        if (f.name.startsWith('.')) return false;
        if (systemFiles.includes(f.name)) return false;
        // Show files with user-friendly extensions
        return userExtensions.some(ext => f.name.toLowerCase().endsWith(ext));
      }));
    } catch (e) {
      console.error('Failed to fetch workspace files:', e);
    }
  }, []);

  // Download file from workspace and save to Downloads folder
  const downloadWorkspaceFile = useCallback(async (file: { name: string; path: string }) => {
    console.log('downloadWorkspaceFile called with:', file);
    // Show downloading indicator
    setDownloadingFile(file.name);
    setDownloadedFile(null);

    try {
      console.log('Invoking download_and_save_file...');
      // Download and save to Downloads folder, returns the local path
      const savedPath = await invoke('download_and_save_file', {
        vmPath: file.path,
        filename: file.name,
      }) as string;
      console.log('Download successful, savedPath:', savedPath);

      // Show success toast with open option
      console.log('Setting downloadingFile to null and downloadedFile to:', { name: file.name, path: savedPath });
      setDownloadingFile(null);
      setDownloadedFile({ name: file.name, path: savedPath });
      console.log('State updates called');

      // Auto-hide toast after 8 seconds
      setTimeout(() => {
        console.log('Auto-hide timeout triggered');
        setDownloadedFile(prev => {
          if (prev?.path === savedPath) {
            return null;
          }
          return prev;
        });
      }, 8000);
    } catch (e) {
      console.error('Failed to download file:', e);
      setError('Failed to download file: ' + e);
      setDownloadingFile(null);
    }
  }, []);

  // Download file by VM path
  const downloadFileByPath = useCallback(async (vmPath: string) => {
    console.log('downloadFileByPath called with:', vmPath);
    const filename = vmPath.split('/').pop() || 'file';
    await downloadWorkspaceFile({ name: filename, path: vmPath });
  }, [downloadWorkspaceFile]);


  // Open downloaded file using system default app
  const openDownloadedFile = async () => {
    if (downloadedFile?.path) {
      try {
        await openPath(downloadedFile.path);
      } catch (e) {
        console.error('Failed to open file:', e);
        setError('Failed to open file: ' + e);
      }
    }
  };

  // Show in Finder
  const showInFinder = async () => {
    if (downloadedFile?.path) {
      try {
        await revealItemInDir(downloadedFile.path);
      } catch (e) {
        console.error('Failed to show in Finder:', e);
      }
    }
  };

  // Dismiss download toast
  const dismissDownloadToast = () => {
    setDownloadedFile(null);
  };

  // Extract filenames from message content
  const extractFilesFromMessage = (content: string): string[] => {
    const fileExtensions = /\b([A-Za-z0-9_-]+\.(docx?|xlsx?|pptx?|pdf|txt|csv|zip|png|jpg|jpeg|gif|mp3|mp4))\b/gi;
    const matches = content.match(fileExtensions);
    return matches ? [...new Set(matches)] : [];
  };

  // Fetch configured channels
  const fetchConfiguredChannels = useCallback(async () => {
    try {
      const channels = await invoke('get_channels') as string[];
      setConfiguredChannels(channels);
    } catch (e) {
      console.error('Failed to fetch channels:', e);
    }
  }, []);

  // Load configured channels on mount and when settings panel opens
  useEffect(() => {
    fetchConfiguredChannels();
  }, [fetchConfiguredChannels]);

  // Refresh channels when settings panel opens
  useEffect(() => {
    if (showSettings) {
      fetchConfiguredChannels();
    }
  }, [showSettings, fetchConfiguredChannels]);

  const generateRequestId = () => {
    messageIdRef.current += 1;
    return `req-${Date.now()}-${messageIdRef.current}`;
  };

  const generateMessageId = () => {
    messageIdRef.current += 1;
    return `msg-${Date.now()}-${messageIdRef.current}`;
  };

  // Extract actual user message from OpenClaw format (strips metadata headers)
  const extractUserMessage = (content: string): string => {
    // User messages come with metadata like:
    // "Conversation info (untrusted metadata):\n```json\n...\n```\n\nSender (untrusted metadata):\n```json\n...\n```\n\nactual message"
    // We want just the actual message at the end
    const parts = content.split('\n\n');
    // The actual message is usually the last part after all metadata blocks
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].trim();
      // Skip metadata blocks
      if (!part.startsWith('Conversation info') &&
          !part.startsWith('Sender') &&
          !part.startsWith('```') &&
          part.length > 0) {
        return part;
      }
    }
    return content;
  };

  // Fetch chat history from the session file
  const fetchHistory = useCallback(async () => {
    try {
      setDebugInfo('fetching history...');
      const history = await invoke('get_chat_history') as any[];

      if (history && history.length > 0) {
        const formattedMessages: Message[] = history.map((msg: any) => {
          let content = msg.content || '';
          // Strip metadata from user messages
          if (msg.role === 'user') {
            content = extractUserMessage(content);
          }
          // Strip leading newlines from assistant messages
          if (msg.role === 'assistant') {
            content = content.replace(/^\n+/, '');
          }
          const role: 'user' | 'assistant' = msg.role === 'user' ? 'user' : 'assistant';
          return {
            id: msg.id || generateMessageId(),
            role,
            content,
            timestamp: new Date(msg.timestamp || Date.now()),
            channel: 'telegram', // These came from Telegram
          };
        }).filter((m) => m.content.trim());

        setMessages(formattedMessages);
        setDebugInfo(`loaded ${formattedMessages.length} messages`);
        setHistoryLoaded(true);
      } else {
        setDebugInfo('no history found');
        setHistoryLoaded(true);
      }
    } catch (e) {
      setDebugInfo('history error: ' + e);
      setHistoryLoaded(true);
    }
  }, []);

  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Initialize notifications on mount
  useEffect(() => {
    initNotifications().then(granted => {
      if (granted) {
        console.log('Notifications enabled');
      }
    });
  }, []);

  // Save messages to localStorage when they change
  useEffect(() => {
    if (currentAgentId && messages.length > 0) {
      const key = `clawbox_chat_${currentAgentId}`;
      localStorage.setItem(key, JSON.stringify(messages));
    }
  }, [messages, currentAgentId]);

  // Load/switch chat history when agent changes
  useEffect(() => {
    if (activeAgentId && activeAgentId !== currentAgentId) {
      // Save current agent's messages before switching
      if (currentAgentId && messages.length > 0) {
        const key = `clawbox_chat_${currentAgentId}`;
        localStorage.setItem(key, JSON.stringify(messages));
      }

      // Load new agent's messages from localStorage
      const newKey = `clawbox_chat_${activeAgentId}`;
      const saved = localStorage.getItem(newKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Message[];
          // Restore Date objects from serialized strings
          const restored = parsed.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
          setMessages(restored);
        } catch {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
      setHistoryLoaded(true);
      setCurrentAgentId(activeAgentId);
    }
  }, [activeAgentId, currentAgentId, messages]);

  // Fetch configured channels on mount
  const fetchChannels = useCallback(async () => {
    try {
      const channels = await invoke('get_channels') as string[];
      setConfiguredChannels(channels);
    } catch (e) {
      console.error('Failed to fetch channels:', e);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Handle adding a channel
  const handleAddChannel = async () => {
    if (!selectedChannel) return;

    setIsAddingChannel(true);
    setChannelError(null);
    setChannelSuccess(null);

    try {
      const config: any = {
        channel: selectedChannel.id,
      };

      if (selectedChannel.requiresToken) {
        if (!channelInput.trim()) {
          setChannelError(`${selectedChannel.tokenLabel} is required`);
          setIsAddingChannel(false);
          return;
        }
        config.botToken = channelInput.trim();
      } else if (selectedChannel.requiresPhone) {
        if (!channelInput.trim()) {
          setChannelError('Phone number is required');
          setIsAddingChannel(false);
          return;
        }
        config.phoneNumber = channelInput.trim();
      } else if (selectedChannel.requiresWebhook) {
        if (!channelInput.trim()) {
          setChannelError('Webhook URL is required');
          setIsAddingChannel(false);
          return;
        }
        config.webhookUrl = channelInput.trim();
      }

      const result = await invoke('add_channel', { config }) as { success: boolean; message: string; instructions?: string };

      if (result.success) {
        setChannelSuccess(result.instructions || result.message);
        setConfiguredChannels(prev => [...prev, selectedChannel.id]);
        setChannelInput('');
        // Refresh channels from server
        fetchConfiguredChannels();
        // Auto close after 3 seconds
        setTimeout(() => {
          setSelectedChannel(null);
          setChannelSuccess(null);
        }, 3000);
      } else {
        setChannelError(result.message);
      }
    } catch (e) {
      setChannelError(String(e));
    } finally {
      setIsAddingChannel(false);
    }
  };

  // Send connect request after receiving challenge
  const sendConnectRequest = useCallback(async () => {
    const connectRequest = {
      type: 'req',
      id: generateRequestId(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'webchat',
          version: '1.0.0',
          platform: 'macos',
          mode: 'webchat'
        },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write'],
        auth: {
          token: gatewayTokenRef.current || '',
        },
        userAgent: navigator.userAgent,
        locale: navigator.language,
      },
    };

    try {
      await invoke('ws_send', { message: JSON.stringify(connectRequest) });
      setDebugInfo('sent connect request');
    } catch (e) {
      setDebugInfo('failed to send connect: ' + e);
    }
  }, []);

  // Handle incoming messages from the WebSocket proxy
  const handleMessage = useCallback((data: any) => {
    if (data.type === 'event') {
      switch (data.event) {
        case 'connect.challenge':
          setDebugInfo('got challenge, sending connect...');
          sendConnectRequest();
          break;

        case 'agent.message':
        case 'message':
          if (data.payload?.content || data.payload?.text) {
            const content = data.payload.content || data.payload.text;
            setMessages(prev => [...prev, {
              id: data.payload.id || generateMessageId(),
              role: 'assistant',
              content,
              timestamp: new Date(),
              channel: data.payload.channel,
            }]);
          }
          break;

        case 'agent.stream.start':
          setIsStreaming(true);
          setMessages(prev => [...prev, {
            id: data.payload?.id || generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            pending: true,
          }]);
          break;

        case 'agent.stream.chunk':
          if (data.payload?.delta || data.payload?.content) {
            const chunk = data.payload.delta || data.payload.content;
            setMessages(prev => {
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].pending) {
                const updated = [...prev];
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: updated[lastIdx].content + chunk,
                };
                return updated;
              }
              return prev;
            });
          }
          break;

        case 'agent.stream.end':
          setIsStreaming(false);
          setMessages(prev => prev.map(m =>
            m.pending ? { ...m, pending: false } : m
          ));
          break;

        case 'error':
          setError(data.payload?.message || 'Unknown error');
          break;
      }
      return;
    }

    if (data.type === 'res') {
      if (data.ok && data.payload?.type === 'hello-ok') {
        setConnectionState('connected');
        setDebugInfo('connected! fetching history...');

        // Fetch chat history after connecting
        fetchHistory();

        setMessages(prev => [...prev, {
          id: generateMessageId(),
          role: 'system',
          content: 'Connected to ClawBox',
          timestamp: new Date(),
        }]);
      } else if (!data.ok) {
        const errorMsg = data.error?.message || data.error?.code || 'Connection failed';
        setError(errorMsg);
        setConnectionState('error');
        setDebugInfo('error: ' + errorMsg);
      } else if (data.payload?.type === 'message.sent') {
        // Message sent successfully
      } else if (data.payload?.content || data.payload?.text) {
        const content = data.payload.content || data.payload.text;
        setMessages(prev => [...prev, {
          id: data.id || generateMessageId(),
          role: 'assistant',
          content,
          timestamp: new Date(),
        }]);
      }
    }
  }, [sendConnectRequest, fetchHistory]);

  // Main initialization effect
  useEffect(() => {
    let mounted = true;
    setDebugInfo('mounting...');

    const init = async () => {
      try {
        // Set up event listeners first
        setDebugInfo('setting up listeners...');

        const unlistenConnected = await listen('ws-connected', () => {
          if (!mounted) return;
          setConnectionState('authenticating');
          setDebugInfo('ws connected, waiting for challenge...');
        });
        unlistenersRef.current.push(unlistenConnected);

        const unlistenMessage = await listen<string>('ws-message', (event) => {
          if (!mounted) return;
          try {
            const data = JSON.parse(event.payload);
            handleMessage(data);
          } catch (e) {
            console.error('[Chat] parse error:', e);
            setDebugInfo('parse error: ' + e);
          }
        });
        unlistenersRef.current.push(unlistenMessage);

        const unlistenError = await listen<string>('ws-error', (event) => {
          if (!mounted) return;
          setError(event.payload);
          setConnectionState('error');
          setDebugInfo('ws error: ' + event.payload);
        });
        unlistenersRef.current.push(unlistenError);

        const unlistenDisconnected = await listen('ws-disconnected', () => {
          if (!mounted) return;
          setConnectionState('disconnected');
          setDebugInfo('ws disconnected');
        });
        unlistenersRef.current.push(unlistenDisconnected);

        // Fetch gateway token
        setDebugInfo('fetching token...');
        try {
          const token = await invoke('get_gateway_token') as string | null;
          if (!mounted) return;
          if (token) {
            gatewayTokenRef.current = token;
            setDebugInfo('got token, connecting...');
          } else {
            setDebugInfo('no token, connecting anyway...');
          }
        } catch (e) {
          setDebugInfo('token error: ' + e);
        }

        setConnectionState('connected');
        setDebugInfo('ready');

      } catch (e) {
        if (!mounted) return;
        setDebugInfo('init error: ' + e);
        console.error('Init error:', e);
      }
    };

    init();

    return () => {
      mounted = false;
      // Clean up listeners
      for (const unlisten of unlistenersRef.current) {
        unlisten();
      }
      unlistenersRef.current = [];
    };
  }, [status.gateway_url, handleMessage]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() && attachedFiles.length === 0) {
      return;
    }

    let messageContent = input.trim();
    const currentAttachments = [...attachedFiles];

    // Append file references to the message
    if (currentAttachments.length > 0) {
      const fileList = currentAttachments
        .map(f => `/home/openclaw/.openclaw${f.path}`)
        .join('\n- ');
      const attachmentText = `\n\n[Attached files available in workspace:]\n- ${fileList}`;
      messageContent = messageContent + attachmentText;
    }

    const messageId = generateMessageId();

    // Show user message with attachments shown inline
    const displayContent = input.trim();

    // Convert attachments for storage with message
    const messageAttachments: MessageAttachment[] = currentAttachments.map(f => ({
      name: f.name,
      preview: f.preview,
      type: f.type,
    }));

    const userMessage: Message = {
      id: messageId,
      role: 'user',
      content: displayContent,
      timestamp: new Date(),
      attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
    };
    console.log('Sending message with attachments:', userMessage);
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedFiles([]);
    setIsStreaming(true);

    // Add pending assistant message
    const assistantId = generateMessageId();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      pending: true,
    }]);

    try {
      // Send via CLI command instead of WebSocket
      const response = await invoke('send_chat_message', { message: messageContent }) as string;
      const trimmedResponse = response.trim();

      // Update the pending message with the response
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: trimmedResponse, pending: false }
          : m
      ));

      // Check if the response contains a reminder and schedule it
      const reminder = parseReminderFromResponse(trimmedResponse);
      if (reminder) {
        scheduleReminder(reminder.message, reminder.time);
      }
    } catch (e) {
      setError('Failed to send message: ' + e);
      // Remove the pending message on error
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }

    inputRef.current?.focus();
  }, [input, attachedFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Channel icon component
  const getChannelIcon = (channelId: string) => {
    switch (channelId) {
      case 'telegram':
        return (
          <svg viewBox="0 0 24 24" fill="#26A5E4" width="24" height="24">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        );
      case 'whatsapp':
        return (
          <svg viewBox="0 0 24 24" fill="#25D366" width="24" height="24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        );
      case 'discord':
        return (
          <svg viewBox="0 0 24 24" fill="#5865F2" width="24" height="24">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
          </svg>
        );
      case 'slack':
        return (
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
            <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
            <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
            <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
          </svg>
        );
      case 'signal':
        return (
          <svg viewBox="0 0 24 24" fill="#3A76F0" width="24" height="24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.5c5.247 0 9.5 4.253 9.5 9.5s-4.253 9.5-9.5 9.5S2.5 17.247 2.5 12 6.753 2.5 12 2.5zm0 2a7.5 7.5 0 100 15 7.5 7.5 0 000-15zm0 2.5a5 5 0 110 10 5 5 0 010-10z"/>
          </svg>
        );
      case 'imessage':
        return (
          <svg viewBox="0 0 24 24" fill="#34C759" width="24" height="24">
            <path d="M12 2C6.477 2 2 5.813 2 10.5c0 2.34 1.054 4.468 2.788 6.036L4 22l5.046-2.623A11.456 11.456 0 0012 19.5c5.523 0 10-3.813 10-8.5S17.523 2 12 2z"/>
          </svg>
        );
      case 'googlechat':
        return (
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="#00AC47" d="M22.365 8.729c.9 0 1.635-.735 1.635-1.635V1.635C24 .735 23.265 0 22.365 0h-5.46c-.9 0-1.635.735-1.635 1.635v5.459c0 .9.735 1.635 1.635 1.635h1.23v2.124l2.124-2.124h2.106z"/>
            <path fill="#00832D" d="M1.635 24h5.459c.9 0 1.635-.735 1.635-1.635V8.73H1.635C.735 8.729 0 9.464 0 10.364v12.001C0 23.265.735 24 1.635 24z"/>
            <path fill="#FFBA00" d="M8.729 8.729V1.635C8.729.735 7.994 0 7.094 0h-5.46C.735 0 0 .735 0 1.635v5.459c0 .9.735 1.636 1.635 1.636h7.094z"/>
            <path fill="#00AC47" d="M15.27 24h7.095c.9 0 1.635-.735 1.635-1.635V15.27h-7.094c-.9 0-1.636.735-1.636 1.635V24z"/>
            <path fill="#0066DA" d="M15.27 8.729h7.095c.9 0 1.635.735 1.635 1.635v5.459c0 .9-.735 1.635-1.635 1.635H15.27c-.9 0-1.636-.734-1.636-1.635v-5.459c0-.9.736-1.635 1.636-1.635z"/>
            <path fill="#00832D" d="M8.729 15.27v7.095c0 .9.735 1.635 1.635 1.635h5.459c.9 0 1.635-.735 1.635-1.635V15.27c0-.9-.735-1.636-1.635-1.636H10.364c-.9 0-1.635.736-1.635 1.636z"/>
          </svg>
        );
      case 'line':
        return (
          <svg viewBox="0 0 24 24" fill="#00B900" width="24" height="24">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
          </svg>
        );
      case 'irc':
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M3 3h18v14H7l-4 4V3zm2 2v10.17l1.59-1.59.41-.41.58-.17H19V5H5zm2 2h10v2H7V7zm0 4h7v2H7v-2z"/>
          </svg>
        );
      case 'matrix':
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 0 0-.18-.66 1.106 1.106 0 0 0-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 0 0-.48.499 1.946 1.946 0 0 0-.231.696 5.56 5.56 0 0 0-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 0 0-.143-.688 1.052 1.052 0 0 0-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.282-.171.138-.319.33-.439.573-.121.242-.18.556-.18.937v5.067H7.676V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z"/>
          </svg>
        );
      case 'nostr':
        return (
          <svg viewBox="0 0 24 24" fill="#8B5CF6" width="24" height="24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        );
      case 'tlon':
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="12" r="4"/>
          </svg>
        );
      default:
        return null;
    }
  };

  // Get agent config from localStorage
  const getAgentConfig = (): { name: string; persona: string } => {
    try {
      const agentConfig = localStorage.getItem('clawbox_agent_config');
      if (agentConfig) {
        const parsed = JSON.parse(agentConfig);
        return {
          name: parsed.name || 'ClawBox',
          persona: parsed.persona || 'assistant'
        };
      }
    } catch {
      // Invalid JSON in localStorage
    }
    return { name: 'ClawBox', persona: 'assistant' };
  };
  const { name: agentName, persona: agentPersona } = getAgentConfig();
  const PixelAvatar = getPixelCharacter(agentPersona);

  return (
    <div
      className={`chat-page ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragging && (
        <div className="drop-zone-overlay">
          <div className="drop-zone-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Drop files here</span>
          </div>
        </div>
      )}

      {/* Download progress toast */}
      {downloadingFile && (
        <div className="download-toast downloading">
          <div className="download-toast-icon">
            <div className="spinner small" />
          </div>
          <div className="download-toast-content">
            <span className="download-toast-title">Downloading...</span>
            <span className="download-toast-filename">{downloadingFile}</span>
          </div>
        </div>
      )}

      {/* Download complete toast */}
      {downloadedFile && (
        <div className="download-toast success">
          <div className="download-toast-icon success">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div className="download-toast-content">
            <span className="download-toast-title">Saved to Downloads</span>
            <span className="download-toast-filename">{downloadedFile.name}</span>
          </div>
          <div className="download-toast-actions">
            <button type="button" className="download-toast-btn open" onClick={openDownloadedFile} title="Open file">
              Open
            </button>
            <button type="button" className="download-toast-btn finder" onClick={showInFinder} title="Show in Finder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button type="button" className="download-toast-btn dismiss" onClick={dismissDownloadToast} title="Dismiss">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="btn-icon" onClick={() => setShowSettings(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="settings-content">
              <div className="settings-section">
                <h3>Channels</h3>
                <p className="settings-desc">Connect messaging apps to chat on the go</p>

                <div className="channels-grid">
                  {CHANNELS.map((channel) => (
                    <div
                      key={channel.id}
                      className={`channel-card ${configuredChannels.includes(channel.id) ? 'configured' : ''}`}
                      onClick={() => {
                        setSelectedChannel(channel);
                        setChannelInput('');
                        setChannelError(null);
                        setChannelSuccess(null);
                      }}
                    >
                      <div className="channel-icon">
                        {getChannelIcon(channel.id)}
                      </div>
                      <span className="channel-name">{channel.name}</span>
                      {configuredChannels.includes(channel.id) && (
                        <span className="channel-connected-badge">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="settings-section">
                <h3>Assistant</h3>
                <p className="settings-desc">Manage your AI assistant</p>
                <div className="settings-item">
                  <span>Name</span>
                  <span className="settings-value">{agentName}</span>
                </div>
                <button
                  className="btn-secondary btn-small"
                  onClick={() => {
                    localStorage.removeItem('clawbox_onboarding_complete');
                    localStorage.removeItem('clawbox_agent_config');
                    window.location.reload();
                  }}
                >
                  Reconfigure Assistant
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Channel Setup Modal */}
      {selectedChannel && (
        <div className="channel-setup-overlay" onClick={() => setSelectedChannel(null)}>
          <div className={`channel-setup-modal ${selectedChannel.id === 'telegram' ? 'telegram-setup-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedChannel(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div className="channel-setup-icon">
              {getChannelIcon(selectedChannel.id)}
            </div>
            <h2>Connect {selectedChannel.name}</h2>

            {/* Telegram-specific instructions */}
            {selectedChannel.id === 'telegram' && !channelSuccess && (
              <div className="telegram-instructions">
                <div className="instruction-steps">
                  <div className="instruction-step">
                    <div className="step-number">1</div>
                    <div className="step-content">
                      <div className="step-title">Open Telegram and search for @BotFather</div>
                      <div className="step-desc">BotFather is Telegram's official bot for creating bots</div>
                    </div>
                  </div>
                  <div className="instruction-step">
                    <div className="step-number">2</div>
                    <div className="step-content">
                      <div className="step-title">Send /newbot to BotFather</div>
                      <div className="step-desc">Follow the prompts to name your bot (e.g., "{agentName} Bot")</div>
                    </div>
                  </div>
                  <div className="instruction-step">
                    <div className="step-number">3</div>
                    <div className="step-content">
                      <div className="step-title">Copy the bot token</div>
                      <div className="step-desc">BotFather will give you a token like <code>123456789:ABCdefGHI...</code></div>
                    </div>
                  </div>
                  <div className="instruction-step">
                    <div className="step-number">4</div>
                    <div className="step-content">
                      <div className="step-title">Paste it below</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Generic instructions for other channels */}
            {selectedChannel.id !== 'telegram' && (
              <p className="channel-instructions">{selectedChannel.instructions}</p>
            )}

            {channelError && (
              <div className="channel-error">{channelError}</div>
            )}

            {channelSuccess && (
              <div className="channel-success">{channelSuccess}</div>
            )}

            {!channelSuccess && (selectedChannel.requiresToken || selectedChannel.requiresPhone || selectedChannel.requiresWebhook) && (
              <div className="channel-input-group">
                <label>
                  {selectedChannel.requiresToken && selectedChannel.tokenLabel}
                  {selectedChannel.requiresPhone && 'Phone Number'}
                  {selectedChannel.requiresWebhook && 'Webhook URL'}
                </label>
                <input
                  type={selectedChannel.requiresToken ? 'password' : 'text'}
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  placeholder={
                    selectedChannel.id === 'telegram' ? '123456789:ABCdefGHIjklMNOpqrsTUVwxyz' :
                    selectedChannel.requiresToken ? `Enter ${selectedChannel.tokenLabel}` :
                    selectedChannel.requiresPhone ? '+1234567890' :
                    'https://...'
                  }
                />
              </div>
            )}

            {!channelSuccess && (
              <div className="channel-setup-actions">
                <button
                  className="btn-primary"
                  onClick={handleAddChannel}
                  disabled={isAddingChannel || (
                    (selectedChannel.requiresToken || selectedChannel.requiresPhone || selectedChannel.requiresWebhook) &&
                    !channelInput.trim()
                  )}
                >
                  {isAddingChannel ? (
                    <>
                      <span className="spinner small" />
                      Connecting...
                    </>
                  ) : (
                    `Connect ${selectedChannel.name}`
                  )}
                </button>
                <button className="btn-secondary" onClick={() => setSelectedChannel(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="chat-header">
        <div className="chat-header-info">
          <h1>{agentName}</h1>
          <div className="chat-status">
            <span className="status-dot status-online" />
            <span className="status-text">Online</span>
          </div>
        </div>
        <div className="chat-header-actions">
          <button
            className="btn-icon"
            onClick={() => { setShowFilesPanel(true); fetchWorkspaceFiles(); }}
            title="Files"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Files Panel */}
      {showFilesPanel && (
        <div className="settings-overlay" onClick={() => setShowFilesPanel(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>Workspace Files</h2>
              <button className="btn-icon" onClick={() => setShowFilesPanel(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="settings-content">
              <p className="settings-desc" style={{ marginBottom: '16px' }}>
                Files created by or shared with your assistant
              </p>
              {workspaceFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '12px', opacity: 0.5 }}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <p>No files yet</p>
                  <p style={{ fontSize: '13px', marginTop: '4px' }}>Drop files into the chat or ask your assistant to create files</p>
                </div>
              ) : (
                <div className="files-list">
                  {workspaceFiles.map((file, index) => (
                    <div key={index} className="file-item" onClick={() => downloadWorkspaceFile(file)}>
                      <div className="file-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      </div>
                      <div className="file-info">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{formatFileSize(file.size)}</span>
                      </div>
                      <div className="file-download">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="btn-secondary"
                style={{ marginTop: '16px', width: '100%' }}
                onClick={fetchWorkspaceFiles}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="chat-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="chat-messages">
        {!historyLoaded && (
          <div className="chat-loading">
            <div className="spinner" />
            <p>Loading conversation...</p>
          </div>
        )}

        {historyLoaded && messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-avatar">
              <PixelAvatar size={96} />
            </div>
            <h2>Start chatting with {agentName}</h2>
            <p className="chat-empty-subtitle">Send a message below to begin your conversation</p>

            <div className="chat-empty-divider">
              <span>or chat from anywhere</span>
            </div>

            <div className="chat-empty-channels">
              <button
                className="channel-quick-btn telegram"
                onClick={() => {
                  const telegramChannel = CHANNELS.find(c => c.id === 'telegram');
                  if (telegramChannel) {
                    setSelectedChannel(telegramChannel);
                    setChannelInput('');
                    setChannelError(null);
                    setChannelSuccess(null);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span>Telegram</span>
              </button>
              <button
                className="channel-quick-btn discord"
                onClick={() => {
                  const discordChannel = CHANNELS.find(c => c.id === 'discord');
                  if (discordChannel) {
                    setSelectedChannel(discordChannel);
                    setChannelInput('');
                    setChannelError(null);
                    setChannelSuccess(null);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
                <span>Discord</span>
              </button>
              <button
                className="channel-quick-btn more"
                onClick={() => setShowSettings(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="19" cy="12" r="1"/>
                  <circle cx="5" cy="12" r="1"/>
                </svg>
                <span>More</span>
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${message.role}`}
          >
            {message.role === 'system' ? (
              <div className="chat-system-message">
                {message.content}
              </div>
            ) : (
              <>
                {/* Show attachments for user messages */}
                {message.role === 'user' && message.attachments && message.attachments.length > 0 && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment, idx) => (
                      attachment.type === 'image' && attachment.preview ? (
                        <div key={idx} className="message-attachment-image">
                          <img src={attachment.preview} alt={attachment.name} />
                        </div>
                      ) : (
                        <div key={idx} className="message-attachment-file">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <span>{attachment.name}</span>
                        </div>
                      )
                    ))}
                  </div>
                )}
                {(message.content || message.pending) && (
                  <div className="chat-message-content">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (href) {
                                window.open(href, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                    {message.pending && <span className="typing-indicator">...</span>}
                  </div>
                )}
                {/* Show download cards for files mentioned in assistant messages */}
                {message.role === 'assistant' && !message.pending && extractFilesFromMessage(message.content).length > 0 && (
                  <div
                    className="message-file-cards"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {extractFilesFromMessage(message.content).map((filename, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="message-file-card"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Button clicked for:', filename);
                          const fullPath = `/home/openclaw/.openclaw/workspace/${filename}`;
                          try {
                            await downloadFileByPath(fullPath);
                          } catch (err) {
                            console.error('Download error in onClick:', err);
                          }
                        }}
                      >
                        <div className="message-file-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </div>
                        <span className="message-file-name">{filename}</span>
                        <div className="message-file-download">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="chat-message-meta">
                  <span className="chat-message-time">{formatTime(message.timestamp)}</span>
                  {message.channel && message.channel !== 'desktop' && (
                    <span className="chat-message-channel">via {message.channel}</span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {isStreaming && (
          <div className="chat-typing">
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {/* File preview area */}
        {attachedFiles.length > 0 && (
          <div className="attached-files-preview">
            {attachedFiles.map((file, index) => (
              <div key={index} className={`attached-file-item ${file.type === 'image' ? 'image-type' : 'file-type'}`}>
                {file.type === 'image' && file.preview ? (
                  <>
                    <img src={file.preview} alt={file.name} className="attached-file-image" />
                    <button
                      className="attached-file-remove"
                      onClick={() => removeAttachedFile(index)}
                      type="button"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                    <div className="attached-file-info">
                      <span className="attached-file-name">{file.name}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="attached-file-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div className="attached-file-info">
                      <span className="attached-file-name">{file.name}</span>
                      <button
                        className="attached-file-remove"
                        onClick={() => removeAttachedFile(index)}
                        type="button"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            accept="image/*,.pdf,.txt,.json,.csv,.md,.py,.js,.ts,.html,.css"
          />
          {/* Attach button */}
          <button
            className="chat-attach-btn"
            onClick={openFilePicker}
            disabled={isStreaming}
            title="Attach file"
            type="button"
          >
            📎
          </button>
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isStreaming ? 'Waiting for response...' : 'Type a message or paste an image...'}
            disabled={isStreaming}
            rows={1}
          />
          <button
            className="chat-send-btn"
            onClick={sendMessage}
            disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
