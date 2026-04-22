# 🚀 Custom Web Server from Scratch

A production-style educational project focused on mastering **network programming fundamentals** by building a web server from the ground up—without high-level frameworks like Express.

This project progressively implements networking layers and protocols manually, starting from raw TCP sockets and evolving into a feature-complete, streaming HTTP/1.1 server.

---

## 🛠 Tech Stack

* **Language:** TypeScript (2026 ESM Standard)
* **Runtime:** [Node.js](https://nodejs.org/)
* **Core Modules:** `net`, `buffer`, `fs`, `stream`, `zlib`, `crypto`
* **Testing Tools:** `nc` (Netcat), `curl`, `socat`, Browser DevTools

---

## 📂 Architecture Evolution / Version History

### 🔴 Version 1 — Basic TCP Echo Server
* **Focus:** Transport Layer Fundamentals.
* **Implemented:** Raw byte transmission using `net.createServer()`.
* **Key Learning:** Understanding the TCP connection lifecycle and socket event handling.

### 🟠 Version 2 — Promise-Based TCP Layer
* **Focus:** Async Abstractions.
* **Implemented:** Wrapped event emitters into `soRead()` and `soWrite()` Promise helpers.
* **Key Learning:** Eliminating callback-hell to improve maintainability.

### 🟡 Version 3 — Custom Application Protocol
* **Focus:** Framing & Delimiters.
* **Implemented:** Delimiter-based protocol (`\n`) with dynamic buffer accumulation.
* **Key Learning:** Realizing that TCP is a stream, not a message protocol.

### 🟢 Version 4 — Basic HTTP/1.1 Server
* **Focus:** Application Layer Semantics.
* **Implemented:** Manual HTTP request-line parsing, header normalization, and status code management.
* **Key Learning:** RFC-compliant parsing and security considerations (Request Smuggling).

### 🔵 Version 5 — Streaming & Dynamic Content
* **Focus:** Memory-Efficient IO.
* **Implemented:** Chunked Transfer Encoding using Async Generators.
* **Key Learning:** Managing producer/consumer speed mismatch through backpressure.

### 🟣 Version 6 — File System & Static Serving
* **Focus:** Resource Management.
* **Implemented:** Manual file handle management with `fs/promises`.
* **Key Learning:** Preventing resource leaks using ownership-based cleanup (`try-finally` patterns).

### 🟤 Version 7 — Range Requests & Caching
* **Focus:** Performance & Optimization.
* **Implemented:**
    * **Range Requests:** Supporting partial content (206) for resumeable downloads.
    * **HTTP Caching:** Validator-based caching using `Last-Modified` and `If-Modified-Since`.
* **Key Learning:** Understanding stateful protocol interactions for efficiency.

### ⚪ Version 8 — Compression & Node.js Streams (Current)
* **Focus:** Payload Optimization & Pipeline API.
* **Implemented:**
    * **Gzip Compression:** Integrated `zlib` with on-the-fly compression.
    * **Stream Pipeline:** Refactored IO using Node.js `stream.Readable` and `pipeline()` API.
    * **Content Negotiation:** Parsing `Accept-Encoding` and managing `Vary` headers.
* **Key Learning:** Composable data processing and automatic backpressure with Streams.

---

## 💻 Installation & Setup

### Clone Repository
```bash
git clone [https://github.com/tafajjul-khan/http-web-server](https://github.com/tafajjul-khan/http-web-server)
cd http-web-server

npm -D install nodemon typescript @types/node tsx

npx tsx web_server_v8.ts

curl -v -H "Accept-Encoding: gzip" [http://127.0.0.3:1234/sheep](http://127.0.0.3:1234/sheep) --output -

curl -v -H "Range: bytes=0-100" [http://127.0.0.3:1234/index.html](http://127.0.0.3:1234/index.html)

```
## ⭐ Why This Project Matters

This project demonstrates deep understanding beyond framework-level development by showcasing implementation knowledge of:

* Networking fundamentals
* Protocol design
* Low-level backend engineering
* Performance optimization
* Production server internals
