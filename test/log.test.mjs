import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import { createLogger, isDebugEnabled } from "../src/log.mjs";

function captureStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, text: () => chunks.join("") };
}

test("a disabled logger writes nothing", () => {
  const { stream, text } = captureStream();
  const log = createLogger({ debug: false, stream });
  log.debug("a");
  log.info("b");
  log.error("c");
  assert.equal(text(), "");
});

test("an enabled logger writes single-line entries with object values", () => {
  const { stream, text } = captureStream();
  const log = createLogger({ debug: true, stream });
  log.info("ok=true", { n: 1 });
  assert.equal(text(), '[local-vision] info ok=true {"n":1}\n');
});

test("an enabled logger drops empty parts", () => {
  const { stream, text } = captureStream();
  const log = createLogger({ debug: true, stream });
  log.info("a=1", undefined, "");
  assert.equal(text(), "[local-vision] info a=1\n");
});

test("detects debug from the --debug flag", () => {
  assert.equal(isDebugEnabled({}, ["--debug"]), true);
  assert.equal(isDebugEnabled({}, []), false);
});

test("detects debug from LOG_LEVEL", () => {
  assert.equal(isDebugEnabled({ LOG_LEVEL: "debug" }, []), true);
  assert.equal(isDebugEnabled({ LOG_LEVEL: "trace" }, []), true);
  assert.equal(isDebugEnabled({ LOG_LEVEL: "1" }, []), true);
  assert.equal(isDebugEnabled({ LOG_LEVEL: "info" }, []), false);
  assert.equal(isDebugEnabled({ LOG_LEVEL: "warn" }, []), false);
  assert.equal(isDebugEnabled({}, []), false);
});
