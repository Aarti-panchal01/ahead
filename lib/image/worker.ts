// The image-lab Web Worker: MediaPipe and the pixel maths run here, off the main thread (browser.ts starts it).
import { serveLab, type Port } from "./worker-protocol";

// A module worker has no importScripts, so MediaPipe loads its WASM loader with import(url). Bundlers rewrite a bare
// import() of a runtime URL into their own chunk loader, which cannot fetch it; MediaPipe calls self.import first if
// it exists, so hand it a native one.
(self as unknown as { import: (url: string) => Promise<unknown> }).import = (url: string) =>
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);

serveLab(self as unknown as Port);
