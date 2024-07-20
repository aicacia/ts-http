export const DEFAULT_BUFFER_SIZE = 4096;
export const HEADER_REGEX = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
export const HEADER_CONTINUE_REGEX = /^[ \t]+(.*[^ \t])/;
export const REQUEST_REGEX = /^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/;
export const RESPONSE_REGEX = /^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/;
export const NEWLINE = "\n".charCodeAt(0);
export const RETURN = "\r".charCodeAt(0);
export const TEXT_ENCODER = new TextEncoder();
export const TEXT_DECODER = new TextDecoder();
export class HTTPRequest extends Request {
    constructor(input, init) {
        const headersInit = init?.headers;
        super(input, init);
        if (headersInit) {
            const headers = new Headers(headersInit);
            Object.defineProperty(this, "headers", {
                value: headers,
                writable: false,
            });
        }
    }
}
export async function parseRequest(reader, init = {
    mode: "same-origin",
    credentials: "include",
}) {
    const textReader = createTextReader(reader);
    const [method, url] = await readRequestStartLine(textReader);
    const [headers, chunked, contentLength] = await readHeaders(textReader);
    const body = streamBody(textReader, chunked, contentLength);
    return new HTTPRequest(url, {
        ...init,
        method,
        headers,
        body,
        // @ts-expect-error
        duplex: "half",
    });
}
export async function parseResponse(reader) {
    const textReader = createTextReader(reader);
    const [statusCode, statusText] = await readResponseStartLine(textReader);
    const [headers, chunked, contentLength] = await readHeaders(textReader);
    const body = streamBody(textReader, chunked, contentLength);
    return new Response(body, {
        status: statusCode,
        statusText: statusText,
        headers,
    });
}
export async function writeRequestOrResponse(writableStream, requestOrResponse) {
    const writer = writableStream.getWriter();
    let closed = false;
    try {
        const [request, response] = requestOrResponse instanceof Request
            ? [requestOrResponse, null]
            : [null, requestOrResponse];
        if (request) {
            await writer.write(TEXT_ENCODER.encode(`${request.method} ${request.url} HTTP/1.1\r\n`));
        }
        else {
            await writer.write(TEXT_ENCODER.encode(`HTTP/1.1 ${response.status} ${response.statusText}\r\n`));
        }
        const headers = new Headers(requestOrResponse.headers);
        if (requestOrResponse.body) {
            if (request) {
                const body = await readAll(requestOrResponse.body.getReader());
                headers.set("Content-Length", `${body.byteLength}`);
                for (const [key, value] of headers.entries()) {
                    await writer.write(TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
                }
                await writer.write(TEXT_ENCODER.encode("\r\n"));
                await writer.write(body);
            }
            else {
                const contentLength = Number.parseInt(headers.get("Content-Length") || "0", 10);
                const chunked = headers.get("Transfer-Encoding")?.toLowerCase() === "chunked";
                for (const [key, value] of headers.entries()) {
                    await writer.write(TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
                }
                await writer.write(TEXT_ENCODER.encode("\r\n"));
                writer.releaseLock();
                await streamBody(createTextReader(requestOrResponse.body.getReader()), chunked, contentLength)?.pipeTo(writableStream);
                closed = true;
            }
        }
        else {
            for (const [key, value] of headers.entries()) {
                await writer.write(TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
            }
            await writer.write(TEXT_ENCODER.encode("\r\n"));
        }
    }
    finally {
        if (!closed) {
            writer.releaseLock();
            writableStream.close();
        }
    }
}
async function readRequestStartLine(reader) {
    const { done, value: startLine } = await reader.readLine();
    if (done) {
        throw new Error("Unexpected end of request");
    }
    const match = REQUEST_REGEX.exec(startLine);
    if (!match) {
        throw new Error(`Invalid request line: ${startLine}`);
    }
    return [match[1], match[2], +match[3], +match[4]];
}
async function readResponseStartLine(reader) {
    const { done, value: startLine } = await reader.readLine();
    if (done) {
        throw new Error("Unexpected end of request");
    }
    const match = RESPONSE_REGEX.exec(startLine);
    if (!match) {
        throw new Error(`Invalid response line: ${startLine}`);
    }
    return [+match[3], match[4], +match[1], +match[2]];
}
async function readHeaders(reader) {
    const headers = new Headers();
    let chunked = false;
    let contentLength = 0;
    while (true) {
        const { done, value: line } = await reader.readLine();
        if (done) {
            throw new Error("Unexpected end of headers");
        }
        if (line === "") {
            break;
        }
        const match = HEADER_REGEX.exec(line);
        if (!match) {
            throw new Error(`Invalid header line: ${line}`);
        }
        let value = match[2];
        while (true) {
            const continueMatch = HEADER_CONTINUE_REGEX.exec(value);
            if (!continueMatch) {
                break;
            }
            value = continueMatch[1];
        }
        const key = match[1].toLowerCase();
        if (key === "transfer-encoding" && value.toLowerCase() === "chunked") {
            chunked = true;
        }
        else if (key === "content-length") {
            contentLength = +value;
        }
        headers.append(match[1], value);
    }
    return [headers, chunked, contentLength];
}
function streamBody(reader, chunked, contentLength) {
    if (!chunked && contentLength === 0) {
        return null;
    }
    const stream = new TransformStream();
    streamBodyFromReaderToWritable(reader, stream.writable, chunked, contentLength);
    return stream.readable;
}
async function streamBodyFromReaderToWritable(reader, writableStream, chunked, contentLength) {
    const writer = writableStream.getWriter();
    try {
        if (chunked) {
            while (true) {
                const { done, value: line } = await reader.readLine();
                if (done) {
                    throw new Error("Unexpected end of stream");
                }
                if (HEADER_REGEX.exec(line)) {
                    await reader.readLine();
                    break;
                }
                const chunkSize = Number.parseInt(line, 16);
                if (!chunkSize) {
                    break;
                }
                let bytesLeft = chunkSize;
                while (bytesLeft > 0) {
                    const { done, value: bytes } = await reader.read(chunkSize);
                    if (done) {
                        throw new Error("Unexpected end of stream");
                    }
                    bytesLeft -= bytes.byteLength;
                    await writer.write(bytes);
                }
                await reader.readLine();
            }
        }
        else {
            let bytesLeft = contentLength;
            while (bytesLeft > 0) {
                const { done, value: bytes } = await reader.read(bytesLeft);
                if (done) {
                    throw new Error("Unexpected end of stream");
                }
                bytesLeft -= bytes.byteLength;
                await writer.write(bytes);
            }
        }
    }
    finally {
        reader.releaseLock();
        writer.releaseLock();
        writableStream.close();
    }
}
export function createTextReader(reader, bufferSize = DEFAULT_BUFFER_SIZE) {
    let buffer = new Uint8Array(bufferSize);
    let bufferOffset = 0;
    let bufferLength = 0;
    let doneReading = false;
    async function tryFillTo(offset) {
        if (doneReading) {
            return offset < bufferLength;
        }
        while (offset >= bufferLength) {
            const { done, value: bytes } = await reader.read();
            if (done) {
                doneReading = true;
                break;
            }
            buffer = writeToUint8Array(buffer, bufferLength, bytes);
            bufferLength += bytes.byteLength;
        }
        return offset < bufferLength;
    }
    async function readLine() {
        let index = bufferOffset;
        let hasData = await tryFillTo(index);
        while (hasData) {
            if (buffer[index] === NEWLINE) {
                const prevIsReturn = buffer[index - 1] === RETURN;
                const endIndex = prevIsReturn ? index - 1 : index;
                const line = TEXT_DECODER.decode(buffer.slice(bufferOffset, endIndex));
                bufferOffset = index + 1;
                return { done: false, value: line };
            }
            index++;
            if (index >= bufferLength) {
                hasData = await tryFillTo(index);
            }
        }
        return { done: true };
    }
    async function read(byteCount) {
        const byteLength = bufferOffset + byteCount;
        await tryFillTo(byteLength - 1);
        const maxBytesToRead = Math.min(bufferLength - bufferOffset, byteCount);
        if (maxBytesToRead === 0) {
            return { done: true };
        }
        const bytes = buffer.slice(bufferOffset, bufferOffset + maxBytesToRead);
        bufferOffset += maxBytesToRead;
        return { done: false, value: bytes };
    }
    function releaseLock() {
        reader.releaseLock();
    }
    return {
        readLine,
        read,
        releaseLock,
    };
}
export function concatUint8Array(a, b) {
    const bytes = new Uint8Array(a.byteLength + b.byteLength);
    bytes.set(a);
    bytes.set(b, a.byteLength);
    return bytes;
}
export function writeToUint8Array(buffer, offset, chunk) {
    if (chunk.byteLength >= buffer.byteLength - offset) {
        const newBuffer = new Uint8Array(buffer.byteLength * 2);
        newBuffer.set(buffer);
        newBuffer.set(chunk, offset);
        return newBuffer;
    }
    buffer.set(chunk, offset);
    return buffer;
}
export async function readAll(reader) {
    try {
        const { done, value: bytes } = await reader.read();
        if (done) {
            return new Uint8Array();
        }
        let result = bytes;
        while (true) {
            const { done, value: bytes } = await reader.read();
            if (done) {
                break;
            }
            result = concatUint8Array(result, bytes);
        }
        return result;
    }
    finally {
        reader.releaseLock();
    }
}
