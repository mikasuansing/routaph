import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  notificationsSupported,
  notificationPermission,
  requestNotificationPermission,
  notifyApproachingStop,
} from '../notify';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notify (no browser Notification/vibrate support — Node test env)', () => {
  it('reports unsupported and never throws', () => {
    expect(notificationsSupported()).toBe(false);
    expect(notificationPermission()).toBe('unsupported');
  });

  it('requestNotificationPermission resolves to unsupported', async () => {
    expect(await requestNotificationPermission()).toBe('unsupported');
  });

  it('notifyApproachingStop is a safe no-op', () => {
    expect(() => notifyApproachingStop('Cubao (MRT)', 'MRT')).not.toThrow();
  });
});

describe('notify (Notification + vibrate present)', () => {
  it('fires a Notification when permission is granted', () => {
    const NotificationMock = vi.fn();
    (NotificationMock as unknown as { permission: string }).permission = 'granted';
    vi.stubGlobal('Notification', NotificationMock);

    expect(notificationsSupported()).toBe(true);
    expect(notificationPermission()).toBe('granted');

    notifyApproachingStop('Guadalupe', 'MRT');
    expect(NotificationMock).toHaveBeenCalledWith(
      'Next stop approaching',
      expect.objectContaining({ body: expect.stringContaining('Guadalupe') }),
    );
  });

  it('does not fire a Notification when permission is denied', () => {
    const NotificationMock = vi.fn();
    (NotificationMock as unknown as { permission: string }).permission = 'denied';
    vi.stubGlobal('Notification', NotificationMock);

    notifyApproachingStop('Guadalupe', 'MRT');
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it('calls navigator.vibrate regardless of Notification permission', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    notifyApproachingStop('Ayala', 'MRT');
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
  });

  it('requestNotificationPermission calls Notification.requestPermission', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    expect(await requestNotificationPermission()).toBe('granted');
    expect(requestPermission).toHaveBeenCalled();
  });
});
