"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTPRequest = exports.TEXT_DECODER = exports.TEXT_ENCODER = exports.RETURN = exports.NEWLINE = exports.RESPONSE_REGEX = exports.REQUEST_REGEX = exports.HEADER_CONTINUE_REGEX = exports.HEADER_REGEX = exports.DEFAULT_BUFFER_SIZE = void 0;
exports.parseRequest = parseRequest;
exports.parseResponse = parseResponse;
exports.writeRequestOrResponse = writeRequestOrResponse;
exports.createTextReader = createTextReader;
exports.concatUint8Array = concatUint8Array;
exports.writeToUint8Array = writeToUint8Array;
exports.readAll = readAll;
const tslib_1 = require("tslib");
exports.DEFAULT_BUFFER_SIZE = 4096;
exports.HEADER_REGEX = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
exports.HEADER_CONTINUE_REGEX = /^[ \t]+(.*[^ \t])/;
exports.REQUEST_REGEX = /^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/;
exports.RESPONSE_REGEX = /^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/;
exports.NEWLINE = "\n".charCodeAt(0);
exports.RETURN = "\r".charCodeAt(0);
exports.TEXT_ENCODER = new TextEncoder();
exports.TEXT_DECODER = new TextDecoder();
class HTTPRequest extends Request {
    constructor(input, init) {
        const headersInit = init === null || init === void 0 ? void 0 : init.headers;
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
exports.HTTPRequest = HTTPRequest;
function parseRequest(reader_1) {
    return tslib_1.__awaiter(this, arguments, void 0, function* (reader, init = {
        mode: "same-origin",
        credentials: "include",
    }) {
        const textReader = createTextReader(reader);
        const [method, url] = yield readRequestStartLine(textReader);
        const [headers, chunked, contentLength] = yield readHeaders(textReader);
        const body = streamBody(textReader, chunked, contentLength);
        return new HTTPRequest(url, Object.assign(Object.assign({}, init), { method,
            headers,
            body, 
            // @ts-expect-error
            duplex: "half" }));
    });
}
function parseResponse(reader) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const textReader = createTextReader(reader);
        const [statusCode, statusText] = yield readResponseStartLine(textReader);
        const [headers, chunked, contentLength] = yield readHeaders(textReader);
        const body = streamBody(textReader, chunked, contentLength);
        return new Response(body, {
            status: statusCode,
            statusText: statusText,
            headers,
        });
    });
}
function writeRequestOrResponse(writableStream, requestOrResponse) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const writer = writableStream.getWriter();
        let closed = false;
        try {
            const [request, response] = requestOrResponse instanceof Request
                ? [requestOrResponse, null]
                : [null, requestOrResponse];
            if (request) {
                yield writer.write(exports.TEXT_ENCODER.encode(`${request.method} ${request.url} HTTP/1.1\r\n`));
            }
            else {
                yield writer.write(exports.TEXT_ENCODER.encode(`HTTP/1.1 ${response.status} ${response.statusText}\r\n`));
            }
            const headers = new Headers(requestOrResponse.headers);
            if (requestOrResponse.body) {
                if (request) {
                    const body = yield readAll(requestOrResponse.body.getReader());
                    headers.set("Content-Length", `${body.byteLength}`);
                    for (const [key, value] of headers.entries()) {
                        yield writer.write(exports.TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
                    }
                    yield writer.write(exports.TEXT_ENCODER.encode("\r\n"));
                    yield writer.write(body);
                }
                else {
                    const contentLength = Number.parseInt(headers.get("Content-Length") || "0", 10);
                    const chunked = ((_a = headers.get("Transfer-Encoding")) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === "chunked";
                    for (const [key, value] of headers.entries()) {
                        yield writer.write(exports.TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
                    }
                    yield writer.write(exports.TEXT_ENCODER.encode("\r\n"));
                    writer.releaseLock();
                    yield ((_b = streamBody(createTextReader(requestOrResponse.body.getReader()), chunked, contentLength)) === null || _b === void 0 ? void 0 : _b.pipeTo(writableStream));
                    closed = true;
                }
            }
            else {
                for (const [key, value] of headers.entries()) {
                    yield writer.write(exports.TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
                }
                yield writer.write(exports.TEXT_ENCODER.encode("\r\n"));
            }
        }
        finally {
            if (!closed) {
                writer.releaseLock();
                writableStream.close();
            }
        }
    });
}
function readRequestStartLine(reader) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const { done, value: startLine } = yield reader.readLine();
        if (done) {
            throw new Error("Unexpected end of request");
        }
        const match = exports.REQUEST_REGEX.exec(startLine);
        if (!match) {
            throw new Error(`Invalid request line: ${startLine}`);
        }
        return [match[1], match[2], +match[3], +match[4]];
    });
}
function readResponseStartLine(reader) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const { done, value: startLine } = yield reader.readLine();
        if (done) {
            throw new Error("Unexpected end of request");
        }
        const match = exports.RESPONSE_REGEX.exec(startLine);
        if (!match) {
            throw new Error(`Invalid response line: ${startLine}`);
        }
        return [+match[3], match[4], +match[1], +match[2]];
    });
}
function readHeaders(reader) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const headers = new Headers();
        let chunked = false;
        let contentLength = 0;
        while (true) {
            const { done, value: line } = yield reader.readLine();
            if (done) {
                throw new Error("Unexpected end of headers");
            }
            if (line === "") {
                break;
            }
            const match = exports.HEADER_REGEX.exec(line);
            if (!match) {
                throw new Error(`Invalid header line: ${line}`);
            }
            let value = match[2];
            while (true) {
                const continueMatch = exports.HEADER_CONTINUE_REGEX.exec(value);
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
    });
}
function streamBody(reader, chunked, contentLength) {
    if (!chunked && contentLength === 0) {
        return null;
    }
    const stream = new TransformStream();
    streamBodyFromReaderToWritable(reader, stream.writable, chunked, contentLength);
    return stream.readable;
}
function streamBodyFromReaderToWritable(reader, writableStream, chunked, contentLength) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const writer = writableStream.getWriter();
        try {
            if (chunked) {
                while (true) {
                    const { done, value: line } = yield reader.readLine();
                    if (done) {
                        throw new Error("Unexpected end of stream");
                    }
                    if (exports.HEADER_REGEX.exec(line)) {
                        yield reader.readLine();
                        break;
                    }
                    const chunkSize = Number.parseInt(line, 16);
                    if (!chunkSize) {
                        break;
                    }
                    let bytesLeft = chunkSize;
                    while (bytesLeft > 0) {
                        const { done, value: bytes } = yield reader.read(chunkSize);
                        if (done) {
                            throw new Error("Unexpected end of stream");
                        }
                        bytesLeft -= bytes.byteLength;
                        yield writer.write(bytes);
                    }
                    yield reader.readLine();
                }
            }
            else {
                let bytesLeft = contentLength;
                while (bytesLeft > 0) {
                    const { done, value: bytes } = yield reader.read(bytesLeft);
                    if (done) {
                        throw new Error("Unexpected end of stream");
                    }
                    bytesLeft -= bytes.byteLength;
                    yield writer.write(bytes);
                }
            }
        }
        finally {
            reader.releaseLock();
            writer.releaseLock();
            writableStream.close();
        }
    });
}
function createTextReader(reader, bufferSize = exports.DEFAULT_BUFFER_SIZE) {
    let buffer = new Uint8Array(bufferSize);
    let bufferOffset = 0;
    let bufferLength = 0;
    let doneReading = false;
    function tryFillTo(offset) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (doneReading) {
                return offset < bufferLength;
            }
            while (offset >= bufferLength) {
                const { done, value: bytes } = yield reader.read();
                if (done) {
                    doneReading = true;
                    break;
                }
                buffer = writeToUint8Array(buffer, bufferLength, bytes);
                bufferLength += bytes.byteLength;
            }
            return offset < bufferLength;
        });
    }
    function readLine() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let index = bufferOffset;
            let hasData = yield tryFillTo(index);
            while (hasData) {
                if (buffer[index] === exports.NEWLINE) {
                    const prevIsReturn = buffer[index - 1] === exports.RETURN;
                    const endIndex = prevIsReturn ? index - 1 : index;
                    const line = exports.TEXT_DECODER.decode(buffer.slice(bufferOffset, endIndex));
                    bufferOffset = index + 1;
                    return { done: false, value: line };
                }
                index++;
                if (index >= bufferLength) {
                    hasData = yield tryFillTo(index);
                }
            }
            return { done: true };
        });
    }
    function read(byteCount) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const byteLength = bufferOffset + byteCount;
            yield tryFillTo(byteLength - 1);
            const maxBytesToRead = Math.min(bufferLength - bufferOffset, byteCount);
            if (maxBytesToRead === 0) {
                return { done: true };
            }
            const bytes = buffer.slice(bufferOffset, bufferOffset + maxBytesToRead);
            bufferOffset += maxBytesToRead;
            return { done: false, value: bytes };
        });
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
function concatUint8Array(a, b) {
    const bytes = new Uint8Array(a.byteLength + b.byteLength);
    bytes.set(a);
    bytes.set(b, a.byteLength);
    return bytes;
}
function writeToUint8Array(buffer, offset, chunk) {
    if (chunk.byteLength >= buffer.byteLength - offset) {
        const newBuffer = new Uint8Array(buffer.byteLength * 2);
        newBuffer.set(buffer);
        newBuffer.set(chunk, offset);
        return newBuffer;
    }
    buffer.set(chunk, offset);
    return buffer;
}
function readAll(reader) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        try {
            const { done, value: bytes } = yield reader.read();
            if (done) {
                return new Uint8Array();
            }
            let result = bytes;
            while (true) {
                const { done, value: bytes } = yield reader.read();
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
    });
}
