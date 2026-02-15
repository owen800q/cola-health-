/* ============================================================
 * Baby Tracker – Vue 3 + Vant 4 SPA
 * ============================================================ */
const { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, toRaw } = Vue;
const { useRouter, useRoute } = VueRouter;
const { showToast, showSuccessToast, showLoadingToast, showConfirmDialog, showDialog, closeToast } = vant;

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

function fmtDateTime(iso) {
  return fmtDate(iso) + ' ' + fmtTime(iso);
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
  return Math.max(days, 0) + '日';
}

function nowISO() { return new Date().toISOString(); }

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/* ---------- Simple reactive store ---------- */
const store = reactive({
  baby: null,
  babyId: localStorage.getItem('currentBabyId') || null,
});

async function loadBaby() {
  try {
    const list = await API.getBabies();
    if (list && list.length > 0) {
      store.baby = store.babyId ? list.find(b => b.id == store.babyId) || list[0] : list[0];
      store.babyId = store.baby.id;
      localStorage.setItem('currentBabyId', store.babyId);
    }
  } catch (e) {
    console.warn('Failed to load baby:', e);
  }
}

/* ============================================================
 * COMPONENTS
 * ============================================================ */

/* ---------- HOME PAGE ---------- */
const HomePage = {
  name: 'HomePage',
  template: `
    <div class="page-container">
      <!-- Header -->
      <div class="dashboard-header">
        <div class="baby-info">
          <div class="baby-avatar">{{ babyEmoji }}</div>
          <div>
            <div class="baby-name">{{ baby?.name || '可樂仔' }}</div>
            <div class="baby-age">{{ age }} · {{ todayStr }}</div>
          </div>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card" @click="$router.push('/feed')">
          <div class="summary-card__icon summary-card__icon--feed">
            <van-icon name="coupon-o" />
          </div>
          <div class="summary-card__value">{{ stats.feedCount || 0 }}<span class="stat-unit">次</span></div>
          <div class="summary-card__label">今日飲奶</div>
          <div class="summary-card__sub">{{ stats.feedTotal ? stats.feedTotal + 'ml' : '未記錄' }}</div>
        </div>
        <div class="summary-card" @click="$router.push('/diaper')">
          <div class="summary-card__icon summary-card__icon--diaper">
            <van-icon name="smile-o" />
          </div>
          <div class="summary-card__value">{{ stats.diaperCount || 0 }}<span class="stat-unit">次</span></div>
          <div class="summary-card__label">今日換片</div>
          <div class="summary-card__sub">{{ stats.diaperSummary || '未記錄' }}</div>
        </div>
        <div class="summary-card" @click="$router.push('/sleep')">
          <div class="summary-card__icon summary-card__icon--sleep">
            <van-icon name="clock-o" />
          </div>
          <div class="summary-card__value">{{ stats.sleepHours || 0 }}<span class="stat-unit">小時</span></div>
          <div class="summary-card__label">今日睡眠</div>
          <div class="summary-card__sub">{{ stats.sleepCount ? stats.sleepCount + '次' : '未記錄' }}</div>
        </div>
        <div class="summary-card" @click="$router.push('/more/growth')">
          <div class="summary-card__icon summary-card__icon--growth">
            <van-icon name="chart-trending-o" />
          </div>
          <div class="summary-card__value">{{ stats.lastWeight || '--' }}<span class="stat-unit">kg</span></div>
          <div class="summary-card__label">最新體重</div>
          <div class="summary-card__sub">{{ stats.lastGrowthDate || '未記錄' }}</div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="section-title">快速記錄</div>
      <div class="quick-actions">
        <van-grid :column-num="4" :border="false" :gutter="10">
          <van-grid-item @click="$router.push('/feed?tab=breast')">
            <div class="quick-action-icon quick-action-icon--breast">🤱</div>
            <span>母乳</span>
          </van-grid-item>
          <van-grid-item @click="$router.push('/feed?tab=bottle')">
            <div class="quick-action-icon quick-action-icon--bottle">🍼</div>
            <span>奶瓶</span>
          </van-grid-item>
          <van-grid-item @click="$router.push('/diaper')">
            <div class="quick-action-icon quick-action-icon--diaper">👶</div>
            <span>換片</span>
          </van-grid-item>
          <van-grid-item @click="$router.push('/sleep')">
            <div class="quick-action-icon quick-action-icon--sleep">😴</div>
            <span>睡眠</span>
          </van-grid-item>
        </van-grid>
      </div>

      <!-- Recent Activities -->
      <div class="section-title">
        最近活動
        <span class="section-title__more" @click="$router.push('/more/timeline')">查看全部 ></span>
      </div>
      <van-cell-group inset>
        <van-cell v-for="item in recentItems" :key="item.id + item.type"
          :title="item.title" :value="fmtTime(item.time)" :label="item.detail" />
        <van-empty v-if="!recentItems.length" description="今日暫無記錄" image="search" />
      </van-cell-group>
    </div>
  `,
  setup() {
    const stats = reactive({
      feedCount: 0, feedTotal: 0,
      diaperCount: 0, diaperSummary: '',
      sleepHours: 0, sleepCount: 0,
      lastWeight: null, lastGrowthDate: null,
    });
    const recentItems = ref([]);
    const baby = computed(() => store.baby);
    const babyEmoji = computed(() => store.baby?.gender === 'F' ? '👧' : '👦');
    const age = computed(() => calcAge(store.baby?.birthday));
    const todayStr = computed(() => {
      const d = new Date();
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    });

    async function loadData() {
      if (!store.babyId) return;
      try {
        const [feeds, diapers, sleeps, growth, timeline] = await Promise.all([
          API.getFeeds(store.babyId, { date: todayStart() }),
          API.getDiapers(store.babyId, { date: todayStart() }),
          API.getSleeps(store.babyId, { date: todayStart() }),
          API.getGrowth(store.babyId),
          API.getTimeline(store.babyId, { limit: 5 }),
        ]);
        stats.feedCount = feeds?.length || 0;
        stats.feedTotal = feeds?.reduce((s, f) => s + (f.amount_ml || 0), 0) || 0;
        stats.diaperCount = diapers?.length || 0;
        const wet = diapers?.filter(d => d.type === 'wet' || d.type === 'both').length || 0;
        const dirty = diapers?.filter(d => d.type === 'dirty' || d.type === 'both').length || 0;
        stats.diaperSummary = wet + '濕 · ' + dirty + '髒';
        stats.sleepCount = sleeps?.length || 0;
        const totalMin = sleeps?.reduce((s, sl) => {
          if (sl.start_time && sl.end_time) {
            return s + (new Date(sl.end_time) - new Date(sl.start_time)) / 60000;
          }
          return s;
        }, 0) || 0;
        stats.sleepHours = (totalMin / 60).toFixed(1);
        if (growth && growth.length > 0) {
          stats.lastWeight = growth[0].weight_kg;
          stats.lastGrowthDate = fmtDate(growth[0].recorded_at);
        }
        // Build recent items
        recentItems.value = (timeline || []).map(e => ({
          id: e.id,
          type: e.type,
          time: e.time,
          title: eventTitle(e),
          detail: eventDetail(e),
        }));
      } catch (e) {
        console.warn('Dashboard load error:', e);
      }
    }

    function eventTitle(e) {
      const map = { feed: '🍼 飲奶', diaper: '👶 換片', sleep: '😴 睡眠', growth: '📏 成長', vaccine: '💉 疫苗' };
      return map[e.type] || e.type;
    }

    function eventDetail(e) {
      if (e.type === 'feed') return (e.feed_type || '') + ' ' + (e.amount_ml ? e.amount_ml + 'ml' : '');
      if (e.type === 'diaper') return e.diaper_type || '';
      if (e.type === 'sleep') return e.duration ? fmtDuration(e.duration) : '';
      return '';
    }

    onMounted(async () => {
      await loadBaby();
      loadData();
    });

    return { stats, recentItems, baby, babyEmoji, age, todayStr, fmtTime };
  },
};

/* ---------- FEED PAGE ---------- */
const FeedPage = {
  name: 'FeedPage',
  template: `
    <div class="page-container">
      <van-nav-bar title="飲奶記錄" />
      <van-tabs v-model:active="activeTab" animated swipeable>
        <!-- 母乳 Tab -->
        <van-tab title="母乳" name="breast">
          <div class="breast-toggle">
            <div class="breast-side" :class="{'breast-side--active': side === 'left'}" @click="side = 'left'">
              <div class="breast-side__icon">🤱</div>
              左邊
            </div>
            <div class="breast-side" :class="{'breast-side--active': side === 'right'}" @click="side = 'right'">
              <div class="breast-side__icon">🤱</div>
              右邊
            </div>
          </div>
          <div class="timer-display">
            <div class="timer-time">{{ fmtDuration(breastSeconds) }}</div>
            <div class="timer-label">{{ breastRunning ? (side === 'left' ? '左邊餵奶中...' : '右邊餵奶中...') : '按下開始計時' }}</div>
          </div>
          <div class="timer-actions">
            <button v-if="!breastRunning" class="timer-btn timer-btn--start" @click="startBreast">
              <van-icon name="play" />
            </button>
            <button v-else class="timer-btn timer-btn--stop" @click="stopBreast">
              <van-icon name="stop" />
            </button>
          </div>
        </van-tab>

        <!-- 奶瓶 Tab -->
        <van-tab title="奶瓶" name="bottle">
          <div class="popup-form">
            <van-cell-group inset>
              <van-field v-model="bottleAmount" type="digit" label="奶量 (ml)" placeholder="輸入奶量"
                :rules="[{required: true, message: '請輸入奶量'}]">
                <template #button>
                  <van-stepper v-model="bottleAmount" min="0" max="500" step="10" theme="round" />
                </template>
              </van-field>
              <van-field v-model="bottleType" is-link readonly label="奶類型" :placeholder="bottleType || '選擇'" @click="showBottleTypePicker = true" />
              <van-field v-model="feedNotes" label="備註" placeholder="選填" />
            </van-cell-group>
            <div style="padding: 16px;">
              <van-button type="primary" block round @click="saveBottle" :loading="saving">儲存記錄</van-button>
            </div>
          </div>
        </van-tab>

        <!-- 固體食物 Tab -->
        <van-tab title="固體食物" name="solid">
          <div class="popup-form">
            <van-cell-group inset>
              <van-field v-model="solidFood" label="食物" placeholder="例如：米糊、蘋果蓉" />
              <van-field v-model="solidAmount" type="digit" label="份量 (g)" placeholder="選填" />
              <van-field v-model="feedNotes" label="備註" placeholder="選填" />
            </van-cell-group>
            <div style="padding: 16px;">
              <van-button type="primary" block round @click="saveSolid" :loading="saving">儲存記錄</van-button>
            </div>
          </div>
        </van-tab>
      </van-tabs>

      <!-- History -->
      <div class="history-header">
        <div class="history-header__title">飲奶紀錄</div>
      </div>
      <van-pull-refresh v-model="refreshing" @refresh="loadHistory">
        <van-cell-group inset>
          <van-swipe-cell v-for="item in history" :key="item.id">
            <van-cell :title="feedTitle(item)" :value="fmtTime(item.start_time)" :label="feedLabel(item)">
              <template #icon>
                <van-tag :type="feedTagType(item.feed_type)" style="margin-right:8px;">{{ feedTypeLabel(item.feed_type) }}</van-tag>
              </template>
            </van-cell>
            <template #right>
              <van-button square type="danger" text="刪除" @click="deleteFeed(item.id)" style="height:100%;" />
            </template>
          </van-swipe-cell>
          <van-empty v-if="!history.length" description="暫無飲奶記錄" />
        </van-cell-group>
      </van-pull-refresh>
    </div>
  `,
  setup() {
    const route = useRoute();
    const activeTab = ref(route.query.tab || 'breast');
    const side = ref('left');
    const breastSeconds = ref(0);
    const breastRunning = ref(false);
    let breastTimer = null;
    const bottleAmount = ref(120);
    const bottleType = ref('配方奶');
    const solidFood = ref('');
    const solidAmount = ref('');
    const feedNotes = ref('');
    const showBottleTypePicker = ref(false);
    const saving = ref(false);
    const refreshing = ref(false);
    const history = ref([]);

    // Restore timer from localStorage
    onMounted(() => {
      const saved = localStorage.getItem('breastTimer');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.running) {
          const elapsed = Math.floor((Date.now() - data.startedAt) / 1000);
          breastSeconds.value = elapsed;
          breastRunning.value = true;
          side.value = data.side || 'left';
          breastTimer = setInterval(() => { breastSeconds.value++; }, 1000);
        }
      }
      loadHistory();
    });

    onUnmounted(() => {
      if (breastTimer) clearInterval(breastTimer);
    });

    function startBreast() {
      breastSeconds.value = 0;
      breastRunning.value = true;
      const startedAt = Date.now();
      localStorage.setItem('breastTimer', JSON.stringify({ running: true, startedAt, side: side.value }));
      breastTimer = setInterval(() => { breastSeconds.value++; }, 1000);
    }

    async function stopBreast() {
      breastRunning.value = false;
      if (breastTimer) { clearInterval(breastTimer); breastTimer = null; }
      localStorage.removeItem('breastTimer');
      if (breastSeconds.value < 5) return;
      try {
        saving.value = true;
        const duration = breastSeconds.value;
        const start = new Date(Date.now() - duration * 1000).toISOString();
        await API.createFeed({
          baby_id: store.babyId,
          feed_type: 'breast',
          start_time: start,
          end_time: nowISO(),
          duration_seconds: duration,
          breast_side: side.value,
          notes: feedNotes.value || null,
        });
        showSuccessToast('已儲存');
        breastSeconds.value = 0;
        loadHistory();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function saveBottle() {
      if (!bottleAmount.value) return showToast('請輸入奶量');
      try {
        saving.value = true;
        await API.createFeed({
          baby_id: store.babyId,
          feed_type: 'bottle',
          start_time: nowISO(),
          amount_ml: Number(bottleAmount.value),
          formula_type: bottleType.value,
          notes: feedNotes.value || null,
        });
        showSuccessToast('已儲存');
        feedNotes.value = '';
        loadHistory();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function saveSolid() {
      if (!solidFood.value) return showToast('請輸入食物名稱');
      try {
        saving.value = true;
        await API.createFeed({
          baby_id: store.babyId,
          feed_type: 'solid',
          start_time: nowISO(),
          amount_ml: solidAmount.value ? Number(solidAmount.value) : null,
          notes: (solidFood.value + ' ' + (feedNotes.value || '')).trim(),
        });
        showSuccessToast('已儲存');
        solidFood.value = '';
        solidAmount.value = '';
        feedNotes.value = '';
        loadHistory();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function loadHistory() {
      try {
        history.value = await API.getFeeds(store.babyId, { limit: 20 }) || [];
      } catch (e) {
        console.warn('Feed history error:', e);
      } finally {
        refreshing.value = false;
      }
    }

    async function deleteFeed(id) {
      try {
        await showConfirmDialog({ title: '確認刪除', message: '刪除後無法恢復' });
        await API.deleteFeed(id);
        showSuccessToast('已刪除');
        loadHistory();
      } catch (e) { /* cancelled */ }
    }

    function feedTitle(item) {
      if (item.feed_type === 'breast') return (item.breast_side === 'left' ? '左邊' : '右邊') + '母乳';
      if (item.feed_type === 'bottle') return (item.amount_ml || 0) + 'ml ' + (item.formula_type || '');
      return item.notes || '固體食物';
    }

    function feedLabel(item) {
      if (item.duration_seconds) return fmtDuration(item.duration_seconds);
      return item.notes || '';
    }

    function feedTypeLabel(type) {
      return { breast: '母乳', bottle: '奶瓶', solid: '固體' }[type] || type;
    }

    function feedTagType(type) {
      return { breast: 'warning', bottle: 'primary', solid: 'success' }[type] || 'default';
    }

    return {
      activeTab, side, breastSeconds, breastRunning, bottleAmount, bottleType,
      solidFood, solidAmount, feedNotes, showBottleTypePicker, saving, refreshing,
      history, startBreast, stopBreast, saveBottle, saveSolid, loadHistory, deleteFeed,
      feedTitle, feedLabel, feedTypeLabel, feedTagType, fmtDuration, fmtTime,
    };
  },
};

/* ---------- DIAPER PAGE ---------- */
const DiaperPage = {
  name: 'DiaperPage',
  template: `
    <div class="page-container">
      <van-nav-bar title="換片記錄" />

      <!-- Quick Type Select -->
      <div class="diaper-type-grid">
        <div class="diaper-type-btn" :class="{'diaper-type-btn--active': diaperType === 'wet'}" @click="diaperType = 'wet'">
          <div class="diaper-type-btn__icon">💧</div>
          <div class="diaper-type-btn__label">尿尿</div>
        </div>
        <div class="diaper-type-btn" :class="{'diaper-type-btn--active': diaperType === 'dirty'}" @click="diaperType = 'dirty'">
          <div class="diaper-type-btn__icon">💩</div>
          <div class="diaper-type-btn__label">便便</div>
        </div>
        <div class="diaper-type-btn" :class="{'diaper-type-btn--active': diaperType === 'both'}" @click="diaperType = 'both'">
          <div class="diaper-type-btn__icon">💧💩</div>
          <div class="diaper-type-btn__label">混合</div>
        </div>
      </div>

      <!-- Details (show when dirty) -->
      <van-cell-group inset v-if="diaperType === 'dirty' || diaperType === 'both'" style="margin-bottom: 12px;">
        <van-field v-model="color" is-link readonly label="顏色" placeholder="選擇" @click="showColorPicker = true" />
        <van-field v-model="consistency" is-link readonly label="質地" placeholder="選擇" @click="showConsistencyPicker = true" />
      </van-cell-group>

      <van-cell-group inset style="margin-bottom: 12px;">
        <van-field v-model="diaperNotes" label="備註" placeholder="選填" />
      </van-cell-group>

      <div class="px-16 mb-16">
        <van-button type="success" block round size="large" @click="saveDiaper" :loading="saving">
          儲存記錄
        </van-button>
      </div>

      <!-- Color Picker Popup -->
      <van-popup v-model:show="showColorPicker" position="bottom" round>
        <van-picker title="顏色" :columns="colorOptions" @confirm="onColorConfirm" @cancel="showColorPicker = false" />
      </van-popup>

      <!-- Consistency Picker Popup -->
      <van-popup v-model:show="showConsistencyPicker" position="bottom" round>
        <van-picker title="質地" :columns="consistencyOptions" @confirm="onConsistencyConfirm" @cancel="showConsistencyPicker = false" />
      </van-popup>

      <!-- History -->
      <div class="history-header">
        <div class="history-header__title">換片紀錄</div>
      </div>
      <van-pull-refresh v-model="refreshing" @refresh="loadHistory">
        <van-cell-group inset>
          <van-swipe-cell v-for="item in history" :key="item.id">
            <van-cell :title="diaperTitle(item)" :value="fmtTime(item.changed_at)" :label="item.notes || ''">
              <template #icon>
                <van-tag :type="item.type === 'wet' ? 'primary' : item.type === 'dirty' ? 'warning' : 'success'" style="margin-right:8px;">
                  {{ {wet:'尿尿',dirty:'便便',both:'混合'}[item.type] }}
                </van-tag>
              </template>
            </van-cell>
            <template #right>
              <van-button square type="danger" text="刪除" @click="deleteDiaper(item.id)" style="height:100%;" />
            </template>
          </van-swipe-cell>
          <van-empty v-if="!history.length" description="暫無換片記錄" />
        </van-cell-group>
      </van-pull-refresh>
    </div>
  `,
  setup() {
    const diaperType = ref('wet');
    const color = ref('');
    const consistency = ref('');
    const diaperNotes = ref('');
    const showColorPicker = ref(false);
    const showConsistencyPicker = ref(false);
    const saving = ref(false);
    const refreshing = ref(false);
    const history = ref([]);

    const colorOptions = [
      { text: '黃色', value: 'yellow' },
      { text: '綠色', value: 'green' },
      { text: '啡色', value: 'brown' },
      { text: '黑色', value: 'black' },
      { text: '紅色', value: 'red' },
      { text: '白色', value: 'white' },
    ];
    const consistencyOptions = [
      { text: '稀', value: 'watery' },
      { text: '軟', value: 'soft' },
      { text: '正常', value: 'normal' },
      { text: '硬', value: 'hard' },
    ];

    function onColorConfirm({ selectedOptions }) {
      color.value = selectedOptions[0]?.text || '';
      showColorPicker.value = false;
    }
    function onConsistencyConfirm({ selectedOptions }) {
      consistency.value = selectedOptions[0]?.text || '';
      showConsistencyPicker.value = false;
    }

    async function saveDiaper() {
      try {
        saving.value = true;
        await API.createDiaper({
          baby_id: store.babyId,
          type: diaperType.value,
          color: color.value || null,
          consistency: consistency.value || null,
          notes: diaperNotes.value || null,
          changed_at: nowISO(),
        });
        showSuccessToast('已儲存');
        diaperNotes.value = '';
        color.value = '';
        consistency.value = '';
        loadHistory();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function loadHistory() {
      try {
        history.value = await API.getDiapers(store.babyId, { limit: 20 }) || [];
      } catch (e) {
        console.warn('Diaper history error:', e);
      } finally {
        refreshing.value = false;
      }
    }

    async function deleteDiaper(id) {
      try {
        await showConfirmDialog({ title: '確認刪除', message: '刪除後無法恢復' });
        await API.deleteDiaper(id);
        showSuccessToast('已刪除');
        loadHistory();
      } catch (e) { /* cancelled */ }
    }

    function diaperTitle(item) {
      let parts = [];
      if (item.color) parts.push(item.color);
      if (item.consistency) parts.push(item.consistency);
      return parts.length ? parts.join(' · ') : ({ wet: '尿尿', dirty: '便便', both: '混合' }[item.type]);
    }

    onMounted(() => { loadHistory(); });

    return {
      diaperType, color, consistency, diaperNotes, showColorPicker, showConsistencyPicker,
      saving, refreshing, history, colorOptions, consistencyOptions,
      onColorConfirm, onConsistencyConfirm, saveDiaper, loadHistory, deleteDiaper,
      diaperTitle, fmtTime,
    };
  },
};

/* ---------- SLEEP PAGE ---------- */
const SleepPage = {
  name: 'SleepPage',
  template: `
    <div class="page-container">
      <van-nav-bar title="睡眠記錄" />

      <div class="sleep-status">
        <span class="sleep-status__dot" :class="sleeping ? 'sleep-status__dot--sleeping' : 'sleep-status__dot--awake'"></span>
        <span>{{ sleeping ? '正在睡覺' : '已醒來' }}</span>
      </div>

      <div class="timer-display">
        <div class="timer-time">{{ fmtDuration(sleepSeconds) }}</div>
        <div class="timer-label">{{ sleeping ? '入睡時間: ' + fmtTime(sleepStart) : '按下開始記錄睡眠' }}</div>
      </div>

      <div class="timer-actions">
        <button v-if="!sleeping" class="timer-btn timer-btn--start" @click="startSleep">
          <van-icon name="play" />
        </button>
        <button v-else class="timer-btn timer-btn--stop" @click="stopSleep">
          <van-icon name="stop" />
        </button>
      </div>

      <!-- Manual Entry -->
      <div class="px-16 mb-16">
        <van-button plain block round type="primary" size="small" @click="showManual = true">
          手動輸入
        </van-button>
      </div>

      <!-- Manual Entry Popup -->
      <van-popup v-model:show="showManual" position="bottom" round style="padding: 16px; padding-bottom: 32px;">
        <div style="font-size:16px; font-weight:600; text-align:center; margin-bottom:16px;">手動輸入睡眠</div>
        <van-cell-group inset>
          <van-field v-model="manualStart" label="開始時間" placeholder="YYYY-MM-DD HH:MM" />
          <van-field v-model="manualEnd" label="結束時間" placeholder="YYYY-MM-DD HH:MM" />
          <van-field v-model="sleepNotes" label="備註" placeholder="選填" />
        </van-cell-group>
        <div style="padding: 16px 0;">
          <van-button type="primary" block round @click="saveManualSleep" :loading="saving">儲存</van-button>
        </div>
      </van-popup>

      <!-- History -->
      <div class="history-header">
        <div class="history-header__title">睡眠紀錄</div>
      </div>
      <van-pull-refresh v-model="refreshing" @refresh="loadHistory">
        <van-cell-group inset>
          <van-swipe-cell v-for="item in history" :key="item.id">
            <van-cell :title="sleepTitle(item)" :value="fmtTime(item.start_time)" :label="item.notes || ''">
              <template #icon>
                <van-icon name="clock-o" color="#7232dd" style="margin-right:8px; font-size:18px;" />
              </template>
            </van-cell>
            <template #right>
              <van-button square type="danger" text="刪除" @click="deleteSleep(item.id)" style="height:100%;" />
            </template>
          </van-swipe-cell>
          <van-empty v-if="!history.length" description="暫無睡眠記錄" />
        </van-cell-group>
      </van-pull-refresh>
    </div>
  `,
  setup() {
    const sleeping = ref(false);
    const sleepSeconds = ref(0);
    const sleepStart = ref(null);
    let sleepTimer = null;
    const showManual = ref(false);
    const manualStart = ref('');
    const manualEnd = ref('');
    const sleepNotes = ref('');
    const saving = ref(false);
    const refreshing = ref(false);
    const history = ref([]);

    onMounted(() => {
      // Restore timer
      const saved = localStorage.getItem('sleepTimer');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.running) {
          sleepStart.value = data.startISO;
          sleeping.value = true;
          sleepSeconds.value = Math.floor((Date.now() - data.startedAt) / 1000);
          sleepTimer = setInterval(() => { sleepSeconds.value++; }, 1000);
        }
      }
      loadHistory();
    });

    onUnmounted(() => {
      if (sleepTimer) clearInterval(sleepTimer);
    });

    function startSleep() {
      sleepStart.value = nowISO();
      sleeping.value = true;
      sleepSeconds.value = 0;
      localStorage.setItem('sleepTimer', JSON.stringify({ running: true, startedAt: Date.now(), startISO: sleepStart.value }));
      sleepTimer = setInterval(() => { sleepSeconds.value++; }, 1000);
    }

    async function stopSleep() {
      sleeping.value = false;
      if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null; }
      localStorage.removeItem('sleepTimer');
      if (sleepSeconds.value < 60) { sleepSeconds.value = 0; return; }
      try {
        saving.value = true;
        await API.createSleep({
          baby_id: store.babyId,
          start_time: sleepStart.value,
          end_time: nowISO(),
          notes: sleepNotes.value || null,
        });
        showSuccessToast('已儲存');
        sleepSeconds.value = 0;
        sleepNotes.value = '';
        loadHistory();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function saveManualSleep() {
      if (!manualStart.value || !manualEnd.value) return showToast('請輸入開始和結束時間');
      try {
        saving.value = true;
        await API.createSleep({
          baby_id: store.babyId,
          start_time: new Date(manualStart.value).toISOString(),
          end_time: new Date(manualEnd.value).toISOString(),
          notes: sleepNotes.value || null,
        });
        showSuccessToast('已儲存');
        showManual.value = false;
        manualStart.value = '';
        manualEnd.value = '';
        sleepNotes.value = '';
        loadHistory();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function loadHistory() {
      try {
        history.value = await API.getSleeps(store.babyId, { limit: 20 }) || [];
      } catch (e) {
        console.warn('Sleep history error:', e);
      } finally {
        refreshing.value = false;
      }
    }

    async function deleteSleep(id) {
      try {
        await showConfirmDialog({ title: '確認刪除', message: '刪除後無法恢復' });
        await API.deleteSleep(id);
        showSuccessToast('已刪除');
        loadHistory();
      } catch (e) { /* cancelled */ }
    }

    function sleepTitle(item) {
      if (item.start_time && item.end_time) {
        const dur = Math.floor((new Date(item.end_time) - new Date(item.start_time)) / 1000);
        return fmtTime(item.start_time) + ' - ' + fmtTime(item.end_time) + ' (' + fmtDuration(dur) + ')';
      }
      return fmtTime(item.start_time) + ' - 進行中';
    }

    return {
      sleeping, sleepSeconds, sleepStart, showManual, manualStart, manualEnd,
      sleepNotes, saving, refreshing, history,
      startSleep, stopSleep, saveManualSleep, loadHistory, deleteSleep, sleepTitle,
      fmtDuration, fmtTime,
    };
  },
};

/* ---------- MORE PAGE ---------- */
const MorePage = {
  name: 'MorePage',
  template: `
    <div class="page-container">
      <van-nav-bar title="更多功能" />
      <div style="padding: 16px;" class="more-grid">
        <van-grid :column-num="3" :border="false" :gutter="12">
          <van-grid-item @click="$router.push('/more/growth')">
            <div class="more-grid-icon" style="background:#e8f0ff; color:#1989fa;">
              <van-icon name="chart-trending-o" />
            </div>
            <span>成長記錄</span>
          </van-grid-item>
          <van-grid-item @click="$router.push('/more/vaccine')">
            <div class="more-grid-icon" style="background:#ffe8ea; color:#ee0a24;">
              <van-icon name="shield-o" />
            </div>
            <span>疫苗接種</span>
          </van-grid-item>
          <van-grid-item @click="$router.push('/more/timeline')">
            <div class="more-grid-icon" style="background:#f0e8ff; color:#7232dd;">
              <van-icon name="orders-o" />
            </div>
            <span>時間線</span>
          </van-grid-item>
          <van-grid-item @click="$router.push('/more/stats')">
            <div class="more-grid-icon" style="background:#e8f8ee; color:#07c160;">
              <van-icon name="bar-chart-o" />
            </div>
            <span>統計</span>
          </van-grid-item>
          <van-grid-item @click="$router.push('/more/settings')">
            <div class="more-grid-icon" style="background:#fff3e8; color:#ff976a;">
              <van-icon name="setting-o" />
            </div>
            <span>設定</span>
          </van-grid-item>
        </van-grid>
      </div>
    </div>
  `,
};

/* ---------- GROWTH PAGE ---------- */
const GrowthPage = {
  name: 'GrowthPage',
  template: `
    <div class="page-container">
      <van-nav-bar title="成長記錄" left-arrow @click-left="$router.back()" />

      <!-- Latest -->
      <van-cell-group inset style="margin: 12px 16px;">
        <van-cell title="體重" :value="latest.weight_kg ? latest.weight_kg + ' kg' : '--'" />
        <van-cell title="身高" :value="latest.height_cm ? latest.height_cm + ' cm' : '--'" />
        <van-cell title="頭圍" :value="latest.head_cm ? latest.head_cm + ' cm' : '--'" />
      </van-cell-group>

      <div class="px-16 mb-16">
        <van-button type="primary" block round @click="showForm = true">
          <van-icon name="plus" /> 新增記錄
        </van-button>
      </div>

      <!-- Form Popup -->
      <van-popup v-model:show="showForm" position="bottom" round style="padding: 16px; padding-bottom: 32px;">
        <div style="font-size:16px; font-weight:600; text-align:center; margin-bottom:16px;">新增成長記錄</div>
        <van-cell-group inset>
          <van-field v-model="form.weight" type="number" label="體重 (kg)" placeholder="例如: 5.2" />
          <van-field v-model="form.height" type="number" label="身高 (cm)" placeholder="例如: 62.5" />
          <van-field v-model="form.head" type="number" label="頭圍 (cm)" placeholder="例如: 39.0" />
          <van-field v-model="form.notes" label="備註" placeholder="選填" />
        </van-cell-group>
        <div style="padding: 16px 0;">
          <van-button type="primary" block round @click="saveGrowth" :loading="saving">儲存</van-button>
        </div>
      </van-popup>

      <!-- History -->
      <div class="history-header">
        <div class="history-header__title">歷史記錄</div>
      </div>
      <van-cell-group inset>
        <van-swipe-cell v-for="item in history" :key="item.id">
          <van-cell :title="fmtDate(item.recorded_at)"
            :label="growthLabel(item)"
            :value="item.weight_kg ? item.weight_kg + 'kg' : ''" />
          <template #right>
            <van-button square type="danger" text="刪除" @click="deleteGrowth(item.id)" style="height:100%;" />
          </template>
        </van-swipe-cell>
        <van-empty v-if="!history.length" description="暫無成長記錄" />
      </van-cell-group>
    </div>
  `,
  setup() {
    const showForm = ref(false);
    const saving = ref(false);
    const form = reactive({ weight: '', height: '', head: '', notes: '' });
    const latest = reactive({ weight_kg: null, height_cm: null, head_cm: null });
    const history = ref([]);

    async function loadData() {
      try {
        const data = await API.getGrowth(store.babyId);
        history.value = data || [];
        if (data && data.length > 0) {
          latest.weight_kg = data[0].weight_kg;
          latest.height_cm = data[0].height_cm;
          latest.head_cm = data[0].head_cm;
        }
      } catch (e) {
        console.warn('Growth error:', e);
      }
    }

    async function saveGrowth() {
      if (!form.weight && !form.height && !form.head) return showToast('請輸入至少一項數據');
      try {
        saving.value = true;
        await API.createGrowth({
          baby_id: store.babyId,
          weight_kg: form.weight ? Number(form.weight) : null,
          height_cm: form.height ? Number(form.height) : null,
          head_cm: form.head ? Number(form.head) : null,
          notes: form.notes || null,
          recorded_at: nowISO(),
        });
        showSuccessToast('已儲存');
        showForm.value = false;
        form.weight = ''; form.height = ''; form.head = ''; form.notes = '';
        loadData();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function deleteGrowth(id) {
      try {
        await showConfirmDialog({ title: '確認刪除', message: '刪除後無法恢復' });
        await API.deleteGrowth(id);
        showSuccessToast('已刪除');
        loadData();
      } catch (e) { /* cancelled */ }
    }

    function growthLabel(item) {
      const parts = [];
      if (item.height_cm) parts.push('身高: ' + item.height_cm + 'cm');
      if (item.head_cm) parts.push('頭圍: ' + item.head_cm + 'cm');
      return parts.join(' · ') || '';
    }

    onMounted(loadData);

    return { showForm, saving, form, latest, history, saveGrowth, deleteGrowth, growthLabel, fmtDate };
  },
};

/* ---------- VACCINE PAGE ---------- */
const VaccinePage = {
  name: 'VaccinePage',
  template: `
    <div class="page-container">
      <van-nav-bar title="疫苗接種" left-arrow @click-left="$router.back()" />

      <van-cell-group v-for="group in groupedVaccines" :key="group.age" style="margin-bottom: 8px;">
        <template #title>
          <div class="vaccine-age-header">{{ group.age }}</div>
        </template>
        <van-cell v-for="v in group.items" :key="v.id"
          :class="{'vaccine-item--done': v.administered_date}"
          clickable @click="toggleVaccine(v)">
          <template #title>
            <span>{{ v.vaccine_name }}</span>
          </template>
          <template #label>
            <span v-if="v.administered_date">已接種: {{ fmtDate(v.administered_date) }}</span>
            <span v-else style="color: #ee0a24;">未接種</span>
          </template>
          <template #right-icon>
            <van-icon v-if="v.administered_date" name="passed" color="#07c160" size="20" />
            <van-icon v-else name="circle" color="#c8c9cc" size="20" />
          </template>
        </van-cell>
      </van-cell-group>

      <van-empty v-if="!vaccines.length" description="暫無疫苗資料" />
    </div>
  `,
  setup() {
    const vaccines = ref([]);
    const groupedVaccines = computed(() => {
      const groups = {};
      vaccines.value.forEach(v => {
        const age = v.scheduled_age || '其他';
        if (!groups[age]) groups[age] = { age, items: [] };
        groups[age].items.push(v);
      });
      return Object.values(groups);
    });

    async function loadData() {
      try {
        vaccines.value = await API.getVaccines(store.babyId) || [];
      } catch (e) {
        console.warn('Vaccine error:', e);
      }
    }

    async function toggleVaccine(v) {
      if (v.administered_date) {
        try {
          await showConfirmDialog({ title: '取消接種記錄？', message: v.vaccine_name });
          await API.markVaccine(v.id, { administered_date: null });
          showSuccessToast('已更新');
          loadData();
        } catch (e) { /* cancelled */ }
      } else {
        try {
          await API.markVaccine(v.id, { administered_date: nowISO() });
          showSuccessToast('已標記接種');
          loadData();
        } catch (e) {
          showToast('更新失敗');
        }
      }
    }

    onMounted(loadData);

    return { vaccines, groupedVaccines, toggleVaccine, fmtDate };
  },
};

/* ---------- TIMELINE PAGE ---------- */
const TimelinePage = {
  name: 'TimelinePage',
  template: `
    <div class="page-container">
      <van-nav-bar title="時間線" left-arrow @click-left="$router.back()" />

      <van-dropdown-menu>
        <van-dropdown-item v-model="filter" :options="filterOptions" @change="loadData" />
      </van-dropdown-menu>

      <van-pull-refresh v-model="refreshing" @refresh="loadData">
        <van-cell-group inset style="margin-top: 12px;">
          <div v-for="(group, date) in grouped" :key="date">
            <van-divider content-position="left">{{ date }}</van-divider>
            <van-cell v-for="item in group" :key="item.id + item.type"
              :title="item.title" :value="fmtTime(item.time)" :label="item.detail">
              <template #icon>
                <van-tag :type="tagType(item.type)" style="margin-right: 8px;">{{ typeLabel(item.type) }}</van-tag>
              </template>
            </van-cell>
          </div>
          <van-empty v-if="!items.length" description="暫無記錄" />
        </van-cell-group>
      </van-pull-refresh>
    </div>
  `,
  setup() {
    const items = ref([]);
    const refreshing = ref(false);
    const filter = ref('all');
    const filterOptions = [
      { text: '全部', value: 'all' },
      { text: '飲奶', value: 'feed' },
      { text: '換片', value: 'diaper' },
      { text: '睡眠', value: 'sleep' },
      { text: '成長', value: 'growth' },
    ];

    const grouped = computed(() => {
      const groups = {};
      items.value.forEach(item => {
        const date = fmtDate(item.time);
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
      });
      return groups;
    });

    async function loadData() {
      try {
        const params = { limit: 50 };
        if (filter.value !== 'all') params.type = filter.value;
        const data = await API.getTimeline(store.babyId, params) || [];
        items.value = data.map(e => ({
          ...e,
          title: eventTitle(e),
          detail: eventDetail(e),
        }));
      } catch (e) {
        console.warn('Timeline error:', e);
      } finally {
        refreshing.value = false;
      }
    }

    function eventTitle(e) {
      if (e.type === 'feed') return '飲奶 — ' + (e.feed_type === 'breast' ? '母乳' : e.feed_type === 'bottle' ? '奶瓶' : '固體');
      if (e.type === 'diaper') return '換片 — ' + ({ wet: '尿尿', dirty: '便便', both: '混合' }[e.diaper_type] || '');
      if (e.type === 'sleep') return '睡眠';
      if (e.type === 'growth') return '成長記錄';
      return e.type;
    }

    function eventDetail(e) {
      if (e.type === 'feed' && e.amount_ml) return e.amount_ml + 'ml';
      if (e.type === 'feed' && e.duration) return fmtDuration(e.duration);
      if (e.type === 'sleep' && e.duration) return fmtDuration(e.duration);
      if (e.type === 'growth') {
        const parts = [];
        if (e.weight_kg) parts.push(e.weight_kg + 'kg');
        if (e.height_cm) parts.push(e.height_cm + 'cm');
        return parts.join(' · ');
      }
      return '';
    }

    function tagType(type) {
      return { feed: 'warning', diaper: 'success', sleep: 'primary', growth: 'default' }[type] || 'default';
    }
    function typeLabel(type) {
      return { feed: '飲奶', diaper: '換片', sleep: '睡眠', growth: '成長' }[type] || type;
    }

    onMounted(loadData);

    return { items, refreshing, filter, filterOptions, grouped, loadData, tagType, typeLabel, fmtTime };
  },
};

/* ---------- STATS PAGE ---------- */
const StatsPage = {
  name: 'StatsPage',
  template: `
    <div class="page-container">
      <van-nav-bar title="統計" left-arrow @click-left="$router.back()" />

      <van-tabs v-model:active="activeTab" animated>
        <van-tab title="飲奶">
          <van-cell-group inset style="margin: 12px 16px;">
            <van-cell title="今日次數" :value="feedStats.todayCount + ' 次'" />
            <van-cell title="今日總量" :value="feedStats.todayTotal + ' ml'" />
            <van-cell title="最近一次" :value="feedStats.lastFeedTime" />
            <van-cell title="7日平均" :value="feedStats.weekAvg + ' ml/日'" />
          </van-cell-group>
        </van-tab>
        <van-tab title="換片">
          <van-cell-group inset style="margin: 12px 16px;">
            <van-cell title="今日次數" :value="diaperStats.todayCount + ' 次'" />
            <van-cell title="尿尿" :value="diaperStats.wetCount + ' 次'" />
            <van-cell title="便便" :value="diaperStats.dirtyCount + ' 次'" />
            <van-cell title="7日平均" :value="diaperStats.weekAvg + ' 次/日'" />
          </van-cell-group>
        </van-tab>
        <van-tab title="睡眠">
          <van-cell-group inset style="margin: 12px 16px;">
            <van-cell title="今日次數" :value="sleepStats.todayCount + ' 次'" />
            <van-cell title="今日總時長" :value="sleepStats.todayHours + ' 小時'" />
            <van-cell title="最長一次" :value="sleepStats.longestToday" />
            <van-cell title="7日平均" :value="sleepStats.weekAvg + ' 小時/日'" />
          </van-cell-group>
        </van-tab>
      </van-tabs>
    </div>
  `,
  setup() {
    const activeTab = ref(0);
    const feedStats = reactive({ todayCount: 0, todayTotal: 0, lastFeedTime: '--', weekAvg: 0 });
    const diaperStats = reactive({ todayCount: 0, wetCount: 0, dirtyCount: 0, weekAvg: 0 });
    const sleepStats = reactive({ todayCount: 0, todayHours: 0, longestToday: '--', weekAvg: 0 });

    async function loadData() {
      try {
        const [feeds, diapers, sleeps] = await Promise.all([
          API.getFeeds(store.babyId, { date: todayStart() }),
          API.getDiapers(store.babyId, { date: todayStart() }),
          API.getSleeps(store.babyId, { date: todayStart() }),
        ]);

        // Feed stats
        feedStats.todayCount = feeds?.length || 0;
        feedStats.todayTotal = feeds?.reduce((s, f) => s + (f.amount_ml || 0), 0) || 0;
        if (feeds?.length > 0) {
          feedStats.lastFeedTime = fmtTime(feeds[0].start_time);
        }
        feedStats.weekAvg = Math.round(feedStats.todayTotal * 7 / Math.max(feedStats.todayCount, 1));

        // Diaper stats
        diaperStats.todayCount = diapers?.length || 0;
        diaperStats.wetCount = diapers?.filter(d => d.type === 'wet' || d.type === 'both').length || 0;
        diaperStats.dirtyCount = diapers?.filter(d => d.type === 'dirty' || d.type === 'both').length || 0;
        diaperStats.weekAvg = diaperStats.todayCount;

        // Sleep stats
        sleepStats.todayCount = sleeps?.length || 0;
        let totalMin = 0;
        let longestMin = 0;
        sleeps?.forEach(sl => {
          if (sl.start_time && sl.end_time) {
            const dur = (new Date(sl.end_time) - new Date(sl.start_time)) / 60000;
            totalMin += dur;
            if (dur > longestMin) longestMin = dur;
          }
        });
        sleepStats.todayHours = (totalMin / 60).toFixed(1);
        sleepStats.longestToday = longestMin > 0 ? fmtDuration(Math.floor(longestMin * 60)) : '--';
        sleepStats.weekAvg = sleepStats.todayHours;
      } catch (e) {
        console.warn('Stats error:', e);
      }
    }

    onMounted(loadData);

    return { activeTab, feedStats, diaperStats, sleepStats };
  },
};

/* ---------- SETTINGS PAGE ---------- */
const SettingsPage = {
  name: 'SettingsPage',
  template: `
    <div class="page-container">
      <van-nav-bar title="設定" left-arrow @click-left="$router.back()" />

      <van-cell-group inset title="BB資料" style="margin-top: 12px;">
        <van-field v-model="form.name" label="名稱" placeholder="BB暱稱" />
        <van-field v-model="form.birthday" label="出生日期" placeholder="YYYY-MM-DD" />
        <van-field v-model="form.gender" is-link readonly label="性別" @click="showGenderPicker = true" />
        <van-field v-model="form.birth_weight" type="number" label="出生體重 (kg)" placeholder="選填" />
        <van-field v-model="form.birth_height" type="number" label="出生身高 (cm)" placeholder="選填" />
      </van-cell-group>

      <div class="px-16" style="padding-top: 12px;">
        <van-button type="primary" block round @click="saveBaby" :loading="saving">儲存</van-button>
      </div>

      <van-cell-group inset title="功能" style="margin-top: 16px;">
        <van-cell title="匯出CSV" is-link @click="exportCSV">
          <template #icon><van-icon name="down" style="margin-right:8px;" /></template>
        </van-cell>
        <van-cell title="新增BB" is-link @click="showAddBaby = true">
          <template #icon><van-icon name="friends-o" style="margin-right:8px;" /></template>
        </van-cell>
      </van-cell-group>

      <van-cell-group inset title="關於" style="margin-top: 16px; margin-bottom: 24px;">
        <van-cell title="版本" value="1.0.0" />
      </van-cell-group>

      <!-- Gender Picker -->
      <van-popup v-model:show="showGenderPicker" position="bottom" round>
        <van-picker title="性別" :columns="genderOptions" @confirm="onGenderConfirm" @cancel="showGenderPicker = false" />
      </van-popup>

      <!-- Add Baby Popup -->
      <van-popup v-model:show="showAddBaby" position="bottom" round style="padding: 16px; padding-bottom: 32px;">
        <div style="font-size:16px; font-weight:600; text-align:center; margin-bottom:16px;">新增BB</div>
        <van-cell-group inset>
          <van-field v-model="newBaby.name" label="名稱" placeholder="BB暱稱" />
          <van-field v-model="newBaby.birthday" label="出生日期" placeholder="YYYY-MM-DD" />
          <van-field v-model="newBaby.gender" is-link readonly label="性別" @click="showNewGenderPicker = true" />
        </van-cell-group>
        <div style="padding: 16px 0;">
          <van-button type="primary" block round @click="addBaby" :loading="saving">新增</van-button>
        </div>
      </van-popup>
      <van-popup v-model:show="showNewGenderPicker" position="bottom" round>
        <van-picker title="性別" :columns="genderOptions" @confirm="onNewGenderConfirm" @cancel="showNewGenderPicker = false" />
      </van-popup>
    </div>
  `,
  setup() {
    const form = reactive({ name: '', birthday: '', gender: '', birth_weight: '', birth_height: '' });
    const saving = ref(false);
    const showGenderPicker = ref(false);
    const showAddBaby = ref(false);
    const showNewGenderPicker = ref(false);
    const newBaby = reactive({ name: '', birthday: '', gender: '' });
    const genderOptions = [
      { text: '男', value: 'M' },
      { text: '女', value: 'F' },
    ];

    onMounted(() => {
      if (store.baby) {
        form.name = store.baby.name || '';
        form.birthday = store.baby.birthday || '';
        form.gender = store.baby.gender === 'M' ? '男' : store.baby.gender === 'F' ? '女' : '';
        form.birth_weight = store.baby.birth_weight_kg || '';
        form.birth_height = store.baby.birth_height_cm || '';
      }
    });

    function onGenderConfirm({ selectedOptions }) {
      form.gender = selectedOptions[0]?.text || '';
      showGenderPicker.value = false;
    }
    function onNewGenderConfirm({ selectedOptions }) {
      newBaby.gender = selectedOptions[0]?.text || '';
      showNewGenderPicker.value = false;
    }

    async function saveBaby() {
      if (!form.name) return showToast('請輸入名稱');
      try {
        saving.value = true;
        const genderMap = { '男': 'M', '女': 'F' };
        await API.updateBaby(store.babyId, {
          name: form.name,
          birthday: form.birthday || null,
          gender: genderMap[form.gender] || null,
          birth_weight_kg: form.birth_weight ? Number(form.birth_weight) : null,
          birth_height_cm: form.birth_height ? Number(form.birth_height) : null,
        });
        showSuccessToast('已儲存');
        await loadBaby();
      } catch (e) {
        showToast('儲存失敗');
      } finally {
        saving.value = false;
      }
    }

    async function addBaby() {
      if (!newBaby.name) return showToast('請輸入名稱');
      try {
        saving.value = true;
        const genderMap = { '男': 'M', '女': 'F' };
        await API.createBaby({
          name: newBaby.name,
          birthday: newBaby.birthday || null,
          gender: genderMap[newBaby.gender] || null,
        });
        showSuccessToast('已新增');
        showAddBaby.value = false;
        await loadBaby();
      } catch (e) {
        showToast('新增失敗');
      } finally {
        saving.value = false;
      }
    }

    async function exportCSV() {
      try {
        showLoadingToast({ message: '匯出中...', forbidClick: true });
        const data = await API.exportCSV(store.babyId);
        closeToast();
        // Download CSV
        const blob = new Blob([data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'baby-data.csv';
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        closeToast();
        showToast('匯出失敗');
      }
    }

    return {
      form, saving, showGenderPicker, showAddBaby, showNewGenderPicker, newBaby,
      genderOptions, onGenderConfirm, onNewGenderConfirm, saveBaby, addBaby, exportCSV,
    };
  },
};

/* ============================================================
 * ROUTER
 * ============================================================ */
const routes = [
  { path: '/', component: HomePage },
  { path: '/feed', component: FeedPage },
  { path: '/diaper', component: DiaperPage },
  { path: '/sleep', component: SleepPage },
  { path: '/more', component: MorePage },
  { path: '/more/growth', component: GrowthPage },
  { path: '/more/vaccine', component: VaccinePage },
  { path: '/more/timeline', component: TimelinePage },
  { path: '/more/stats', component: StatsPage },
  { path: '/more/settings', component: SettingsPage },
];

const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes,
});

/* ============================================================
 * APP INIT
 * ============================================================ */
const app = Vue.createApp({
  setup() {
    const activeTab = ref(0);
    return { activeTab };
  },
});

app.use(router);
app.use(vant);
app.mount('#app');

/* ============================================================
 * PWA: register service worker
 * ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
