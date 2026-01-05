(() => {
  // ---------- CONFIG ----------
  const GOALS = ["White","Orange","Blue","Pink","Red","Green","Yellow"];

  // Directed movement rules (from -> to allowed)
  const BLOCKED = new Set([
    "Orange->Pink", "Orange->Blue",
    "Blue->Orange", "Blue->Red",
    "Pink->Orange", "Pink->Red",
    "Red->Blue", "Red->Pink",
    "Green->Yellow",
    "Yellow->Green",
    // Removed as valid options:
    "Green->Pink","Pink->Green"
  ]);

  // start cannot be Green
  const START_BLOCKED_TO = new Set(["Green"]);

  // holes 9 and 18 must end at Green
  const FIXED_TO = new Map([[9,"Green"],[18,"Green"]]);

  // each directed throw must be unique (including Tee->X)
  const REQUIRE_UNIQUE_THROWS = true;

  // at least 2 visits to each goal (counting "to" targets over 18 holes)
  const MIN_VISITS = 2;

  // Score input = diff from par
  const SCORE_OPTIONS = [
    {label:"-", value:""},  // display dash, counts as 0
    {label:"-2", value:"-2"},
    {label:"-1", value:"-1"},
    {label:"0", value:"0"},
    {label:"+1", value:"1"},
    {label:"+2", value:"2"},
    {label:"+3", value:"3"},
  ];

  // Pars: default 4 unless special
  // Par 3 pairs (and vice versa):
  const PAR3 = new Set([
    "White->Yellow","Yellow->White",
    "White->Green","Green->White",
    "Yellow->Red","Red->Yellow",
    "Yellow->Pink","Pink->Yellow",
    "Red->Orange","Orange->Red",
    "Red->Blue","Blue->Red",
    "Blue->Pink","Pink->Blue",
    // Tee special:
    "Tee->White"
  ]);

  // Par 5 pairs (and vice versa)
  const PAR5 = new Set([
    "White->Blue","Blue->White",
    "White->Orange","Orange->White",
  ]);

  // ---------- STATE ----------
  let course = null; // array of {from, to, par} length 18
  let scores = { p1: Array(18).fill(null), p2: Array(18).fill(null) }; // diff values or null
  let selectedHole = 1;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const mainBody = $("mainBody");

  const parFrontTop = $("parFrontTop");
  const parBackTop  = $("parBackTop");
  const parTotalTop = $("parTotalTop");
  const parBackCell = $("parBackCell");
  const parTotalCell= $("parTotalCell");

  const bd1 = $("bd1"), bd2 = $("bd2");
  const b1  = $("b1"),  b2  = $("b2");
  const d1  = $("d1"),  d2  = $("d2");
  const t1  = $("t1"),  t2  = $("t2");

  const n1 = $("n1"), n2 = $("n2");
  const p1HeadSticky = $("p1HeadSticky");
  const p2HeadSticky = $("p2HeadSticky");

  const progressFill = $("progressFill");
  const progressText = $("progressText");

  const toast = $("toast");

  // Theme
  const themeToggle = $("themeToggle");
  const themeIcon = $("themeIcon");
  const logoLight = $("logoLight");
  const logoDark = $("logoDark");

  // Buttons
  const btnGen = $("btnGen");
  const btnClear = $("btnClear");
  const btnCopyLink = $("btnCopyLink");

  // ---------- HELPERS ----------
  function toastMsg(msg){
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1100);
  }

  function canVibrate(){
    return "vibrate" in navigator;
  }
  function haptic(type="light"){
    // "type" kept for future; iOS Safari mostly ignores patterns but Android uses it.
    if(!canVibrate()) return;
    navigator.vibrate(10);
  }

  function keyFor(from,to){ return `${from}->${to}`; }

  function isAllowed(from,to){
    if(from === to) return false; // no consecutive same goal
    const k = keyFor(from,to);
    if (BLOCKED.has(k)) return false;
    // also block start -> green
    if(from === "Tee" && START_BLOCKED_TO.has(to)) return false;
    return true;
  }

  function parFor(from,to){
    const k = keyFor(from,to);
    if (PAR5.has(k)) return 5;
    if (PAR3.has(k)) return 3;
    return 4;
  }

  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function diffToNumber(v){
    // v is string like "-2","1", or "" or null
    if(v === "" || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function scoreClass(diff){
    if(diff < 0) return "score-under";
    if(diff > 0) return "score-over";
    return "score-even";
  }

  function setPlayerHeaders(){
    const a = (n1.value || "P1").trim();
    const b = (n2.value || "P2").trim();
    p1HeadSticky.textContent = a;
    p2HeadSticky.textContent = b;
  }

  // Throw cell now shows only → ToColor (and Tee→To for hole1)
  function throwCellHTML(from, to, holeNum){
    const toCls = `goal-${to.toLowerCase()}`;
    if(holeNum === 1){
      return `
        <div class="twoPip">
          <span class="goalTag goal-tee">Tee</span>
          <span class="arrow">→</span>
          <span class="goalTag ${toCls}">${to}</span>
        </div>
      `;
    }
    return `
      <div class="twoPip">
        <span class="arrow">→</span>
        <span class="goalTag ${toCls}">${to}</span>
      </div>
    `;
  }

  // ---------- GENERATOR (backtracking) ----------
  function generateCourse(){
    // Reset selected hole + scores on new course (scores cleared)
    selectedHole = 1;
    scores.p1 = Array(18).fill(null);
    scores.p2 = Array(18).fill(null);

    // targets: 18 holes, hole9 to green, hole18 to green
    const usedEdges = new Set();
    const toCounts = Object.fromEntries(GOALS.map(g => [g,0]));
    const result = [];

    const candidatesFrom = (from, holeIdx) => {
      // if fixed to goal, only that
      const fixedTo = FIXED_TO.get(holeIdx);
      const pool = fixedTo ? [fixedTo] : GOALS.slice();
      return shuffle(pool).filter(to => isAllowed(from,to));
    };

    function dfs(holeIdx, from){
      if(holeIdx > 18){
        // validate min visits
        for(const g of GOALS){
          if(toCounts[g] < MIN_VISITS) return false;
        }
        return true;
      }

      let tos = candidatesFrom(from, holeIdx);

      // additional pruning: if remaining holes can't satisfy min visits
      // (simple heuristic)
      const remaining = 18 - holeIdx + 1;

      // Try each possible to
      for(const to of tos){
        // unique edge constraint
        const edge = keyFor(from,to);
        if(REQUIRE_UNIQUE_THROWS && usedEdges.has(edge)) continue;

        // Apply
        usedEdges.add(edge);
        result.push({from, to, par: parFor(from,to)});
        toCounts[to]++;

        // optimistic check: can we still reach MIN_VISITS?
        let ok = true;
        let need = 0;
        for(const g of GOALS){
          if(toCounts[g] < MIN_VISITS) need += (MIN_VISITS - toCounts[g]);
        }
        if(need > (remaining - 1)) ok = false;

        // continue
        if(ok){
          const nextFrom = to;
          if(dfs(holeIdx+1, nextFrom)) return true;
        }

        // rollback
        toCounts[to]--;
        result.pop();
        usedEdges.delete(edge);
      }

      return false;
    }

    // Start from Tee, hole 1 "from" is Tee
    // Tee can go to any except Green (plus other constraints)
    if(!dfs(1, "Tee")){
      return null;
    }

    return result;
  }

  // ---------- RENDER ----------
  function buildScoreSelect(holeIdx, playerKey){
    const cur = scores[playerKey][holeIdx] ?? null; // null means "-"
    const opts = SCORE_OPTIONS.map(o => {
      const sel = (cur === null && o.value === "") || (String(cur) === o.value && o.value !== "");
      return `<option value="${o.value}" ${sel ? "selected" : ""}>${o.label}</option>`;
    }).join("");

    return `
      <select class="scoreSel" data-hole="${holeIdx}" data-player="${playerKey}">
        ${opts}
      </select>
    `;
  }

  function computeProgress(){
    // progress = count of holes with either player having a non-null selection
    // (still counts as played if either entered)
    let played = 0;
    for(let i=0;i<18;i++){
      const a = scores.p1[i] !== null;
      const b = scores.p2[i] !== null;
      if(a || b) played++;
    }
    const pct = Math.round((played/18)*100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${played} / 18`;
  }

  function computeSums(){
    // Pars
    const parFront = course ? course.slice(0,9).reduce((s,h)=>s+h.par,0) : 0;
    const parBack  = course ? course.slice(9,18).reduce((s,h)=>s+h.par,0) : 0;
    const parTotal = parFront + parBack;

    parFrontTop.textContent = course ? parFront : "–";
    parBackTop.textContent  = course ? parBack  : "–";
    parTotalTop.textContent = course ? parTotal : "–";

    parBackCell.textContent  = course ? parBack  : "–";
    parTotalCell.textContent = course ? parTotal : "–";

    // Totals: big number = (throws - par) == sum diffs; small = total throws
    const sumDiff = (arr, start, end) => {
      let d=0;
      for(let i=start;i<end;i++) d += diffToNumber(arr[i]);
      return d;
    };
    const p1DiffFront = sumDiff(scores.p1,0,9);
    const p1DiffBack  = sumDiff(scores.p1,9,18);
    const p1DiffTotal = p1DiffFront + p1DiffBack;

    const p2DiffFront = sumDiff(scores.p2,0,9);
    const p2DiffBack  = sumDiff(scores.p2,9,18);
    const p2DiffTotal = p2DiffFront + p2DiffBack;

    // Throws totals derived from par + diff
    const p1ThrowsFront = course ? parFront + p1DiffFront : 0;
    const p1ThrowsBack  = course ? parBack  + p1DiffBack  : 0;
    const p1ThrowsTotal = course ? parTotal + p1DiffTotal : 0;

    const p2ThrowsFront = course ? parFront + p2DiffFront : 0;
    const p2ThrowsBack  = course ? parBack  + p2DiffBack  : 0;
    const p2ThrowsTotal = course ? parTotal + p2DiffTotal : 0;

    // Front 9 row is rendered inside tbody; update its ids when present
    const fd1 = document.getElementById("fd1");
    const fd2 = document.getElementById("fd2");
    const f1  = document.getElementById("f1");
    const f2  = document.getElementById("f2");
    const parFrontCell = document.getElementById("parFrontCell");

    if(fd1){
      fd1.textContent = `${p1DiffFront}`;
      fd2.textContent = `${p2DiffFront}`;
      f1.textContent  = `${p1ThrowsFront}`;
      f2.textContent  = `${p2ThrowsFront}`;
      parFrontCell.textContent = `${parFront}`;
      // color big diff pill
      fd1.className = `sumDiff ${scoreClass(p1DiffFront)}`;
      fd2.className = `sumDiff ${scoreClass(p2DiffFront)}`;
    }

    bd1.textContent = `${p1DiffBack}`;
    bd2.textContent = `${p2DiffBack}`;
    b1.textContent  = `${p1ThrowsBack}`;
    b2.textContent  = `${p2ThrowsBack}`;
    bd1.className = `sumDiff ${scoreClass(p1DiffBack)}`;
    bd2.className = `sumDiff ${scoreClass(p2DiffBack)}`;

    d1.textContent = `${p1DiffTotal}`;
    d2.textContent = `${p2DiffTotal}`;
    t1.textContent = `${p1ThrowsTotal}`;
    t2.textContent = `${p2ThrowsTotal}`;
    d1.className = `sumDiff ${scoreClass(p1DiffTotal)}`;
    d2.className = `sumDiff ${scoreClass(p2DiffTotal)}`;
  }

  function render(){
    setPlayerHeaders();

    mainBody.innerHTML = "";

    if(!course){
      computeProgress();
      computeSums();
      return;
    }

    // Build 1..18 with Front 9 summary row after hole 9
    for(let i=0;i<18;i++){
      const holeNum = i+1;
      const h = course[i];

      const tr = document.createElement("tr");
      tr.className = "holeRow";
      if(holeNum === selectedHole) tr.classList.add("active");

      tr.innerHTML = `
        <td>${holeNum}</td>
        <td>${throwCellHTML(h.from, h.to, holeNum)}</td>
        <td>${h.par}</td>
        <td>${buildScoreSelect(i,"p1")}</td>
        <td>${buildScoreSelect(i,"p2")}</td>
      `;
      tr.addEventListener("click", (e) => {
        // don’t change selectedHole if clicking a select
        if(e.target && e.target.tagName === "SELECT") return;
        selectedHole = holeNum;
        haptic("light");
        render();
        scrollToHole(holeNum);
      });

      mainBody.appendChild(tr);

      // Insert Front 9 summary after hole 9
      if(holeNum === 9){
        const sum = document.createElement("tr");
        sum.className = "sumRow";
        sum.innerHTML = `
          <th colspan="2" class="left">Front 9</th>
          <th id="parFrontCell">–</th>
          <th>
            <div class="sumCell">
              <span id="fd1" class="sumDiff">0</span>
              <span id="f1" class="sumThrows">0</span>
            </div>
          </th>
          <th>
            <div class="sumCell">
              <span id="fd2" class="sumDiff">0</span>
              <span id="f2" class="sumThrows">0</span>
            </div>
          </th>
        `;
        mainBody.appendChild(sum);
      }
    }

    // Wire selects
    mainBody.querySelectorAll("select.scoreSel").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const holeIdx = Number(sel.dataset.hole);
        const player  = sel.dataset.player;
        const v = sel.value;

        // "" means "-" display, counts as 0, but keep as null for UI
        scores[player][holeIdx] = (v === "") ? null : v;

        // style select based on diff (null => even)
        const diff = diffToNumber(scores[player][holeIdx]);
        sel.classList.remove("score-under","score-even","score-over");
        sel.classList.add(scoreClass(diff));

        haptic("light");
        computeProgress();
        computeSums();

        // Auto-scroll to next hole on change
        const nextHole = Math.min(18, holeIdx+2);
        selectedHole = nextHole;
        render();
        scrollToHole(nextHole, true);
      });

      // initial coloring
      const holeIdx = Number(sel.dataset.hole);
      const player  = sel.dataset.player;
      const diff = diffToNumber(scores[player][holeIdx]);
      sel.classList.add(scoreClass(diff));
    });

    computeProgress();
    computeSums();
  }

  function scrollToHole(holeNum, smooth=true){
    const row = Array.from(mainBody.querySelectorAll("tr.holeRow"))[holeNum-1];
    if(!row) return;
    row.scrollIntoView({behavior: smooth ? "smooth" : "auto", block:"center"});
  }

  // ---------- SHARE LINK ----------
  // Encode as: startTo + comma-separated tos for holes 2..18
  function encodeCourse(){
    if(!course) return "";
    const tos = course.map(h => h.to);
    return encodeURIComponent(tos.join(","));
  }

  function decodeCourse(str){
    try{
      const tos = decodeURIComponent(str).split(",").map(s => s.trim()).filter(Boolean);
      if(tos.length !== 18) return null;

      // rebuild from = prev to, starting from Tee
      const rebuilt = [];
      let from = "Tee";
      const usedEdges = new Set();
      const counts = Object.fromEntries(GOALS.map(g => [g,0]));

      for(let i=0;i<18;i++){
        const holeNum = i+1;
        const to = tos[i];

        if(!GOALS.includes(to)) return null;
        // fixed holes
        const fixed = FIXED_TO.get(holeNum);
        if(fixed && fixed !== to) return null;
        if(from === "Tee" && START_BLOCKED_TO.has(to)) return null;
        if(!isAllowed(from,to)) return null;

        const edge = keyFor(from,to);
        if(REQUIRE_UNIQUE_THROWS && usedEdges.has(edge)) return null;

        usedEdges.add(edge);
        counts[to]++;
        rebuilt.push({from,to,par:parFor(from,to)});
        from = to;
      }

      for(const g of GOALS){
        if(counts[g] < MIN_VISITS) return null;
      }

      return rebuilt;
    }catch{
      return null;
    }
  }

  // ---------- THEME ----------
  function applyTheme(mode){
    // mode: "light" | "dark" | "system"
    document.documentElement.setAttribute("data-theme", mode);

    const isDark = (mode === "dark") || (mode === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

    logoLight.style.display = isDark ? "none" : "";
    logoDark.style.display  = isDark ? "" : "none";

    // icon shows what you would switch TO
    themeIcon.src = isDark ? "sun.png" : "moon.png";
  }

  function nextTheme(current){
    if(current === "light") return "dark";
    if(current === "dark") return "light";
    // system -> dark
    return "dark";
  }

  // ---------- EVENTS ----------
  btnGen.addEventListener("click", () => {
    haptic("light");
    course = generateCourse();
    if(!course){
      toastMsg("Could not generate — try again");
      return;
    }
    // Do NOT auto-scroll on generate (per your preference)
    selectedHole = 1;
    updateURLFromCourse();
    render();
    toastMsg("New course");
  });

  btnClear.addEventListener("click", () => {
    haptic("light");
    scores.p1 = Array(18).fill(null);
    scores.p2 = Array(18).fill(null);
    render();
    toastMsg("Scores cleared");
  });

  btnCopyLink.addEventListener("click", async () => {
    haptic("light");
    const url = location.origin + location.pathname + (course ? `?c=${encodeCourse()}` : "");
    try{
      await navigator.clipboard.writeText(url);
      toastMsg("Link copied");
    }catch{
      // fallback prompt
      window.prompt("Copy this link:", url);
    }
  });

  n1.addEventListener("input", () => { setPlayerHeaders(); });
  n2.addEventListener("input", () => { setPlayerHeaders(); });

  themeToggle.addEventListener("click", () => {
    haptic("light");
    const cur = document.documentElement.getAttribute("data-theme") || "system";
    const nxt = nextTheme(cur);
    localStorage.setItem("bp_theme", nxt);
    applyTheme(nxt);
  });

  // ---------- URL handling ----------
  function updateURLFromCourse(){
    const params = new URLSearchParams(location.search);
    if(course){
      params.set("c", encodeCourse());
    }else{
      params.delete("c");
    }
    const newUrl = location.pathname + (params.toString() ? `?${params.toString()}` : "");
    history.replaceState({}, "", newUrl);
  }

  function initFromURL(){
    const params = new URLSearchParams(location.search);
    const c = params.get("c");
    if(!c) return false;
    const decoded = decodeCourse(c);
    if(!decoded) return false;
    course = decoded;
    return true;
  }

  // ---------- INIT ----------
  (function init(){
    // Theme init
    const savedTheme = localStorage.getItem("bp_theme") || "system";
    applyTheme(savedTheme);

    // React to system theme if in system mode
    if(window.matchMedia){
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "system";
        if(cur === "system") applyTheme("system");
      });
    }

    // Load from URL if present else generate once
    if(!initFromURL()){
      course = generateCourse();
      updateURLFromCourse();
    }

    render();
  })();

})();
