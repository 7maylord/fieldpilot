import { createHash, createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { loadConfig } from '../config/app.config';

@Injectable()
export class S3Service {
  private readonly config = loadConfig().storage;
  private bucketReady?: Promise<void>;

  async createMultipart(key: string) {
    await this.ensureBucket();
    const response = await this.request('POST', key, { uploads: '' });
    if (!response.ok)
      throw new Error(
        `Object storage rejected multipart creation (${response.status})`,
      );
    const xml = await response.text();
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
    if (!uploadId)
      throw new Error('Object storage did not return an upload ID');
    return uploadId;
  }

  partUrl(key: string, uploadId: string, partNumber: number) {
    return this.presign('PUT', key, {
      partNumber: String(partNumber),
      uploadId,
    });
  }

  downloadUrl(key: string) {
    return this.presign('GET', key, {}, 300);
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ) {
    const body = `<CompleteMultipartUpload>${parts
      .sort((a, b) => a.partNumber - b.partNumber)
      .map(
        ({ partNumber, etag }) =>
          `<Part><PartNumber>${partNumber}</PartNumber><ETag>${escapeXml(etag)}</ETag></Part>`,
      )
      .join('')}</CompleteMultipartUpload>`;
    const response = await this.request('POST', key, { uploadId }, body);
    if (!response.ok)
      throw new Error(
        `Object storage rejected multipart completion (${response.status})`,
      );
  }

  async bytes(key: string) {
    const response = await fetch(this.downloadUrl(key));
    if (!response.ok)
      throw new Error(`Object storage read failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  presign(
    method: 'GET' | 'PUT',
    key: string,
    query: Record<string, string>,
    expires = 900,
    now = new Date(),
  ) {
    const { date, timestamp } = awsDate(now);
    const scope = `${date}/${this.config.region}/s3/aws4_request`;
    const url = this.url(key);
    const parameters: Record<string, string> = {
      ...query,
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.config.accessKeyId}/${scope}`,
      'X-Amz-Date': timestamp,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    };
    const canonicalQuery = queryString(parameters);
    const canonical = `${method}\n${url.pathname}\n${canonicalQuery}\nhost:${url.host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const signature = this.signature(timestamp, scope, canonical, date);
    url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return url.toString();
  }

  private async request(
    method: 'PUT' | 'POST',
    key = '',
    query: Record<string, string> = {},
    body = '',
  ) {
    const now = new Date();
    const { date, timestamp } = awsDate(now);
    const scope = `${date}/${this.config.region}/s3/aws4_request`;
    const url = this.url(key);
    url.search = queryString(query);
    const payloadHash = sha256(body);
    const headers = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonical = `${method}\n${url.pathname}\n${url.search.slice(1)}\n${headers}\n${signedHeaders}\n${payloadHash}`;
    return fetch(url, {
      method,
      body: body || undefined,
      headers: {
        authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${this.signature(timestamp, scope, canonical, date)}`,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': timestamp,
      },
    });
  }

  private ensureBucket() {
    this.bucketReady ??= this.request('PUT').then((response) => {
      if (!response.ok && response.status !== 409)
        throw new Error(
          `Object storage bucket setup failed (${response.status})`,
        );
    });
    return this.bucketReady;
  }

  private url(key: string) {
    const url = new URL(this.config.endpoint);
    url.pathname = `/${encodeURIComponent(this.config.bucket)}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`.replace(/\/$/, '');
    return url;
  }

  private signature(
    timestamp: string,
    scope: string,
    canonical: string,
    date: string,
  ) {
    const dateKey = hmac(`AWS4${this.config.secretAccessKey}`, date);
    const regionKey = hmac(dateKey, this.config.region);
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    return hmac(
      signingKey,
      `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonical)}`,
      'hex',
    );
  }
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function hmac(key: string | Buffer, value: string): Buffer;
function hmac(key: string | Buffer, value: string, encoding: 'hex'): string;
function hmac(
  key: string | Buffer,
  value: string,
  encoding?: 'hex',
): string | Buffer {
  const digest = createHmac('sha256', key).update(value);
  return encoding ? digest.digest(encoding) : digest.digest();
}
const awsDate = (date: Date) => {
  const timestamp = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { timestamp, date: timestamp.slice(0, 8) };
};
const queryString = (query: Record<string, string>) =>
  Object.entries(query)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join('&');
const awsEncode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
