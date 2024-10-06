const e=/^([^: \t]+):[ \t]*((?:.*[^ \t])|)/,t=/^[ \t]+(.*[^ \t])/,n=/^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/,r=/^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/,a="\n".charCodeAt(0),o="\r".charCodeAt(0),i=new TextEncoder,s=new TextDecoder;class c extends Request{constructor(e,t){const n=t?.headers;if(super(e,t),n){const e=new Headers(n);Object.defineProperty(this,"headers",{value:e,writable:!1})}}}async function d(e,t={mode:"same-origin",credentials:"include"}){const r=h(e),[a,o]=await async function(e){const{done:t,value:r}=await e.readLine();if(t)throw new Error("Unexpected end of request");const a=n.exec(r);if(!a)throw new Error(`Invalid request line: ${r}`);return[a[1],a[2],+a[3],+a[4]]}(r),[i,s,d]=await u(r),w=l(r,s,d);return new c(o,{...t,method:a,headers:i,body:w,duplex:"half"})}async function w(e){const t=h(e),[n,a]=await async function(e){const{done:t,value:n}=await e.readLine();if(t)throw new Error("Unexpected end of request");const a=r.exec(n);if(!a)throw new Error(`Invalid response line: ${n}`);return[+a[3],a[4],+a[1],+a[2]]}(t),[o,i,s]=await u(t),c=l(t,i,s);return new Response(c,{status:n,statusText:a,headers:o})}async function f(e,t){const n=e.getWriter();let r=!1;try{const[a,o]=t instanceof Request?[t,null]:[null,t];a?await n.write(i.encode(`${a.method} ${a.url} HTTP/1.1\r\n`)):await n.write(i.encode(`HTTP/1.1 ${o.status} ${o.statusText}\r\n`));const s=new Headers(t.headers);if(t.body)if(a){const e=await b(t.body.getReader());s.set("Content-Length",`${e.byteLength}`);for(const[e,t]of s.entries())await n.write(i.encode(`${e}: ${t}\r\n`));await n.write(i.encode("\r\n")),await n.write(e)}else{const a=Number.parseInt(s.get("Content-Length")||"0",10),o="chunked"===s.get("Transfer-Encoding")?.toLowerCase();for(const[e,t]of s.entries())await n.write(i.encode(`${e}: ${t}\r\n`));await n.write(i.encode("\r\n")),n.releaseLock(),await(l(h(t.body.getReader()),o,a)?.pipeTo(e)),r=!0}else{for(const[e,t]of s.entries())await n.write(i.encode(`${e}: ${t}\r\n`));await n.write(i.encode("\r\n"))}}finally{r||(n.releaseLock(),e.close())}}async function u(n){const r=new Headers;let a=!1,o=0;for(;;){const{done:i,value:s}=await n.readLine();if(i)throw new Error("Unexpected end of headers");if(""===s)break;const c=e.exec(s);if(!c)throw new Error(`Invalid header line: ${s}`);let d=c[2];for(;;){const e=t.exec(d);if(!e)break;d=e[1]}const w=c[1].toLowerCase();"transfer-encoding"===w&&"chunked"===d.toLowerCase()?a=!0:"content-length"===w&&(o=+d),r.append(c[1],d)}return[r,a,o]}function l(t,n,r){if(!n&&0===r)return null;const a=new TransformStream;return async function(t,n,r,a){const o=n.getWriter();try{if(r)for(;;){const{done:n,value:r}=await t.readLine();if(n)throw new Error("Unexpected end of stream");if(e.exec(r)){await t.readLine();break}const a=Number.parseInt(r,16);if(!a)break;let i=a;for(;i>0;){const{done:e,value:n}=await t.read(a);if(e)throw new Error("Unexpected end of stream");i-=n.byteLength,await o.write(n)}await t.readLine()}else{let e=a;for(;e>0;){const{done:n,value:r}=await t.read(e);if(n)throw new Error("Unexpected end of stream");e-=r.byteLength,await o.write(r)}}}finally{t.releaseLock(),o.releaseLock(),n.close()}}(t,a.writable,n,r),a.readable}function h(e,t=4096){let n=new Uint8Array(t),r=0,i=0,c=!1;async function d(t){if(c)return t<i;for(;t>=i;){const{done:t,value:r}=await e.read();if(t){c=!0;break}n=L(n,i,r),i+=r.byteLength}return t<i}return{readLine:async function(){let e=r,t=await d(e);for(;t;){if(n[e]===a){const t=n[e-1]===o?e-1:e,a=s.decode(n.slice(r,t));return r=e+1,{done:!1,value:a}}e++,e>=i&&(t=await d(e))}return{done:!0}},read:async function(e){const t=r+e;await d(t-1);const a=Math.min(i-r,e);if(0===a)return{done:!0};const o=n.slice(r,r+a);return r+=a,{done:!1,value:o}},releaseLock:function(){e.releaseLock()}}}function y(e,t){const n=new Uint8Array(e.byteLength+t.byteLength);return n.set(e),n.set(t,e.byteLength),n}function L(e,t,n){if(n.byteLength>=e.byteLength-t){const r=new Uint8Array(2*e.byteLength);return r.set(e),r.set(n,t),r}return e.set(n,t),e}async function b(e){try{const{done:t,value:n}=await e.read();if(t)return new Uint8Array;let r=n;for(;;){const{done:t,value:n}=await e.read();if(t)break;r=y(r,n)}return r}finally{e.releaseLock()}}export{c as HTTPRequest,y as concatUint8Array,h as createTextReader,d as parseRequest,w as parseResponse,b as readAll,f as writeRequestOrResponse,L as writeToUint8Array};
//# sourceMappingURL=index.js.map