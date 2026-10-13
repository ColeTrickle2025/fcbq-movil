/* FCBQ Stats · app del móvil (solo lectura). Lee los datos que el PC deja en Google Drive. */
"use strict";
const DATA_FILE = "fcbq_movil_datos.json";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/* ------------------------------------------------------------------ utilidades */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SMALL = new Set(["de", "del", "la", "el", "i", "y", "les", "los"]);
const tc = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase().split(" ")
  .map((w, i) => (i && SMALL.has(w)) ? w : w.replace(/(^|[-·'(./])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())).join(" ");
const shortName = n => { const p = tc(n).split(" "); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0]; };
const first = n => tc(n).split(" ")[0];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function pdate(d) { const m = String(d || "").match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; }
const fdate = d => { const x = pdate(d); return x ? `${x.getDate()} ${MESES[x.getMonth()]}` : ""; };
const fhour = d => { const x = pdate(d); return x ? `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}` : ""; };
const sign = v => v == null ? "" : (v > 0 ? "+" + v : String(v));
const pmc = v => v > 0 ? "pos" : (v < 0 ? "neg" : "");
const mmss = s => `${Math.floor((s || 0) / 60)}:${String(Math.round((s || 0) % 60)).padStart(2, "0")}`;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } };
function toast(msg, type = "") {
  const t = document.createElement("div"); t.className = "toast " + type; t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), type === "err" ? 6000 : 3000);
}
const I = {
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
  google: '<svg viewBox="0 0 24 24" style="stroke:none"><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z"/><path fill="#fff" opacity=".55" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z"/></svg>',
};
const ballArt = `<svg class="art ball" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="#FFF0E6" stroke="none"/><circle cx="60" cy="60" r="32" fill="#F26B1D" stroke="none"/><g stroke="#7A2A04" stroke-width="2.6"><path d="M28 60h64M60 28v64"/><path d="M40 37c6 6 9 14 9 23s-3 17-9 23M80 37c-6 6-9 14-9 23s3 17 9 23"/></g></svg>`;

/* ------------------------------------------------------------------ datos guardados en el móvil (IndexedDB) */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("fcbq-movil", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { try { const d = await idb(); return await new Promise(r => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; } }
async function idbSet(k, v) { try { const d = await idb(); await new Promise(r => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = r; t.onerror = r; }); } catch (e) { } }

/* ------------------------------------------------------------------ estado */
const S = { data: null, group: lsGet("fcbq_vg") || "", token: null, tokenExp: 0, driveTime: null };
const V = () => (S.data.views[S.group] || S.data.views[""]);
const ALL = () => S.data.views[""];
function logo(url, name, size = 36) {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .34)}px`;
  const d = url && S.data && S.data.logos[url];
  if (d) return `<span class="logo" style="${st}"><img src="${d}" alt=""></span>`;
  const w = String(name || "").toUpperCase().match(/[A-ZÀ-Ý]{2,}/g) || ["?"];
  const skip = new Set(["CLUB", "CB", "BASQUET", "BÀSQUET", "DE", "DEL"]);
  const k = w.filter(x => !skip.has(x));
  return `<span class="logo ini" style="${st}">${esc(((k[0] || w[0])[0] + ((k[1] || "")[0] || "")).slice(0, 2))}</span>`;
}

/* ------------------------------------------------------------------ Google Drive */
function clientId() { return lsGet("fcbq_client_id") || ""; }
function gisReady() { return !!(window.google && google.accounts && google.accounts.oauth2); }
function getToken(interactive) {
  return new Promise((resolve, reject) => {
    if (S.token && Date.now() < S.tokenExp - 60000) return resolve(S.token);
    if (!clientId()) return reject(new Error("Falta configurar el ID de cliente de Google (en Más)."));
    if (!gisReady()) return reject(new Error("No se ha podido cargar el acceso de Google. ¿Hay internet?"));
    const tc_ = google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPE,
      callback: r => {
        if (r.error) return reject(new Error("Google no ha dado permiso: " + r.error));
        S.token = r.access_token; S.tokenExp = Date.now() + (r.expires_in || 3600) * 1000;
        lsSet("fcbq_logged", "1"); resolve(S.token);
      },
      error_callback: e => reject(new Error(e && e.type === "popup_closed" ? "Has cerrado la ventana de Google." : "No se ha podido entrar con Google.")),
    });
    tc_.requestAccessToken({ prompt: interactive ? "" : "none" });
  });
}
async function drive(path, token) {
  const r = await fetch("https://www.googleapis.com/drive/v3/" + path, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 401) { S.token = null; throw new Error("La sesión de Google ha caducado. Vuelve a pulsar Actualizar."); }
  if (!r.ok) throw new Error("Google Drive ha respondido con un error (" + r.status + ").");
  return r;
}
async function refreshFromDrive(interactive = true) {
  const token = await getToken(interactive);
  const q = encodeURIComponent(`name='${DATA_FILE}' and trashed=false`);
  const list = await (await drive(`files?q=${q}&orderBy=modifiedTime desc&pageSize=5&fields=files(id,name,modifiedTime,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`, token)).json();
  const f = (list.files || [])[0];
  if (!f) throw new Error(`No encuentro "${DATA_FILE}" en tu Drive. Revisa que el PC tenga la carpeta de copias en Google Drive.`);
  if (S.data && S.driveTime === f.modifiedTime) return false;
  const data = await (await drive(`files/${f.id}?alt=media&supportsAllDrives=true`, token)).json();
  if (!data || !data.views) throw new Error("El archivo de Drive no tiene el formato esperado.");
  S.data = data; S.driveTime = f.modifiedTime;
  await idbSet("bundle", data); await idbSet("driveTime", f.modifiedTime);
  return true;
}
async function doRefresh(btn, interactive = true) {
  const old = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Buscando en Drive…`; }
  try {
    const changed = await refreshFromDrive(interactive);
    toast(changed ? "Datos actualizados desde Drive" : "Ya tenías los datos más recientes", "ok");
    fixGroup(); router();
  } catch (e) { toast(e.message, "err"); }
  if (btn) { btn.disabled = false; btn.innerHTML = old; }
}
function fixGroup() { if (S.data && !S.data.views[S.group]) { S.group = ""; lsSet("fcbq_vg", null); } updateChamp(); }

/* ------------------------------------------------------------------ barra superior: campeonato */
function groupLabel(g) { return `${tc(g.category)}${g.group_name ? " · G" + g.group_name : ""}`; }
function updateChamp() {
  const b = $("#champ");
  if (!S.data) { b.hidden = true; return; }
  b.hidden = false;
  const g = S.data.groups.find(x => x.group_id === S.group);
  $("#champ-txt").textContent = g ? groupLabel(g) : "Todo";
  b.classList.toggle("on", !!g);
}
$("#champ").onclick = () => {
  const opts = [{ group_id: "", label: "Todos los partidos", sub: "Sin filtrar" }].concat(S.data.groups.map(g => ({ group_id: g.group_id, label: groupLabel(g), sub: tc(g.competition) })));
  openSheet(`<h4>Mostrar estadísticas de</h4>` + opts.map(o => `<div class="opt ${o.group_id === S.group ? "on" : ""}" data-g="${esc(o.group_id)}"><div><div>${esc(o.label)}</div><small>${esc(o.sub)}</small></div></div>`).join(""), sh => {
    $$(".opt", sh).forEach(x => x.onclick = () => { S.group = x.dataset.g; lsSet("fcbq_vg", S.group); closeSheet(); updateChamp(); router(); });
  });
};
function openSheet(html, bind) { const sh = $("#sheet"); sh.innerHTML = html; sh.hidden = false; $("#sheet-bg").hidden = false; bind && bind(sh); }
function closeSheet() { $("#sheet").hidden = true; $("#sheet-bg").hidden = true; }
$("#sheet-bg").onclick = closeSheet;

/* ------------------------------------------------------------------ navegación */
const routes = {};
let charts = [];
function chart(c, cfg) { const x = new Chart(c, cfg); charts.push(x); return x; }
if (window.Chart) { Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.font.size = 11; Chart.defaults.color = "#6B7686"; Chart.defaults.plugins.legend.labels.boxWidth = 10; }
const C = { o: "#F26B1D", b: "#2F6FED", n: "#0B1F3A", line: "#EEF1F6" };
function setTitle(t, back) { $("#title").textContent = t; $("#back").hidden = !back; }
$("#back").onclick = () => history.length > 1 ? history.back() : (location.hash = "#/inicio");
async function router() {
  const h = location.hash.replace(/^#\/?/, "") || "inicio";
  const [r, ...rest] = h.split("/");
  const arg = decodeURIComponent(rest.join("/"));
  const tab = { partido: "partidos", equipo: "equipos", jugador: "jugadores" }[r] || r;
  $$("#tabbar a").forEach(a => a.classList.toggle("on", a.dataset.t === tab));
  charts.forEach(c => c.destroy()); charts = [];
  window.scrollTo(0, 0);
  if (!S.data && r !== "mas") return routes.welcome();
  try { await (routes[r] || routes.inicio)(arg); }
  catch (e) { view.innerHTML = `<div class="empty">${ballArt}<h3>Algo ha fallado</h3><p>${esc(e.message)}</p></div>`; }
}
window.addEventListener("hashchange", router);

/* ------------------------------------------------------------------ bienvenida (sin datos) */
routes.welcome = () => {
  setTitle("FCBQ Stats");
  const hasId = !!clientId();
  view.innerHTML = `<div class="welcome">${ballArt}<h2>Tus estadísticas, en el móvil</h2>
    <p>La app lee los partidos que tu PC guarda en Google Drive. Solo tienes que entrar con tu cuenta de Google.</p>
    ${hasId ? `<button class="btn pri" id="go">${I.google} Entrar con Google y cargar</button>`
      : `<div class="info warn">${I.alert}<div>Primero hay que poner el <b>ID de cliente de Google</b> (solo una vez).</div></div><div style="height:10px"></div><a class="btn pri" href="#/mas">Ir a configurarlo</a>`}
    <div style="height:10px"></div><button class="btn" id="pick">${I.file} Abrir el archivo de datos a mano</button></div>`;
  const go = $("#go"); if (go) go.onclick = e => doRefresh(e.currentTarget, true);
  $("#pick").onclick = () => $("#filepick").click();
};
$("#filepick").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.views) throw new Error();
    S.data = data; S.driveTime = null; await idbSet("bundle", data); await idbSet("driveTime", null);
    toast("Datos cargados", "ok"); fixGroup(); location.hash = "#/inicio"; router();
  } catch (err) { toast("Ese archivo no es el de datos de FCBQ Stats (" + DATA_FILE + ")", "err"); }
  e.target.value = "";
};

/* ------------------------------------------------------------------ INICIO */
routes.inicio = () => {
  setTitle("FCBQ Stats");
  const d = V().dashboard, ex = S.data.extra || {};
  let html = "";
  const fol = d.followed || [];
  fol.forEach(t => {
    const ms = V().matches.filter(m => m.local_team_id === t.id || m.visitor_team_id === t.id);
    const last = ms[0];
    html += `<div class="hero"><div class="lab">Mi equipo</div>
      <a class="team" href="#/equipo/${t.id}">${logo(t.logo, t.name, 52)}<div><div class="nm">${esc(tc(t.name))}</div><div class="cat">${esc(tc(t.category))}</div>
      <div class="form">${(t.form || []).map(f => `<i class="${f}">${f}</i>`).join("")}</div></div>
      <div class="rec"><b>${t.wins}-${t.losses}</b><small>VICT · DERR</small></div></a>
      ${last ? `<a class="last" href="#/partido/${last.uid}"><div class="lab">Último partido · ${esc(fdate(last.date))}</div>${scoreRows(last, true)}</a>` : ""}</div>`;
    const up = (ex.upcoming || {})[t.id] || [];
    if (up.length) {
      const n = up[0], x = pdate(n.date);
      html += `<div class="sec">Próximo partido</div><div class="card next"><div class="when"><small>${x ? DIAS[x.getDay()] : ""}</small><b>${x ? x.getDate() : ""}</b><small>${x ? MESES[x.getMonth()] : ""}</small></div>
        <div style="min-width:0"><div class="vs">${esc(tc(n.local_name))}<br><span class="muted">vs</span> ${esc(tc(n.visitor_name))}</div><div class="muted" style="font-size:12px;margin-top:4px">${esc(fhour(n.date))} h · ${esc(tc(n.field))}</div></div></div>`;
    }
  });
  const k = d.kpi;
  html += `<div class="kpis"><div class="kpi"><b>${k.partidos}</b><span>Partidos</span></div><div class="kpi"><b>${k.jugadores}</b><span>Jugadores</span></div><div class="kpi"><b>${(k.jugadas || 0).toLocaleString("es")}</b><span>Jugadas</span></div></div>`;
  // clasificación de mi grupo
  const st = ex.standings || {};
  const gids = Object.keys(st).filter(g => !S.group || g === S.group);
  const mine = new Set(fol.map(t => t.id));
  gids.forEach(g => {
    const s = st[g];
    html += `<div class="sec">Clasificación · J${esc(s.round)}</div><div class="card"><div class="card-b" style="padding-top:10px"><table class="stand"><thead><tr><th>#</th><th style="text-align:left">Equipo</th><th>PJ</th><th>G</th><th>P</th><th>Pts</th></tr></thead><tbody>
      ${s.rows.map(r => `<tr class="${mine.has(r.team_id) ? "me" : ""}"><td>${r.pos ?? ""}</td><td class="t"><span class="tn">${logo(r.logo, r.name, 24)}${esc(tc(r.name))}</span></td><td>${r.pj}</td><td>${r.w}</td><td>${r.l}</td><td><b>${r.pts}</b></td></tr>`).join("")}
      </tbody></table></div></div>`;
  });
  if (d.leaders && d.leaders.length) {
    html += `<div class="sec">Máximos anotadores · puntos por partido</div><div class="card"><div class="card-b" style="padding-top:4px">` +
      d.leaders.slice(0, 5).map((p, i) => `<a class="lb" href="#/jugador/${encodeURIComponent(p.player_key)}"><span class="p">${i + 1}</span><span><div class="nm">${esc(tc(p.name))}</div><div class="tm">${esc(tc(p.team))}</div></span><span class="v">${p.ppg}<small>${p.pj} PJ</small></span></a>`).join("") + `</div></div>`;
  }
  if (!fol.length && d.recent.length) html += `<div class="sec">Últimos partidos</div>` + d.recent.map(matchCard).join("");
  html += `<p class="muted" style="text-align:center;font-size:12px;margin-top:16px">Datos del ${esc(S.data.generated)}</p>`;
  if (clientId()) html += `<button class="btn" id="upd-home">${I.refresh} Buscar datos nuevos en Drive</button>`;
  view.innerHTML = html;
  const uh = $("#upd-home"); if (uh) uh.onclick = e => doRefresh(e.currentTarget, true);
};
function scoreRows(m, dark) {
  const lw = m.local_score > m.visitor_score, vw = m.visitor_score > m.local_score;
  return `<div class="lrow ${vw ? "lose" : ""}">${logo(m.local_logo, m.local_name, 28)}<span class="n">${esc(tc(m.local_name))}</span><span class="s">${m.local_score ?? "-"}</span></div>
    <div class="lrow ${lw ? "lose" : ""}">${logo(m.visitor_logo, m.visitor_name, 28)}<span class="n">${esc(tc(m.visitor_name))}</span><span class="s">${m.visitor_score ?? "-"}</span></div>`;
}
function matchCard(m) {
  return `<a class="card mc" href="#/partido/${m.uid}"><div class="top2"><span>${esc(fdate(m.date))}${m.matchday ? " · J" + m.matchday : ""}</span><span>${esc(tc(m.category))}</span></div>${scoreRows(m)}
    ${m.real_local != null ? `<div class="real">Real por parciales: ${m.real_local} - ${m.real_visitor}</div>` : ""}</a>`;
}

/* ------------------------------------------------------------------ PARTIDOS */
routes.partidos = () => {
  setTitle("Partidos");
  const all = V().matches;
  view.innerHTML = `<div class="search">${I.search}<input class="input" id="q" placeholder="Buscar equipo…"></div><div id="ml"></div>`;
  const draw = q => {
    const f = all.filter(m => !q || (m.local_name + " " + m.visitor_name).toLowerCase().includes(q));
    $("#ml").innerHTML = f.length ? f.map(matchCard).join("") : `<div class="empty">${ballArt}<h3>No hay partidos</h3><p>Cuando el PC descargue partidos, aparecerán aquí.</p></div>`;
  };
  $("#q").oninput = e => draw(e.target.value.toLowerCase().trim());
  draw("");
};

/* ------------------------------------------------------------------ PARTIDO */
routes.partido = uid => {
  const d = S.data.match[uid];
  if (!d) throw new Error("Partido no encontrado.");
  const m = d.match, lw = m.local_score > m.visitor_score, vw = m.visitor_score > m.local_score;
  setTitle(`J${m.matchday || ""} · ${fdate(m.date)}`, true);
  view.innerHTML = `<div class="mh" id="mh"><div class="sc">
      <a class="t ${vw ? "lose" : "win"}" href="#/equipo/${m.local_team_id}">${logo(m.local_logo, m.local_name, 40)}<span class="n">${esc(tc(m.local_name))}</span></a>
      <div class="num"><span class="${vw ? "lo" : ""}">${m.local_score}</span><i></i><span class="${lw ? "lo" : ""}">${m.visitor_score}</span></div>
      <a class="t ${lw ? "lose" : "win"}" href="#/equipo/${m.visitor_team_id}">${logo(m.visitor_logo, m.visitor_name, 40)}<span class="n">${esc(tc(m.visitor_name))}</span></a></div>
      ${m.real_local != null ? `<div class="real">Real por parciales: ${m.real_local} - ${m.real_visitor}</div>` : ""}
      <div class="meta">${esc(tc(m.category))} · ${esc(fhour(m.date))} h · ${esc(tc(m.town))}</div></div>
    <div class="tabs" id="tabs"><button data-t="res" class="on">Resumen</button><button data-t="jug">Jugadores</button><button data-t="rot">Rotaciones</button><button data-t="pbp">Jugadas</button><button data-t="tir">Tiros</button></div>
    <div id="tab"></div>`;
  const setMh = () => document.documentElement.style.setProperty("--mh-h", ($("#mh")?.offsetHeight || 150) + "px");
  setMh();
  const tabs = { res: () => tRes(d), jug: () => tJug(d), rot: () => tRot(uid, d), pbp: () => tPbp(d), tir: () => tTir(d) };
  $$("#tabs button").forEach(b => b.onclick = () => {
    $$("#tabs button").forEach(x => x.classList.toggle("on", x === b));
    charts.forEach(c => c.destroy()); charts = [];
    tabs[b.dataset.t]();
    const top = $("#tabs").getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--top-h")) || 52) - ($("#mh")?.offsetHeight || 0);
    if (window.scrollY > top) window.scrollTo(0, top);
  });
  tRes(d);
};
const misses = rows => rows.some(r => (r.t1a || 0) > (r.t1m || 0) || (r.t2a || 0) > (r.t2m || 0) || (r.t3a || 0) > (r.t3m || 0));
const shot = (mm, a, ms) => ms ? `${mm}/${a}` : `${mm}`;
function tRes(d) {
  const m = d.match, L = d.teams.L || {}, Vt = d.teams.V || {}, P = d.partials;
  const ms = misses([...(d.players.L || []), ...(d.players.V || [])]);
  const row = (lab, a, b, ta, tb) => { const t = (a || 0) + (b || 0) || 1; return `<div><div class="lab">${lab}</div><div class="bars"><span class="r">${ta ?? a}</span><div class="bar L"><i style="width:${100 * (a || 0) / t}%"></i></div><div class="bar V"><i style="width:${100 * (b || 0) / t}%"></i></div><span>${tb ?? b}</span></div></div>`; };
  const ld = (s, k, lab, u) => { const p = d.leaders[s]?.[k]; if (!p) return ""; const v = k === "pts" ? p.pts : (k === "val" ? p.val : p.minutes); return `<div class="ld ${s}"><b>${v}<small>${u}</small></b><div class="w">#${esc(p.dorsal)} ${esc(shortName(p.name))}</div><div class="k">${lab}</div></div>`; };
  $("#tab").innerHTML = `<div class="card"><div class="card-h"><h3>Parciales</h3></div><div class="card-b"><table class="parts"><thead><tr><th></th>${P.map(p => `<th>P${p.period}</th>`).join("")}<th>T</th></tr></thead><tbody>
      <tr class="L"><td>${logo(m.local_logo, m.local_name, 22)}</td>${P.map(p => `<td class="${p.local > p.visitor ? "w" : ""}">${p.local}</td>`).join("")}<td class="tot">${m.local_score}${m.real_local != null && m.real_local !== m.local_score ? `<small>real ${m.real_local}</small>` : ""}</td></tr>
      <tr class="V"><td>${logo(m.visitor_logo, m.visitor_name, 22)}</td>${P.map(p => `<td class="${p.visitor > p.local ? "w" : ""}">${p.visitor}</td>`).join("")}<td class="tot">${m.visitor_score}${m.real_visitor != null && m.real_visitor !== m.visitor_score ? `<small>real ${m.real_visitor}</small>` : ""}</td></tr>
    </tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>Comparativa</h3><small><span style="color:var(--orange)">●</span> Local <span style="color:var(--blue)">●</span> Visit.</small></div><div class="card-b cmp">
      ${row("Puntos", L.pts, Vt.pts)}${row("Canastas de 2", L.t2m, Vt.t2m, shot(L.t2m, L.t2a, ms), shot(Vt.t2m, Vt.t2a, ms))}${row("Triples", L.t3m, Vt.t3m, shot(L.t3m, L.t3a, ms), shot(Vt.t3m, Vt.t3a, ms))}
      ${row("Tiros libres", L.t1m, Vt.t1m, shot(L.t1m, L.t1a, ms), shot(Vt.t1m, Vt.t1a, ms))}${row("Faltas", L.fouls, Vt.fouls)}</div></div>
    <div class="card"><div class="card-h"><h3>Evolución del marcador</h3></div><div class="card-b"><div class="chart"><canvas id="evo"></canvas></div></div></div>
    <div class="card"><div class="card-h"><h3>Líderes</h3></div><div class="card-b"><div class="leaders">${ld("L", "pts", "Anotador", "pts")}${ld("V", "pts", "Anotador", "pts")}${ld("L", "val", "Valoración", "val")}${ld("V", "val", "Valoración", "val")}</div></div></div>`;
  const tl = d.timeline, hasMin = tl.length && tl.every(t => t.minute != null);
  const plen = m.period_minutes || 6, np = m.periods || P.length || 4;
  chart($("#evo"), { type: "line", data: { datasets: [
    { label: first(m.local_name), data: tl.map((t, i) => ({ x: hasMin ? t.minute : i, y: t.local })), borderColor: C.o, backgroundColor: "rgba(242,107,29,.08)", fill: true, stepped: true, pointRadius: 0, borderWidth: 2.5 },
    { label: first(m.visitor_name), data: tl.map((t, i) => ({ x: hasMin ? t.minute : i, y: t.visitor })), borderColor: C.b, backgroundColor: "rgba(47,111,237,.06)", fill: true, stepped: true, pointRadius: 0, borderWidth: 2.5 }] },
    options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom" } },
      scales: { x: { type: "linear", min: 0, max: hasMin ? plen * np : Math.max(1, tl.length - 1), grid: { color: c => hasMin && c.tick.value % plen === 0 ? "#D5DBE5" : "transparent" }, ticks: { stepSize: hasMin ? plen : 10, callback: v => hasMin && v < plen * np ? "P" + (v / plen + 1) : "" } },
        y: { beginAtZero: true, grid: { color: C.line } } } } });
}
function teamSeg(d, cur, cb) {
  const m = d.match;
  return `<div class="seg"><button class="L ${cur === "L" ? "on" : ""}" data-s="L">${logo(m.local_logo, m.local_name, 20)}<span>${esc(first(m.local_name) === "Club" ? tc(m.local_name) : tc(m.local_name))}</span></button><button class="V ${cur === "V" ? "on" : ""}" data-s="V">${logo(m.visitor_logo, m.visitor_name, 20)}<span>${esc(tc(m.visitor_name))}</span></button></div>`;
}
let segSide = "L";
function bindSeg(fn) { $$(".seg button").forEach(b => b.onclick = () => { segSide = b.dataset.s; fn(); }); }
function tJug(d) {
  const draw = () => {
    const s = segSide, ps = [...(d.players[s] || [])].sort((a, b) => b.pts - a.pts || b.minutes - a.minutes), tg = d.teams[s] || {};
    const ms = misses([...(d.players.L || []), ...(d.players.V || [])]);
    $("#tab").innerHTML = teamSeg(d, s) + `<div class="card ${s}">` + ps.map(p => `<a class="pc" href="#/jugador/${encodeURIComponent(p.player_key)}" style="display:block">
        <div class="h"><span class="dorsal">${esc(p.dorsal)}</span><div><div class="nm">${esc(tc(p.name))}${p.starting ? '<span class="st" title="Quinteto inicial"></span>' : ""}</div></div>
        <div class="pts"><b>${p.pts}</b><small>PUNTOS</small></div></div>
        <div class="facts"><span>Min <b>${p.minutes}</b></span><span>T2 <b>${shot(p.t2m, p.t2a, ms)}</b></span><span>T3 <b>${shot(p.t3m, p.t3a, ms)}</b></span><span>TL <b>${shot(p.t1m, p.t1a, ms)}</b></span><span>Faltas <b>${p.fouls}</b></span><span>+/- <b class="${pmc(p.plus_minus)}">${sign(p.plus_minus)}</b></span></div>
        <div class="per">${p.periods.map((v, i) => `<div>P${i + 1}<b class="${v ? "" : "z"}">${v || "·"}</b></div>`).join("")}</div></a>`).join("") +
      `<div class="tot-row"><span>Total equipo</span><span>${tg.pts} pts · ${tg.fouls} faltas</span></div></div>
      <p class="muted" style="font-size:12px;margin:4px">● quinteto inicial · +/- = diferencia de puntos con el jugador en pista</p>`;
    bindSeg(draw);
  };
  draw();
}
function tRot(uid, d) {
  const R = S.data.rot[uid];
  if (!R || !Object.keys(R.teams).length) { $("#tab").innerHTML = `<div class="empty">${ballArt}<h3>Sin datos de cambios</h3><p>La mesa no registró las entradas y salidas.</p></div>`; return; }
  const draw = () => {
    const s = segSide, T = R.teams[s]; if (!T) return;
    const plen = R.period_minutes, np = R.periods, mx = Math.max(1, ...T.lineups.map(l => l.secs));
    $("#tab").innerHTML = teamSeg(d, s) + `<div class="card ${s}"><div class="card-h"><h3>Periodos jugados</h3><small>■ entero · ▪ parte</small></div><div class="card-b">
      <table class="rg"><colgroup><col class="c-d"><col class="c-n">${"<col>".repeat(np)}<col class="c-np"></colgroup><thead><tr><th></th><th></th>${Array.from({ length: np }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>Per</th></tr></thead><tbody>
      ${T.players.map(p => `<tr><td><span class="dorsal" style="min-width:26px;height:26px;font-size:11.5px">${esc(p.dorsal)}</span></td><td class="nm">${esc(shortName(p.name))}</td>
        ${p.periods_secs.map(x => `<td><div class="cell ${x >= plen * 60 - 1 ? "f" : (x > 0 ? "p" : "n")}">${x > 0 && x < plen * 60 - 1 ? mmss(x) : ""}</div></td>`).join("")}<td class="np">${p.periods_played}</td></tr>
        <tr><td colspan="${np + 3}"><div class="pm-line"><span>${mmss(p.seconds)} min</span><span>en pista <b class="${pmc(p.on_pm)}">${sign(p.on_pm)}</b></span><span>en banquillo <b class="${pmc(p.off_pm)}">${sign(p.off_pm)}</b></span></div></td></tr>`).join("")}
      </tbody></table></div></div>
      <div class="sec">Quintetos (${T.lineups.length})</div><div class="card ${s}">${T.lineups.map(l => `<div class="lu"><div class="ds">${l.dorsales.map(x => `<span class="dorsal">${esc(x)}</span>`).join("")}</div>
        <div class="nn">${l.names.map(n => esc(first(n))).join(" · ")}</div>
        <div class="st"><span>${mmss(l.secs)}</span><span class="mini"><i style="width:${100 * l.secs / mx}%"></i></span><span>${l.pf}-${l.pa}</span><b class="pm ${pmc(l.pm)}">${sign(l.pm)}</b></div></div>`).join("")}</div>`;
    bindSeg(draw);
  };
  draw();
}
const MVI = mv => {
  if (/^Cistella de (\d)/.test(mv)) return [`+${mv.match(/(\d)/)[1]}`, "#1E9E62", "#E5F6EE"];
  if (/fallat/i.test(mv)) return ["✕", "#D64545", "#FCECEC"];
  if (/Personal|falta|Tècnica|Antiesportiva/i.test(mv)) return ["F", "#B7791F", "#FFF4DE"];
  if (/^Entra/.test(mv)) return ["↑", "#1E9E62", "#EEF8F2"];
  if (/^Surt/.test(mv)) return ["↓", "#6B7686", "#EEF2F8"];
  if (/Temps mort/.test(mv)) return ["T", "#0B1F3A", "#E9EEF6"];
  if (/Salt/.test(mv)) return ["▲", "#2F6FED", "#EAF1FF"];
  return ["•", "#6B7686", "#EEF2F8"];
};
function tPbp(d) {
  const m = d.match, periods = [...new Set(d.moves.map(x => x.period))];
  let P = "", T = "";
  $("#tab").innerHTML = `<div class="chips" id="pch"><button class="chip on" data-p="">Todo</button>${periods.map(p => `<button class="chip" data-p="${p}">P${p}</button>`).join("")}</div>
    <div class="chips" id="tch"><button class="chip on" data-t="">Todas</button><button class="chip" data-t="c">Canastas</button><button class="chip" data-t="f">Faltas</button><button class="chip" data-t="s">Cambios</button></div><div class="card" id="evs"></div>`;
  const draw = () => {
    let html = "", last = null;
    d.moves.filter(x => (!P || String(x.period) === P) && (!T || (T === "c" && /^Cistella/.test(x.move)) || (T === "f" && /Personal|falta|fallat/i.test(x.move) && !/^Cistella/.test(x.move)) || (T === "s" && /^(Entra|Surt)/.test(x.move))))
      .forEach(x => {
        if (x.period !== last) { html += `<div class="pp">Periodo ${x.period}</div>`; last = x.period; }
        const [ic, col, bg] = MVI(x.move || ""), bk = /^Cistella/.test(x.move);
        const team = x.side === "L" ? m.local_name : (x.side === "V" ? m.visitor_name : "");
        html += `<div class="ev ${x.side || ""} ${bk ? "bk" : ""}"><span class="tm">${String(x.min).padStart(2, "0")}:${String(x.sec).padStart(2, "0")}</span><span class="sc">${esc(x.score || "")}</span>
          <span class="mv"><span class="ic" style="color:${col};background:${bg}">${ic}</span>${esc(x.move)}</span>
          <span class="who">${x.player ? `<b>#${esc(x.dorsal)}</b> ${esc(tc(x.player))}` : `<span class="muted">${esc(tc(team))}</span>`}</span></div>`;
      });
    $("#evs").innerHTML = html || `<div class="empty"><p>No hay jugadas con este filtro.</p></div>`;
  };
  $$("#pch .chip").forEach(c => c.onclick = () => { $$("#pch .chip").forEach(x => x.classList.toggle("on", x === c)); P = c.dataset.p; draw(); });
  $$("#tch .chip").forEach(c => c.onclick = () => { $$("#tch .chip").forEach(x => x.classList.toggle("on", x === c)); T = c.dataset.t; draw(); });
  draw();
}
function courtSVG(shots, color) {
  const W = 15, H = 14, k = 30, P = (xm, ym) => [ym * k, (H - xm) * k], a0 = Math.asin((7.5 - 0.9) / 6.75);
  let arc = ""; for (let i = 0; i <= 60; i++) { const a = -a0 + 2 * a0 * i / 60; const [x, y] = P(1.575 + 6.75 * Math.cos(a), 7.5 + 6.75 * Math.sin(a)); arc += "L" + x.toFixed(1) + " " + y.toFixed(1); }
  const [bx, by] = P(1.575, 7.5), lc = "#C7CFDA";
  const dots = shots.filter(s => s.x != null && s.y != null).map(s => {
    let xm = s.x / 100 * 28, ym = s.y / 100 * 15; if (xm > 14) { xm = 28 - xm; ym = 15 - ym; }
    const [x, y] = P(xm, ym);
    return s.made ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.value === 3 ? 9 : 7.5}" fill="${color}" stroke="#fff" stroke-width="2.2" opacity=".92"/>`
      : `<path d="M${x - 7} ${y - 7}L${x + 7} ${y + 7}M${x - 7} ${y + 7}L${x + 7} ${y - 7}" stroke="#D64545" stroke-width="3.2"/>`;
  }).join("");
  return `<svg viewBox="-4 -4 ${W * k + 8} ${H * k + 8}"><rect x="0" y="0" width="${W * k}" height="${H * k}" rx="8" fill="#FBF7F1" stroke="${lc}" stroke-width="2"/>
    <rect x="${(7.5 - 2.45) * k}" y="${(H - 5.8) * k}" width="${4.9 * k}" height="${5.8 * k}" fill="#F3E9DC" stroke="${lc}" stroke-width="2"/>
    <path d="M${(7.5 - 1.8) * k} ${(H - 5.8) * k} A ${1.8 * k} ${1.8 * k} 0 0 1 ${(7.5 + 1.8) * k} ${(H - 5.8) * k}" stroke="${lc}" stroke-width="2"/>
    <path d="M${0.9 * k} ${H * k} L${0.9 * k} ${(H - 2.99) * k} ${arc} L${14.1 * k} ${H * k}" stroke="${lc}" stroke-width="2"/>
    <path d="M${(7.5 - 1.8) * k} 0 A ${1.8 * k} ${1.8 * k} 0 0 0 ${(7.5 + 1.8) * k} 0" stroke="${lc}" stroke-width="2"/>
    <line x1="${6.6 * k}" y1="${(H - 1.2) * k}" x2="${8.4 * k}" y2="${(H - 1.2) * k}" stroke="#0F1828" stroke-width="3"/>
    <circle cx="${bx}" cy="${by}" r="${0.23 * k}" stroke="#F26B1D" stroke-width="2.5"/>${dots}</svg>`;
}
function tTir(d) {
  if (!d.shots.length) { $("#tab").innerHTML = `<div class="empty">${ballArt}<h3>Sin mapa de tiros</h3><p>La mesa no registró la posición de los tiros.</p></div>`; return; }
  const draw = (actor) => {
    const s = segSide, col = s === "L" ? C.o : C.b;
    const pl = [...new Map(d.shots.filter(x => x.side === s).map(x => [x.actor_id, x])).values()];
    const list = d.shots.filter(x => x.side === s && (!actor || x.actor_id === actor));
    $("#tab").innerHTML = teamSeg(d, s) + `<select class="input" id="ps" style="margin-bottom:12px"><option value="">Todos los jugadores</option>${pl.map(p => `<option value="${p.actor_id}" ${p.actor_id === actor ? "selected" : ""}>#${esc(p.dorsal)} ${esc(tc(p.player))}</option>`).join("")}</select>
      <div class="card court"><div class="card-b" style="padding-top:14px">${courtSVG(list, col)}<div class="legend"><span><i style="background:${col}"></i>Canasta de 2</span><span><i style="background:${col};width:13px;height:13px"></i>Triple</span>${list.some(x => !x.made) ? `<span style="color:#D64545;font-weight:800">✕ fallado</span>` : ""}<span>${list.length} tiros · ${list.reduce((a, x) => a + (x.made ? x.value : 0), 0)} pts</span></div></div></div>`;
    $("#ps").onchange = e => draw(e.target.value);
    bindSeg(() => draw(""));
  };
  draw("");
}

/* ------------------------------------------------------------------ EQUIPOS */
routes.equipos = () => {
  setTitle("Equipos");
  const ts = V().teams;
  const li = t => `<a class="li" href="#/equipo/${t.team_id}">${logo(t.logo, t.name, 40)}<div style="min-width:0"><div class="nm">${esc(tc(t.name))}</div><div class="sub">${esc(tc(t.category))} · ${t.games} PJ</div></div><div class="rt"><b>${t.wins}-${t.losses}</b><small>V-D</small></div>${I.chev}</a>`;
  const fol = ts.filter(t => t.followed), oth = ts.filter(t => !t.followed);
  view.innerHTML = (fol.length ? `<div class="sec">Mis equipos</div><div class="card">${fol.map(li).join("")}</div>` : "") +
    (oth.length ? `<div class="sec">Rivales</div><div class="card">${oth.map(li).join("")}</div>` : "") + (ts.length ? "" : `<div class="empty">${ballArt}<h3>No hay equipos</h3></div>`);
};
routes.equipo = id => {
  const t = V().team[id] || ALL().team[id];
  if (!t) throw new Error("Equipo sin partidos guardados.");
  const s = t.summary;
  setTitle(tc(s.name), true);
  const R = V().team_rot[id] || ALL().team_rot[id];
  view.innerHTML = `<div class="th">${logo(s.logo, s.name, 54)}<div style="min-width:0"><div class="nm">${esc(tc(s.name))}</div><div class="sub">${esc(tc(s.category))}</div></div><div class="big"><b>${s.wins}-${s.losses}</b><small>V · D</small></div></div>
    <div class="kpis"><div class="kpi"><b>${s.ppg}</b><span>A favor/P</span></div><div class="kpi"><b>${s.papg}</b><span>En contra/P</span></div><div class="kpi"><b class="${pmc(s.diff)}">${sign(s.diff)}</b><span>Diferencia</span></div></div>
    <div class="sec">Resultados</div><div class="card">${t.games.map(g => `<a class="gl" href="#/partido/${g.uid}"><span class="d">${esc(fdate(g.date))}</span>${logo(g.opp_logo, g.opp, 26)}<span class="o">${g.home ? "" : "@ "}${esc(tc(g.opp))}</span>
      <span class="badge ${g.win ? "g" : "r"}">${g.win ? "V" : "D"} ${g.pf}-${g.pa}</span></a>`).join("")}</div>
    <div class="card"><div class="card-h"><h3>Puntos por partido</h3></div><div class="card-b"><div class="chart"><canvas id="c1"></canvas></div></div></div>
    <div class="sec">Plantilla · puntos por partido</div><div class="card">${t.players.map(p => `<a class="li" href="#/jugador/${encodeURIComponent(p.player_key)}"><span class="dorsal">${esc(p.dorsal)}</span>
      <div style="min-width:0"><div class="nm">${esc(tc(p.name))}</div><div class="sub">${p.pj} PJ · ${p.mpg} min · ${p.pts} pts · +/- <span class="${pmc(p.pm)}">${sign(p.pm)}</span></div></div><div class="rt"><b>${p.ppg}</b><small>PTS/P</small></div></a>`).join("")}</div>
    ${R && R.lineups && R.lineups.length ? `<div class="sec">Quintetos más usados</div><div class="card L">${R.lineups.slice(0, 8).map(l => `<div class="lu"><div class="ds">${l.dorsales.map(x => `<span class="dorsal">${esc(x)}</span>`).join("")}</div>
      <div class="nn">${l.names.map(n => esc(first(n))).join(" · ")}</div><div class="st"><span>${mmss(l.secs)}</span><span>${l.games} PJ</span><span>${l.pf}-${l.pa}</span><b class="pm ${pmc(l.pm)}">${sign(l.pm)}</b></div></div>`).join("")}</div>` : ""}`;
  chart($("#c1"), { type: "bar", data: { labels: t.games.map((g, i) => "J" + (g.matchday || i + 1)), datasets: [
    { label: "A favor", data: t.games.map(g => g.pf), backgroundColor: C.o, borderRadius: 6, maxBarThickness: 26 },
    { label: "En contra", data: t.games.map(g => g.pa), backgroundColor: C.b, borderRadius: 6, maxBarThickness: 26 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: C.line } } } } });
};

/* ------------------------------------------------------------------ JUGADORES */
routes.jugadores = () => {
  setTitle("Jugadores");
  const ps = [...V().players].sort((a, b) => b.ppg - a.ppg);
  view.innerHTML = `<div class="search">${I.search}<input class="input" id="q" placeholder="Buscar jugador…"></div><div class="card" id="pl"></div>`;
  const draw = q => {
    const f = ps.filter(p => !q || p.name.toLowerCase().includes(q));
    $("#pl").innerHTML = f.map(p => `<a class="li" href="#/jugador/${encodeURIComponent(p.player_key)}"><span class="dorsal">${esc(p.dorsal)}</span><div style="min-width:0"><div class="nm">${esc(tc(p.name))}</div><div class="sub">${esc(tc(p.team))}</div></div><div class="rt"><b>${p.ppg}</b><small>PTS/P</small></div></a>`).join("") || `<div class="empty"><p>Sin resultados.</p></div>`;
  };
  $("#q").oninput = e => draw(e.target.value.toLowerCase().trim());
  draw("");
};
routes.jugador = key => {
  const d = V().player[key] || ALL().player[key];
  if (!d) throw new Error("Jugador no encontrado.");
  const p = d.player, log = d.log;
  setTitle(tc(p.name), true);
  const ms = misses(log);
  view.innerHTML = `<div class="th">${logo(d.logo, p.team, 50)}<div style="min-width:0"><div class="nm">${esc(tc(p.name))}</div><div class="sub">${esc(tc(p.team))}</div></div><div class="num">#${esc(p.dorsal)}</div></div>
    <div class="kpis"><div class="kpi"><b>${p.ppg}</b><span>Pts/partido</span></div><div class="kpi"><b>${p.mpg}</b><span>Min/partido</span></div><div class="kpi"><b>${p.pj}</b><span>Partidos</span></div></div>
    <div class="kpis"><div class="kpi"><b>${p.pts}</b><span>Puntos</span></div><div class="kpi"><b>${p.t3m}</b><span>Triples</span></div><div class="kpi"><b class="${pmc(p.pm)}">${sign(p.pm)}</b><span>+/- total</span></div></div>
    <div class="card"><div class="card-h"><h3>Puntos por partido</h3></div><div class="card-b"><div class="chart"><canvas id="c1"></canvas></div></div></div>
    <div class="sec">Partido a partido</div><div class="card">${[...log].reverse().map(g => `<a class="pc" href="#/partido/${g.uid}" style="display:block"><div class="h"><div style="min-width:0"><div class="nm">${g.home ? "vs" : "@"} ${esc(tc(g.opp))}</div>
        <div class="muted" style="font-size:12px;margin-top:2px">${esc(fdate(g.date))} · <span class="badge ${g.win ? "g" : "r"}">${g.win ? "V" : "D"} ${g.pf}-${g.pa}</span></div></div><div class="pts"><b>${g.pts}</b><small>PUNTOS</small></div></div>
        <div class="facts"><span>Min <b>${g.minutes}</b></span><span>T2 <b>${shot(g.t2m, g.t2a, ms)}</b></span><span>T3 <b>${shot(g.t3m, g.t3a, ms)}</b></span><span>TL <b>${shot(g.t1m, g.t1a, ms)}</b></span><span>Faltas <b>${g.fouls}</b></span><span>+/- <b class="${pmc(g.plus_minus)}">${sign(g.plus_minus)}</b></span></div></a>`).join("")}</div>`;
  chart($("#c1"), { type: "bar", data: { labels: log.map(g => fdate(g.date)), datasets: [{ label: "Puntos", data: log.map(g => g.pts), backgroundColor: C.o, borderRadius: 6, maxBarThickness: 30 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: C.line }, ticks: { precision: 0 } } } } });
};

/* ------------------------------------------------------------------ MÁS (ajustes) */
routes.mas = () => {
  setTitle("Más");
  const id = clientId();
  view.innerHTML = `
    ${S.data ? `<div class="info ok">${I.check}<div>Datos del <b>${esc(S.data.generated)}</b>${S.driveTime ? " · desde Google Drive" : " · cargados a mano"}</div></div><div style="height:10px"></div>` : ""}
    <button class="btn pri" id="upd" ${id ? "" : "disabled"}>${I.refresh} Actualizar desde Google Drive</button>
    <div style="height:8px"></div><button class="btn" id="pick">${I.file} Abrir archivo de datos a mano</button>
    <div class="sec">Instalar en el móvil</div>
    <div class="card"><div class="card-b" style="padding-top:12px;font-size:14px;line-height:1.5">En Chrome, toca el menú <b>⋮</b> y luego <b>"Añadir a pantalla de inicio"</b> o <b>"Instalar aplicación"</b>. Tendrás el icono como cualquier app y funcionará también sin internet con los últimos datos descargados.</div></div>
    <div class="sec">Conexión con Google</div>
    <div class="card"><div class="card-b" style="padding-top:12px">
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px">ID de cliente de Google (se pone una sola vez; lo da la consola de Google al configurarlo)</div>
      <input class="input" id="cid" placeholder="xxxxxxxx.apps.googleusercontent.com" value="${esc(id)}" autocomplete="off" spellcheck="false">
      <div style="height:8px"></div><button class="btn dark" id="savecid">Guardar</button>
      ${lsGet("fcbq_logged") ? `<div style="height:8px"></div><button class="btn" id="logout">Cerrar sesión de Google</button>` : ""}
    </div></div>
    <p class="muted" style="font-size:12px;text-align:center;margin-top:14px">FCBQ Stats móvil · solo lectura · los datos se quedan en tu Drive y en este móvil</p>`;
  $("#upd").onclick = e => doRefresh(e.currentTarget, true);
  $("#pick").onclick = () => $("#filepick").click();
  $("#savecid").onclick = () => {
    const v = $("#cid").value.trim();
    if (v && !/\.apps\.googleusercontent\.com$/.test(v)) return toast("Ese ID no parece correcto: debe acabar en .apps.googleusercontent.com", "err");
    lsSet("fcbq_client_id", v || null); S.token = null; toast("Guardado", "ok"); routes.mas();
  };
  const lo = $("#logout");
  if (lo) lo.onclick = () => { try { if (S.token && gisReady()) google.accounts.oauth2.revoke(S.token, () => { }); } catch (e) { } S.token = null; lsSet("fcbq_logged", null); toast("Sesión cerrada", "ok"); routes.mas(); };
};

/* ------------------------------------------------------------------ arranque */
(async () => {
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
  S.data = await idbGet("bundle"); S.driveTime = await idbGet("driveTime");
  fixGroup();
  if (!location.hash) location.hash = "#/inicio";
  router();
  // al abrir, si ya entraste antes con Google, mira en silencio si hay datos nuevos
  if (S.data && clientId() && lsGet("fcbq_logged") && navigator.onLine) {
    let tries = 0;
    const wait = setInterval(async () => {
      if (gisReady() || ++tries > 20) {
        clearInterval(wait);
        if (!gisReady()) return;
        try { if (await refreshFromDrive(false)) { toast("Datos nuevos descargados de Drive", "ok"); fixGroup(); router(); } } catch (e) { /* sin aviso: se queda con los datos guardados */ }
      }
    }, 300);
  }
})();
