(() => {
  const root = document.getElementById("november-calendars");
  const find = key => root.querySelector("[data-" + key + "]");
  const dateStrip = find("dates");
  const hoursPane = find("hours");
  const calendar = hoursPane.closest(".calendar");
  const owner = find("owner");
  const peoplePicker = find("people");
  const tools = find("tools");
  const windowsPane = find("windows");
  const details = find("details");
  const feedback = find("feedback");
  const durationInput = find("duration");
  const movesInput = find("moves");
  const lastResortInput = find("last-resort");
  const demoMode = root.hasAttribute("data-demo");
  const apiOrigin = root.dataset.apiOrigin;
  const sessionKey = "friends-calendar-november-session";
  let apiToken = apiOrigin ? sessionStorage.getItem(sessionKey) : null;
  const mobile = window.matchMedia("(max-width: 599px)");
  const demoPeople = ["Глеб", "Алиса", "Соня", "Кристина", "Лиза", "Даша"];
  let people = demoMode ? demoPeople : [];
  let marks = demoMode ? demoPeople.map(() => []) : [];
  let viewer = demoMode ? 0 : -1;
  let identity = -1;
  let saving = false;
  let signingIn = false;
  let initialized = demoMode;
  const signin = find("signin");
  const sessionNote = find("session-note");
  const statuses = [
    {label:"Без отметки", symbol:"", cost:6},
    {label:"Свободен", symbol:"✓", cost:0},
    {label:"Перенесу", symbol:"↔", cost:1},
    {label:"Крайний случай", symbol:"!", cost:3},
    {label:"Не знаю", symbol:"?", cost:5},
    {label:"Занят", symbol:"×", cost:10}
  ];
  const statusOrder = [5,3,2,4,1,0];
  const statusFilters = {2:movesInput, 3:lastResortInput};
  const dayHours = 24;
  const dates = Array.from({length:18}, (_, index) => {
    const number = 13 + index;
    const weekday = (5 + index) % 7;
    return {number, weekday: ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][weekday], weekend: weekday === 0 || weekday === 6};
  });
  let columnCount = 1;
  function fittingDays() {
    const fits = Math.floor((hoursPane.clientWidth - 64) / 128);
    return mobile.matches ? 1 : Math.min(dates.length, Math.max(1, fits));
  }
  const state = {section:"mine", person:-1, day:0, brush:1, start:10, duration:1, range:false, anchor:null};
  function statusAt(person, index) {
    const hour = index % dayHours;
    return marks[person]?.[index] ?? (hour < 10 || hour === 23 ? 5 : 0);
  }
  let drag = null;
  let ignoreClick = false;

  function clock(hour) {
    return String(hour).padStart(2, "0") + ":00";
  }

  function dateLabel(day) {
    return dates[day].weekday + ", " + dates[day].number + " ноября";
  }

  function timeLabel(start, duration = 1) {
    const hour = start % dayHours;
    return dateLabel(Math.floor(start / dayHours)) + " · " + clock(hour) + "–" + clock(hour + duration);
  }

  function worst(a, b) {
    return statuses[a].cost >= statuses[b].cost ? a : b;
  }

  function summarize(start, duration) {
    const slots = people.map((_, person) => Array.from({length:duration}, (_, hour) =>
      statusAt(person, start + hour)));
    const answers = slots.map(hours => hours.reduce(worst, 1));
    const present = new Set(slots.flat());
    return {
      start, duration, answers, tone: statusOrder.find(status => present.has(status)) ?? 0,
      free: answers.filter(s => s === 1).length,
      present, slots,
      pending: answers.filter(s => s === 0 || s === 4).length,
      cost: answers.reduce((sum, s) => sum + statuses[s].cost, 0)
    };
  }

  function cell(index, person) {
    const editable = state.section === "mine" && person >= 0;
    const group = person === -1;
    const summary = group ? summarize(index, 1) : null;
    const status = group ? summary.tone : statusAt(person, index);
    const selected = !editable && index >= state.start && index < state.start + state.duration;
    const count = group ? groupCount(summary) : null;
    const mark = group ? count.number + "/" + people.length : statuses[status].symbol;
    const label = group ? count.label + " " + count.number + " из " + people.length :
      people[person] + " · " + statuses[status].label;
    return '<button type="button" ' + (editable ? 'data-edit' : 'data-slot') + '="' + index +
      '" data-person-cell="' + person + '" data-status="' + status + '"' +
      (editable ? (state.anchor === index ? ' data-preview' : '') : ' aria-pressed="' + selected + '"') +
      ' aria-label="' + timeLabel(index) + ' · ' + label + '" title="' + label + '">' +
      mark + '</button>';
  }

  function groupCount({slots}) {
    return {
      number:slots.filter(hours => hours.every(status => status === 1 || statusFilters[status]?.checked)).length,
      label:movesInput.checked || lastResortInput.checked ? "могут" : "свободны"
    };
  }

  function renderHours() {
    if (!initialized || (state.section === "mine" && viewer < 0)) {
      hoursPane.innerHTML = "";
      find("period").textContent = "";
      calendar.hidden = true;
      return;
    }
    calendar.hidden = false;
    columnCount = fittingDays();
    const person = state.section === "mine" ? viewer : state.person;
    const columns = dates.slice(state.day, state.day + columnCount);
    const title = columns.length === 1 ? dateLabel(state.day) :
      columns[0].number + "–" + columns.at(-1).number + " ноября";
    hoursPane.innerHTML = '<div class="hour-grid">' +
      '<span class="grid-label"></span>' +
      columns.map(date => '<strong class="grid-label">' + date.weekday + ' ' + date.number + '</strong>').join('') +
      Array.from({length:dayHours}, (_, hour) => '<span class="hour-label" data-hour-row="' + hour +
        '">' + clock(hour) + '</span>' + columns.map((_, day) => cell((state.day + day) * dayHours + hour, person)).join('')).join('') +
      '</div>';
    find("period").textContent = title;
    hoursPane.firstElementChild.style.setProperty("--columns", columns.length);
  }

  function scrollToHour(hour) {
    const row = hoursPane.querySelector('[data-hour-row="' + hour + '"]');
    row?.scrollIntoView({block:"start"});
  }

  function renderWindows() {
    const visible = initialized && state.section === "group" && state.person === -1;
    if (!visible) return;
    const duration = Number(durationInput.value);
    const includePending = find("pending").checked;
    const relevantDates = dates.slice(state.day, state.day + columnCount);
    const windows = relevantDates.flatMap((_, offset) => Array.from({length:dayHours - duration + 1},
      (_, hour) => summarize((state.day + offset) * dayHours + hour, duration)))
      .filter(window => !window.present.has(5) && (movesInput.checked || !window.present.has(2)) &&
        (lastResortInput.checked || !window.present.has(3)) && (includePending || !window.pending))
      .sort((a, b) => a.pending - b.pending || b.free - a.free || a.cost - b.cost || a.start - b.start);
    find("results").innerHTML = windows.length ? '<ul class="window-list">' + windows.slice(0, 5).map(window => {
      const count = groupCount(window);
      const label = count.label[0].toUpperCase() + count.label.slice(1);
      const toneLabel = window.tone === 1 ? '' : ' · ' + statuses[window.tone].label;
      return '<li><button type="button" data-window="' + window.start + '" data-status="' + window.tone +
        '" aria-pressed="' + (state.start === window.start && state.duration === duration) + '"><strong>' +
        timeLabel(window.start, duration) + '</strong><span>' + label + ' ' + count.number + '/' + people.length +
        toneLabel + '</span></button></li>';
    }).join('') +
      '</ul><p class="feedback">Подходящих окон — ' + windows.length + '</p>' :
      '<p class="feedback">На выбранные даты подходящих окон нет.</p>';
  }

  function renderDetails() {
    if (!initialized || state.section === "mine") {
      details.innerHTML = "";
      return;
    }
    const summary = summarize(state.start, state.duration);
    const {answers} = summary;
    const count = groupCount(summary);
    const group = state.person === -1;
    details.innerHTML = '<strong>' + timeLabel(state.start, state.duration) + (group ? ' · ' + count.label + ' ' + count.number + '/' + people.length : '') +
      '</strong><div class="answers">' + answers.map((status, index) => group || state.person === index ?
        '<span data-status="' + status + '">' + people[index] + ' · ' + statuses[status].label + '</span>' : '').join('') + '</div>';
  }

  function renderTools() {
    tools.hidden = !initialized || (state.section === "mine" && viewer < 0);
    const editable = state.section === "mine";
    tools.innerHTML = statusOrder.map(index => {
      const {label, symbol} = statuses[index];
      const caption = (symbol ? symbol + ' ' : '') + (editable && index === 0 ? "Стереть" : label);
      return editable ? '<button type="button" data-brush="' + index + '" data-status="' + index +
        '" aria-pressed="' + (state.brush === index) + '">' + caption + '</button>' :
        '<span data-status="' + index + '">' + caption + '</span>';
    }).join('') + (editable ? '<button type="button" data-range aria-pressed="' + state.range + '">Диапазон</button>' : '');
  }

  function updateDates() {
    for (const button of dateStrip.querySelectorAll("[data-date]")) {
      const active = Number(button.dataset.date) === state.day;
      button.setAttribute("aria-current", active ? "date" : "false");
      if (active) {
        const rect = button.getBoundingClientRect();
        const strip = dateStrip.getBoundingClientRect();
        if (rect.left < strip.left) dateStrip.scrollLeft += rect.left - strip.left - 3;
        if (rect.right > strip.right) dateStrip.scrollLeft += rect.right - strip.right + 3;
      }
    }
    root.querySelector('[data-step="-1"]').disabled = state.day === 0;
    root.querySelector('[data-step="1"]').disabled = state.day === dates.length - 1;
  }

  function render() {
    for (const button of root.querySelectorAll("[data-section], [data-person], [data-identity-option]")) {
      const {section, person, identityOption} = button.dataset;
      const selected = section !== undefined ? section === state.section :
        person !== undefined ? Number(person) === state.person : Number(identityOption) === (identity >= 0 ? identity : viewer);
      button.setAttribute("aria-pressed", selected);
      if (identityOption !== undefined) button.disabled = saving || signingIn;
    }
    signin.hidden = demoMode || identity < 0;
    signin.querySelector("button").disabled = signingIn;
    find("signout").hidden = demoMode || viewer < 0;
    find("date-controls").hidden = !initialized || (state.section === "mine" && viewer < 0);
    find("quick-hours").hidden = find("date-controls").hidden;
    peoplePicker.hidden = !initialized || state.section === "mine";
    owner.textContent = state.section === "mine" ? (viewer < 0 ? "" : "Мой календарь · " + people[viewer]) :
      state.person === -1 ? "Все участники" : "Календарь · " + people[state.person];
    updateDates();
    renderTools();
    windowsPane.hidden = !initialized || state.section !== "group" || state.person !== -1;
    renderHours();
    renderWindows();
    renderDetails();
  }

  function setDay(day) {
    if (day < 0 || day >= dates.length) return;
    state.day = day;
    state.start = day * dayHours + state.start % dayHours;
    state.duration = 1;
    state.anchor = null;
    feedback.textContent = "";
    render();
  }

  function rectangle(a, b) {
    const firstDay = Math.min(Math.floor(a / dayHours), Math.floor(b / dayHours));
    const lastDay = Math.max(Math.floor(a / dayHours), Math.floor(b / dayHours));
    const firstHour = Math.min(a % dayHours, b % dayHours);
    const lastHour = Math.max(a % dayHours, b % dayHours);
    const result = [];
    for (let day = firstDay; day <= lastDay; day++) {
      for (let hour = firstHour; hour <= lastHour; hour++) result.push(day * dayHours + hour);
    }
    return result;
  }

  async function paint(a, b) {
    if (viewer < 0 || saving) return;
    const cells = rectangle(a, b);
    const status = state.brush;
    const participant = viewer;
    state.anchor = null;
    if (!demoMode) {
      saving = true;
      render();
      try {
        await request("/api/marks", "PUT", {cells, status, participant});
        for (const index of cells) marks[participant][index] = status;
      } catch (error) {
        feedback.textContent = error.message;
        return;
      } finally {
        saving = false;
        render();
      }
    }
    if (demoMode) for (const index of cells) marks[participant][index] = status;
    feedback.textContent = (status === 0 ? "Отметки сняты" : statuses[status].label) + " · часов — " + cells.length;
    if (state.section === "mine") {
      renderHours();
      hoursPane.querySelector('[data-edit="' + b + '"]')?.focus({preventScroll:true});
    }
  }

  function selectWindow(index, duration) {
    state.start = index;
    state.duration = duration;
    renderHours();
    renderDetails();
    renderWindows();
  }

  dateStrip.innerHTML = dates.map((date, index) => '<button type="button" data-date="' + index +
    '"' + (date.weekend ? ' data-weekend' : '') + ' aria-label="' + dateLabel(index) + '"><span>' + date.weekday +
    '</span><strong>' + date.number + '</strong></button>').join('');
  function renderPeople() {
    const display = name => name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    find("identity").innerHTML = people.map((name, index) =>
      '<button type="button" data-identity-option="' + index + '">' + display(name) + '</button>').join('');
    peoplePicker.innerHTML = '<button type="button" data-person="-1">Все</button>' +
      people.map((name, index) => '<button type="button" data-person="' + index + '">' + display(name) + '</button>').join('');
  }

  async function request(path, method = "GET", body) {
    const headers = new Headers();
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (apiToken) headers.set("Authorization", "Bearer " + apiToken);
    const response = await fetch((apiOrigin ?? "") + path, {
      method, cache:"no-store",
      headers,
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  async function load() {
    try {
      const result = await request("/api/calendar");
      people = result.people;
      marks = result.marks;
      viewer = result.viewer;
      initialized = true;
      sessionNote.textContent = viewer < 0 ? "Выберите своё имя и введите код приглашения." : "Вы отмечаете как " + people[viewer] + ".";
      renderPeople();
      render();
    } catch (error) {
      sessionNote.textContent = "Календарь не загрузился. Обновите страницу.";
    }
  }

  signin.addEventListener("submit", async event => {
    event.preventDefault();
    if (identity < 0 || signingIn) return;
    signingIn = true;
    render();
    const input = signin.elements.code;
    try {
      const result = await request("/api/session", "POST", {participant:identity, code:input.value});
      if (apiOrigin) {
        apiToken = result.token;
        sessionStorage.setItem(sessionKey, apiToken);
      }
      viewer = result.viewer;
      identity = -1;
      state.section = "mine";
      input.value = "";
      sessionNote.textContent = "Вы отмечаете как " + people[viewer] + ".";
    } catch (error) {
      sessionNote.textContent = error.message;
    } finally {
      signingIn = false;
      render();
    }
  });

  root.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const d = button.dataset;
    if ("identityOption" in d) {
      if (saving || signingIn) return;
      identity = Number(d.identityOption);
      if (demoMode) {
        viewer = identity;
        state.section = "mine";
        sessionNote.textContent = "Вы отмечаете как " + people[viewer] + ".";
      } else {
        sessionNote.textContent = "Выбрано имя: " + people[identity] + ".";
      }
      state.anchor = null;
      feedback.textContent = "";
      render();
      if (!demoMode) signin.elements.code.focus();
    } else if ("signout" in d) {
      if (!saving) signOut();
    } else if ("jump" in d) {
      scrollToHour(Number(d.jump));
    } else if ("section" in d || "person" in d) {
      if ("section" in d) state.section = d.section;
      if ("person" in d) state.person = Number(d.person);
      state.anchor = null;
      feedback.textContent = "";
      render();
      if (!demoMode && state.section === "group" && !saving) refreshMarks();
    } else if ("step" in d || "date" in d) {
      setDay("step" in d ? state.day + Number(d.step) : Number(d.date));
      if (button.disabled) dateStrip.querySelector('[aria-current="date"]').focus({preventScroll:true});
    } else if ("brush" in d || "range" in d) {
      const selector = "brush" in d ? '[data-brush="' + d.brush + '"]' : "[data-range]";
      if ("brush" in d) state.brush = Number(d.brush);
      else state.range = !state.range;
      state.anchor = null;
      feedback.textContent = state.range ? "Выберите первый и последний час диапазона." : "";
      renderTools();
      renderHours();
      tools.querySelector(selector).focus();
    } else if ("edit" in d) {
      if (ignoreClick && event.detail !== 0) return;
      const index = Number(d.edit);
      if (state.range && state.anchor === null) {
        state.anchor = index;
        button.setAttribute("data-preview", "");
        feedback.textContent = "Теперь выберите последний час диапазона.";
      } else {
        paint(state.anchor ?? index, index);
      }
    } else if ("slot" in d || "window" in d) {
      const ranked = "window" in d;
      const index = Number(ranked ? d.window : d.slot);
      const focus = ranked ? '[data-window="' + index + '"]' :
        '[data-slot="' + index + '"][data-person-cell="' + d.personCell + '"]';
      selectWindow(index, ranked ? Number(durationInput.value) : 1);
      if (ranked) scrollToHour(index % dayHours);
      root.querySelector(focus)?.focus({preventScroll:true});
    }
  });

  hoursPane.addEventListener("pointerdown", event => {
    const button = event.target.closest("[data-edit]");
    if (!button || state.range || event.pointerType !== "mouse" || event.button !== 0) return;
    const anchor = Number(button.dataset.edit);
    drag = {id:event.pointerId, anchor, end:anchor};
  });

  hoursPane.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    const target = event.target.closest("[data-edit]");
    if (!target) return;
    const end = Number(target.dataset.edit);
    if (end === drag.end) return;
    drag.end = end;
    const highlighted = rectangle(drag.anchor, end);
    for (const button of hoursPane.querySelectorAll("[data-edit]")) {
      button.toggleAttribute("data-preview", highlighted.includes(Number(button.dataset.edit)));
    }
  });

  window.addEventListener("pointerup", event => {
    if (drag?.id !== event.pointerId) return;
    const {anchor, end} = drag;
    drag = null;
    if (anchor === end) {
      hoursPane.querySelectorAll("[data-preview]").forEach(button => button.removeAttribute("data-preview"));
      return;
    }
    ignoreClick = true;
    paint(anchor, end);
    setTimeout(() => { ignoreClick = false; }, 0);
  });
  window.addEventListener("pointercancel", () => {
    if (!drag) return;
    drag = null;
    hoursPane.querySelectorAll("[data-preview]").forEach(button => button.removeAttribute("data-preview"));
  });
  windowsPane.addEventListener("change", event => {
    if (event.target === movesInput || event.target === lastResortInput) {
      renderHours();
      renderDetails();
    }
    renderWindows();
  });
  async function refreshMarks() {
    try {
      const result = await request("/api/calendar");
      if (saving || state.section !== "group") return;
      marks = result.marks;
      if (state.section === "group") {
        renderHours();
        renderWindows();
        renderDetails();
      }
    } catch {
      feedback.textContent = "Не удалось обновить общие отметки.";
    }
  }

  async function signOut() {
    try {
      await request("/api/session", "DELETE");
      if (apiOrigin) {
        apiToken = null;
        sessionStorage.removeItem(sessionKey);
      }
      viewer = -1;
      identity = -1;
      state.anchor = null;
      feedback.textContent = "";
      sessionNote.textContent = "Выберите своё имя и введите код приглашения.";
      render();
    } catch (error) {
      sessionNote.textContent = error.message;
    }
  }

  function updateLayout() {
    const nextCount = fittingDays();
    if (calendar.hidden || columnCount === nextCount) return;
    const selectedDay = Math.floor(state.start / dayHours);
    if (selectedDay >= state.day + nextCount) {
      state.start = state.day * dayHours + state.start % dayHours;
      state.duration = 1;
    }
    state.anchor = null;
    drag = null;
    render();
  }
  new ResizeObserver(updateLayout).observe(hoursPane);
  mobile.addEventListener("change", updateLayout);
  renderPeople();
  render();
  if (demoMode) {
    sessionNote.textContent = "Вы отмечаете как " + people[viewer] + ". Нажмите на другое имя, чтобы сменить участника.";
  }
  else load();
})();
