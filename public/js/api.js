/**
 * API Client for Baby Tracker
 * Provides methods to interact with the Cloudflare Worker API
 */
(function () {
  const BASE = '/api';

  async function request(path, options = {}) {
    const url = BASE + path;
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };
    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }
    const res = await fetch(url, config);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  window.API = {
    // ---- Baby ----
    getBabies: () => request('/baby'),
    getBaby: (id) => request('/baby/' + id),
    createBaby: (data) => request('/baby', { method: 'POST', body: data }),
    updateBaby: (id, data) => request('/baby/' + id, { method: 'PUT', body: data }),

    // ---- Feeds ----
    getFeeds: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/feeds?' + q);
    },
    createFeed: (data) => request('/feeds', { method: 'POST', body: data }),
    deleteFeed: (id) => request('/feeds/' + id, { method: 'DELETE' }),

    // ---- Diapers ----
    getDiapers: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/diapers?' + q);
    },
    createDiaper: (data) => request('/diapers', { method: 'POST', body: data }),
    deleteDiaper: (id) => request('/diapers/' + id, { method: 'DELETE' }),

    // ---- Sleeps ----
    getSleeps: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/sleeps?' + q);
    },
    createSleep: (data) => request('/sleeps', { method: 'POST', body: data }),
    deleteSleep: (id) => request('/sleeps/' + id, { method: 'DELETE' }),

    // ---- Growth ----
    getGrowth: (babyId) => {
      const q = new URLSearchParams({ baby_id: babyId }).toString();
      return request('/growth?' + q);
    },
    createGrowth: (data) => request('/growth', { method: 'POST', body: data }),
    deleteGrowth: (id) => request('/growth/' + id, { method: 'DELETE' }),

    // ---- Vaccines ----
    getVaccines: (babyId) => {
      const q = new URLSearchParams({ baby_id: babyId }).toString();
      return request('/vaccines?' + q);
    },
    markVaccine: (id, data) => request('/vaccines/' + id, { method: 'PUT', body: data }),

    // ---- Timeline ----
    getTimeline: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/timeline?' + q);
    },

    // ---- Stats ----
    getStats: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/stats?' + q);
    },

    // ---- Reminders ----
    getReminders: (babyId) => {
      const q = new URLSearchParams({ baby_id: babyId }).toString();
      return request('/reminders?' + q);
    },
    createReminder: (data) => request('/reminders', { method: 'POST', body: data }),
    updateReminder: (id, data) => request('/reminders/' + id, { method: 'PUT', body: data }),
    deleteReminder: (id) => request('/reminders/' + id, { method: 'DELETE' }),

    // ---- Export ----
    exportCSV: (babyId) => request('/export/csv?baby_id=' + babyId),
    exportPDF: (babyId) => request('/export/pdf?baby_id=' + babyId),
  };
})();
