/* ============================================================
 * Baby Tracker – Vue 3 SPA (Prototype-matched UI)
 * ============================================================ */
const { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, createApp } = Vue;

/* ---------- helpers ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
}
function fmtTime(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function fmtDateCN(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  const days = ['日','一','二','三','四','五','六'];
  return (d.getMonth()+1) + '月' + d.getDate() + '日（' + days[d.getDay()] + '）';
}
function calcAge(birthday) {
  if (!birthday) return '';
  const birth = new Date(birthday);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  let days = now.getDate() - birth.getDate();
  if (days < 0) { months--; days += 30; }
  if (months >= 12) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return y + '歲' + (m ? m + '個月' : '');
  }
  if (months > 0) return months + '個月' + (days > 0 ? days + '日' : '');
  return Math.max(days, 0) + '天';
}
function calcDaysSinceBirth(birthday) {
  if (!birthday) return 0;
  const birth = new Date(birthday);
  const now = new Date();
  return Math.floor((now - birth) / (86400000));
}
function nowISO() { return new Date().toISOString(); }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function fmtBirthday(birthday) {
  if (!birthday) return '';
  const d = new Date(birthday);
  return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
}
function fmtDurCN(seconds) {
  if (!seconds || seconds < 60) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return h + '小時' + (m > 0 ? m + '分鐘' : '');
  return m + '分鐘';
}

/* ---------- Simple store ---------- */
const store = reactive({
  baby: null,
  babyId: localStorage.getItem('currentBabyId') || null,
});

async function loadBaby() {
  try {
    const baby = await API.getBaby();
    if (baby && baby.id) {
      store.baby = baby;
      store.babyId = baby.id;
      localStorage.setItem('currentBabyId', store.babyId);
    }
  } catch (e) {
    console.warn('Failed to load baby:', e);
  }
}

/* ---------- Toast ---------- */
function showToast(msg) {
  const d = document.createElement('div');
  d.innerHTML = '<div class="toast"><svg viewBox="0 0 24 24" style="width:40px;height:40px;display:block;margin:0 auto 8px;"><circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="1.8"/><polyline points="9,12 11.5,14.5 16,9.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="tm">' + msg + '</span></div>';
  document.body.appendChild(d);
  setTimeout(function () { if (d.parentNode) document.body.removeChild(d); }, 1500);
}

let _loadingEl = null;
function showLoading(msg) {
  hideLoading();
  const d = document.createElement('div');
  d.innerHTML = '<div class="toast"><div class="spinner" style="width:36px;height:36px;margin:0 auto 10px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;"></div><span class="tm">' + (msg || '處理中...') + '</span></div>';
  document.body.appendChild(d);
  _loadingEl = d;
}
function hideLoading() {
  if (_loadingEl && _loadingEl.parentNode) {
    _loadingEl.parentNode.removeChild(_loadingEl);
  }
  _loadingEl = null;
}

/* ---------- Push helpers ---------- */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/* ============================================================
 * VUE APP
 * ============================================================ */
const app = createApp({
  setup() {
    // Navigation state
    const currentPage = ref(0);
    const activeSub = ref(null);

    // Data state
    const baby = computed(() => store.baby);
    const babyName = computed(() => baby.value?.name || '可樂仔');
    const babyAge = computed(() => calcAge(baby.value?.birth_date));
    const babyBirthday = computed(() => fmtBirthday(baby.value?.birth_date));
    const daysSinceBirth = computed(() => calcDaysSinceBirth(baby.value?.birth_date));

    // Home page stats
    const homeStats = reactive({
      feedTotal: 0, feedCount: 0,
      diaperWet: 0, diaperDirty: 0, diaperTotal: 0,
      sleepHours: 0, sleepCount: 0, sleepLongest: 0,
    });
    const recentItems = ref([]);

    // Global saving lock
    const saving = ref(false);

    // Edit state
    const editingId = ref(null);
    const editingType = ref(null); // 'feed', 'diaper', 'sleep'

    // Feed page
    const feedHistory = ref([]);
    const feedAmount = ref(parseInt(localStorage.getItem('lastFeedAmount')) || 60);
    const feedType = ref('formula');
    const feedTime = ref('');
    const feedNotes = ref('');

    // Diaper page
    const diaperHistory = ref([]);
    const diaperType = ref('pee');
    const diaperTime = ref('');
    const diaperColor = ref('黃色（正常）');
    const diaperConsistency = ref('稀軟');
    const diaperAmount = ref('少量');
    const diaperNotes = ref('');

    // Sleep page
    const sleepHistory = ref([]);
    const isSleeping = ref(false);
    const sleepSeconds = ref(0);
    const sleepStartISO = ref(null);
    let sleepTimer = null;
    const manualSleepStart = ref('');
    const manualSleepEnd = ref('');
    const sleepQuality = ref('好 · 瞓得穩');
    const sleepNotes = ref('');

    // Vaccine page
    const vaccines = ref([]);
    const vaccineGroups = computed(() => {
      const groups = [];
      const labels = { 0: '初生', 1: '一個月', 2: '兩個月', 4: '四個月', 6: '六個月', 12: '一歲', 18: '一歲半', 48: '小學一年級' };
      const monthMap = {};
      if (!store.baby?.birth_date) return groups;
      const bd = new Date(store.baby.birth_date);
      for (const v of vaccines.value) {
        const sd = new Date(v.scheduled_date);
        let diffMonths = (sd.getFullYear() - bd.getFullYear()) * 12 + (sd.getMonth() - bd.getMonth());
        if (diffMonths < 0) diffMonths = 0;
        // Snap to nearest milestone
        const milestones = [0, 1, 2, 4, 6, 12, 18, 48];
        let best = 0;
        for (const m of milestones) { if (Math.abs(diffMonths - m) <= Math.abs(diffMonths - best)) best = m; }
        if (!monthMap[best]) { monthMap[best] = { label: labels[best] || best + '個月', items: [] }; groups.push(monthMap[best]); }
        monthMap[best].items.push(v);
      }
      return groups;
    });

    async function loadVaccines() {
      try { vaccines.value = await API.getVaccines(store.babyId) || []; } catch (e) { console.warn('Load vaccines:', e); }
    }

    function fmtVaccineDate(v) {
      const d = new Date(v.actual_date || v.scheduled_date);
      return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    function vaccineStatusCls(v) {
      if (v.status === 'done') return 'tg-g';
      if (v.status === 'overdue') return 'tg-r';
      return 'tg-o';
    }

    function vaccineStatusText(v) {
      if (v.status === 'done') return '已完成';
      if (v.status === 'overdue') return '已過期';
      return '待接種';
    }

    function vaccineIcon(v) {
      if (v.status === 'done') return '#i-check';
      if (v.status === 'overdue') return '#i-alert';
      return '#i-shield';
    }

    function vaccineIconColor(v) {
      if (v.status === 'done') return 'color:var(--green)';
      if (v.status === 'overdue') return 'color:var(--red)';
      return 'color:var(--t3)';
    }

    function vaccineDesc(v) {
      if (v.status === 'done') return '已接種 · ' + fmtVaccineDate(v) + (v.location ? ' · ' + v.location : '');
      return '建議：' + fmtVaccineDate(v);
    }

    function vaccineName(v) {
      let name = v.name;
      if (v.dose) name += ' — ' + v.dose;
      return name;
    }

    // ===== BOTTLE ASSEMBLY =====
    const bottleSlots = ref([]);
    const bottlePhotoZoom = ref(null);

    async function loadBottleSlots() {
      try { bottleSlots.value = await API.getBottles(); }
      catch (e) { console.warn('Load bottles:', e); bottleSlots.value = []; }
    }

    async function addBottleSlot() {
      var num = bottleSlots.value.length + 1;
      try {
        var slot = await API.createBottle({ name: '奶瓶 ' + num });
        bottleSlots.value.push(slot);
      } catch (e) { showToast('新增失敗'); }
    }

    async function removeBottleSlot(id) {
      var ok = await confirmDialog('刪除奶瓶', '確定刪除此奶瓶？');
      if (!ok) return;
      try {
        await API.deleteBottle(id);
        bottleSlots.value = bottleSlots.value.filter(function (b) { return b.id !== id; });
      } catch (e) { showToast('刪除失敗'); }
    }

    function _addPhotoToSlot(bottleId, file) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var maxW = 800;
          var scale = Math.min(1, maxW / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          showLoading('上傳中...');
          API.addBottlePhoto(bottleId, { photo_data: dataUrl }).then(function (photo) {
            var slot = bottleSlots.value.find(function (b) { return b.id === bottleId; });
            if (slot) slot.photos.push(photo);
            hideLoading();
            showToast('已新增相片');
          }).catch(function () { hideLoading(); showToast('上傳失敗'); });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }

    function takeBottlePhoto(bottleId) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.capture = 'environment';
      inp.onchange = function () {
        if (inp.files[0]) _addPhotoToSlot(bottleId, inp.files[0]);
      };
      inp.click();
    }

    function pickBottlePhoto(bottleId) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = function () {
        if (inp.files[0]) _addPhotoToSlot(bottleId, inp.files[0]);
      };
      inp.click();
    }

    async function removeBottlePhoto(bottleId, photoIdx) {
      var ok = await confirmDialog('刪除相片', '確定刪除此相片？');
      if (!ok) return;
      var slot = bottleSlots.value.find(function (b) { return b.id === bottleId; });
      if (!slot) return;
      var photo = slot.photos[photoIdx];
      if (!photo) return;
      try {
        await API.deleteBottlePhoto(bottleId, photo.id);
        slot.photos.splice(photoIdx, 1);
      } catch (e) { showToast('刪除失敗'); }
    }

    function fmtTimeAgo(iso) {
      if (!iso) return '';
      var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (diff < 60) return '剛剛';
      if (diff < 3600) return Math.floor(diff / 60) + '分鐘前';
      if (diff < 86400) return Math.floor(diff / 3600) + '小時前';
      return Math.floor(diff / 86400) + '日前';
    }

    // ===== AI CHAT =====
    const chatMessages = ref([]);
    const chatInput = ref('');
    const chatImage = ref(null);
    const chatLoading = ref(false);
    const chatError = ref('');

    function sendChat() {
      var msg = chatInput.value.trim();
      if ((!msg && !chatImage.value) || chatLoading.value) return;
      if (!msg && chatImage.value) msg = '請分析這張圖片';
      chatInput.value = '';
      chatError.value = '';
      var img = chatImage.value;
      chatImage.value = null;
      chatMessages.value.push({ role: 'user', content: msg, image: img || null });
      chatMessages.value.push({ role: 'assistant', content: '' });
      chatLoading.value = true;
      var aidx = chatMessages.value.length - 1;
      var history = chatMessages.value.slice(0, -2).map(function (m) {
        return { role: m.role, content: m.content };
      });
      API.chatAI(
        msg, history, img,
        function onChunk(token) {
          chatMessages.value[aidx].content += token;
          nextTick(function () {
            var el = document.getElementById('chat-scroll');
            if (el) el.scrollTop = el.scrollHeight;
          });
        },
        function onDone() { chatLoading.value = false; },
        function onError(err) {
          chatLoading.value = false;
          chatError.value = err;
          if (chatMessages.value[aidx] && chatMessages.value[aidx].content === '') {
            chatMessages.value.splice(aidx, 1);
          }
        }
      );
      nextTick(function () {
        var el = document.getElementById('chat-scroll');
        if (el) el.scrollTop = el.scrollHeight;
      });
    }

    function pickChatImage() {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = function () {
        if (!inp.files[0]) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          var img = new Image();
          img.onload = function () {
            var canvas = document.createElement('canvas');
            var maxW = 800;
            var scale = Math.min(1, maxW / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            chatImage.value = canvas.toDataURL('image/jpeg', 0.7);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(inp.files[0]);
      };
      inp.click();
    }

    function clearChatImage() { chatImage.value = null; }

    function clearChat() {
      chatMessages.value = [];
      chatError.value = '';
      chatImage.value = null;
      chatInput.value = '';
    }

    // Settings / Profile
    const profileForm = reactive({
      name: '', gender: '男', birthday: '',
      birth_weight: '', birth_height: '', blood_type: '',
    });

    // Avatar
    const avatarUrl = ref(localStorage.getItem('babyAvatar') || '');
    function pickAvatar() {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = function () {
        const file = inp.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          // Resize to keep localStorage small
          const img = new Image();
          img.onload = function () {
            const canvas = document.createElement('canvas');
            const size = 200;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2;
            const sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            avatarUrl.value = dataUrl;
            localStorage.setItem('babyAvatar', dataUrl);
            // Sync avatar to cloud
            API.uploadAvatar({ avatar_url: dataUrl }).catch(function (e) {
              console.warn('Failed to sync avatar to cloud:', e);
            });
            showToast('頭像已更換');
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      };
      inp.click();
    }

    // Confirm dialog
    const dlgVisible = ref(false);
    const dlgTitle = ref('');
    const dlgMsg = ref('');
    let dlgResolve = null;

    function confirmDialog(title, msg) {
      dlgTitle.value = title;
      dlgMsg.value = msg;
      dlgVisible.value = true;
      return new Promise((resolve) => { dlgResolve = resolve; });
    }
    function dlgConfirm() { dlgVisible.value = false; if (dlgResolve) dlgResolve(true); dlgResolve = null; }
    function dlgCancel() { dlgVisible.value = false; if (dlgResolve) dlgResolve(false); dlgResolve = null; }

    // Navigation
    function go(i) { currentPage.value = i; }
    function openSub(name) {
      // Reset editing state if NOT triggered by editFeed/editDiaper/editSleep
      if (!editingId.value) {
        editingType.value = null;
      }
      activeSub.value = name;
      if (name === 'he') loadVaccines();
    }
    function closeSub() {
      activeSub.value = null;
      editingId.value = null;
      editingType.value = null;
    }

    // ===== DATA LOADING =====
    async function loadHomeData() {
      if (!store.babyId) return;
      try {
        const range = localDayRange();
        const [feeds, diapers, sleeps, timeline] = await Promise.all([
          API.getFeeds(store.babyId, range),
          API.getDiapers(store.babyId, range),
          API.getSleeps(store.babyId, range),
          API.getTimeline(store.babyId, range),
        ]);
        homeStats.feedCount = feeds?.length || 0;
        homeStats.feedTotal = feeds?.reduce((s, f) => s + (f.amount_ml || 0), 0) || 0;
        homeStats.diaperTotal = diapers?.length || 0;
        homeStats.diaperWet = diapers?.filter(d => d.type === 'pee' || d.type === 'both').length || 0;
        homeStats.diaperDirty = diapers?.filter(d => d.type === 'poo' || d.type === 'both').length || 0;
        homeStats.sleepCount = sleeps?.length || 0;
        let totalMin = 0, longestMin = 0;
        sleeps?.forEach(sl => {
          if (sl.start_time && sl.end_time) {
            const dur = (new Date(sl.end_time) - new Date(sl.start_time)) / 60000;
            totalMin += dur;
            if (dur > longestMin) longestMin = dur;
          }
        });
        homeStats.sleepHours = (totalMin / 60).toFixed(1);
        homeStats.sleepLongest = longestMin;
        // Build recent items
        recentItems.value = (timeline || []).slice(0, 8).map(e => {
          let icon = 'milk', cls = 'milk', title = '', detail = '', vol = '';
          if (e.record_type === 'feed') {
            icon = 'i-milk'; cls = 'milk';
            title = '配方奶';
            detail = e.note || '';
            vol = e.amount_ml ? e.amount_ml + 'ml' : '';
          } else if (e.record_type === 'diaper') {
            const dt = e.type;
            if (dt === 'poo' || dt === 'both') { icon = 'i-poo'; cls = 'poo'; title = dt === 'both' ? '大便 + 小便' : '大便'; }
            else { icon = 'i-drop'; cls = 'pee'; title = '小便'; }
            detail = e.note || (e.color ? e.color : '');
          } else if (e.record_type === 'sleep') {
            if (e.end_time) {
              icon = 'i-sun'; cls = 'slp'; title = '醒咗';
              const dur = Math.floor((new Date(e.end_time) - new Date(e.time)) / 1000);
              detail = dur > 60 ? '瞓咗 ' + fmtDurCN(dur) : '';
            } else { icon = 'i-moon'; cls = 'slp'; title = '瞓著咗'; }
          }
          return { id: e.id, type: e.record_type, icon, cls, title, detail, vol, time: fmtTime(e.time), raw: e };
        });
      } catch (e) { console.warn('Home load error:', e); }
    }

    function localDayRange() {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
      return { from: dayStart.toISOString(), to: dayEnd.toISOString() };
    }

    async function loadFeedHistory() {
      try { feedHistory.value = await API.getFeeds(store.babyId, viewDayRange()) || []; } catch (e) { console.warn(e); }
    }
    async function loadDiaperHistory() {
      try { diaperHistory.value = await API.getDiapers(store.babyId, viewDayRange()) || []; } catch (e) { console.warn(e); }
    }
    async function loadSleepHistory() {
      try { sleepHistory.value = await API.getSleeps(store.babyId, viewDayRange()) || []; } catch (e) { console.warn(e); }
    }

    // ===== FEED ACTIONS =====
    function adjFeedAmount(delta) {
      feedAmount.value = Math.max(0, feedAmount.value + delta);
    }

    async function saveFeed() {
      if (feedAmount.value <= 0) return showToast('請輸入奶量');
      if (saving.value) return;
      saving.value = true;
      showLoading('儲存中...');
      try {
        const now = new Date();
        if (feedTime.value) {
          const [h, m] = feedTime.value.split(':');
          now.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        const data = {
          time: now.toISOString(),
          amount_ml: feedAmount.value,
          note: feedNotes.value || null,
        };
        if (editingId.value && editingType.value === 'feed') {
          await API.updateFeed(editingId.value, data);
        } else {
          await API.createFeed(data);
        }
        hideLoading();
        showToast(editingId.value ? '記錄已更新' : '餵奶記錄已儲存');
        localStorage.setItem('lastFeedAmount', feedAmount.value);
        feedNotes.value = '';
        editingId.value = null;
        editingType.value = null;
        closeSub();
        loadFeedHistory();
        loadHomeData();
      } catch (e) { hideLoading(); showToast('儲存失敗'); }
      finally { saving.value = false; }
    }

    async function deleteFeed(id) {
      const ok = await confirmDialog('確認刪除', '刪除後無法恢復');
      if (!ok) return;
      if (saving.value) return;
      saving.value = true;
      showLoading('刪除中...');
      try {
        await API.deleteFeed(id);
        hideLoading();
        showToast('已刪除');
        loadFeedHistory();
        loadHomeData();
      } catch (e) { hideLoading(); showToast('刪除失敗'); }
      finally { saving.value = false; }
    }

    function editTimelineItem(item) {
      if (item.type === 'feed') editFeed(item.raw);
      else if (item.type === 'diaper') editDiaper(item.raw);
      else if (item.type === 'sleep') editSleep(item.raw);
    }

    function editFeed(item) {
      editingId.value = item.id;
      editingType.value = 'feed';
      const d = new Date(item.time);
      feedTime.value = pad(d.getHours()) + ':' + pad(d.getMinutes());
      feedAmount.value = item.amount_ml || 60;
      feedNotes.value = item.note || '';
      openSub('af');
    }

    // ===== DIAPER ACTIONS =====
    function showPooFields() {
      return diaperType.value === 'poo' || diaperType.value === 'both';
    }

    async function saveDiaper() {
      if (saving.value) return;
      saving.value = true;
      showLoading('儲存中...');
      try {
        const now = new Date();
        if (diaperTime.value) {
          const [h, m] = diaperTime.value.split(':');
          now.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        const data = {
          time: now.toISOString(),
          type: diaperType.value,
          color: showPooFields() ? diaperColor.value : null,
          texture: showPooFields() ? diaperConsistency.value : null,
          amount: showPooFields() ? diaperAmount.value : null,
          note: diaperNotes.value || null,
        };
        if (editingId.value && editingType.value === 'diaper') {
          await API.updateDiaper(editingId.value, data);
        } else {
          await API.createDiaper(data);
        }
        hideLoading();
        showToast(editingId.value ? '記錄已更新' : '換片記錄已儲存');
        diaperNotes.value = '';
        editingId.value = null;
        editingType.value = null;
        closeSub();
        loadDiaperHistory();
        loadHomeData();
      } catch (e) { hideLoading(); showToast('儲存失敗'); }
      finally { saving.value = false; }
    }

    async function deleteDiaper(id) {
      const ok = await confirmDialog('確認刪除', '刪除後無法恢復');
      if (!ok) return;
      if (saving.value) return;
      saving.value = true;
      showLoading('刪除中...');
      try {
        await API.deleteDiaper(id);
        hideLoading();
        showToast('已刪除');
        loadDiaperHistory();
        loadHomeData();
      } catch (e) { hideLoading(); showToast('刪除失敗'); }
      finally { saving.value = false; }
    }

    function editDiaper(item) {
      editingId.value = item.id;
      editingType.value = 'diaper';
      const d = new Date(item.time);
      diaperTime.value = pad(d.getHours()) + ':' + pad(d.getMinutes());
      diaperType.value = item.type || 'pee';
      diaperColor.value = item.color || '黃色（正常）';
      diaperConsistency.value = item.texture || '稀軟';
      diaperAmount.value = item.amount || '少量';
      diaperNotes.value = item.note || '';
      openSub('ad');
    }

    // ===== SLEEP ACTIONS =====
    function restoreSleepTimer() {
      const saved = localStorage.getItem('sleepTimer');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.running) {
          sleepStartISO.value = data.startISO;
          isSleeping.value = true;
          sleepSeconds.value = Math.floor((Date.now() - data.startedAt) / 1000);
          sleepTimer = setInterval(() => { sleepSeconds.value++; }, 1000);
        }
      }
    }

    function toggleSleep() {
      if (saving.value) return;
      if (!isSleeping.value) {
        // Start sleeping
        isSleeping.value = true;
        sleepSeconds.value = 0;
        sleepStartISO.value = nowISO();
        localStorage.setItem('sleepTimer', JSON.stringify({
          running: true, startedAt: Date.now(), startISO: sleepStartISO.value
        }));
        sleepTimer = setInterval(() => { sleepSeconds.value++; }, 1000);
      } else {
        // Wake up
        isSleeping.value = false;
        if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null; }
        localStorage.removeItem('sleepTimer');
        if (sleepSeconds.value < 60) { sleepSeconds.value = 0; return; }
        saving.value = true;
        showLoading('儲存中...');
        API.createSleep({
          start_time: sleepStartISO.value,
          end_time: nowISO(),
          note: null,
        }).then(() => {
          hideLoading();
          showToast('睡眠記錄已儲存');
          sleepSeconds.value = 0;
          loadSleepHistory();
          loadHomeData();
        }).catch(() => { hideLoading(); showToast('儲存失敗'); })
        .finally(() => { saving.value = false; });
      }
    }

    async function saveManualSleep() {
      if (!manualSleepStart.value || !manualSleepEnd.value) {
        return showToast('請輸入入睡和醒來時間');
      }
      if (saving.value) return;
      saving.value = true;
      showLoading('儲存中...');
      try {
        // Build date from time inputs
        const today = new Date();
        const [sh, sm] = manualSleepStart.value.split(':');
        const [eh, em] = manualSleepEnd.value.split(':');
        const start = new Date(today);
        start.setHours(parseInt(sh), parseInt(sm), 0, 0);
        const end = new Date(today);
        end.setHours(parseInt(eh), parseInt(em), 0, 0);
        if (end <= start) end.setDate(end.getDate() + 1);
        const data = {
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          quality: sleepQuality.value || null,
          note: sleepNotes.value || null,
        };
        if (editingId.value && editingType.value === 'sleep') {
          await API.updateSleep(editingId.value, data);
        } else {
          await API.createSleep(data);
        }
        hideLoading();
        showToast(editingId.value ? '記錄已更新' : '睡眠記錄已儲存');
        editingId.value = null;
        editingType.value = null;
        closeSub();
        loadSleepHistory();
        loadHomeData();
      } catch (e) { hideLoading(); showToast('儲存失敗'); }
      finally { saving.value = false; }
    }

    async function deleteSleep(id) {
      const ok = await confirmDialog('確認刪除', '刪除後無法恢復');
      if (!ok) return;
      if (saving.value) return;
      saving.value = true;
      showLoading('刪除中...');
      try {
        await API.deleteSleep(id);
        hideLoading();
        showToast('已刪除');
        loadSleepHistory();
        loadHomeData();
      } catch (e) { hideLoading(); showToast('刪除失敗'); }
      finally { saving.value = false; }
    }

    function editSleep(item) {
      editingId.value = item.id;
      editingType.value = 'sleep';
      if (item.start_time) {
        const s = new Date(item.start_time);
        manualSleepStart.value = pad(s.getHours()) + ':' + pad(s.getMinutes());
      }
      if (item.end_time) {
        const e = new Date(item.end_time);
        manualSleepEnd.value = pad(e.getHours()) + ':' + pad(e.getMinutes());
      }
      sleepQuality.value = item.quality || '好 · 瞓得穩';
      sleepNotes.value = item.note || '';
      openSub('as');
    }

    // ===== PROFILE ACTIONS =====
    function loadProfile() {
      if (store.baby) {
        profileForm.name = store.baby.name || '';
        profileForm.gender = store.baby.gender === 'F' ? '女' : '男';
        profileForm.birthday = store.baby.birth_date || '';
        profileForm.birth_weight = store.baby.birth_weight || '';
        profileForm.birth_height = store.baby.birth_height || '';
      }
    }

    async function saveProfile() {
      if (!profileForm.name) return showToast('請輸入名稱');
      if (saving.value) return;
      saving.value = true;
      showLoading('儲存中...');
      try {
        const genderMap = { '男': 'M', '女': 'F' };
        const wt = parseFloat(profileForm.birth_weight);
        const ht = parseFloat(profileForm.birth_height);
        const baby = store.baby || {};
        await API.updateBaby({
          name: profileForm.name,
          birth_date: profileForm.birthday || null,
          gender: genderMap[profileForm.gender] || null,
          birth_weight: isNaN(wt) ? null : wt,
          birth_height: isNaN(ht) ? null : ht,
          blood_type: baby.blood_type ?? null,
          has_g6pd: baby.has_g6pd ?? null,
          hospital: baby.hospital ?? null,
          doctor_name: baby.doctor_name ?? null,
          doctor_phone: baby.doctor_phone ?? null,
        });
        hideLoading();
        showToast('資料已更新');
        closeSub();
        await loadBaby();
      } catch (e) { hideLoading(); console.error('saveProfile error:', e); showToast('儲存失敗'); }
      finally { saving.value = false; }
    }

    // Date nav
    const viewDate = ref(new Date());
    const viewDateStr = computed(() => fmtDateCN(viewDate.value.toISOString()));
    const isToday = computed(() => {
      const v = viewDate.value;
      const n = new Date();
      return v.getFullYear() === n.getFullYear() && v.getMonth() === n.getMonth() && v.getDate() === n.getDate();
    });

    function viewDayRange() {
      const dayStart = new Date(viewDate.value); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(viewDate.value); dayEnd.setHours(23, 59, 59, 999);
      return { from: dayStart.toISOString(), to: dayEnd.toISOString() };
    }

    function prevDay() {
      const d = new Date(viewDate.value);
      d.setDate(d.getDate() - 1);
      viewDate.value = d;
      reloadViewPage();
    }

    function nextDay() {
      const d = new Date(viewDate.value);
      d.setDate(d.getDate() + 1);
      viewDate.value = d;
      reloadViewPage();
    }

    function reloadViewPage() {
      const p = currentPage.value;
      if (p === 1) loadFeedHistory();
      else if (p === 2) loadDiaperHistory();
      else if (p === 3) loadSleepHistory();
    }

    // Feed summary computed
    const feedSummary = computed(() => {
      const items = feedHistory.value;
      const count = items.length;
      const total = items.reduce((s, f) => s + (f.amount_ml || 0), 0);
      const avg = count > 0 ? Math.round(total / count) : 0;
      return { count, total, avg };
    });

    // Diaper summary computed
    const diaperSummary = computed(() => {
      const items = diaperHistory.value;
      const wet = items.filter(d => d.type === 'pee' || d.type === 'both').length;
      const dirty = items.filter(d => d.type === 'poo' || d.type === 'both').length;
      return { wet, dirty, total: items.length };
    });

    // Sleep summary computed
    const sleepSummaryData = computed(() => {
      const items = sleepHistory.value;
      let totalMin = 0, longestMin = 0, count = 0;
      items.forEach(sl => {
        if (sl.start_time && sl.end_time) {
          count++;
          const dur = (new Date(sl.end_time) - new Date(sl.start_time)) / 60000;
          totalMin += dur;
          if (dur > longestMin) longestMin = dur;
        }
      });
      return {
        totalHours: (totalMin / 60).toFixed(1),
        longestHours: (longestMin / 60).toFixed(1),
        count,
      };
    });

    // Set default times
    function initTimes() {
      const now = new Date();
      const t = pad(now.getHours()) + ':' + pad(now.getMinutes());
      feedTime.value = t;
      diaperTime.value = t;
    }

    // Computed feed/diaper label helpers
    function feedItemType(item) {
      return '配方奶';
    }
    function diaperItemLabel(item) {
      const map = { pee: '小便', poo: '大便', both: '大便 + 小便', dry: '乾淨' };
      return map[item.type] || item.type;
    }
    function diaperItemIcon(item) {
      if (item.type === 'poo' || item.type === 'both') return 'i-poo';
      return 'i-drop';
    }
    function diaperItemCls(item) {
      if (item.type === 'poo' || item.type === 'both') return 'poo';
      return 'pee';
    }
    function diaperItemDetail(item) {
      const parts = [];
      if (item.color) parts.push(item.color);
      if (item.texture) parts.push(item.texture);
      if (item.note) parts.push(item.note);
      return parts.join('、') || '';
    }

    // ===== SWIPE TO DELETE =====
    let swX0 = 0;
    function swStart(e) {
      swX0 = e.touches[0].clientX;
      const el = e.currentTarget;
      el.classList.add('swiping');
      document.querySelectorAll('.sw-c.open').forEach(o => { if (o !== el) { o.style.transform = ''; o.classList.remove('open'); } });
    }
    function swMove(e) {
      const dx = e.touches[0].clientX - swX0;
      if (dx < 0) e.currentTarget.style.transform = 'translateX(' + Math.max(dx, -80) + 'px)';
    }
    function swEnd(e) {
      const el = e.currentTarget;
      el.classList.remove('swiping');
      const dx = e.changedTouches[0].clientX - swX0;
      if (dx < -40) { el.style.transform = 'translateX(-80px)'; el.classList.add('open'); }
      else { el.style.transform = ''; el.classList.remove('open'); }
    }

    // ===== SWIPE BACK GESTURE =====
    let sbX0 = 0, sbY0 = 0, sbState = 'idle', sbEl = null;
    // sbState: 'idle' | 'pending' | 'swiping'
    function subSwipeStart(e) {
      const t = e.touches[0];
      sbX0 = t.clientX;
      sbY0 = t.clientY;
      sbEl = e.currentTarget;
      // Start from left 1/3 of screen
      sbState = t.clientX < window.innerWidth / 3 ? 'pending' : 'idle';
    }
    function subSwipeMove(e) {
      if (sbState === 'idle' || !sbEl) return;
      const t = e.touches[0];
      const dx = t.clientX - sbX0;
      const dy = Math.abs(t.clientY - sbY0);
      if (sbState === 'pending') {
        // Decide: horizontal or vertical?
        if (dx > 8 && dx > dy * 1.2) {
          sbState = 'swiping';
        } else if (dy > 8) {
          sbState = 'idle';
          return;
        } else {
          return; // not enough movement yet
        }
      }
      // sbState === 'swiping'
      if (dx > 0) {
        e.preventDefault();
        sbEl.style.transition = 'none';
        sbEl.style.transform = 'translateX(' + dx + 'px)';
      }
    }
    function subSwipeEnd(e) {
      if (sbState !== 'swiping' || !sbEl) { sbState = 'idle'; return; }
      const dx = e.changedTouches[0].clientX - sbX0;
      const vw = window.innerWidth;
      if (dx > vw * 0.2) {
        sbEl.style.transition = 'transform 0.2s ease';
        sbEl.style.transform = 'translateX(100%)';
        setTimeout(() => {
          closeSub();
          if (sbEl) { sbEl.style.transform = ''; sbEl.style.transition = ''; }
        }, 200);
      } else {
        sbEl.style.transition = 'transform 0.2s ease';
        sbEl.style.transform = '';
        setTimeout(() => { if (sbEl) sbEl.style.transition = ''; }, 200);
      }
      sbState = 'idle';
    }

    // ===== REMINDERS =====
    const reminders = reactive({ feed: { enabled: true, interval_minutes: 180, id: 1 }, diaper: { enabled: false, interval_minutes: 180, id: 2 }, vaccine: { enabled: true, advance_days: 7, id: 3 }, awake_time: { enabled: false, max_awake_minutes: 60, id: 4 } });

    async function loadReminders() {
      try {
        const resp = await fetch('/api/reminders');
        const data = await resp.json();
        for (const r of data) {
          if (reminders[r.type]) {
            reminders[r.type].enabled = !!r.enabled;
            reminders[r.type].id = r.id;
            if (r.interval_minutes) reminders[r.type].interval_minutes = r.interval_minutes;
            if (r.advance_days) reminders[r.type].advance_days = r.advance_days;
            if (r.max_awake_minutes) reminders[r.type].max_awake_minutes = r.max_awake_minutes;
          }
        }
      } catch (e) { console.warn('Load reminders:', e); }
    }

    async function toggleReminder(type) {
      const r = reminders[type];
      try {
        await fetch('/api/reminders/' + r.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: r.enabled ? 1 : 0 }) });
      } catch (e) { console.warn('Toggle reminder:', e); }
    }

    async function updateReminderInterval(type, minutes) {
      const r = reminders[type];
      r.interval_minutes = minutes;
      try {
        await fetch('/api/reminders/' + r.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interval_minutes: minutes }) });
      } catch (e) { console.warn('Update interval:', e); }
    }

    // ===== PUSH NOTIFICATIONS =====
    const pushEnabled = ref(false);

    async function setupPush() {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) { pushEnabled.value = true; return; }

        const perm = Notification.permission;
        if (perm === 'denied') return;
        if (perm === 'default') return; // Wait for user to click the enable button
        // If 'granted', subscribe
        await subscribePush(reg);
      } catch (e) { console.warn('Push setup:', e); }
    }

    async function subscribePush(reg) {
      try {
        const resp = await fetch('/api/push/vapid-key');
        const { publicKey } = await resp.json();
        if (!publicKey) return;

        const vapidKey = urlBase64ToUint8Array(publicKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
        pushEnabled.value = true;
      } catch (e) { console.warn('Push subscribe:', e); }
    }

    async function enablePush() {
      if (!window.isSecureContext) { showToast('推送通知需要 HTTPS 安全連線'); return; }
      if (!('Notification' in window)) { showToast('此瀏覽器不支援通知'); return; }
      if (!('PushManager' in window)) { showToast('此瀏覽器不支援推送'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { showToast('通知權限被拒絕'); return; }
      const reg = await navigator.serviceWorker.ready;
      await subscribePush(reg);
      if (pushEnabled.value) showToast('推送通知已開啟');
    }

    async function testPush() {
      if (!pushEnabled.value) {
        await enablePush();
        if (!pushEnabled.value) return;
      }
      try {
        const resp = await fetch('/api/push/test', { method: 'POST' });
        const data = await resp.json();
        if (data.ok) showToast('測試通知已發送');
        else showToast(data.error || '發送失敗');
      } catch { showToast('發送失敗'); }
    }

    async function checkReminders() {
      if (!pushEnabled.value) {
        await enablePush();
        if (!pushEnabled.value) return;
      }
      try {
        showToast('正在檢查提醒...');
        const resp = await fetch('/api/push/check-reminders', { method: 'POST' });
        const data = await resp.json();
        if (data.ok) showToast('提醒檢查完成');
        else showToast(data.error || '檢查失敗');
      } catch { showToast('檢查失敗'); }
    }

    // ===== LIFECYCLE =====
    onMounted(async () => {
      await loadBaby();
      // Load avatar from cloud if not cached locally
      if (!avatarUrl.value && store.baby && store.baby.avatar_url) {
        avatarUrl.value = store.baby.avatar_url;
        localStorage.setItem('babyAvatar', store.baby.avatar_url);
      }
      loadProfile();
      initTimes();
      loadHomeData();
      loadFeedHistory();
      loadDiaperHistory();
      loadSleepHistory();
      restoreSleepTimer();
      setupPush();
      loadReminders();
    });

    onUnmounted(() => {
      if (sleepTimer) clearInterval(sleepTimer);
    });

    // Watch page changes to refresh data
    watch(currentPage, (p) => {
      if (p === 0) loadHomeData();
      if (p === 1) loadFeedHistory();
      if (p === 2) loadDiaperHistory();
      if (p === 3) loadSleepHistory();
    });

    return {
      // Nav
      currentPage, activeSub, go, openSub, closeSub,
      // Baby
      baby, babyName, babyAge, babyBirthday, daysSinceBirth, avatarUrl, pickAvatar,
      // Home
      homeStats, recentItems, viewDateStr, prevDay, nextDay,
      // Edit
      editingId, editingType, editFeed, editDiaper, editSleep, editTimelineItem, saving,
      // Feed
      feedHistory, feedAmount, feedType, feedTime, feedNotes,
      adjFeedAmount, saveFeed, deleteFeed, feedSummary, feedItemType,
      // Diaper
      diaperHistory, diaperType, diaperTime, diaperColor, diaperConsistency,
      diaperAmount, diaperNotes, showPooFields, saveDiaper, deleteDiaper,
      diaperSummary, diaperItemLabel, diaperItemIcon, diaperItemCls, diaperItemDetail,
      // Sleep
      sleepHistory, isSleeping, sleepSeconds, sleepStartISO,
      toggleSleep, saveManualSleep, deleteSleep,
      manualSleepStart, manualSleepEnd, sleepQuality, sleepNotes,
      sleepSummaryData,
      // Vaccines
      vaccines, vaccineGroups, vaccineDesc, vaccineName, vaccineStatusCls, vaccineStatusText, vaccineIcon, vaccineIconColor,
      // Bottle Assembly
      bottleSlots, bottlePhotoZoom, loadBottleSlots, addBottleSlot, removeBottleSlot,
      takeBottlePhoto, pickBottlePhoto, removeBottlePhoto, fmtTimeAgo,
      // AI Chat
      chatMessages, chatInput, chatImage, chatLoading, chatError,
      sendChat, pickChatImage, clearChatImage, clearChat,
      // Profile
      profileForm, saveProfile, loadProfile,
      // Dialog
      dlgVisible, dlgTitle, dlgMsg, dlgConfirm, dlgCancel,
      // Swipe
      swStart, swMove, swEnd,
      subSwipeStart, subSwipeMove, subSwipeEnd,
      // Helpers
      fmtTime, fmtDate, fmtDuration, fmtDurCN, showToast, initTimes,
      // Reminders
      reminders, toggleReminder, updateReminderInterval,
      // Push
      pushEnabled, enablePush, testPush, checkReminders,
    };
  },
  template: `
  <!-- Confirm Dialog -->
  <div class="dlg-overlay" v-if="dlgVisible" @click.self="dlgCancel">
    <div class="dlg-box">
      <div class="dlg-body">
        <div class="dlg-title">{{ dlgTitle }}</div>
        <div class="dlg-msg">{{ dlgMsg }}</div>
      </div>
      <div class="dlg-actions">
        <button @click="dlgCancel">取消</button>
        <button @click="dlgConfirm">確認</button>
      </div>
    </div>
  </div>

  <!-- ===== HOME ===== -->
  <div class="page" :class="{active: currentPage === 0}">
    <div class="hero">
      <div class="av" @click="pickAvatar"><img v-if="avatarUrl" :src="avatarUrl"><svg v-else><use href="#i-baby"/></svg></div>
      <div class="inf">
        <h2>{{ babyName }}</h2>
        <p>出生 {{ daysSinceBirth }} 天 · {{ babyBirthday }}</p>
      </div>
      <div class="set-btn" @click="go(4)"><svg><use href="#i-gear"/></svg></div>
    </div>
    <div class="sc">
      <div class="si" @click="go(1)"><span class="sn">{{ homeStats.feedTotal }}</span><span class="sl">今日奶量(ml)</span></div>
      <div class="si" @click="go(1)"><span class="sn">{{ homeStats.feedCount }}</span><span class="sl">餵奶次數</span></div>
      <div class="si" @click="go(2)"><span class="sn">{{ homeStats.diaperWet }}</span><span class="sl">小便</span></div>
      <div class="si" @click="go(3)"><span class="sn">{{ homeStats.sleepHours }}h</span><span class="sl">今日睡眠</span></div>
    </div>
    <div class="gd">
      <div class="gi" @click="openSub('af'); initTimes()"><div class="gi-ico" style="color:var(--blue)"><svg><use href="#i-plus"/></svg></div><span>記錄飲奶</span></div>
      <div class="gi" @click="openSub('ad'); initTimes()"><div class="gi-ico" style="color:var(--green)"><svg><use href="#i-edit"/></svg></div><span>記錄換片</span></div>
      <div class="gi" @click="openSub('as')"><div class="gi-ico" style="color:var(--purple)"><svg><use href="#i-moon"/></svg></div><span>記錄睡眠</span></div>
      <div class="gi" @click="openSub('g6')"><div class="gi-ico" style="color:var(--red)"><svg><use href="#i-warn"/></svg></div><span>蠶豆病</span></div>
      <div class="gi" @click="openSub('he')"><div class="gi-ico" style="color:var(--warn)"><svg><use href="#i-shield"/></svg></div><span>疫苗接種</span></div>
      <div class="gi" @click="openSub('st')"><div class="gi-ico" style="color:var(--teal)"><svg><use href="#i-barchart"/></svg></div><span>統計報告</span></div>
      <div class="gi" @click="openSub('ex')"><div class="gi-ico" style="color:rgba(0,0,0,0.4)"><svg><use href="#i-pdf"/></svg></div><span>匯出PDF</span></div>
      <div class="gi" @click="openSub('rm')"><div class="gi-ico" style="color:var(--orange)"><svg><use href="#i-bell"/></svg></div><span>提醒設定</span></div>
      <div class="gi" @click="openSub('bt'); loadBottleSlots()"><div class="gi-ico" style="color:var(--teal)"><svg><use href="#i-bottle"/></svg></div><span>奶瓶組裝</span></div>
      <div class="gi" @click="openSub('ai')"><div class="gi-ico" style="color:var(--purple)"><svg><use href="#i-chat"/></svg></div><span>問 AI</span></div>
    </div>
    <div class="st">今日記錄</div>
    <div class="cs" v-if="recentItems.length">
      <div class="cl" v-for="item in recentItems" :key="item.id + item.type" @click="editTimelineItem(item)">
        <div class="ri" :class="item.cls"><svg><use :href="'#' + item.icon"/></svg></div>
        <div class="cb"><div class="ct">{{ item.title }}</div><div class="cd" v-if="item.detail">{{ item.detail }}</div></div>
        <div class="cr"><div class="cv" v-if="item.vol">{{ item.vol }}</div><div class="cm">{{ item.time }}</div></div>
      </div>
    </div>
    <div class="empty-state" v-else><svg><use href="#i-clock"/></svg><p>今日暫無記錄</p></div>
  </div>

  <!-- ===== FEEDING ===== -->
  <div class="page" :class="{active: currentPage === 1}">
    <div class="nb"><div class="nb-ph"></div><span class="nb-t">飲奶記錄</span><span class="nb-a" @click="openSub('af'); initTimes()"><svg><use href="#i-plus"/></svg></span></div>
    <div class="dn"><span class="da" @click="prevDay"><svg><use href="#i-back"/></svg></span><span class="dt">{{ viewDateStr }}</span><span class="da" @click="nextDay"><svg><use href="#i-arrow"/></svg></span></div>
    <div class="sb">
      <div class="sbi"><span class="sbv" style="color:var(--blue)">{{ feedSummary.total }}</span><span class="sbl">總奶量(ml)</span></div>
      <div class="sbi"><span class="sbv" style="color:var(--green)">{{ feedSummary.count }}</span><span class="sbl">餵奶次數</span></div>
      <div class="sbi"><span class="sbv" style="color:var(--orange)">{{ feedSummary.avg }}</span><span class="sbl">平均(ml)</span></div>
    </div>
    <div class="cs" v-if="feedHistory.length">
      <div class="sw-row" v-for="item in feedHistory" :key="item.id">
        <div class="sw-c" @touchstart="swStart" @touchmove.prevent="swMove" @touchend="swEnd">
          <div class="cl" @click="editFeed(item)">
            <div class="ri milk"><svg><use href="#i-milk"/></svg></div>
            <div class="cb">
              <div class="ct">{{ feedItemType(item) }}</div>
              <div class="cd">{{ fmtTime(item.time) }}<template v-if="item.note"> · {{ item.note }}</template></div>
            </div>
            <div class="cr"><div class="cv" v-if="item.amount_ml">{{ item.amount_ml }}ml</div></div>
          </div>
        </div>
        <div class="sw-del" @click="deleteFeed(item.id)">刪除</div>
      </div>
    </div>
    <div class="empty-state" v-else><svg><use href="#i-bottle"/></svg><p>暫無飲奶記錄</p></div>
  </div>

  <!-- ===== DIAPER ===== -->
  <div class="page" :class="{active: currentPage === 2}">
    <div class="nb"><div class="nb-ph"></div><span class="nb-t">換片記錄</span><span class="nb-a" @click="openSub('ad'); initTimes()"><svg><use href="#i-plus"/></svg></span></div>
    <div class="dn"><span class="da" @click="prevDay"><svg><use href="#i-back"/></svg></span><span class="dt">{{ viewDateStr }}</span><span class="da" @click="nextDay"><svg><use href="#i-arrow"/></svg></span></div>
    <div class="sb">
      <div class="sbi"><span class="sbv" style="color:var(--orange)">{{ diaperSummary.wet }}</span><span class="sbl">小便</span></div>
      <div class="sbi"><span class="sbv" style="color:#E67E22">{{ diaperSummary.dirty }}</span><span class="sbl">大便</span></div>
      <div class="sbi"><span class="sbv" style="color:var(--blue)">{{ diaperSummary.total }}</span><span class="sbl">總換片</span></div>
    </div>
    <div class="cs" v-if="diaperHistory.length">
      <div class="sw-row" v-for="item in diaperHistory" :key="item.id">
        <div class="sw-c" @touchstart="swStart" @touchmove.prevent="swMove" @touchend="swEnd">
          <div class="cl" @click="editDiaper(item)">
            <div class="ri" :class="diaperItemCls(item)"><svg><use :href="'#' + diaperItemIcon(item)"/></svg></div>
            <div class="cb">
              <div class="ct">{{ diaperItemLabel(item) }}</div>
              <div class="cd" v-if="diaperItemDetail(item)">{{ diaperItemDetail(item) }}</div>
            </div>
            <div class="cr"><div class="cm">{{ fmtTime(item.time) }}</div></div>
          </div>
        </div>
        <div class="sw-del" @click="deleteDiaper(item.id)">刪除</div>
      </div>
    </div>
    <div class="empty-state" v-else><svg><use href="#i-diaper"/></svg><p>暫無換片記錄</p></div>
  </div>

  <!-- ===== SLEEP ===== -->
  <div class="page" :class="{active: currentPage === 3}">
    <div class="nb"><div class="nb-ph"></div><span class="nb-t">睡眠記錄</span><span class="nb-a" @click="openSub('as')"><svg><use href="#i-plus"/></svg></span></div>
    <div class="sleep-now">
      <div class="sn-dot" :class="isSleeping ? 'sleeping' : 'awake'"></div>
      <span class="sn-status">{{ isSleeping ? '瞓緊覺' : '清醒中' }}</span>
      <span style="font-size:13px;color:var(--t2)" v-if="isSleeping"> · {{ fmtDuration(sleepSeconds) }}</span>
    </div>
    <div class="sleep-big">
      <button :class="isSleeping ? 'sb-wake' : 'sb-sleep'" @click="toggleSleep">
        <svg><use :href="isSleeping ? '#i-sun' : '#i-moon'"/></svg>
        <span>{{ isSleeping ? '醒咗' : '瞓覺' }}</span>
      </button>
    </div>
    <div class="dn"><span class="da" @click="prevDay"><svg><use href="#i-back"/></svg></span><span class="dt">{{ viewDateStr }}</span><span class="da" @click="nextDay"><svg><use href="#i-arrow"/></svg></span></div>
    <div class="sb">
      <div class="sbi"><span class="sbv" style="color:var(--purple)">{{ sleepSummaryData.totalHours }}h</span><span class="sbl">今日總睡眠</span></div>
      <div class="sbi"><span class="sbv" style="color:var(--purple)">{{ sleepSummaryData.longestHours }}h</span><span class="sbl">最長連續</span></div>
      <div class="sbi"><span class="sbv" style="color:var(--purple)">{{ sleepSummaryData.count }}</span><span class="sbl">睡眠次數</span></div>
    </div>
    <div class="st">今日睡眠記錄</div>
    <div class="cs" v-if="sleepHistory.length">
      <div class="sw-row" v-for="item in sleepHistory" :key="item.id">
        <div class="sw-c" @touchstart="swStart" @touchmove.prevent="swMove" @touchend="swEnd">
          <div class="cl" @click="editSleep(item)">
            <div class="ri slp"><svg><use :href="item.end_time ? '#i-sun' : '#i-moon'"/></svg></div>
            <div class="cb">
              <div class="ct">{{ item.end_time ? '醒咗' : '瞓著咗' }}</div>
              <div class="cd" v-if="item.start_time && item.end_time">瞓咗 {{ fmtDurCN(Math.floor((new Date(item.end_time) - new Date(item.start_time)) / 1000)) }}</div>
            </div>
            <div class="cr"><div class="cm">{{ fmtTime(item.end_time || item.start_time) }}</div></div>
          </div>
        </div>
        <div class="sw-del" @click="deleteSleep(item.id)">刪除</div>
      </div>
    </div>
    <div class="empty-state" v-else><svg><use href="#i-moon"/></svg><p>暫無睡眠記錄</p></div>
  </div>

  <!-- ===== SETTINGS ===== -->
  <div class="page" :class="{active: currentPage === 4}">
    <div class="hero">
      <div class="av" @click="pickAvatar"><img v-if="avatarUrl" :src="avatarUrl"><svg v-else><use href="#i-baby"/></svg></div>
      <div class="inf">
        <h2>{{ babyName }}</h2>
        <p>{{ babyBirthday }}出生 · {{ daysSinceBirth }}日大</p>
      </div>
    </div>
    <div class="sc">
      <div class="si"><span class="sn">{{ homeStats.feedCount }}</span><span class="sl">今日餵奶</span></div>
      <div class="si"><span class="sn">{{ homeStats.diaperTotal }}</span><span class="sl">今日換片</span></div>
      <div class="si"><span class="sn">{{ homeStats.sleepHours }}h</span><span class="sl">今日睡眠</span></div>
    </div>
    <div class="st">{{ babyName }}管理</div>
    <div class="cs">
      <div class="cl" @click="loadProfile(); openSub('pf')"><span class="ci"><svg><use href="#i-user"/></svg></span><div class="cb"><div class="ct">{{ babyName }}資料設定</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
      <div class="cl" @click="openSub('rm')"><span class="ci" style="color:var(--orange)"><svg><use href="#i-bell"/></svg></span><div class="cb"><div class="ct">提醒及推送通知</div><div class="cd">餵奶間隔、疫苗到期提醒</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
    </div>
    <div class="st">健康</div>
    <div class="cs">
      <div class="cl" @click="openSub('he')"><span class="ci" style="color:var(--green)"><svg><use href="#i-shield"/></svg></span><div class="cb"><div class="ct">疫苗接種計劃</div><div class="cd">香港兒童免疫接種計劃</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
      <div class="cl" @click="openSub('hs')"><span class="ci" style="color:var(--blue)"><svg><use href="#i-health"/></svg></span><div class="cb"><div class="ct">幼兒健康及發展綜合計劃</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
      <div class="cl" @click="openSub('g6')"><span class="ci" style="color:var(--red)"><svg><use href="#i-warn"/></svg></span><div class="cb"><div class="ct">蠶豆病須知</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
    </div>
    <div class="st">資料</div>
    <div class="cs">
      <div class="cl" @click="openSub('st')"><span class="ci" style="color:var(--teal)"><svg><use href="#i-barchart"/></svg></span><div class="cb"><div class="ct">統計報告</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
      <div class="cl" @click="openSub('ex')"><span class="ci"><svg><use href="#i-pdf"/></svg></span><div class="cb"><div class="ct">匯出 PDF 報告</div><div class="cd">每日/每週/每月記錄</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
    </div>
    <div class="st">其他</div>
    <div class="cs">
      <div class="cl"><span class="ci"><svg><use href="#i-help"/></svg></span><div class="cb"><div class="ct">幫助中心</div></div><span class="ca"><svg><use href="#i-arrow"/></svg></span></div>
      <div class="cl"><span class="ci"><svg><use href="#i-info"/></svg></span><div class="cb"><div class="ct">關於</div></div><div class="cr"><span class="cf">v1.0.0</span><span class="ca"><svg><use href="#i-arrow"/></svg></span></div></div>
    </div>
    <div class="nt nc" style="margin-top:8px">
      <span class="nn" style="color:var(--blue)"><svg><use href="#i-info"/></svg></span>
      <div class="nb2">資料儲存於 Cloudflare D1 數據庫，安全可靠。支援 PWA 離線使用。</div>
    </div>
  </div>

  <!-- ===== SUB: ADD FEED ===== -->
  <div class="sub" :class="{active: activeSub === 'af'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">{{ editingType === 'feed' ? '編輯餵奶記錄' : '新增餵奶記錄' }}</span><div class="nb-ph"></div></div>
    <div class="st">餵奶資料</div>
    <div class="fc">
      <div class="fi"><span class="fl">類型</span><div class="fr">配方奶</div></div>
      <label class="fi"><span class="fl">時間</span><input class="fv" type="time" v-model="feedTime"></label>
      <div class="fi"><span class="fl">奶量(ml)</span><div class="sp"><button @click="adjFeedAmount(-10)">−</button><div class="sv">{{ feedAmount }}</div><button @click="adjFeedAmount(10)">+</button></div></div>
    </div>
    <div class="fc" style="margin-top:16px"><div class="fi"><span class="fl">備註</span><input class="fv" type="text" placeholder="例如：有少量嘔奶" v-model="feedNotes"></div></div>
    <div class="ba"><a href="javascript:;" class="bp" :class="{disabled: saving}" @click="saveFeed">{{ editingType === 'feed' ? '更新記錄' : '儲存記錄' }}</a></div>
  </div>

  <!-- ===== SUB: ADD DIAPER ===== -->
  <div class="sub" :class="{active: activeSub === 'ad'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">{{ editingType === 'diaper' ? '編輯換片記錄' : '新增換片記錄' }}</span><div class="nb-ph"></div></div>
    <div class="st">換片資料</div>
    <div class="fc">
      <label class="fi"><span class="fl">類型</span><select class="fs" v-model="diaperType"><option value="pee">小便</option><option value="poo">大便</option><option value="both">大便 + 小便</option><option value="dry">乾淨</option></select></label>
      <label class="fi"><span class="fl">時間</span><input class="fv" type="time" v-model="diaperTime"></label>
    </div>
    <div class="fc" style="margin-top:16px" v-if="showPooFields()">
      <div class="fi"><span class="fl">顏色</span><select class="fs" v-model="diaperColor"><option>黃色（正常）</option><option>綠色</option><option>啡色</option><option>黑色（柏油狀）</option><option>帶血絲</option><option>灰白色</option></select></div>
      <div class="fi"><span class="fl">質地</span><select class="fs" v-model="diaperConsistency"><option>稀軟</option><option>糊狀</option><option>成形</option><option>水狀</option><option>硬</option></select></div>
      <div class="fi"><span class="fl">份量</span><select class="fs" v-model="diaperAmount"><option>少量</option><option>中量</option><option>大量</option></select></div>
    </div>
    <div class="fc" style="margin-top:16px"><div class="fi"><span class="fl">備註</span><input class="fv" type="text" placeholder="例如：有紅疹" v-model="diaperNotes"></div></div>
    <div class="nt ni"><span class="nn" style="color:var(--warn)"><svg><use href="#i-alert"/></svg></span><div class="nb2"><strong>大便顏色提示</strong>灰白色或帶血絲大便可能需要即時就醫。如有異常，請保留尿片並盡快諮詢醫生。</div></div>
    <div class="ba"><a href="javascript:;" class="bp" :class="{disabled: saving}" @click="saveDiaper">{{ editingType === 'diaper' ? '更新記錄' : '儲存記錄' }}</a></div>
  </div>

  <!-- ===== SUB: ADD SLEEP ===== -->
  <div class="sub" :class="{active: activeSub === 'as'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">{{ editingType === 'sleep' ? '編輯睡眠記錄' : '新增睡眠記錄' }}</span><div class="nb-ph"></div></div>
    <div class="st">手動輸入睡眠</div>
    <div class="fc">
      <label class="fi"><span class="fl">入睡時間</span><input class="fv" type="time" v-model="manualSleepStart"></label>
      <label class="fi"><span class="fl">醒來時間</span><input class="fv" type="time" v-model="manualSleepEnd"></label>
    </div>
    <div class="fc" style="margin-top:16px">
      <div class="fi"><span class="fl">睡眠質素</span><select class="fs" v-model="sleepQuality"><option>好 · 瞓得穩</option><option>一般 · 有扎醒</option><option>差 · 成日喊</option></select></div>
      <div class="fi"><span class="fl">備註</span><input class="fv" type="text" placeholder="例如：半夜扎醒一次" v-model="sleepNotes"></div>
    </div>
    <div class="nt np"><span class="nn" style="color:var(--purple)"><svg><use href="#i-moon"/></svg></span><div class="nb2"><strong>睡眠小貼士</strong>新生兒約需 16-17 小時睡眠。可以用「睡眠」tab 嘅大按鈕快速記錄入睡/醒來時間。</div></div>
    <div class="ba"><a href="javascript:;" class="bp" :class="{disabled: saving}" @click="saveManualSleep">{{ editingType === 'sleep' ? '更新記錄' : '儲存記錄' }}</a></div>
  </div>

  <!-- ===== SUB: PROFILE ===== -->
  <div class="sub" :class="{active: activeSub === 'pf'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">{{ babyName }}基本資料</span><div class="nb-ph"></div></div>
    <div style="display:flex;flex-direction:column;align-items:center;padding:24px 16px 8px">
      <div class="av" @click="pickAvatar" style="width:80px;height:80px;background:rgba(0,0,0,0.06);color:var(--t3);cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">
        <img v-if="avatarUrl" :src="avatarUrl" style="width:100%;height:100%;object-fit:cover">
        <svg v-else style="width:36px;height:36px"><use href="#i-baby"/></svg>
      </div>
      <span style="font-size:13px;color:var(--t2);margin-top:8px">點擊更換頭像</span>
    </div>
    <div class="st">個人資料</div>
    <div class="fc">
      <label class="fi"><span class="fl">姓名</span><input class="fv" type="text" v-model="profileForm.name"></label>
      <label class="fi"><span class="fl">性別</span><select class="fs" v-model="profileForm.gender"><option>男</option><option>女</option></select></label>
      <label class="fi"><span class="fl">出生日期</span><input class="fv" type="date" v-model="profileForm.birthday"></label>
      <label class="fi"><span class="fl">出生體重</span><input class="fv" type="text" v-model="profileForm.birth_weight" placeholder="例如：3.1"></label>
      <label class="fi"><span class="fl">出生身高</span><input class="fv" type="text" v-model="profileForm.birth_height" placeholder="例如：50"></label>
    </div>
    <div class="ba"><a href="javascript:;" class="bp" :class="{disabled: saving}" @click="saveProfile">儲存資料</a></div>
  </div>

  <!-- ===== SUB: G6PD ===== -->
  <div class="sub" :class="{active: activeSub === 'g6'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">蠶豆病 (G6PD缺乏症)</span><div class="nb-ph"></div></div>
    <div class="nt nw"><span class="nn" style="color:var(--red)"><svg><use href="#i-warn"/></svg></span><div class="nb2"><strong>需特別注意</strong>確診途徑：出生時新生兒篩查</div></div>
    <div class="st">禁用藥物及物品</div>
    <div class="cs">
      <div class="cl"><span class="ci" style="color:var(--red)"><svg><use href="#i-x"/></svg></span><div class="cb"><div class="ct">臭丸（萘丸 / 樟腦丸）</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--red)"><svg><use href="#i-x"/></svg></span><div class="cb"><div class="ct">蠶豆及蠶豆製品</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--red)"><svg><use href="#i-x"/></svg></span><div class="cb"><div class="ct">阿士匹靈 (Aspirin)</div><div class="cd">非處方藥中可能含有</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--red)"><svg><use href="#i-x"/></svg></span><div class="cb"><div class="ct">磺胺類藥物 (Sulfonamides)</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--red)"><svg><use href="#i-x"/></svg></span><div class="cb"><div class="ct">呋喃類藥物 (Nitrofurantoin)</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--red)"><svg><use href="#i-x"/></svg></span><div class="cb"><div class="ct">甲基藍 (Methylene Blue)</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--red)"><svg><use href="#i-x"/></svg></span><div class="cb"><div class="ct">含薄荷成份產品</div><div class="cd">如白花油、風油精等</div></div></div>
    </div>
    <div class="st">安全提示</div>
    <div class="cs">
      <div class="cl"><span class="ci" style="color:var(--green)"><svg><use href="#i-check"/></svg></span><div class="cb"><div class="ct">撲熱息痛 (Paracetamol) 一般安全</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--green)"><svg><use href="#i-check"/></svg></span><div class="cb"><div class="ct">就診時務必告知醫生</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--green)"><svg><use href="#i-check"/></svg></span><div class="cb"><div class="ct">留意皮膚及眼白變黃</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--green)"><svg><use href="#i-check"/></svg></span><div class="cb"><div class="ct">急性溶血需立即就醫</div></div></div>
    </div>
  </div>

  <!-- ===== SUB: VACCINE ===== -->
  <div class="sub" :class="{active: activeSub === 'he'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">疫苗接種計劃</span><div class="nb-ph"></div></div>
    <div class="nt nc"><span class="nn" style="color:var(--blue)"><svg><use href="#i-info"/></svg></span><div class="nb2">根據衞生署「香港兒童免疫接種計劃」。<br>來源：<span style="color:var(--blue)">fhs.gov.hk</span></div></div>
    <template v-for="group in vaccineGroups" :key="group.label">
      <div class="st">{{ group.label }}</div>
      <div class="cs">
        <div class="cl" v-for="v in group.items" :key="v.id">
          <span class="ci" :style="vaccineIconColor(v)"><svg><use :href="vaccineIcon(v)"/></svg></span>
          <div class="cb"><div class="ct">{{ vaccineName(v) }}</div><div class="cd">{{ vaccineDesc(v) }}</div></div>
          <div class="cr row"><span class="tg" :class="vaccineStatusCls(v)">{{ vaccineStatusText(v) }}</span></div>
        </div>
      </div>
    </template>
    <div class="nt ni"><span class="nn" style="color:var(--warn)"><svg><use href="#i-warn"/></svg></span><div class="nb2"><strong>蠶豆病提醒</strong>接種後如需退燒藥，切勿用阿士匹靈，可用撲熱息痛。發高燒 (40°C+) 請即就醫。</div></div>
    <div style="height:32px"></div>
  </div>

  <!-- ===== SUB: HEALTH SCHEDULE ===== -->
  <div class="sub" :class="{active: activeSub === 'hs'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">幼兒健康及發展綜合計劃</span><div class="nb-ph"></div></div>
    <div class="nt nc"><span class="nn" style="color:var(--blue)"><svg><use href="#i-info"/></svg></span><div class="nb2"><strong>衞生署家庭健康服務</strong>24小時資訊熱線 2112 9900</div></div>
    <div class="st">生長監察及飲食評估</div>
    <div class="cs">
      <div class="cl"><span class="ci" style="color:var(--green)"><svg><use href="#i-check"/></svg></span><div class="cb"><div class="ct">初生</div></div><div class="cr row"><span class="tg tg-g">已完成</span></div></div>
      <div class="cl"><span class="ci" style="color:var(--warn)"><svg><use href="#i-chart"/></svg></span><div class="cb"><div class="ct">一個月</div></div><div class="cr row"><span class="tg tg-o">下次</span></div></div>
      <div class="cl"><span class="ci" style="color:var(--t3)"><svg><use href="#i-chart"/></svg></span><div class="cb"><div class="ct">兩個月 · 四個月 · 六個月</div></div></div>
      <div class="cl"><span class="ci" style="color:var(--t3)"><svg><use href="#i-chart"/></svg></span><div class="cb"><div class="ct">一歲 · 一歲半 · 四歲</div></div></div>
    </div>
    <div class="st">發展監察</div>
    <div class="cs">
      <div class="cl"><span class="ci" style="color:var(--t3)"><svg><use href="#i-user"/></svg></span><div class="cb"><div class="ct">六個月 · 一歲 · 一歲半</div></div></div>
    </div>
    <div class="st">聽力及視力普查</div>
    <div class="cs">
      <div class="cl"><span class="ci" style="color:var(--warn)"><svg><use href="#i-alert"/></svg></span><div class="cb"><div class="ct">聽力普查（耳聲發射）</div><div class="cd">四個月以下嬰兒</div></div><div class="cr row"><span class="tg tg-o">待安排</span></div></div>
      <div class="cl"><span class="ci" style="color:var(--t3)"><svg><use href="#i-alert"/></svg></span><div class="cb"><div class="ct">學前視力普查</div><div class="cd">四歲或以上</div></div></div>
    </div>
    <div style="height:32px"></div>
  </div>

  <!-- ===== SUB: REMINDERS ===== -->
  <div class="sub" :class="{active: activeSub === 'rm'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">提醒及推送通知</span><div class="nb-ph"></div></div>
    <div class="nt nc" v-if="pushEnabled">
      <span class="nn" style="color:var(--green)"><svg><use href="#i-check"/></svg></span>
      <div class="nb2"><strong>推送通知已開啟</strong> 你將會收到餵奶、換片及疫苗提醒。</div>
    </div>
    <div class="nt nc" v-else @click="enablePush" style="cursor:pointer">
      <span class="nn" style="color:var(--blue)"><svg><use href="#i-bell"/></svg></span>
      <div class="nb2"><strong>點擊開啟推送通知</strong> 開啟推送通知以接收餵奶、換片及疫苗提醒。需要授權瀏覽器通知權限。</div>
    </div>
    <div style="padding:0 16px 8px;display:flex;gap:8px">
      <button class="btn-sub" @click="testPush" style="flex:1;padding:10px;border:1px solid var(--t4);border-radius:8px;background:var(--card);font-size:15px;color:var(--t1);cursor:pointer">發送測試通知</button>
      <button class="btn-sub" @click="checkReminders" style="flex:1;padding:10px;border:1px solid var(--t4);border-radius:8px;background:var(--card);font-size:15px;color:var(--t1);cursor:pointer">立即檢查提醒</button>
    </div>
    <div class="st">餵奶提醒</div>
    <div class="rm-card">
      <div class="rm-ico" style="background:#E8F4FD;color:var(--blue)"><svg><use href="#i-milk"/></svg></div>
      <div class="rm-body"><div class="rm-title">餵奶間隔提醒</div><div class="rm-desc">距上次餵奶 {{ reminders.feed.interval_minutes / 60 }} 小時後提醒</div></div>
      <label class="tog"><input type="checkbox" v-model="reminders.feed.enabled" @change="toggleReminder('feed')"><span class="tsl"></span></label>
    </div>
    <div class="fc" v-if="reminders.feed.enabled">
      <div class="fi"><span class="fl">間隔時間</span><select class="fs" :value="reminders.feed.interval_minutes" @change="updateReminderInterval('feed', +$event.target.value)"><option :value="120">2 小時</option><option :value="150">2.5 小時</option><option :value="180">3 小時</option><option :value="210">3.5 小時</option><option :value="240">4 小時</option></select></div>
    </div>
    <div class="st">換片提醒</div>
    <div class="rm-card">
      <div class="rm-ico" style="background:#FFF3E0;color:#E67E22"><svg><use href="#i-diaper"/></svg></div>
      <div class="rm-body"><div class="rm-title">換片提醒</div><div class="rm-desc">定時提醒檢查尿片</div></div>
      <label class="tog"><input type="checkbox" v-model="reminders.diaper.enabled" @change="toggleReminder('diaper')"><span class="tsl"></span></label>
    </div>
    <div class="st">疫苗提醒</div>
    <div class="rm-card">
      <div class="rm-ico" style="background:#E8F5E9;color:var(--green)"><svg><use href="#i-shield"/></svg></div>
      <div class="rm-body"><div class="rm-title">疫苗到期提醒</div><div class="rm-desc">接種日前 7 天推送提醒</div></div>
      <label class="tog"><input type="checkbox" v-model="reminders.vaccine.enabled" @change="toggleReminder('vaccine')"><span class="tsl"></span></label>
    </div>
    <div class="st">睡眠提醒</div>
    <div class="rm-card">
      <div class="rm-ico" style="background:#F3E8FF;color:var(--purple)"><svg><use href="#i-moon"/></svg></div>
      <div class="rm-body"><div class="rm-title">清醒時間提醒</div><div class="rm-desc">清醒超過建議時間提醒哄睡</div></div>
      <label class="tog"><input type="checkbox" v-model="reminders.awake_time.enabled" @change="toggleReminder('awake_time')"><span class="tsl"></span></label>
    </div>
  </div>

  <!-- ===== SUB: STATISTICS ===== -->
  <div class="sub" :class="{active: activeSub === 'st'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">統計報告</span><div class="nb-ph"></div></div>
    <div class="dual-row" style="margin-top:16px">
      <div class="dual-card"><div class="dv" style="color:var(--blue)">{{ feedSummary.avg }}<span style="font-size:14px;font-weight:400">ml</span></div><div class="dl">每餐平均</div></div>
      <div class="dual-card"><div class="dv" style="color:var(--green)">{{ feedSummary.total }}<span style="font-size:14px;font-weight:400">ml</span></div><div class="dl">今日總奶量</div></div>
    </div>
    <div class="dual-row">
      <div class="dual-card"><div class="dv" style="color:var(--orange)">{{ diaperSummary.wet }}<span style="font-size:14px;font-weight:400">次</span></div><div class="dl">今日小便</div></div>
      <div class="dual-card"><div class="dv" style="color:#E67E22">{{ diaperSummary.dirty }}<span style="font-size:14px;font-weight:400">次</span></div><div class="dl">今日大便</div></div>
    </div>
    <div class="dual-row">
      <div class="dual-card"><div class="dv" style="color:var(--purple)">{{ sleepSummaryData.totalHours }}<span style="font-size:14px;font-weight:400">h</span></div><div class="dl">今日睡眠</div></div>
      <div class="dual-card"><div class="dv" style="color:var(--purple)">{{ sleepSummaryData.longestHours }}<span style="font-size:14px;font-weight:400">h</span></div><div class="dl">最長連續</div></div>
    </div>
    <div style="height:32px"></div>
  </div>

  <!-- ===== SUB: EXPORT ===== -->
  <div class="sub" :class="{active: activeSub === 'ex'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">匯出 PDF 報告</span><div class="nb-ph"></div></div>
    <div class="st">選擇報告範圍</div>
    <div class="fc">
      <div class="fi"><span class="fl">報告類型</span><select class="fs"><option>每日報告</option><option selected>每週報告</option><option>每月報告</option></select></div>
      <div class="fi"><span class="fl">開始日期</span><input class="fv" type="date"></div>
      <div class="fi"><span class="fl">結束日期</span><input class="fv" type="date"></div>
    </div>
    <div class="st">報告內容</div>
    <div class="fc">
      <div class="fi"><span class="fl">飲奶記錄</span><label class="tog"><input type="checkbox" checked><span class="tsl"></span></label></div>
      <div class="fi"><span class="fl">換片記錄</span><label class="tog"><input type="checkbox" checked><span class="tsl"></span></label></div>
      <div class="fi"><span class="fl">睡眠記錄</span><label class="tog"><input type="checkbox" checked><span class="tsl"></span></label></div>
      <div class="fi"><span class="fl">成長數據</span><label class="tog"><input type="checkbox" checked><span class="tsl"></span></label></div>
    </div>
    <div class="btn-row"><a href="javascript:;" class="bp bp-blue" @click="showToast('PDF 已生成')">生成 PDF</a></div>
    <div style="padding:0 16px"><a href="javascript:;" class="bp-outline" @click="showToast('已分享')">分享給醫生</a></div>
  </div>

  <!-- ===== SUB: BOTTLE ASSEMBLY ===== -->
  <div class="sub" :class="{active: activeSub === 'bt'}" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb"><span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span><span class="nb-t">奶瓶組裝</span><div class="nb-ph"></div></div>
    <div class="nt nc" v-if="!bottleSlots.length" style="margin-top:16px">
      <span class="nn" style="color:var(--blue)"><svg><use href="#i-info"/></svg></span>
      <div class="nb2">新增奶瓶後，拍攝組裝前後及各零件嘅照片。<br>消毒後重新組裝時，一眼就知點樣砌返。</div>
    </div>
    <div v-for="slot in bottleSlots" :key="slot.id" style="margin:12px 16px;background:var(--card);border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
      <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06)">
        <svg style="width:20px;height:20px;color:var(--teal);margin-right:8px;flex-shrink:0"><use href="#i-bottle"/></svg>
        <span style="font-size:16px;font-weight:600;flex:1">{{ slot.name }}</span>
        <span style="font-size:12px;color:var(--t3);margin-right:8px" v-if="slot.photos.length">{{ slot.photos.length }}張</span>
        <span @click="removeBottleSlot(slot.id)" style="cursor:pointer;color:var(--t3);padding:4px"><svg style="width:18px;height:18px"><use href="#i-trash"/></svg></span>
      </div>
      <div v-if="slot.photos.length" style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:2px">
        <div v-for="(p, pi) in slot.photos" :key="pi" style="position:relative;aspect-ratio:1;overflow:hidden">
          <img :src="p.dataUrl" @click="bottlePhotoZoom = p.dataUrl" style="width:100%;height:100%;object-fit:cover;display:block;cursor:pointer">
          <span @click.stop="removeBottlePhoto(slot.id, pi)" style="position:absolute;top:4px;right:4px;width:22px;height:22px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg style="width:14px;height:14px;color:#fff"><use href="#i-close"/></svg></span>
          <span style="position:absolute;bottom:0;left:0;right:0;padding:2px 4px;background:linear-gradient(transparent,rgba(0,0,0,0.5));color:#fff;font-size:10px;text-align:right">{{ fmtTimeAgo(p.timestamp) }}</span>
        </div>
      </div>
      <div v-else style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;color:var(--t3);background:rgba(0,0,0,0.02)">
        <svg style="width:36px;height:36px;opacity:0.3;margin-bottom:6px"><use href="#i-camera"/></svg>
        <span style="font-size:13px">尚未新增相片</span>
      </div>
      <div style="display:flex;align-items:center;padding:10px 16px;gap:8px">
        <a href="javascript:;" @click="takeBottlePhoto(slot.id)" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:var(--teal);color:#fff;font-size:13px;text-decoration:none;flex:1;justify-content:center">
          <svg style="width:15px;height:15px"><use href="#i-camera"/></svg> 拍攝
        </a>
        <a href="javascript:;" @click="pickBottlePhoto(slot.id)" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:var(--blue);color:#fff;font-size:13px;text-decoration:none;flex:1;justify-content:center">
          <svg style="width:15px;height:15px"><use href="#i-dl"/></svg> 相簿
        </a>
      </div>
    </div>
    <div style="padding:12px 16px">
      <a href="javascript:;" @click="addBottleSlot" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;border-radius:12px;border:2px dashed var(--t4);color:var(--t2);font-size:15px;text-decoration:none">
        <svg style="width:18px;height:18px"><use href="#i-plus"/></svg> 新增奶瓶
      </a>
    </div>
    <div style="height:32px"></div>
  </div>

  <!-- ===== SUB: AI CHAT ===== -->
  <div class="sub" :class="{active: activeSub === 'ai'}" style="overflow:hidden" @touchstart="subSwipeStart" @touchmove="subSwipeMove" @touchend="subSwipeEnd">
    <div class="nb">
      <span class="nb-back" @click="closeSub()"><svg><use href="#i-back"/></svg></span>
      <span class="nb-t">問 AI 助手</span>
      <span class="nb-a" @click="clearChat()" v-if="chatMessages.length"><svg><use href="#i-trash"/></svg></span>
      <div class="nb-ph" v-else></div>
    </div>
    <div class="chat-body" id="chat-scroll">
      <div v-if="!chatMessages.length" class="chat-welcome">
        <div class="chat-welcome-icon"><svg><use href="#i-chat"/></svg></div>
        <h3>你好！我係 AI 助手</h3>
        <p>你可以問我關於{{ babyName }}嘅任何問題，亦可以上傳圖片（例如奶粉成份表）：</p>
        <div class="chat-suggestions">
          <div class="chat-sug" @click="chatInput = '今日餵奶情況點樣？'; sendChat()">今日餵奶情況點樣？</div>
          <div class="chat-sug" @click="chatInput = 'BB嘅睡眠時間正唔正常？'; sendChat()">BB嘅睡眠時間正唔正常？</div>
          <div class="chat-sug" @click="chatInput = '下一針疫苗幾時打？'; sendChat()">下一針疫苗幾時打？</div>
          <div class="chat-sug" @click="chatInput = 'BB嘅體重發育正常嗎？'; sendChat()">BB嘅體重發育正常嗎？</div>
        </div>
      </div>
      <div v-for="(msg, idx) in chatMessages" :key="idx" class="chat-msg" :class="{'chat-msg-user': msg.role === 'user', 'chat-msg-ai': msg.role === 'assistant'}">
        <div class="chat-bubble">
          <img v-if="msg.image" :src="msg.image" class="chat-user-img">
          <div class="chat-text">{{ msg.content }}<span v-if="msg.role === 'assistant' && chatLoading && idx === chatMessages.length - 1" class="chat-cursor">|</span></div>
        </div>
      </div>
      <div v-if="chatError" class="chat-error">
        <svg><use href="#i-alert"/></svg>
        <span>{{ chatError }}</span>
      </div>
    </div>
    <div class="chat-input-bar">
      <div class="chat-img-preview" v-if="chatImage">
        <img :src="chatImage">
        <button class="chat-img-x" @click="clearChatImage()">&times;</button>
      </div>
      <div class="chat-input-row">
        <button class="chat-img-btn" @click="pickChatImage()" :disabled="chatLoading"><svg><use href="#i-image"/></svg></button>
        <input id="chat-input" class="chat-input" type="text" placeholder="輸入你嘅問題..." v-model="chatInput" @keyup.enter="sendChat()" :disabled="chatLoading">
        <button class="chat-send" @click="sendChat()" :disabled="(!chatInput.trim() && !chatImage) || chatLoading">
          <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  </div>

  <!-- ===== FULLSCREEN PHOTO OVERLAY ===== -->
  <div v-if="bottlePhotoZoom" @click="bottlePhotoZoom = null" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;cursor:pointer">
    <img :src="bottlePhotoZoom" style="max-width:100%;max-height:100%;object-fit:contain">
  </div>

  <!-- ===== TAB BAR ===== -->
  <div class="tb">
    <div class="ti" :class="{active: currentPage === 0}" @click="go(0)"><svg><use href="#i-home"/></svg><span>主頁</span></div>
    <div class="ti" :class="{active: currentPage === 1}" @click="go(1)"><svg><use href="#i-bottle"/></svg><span>飲奶</span></div>
    <div class="ti" :class="{active: currentPage === 2}" @click="go(2)"><svg><use href="#i-diaper"/></svg><span>換片</span></div>
    <div class="ti" :class="{active: currentPage === 3}" @click="go(3)"><svg><use href="#i-moon"/></svg><span>睡眠</span></div>
    <div class="ti" :class="{active: currentPage === 4}" @click="go(4)"><svg><use href="#i-gear"/></svg><span>設定</span></div>
  </div>
  `,
});

app.mount('#app');

/* ============================================================
 * PWA: register service worker
 * ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
