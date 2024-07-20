import * as tape from "tape";
import {
	parseResponse,
	parseRequest,
	writeRequestOrResponse,
	TEXT_ENCODER,
	HTTPRequest,
	readAll,
	TEXT_DECODER,
} from "./http";

tape("parse get request", async (assert: tape.Test) => {
	const requestReader = createRandomReadableStreamForText(
		"GET http://test/path HTTP/1.1\r\nHost: localhost\r\n\r\n",
	).getReader();
	const request = await parseRequest(requestReader);
	assert.equal(request.method, "GET");
	assert.equal(request.url, "http://test/path");
	assert.equal(request.headers.get("Host"), "localhost");
	assert.end();
});

tape("parse post request with body", async (assert: tape.Test) => {
	const requestReader = createRandomReadableStreamForText(
		`POST http://test/ HTTP/1.1
Host: localhost
Content-Length: 13

Hello, World!`,
	).getReader();
	const request = await parseRequest(requestReader);
	assert.equal(request.method, "POST");
	assert.equal(request.url, "http://test/");
	assert.equal(request.headers.get("Content-Length"), "13");
	const body = await request.text();
	assert.equal(body, "Hello, World!");
	assert.end();
});

tape("parse response", async (assert: tape.Test) => {
	const responseReader = createRandomReadableStreamForText(
		"HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, World!",
	).getReader();
	const response = await parseResponse(responseReader);
	assert.equal(response.status, 200);
	assert.equal(response.statusText, "OK");
	assert.equal(response.headers.get("Content-Length"), "13");
	const body = await response.text();
	assert.equal(body, "Hello, World!");
	assert.end();
});

tape("write request", async (assert: tape.Test) => {
	const stream = new TransformStream<Uint8Array, Uint8Array>();
	writeRequestOrResponse(
		stream.writable,
		new HTTPRequest("http://test/", {
			method: "POST",
			headers: {
				"Content-Length": "13",
			},
			body: "Hello, World!",
		}),
	);
	const bytes = await readAll(stream.readable.getReader());
	assert.equal(
		TEXT_DECODER.decode(bytes),
		"POST http://test/ HTTP/1.1\r\ncontent-length: 13\r\n\r\nHello, World!",
	);
	assert.end();
});

tape("write response", async (assert: tape.Test) => {
	const stream = new TransformStream<Uint8Array, Uint8Array>();
	writeRequestOrResponse(
		stream.writable,
		new Response("Hello, World!", {
			status: 200,
			headers: {
				"Content-Length": "13",
			},
		}),
	);
	const bytes = await readAll(stream.readable.getReader());
	assert.equal(
		TEXT_DECODER.decode(bytes),
		"HTTP/1.1 200 \r\ncontent-length: 13\r\ncontent-type: text/plain;charset=UTF-8\r\n\r\nHello, World!",
	);
	assert.end();
});

function createRandomReadableStreamForText(
	text: string,
): ReadableStream<Uint8Array> {
	const bytes = TEXT_ENCODER.encode(text);
	let offset = 0;
	return new ReadableStream({
		pull(controller): void {
			if (offset >= bytes.length) {
				controller.close();
				return;
			}
			const length = Math.min(
				bytes.length - offset,
				Math.floor(Math.random() * 10) + 1,
			);
			const chunk = bytes.slice(offset, offset + length);
			controller.enqueue(chunk);
			offset += length;
		},
	});
}
