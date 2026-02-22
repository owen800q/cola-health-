// Web Push helper utilities
// In production, implement actual VAPID signing and push message sending
// For now, this provides the structure for push notification management

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
}

export function createPushPayload(type: string, message: string): PushPayload {
  const titles: Record<string, string> = {
    feed: '餵奶提醒',
    diaper: '換片提醒',
    vaccine: '疫苗提醒',
    awake_time: '清醒時間提醒',
  };

  return {
    title: titles[type] || '可樂仔健康記錄',
    body: message,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { type, url: '/' },
  };
}
