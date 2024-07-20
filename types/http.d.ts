export declare const DEFAULT_BUFFER_SIZE = 4096;
export declare const HEADER_REGEX: RegExp;
export declare const HEADER_CONTINUE_REGEX: RegExp;
export declare const REQUEST_REGEX: RegExp;
export declare const RESPONSE_REGEX: RegExp;
export declare const NEWLINE: number;
export declare const RETURN: number;
export declare const TEXT_ENCODER: TextEncoder;
export declare const TEXT_DECODER: TextDecoder;
export declare class HTTPRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit);
}
export declare function parseRequest(reader: ReadableStreamDefaultReader<Uint8Array>, init?: RequestInit): Promise<Request>;
export declare function parseResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Response>;
export declare function writeRequestOrResponse(writableStream: WritableStream<Uint8Array>, requestOrResponse: Request | Response): Promise<void>;
export type TextReader = ReturnType<typeof createTextReader>;
export declare function createTextReader(reader: ReadableStreamDefaultReader<Uint8Array>, bufferSize?: number): {
    readLine: () => Promise<ReadableStreamReadResult<string>>;
    read: (byteCount: number) => Promise<ReadableStreamReadResult<Uint8Array>>;
    releaseLock: () => void;
};
export declare function concatUint8Array(a: Uint8Array, b: Uint8Array): Uint8Array;
export declare function writeToUint8Array(buffer: Uint8Array, offset: number, chunk: Uint8Array): Uint8Array;
export declare function readAll(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array>;
