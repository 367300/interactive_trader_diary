/**
 * Справочник инструментов: каскад таксономии без перезагрузки, список через fetch.
 */
(function () {
  const cfg = window.__instrumentListConfig;
  if (!cfg) return;

  const root = document.getElementById('instrument-list-ajax-root');
  const form = document.getElementById('instrument-filter-form');
  const loading = document.getElementById('instrument-list-loading');
  const taxonomyEl = document.getElementById('instrument-taxonomy-data');
  if (!root || !form || !taxonomyEl) return;

  let taxonomy;
  try {
    taxonomy = JSON.parse(taxonomyEl.textContent);
  } catch (e) {
    console.error('instrument_list: taxonomy JSON', e);
    return;
  }

  const sector = document.getElementById('sector');
  const industryGroup = document.getElementById('industry_group');
  const industry = document.getElementById('industry');
  const subIndustry = document.getElementById('sub_industry');

  function showLoading(on) {
    if (!loading) return;
    loading.classList.toggle('d-none', !on);
    loading.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function fillOptions(select, items, emptyLabel, selectedId) {
    const sel = selectedId != null && selectedId !== '' ? String(selectedId) : '';
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = emptyLabel;
    select.appendChild(opt0);
    (items || []).forEach((item) => {
      const o = document.createElement('option');
      o.value = item.id;
      o.textContent = item.name;
      if (String(item.id) === sel) o.selected = true;
      select.appendChild(o);
    });
  }

  function groupsForSector(sid) {
    if (!sid) return taxonomy.industry_groups;
    return taxonomy.industry_groups.filter(
      (g) => String(g.sector_id) === String(sid)
    );
  }

  function industriesForGroup(gid) {
    if (!gid) return taxonomy.industries;
    return taxonomy.industries.filter(
      (i) => String(i.industry_group_id) === String(gid)
    );
  }

  function subForIndustry(iid) {
    if (!iid) return taxonomy.sub_industries;
    return taxonomy.sub_industries.filter(
      (s) => String(s.industry_id) === String(iid)
    );
  }

  function onSectorChange() {
    fillOptions(
      industryGroup,
      groupsForSector(sector.value),
      '— Все —',
      ''
    );
    onIndustryGroupChange();
  }

  function onIndustryGroupChange() {
    fillOptions(
      industry,
      industriesForGroup(industryGroup.value),
      '— Все —',
      ''
    );
    onIndustryChange();
  }

  function onIndustryChange() {
    fillOptions(
      subIndustry,
      subForIndustry(industry.value),
      '— Все —',
      ''
    );
  }

  function initCascadeFromDom() {
    const savedSector = sector.value;
    const savedGroup = industryGroup.value;
    const savedInd = industry.value;
    const savedSub = subIndustry.value;
    fillOptions(sector, taxonomy.sectors, '— Все —', savedSector);
    fillOptions(
      industryGroup,
      groupsForSector(sector.value),
      '— Все —',
      savedGroup
    );
    fillOptions(
      industry,
      industriesForGroup(industryGroup.value),
      '— Все —',
      savedInd
    );
    fillOptions(
      subIndustry,
      subForIndustry(industry.value),
      '— Все —',
      savedSub
    );
  }

  sector.addEventListener('change', onSectorChange);
  industryGroup.addEventListener('change', onIndustryGroupChange);
  industry.addEventListener('change', onIndustryChange);

  initCascadeFromDom();

  async function fetchFragment(url) {
    showLoading(true);
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.html) {
        root.innerHTML = data.html;
      }
    } catch (err) {
      console.error(err);
      alert('Не удалось загрузить список. Попробуйте ещё раз.');
    } finally {
      showLoading(false);
    }
  }

  function queryFromForm() {
    const fd = new FormData(form);
    const sp = new URLSearchParams();
    fd.forEach((v, k) => {
      if (v !== '' && v != null) sp.append(k, v);
    });
    return sp.toString();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const q = queryFromForm();
    const url = q ? cfg.apiUrl + '?' + q : cfg.apiUrl;
    fetchFragment(url);
    const listUrl = q ? cfg.listUrl + '?' + q : cfg.listUrl;
    window.history.replaceState(null, '', listUrl);
  });

  root.addEventListener('click', function (e) {
    const a = e.target.closest('.instrument-list-pagination a.page-link');
    if (!a || !root.contains(a)) return;
    e.preventDefault();
    const u = new URL(a.href);
    const apiUrl = cfg.apiUrl + u.search;
    fetchFragment(apiUrl);
    window.history.replaceState(null, '', a.href);
  });

  function softResetList() {
    form.reset();
    const typeSelect = document.getElementById('type');
    if (typeSelect) typeSelect.value = 'STOCK';
    initCascadeFromDom();
    fetchFragment(cfg.apiUrl);
    window.history.replaceState(null, '', cfg.listUrl);
  }

  root.addEventListener('click', function (e) {
    const btn = e.target.closest('.instrument-list-reset-soft');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    softResetList();
  });

  const resetBtn = document.querySelector('.instrument-list-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function (e) {
      e.preventDefault();
      softResetList();
    });
  }
})();
