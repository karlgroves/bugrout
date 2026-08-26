/**
 * Shared helpers for the endpoint security regression tests.
 *
 * These tests exercise the real worker `fetch` handlers and the real
 * route-tracker request handler with faked bindings, rather than asserting on
 * source text. A control that is deleted must make a test go red.
 */

import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

import type { IncomingMessage, ServerResponse } from "node:http";

export /**
 * Patterns that must never appear in a response body reaching a client.
 *
 * §18 of the baseline names this check and this is the regex it specifies.
 * Note it matches on those four words, not on the shape of a stack trace —
 * `headers.security.test.ts` records what that does and does not catch.
 */
const LEAKAGE_PATTERN = /stack|trace|node_modules|syntaxerror/i;

/**
 * Assert that a body leaks no internal detail.
 *
 * @param body - The response body as text.
 * @param label - Test label used in the failure message.
 */
export function assertNoLeakage(body: string, label: string): void {
  if (LEAKAGE_PATTERN.test(body)) {
    throw new Error(`${label}: response body leaks internals — ${body}`);
  }
}

/*
 * The doubles below return resolved promises rather than being declared
 * `async`. They stand in for asynchronous platform APIs but do no asynchronous
 * work themselves, and `async` with nothing to await is what
 * @typescript-eslint/require-await exists to flag.
 */

/**
 * Minimal stand-in for an R2 bucket that holds nothing.
 *
 * Empty on purpose: these tests are about what happens *before* the bucket is
 * reached. A request that gets as far as a 404 has already passed the auth and
 * routing checks under test.
 *
 * @returns An object shaped like the subset of R2Bucket that is used.
 */
export function emptyR2(): never {
  return {
    get: (): Promise<null> => Promise.resolve(null),
    head: (): Promise<null> => Promise.resolve(null),
  } as unknown as never;
}

/**
 * Minimal stand-in for a KV namespace backed by a Map.
 *
 * @param seed - Initial contents.
 * @returns An object shaped like a KVNamespace.
 */
export function fakeKv(seed: Record<string, string> = {}): never {
  const store = new Map(Object.entries(seed));
  return {
    get: (key: string, type?: string): Promise<unknown> => {
      const raw = store.get(key) ?? null;
      if (raw === null) return Promise.resolve(null);
      return Promise.resolve(
        type === "json" ? (JSON.parse(raw) as unknown) : raw,
      );
    },
    put: (key: string, value: string): Promise<void> => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string): Promise<void> => {
      store.delete(key);
      return Promise.resolve();
    },
  } as unknown as never;
}

/** What a captured `node:http` response turned out to be. */
export interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Drive a `node:http`-style handler with a fake request and capture what it
 * writes, without binding a port.
 *
 * @param handler - The request handler under test.
 * @param options - Method, url, headers and optional body.
 * @returns The captured status, headers and body.
 */
export async function invokeNodeHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  options: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    remoteAddress?: string;
  },
): Promise<CapturedResponse> {
  const bodyText = options.body ?? "";
  const req = Readable.from(
    bodyText ? [Buffer.from(bodyText)] : [],
  ) as unknown as IncomingMessage;
  req.method = options.method ?? "GET";
  req.url = options.url;
  req.headers = options.headers ?? {};
  // A plain object, not a real Socket: `remoteAddress` is getter-only on
  // net.Socket, and the handler reads nothing else off it.
  Object.defineProperty(req, "socket", {
    value: { remoteAddress: options.remoteAddress ?? "203.0.113.7" },
    configurable: true,
  });

  const captured: CapturedResponse = { status: 0, headers: {}, body: "" };
  let settle: () => void;
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const res = {
    setHeader(name: string, value: string | number) {
      captured.headers[name.toLowerCase()] = String(value);
    },
    getHeader(name: string) {
      return captured.headers[name.toLowerCase()];
    },
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      for (const [k, v] of Object.entries(headers ?? {})) {
        captured.headers[k.toLowerCase()] = v;
      }
      return res;
    },
    end(chunk?: string) {
      if (chunk) captured.body += chunk;
      settle();
      return res;
    },
    write(chunk: string) {
      captured.body += chunk;
      return true;
    },
  } as unknown as ServerResponse;

  await handler(req, res);
  await finished;
  return captured;
}

/**
 * An in-memory stand-in for the ioredis client, covering only the commands
 * route-tracker actually issues: a pipeline of INCR/EXPIRE, SCAN and MGET.
 *
 * Deliberately minimal. Its job is to let a request finish so the security
 * behaviour before and after it can be asserted, not to model Redis.
 *
 * @returns An object shaped like the subset of ioredis that is used.
 */
export function fakeRedis(): never {
  const store = new Map<string, string>();
  return {
    pipeline() {
      const ops: (() => void)[] = [];
      const chain = {
        incr(key: string) {
          ops.push(() => {
            store.set(key, String(Number(store.get(key) ?? "0") + 1));
          });
          return chain;
        },
        expire() {
          return chain;
        },
        exec(): Promise<unknown[]> {
          for (const op of ops) op();
          return Promise.resolve([]);
        },
      };
      return chain;
    },
    scan(
      cursor: string,
      _match: string,
      pattern: string,
    ): Promise<[string, string[]]> {
      if (cursor !== "0") return Promise.resolve(["0", []]);
      const prefix = pattern.replace(/\*$/, "");
      return Promise.resolve([
        "0",
        [...store.keys()].filter((k) => k.startsWith(prefix)),
      ]);
    },
    mget(keys: string[]): Promise<(string | null)[]> {
      return Promise.resolve(keys.map((k) => store.get(k) ?? null));
    },
  } as unknown as never;
}
