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
    getBaby: () => request('/baby'),
    updateBaby: (data) => request('/baby', { method: 'PUT', body: data }),
    uploadAvatar: (data) => request('/baby/avatar', { method: 'POST', body: data }),
    initBaby: () => request('/baby/init', { method: 'POST', body: {} }),

    // ---- Feeds ----
    getFeeds: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/feeds?' + q);
    },
    createFeed: (data) => request('/feeds', { method: 'POST', body: data }),
    updateFeed: (id, data) => request('/feeds/' + id, { method: 'PUT', body: data }),
    deleteFeed: (id) => request('/feeds/' + id, { method: 'DELETE' }),

    // ---- Diapers ----
    getDiapers: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/diapers?' + q);
    },
    createDiaper: (data) => request('/diapers', { method: 'POST', body: data }),
    updateDiaper: (id, data) => request('/diapers/' + id, { method: 'PUT', body: data }),
    deleteDiaper: (id) => request('/diapers/' + id, { method: 'DELETE' }),

    // ---- Sleeps ----
    getSleeps: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/sleeps?' + q);
    },
    createSleep: (data) => request('/sleeps', { method: 'POST', body: data }),
    updateSleep: (id, data) => request('/sleeps/' + id, { method: 'PUT', body: data }),
    deleteSleep: (id) => request('/sleeps/' + id, { method: 'DELETE' }),

    // ---- Growth ----
    getGrowth: (babyId) => {
      const q = new URLSearchParams({ baby_id: babyId }).toString();
      return request('/growth?' + q);
    },
    createGrowth: (data) => request('/growth', { method: 'POST', body: data }),
    updateGrowth: (id, data) => request('/growth/' + id, { method: 'PUT', body: data }),
    deleteGrowth: (id) => request('/growth/' + id, { method: 'DELETE' }),
    getGrowthReference: (gender) => request('/growth/reference?gender=' + encodeURIComponent(gender || 'M')),

    // ---- Vaccines ----
    getVaccines: (babyId) => {
      const q = new URLSearchParams({ baby_id: babyId }).toString();
      return request('/vaccines?' + q);
    },
    markVaccine: (id, data) => request('/vaccines/' + id, { method: 'PUT', body: data }),

    // ---- Temperatures ----
    getTemperatures: (babyId, params) => {
      const q = new URLSearchParams({ baby_id: babyId, ...params }).toString();
      return request('/temperatures?' + q);
    },
    createTemperature: (data) => request('/temperatures', { method: 'POST', body: data }),
    updateTemperature: (id, data) => request('/temperatures/' + id, { method: 'PUT', body: data }),
    deleteTemperature: (id) => request('/temperatures/' + id, { method: 'DELETE' }),

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

    // ---- Bottles (assembly) ----
    getBottles: () => request('/bottles'),
    createBottle: (data) => request('/bottles', { method: 'POST', body: data }),
    deleteBottle: (id) => request('/bottles/' + id, { method: 'DELETE' }),
    addBottlePhoto: (slotId, data) => request('/bottles/' + slotId + '/photos', { method: 'POST', body: data }),
    deleteBottlePhoto: (slotId, photoId) => request('/bottles/' + slotId + '/photos/' + photoId, { method: 'DELETE' }),

    // ---- Milestones (里程碑) ----
    getMilestones: () => request('/milestones'),
    createMilestone: (data) => request('/milestones', { method: 'POST', body: data }),
    updateMilestone: (id, data) => request('/milestones/' + id, { method: 'PUT', body: data }),
    deleteMilestone: (id) => request('/milestones/' + id, { method: 'DELETE' }),

    // ---- Baby Care Rooms ----
    getBabyRooms: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('/babyrooms' + (q ? '?' + q : ''));
    },
    getBabyRoomDistricts: () => request('/babyrooms/districts'),
    refreshBabyRooms: () => request('/babyrooms/refresh', { method: 'POST' }),

    // ---- AI Chat (streaming) ----
    chatAI: async function (message, history, image, dayRange, provider, onChunk, onDone, onError) {
      try {
        var payload = { message: message, history: history, image: image || null, provider: provider || 'google' };
        if (dayRange) { payload.from = dayRange.from; payload.to = dayRange.to; }
        var res = await fetch(BASE + '/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          var errData = await res.json().catch(function () { return { error: res.statusText }; });
          if (onError) onError(errData.error || '請求失敗');
          return;
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].trim();
            if (!trimmed || trimmed.indexOf('data: ') !== 0) continue;
            var data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              var parsed = JSON.parse(data);
              if (parsed.response) onChunk(parsed.response);
            } catch (e) { /* skip non-JSON */ }
          }
        }
        if (onDone) onDone();
      } catch (e) {
        if (onError) onError('網絡錯誤，請稍後再試');
      }
    },
  };
})();
