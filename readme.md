# Custom Web Server from Scratch

A production-style educational project focused on mastering **network programming fundamentals** by building a web server from the ground up—without frameworks like Express.

This project progressively implements networking layers and protocols manually, starting from raw TCP sockets and evolving into a streaming HTTP/1.1 server.

---

## 🚀 Project Goal

The primary objective of this project is to deeply understand how modern web servers work internally by stripping away abstractions and implementing protocol behavior manually.

Key focus areas include:

* Low-level TCP socket programming
* HTTP/1.1 protocol implementation
* Stream parsing and buffer management
* Backpressure and memory-efficient streaming
* Real-world networking constraints and RFC compliance

---

## 🛠 Tech Stack

* **Language:** TypeScript (2026 ESM Standard)
* **Runtime:** Node.js,
* **Core Modules:** `net`, `buffer`, `fs`, `stream`
* **Testing Tools:** `nc` (Netcat), `curl`, `socat`

---

## 📂 Architecture Evolution / Version History

### 🔴 Version 1 — Basic TCP Echo Server

**Focus:** Transport Layer Fundamentals
**Objective:** Establish raw TCP connections and handle socket communication.

**Implemented:**

* Built server using `net.createServer()`
* Accepted client socket connections
* Implemented echo functionality (server returns received payload)

**Learnings:**

* TCP connection lifecycle
* Socket event handling
* Raw byte transmission basics

---

### 🟠 Version 2 — Promise-Based TCP Layer

**Focus:** Async Abstraction Over Event-Driven Sockets
**Objective:** Improve maintainability and readability using async/await.

**Implemented:**

* Wrapped socket events into Promise-based helpers
* Created `soRead()` abstraction for sequential reads
* Created `soWrite()` abstraction for controlled writes
* Eliminated callback-heavy control flow

**Learnings:**

* Converting event emitters to promise abstractions
* Sequential async socket programming patterns

---

### 🟡 Version 3 — Custom Application Protocol

**Focus:** Message Framing Over TCP
**Objective:** Solve TCP stream ambiguity by defining message boundaries.

**Implemented:**

* Designed delimiter-based custom protocol using `\n`
* Implemented dynamic buffer accumulation
* Supported partial packet handling
* Added pipelined request support

**Learnings:**

* TCP is a byte stream, not a message protocol
* Need for framing/parsing strategies
* Buffer management for incomplete packets

---

### 🟢 Version 4 — Basic HTTP/1.1 Server

**Focus:** Application Layer Protocol Implementation
**Objective:** Transition from custom protocol to real HTTP semantics.

**Implemented:**

* Manual HTTP request-line parsing
* Header extraction and normalization
* Method detection (`GET`, `POST`, etc.)
* URI parsing
* Content-Length validation
* Standard HTTP status responses:

  * `200 OK`
  * `400 Bad Request`
  * `404 Not Found`

**Learnings:**

* HTTP request/response format
* Importance of RFC-compliant parsing
* Input validation/security considerations

---

### 🔵 Version 5 — Dynamic Content Streaming (Current)

**Focus:** Memory-Efficient Response Streaming
**Objective:** Stream large/unknown-size payloads efficiently.

**Implemented:**

* Chunked Transfer Encoding
* Async Generators for dynamic chunk production
* Backpressure-aware streaming pipeline
* Incremental response flushing

**Learnings:**

* How production servers stream responses
* Preventing RAM exhaustion during large transfers
* Managing producer/consumer speed mismatch

---

## 💻 Installation & Setup

### Clone Repository

```bash
git clone https://github.com/tafajjul-khan/http-web-server
cd custom-web-server
```

### Install Dependencies

```bash
npm -D install nodemon typescript @types/node tsx
```

### Run Server

Execute any version directly with `tsx`:

```bash
npx tsx src/v5-streaming/server.ts
```

---

## 🧪 Testing

### TCP Testing (Versions 1–3)

```bash
nc localhost 1234
```

### HTTP Testing (Versions 4–5)

```bash
curl -v http://localhost:1234/ -d "Testing Version 5 Streaming"
```

---

## 🧠 Core Engineering Learnings

### Event Loop Internals

* Understanding Node.js concurrency model
* Handling thousands of connections on a single thread

### Buffer / Byte Management

* Working with `Buffer` and `Uint8Array`
* Efficient binary parsing and manipulation

### Protocol Design

* Why protocol framing matters
* Handling ambiguity in stream-based communication

### RFC Compliance & Security

* Importance of strict HTTP parsing
* Preventing malformed request exploits
* Introduction to request smuggling concepts

### Streaming & Flow Control

* Chunked transfer mechanics
* Backpressure handling in producer-consumer systems

---

## 📌 Current Status

**Year:** 2026


## ⭐ Why This Project Matters

This project demonstrates deep understanding beyond framework-level development by showcasing implementation knowledge of:

* Networking fundamentals
* Protocol design
* Low-level backend engineering
* Performance optimization
* Production server internals
