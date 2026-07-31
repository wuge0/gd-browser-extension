import type { Aria2Config, Aria2RpcRequest, Aria2RpcResponse } from '@/shared/types';

/** aria2 服务端推送通知的处理回调，params 为原始通知参数数组 */
export type NotificationHandler = (params: any) => void;
/** 连接状态变化回调（true=已连接，false=断开） */
export type ConnectionStateHandler = (connected: boolean) => void;

/**
 * aria2 JSON-RPC WebSocket 客户端
 * 负责与 aria2c 建立 WebSocket 连接并进行 RPC 通信
 * 支持：无限指数退避自动重连、服务端通知分发、连接状态广播
 */
export class Aria2RpcClient {
  private ws: WebSocket | null = null;
  private rpcUrl: string;
  private secret: string;
  private requestTimeout: number;
  private messageId = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();
  private reconnectAttempts = 0;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // 主动断开标志：为 true 时不再触发自动重连
  private manualDisconnect = false;
  // 服务端通知处理器注册表：method -> handler 集合
  private notificationHandlers = new Map<string, Set<NotificationHandler>>();
  // 连接状态变化处理器集合
  private stateHandlers = new Set<ConnectionStateHandler>();

  constructor(config: Aria2Config) {
    this.rpcUrl = config.url;
    this.secret = config.secret;
    this.requestTimeout = config.requestTimeout > 0 ? config.requestTimeout : 30000;
  }

  /**
   * 注册服务端通知处理器
   * @returns 取消注册的函数
   */
  onNotification(method: string, handler: NotificationHandler): () => void {
    let handlers = this.notificationHandlers.get(method);
    if (!handlers) {
      handlers = new Set();
      this.notificationHandlers.set(method, handlers);
    }
    handlers.add(handler);
    return () => {
      this.notificationHandlers.get(method)?.delete(handler);
    };
  }

  /**
   * 注册连接状态变化处理器
   * @returns 取消注册的函数
   */
  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /**
   * 广播连接状态变化
   */
  private emitState(connected: boolean) {
    for (const handler of this.stateHandlers) {
      try {
        handler(connected);
      } catch (error) {
        console.error('Connection state handler error:', error);
      }
    }
  }

  /**
   * 建立 WebSocket 连接
   */
  async connect(): Promise<void> {
    this.manualDisconnect = false;
    this.clearReconnectTimer();

    // 已连接或正在连接则直接返回，避免重复建连
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN) {
        return;
      }
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      try {
        this.ws = new WebSocket(this.rpcUrl);
      } catch (error) {
        reject(error);
        this.scheduleReconnect();
        return;
      }

      this.ws.onopen = () => {
        console.log('Connected to aria2c');
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.emitState(true);
        settled = true;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('Disconnected from aria2c');
        this.emitState(false);
        this.handleDisconnect();
      };
    });
  }

  /**
   * 处理接收到的消息
   * 区分：请求响应（有 id）与服务端推送通知（有 method、无 id）
   */
  private handleMessage(data: string) {
    try {
      const response: Aria2RpcResponse & { method?: string; params?: any } = JSON.parse(data);

      // 服务端推送通知：aria2.onDownloadStart / onDownloadComplete 等
      if (response.method && (response.id === undefined || response.id === null)) {
        this.dispatchNotification(response.method, response.params);
        return;
      }

      // 请求响应
      if (response.id !== undefined && response.id !== null) {
        const pending = this.pendingRequests.get(String(response.id));
        if (pending) {
          this.pendingRequests.delete(String(response.id));

          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse response:', error);
    }
  }

  /**
   * 分发服务端通知到已注册处理器
   */
  private dispatchNotification(method: string, params: any) {
    const handlers = this.notificationHandlers.get(method);
    if (!handlers || handlers.size === 0) {
      return;
    }
    for (const handler of handlers) {
      try {
        handler(params);
      } catch (error) {
        console.error(`Notification handler error for ${method}:`, error);
      }
    }
  }

  /**
   * 确保已连接
   */
  async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  /**
   * 调用 aria2 RPC 方法
   */
  async call(method: string, ...params: any[]): Promise<any> {
    await this.ensureConnected();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = (++this.messageId).toString();

    const request: Aria2RpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: [`token:${this.secret}`, ...params]
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.ws!.send(JSON.stringify(request));

      // 请求超时（从配置读取，默认 30 秒）
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, this.requestTimeout);
    });
  }

  /**
   * 主动断开连接（不触发自动重连）
   */
  disconnect() {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * SW 唤醒 / 保活时调用：若已断线则立即发起一次重连
   */
  reconnectNow() {
    if (this.manualDisconnect) {
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.connect().catch(() => {
      // 失败后 onclose -> scheduleReconnect 会继续重试
    });
  }

  /**
   * 处理断开连接：拒绝待处理请求，并按需调度自动重连
   */
  private handleDisconnect() {
    // 拒绝所有待处理的请求
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (!this.manualDisconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * 调度自动重连：无限次指数退避（1s 基数 / 30s 上限）
   */
  private scheduleReconnect() {
    if (this.manualDisconnect || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect().catch(() => {
        // onclose -> scheduleReconnect 会继续下一轮
      });
    }, delay);
  }

  /**
   * 清除待触发的重连定时器
   */
  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 获取 WebSocket 状态
   */
  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}
