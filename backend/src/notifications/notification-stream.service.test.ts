import { describe, expect, it } from 'vitest';
import { formatSse } from './notification-stream.service';

describe('notification SSE', () => {
  it('emits replayable event IDs and valid data frames', () => {
    expect(formatSse('notification', { title: 'Assigned' }, 'event-id')).toBe(
      'id: event-id\nevent: notification\ndata: {"title":"Assigned"}\n\n',
    );
  });
});
