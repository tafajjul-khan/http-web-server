import * as fs from "fs/promises";
import * as path from "path";
import * as net from "net";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain",
};

type TCPConn = {
  socket: net.Socket;
  err: null | Error;
  ended: boolean;
  reader: null | {
    resolve: (value: Buffer) => void;
    reject: (reason: Error) => void;
  };
};

type DynBuf = {
  data: Buffer;
  length: number;
};

type HTTPReq = {
  method: string;
  uri: Buffer;
  version: string;
  headers: Buffer[];
};

type HTTPRes = {
  code: number;
  headers: Buffer[];
  body: BodyReader;
};

// an interface for reading/writing data from/to HTTP body
type BodyReader = {
  // the content length -1 if unknown
  length: number;
  // read data . returns an empty buffer after EOF
  read: () => Promise<Buffer>;
};

type BufferGenerator = AsyncGenerator<Buffer, void, void>;

class HTTPError extends Error {
  public code: number;

  constructor(code: number, message: string) {
    super(message);

    this.code = code;
    this.name = "HTTPError";

    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}

// --- TCP Helpers ---
function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket,
    err: null,
    ended: false,
    reader: null,
  };
  socket.on("data", (data: Buffer) => {
    if (!conn.reader) return;
    // pause the "data" event until the next read
    conn.socket.pause();
    // fulfill the promise of the current read
    conn.reader.resolve(data);
    conn.reader = null;
  });
  socket.on("end", () => {
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from("")); // EOF
      conn.reader = null;
    }
  });
  socket.on("error", (err: Error) => {
    // errors are also delivered to the current read
    conn.err = err;
    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  });
  return conn;
}

// returns an empty "buffers" after EOF

function soRead(conn: TCPConn): Promise<Buffer> {
  console.assert(!conn.reader); // no concurrent calls
  return new Promise((resolve, reject) => {
    if (conn.err) return reject(conn.err);
    if (conn.ended) return resolve(Buffer.from(""));
    // save the promise callbacks
    conn.reader = { resolve: resolve, reject: reject };
    // and resume the 'data' event to fulfill the promise later
    conn.socket.resume();
  });
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);
  return new Promise((resolve, reject) => {
    if (conn.err) return reject(conn.err);
    conn.socket.write(data, (err?: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// --- Buffer Helpers ---
function bufPush(buf: DynBuf, data: Buffer): void {
  const newLen = buf.length + data.length;
  if (buf.data.length < newLen) {
    // grow the capicity...
    let cap = Math.max(buf.data.length, 32);
    while (cap < newLen) {
      cap *= 2;
    }
    const grown = Buffer.alloc(cap);
    buf.data.copy(grown, 0, 0);
    buf.data = grown;
  }
  data.copy(buf.data, buf.length, 0);
  buf.length = newLen;
}

function bufPop(buf: DynBuf, len: number): void {
  buf.data.copyWithin(0, len, buf.length);
  buf.length -= len;
}

async function bufExpectMore(conn: TCPConn, buf: DynBuf, msg: string) {
  const data = await soRead(conn);
  if (data.length === 0) {
    throw new Error(`Unexpected EOF while reading ${msg}`);
  }
  bufPush(buf, data);
}

// --- HTTP Helpers ---

function splitLines(data: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = data.indexOf("\r\n", start);
    if (idx < 0) break;
    lines.push(data.subarray(start, idx));
    start = idx + 2;
  }
  return lines;
}

function parseRequestLine(line: Buffer): [string, Buffer, string] {
  const s = line.toString("latin1");
  const parts = s.split(" ");
  if (parts.length !== 3) throw new HTTPError(400, "bad request line");
  return [parts[0]!, Buffer.from(parts[1]!), parts[2]!];
}

function validateHeader(h: Buffer): boolean {
  return h.indexOf(":") > 0;
}

function fieldGet(headers: Buffer[], key: string): null | Buffer {
  for (const h of headers) {
    if (
      h
        .toString("latin1")
        .toLowerCase()
        .startsWith(key.toLowerCase() + ":")
    ) {
      return Buffer.from(
        h
          .subarray(h.indexOf(":") + 1)
          .toString()
          .trim(),
      );
    }
  }
  return null;
}

function parseDec(s: string): number {
  return /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
}

function encodeHTTPResp(res: HTTPRes): Buffer {
  let s = `HTTP/1.1 ${res.code} OK\r\n`; // Simplified 'OK'
  for (const h of res.headers) {
    s += h.toString("latin1") + "\r\n";
  }
  s += "\r\n";
  return Buffer.from(s, "latin1");
}

// --- Main Server Logic ---

const kMaxHeaderLen = 1024 * 8;

function cutMessage(buf: DynBuf): null | HTTPReq {
  const idx = buf.data.subarray(0, buf.length).indexOf("\r\n\r\n");
  if (idx < 0) {
    if (buf.length >= kMaxHeaderLen)
      throw new HTTPError(413, "header too large");
    return null;
  }
  const msg = parseHTTPReq(buf.data.subarray(0, idx + 4));
  bufPop(buf, idx + 4);
  return msg;
}

// parse an HTTP request header
function parseHTTPReq(data: Buffer): HTTPReq {
  // split the data into lines
  const lines: Buffer[] = splitLines(data);
  // the first line is `METHOD URI VERSION`
  const [method, uri, version] = parseRequestLine(lines[0]!);
  // followed by header fields in the format of `Name: value`
  const headers: Buffer[] = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const h = Buffer.from(lines[i]!); // copy
    if (!validateHeader(h)) {
      throw new HTTPError(400, "bad field");
    }
    headers.push(h);
  }
  // the header ends by an empty line
  console.assert(lines[lines.length - 1]?.length === 0);
  return {
    method: method,
    uri: uri,
    version: version,
    headers: headers,
  };
}

function readerFromConnEOF(conn: TCPConn, buf: DynBuf): BodyReader {
  return {
    length: -1,
    read: async () => {
      if (buf.length > 0) {
        const data = Buffer.from(buf.data.subarray(0, buf.length));
        buf.length = 0;
        return data;
      }
      return await soRead(conn);
    },
  };
}

function readerFromMemory(data: Buffer): BodyReader {
  let done = false;
  return {
    length: data.length,
    read: async () => {
      if (done) return Buffer.from("");
      done = true;
      return data;
    },
  };
}

function readerFromGenerator(gen: AsyncGenerator<Buffer>): BodyReader {
  return {
    length: -1,
    read: async (): Promise<Buffer> => {
      const r = await gen.next();
      if (r.done) {
        return Buffer.from(""); // EOF (End of File)
      } else {
        return r.value;
      }
    },
  };
}

function readerFromConnLength(
  conn: TCPConn,
  buf: DynBuf,
  remain: number,
): BodyReader {
  return {
    length: remain,
    read: async (): Promise<Buffer> => {
      if (remain <= 0) return Buffer.from("");
      if (buf.length === 0) {
        await bufExpectMore(conn, buf, "body");
      }
      const consume = Math.min(buf.length, remain);
      const data = Buffer.from(buf.data.subarray(0, consume));
      bufPop(buf, consume);
      remain -= consume;
      return data;
    },
  };
}

async function* readChunks(conn: TCPConn, buf: DynBuf): AsyncGenerator<Buffer> {
  for (let last = false; !last; ) {
    let idx = buf.data.subarray(0, buf.length).indexOf("\r\n");
    while (idx < 0) {
      await bufExpectMore(conn, buf, "chunk size");
      idx = buf.data.subarray(0, buf.length).indexOf("\r\n");
    }
    const line = buf.data.subarray(0, idx).toString("latin1");
    let remain = parseInt(line, 16);
    bufPop(buf, idx + 2);
    last = remain === 0;
    while (remain > 0) {
      if (buf.length === 0) await bufExpectMore(conn, buf, "chunk data");
      const consume = Math.min(remain, buf.length);
      yield Buffer.from(buf.data.subarray(0, consume));
      bufPop(buf, consume);
      remain -= consume;
    }
    while (buf.length < 2) await bufExpectMore(conn, buf, "chunk separator");
    bufPop(buf, 2);
  }
}

async function writeHTTPResp(conn: TCPConn, resp: HTTPRes): Promise<void> {
  // set the "content-Length" or "Transfer-Encoding" field
  if (resp.body.length < 0) {
    resp.headers.push(Buffer.from("Transfer-EWncoding: Chunked"));
  } else {
    resp.headers.push(Buffer.from(`Content-Length: ${resp.body.length}`));
  }
  // write the header
  await soWrite(conn, encodeHTTPResp(resp));
  // write the body
  const crlf = Buffer.from("\r\n");
  while (true) {
    const data = await resp.body.read();
    if (resp.body.length < 0) {
      const size = data.length.toString(16);
      await soWrite(conn, Buffer.concat([Buffer.from(size), crlf, data, crlf]));
    } else {
      if (data.length === 0) break;
      await soWrite(conn, data);
    }
    if (data.length === 0) break;
  }
}

async function output_to_conn(
  conn: TCPConn,
  reader: BodyReader,
): Promise<void> {
  while (true) {
    const chunk = await reader.read();
    if (chunk.length === 0) {
      break;
    }

    if (reader.length < 0) {
      const size = chunk.length.toString(16);
      const crlf = Buffer.from("\r\n");
      await soWrite(
        conn,
        Buffer.concat([Buffer.from(size), crlf, chunk, crlf]),
      );
    } else {
      await soWrite(conn, chunk);
    }
  }

  if (reader.length < 0) {
    await soWrite(conn, Buffer.from("0\r\n\r\n"));
  }
}

async function serveClient(conn: TCPConn): Promise<void> {
  const buf: DynBuf = { data: Buffer.alloc(0), length: 0 };
  const remoteAddr = conn.socket.remoteAddress + ":" + conn.socket.remotePort;
  console.log(`[${remoteAddr}] New connection established.`);
  while (true) {
    let msg: null | HTTPReq = cutMessage(buf);
    if (!msg) {
      const data = await soRead(conn);

      if (data.length === 0) {
        console.log(`[${remoteAddr}] Connection closed by client.`);
        return;
      } // EOF
      bufPush(buf, data);
      continue;
    }

    console.log(`[${remoteAddr}] Request: ${msg.method} ${msg.uri.toString()}`);

    const reqBody = readerFromReq(conn, buf, msg);
    const res = await handleReq(msg, reqBody);
    await writeHTTPResp(conn, res);
    console.log(`[${remoteAddr}] Response sent with code ${res.code}`);
    if (msg.version.includes("1.0")) return;
    while ((await reqBody.read()).length > 0) {}
  }
  async function produce_response(conn: TCPConn) {
    // Example 1: Data from memory (Hello World)
    const data1 = readerFromMemory(Buffer.from("Step 1: Starting stream...\n"));
    await output_to_conn(conn, data1);

    // Example 2: Data from a generator (The Sheep counter)
    const data2 = readerFromGenerator(countSheep());
    await output_to_conn(conn, data2);

    // Example 3: Closing message
    const data3 = readerFromMemory(Buffer.from("\nStep 3: Stream Finished."));
    await output_to_conn(conn, data3);
  }
}

function readerFromReq(conn: TCPConn, buf: DynBuf, req: HTTPReq): BodyReader {
  let bodyLen = -1;
  const contentLen = fieldGet(req.headers, "Content-Length");
  if (contentLen) {
    bodyLen = parseDec(contentLen.toString("latin1"));
    if (isNaN(bodyLen)) {
      throw new HTTPError(400, "bad Content-Length.");
    }
  }
  const bodyAllowed = !(req.method === "GET" || req.method === "HEAD");

  const chunked =
    fieldGet(req.headers, "Transfer-Encoding")?.equals(
      Buffer.from("chunked"),
    ) || false;
  if (!bodyAllowed && (bodyLen > 0 || chunked)) {
    throw new HTTPError(400, "HTTP body not allowed.");
  }
  if (!bodyAllowed) {
    bodyLen = 0;
  }

  if (bodyLen >= 0) {
    // "Content-Length" is present
    return readerFromConnLength(conn, buf, bodyLen);
  } else if (chunked) {
    // chunked encoding
    return readerFromGenerator(readChunks(conn, buf));
  } else {
    // read the rest of the connection
    return readerFromConnEOF(conn, buf);
  }
}

async function* countSheep(): BufferGenerator {
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    yield Buffer.from(`sheep number ${i}\n`);
  }
}

async function newConn(socket: net.Socket): Promise<void> {
  const conn = soInit(socket);
  try {
    await serveClient(conn);
  } catch (exc) {
    console.error("Exception:", exc);
    if (exc instanceof HTTPError) {
      const resp = {
        code: exc.code,
        headers: [],
        body: readerFromMemory(Buffer.from(exc.message + "\n")),
      };
      try {
        await writeHTTPResp(conn, resp);
      } catch {}
    }
  } finally {
    socket.destroy();
  }
}

function parseBytesRanges(
  header: string,
  fileSize: number,
): { start: number; end: number }[] {
  if (!header.startsWith("bytes=")) return [];

  const ranges = header
    .substring(6)
    .split(",")
    .map((r) => {
      const parts = r.split("-");
      const startStr = parts[0]?.trim() || "";
      const endStr = parts[1]?.trim() || "";

      let start: number;
      let end: number;

      if (startStr === "") {
        const suffix = parseInt(endStr, 10);
        start = fileSize - suffix;
        end = fileSize - 1;
      } else {
        start = parseInt(startStr, 10);
        if (endStr === "") {
          end = fileSize - 1;
        } else {
          end = parseInt(endStr, 10);
        }
      }

      return { start, end };
    });

  return ranges.filter(
    (r) =>
      !isNaN(r.start) &&
      !isNaN(r.end) &&
      r.start >= 0 &&
      r.end < fileSize &&
      r.start <= r.end,
  );
}

function readerFromStaticFile(
  fp: fs.FileHandle,
  start: number,
  end: number,
): BodyReader {
  let currentPos = start;
  const totalToRead = end - start + 1;

  return {
    length: totalToRead,
    read: async () => {
      if (currentPos > end) return Buffer.alloc(0); // EOF for range

      const remain = end - currentPos + 1;
      const bufSize = Math.min(remain, 64 * 1024); // 64KB chunks
      const buf = Buffer.alloc(bufSize);

      const { bytesRead } = await fp.read(buf, 0, bufSize, currentPos);
      currentPos += bytesRead;

      return buf.subarray(0, bytesRead);
    },
  };
}
function parseHTTPDate(dateStr: string): number {
  const ms = Date.parse(dateStr);
  if (isNaN(ms)) {
    return 0;
  }

  return Math.floor(ms / 1000);
}

async function serveStaticFile(
  uri: string,
  reqHeaders: Buffer[],
): Promise<HTTPRes> {
  const safePath = path.join(
    process.cwd(),
    "public",
    uri === "/" ? "index.html" : uri,
  );
  const ext = path.extname(safePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  let fp: fs.FileHandle | null = null;
  try {
    fp = await fs.open(safePath, "r");
    const stat = await fp.stat();
    if (!stat.isFile()) throw new Error("Not a file");

    const mtime = Math.floor(stat.mtime.getTime() / 1000);
    const lastModifiedStr = stat.mtime.toUTCString();

    const commonHeaders: Buffer[] = [
      Buffer.from(`Last-Modified: ${lastModifiedStr}`),
      Buffer.from("Accept-Ranges: bytes"),
    ];

    // 1. Check If-Modified-Since
    const ifm = fieldGet(reqHeaders, "If-Modified-Since");
    if (ifm && parseHTTPDate(ifm.toString("latin1")) >= mtime) {
      await fp.close();
      return {
        code: 304,
        headers: commonHeaders,
        body: readerFromMemory(Buffer.from("")),
      };
    }

    let hrange = fieldGet(reqHeaders, "Range");
    const ifr = fieldGet(reqHeaders, "If-Range");
    if (ifr && parseHTTPDate(ifr.toString("latin1")) < mtime) {
      hrange = null;
    }

    const fileSize = stat.size;
    let code = 200;
    let start = 0;
    let end = fileSize - 1;

    const resHeaders: Buffer[] = [
      ...commonHeaders,
      Buffer.from(`Content-Type: ${contentType}`),
    ];

    if (hrange) {
      const ranges = parseBytesRanges(hrange.toString(), fileSize);
      if (ranges.length === 1) {
        code = 206;
        start = ranges[0]!.start;
        end = ranges[0]!.end;
        resHeaders.push(
          Buffer.from(`Content-Range: bytes ${start}-${end}/${fileSize}`),
        );
      }
    }

    const reader = readerFromStaticFile(fp, start, end);
    const actualFp = fp;
    fp = null; // Hand over responsibility to the reader

    return {
      code: code,
      headers: resHeaders,
      body: {
        length: reader.length,
        read: async () => {
          const data = await reader.read();
          if (data.length === 0) await actualFp.close();
          return data;
        },
      },
    };
  } catch (err: any) {
    if (fp) await fp.close();
    return {
      code: 404,
      headers: [],
      body: readerFromMemory(Buffer.from("404 Not Found\n")),
    };
  }
}
async function handleReq(req: HTTPReq, body: BodyReader): Promise<HTTPRes> {
  const path = req.uri.toString("latin1");

  // Dynamic Routes
  if (path === "/echo") return { code: 200, headers: [], body };
  if (path === "/sheep")
    return { code: 200, headers: [], body: readerFromGenerator(countSheep()) };

  // Pass req.headers for Range Request support
  return await serveStaticFile(path, req.headers);
}

const server = net.createServer({ pauseOnConnect: true });
server.on("connection", newConn);
server.listen({ host: "127.0.0.1", port: 1234 }, () => {
  console.log("Server running at http://127.0.0.1:1234");
});
