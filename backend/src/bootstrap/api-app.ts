import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
  ContentObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../app.module';
import { JsonLogger } from '../common/json-logger';
import { ProblemDetailsFilter } from '../common/problem-details.filter';
import type { AppConfig } from '../config/app.config';

export async function createApiApp(config: AppConfig) {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors({ origin: config.frontendUrl, credentials: true });
  app.enableShutdownHooks();
  return app;
}

export function createOpenApiDocument(
  app: Awaited<ReturnType<typeof createApiApp>>,
) {
  const options = new DocumentBuilder()
    .setTitle('FieldPilot API')
    .setDescription(
      'Offline-first field operations API for organizations, projects, work orders, inspections, media, sync, defects, assets, reports, notifications, and operations telemetry.',
    )
    .setVersion('1.0')
    .addServer('http://localhost:3001', 'Local API')
    .addTag('Health', 'Liveness and readiness probes.')
    .addTag('auth', 'Email identity, CSRF, and cookie session lifecycle.')
    .addTag('organizations', 'Tenant, membership, invitation, and team setup.')
    .addTag('projects', 'Project records and optimistic status changes.')
    .addTag(
      'devices',
      'Offline device enrollment, heartbeat, package renewal, and purge.',
    )
    .addTag(
      'sites and locations',
      'Sites, hierarchy, GPS points, and viewport queries.',
    )
    .addTag(
      'work orders',
      'Work creation, assignment, scheduling, dependencies, and state transitions.',
    )
    .addTag(
      'sync',
      'Offline package bootstrap, push/pull, and conflict resolution.',
    )
    .addTag(
      'forms',
      'Form templates, immutable versions, publication, and comparison.',
    )
    .addTag(
      'inspections',
      'Inspection creation, drafts, submissions, and reviews.',
    )
    .addTag(
      'media',
      'Private resumable uploads, derivatives, malware scanning, and signed URLs.',
    )
    .addTag(
      'defects',
      'Defect lifecycle, assignments, corrections, and verification.',
    )
    .addTag('assets', 'Asset registry, QR lookup, history, and meter readings.')
    .addTag(
      'daily reports',
      'Daily report drafts, review, signatures, publication, and export.',
    )
    .addTag(
      'notifications',
      'In-app notifications and organization-scoped SSE.',
    )
    .addTag(
      'metrics',
      'Prometheus scraping and bounded client-failure telemetry.',
    )
    .addCookieAuth('fieldpilot_session', undefined, 'fieldpilot_session')
    .addCookieAuth('fieldpilot_refresh', undefined, 'fieldpilot_refresh')
    .build();
  return completeOpenApiDocument(SwaggerModule.createDocument(app, options));
}

export function mountOpenApi(app: Awaited<ReturnType<typeof createApiApp>>) {
  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
}

const publicOperations = new Set([
  'GET /api/v1/auth/csrf',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/password-reset/request',
  'POST /api/v1/auth/password-reset/complete',
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
  'GET /api/v1/metrics',
]);

const unsafeMethods = new Set(['post', 'put', 'patch', 'delete']);

function completeOpenApiDocument(document: OpenAPIObject) {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.securitySchemes ??= {};
  document.components.schemas.ProblemDetails = problemDetailsSchema();
  document.components.schemas.JsonObject = {
    type: 'object',
    additionalProperties: true,
  };
  document.components.schemas.JsonArray = {
    type: 'array',
    items: { $ref: '#/components/schemas/JsonObject' },
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!isOperation(operation)) continue;
      const key = `${method.toUpperCase()} ${path}`;
      operation.summary = summarize(operation, method, path);
      operation.description ??= describeOperation(operation, method, path);
      operation.responses ??= {};
      operation.responses[successStatus(operation.responses, method)] ??= {
        description: '',
      };
      completeSuccessResponse(operation, method, path);
      addProblemResponses(operation, key);
      addAuth(operation, key);
      addCsrfHeader(operation, method);
      describeParameters(operation);
    }
  }
  return document;
}

function isOperation(value: unknown): value is OperationObject {
  return Boolean(value && typeof value === 'object' && 'responses' in value);
}

function summarize(operation: OperationObject, method: string, path: string) {
  const name = operation.operationId?.split('_').at(-1) ?? method;
  const resource = resourceName(operation.tags?.[0], path);
  const resources = pluralResourceName(operation.tags?.[0], path);
  const summaries: Record<string, string> = {
    acknowledgePurge: 'Acknowledge device purge',
    accept: 'Accept organization invitation',
    addTeamMember: 'Add team member',
    archive: 'Archive project',
    assign: path.includes('/work-orders')
      ? 'Assign work order'
      : 'Assign defect',
    audit: 'List organization audit events',
    bootstrap: 'Bootstrap offline sync package',
    check: 'Check API health',
    checkSchedule: 'Check work-order schedule',
    clientFailure: 'Record client failure',
    complete: 'Complete media upload',
    compare: 'Compare form versions',
    conflicts: 'List sync conflicts',
    correct: 'Record defect correction',
    create: path.includes('/upload-sessions')
      ? 'Create media upload session'
      : `Create ${resource}`,
    createLocation: 'Create location',
    createSite: 'Create site',
    createTeam: 'Create team',
    createType: 'Create asset type',
    csrf: 'Issue CSRF token',
    csv: 'Export daily report CSV',
    dependency: 'Add work-order dependency',
    dispatch: 'Get dispatch board',
    duplicate: 'Duplicate form template',
    get: `Get ${resource}`,
    grantProjectAccess: 'Grant project access',
    heartbeat: 'Update device heartbeat',
    invite: 'Invite organization member',
    list: `List ${resources}`,
    listLocations: 'List locations',
    listSites: 'List sites',
    login: 'Log in',
    logout: 'Log out',
    lookup: 'Look up asset by QR code',
    markRead: 'Mark notification as read',
    members: 'List organization members',
    me: 'Get current user',
    openStream: 'Open notification stream',
    pdf: 'Export daily report PDF',
    publish: path.includes('/daily-reports')
      ? 'Publish daily report'
      : `Publish ${resource}`,
    pull: 'Pull sync changes',
    push: 'Push sync changes',
    reading: 'Add asset meter reading',
    readiness: 'Check API readiness',
    refresh: 'Refresh auth session',
    register: path.includes('/devices') ? 'Register device' : 'Register user',
    renewPackage: 'Renew offline device package',
    requestPasswordReset: 'Request password reset',
    requestPurge: 'Request device purge',
    resetPassword: 'Complete password reset',
    resolve: 'Resolve sync conflict',
    resume: 'Resume media upload',
    revoke: path.includes('/devices') ? 'Revoke device' : 'Revoke auth session',
    revise: 'Revise daily report',
    review: path.includes('/daily-reports')
      ? 'Review daily report'
      : `Review ${resource}`,
    save: 'Save inspection draft',
    scrape: 'Scrape Prometheus metrics',
    sessions: 'List auth sessions',
    sign: 'Sign daily report',
    status: 'Get device status',
    submit: 'Submit inspection',
    teams: 'List teams',
    transition: `Transition ${resource}`,
    types: 'List asset types',
    update: `Update ${resource}`,
    updateMembership: 'Update organization membership',
    upsertScheduleResource: 'Upsert schedule resource',
    url: 'Get signed media URL',
    verify: 'Verify defect correction',
    verifyEmail: 'Verify email address',
    viewport: 'List locations in viewport',
  };
  return summaries[name] ?? `${humanize(name)} ${resource}`;
}

function resourceName(tag: string | undefined, path: string) {
  if (path.includes('/work-orders')) return 'work order';
  if (path.includes('/daily-reports')) return 'daily report';
  if (path.includes('/form-templates')) return 'form template';
  if (path.includes('/teams')) return 'team';
  if (path.includes('/upload-sessions')) return 'media upload session';
  if (path.includes('/media/')) return 'media object';
  if (path.includes('/locations')) return 'location';
  if (path.includes('/sites')) return 'site';
  return (
    {
      Health: 'API health',
      assets: 'asset',
      auth: 'auth session',
      defects: 'defect',
      devices: 'device',
      inspections: 'inspection',
      media: 'media',
      metrics: 'metrics',
      notifications: 'notification',
      organizations: 'organization',
      projects: 'project',
      sync: 'sync package',
    }[tag ?? ''] ?? 'FieldPilot resource'
  );
}

function pluralResourceName(tag: string | undefined, path: string) {
  if (path.includes('/work-orders')) return 'work orders';
  if (path.includes('/daily-reports')) return 'daily reports';
  if (path.includes('/form-templates')) return 'form templates';
  if (path.includes('/teams')) return 'teams';
  if (path.includes('/upload-sessions')) return 'media upload sessions';
  if (path.includes('/media/')) return 'media objects';
  if (path.includes('/locations')) return 'locations';
  if (path.includes('/sites')) return 'sites';
  return (
    {
      Health: 'health probes',
      assets: 'assets',
      auth: 'auth sessions',
      defects: 'defects',
      devices: 'devices',
      inspections: 'inspections',
      media: 'media objects',
      metrics: 'metrics',
      notifications: 'notifications',
      organizations: 'organizations',
      projects: 'projects',
      sync: 'sync records',
    }[tag ?? ''] ?? 'FieldPilot resources'
  );
}

function describeOperation(
  operation: OperationObject,
  method: string,
  path: string,
) {
  const access = publicOperations.has(`${method.toUpperCase()} ${path}`)
    ? 'This endpoint is public.'
    : 'Requires a valid FieldPilot session cookie.';
  const csrf = unsafeMethods.has(method)
    ? ' Unsafe methods also require the matching x-csrf-token header.'
    : '';
  return `${operation.summary}. ${access}${csrf}`;
}

function successStatus(
  responses: OperationObject['responses'],
  method: string,
) {
  return (
    ['200', '201', '202', '204'].find((status) => responses?.[status]) ??
    (method === 'post' ? '201' : '200')
  );
}

function completeSuccessResponse(
  operation: OperationObject,
  method: string,
  path: string,
) {
  const status = successStatus(operation.responses, method);
  const response = operation.responses[status] as ResponseObject;
  response.description ||= successDescription(method, path);
  response.content ??= successContent(method, path);
}

function successDescription(method: string, path: string) {
  if (path.endsWith('/stream')) return 'Server-sent event stream opened.';
  if (path.endsWith('/export.pdf')) return 'PDF report bytes.';
  if (path.endsWith('/export.csv')) return 'CSV report bytes.';
  if (path === '/api/v1/metrics') return 'Prometheus metrics text.';
  if (method === 'post') return 'Resource created or workflow action applied.';
  if (method === 'patch') return 'Resource updated.';
  if (method === 'delete') return 'Resource revoked or removed.';
  return 'Request succeeded.';
}

function successContent(method: string, path: string): ContentObject {
  if (path.endsWith('/stream')) {
    return { 'text/event-stream': { schema: { type: 'string' } } };
  }
  if (path.endsWith('/export.pdf')) {
    return {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    };
  }
  if (path.endsWith('/export.csv')) {
    return { 'text/csv': { schema: { type: 'string' } } };
  }
  if (path === '/api/v1/metrics') {
    return {
      'text/plain; version=0.0.4; charset=utf-8': {
        schema: { type: 'string' },
      },
    };
  }
  return {
    'application/json': {
      schema: {
        $ref: collectionResponse(method, path)
          ? '#/components/schemas/JsonArray'
          : '#/components/schemas/JsonObject',
      },
    },
  };
}

function collectionResponse(method: string, path: string) {
  if (method !== 'get') return false;
  if (
    /\/(csrf|me|ready|status|url|compare|dispatch)$/.test(path) ||
    /\/(export\.pdf|export\.csv|stream)$/.test(path) ||
    /\/qr\/\{qrCode\}$/.test(path)
  )
    return false;
  return !/\/\{[^}]+}$/.test(path);
}

function addProblemResponses(operation: OperationObject, key: string) {
  if (key.startsWith('GET /api/v1/health')) return;
  const authenticated = !publicOperations.has(key);
  const responses = {
    400: 'Validation failed, malformed input, or an invalid route/query parameter.',
    ...(authenticated
      ? {
          401: 'Authentication cookie is missing, expired, or revoked.',
          403: 'Capability, tenant access, CSRF, or membership check failed.',
        }
      : {}),
    404: 'Requested tenant-scoped resource was not found.',
    409: 'Optimistic version, state-machine, idempotency, or sync conflict.',
    429: 'Rate limit exceeded.',
    500: 'Unexpected server error.',
  };
  for (const [status, description] of Object.entries(responses)) {
    operation.responses[status] ??= problemResponse(description);
  }
}

function problemResponse(description: string): ResponseObject {
  return {
    description,
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/ProblemDetails' },
      },
    },
  };
}

function addAuth(operation: OperationObject, key: string) {
  if (key === 'POST /api/v1/auth/refresh') {
    operation.security = [{ fieldpilot_refresh: [] }];
    return;
  }
  operation.security = publicOperations.has(key)
    ? []
    : [{ fieldpilot_session: [] }];
}

function addCsrfHeader(operation: OperationObject, method: string) {
  if (!unsafeMethods.has(method)) return;
  const parameters = operation.parameters ?? [];
  if (
    parameters.some(
      (parameter) =>
        isParameter(parameter) &&
        parameter.name.toLowerCase() === 'x-csrf-token',
    )
  )
    return;
  operation.parameters = [
    ...parameters,
    {
      name: 'x-csrf-token',
      in: 'header',
      required: true,
      description:
        'Double-submit CSRF token from GET /api/v1/auth/csrf and the fieldpilot_csrf cookie.',
      schema: { type: 'string' },
    },
  ];
}

function describeParameters(operation: OperationObject) {
  operation.parameters = operation.parameters?.map((parameter) => {
    if (!isParameter(parameter)) return parameter;
    const copy: ParameterObject = { ...parameter };
    copy.description ||= parameterDescription(copy.name);
    copy.schema = copy.schema ?? { type: 'string' };
    if (
      typeof copy.name === 'string' &&
      copy.name.endsWith('Id') &&
      'schema' in copy &&
      copy.schema &&
      !('$ref' in copy.schema)
    ) {
      copy.schema.format ??= 'uuid';
    }
    return copy;
  });
}

function isParameter(
  parameter: ParameterObject | ReferenceObject,
): parameter is ParameterObject {
  return 'name' in parameter;
}

function parameterDescription(name: string) {
  return (
    {
      assetId: 'Asset UUID.',
      conflictId: 'Sync conflict UUID.',
      deviceId: 'Device UUID.',
      mediaId: 'Media object UUID.',
      membershipId: 'Membership UUID.',
      notificationId: 'Notification UUID.',
      organizationId: 'Organization UUID tenant scope.',
      otherVersionId: 'Comparison form-version UUID.',
      projectId: 'Project UUID.',
      qrCode: 'Asset QR code.',
      reportId: 'Daily report UUID.',
      sessionId: 'Session or upload-session UUID.',
      siteId: 'Site UUID.',
      templateId: 'Form-template UUID.',
      versionId: 'Form-version UUID.',
      workOrderId: 'Work-order UUID.',
    }[name] ?? humanize(name)
  );
}

function problemDetailsSchema(): SchemaObject {
  return {
    type: 'object',
    required: ['type', 'title', 'status', 'code', 'detail', 'instance'],
    properties: {
      type: {
        type: 'string',
        format: 'uri',
        example: 'https://fieldpilot.dev/problems/validation-error',
      },
      title: { type: 'string', example: 'BAD_REQUEST' },
      status: { type: 'integer', example: 400 },
      code: { type: 'string', example: 'VALIDATION_ERROR' },
      detail: { type: 'string', example: 'Request failed.' },
      instance: { type: 'string', example: '/api/v1/organizations' },
      requestId: { type: 'string', example: '019f7653-09e4-73ec-ac65' },
    },
  };
}

function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase();
}
