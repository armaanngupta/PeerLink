# PeerLink 

PeerLink is a Java-based backend service designed to power a localized Peer-to-Peer (P2P) file-sharing application. It acts as both a REST-like API server for bridging web interfaces with background processes, and a raw socket-driven engine orchestrating the transfer of data bytes across dynamic network channels.

## Core Concepts
- **HTTP API Server**: Exposes accessible REST-like endpoints (`/upload` for file ingestion and `/download` for retrieving) established natively through the lightweight `com.sun.net.httpserver.HttpServer`.
- **Custom Multipart Parsing**: Eschews heavyweight external web frameworks (like Spring Boot) or dependencies in preference of a highly customized byte-level `Multiparser` responsible for digesting raw `multipart/form-data` uploads manually.
- **Direct TCP File Transfer**: Instead of streaming files merely within HTTP envelopes, requesting a file mandates the system to negotiate raw TCP socket connections (`java.net.Socket`), directly tunneling through dynamically allocated ephemeral ports.
- **Point-to-Point Lifecycle**: A shared file is consumed strictly once per binding. Once a download socket taps into the broadcasted server port, it dispatches the asset and then ceases listening, releasing network locks proactively.

## The Numbers
- **API Port**: `8080` (The default port the primary API web server runs on).
- **Dynamic Port Range**: `49152` to `65535` (Temporary networking ports uniquely generated to serve as isolated sharing codes for each injected file).
- **Thread Pool Capacity**: `10` threads within the fixed `ExecutorService` allocated synchronously for digesting standard HTTP API requests.
- **Buffer Cycle Length**: `4096` bytes (4KB discrete chunks utilized strictly for sequential filesystem reading and socket data writing pipelines without saturating heap capacity during raw transmission).

## Main Components
- `App.java`: The core orchestration entry point, securely booting up the `FileController` and mounting JVM `Runtime` shutdown hooks for server tear-down.
- `FileController.java`: A robust handler acting as the router. It instantiates the HTTP server map, enforces general CORS guidelines, parses HTTP headers natively, and handles all `/upload` or `/download` controller logic.
- `Filesharer.java`: The local tracking registry that coordinates which specific ephemeral ports correspond strictly to which file paths, invoking native `FileSenderHandler` subroutines to await direct P2P client interactions.
- `Multiparser.java`: Embedded explicitly inside the file controller, it mathematically scans binary chunk sequences looking precisely for `filename="..."` boundary markers necessary for segregating files from standard HTTP request bodies.
- `UploadUtils.java`: A utility tool built to uniformly randomize and issue valid unreserved temporary ports.

## Supported File Extensions and Why
**All file extensions** and types are seamlessly supported. The backend fundamentally operates at the raw un-structured byte array context (`byte[]`). It possesses zero assumptions about file headers, extensions, magic numbers, or layouts. 
The internal `Multiparser` algorithm splits array chunks matching boundary markers blindly. Thus, a `.txt` string, a zipped `.rar` volume, or a highly condensed `.mp4` video are treated as identical data structures. If a browser does not pass an explicit `Content-Type` within the multipart payload, the backend quietly defaults to the generic `application/octet-stream`.

## Allowed File Size and Why
The maximal file capacity is entirely gated by **JVM Heap Memory (RAM)** rather than sequential disk bottlenecks. 
This occurs strategically because the custom `Multiparser` aggregates the entire HTTP incoming stream broadly into working memory:
```java
exchange.getRequestBody().transferTo(baos);
byte[] requestData = baos.toByteArray();
```
Initially, the data transfers heavily into a `ByteArrayOutputStream`, after which bytes are actively spliced. Because arrays are rigid, maintaining these deep copies drastically inflates memory overhead; meaning uploading a massive ~2GB file could trigger immediate `java.lang.OutOfMemoryError` constraints if the JVM launch arguments (such as `-Xmx`) aren't raised accordingly.

## Sending Rate and Why
The throughput rate of data delivery is **not artificially throttled or limited** by the application logic. 
It relies dynamically on native loopback speeds and disk indexing because data is transferred maximally in concurrent `4096-byte` burst segments:
```java
byte[] buffer = new byte[4096];
int byteRead;
while((byteRead = fis.read(buffer)) != -1){
    oos.write(buffer, 0, byteRead);
}
```
Thus, speed peaks proportionally adjacent to host storage read/write limits combined dynamically with the internal TCP Sliding Window protocol. Since PeerLink natively connects directly via `"localhost"` to dynamically spawned server-sockets, latency remains virtually unnoticeable.

## Multithreading Approach
The design leverages detached multitasking significantly to isolate connections properly:
- **HTTP Ingestion**: Leverages an explicit thread pool length of exactly 10 (`Executors.newFixedThreadPool(10)`) handling inbound REST API pulses independently.
- **Port Broadcasting**: For each file uploaded, a detached anonymous thread is spawned instantly, preventing the primary API routines from locking during the blocking `.accept()` stages: `new Thread(() -> filesharer.startFileServer(port)).start()`.
- **Peer Transferring**: During an active download hookup, the overarching connection is deferred rapidly to an underlying `Runnable` wrapper (`FileSenderHandler`) executed in isolation, finalizing the actual `FileInputStream` to socket pumping cycle in the background.

## Socket Programming Utilization
PeerLink leverages primitive `java.net.*` functionality alongside HTTP boundaries to establish a hybrid model:
- **ServerSocket (Seed Node)**: Handled elegantly via `Filesharer.java`. Upon issuing a sharing port, the engine generates a passive socket `new ServerSocket(port)`, executing a blocking `.accept()` to catch precisely one client node attempt, ensuring exclusivity.
- **Client Socket (Leech Node)**: Processed recursively through the `/download/{port}` HTTP loop; the application opens native client sockets targeting the designated host and port (`Socket("localhost", port)`). First, it loops until discovering a `\n` character—designed to surgically bypass and extract an injected dynamic string `Filename: {name}\n` prepended to the top of the binary—after which, the trailing unadulterated payload writes transparently to a temporary IO dump.
