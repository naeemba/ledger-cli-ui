const DEK_BYTES = 32;

/** Decode a base64-encoded DEK posted by the browser into a 32-byte Buffer. */
export const decodeDek = (value: unknown): Buffer => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Missing dek');
  }
  const buf = Buffer.from(value, 'base64'); // lenient; validate by length
  if (buf.length !== DEK_BYTES) {
    throw new Error(`DEK must be ${DEK_BYTES} bytes`);
  }
  return buf;
};
