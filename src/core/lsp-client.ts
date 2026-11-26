import type { Readable, Writable } from "node:stream";

export interface Cancel {
  readonly cancelled: boolean;
  onCancel(listener: () => void): void;
}

interface Message {
  id?: number | string;
  method?: string;
  params?: any;
  result?: unknown;
  error?: { code: number; message: string };
}

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

const REQUEST_CANCELLED = -32800;

/** JSON-RPC 2.0 with `Content-Length` framing over a readable and a writable. */
export class LspClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private requestHandlers = new Map<string, (params: any) => unknown>();
  private notificationHandlers = new Map<string, (params: any) => void>();
  private buffer = Buffer.alloc(0);
  private closed = false;
  private output: Writable;

  constructor(input: Readable, output: Writable) {
    this.output = output;
    input.on("data", (chunk: Buffer) => this.read(chunk));
    input.on("end", () => this.close());
    input.on("error", () => this.close());
    output.on("error", () => this.close());
  }

  /** Rejects with the server's error, or with "closed" when the stream ends first. */
  request<T>(method: string, params: unknown, cancel?: Cancel): Promise<T> {
    if (this.closed) return Promise.reject(new Error("closed"));
    const id = this.nextId++;
    const answer = new Promise<T>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.write({ jsonrpc: "2.0", id, method, params });
    cancel?.onCancel(() => this.pending.has(id) && this.notify("$/cancelRequest", { id }));
    return answer;
  }

  notify(method: string, params: unknown): void {
    if (!this.closed) this.write({ jsonrpc: "2.0", method, params });
  }

  /** Answers a request the server sends; without a handler the answer is null. */
  onRequest(method: string, handler: (params: any) => unknown): void {
    this.requestHandlers.set(method, handler);
  }

  onNotification(method: string, handler: (params: any) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  /** Rejects everything pending; later calls reject at once. */
  close(): void {
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(new Error("closed"));
    this.pending.clear();
  }

  private write(message: object): void {
    const body = Buffer.from(JSON.stringify(message));
    this.output.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  }

  // N counts bytes, and a message may be split across chunks or share one.
  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const head = this.buffer.indexOf("\r\n\r\n");
      if (head < 0) return;
      const length = /Content-Length: *(\d+)/i.exec(this.buffer.subarray(0, head).toString("ascii"));
      if (!length) {
        this.buffer = this.buffer.subarray(head + 4);
        continue;
      }
      const end = head + 4 + Number(length[1]);
      if (this.buffer.length < end) return;
      const body = this.buffer.subarray(head + 4, end).toString("utf8");
      this.buffer = this.buffer.subarray(end);
      try {
        this.dispatch(JSON.parse(body));
      } catch {
        // A message that is not JSON is the server's mistake; keep reading.
      }
    }
  }

  private dispatch(message: Message): void {
    if (message.method === undefined) return this.answer(message);
    if (message.id === undefined) return this.notificationHandlers.get(message.method)?.(message.params);
    const id = message.id;
    const reply = (result: unknown) => this.write({ jsonrpc: "2.0", id, result });
    const handler = this.requestHandlers.get(message.method);
    if (!handler) return reply(null);
    Promise.resolve()
      .then(() => handler(message.params))
      .then((result) => reply(result ?? null), () => reply(null));
  }

  private answer(message: Message): void {
    const pending = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
    if (!pending) return;
    this.pending.delete(message.id as number);
    if (!message.error) pending.resolve(message.result ?? null);
    else if (message.error.code === REQUEST_CANCELLED) pending.resolve(null);
    else pending.reject(new Error(message.error.message));
  }
}
