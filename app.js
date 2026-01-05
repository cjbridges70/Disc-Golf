(function(){
  // ---------- Toast ----------
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function showToast(msg){
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 1400);
  }

  // ---------- Haptics (best-effort) ----------
  // iPhone Safari often doesn't support navigator.vibrate; safe to call anyway.
  function haptic(ms){
    try{ if (navigator && navigator.vibrate) navigator.vibrate(ms || 10); }catch(e){}
  }

  // ---------- Theme toggle ----------
  var THEME_KEY = "bridgespark:theme";
  var html = document.documentElement;
  var themeBtn = document.getElementById("themeToggle");
  var themeIcon = document.getElementById("themeIcon");

  function systemIsDark(){
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function applyTheme(theme){
    html.setAttribute("data-theme", theme);
    var effectiveDark = (theme === "dark") ? true : (theme === "light" ? false : systemIsDark());
    if (themeIcon) themeIcon.src = effectiveDark ? "sun.png" : "moon.png";
    var logoLight = document.getElementById("logoLight");
    var logoDark  = document.getElementById("logoDark");
    if (logoLight) logoLight.style.display = effectiveDark ? "none" : "block";
    if (logoDark)  logoDark.style.display  = effectiveDark ? "block" : "none";
  }
  function loadTheme(){
    try{
      var t = localStorage.getItem(THEME_KEY);
      if (t === "light" || t === "dark" || t === "system") return t;
    }catch(e){}
    return "system";
  }
  function saveTheme(t){
    try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
  }

  if (themeBtn){
    themeBtn.addEventListener("click", function(){
      var cur = html.getAttribute("data-theme") || "system";
      var effectiveDark = (cur === "dark") ? true : (cur === "light" ? false : systemIsDark());
      var next = effectiveDark ? "light" : "dark";
      saveTheme(next);
      applyTheme(next);
      haptic(10);
      showToast(next === "dark" ? "Dark mode" : "Light mode");
    });
  }

  try{
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(){
      if ((html.getAttribute("data-theme") || "system") === "system") applyTheme("system");
    });
  }catch(e){}
  applyTheme(loadTheme());

  // ---------- Generator rules ----------
  var GOALS = ["white","orange","blue","pink","red","green","yellow"];
  var HOLES = 18;
  var MINREQ = 2;
  var FIXED = { 9: "green", 18: "green" };

  // Disallowed next target from previous
  var DIS = {
    "white":  [],
    "orange": ["pink","blue"],
    "blue":   ["orange","red"],
    "pink":   ["orange","red","green"],
    "red":    ["blue","pink"],
    "green":  ["yellow","pink"],
    "yellow": ["green"]
  };

  // Hole 1 special pars
  var HOLE1_PAR3_TO = { "yellow": true, "pink": true, "white": true };

  // Pars by unordered pair
  function pairKey(a,b){ return (a < b) ? (a+"|"+b) : (b+"|"+a); }
  var PAR3 = {};
  var PAR5 = {};
  [
    ["white","yellow"],
    ["white","green"],
    ["yellow","red"],
    ["yellow","pink"],
    ["green","red"],
    ["red","orange"],
    ["red","blue"],
    ["blue","pink"]
  ].forEach(function(p){ PAR3[pairKey(p[0],p[1])] = true; });
  [
    ["white","blue"],
    ["white","orange"]
  ].forEach(function(p){ PAR5[pairKey(p[0],p[1])] = true; });

  function allowed(prev, next){
    if (!prev) return true;
    if (prev === next) return false;
    var bad = DIS[prev] || [];
    for (var i=0;i<bad.length;i++) if (bad[i]===next) return false;
    return true;
  }

  function edgeKey(from,to){ return from + "->" + to; }

  function shuffle(arr){
    for (var i=arr.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var t = arr[i]; arr[i]=arr[j]; arr[j]=t;
    }
    return arr;
  }

  function initCounts(){
    var c = {};
    for (var i=0;i<GOALS.length;i++) c[GOALS[i]] = 0;
    return c;
  }

  function futureFixedCount(goal, fromPos){
    var f=0;
    for (var h=fromPos; h<=HOLES; h++){
      if (FIXED[h] === goal) f++;
    }
    return f;
  }

  function remainingUnfixedSlots(fromPos, course){
    var s=0;
    for (var h=fromPos; h<=HOLES; h++){
      if (!FIXED[h] && course[h] === null) s++;
    }
    return s;
  }

  function minNeeded(fromPos, course, used){
    var need=0;
    for (var i=0;i<GOALS.length;i++){
      var g = GOALS[i];
      var future = futureFixedCount(g, fromPos);
      var missing = MINREQ - (used[g] + future);
      if (missing > 0) need += missing;
    }
    return need;
  }

  function feasible(fromPos, course, used){
    return minNeeded(fromPos, course, used) <= remainingUnfixedSlots(fromPos, course);
  }

  function candidateScore(goal, used, fromPos){
    var future = futureFixedCount(goal, fromPos);
    var willHave = used[goal] + future;
    if (willHave < MINREQ) return -100 + used[goal];
    return used[goal];
  }

  function parFor(from,to,hole){
    if (hole === 1){
      return HOLE1_PAR3_TO[to] ? 3 : 4;
    }
    var k = pairKey(from,to);
    if (PAR5[k]) return 5;
    if (PAR3[k]) return 3;
    return 4;
  }

  function goalSpan(goal){
    var s = document.createElement("span");
    s.className = "goalTag goal-" + goal;
    s.textContent = goal;
    return s;
  }

  function generateCourse(){
    var course = [];
    for (var i=0;i<=HOLES;i++) course[i]=null;
    for (var h in FIXED) if (Object.prototype.hasOwnProperty.call(FIXED,h)) course[parseInt(h,10)] = FIXED[h];

    var used = initCounts();
    var usedEdges = {};

    function bt(pos){
      if (pos > HOLES){
        for (var i=0;i<GOALS.length;i++){
          if (used[GOALS[i]] < MINREQ) return false;
        }
        return true;
      }

      var prevGoal = (pos===1) ? "tee" : course[pos-1];

      if (course[pos] !== null){
        var v = course[pos];
        if (pos === 1 && v === "green") return false;

        var ek = edgeKey(prevGoal, v);
        if (usedEdges[ek]) return false;

        usedEdges[ek] = true;
        used[v] += 1;

        if (!feasible(pos+1, course, used)) { used[v]-=1; delete usedEdges[ek]; return false; }
        if (bt(pos+1)) return true;

        used[v] -= 1;
        delete usedEdges[ek];
        return false;
      }

      var prev2 = (pos>1) ? course[pos-1] : null;
      var cands = [];

      for (var i2=0;i2<GOALS.length;i2++){
        var g2 = GOALS[i2];

        if (pos === 1 && g2 === "green") continue;
        if (pos > 1 && !allowed(prev2, g2)) continue;
        if (course[pos+1] !== null && !allowed(g2, course[pos+1])) continue;
        if (usedEdges[edgeKey(prevGoal, g2)]) continue;

        cands.push(g2);
      }

      shuffle(cands);
      cands.sort(function(a,b){
        return candidateScore(a, used, pos+1) - candidateScore(b, used, pos+1);
      });

      for (var ci=0; ci<cands.length; ci++){
        var pick = cands[ci];
        var ek2 = edgeKey(prevGoal, pick);

        course[pos] = pick;
        used[pick] += 1;
        usedEdges[ek2] = true;

        if (feasible(pos+1, course, used) && bt(pos+1)) return true;

        delete usedEdges[ek2];
        used[pick] -= 1;
        course[pos] = null;
      }

      return false;
    }

    for (var attempt=1; attempt<=25000; attempt++){
      for (var p=1; p<=HOLES; p++) if (!FIXED[p]) course[p] = null;
      used = initCounts();
      usedEdges = {};
      if (bt(1)){
        var seq = [];
        for (var k=1;k<=HOLES;k++) seq.push(course[k]);
        return { seq: seq };
      }
    }
    return null;
  }

  function decodeCourse(param){
    try{
      if (!param) return null;
      var raw = decodeURIComponent(param);
      var parts = raw.split(",").map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
      if (parts.length !== HOLES) return null;

      for (var i=0;i<parts.length;i++){
        if (GOALS.indexOf(parts[i]) === -1) return null;
      }
      if (parts[8] !== "green") return null;
      if (parts[17] !== "green") return null;
      if (parts[0] === "green") return null;

      for (var h=2; h<=HOLES; h++){
        var prev = parts[h-2];
        var next = parts[h-1];
        if (prev === next) return null;
        if (!allowed(prev, next)) return null;
      }
      return parts;
    }catch(e){
      return null;
    }
  }

  function setUrlForCourse(seq){
    var url = new URL(window.location.href);
    url.searchParams.set("c", encodeURIComponent(seq.join(",")));
    history.replaceState(null, "", url.toString());
  }

  async function copyShareLink(){
    var link = window.location.href;
    try{
      await navigator.clipboard.writeText(link);
      haptic(10);
      showToast("Share link copied");
    }catch(e){
      prompt("Copy this link:", link);
    }
  }

  // ---------- UI / score logic ----------
  var currentSeq = null;
  var activeHole = 1;

  function storageKeyForCourse(courseStr){
    return "bridgespark:split:v1:" + courseStr;
  }

  var mainBody = document.getElementById("mainBody");
  var btnGen = document.getElementById("btnGen");
  var btnClear = document.getElementById("btnClear");
  var btnCopy = document.getElementById("btnCopyLink");
  var n1 = document.getElementById("n1");
  var n2 = document.getElementById("n2");
  var p1Sticky = document.getElementById("p1HeadSticky");
  var p2Sticky = document.getElementById("p2HeadSticky");

  var progressFill = document.getElementById("progressFill");
  var progressText = document.getElementById("progressText");

  function getSelectEl(hole, player){
    return mainBody.querySelector('select[data-hole="'+hole+'"][data-player="'+player+'"]');
  }
  function getSelectValue(hole, player){
    var sel = getSelectEl(hole, player);
    return sel ? sel.value : "";
  }
  function setSelectValue(hole, player, value){
    var sel = getSelectEl(hole, player);
    if (!sel) return;
    sel.value = (value === null || value === undefined) ? "" : String(value);
  }

  function saveState(){
    if (!currentSeq || currentSeq.length !== HOLES) return;
    var key = storageKeyForCourse(currentSeq.join(","));
    var scores = {};
    for (var hole=1; hole<=HOLES; hole++){
      scores[hole] = { p1: getSelectValue(hole,1), p2: getSelectValue(hole,2) };
    }
    var state = { n1: (n1.value||""), n2: (n2.value||""), activeHole: activeHole||1, scores: scores };
    try{ localStorage.setItem(key, JSON.stringify(state)); }catch(e){}
  }

  function loadState(){
    if (!currentSeq || currentSeq.length !== HOLES) return null;
    var key = storageKeyForCourse(currentSeq.join(","));
    try{
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    }catch(e){ return null; }
  }

  function clearSavedStateForCurrentCourse(){
    if (!currentSeq || currentSeq.length !== HOLES) return;
    var key = storageKeyForCourse(currentSeq.join(","));
    try{ localStorage.removeItem(key); }catch(e){}
  }

  function playerName(idx){
    return (idx===1 ? (n1.value||"P1") : (n2.value||"P2")).trim();
  }
  function syncPlayerHeaders(){
    if (!p1Sticky || !p2Sticky) return;
    p1Sticky.textContent = playerName(1);
    p2Sticky.textContent = playerName(2);
  }
  if (n1) n1.addEventListener("input", function(){ syncPlayerHeaders(); saveState(); });
  if (n2) n2.addEventListener("input", function(){ syncPlayerHeaders(); saveState(); });

  function setDiffPill(el, diff){
    if (!el) return;
    el.classList.remove("pill-under","pill-even","pill-over");
    if (diff === 0) el.classList.add("pill-even");
    else if (diff > 0) el.classList.add("pill-over");
    else el.classList.add("pill-under");
  }

  var DELTAS = [-2,-1,0,1,2,3];

  function colorDelta(sel){
    sel.classList.remove("score-under","score-even","score-over");
    var raw = sel.value;
    if (raw === ""){ sel.classList.add("score-even"); return; }
    var d = parseInt(raw,10);
    if (d < 0) sel.classList.add("score-under");
    else if (d > 0) sel.classList.add("score-over");
    else sel.classList.add("score-even");
  }

  function bothSelected(hole){
    return (getSelectValue(hole,1) !== "" && getSelectValue(hole,2) !== "");
  }

  function holeRowEl(hole){
    return mainBody.querySelector('tr.holeRow[data-hole="'+hole+'"]');
  }

  function pulseHoleRow(hole){
    var row = holeRowEl(hole);
    if (!row) return;
    row.classList.add("pulse");
    setTimeout(function(){ row.classList.remove("pulse"); }, 260);
  }

  function setActiveHole(hole, shouldScroll){
    activeHole = hole;
    var rows = mainBody.querySelectorAll("tr.holeRow");
    for (var i=0;i<rows.length;i++) rows[i].classList.remove("active");
    var row = holeRowEl(hole);
    if (row){
      row.classList.add("active");
      if (shouldScroll){
        try{ row.scrollIntoView({behavior:"smooth", block:"center"}); }catch(e){ row.scrollIntoView(); }
      }
    }
    saveState();
  }

  function makeDeltaSelect(hole, player, parVal){
    var sel = document.createElement("select");
    sel.setAttribute("data-hole", ""+hole);
    sel.setAttribute("data-player", ""+player);
    sel.setAttribute("data-par", ""+parVal);

    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "–";
    ph.selected = true;
    sel.appendChild(ph);

    for (var i=0;i<DELTAS.length;i++){
      var d = DELTAS[i];
      var opt = document.createElement("option");
      opt.value = ""+d;
      opt.textContent = (d>0 ? ("+"+d) : (""+d));
      sel.appendChild(opt);
    }

    sel.addEventListener("change", function(){
      colorDelta(sel);
      recalcTotals();
      updateProgress();
      saveState();
      haptic(8);

      if (bothSelected(hole)){
        pulseHoleRow(hole);
        setActiveHole(Math.min(HOLES, hole+1), true); // auto-scroll on completion
      } else {
        setActiveHole(hole, false);
      }
    });

    colorDelta(sel);
    return sel;
  }

  function recolorAllSelects(){
    var sels = mainBody.querySelectorAll("select");
    for (var i=0;i<sels.length;i++) colorDelta(sels[i]);
  }

  function recalcTotals(){
    for (var pl=1; pl<=2; pl++){
      var frontDelta=0, backDelta=0, totalDelta=0;
      var frontThrows=0, backThrows=0, totalThrows=0;

      for (var hole=1; hole<=HOLES; hole++){
        var sel = getSelectEl(hole, pl);
        if (!sel) continue;

        var par = parseInt(sel.getAttribute("data-par"),10) || 0;
        var raw = sel.value;
        var d = (raw === "") ? 0 : (parseInt(raw,10) || 0);

        totalDelta += d;
        if (hole<=9) frontDelta += d; else backDelta += d;

        var throws = par + d;
        totalThrows += throws;
        if (hole<=9) frontThrows += throws; else backThrows += throws;
      }

      var f = document.getElementById("f"+pl);
      var b = document.getElementById("b"+pl);
      var t = document.getElementById("t"+pl);
      if (f) f.textContent = ""+frontThrows;
      if (b) b.textContent = ""+backThrows;
      if (t) t.textContent = ""+totalThrows;

      var fd = document.getElementById("fd"+pl);
      var bd = document.getElementById("bd"+pl);
      var dEl = document.getElementById("d"+pl);

      if (fd){
        fd.textContent = ""+frontDelta;
        setDiffPill(fd, frontDelta);
      }
      if (bd){
        bd.textContent = ""+backDelta;
        setDiffPill(bd, backDelta);
      }
      if (dEl){
        dEl.textContent = ""+totalDelta;
        setDiffPill(dEl, totalDelta);
      }
    }
  }

  function updateProgress(){
    var completed = 0;
    for (var h=1; h<=HOLES; h++){
      if (bothSelected(h)) completed++;
    }
    var pct = Math.round((completed / HOLES) * 100);
    if (progressFill) progressFill.style.width = pct + "%";
    if (progressText) progressText.textContent = completed + " / " + HOLES;
  }

  function anyScoreEntered(){
    for (var h=1; h<=HOLES; h++){
      if (getSelectValue(h,1) !== "" || getSelectValue(h,2) !== "") return true;
    }
    return false;
  }

  function clearScores(alsoClearStorage){
    for (var h=1; h<=HOLES; h++){
      setSelectValue(h, 1, "");
      setSelectValue(h, 2, "");
    }
    recolorAllSelects();
    recalcTotals();
    updateProgress();
    setActiveHole(1, true);

    if (alsoClearStorage) clearSavedStateForCurrentCourse();
    saveState();
    haptic(12);
    showToast("Scores cleared");
  }

  function buildFront9Row(frontPar){
    var tr = document.createElement("tr");
    tr.innerHTML = `
      <th colspan="2" class="left">Front 9</th>
      <th>${frontPar}</th>
      <th>
        <div class="sumCell">
          <span id="fd1" class="sumDiff pill pill-even">0</span>
          <span id="f1" class="sumThrows">0</span>
        </div>
      </th>
      <th>
        <div class="sumCell">
          <span id="fd2" class="sumDiff pill pill-even">0</span>
          <span id="f2" class="sumThrows">0</span>
        </div>
      </th>
    `;
    return tr;
  }

  function renderAll(seq){
    currentSeq = seq.slice();
    mainBody.innerHTML = "";

    var parFront=0, parBack=0, parTotal=0;

    for (var i=0;i<seq.length;i++){
      var hole = i+1;
      var to = seq[i];
      var from = (i===0) ? "tee" : seq[i-1];
      var p = parFor(from,to,hole);

      parTotal += p;
      if (hole<=9) parFront += p; else parBack += p;

      var tr = document.createElement("tr");
      tr.className = "holeRow";
      tr.setAttribute("data-hole", ""+hole);

      tr.addEventListener("click", function(e){
        if (e && e.target && (e.target.tagName === "SELECT" || e.target.tagName === "OPTION")) return;
        var h = parseInt(this.getAttribute("data-hole"),10) || 1;
        setActiveHole(h, true);
      });

      var tdH = document.createElement("td");
      tdH.textContent = ""+hole;
      tr.appendChild(tdH);

      var tdThrow = document.createElement("td");
      var wrap = document.createElement("span");
      wrap.className = "twoPip";
      wrap.appendChild(goalSpan(from));
      var arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "→";
      wrap.appendChild(arrow);
      wrap.appendChild(goalSpan(to));
      tdThrow.appendChild(wrap);
      tr.appendChild(tdThrow);

      var tdP = document.createElement("td");
      tdP.textContent = ""+p;
      tr.appendChild(tdP);

      var td1 = document.createElement("td");
      td1.appendChild(makeDeltaSelect(hole, 1, p));
      tr.appendChild(td1);

      var td2 = document.createElement("td");
      td2.appendChild(makeDeltaSelect(hole, 2, p));
      tr.appendChild(td2);

      mainBody.appendChild(tr);

      if (hole === 9){
        mainBody.appendChild(buildFront9Row(parFront));
      }
    }

    var pf = document.getElementById("parFrontTop");
    var pb = document.getElementById("parBackTop");
    var pt = document.getElementById("parTotalTop");
    if (pf) pf.textContent = parFront;
    if (pb) pb.textContent = parBack;
    if (pt) pt.textContent = parTotal;

    var pbCell = document.getElementById("parBackCell");
    var ptCell = document.getElementById("parTotalCell");
    if (pbCell) pbCell.textContent = parBack;
    if (ptCell) ptCell.textContent = parTotal;

    recalcTotals();
    updateProgress();

    var st = loadState();
    if (st){
      if (n1) n1.value = st.n1 || "";
      if (n2) n2.value = st.n2 || "";
      syncPlayerHeaders();

      if (st.scores){
        for (var h=1; h<=HOLES; h++){
          if (!st.scores[h]) continue;
          setSelectValue(h, 1, st.scores[h].p1 || "");
          setSelectValue(h, 2, st.scores[h].p2 || "");
        }
        recolorAllSelects();
        recalcTotals();
        updateProgress();
      }
      setActiveHole(Math.max(1, Math.min(HOLES, st.activeHole || 1)), false);
    } else {
      syncPlayerHeaders();
      setActiveHole(1, false);
    }
  }

  function generateAndRender(){
    if (anyScoreEntered()){
      var ok = confirm("Generate a new course? This will reset scores for this round.");
      if (!ok) return;
    }

    syncPlayerHeaders();

    var r = generateCourse();
    if (!r){
      showToast("Could not generate course. Try again.");
      return;
    }

    setUrlForCourse(r.seq);
    renderAll(r.seq);

    clearSavedStateForCurrentCourse();
    for (var h=1; h<=HOLES; h++){
      setSelectValue(h, 1, "");
      setSelectValue(h, 2, "");
    }
    recolorAllSelects();
    recalcTotals();
    updateProgress();

    // no scroll on generation
    setActiveHole(1, false);

    saveState();
    haptic(15);
    showToast("New course generated");
  }

  if (btnGen) btnGen.addEventListener("click", function(){ generateAndRender(); });
  if (btnClear) btnClear.addEventListener("click", function(){ clearScores(true); });
  if (btnCopy) btnCopy.addEventListener("click", copyShareLink);

  function init(){
    syncPlayerHeaders();
    var url = new URL(window.location.href);
    var c = url.searchParams.get("c");
    var seq = decodeCourse(c);
    if (seq){
      renderAll(seq);
      setUrlForCourse(seq);
      showToast("Course loaded");
    } else {
      generateAndRender();
    }
  }

  init();
})();
