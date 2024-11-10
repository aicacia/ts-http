export const DEFAULT_BUFFER_SIZE = 4096;

export const NEWLINE = "\n".charCodeAt(0);
export const RETURN = "\r".charCodeAt(0);

export const TEXT_ENCODER = new TextEncoder();
export const TEXT_DECODER = new TextDecoder();

export class HTTPRequest extends Request {
	constructor(input: RequestInfo | URL, init?: RequestInit) {
		super(input, init);
		const headers = new Headers(init?.headers);
		Object.defineProperty(this, "headers", {
			value: headers,
			writable: false,
		});
	}
}

export async function parseRequest(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	init: RequestInit = {
		mode: "same-origin",
		credentials: "include",
	},
): Promise<Request> {
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

export async function parseResponse(
	reader: ReadableStreamDefaultReader<Uint8Array>,
) {
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

export async function writeRequestOrResponse(
	writableStream: WritableStream<Uint8Array>,
	requestOrResponse: Request | Response,
) {
	const writer = writableStream.getWriter();
	let closed = false;
	try {
		const [request, response] =
			requestOrResponse instanceof Request
				? [requestOrResponse, null]
				: [null, requestOrResponse];
		if (request) {
			await writer.write(
				TEXT_ENCODER.encode(`${request.method} ${request.url} HTTP/1.1\r\n`),
			);
		} else {
			await writer.write(
				TEXT_ENCODER.encode(
					`HTTP/1.1 ${response.status} ${response.statusText}\r\n`,
				),
			);
		}
		const headers = new Headers(requestOrResponse.headers) as Headers & {
			entries(): IterableIterator<[string, string]>;
		};
		if (requestOrResponse.body) {
			if (request) {
				const body = await readAll(requestOrResponse.body.getReader());

				headers.set("Content-Length", `${body.byteLength}`);

				for (const [key, value] of headers.entries()) {
					await writer.write(TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
				}
				await writer.write(TEXT_ENCODER.encode("\r\n"));
				await writer.write(body);
			} else {
				const contentLength = Number.parseInt(
					headers.get("Content-Length") || "0",
					10,
				);
				const chunked =
					headers.get("Transfer-Encoding")?.toLowerCase() === "chunked";

				for (const [key, value] of headers.entries()) {
					await writer.write(TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
				}
				await writer.write(TEXT_ENCODER.encode("\r\n"));
				writer.releaseLock();

				await streamBody(
					createTextReader(requestOrResponse.body.getReader()),
					chunked,
					contentLength,
				)?.pipeTo(writableStream);

				closed = true;
			}
		} else {
			for (const [key, value] of headers.entries()) {
				await writer.write(TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
			}
			await writer.write(TEXT_ENCODER.encode("\r\n"));
		}
	} finally {
		if (!closed) {
			writer.releaseLock();
			writableStream.close();
		}
	}
}

async function readRequestStartLine(
	reader: TextReader,
): Promise<
	[method: string, url: string, versionMajor: number, versionMinor: number]
> {
	const { done, value: startLine } = await reader.readLine();
	if (done) {
		throw new Error("Unexpected end of request");
	}
	return parseRequestStartLine(startLine);
}

function parseRequestStartLine(
	startLine: string,
): [method: string, url: string, versionMajor: number, versionMinor: number] {
	const parts = startLine.split(" ", 3);
	if (parts.length !== 3) {
		throw new Error("Invalid HTTP request line format");
	}
	const method = parts[0];
	const path = parts[1];
	const httpVersionPart = parts[2];
	const versionNumbers = httpVersionPart.slice(5).split(".", 2);
	if (versionNumbers.length !== 2) {
		throw new Error("Invalid HTTP version numbers format");
	}
	const httpVersionMajor = Number.parseInt(versionNumbers[0], 10);
	const httpVersionMinor = Number.parseInt(versionNumbers[1], 10);

	if (Number.isNaN(httpVersionMajor) || Number.isNaN(httpVersionMinor)) {
		throw new Error("Invalid HTTP version numbers");
	}
	return [method, path, httpVersionMajor, httpVersionMinor];
}

async function readResponseStartLine(
	reader: TextReader,
): Promise<
	[
		statusCode: number,
		statusText: string,
		versionMajor: number,
		versionMinor: number,
	]
> {
	const { done, value: startLine } = await reader.readLine();
	if (done) {
		throw new Error("Unexpected end of request");
	}
	return parseResponseStartLine(startLine);
}

function parseResponseStartLine(
	startLine: string,
): [
	statusCode: number,
	statusText: string,
	versionMajor: number,
	versionMinor: number,
] {
	const parts = startLine.split(" ", 3);
	if (parts.length < 3) {
		throw new Error("Invalid HTTP response line format");
	}
	const httpVersionPart = parts[0];
	const statusCode = Number.parseInt(parts[1], 10);
	const statusText = parts.slice(2).join(" ");
	const versionNumbers = httpVersionPart.slice(5).split(".", 2);
	if (versionNumbers.length !== 2) {
		throw new Error("Invalid HTTP version numbers format");
	}
	const httpVersionMajor = Number.parseInt(versionNumbers[0], 10);
	const httpVersionMinor = Number.parseInt(versionNumbers[1], 10);

	return [statusCode, statusText, httpVersionMajor, httpVersionMinor];
}

async function readHeaders(
	reader: TextReader,
): Promise<[headers: Headers, chunked: boolean, contentLength: number]> {
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
		const match = parseHeaderLine(line);
		if (!match) {
			throw new Error(`Invalid header line: ${line}`);
		}
		let value = match[1];
		while (true) {
			const continueHeader = parseHeaderContinue(value);
			if (!continueHeader) {
				break;
			}
			value = continueHeader;
		}
		const originalKey = match[0];
		const key = originalKey.toLowerCase();
		if (key === "transfer-encoding" && value.toLowerCase() === "chunked") {
			chunked = true;
		} else if (key === "content-length") {
			contentLength = +value;
		}
		headers.append(originalKey, value);
	}
	return [headers, chunked, contentLength];
}

function parseHeaderLine(
	headerLine: string,
): [name: string, value: string] | false {
	const colonIndex = headerLine.indexOf(":");
	if (colonIndex === -1) {
		return false;
	}
	const name = headerLine.slice(0, colonIndex).trim();
	const value = headerLine.slice(colonIndex + 1).trim();
	return [name, value];
}

function parseHeaderContinue(line: string): string | false {
	let i = 0;
	while (
		i < line.length &&
		(line[i] === " " ||
			line[i] === "\t" ||
			line[i] === "\n" ||
			line[i] === "\r")
	) {
		i++;
	}
	if (i === 0) {
		return false;
	}
	const result = line.slice(i).trimEnd();
	if (result === "") {
		return false;
	}
	return result;
}

function streamBody(
	reader: TextReader,
	chunked: boolean,
	contentLength: number,
): ReadableStream<Uint8Array> | null {
	if (!chunked && contentLength === 0) {
		return null;
	}
	const stream = new TransformStream<Uint8Array, Uint8Array>();
	streamBodyFromReaderToWritable(
		reader,
		stream.writable,
		chunked,
		contentLength,
	);
	return stream.readable;
}

async function streamBodyFromReaderToWritable(
	reader: TextReader,
	writableStream: WritableStream<Uint8Array>,
	chunked: boolean,
	contentLength: number,
) {
	const writer = writableStream.getWriter();
	try {
		if (chunked) {
			while (true) {
				const { done, value: line } = await reader.readLine();
				if (done) {
					throw new Error("Unexpected end of stream");
				}
				if (parseHeaderLine(line)) {
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
		} else {
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
	} finally {
		reader.releaseLock();
		writer.releaseLock();
		writableStream.close();
	}
}

export type TextReader = ReturnType<typeof createTextReader>;

export function createTextReader(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	bufferSize = DEFAULT_BUFFER_SIZE,
) {
	let buffer: Uint8Array = new Uint8Array(bufferSize);
	let bufferOffset = 0;
	let bufferLength = 0;
	let doneReading = false;

	async function tryFillTo(offset: number) {
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

	async function readLine(): Promise<ReadableStreamReadResult<string>> {
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

	async function read(
		byteCount: number,
	): Promise<ReadableStreamReadResult<Uint8Array>> {
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

export function concatUint8Array(a: Uint8Array, b: Uint8Array) {
	const bytes = new Uint8Array(a.byteLength + b.byteLength);
	bytes.set(a);
	bytes.set(b, a.byteLength);
	return bytes;
}

export function writeToUint8Array(
	buffer: Uint8Array,
	offset: number,
	chunk: Uint8Array,
): Uint8Array {
	if (chunk.byteLength >= buffer.byteLength - offset) {
		const newBuffer = new Uint8Array(buffer.byteLength * 2);
		newBuffer.set(buffer);
		newBuffer.set(chunk, offset);
		return newBuffer;
	}
	buffer.set(chunk, offset);
	return buffer;
}

export async function readAll(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Uint8Array> {
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
	} finally {
		reader.releaseLock();
	}
}
