import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';

const bucket = 'fieldpilot-evidence';
const key = 'organizations/org-1/projects/project-1/media/media-1/original';
const config = {
  endpoint: 'http://127.0.0.1:59000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'fieldpilot',
    secretAccessKey: 'fieldpilot-secret',
  },
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForMinio(client) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      return;
    } catch (error) {
      if (error.name === 'BucketAlreadyOwnedByYou') return;
      if (attempt === 29) throw error;
      await sleep(250);
    }
  }
}

async function beginUpload(client) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error('immutable evidence already exists');
  } catch (error) {
    if (error.message === 'immutable evidence already exists') throw error;
    if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound')
      throw error;
  }

  return client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: 'application/octet-stream',
    }),
  );
}

async function main() {
  const firstClient = new S3Client(config);
  await waitForMinio(firstClient);

  const firstPart = Buffer.alloc(5 * 1024 * 1024, 'a');
  const secondPart = Buffer.from('fieldpilot-resumed-evidence');
  const expected = Buffer.concat([firstPart, secondPart]);
  const expectedHash = createHash('sha256').update(expected).digest('hex');

  const { UploadId: uploadId } = await beginUpload(firstClient);
  await firstClient.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: 1,
      Body: firstPart,
    }),
  );
  firstClient.destroy();

  const resumedClient = new S3Client(config);
  const interrupted = await resumedClient.send(
    new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
  );
  assert.deepEqual(
    interrupted.Parts?.map((part) => part.PartNumber),
    [1],
  );

  await resumedClient.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: 2,
      Body: secondPart,
    }),
  );
  const uploaded = await resumedClient.send(
    new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
  );
  assert.equal(
    uploaded.Parts?.length,
    2,
    'resume must not duplicate uploaded parts',
  );

  await resumedClient.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: uploaded.Parts?.map(({ ETag, PartNumber }) => ({
          ETag,
          PartNumber,
        })),
      },
    }),
  );

  const object = await resumedClient.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const actual = Buffer.from(await object.Body.transformToByteArray());
  assert.equal(createHash('sha256').update(actual).digest('hex'), expectedHash);

  const objects = await resumedClient.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: key }),
  );
  assert.deepEqual(
    objects.Contents?.map((item) => item.Key),
    [key],
  );
  await assert.rejects(
    beginUpload(resumedClient),
    /immutable evidence already exists/,
  );

  resumedClient.destroy();
  console.log('Resumable multipart evidence spike passed');
}

await main();
