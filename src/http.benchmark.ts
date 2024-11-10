import * as tape from "tape";
import { Suite, type Event } from "benchmark";
import {
	DEFAULT_BUFFER_SIZE,
	parseRequest,
	parseResponse,
	TEXT_DECODER,
	TEXT_ENCODER,
} from "./http";
import * as HTTPParserJS from "http-parser-js";
import * as httpStringParser from "http-string-parser";

const REQUEST = `POST http://test/ HTTP/1.1
Host: localhost
Content-Length: 13

Hello, World!`;

tape("request", (assert: tape.Test) => {
	new Suite()
		.add("@aicaica/http", async () => {
			const _ = await parseRequest(
				createReadableStreamForText(REQUEST).getReader(),
			);
		})
		.add("http-parser-js", async () => {
			const buffer = await readerToBuffer(
				createReadableStreamForText(RESPONSE).getReader(),
			);
			await new Promise((resolve) => {
				const parser = new HTTPParserJS.HTTPParser(
					HTTPParserJS.HTTPParser.REQUEST,
				);
				parser[HTTPParserJS.HTTPParser.kOnMessageComplete] = resolve as never;
				parser.execute(buffer);
				parser.finish();
				parser.close();
			});
		})
		.add("http-string-parser", async () => {
			const string = await readerToString(
				createReadableStreamForText(RESPONSE).getReader(),
			);
			const _ = httpStringParser.parseRequest(string);
		})
		.on("cycle", function (this: Suite, event: Event) {
			console.log(String(event.target));
		})
		.on("complete", () => {
			assert.end();
		})
		.run({ async: true });
});

const RESPONSE = `HTTP/1.1 200 OK
Transfer-Encoding: chunked

d
Hello, World!
0

`;

tape("response", (assert: tape.Test) => {
	new Suite()
		.add("@aicaica/http", async () => {
			const _ = await parseResponse(
				createReadableStreamForText(RESPONSE).getReader(),
			);
		})
		.add("http-parser-js", async () => {
			const buffer = await readerToBuffer(
				createReadableStreamForText(RESPONSE).getReader(),
			);
			await new Promise((resolve) => {
				const parser = new HTTPParserJS.HTTPParser(
					HTTPParserJS.HTTPParser.RESPONSE,
				);
				parser[HTTPParserJS.HTTPParser.kOnMessageComplete] = resolve as never;
				parser.execute(buffer);
				parser.finish();
				parser.close();
			});
		})
		.add("http-string-parser", async () => {
			const string = await readerToString(
				createReadableStreamForText(RESPONSE).getReader(),
			);
			const _ = httpStringParser.parseResponse(string);
		})
		.on("cycle", function (this: Suite, event: Event) {
			console.log(String(event.target));
		})
		.on("complete", () => {
			assert.end();
		})
		.run({ async: true });
});

function createReadableStreamForText(text: string): ReadableStream<Uint8Array> {
	const bytes = TEXT_ENCODER.encode(text);
	let offset = 0;
	return new ReadableStream({
		pull(controller): void {
			if (offset >= bytes.length) {
				controller.close();
				return;
			}
			const length = Math.min(bytes.length - offset, DEFAULT_BUFFER_SIZE);
			const chunk = bytes.slice(offset, offset + length);
			controller.enqueue(chunk);
			offset += length;
		},
	});
}

async function readerToBuffer(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Buffer> {
	const chunks: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

async function readerToString(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
	const chunks: string[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		chunks.push(TEXT_DECODER.decode(value));
	}
	return chunks.join("");
}
