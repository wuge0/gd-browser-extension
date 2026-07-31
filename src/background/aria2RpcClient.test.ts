import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Aria2RpcClient } from './aria2RpcClient';
import type { Aria2Config } from '@/shared/types';

/**
 * 模拟 WebSocket，可手动触发 open/message/close，供连接层测试使用
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // 测试辅助：模拟连接建立
  _open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  // 测试辅助：模拟收到一条消息
  _message(payload: any) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

const CONFIG: Aria2Config = {
  url: 'ws://127.0.0.1:16888/jsonrpc',
  secret: 'test-secret',
  autoConnect: true,
  reconnectInterval: 5000,
  requestTimeout: 1000
};

describe('Aria2RpcClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    // @ts-expect-error 用 Mock 覆盖全局 WebSocket
    global.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** 建连并返回对应的 mock socket */
  async function connectClient(client: Aria2RpcClient): Promise<MockWebSocket> {
    const promise = client.connect();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws._open();
    await promise;
    return ws;
  }

  it('分发服务端通知（有 method、无 id）到已注册处理器', async () => {
    const client = new Aria2RpcClient(CONFIG);
    const ws = await connectClient(client);

    const handler = vi.fn();
    client.onNotification('aria2.onDownloadStart', handler);

    ws._message({ jsonrpc: '2.0', method: 'aria2.onDownloadStart', params: [{ gid: 'abc' }] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([{ gid: 'abc' }]);
  });

  it('通知不会被错误当成请求响应处理', async () => {
    const client = new Aria2RpcClient(CONFIG);
    const ws = await connectClient(client);

    // 仅注册通知处理器，不应抛错
    const handler = vi.fn();
    client.onNotification('aria2.onDownloadComplete', handler);
    ws._message({ jsonrpc: '2.0', method: 'aria2.onDownloadComplete', params: [{ gid: 'g1' }] });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('call() 按 id 匹配响应并解析结果', async () => {
    const client = new Aria2RpcClient(CONFIG);
    const ws = await connectClient(client);

    const callPromise = client.call('aria2.getGlobalStat');
    // call() 内部 await ensureConnected() 后才 send，需先 flush 微任务
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sent = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sent.method).toBe('aria2.getGlobalStat');
    expect(sent.params[0]).toBe('token:test-secret');

    ws._message({ jsonrpc: '2.0', id: sent.id, result: { numActive: '2' } });
    await expect(callPromise).resolves.toEqual({ numActive: '2' });
  });

  it('call() 在响应含 error 时 reject', async () => {
    const client = new Aria2RpcClient(CONFIG);
    const ws = await connectClient(client);

    const callPromise = client.call('aria2.tellStatus', 'bad-gid');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sent = JSON.parse(ws.sent[ws.sent.length - 1]);
    ws._message({ jsonrpc: '2.0', id: sent.id, error: { code: 1, message: 'not found' } });

    await expect(callPromise).rejects.toThrow('not found');
  });

  it('连接状态变化广播 connected=true/false', async () => {
    const client = new Aria2RpcClient(CONFIG);
    const stateHandler = vi.fn();
    client.onConnectionStateChange(stateHandler);

    const ws = await connectClient(client);
    expect(stateHandler).toHaveBeenCalledWith(true);

    ws.close();
    expect(stateHandler).toHaveBeenCalledWith(false);
  });

  it('非主动断开时按指数退避自动重连', async () => {
    vi.useFakeTimers();
    const client = new Aria2RpcClient(CONFIG);

    const promise = client.connect();
    const ws1 = MockWebSocket.instances[0];
    ws1._open();
    await promise;
    expect(MockWebSocket.instances).toHaveLength(1);

    // 模拟意外断开（非 disconnect()）
    ws1.close();

    // 基础退避 1s 后应发起第二次建连
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('主动 disconnect() 后不再自动重连', async () => {
    vi.useFakeTimers();
    const client = new Aria2RpcClient(CONFIG);

    const promise = client.connect();
    const ws1 = MockWebSocket.instances[0];
    ws1._open();
    await promise;

    client.disconnect();
    await vi.advanceTimersByTimeAsync(5000);

    // 不应有新的建连
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('isConnected 反映底层 socket 状态', async () => {
    const client = new Aria2RpcClient(CONFIG);
    expect(client.isConnected()).toBe(false);
    const ws = await connectClient(client);
    expect(client.isConnected()).toBe(true);
    ws.close();
    expect(client.isConnected()).toBe(false);
  });
});
