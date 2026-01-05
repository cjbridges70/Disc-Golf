/* ============================================================
   Bridges Park – app.js
   - Generator with constraints + unique throws
   - Holes 9 and 18 must be to GREEN
   - Start is tee -> random target but NOT green
   - No consecutive same goal
   - Remove pink<->green (both directions)
   - Par rules (incl Tee->White par 3, Blue<->Pink par 3)
   - Dropdown scoring: "-" (empty) counts as 0 until changed
   - Colors: under/even/over per hole + totals
   - Share link preserves generated course
   - Clear scores
   - Haptics (vibrate where supported)
   - No auto scroll on "Generate New Course"
   - Auto scroll when selecting a hole row or changing a score
   ============================================================ */

const GOALS = ["white","orange","blue","pink","red","green","yellow"];
const START = "tee";
const FIXED_GREEN_HOLES = new Set([9,18]); // 1-based

// ---------- DOM ----------
const mainBody = document.getElementById("mainBody");
const parFrontTop = document.getElementById("parFrontTop");
const parBackTop  = document.getElementById("parBackTop");
const parTotalTop = document.getElementById("parTotalTop");
const parBackCell = document.getElementById("parBackCell");
const parTotalCell= document.getElementById("parTotalCell");

const p1HeadSticky = document.getElementById("p1HeadSticky");
const p2HeadSticky = document.getElementById("p2HeadSticky");

const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");

const btnGen = document.getElementById("btnGen");
const btnClear = document.getElementById("btnClear");
const btnCopyLink = document.getElementById("btnCopyLink");

const n1 = document.getElementById("n1");
const n2 = document.getElementById("n2");

const toastEl = document.getElementById("toast");

const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const logoLight = document.getElementById("logoLight");
const logoDark = document.getElementById("logoDark");

// ---------- State ----------
let courseTargets = null;     // array of 18 "to" goals
let activeHoleIndex = 0;      // 0..17

// Each element is "" (means "-") or one of "-2","-1","0","1","2","3"
let p1Diffs = Array(18).fill("");
let p2Diffs = Array(18).fill("");

// ---------- Helpers ----------
function haptic(){
  try { if (navigator.vibrate) navigator.vibrate(10); } catch(_) {}
}
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=>toastEl.classList.remove("show"), 950);
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function shuffleInPlace(arr){
  for (let i=arr.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}
function goalClass(goal){
  return `goalTag goal-${goal}`;
}

// ---------- Theme + logo swap ----------
(function themeInit(){
  function prefersDark(){
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function getSaved(){
    const t = localStorage.getItem("bp_theme");
    return (t === "dark" || t === "light") ? t : null;
  }
  function apply(theme){
    document.documentElement.setAttribute("data-theme", theme);
    const isDark = theme === "dark";
    themeIcon.src = isDark ? "sun.png" : "moon.png"; // icon shows what you'll switch to
    if (logoLight && logoDark){
      logoLight.style.display = isDark ? "none" : "block";
      logoDark.style.display  = isDark ? "block" : "none";
    }
  }

  apply(getSaved() || (prefersDark() ? "dark" : "light"));

  if (window.matchMedia){
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (!getSaved()) apply(prefersDark() ? "dark" : "light"); };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    const cur = document.documentElement.getAttribute("data-theme") || (prefersDark() ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    localStorage.setItem("bp_theme", next);
    apply(next);
    haptic();
  }, true);
})();

// ---------- Player names -> headers ----------
function syncPlayerHeaders(){
  const a = (n1.value || "").trim();
  const b = (n2.value || "").trim();
  p1HeadSticky.textContent = a ? a : "P1";
  p2HeadSticky.textContent = b ? b : "P2";
}
n1.addEventListener("input", syncPlayerHeaders);
n2.addEventListener("input", syncPlayerHeaders);

// ---------- Course constraints ----------
function allowedNext(from){
  const all = new Set(GOALS);
  all.delete(from); // no consecutive same

  if (from === START){
    all.delete("green"); // start cannot be green
    return [...all];
  }
  if (from === "white"){
    return [...all];
  }
  if (from === "orange"){
    all.delete("pink");
    all.delete("blue");
    return [...all];
  }
  if (from === "blue"){
    all.delete("orange");
    all.delete("red");
    return [...all];
  }
  if (from === "pink"){
    all.delete("orange");
    all.delete("red");
    all.delete("green"); // removed
    return [...all];
  }
  if (from === "red"){
    all.delete("blue");
    all.delete("pink");
    return [...all];
  }
  if (from === "green"){
    all.delete("yellow");
    all.delete("pink"); // removed
    return [...all];
  }
  if (from === "yellow"){
    all.delete("green");
    return [...all];
  }
  return [...all];
}

// ---------- Par rules ----------
function keyPair(a,b){ return a < b ? `${a}|${b}` : `${b}|${a}`; }

const par3Pairs = new Set([
  keyPair("white","yellow"),
  keyPair("white","green"),
  keyPair("yellow","red"),
  keyPair("yellow","pink"),
  keyPair("green","red"),
  keyPair("red","orange"),
  keyPair("red","blue"),
  keyPair("blue","pink"), // requested par 3
]);

const par5Pairs = new Set([
  keyPair("white","blue"),
  keyPair("white","orange"),
]);

function holePar(from,to){
  // Tee -> white is par 3
  if (from === START && to === "white") return 3;

  const k = keyPair(from,to);
  if (par3Pairs.has(k)) return 3;
  if (par5Pairs.has(k)) return 5;
  return 4;
}

// ---------- Generator (backtracking) ----------
function goalsMissingToReach2(counts){
  let missing = 0;
  for (const g of GOALS){
    const c = counts[g] || 0;
    if (c < 2) missing += (2 - c);
  }
  return missing;
}

function generateCourse(maxAttempts=2500){
  for (let attempt=0; attempt<maxAttempts; attempt++){
    const counts = Object.fromEntries(GOALS.map(g=>[g,0]));
    const usedEdges = new Set(); // "from>to" must be unique
    const targets = [];

    if (backtrack(1, START, counts, usedEdges, targets)) return targets;
  }
  return null;
}

function backtrack(holeNum, from, counts, usedEdges, targets){
  if (holeNum === 19){
    for (const g of GOALS){
      if ((counts[g]||0) < 2) return false;
    }
    return true;
  }

  const mustGreen = FIXED_GREEN_HOLES.has(holeNum);
  let options = mustGreen ? ["green"] : allowedNext(from);
  shuffleInPlace(options);

  for (const to of options){
    if (mustGreen && to !== "green") continue;

    const edgeKey = `${from}>${to}`;
    if (usedEdges.has(edgeKey)) continue;

    // Take
    usedEdges.add(edgeKey);
    targets.push(to);
    counts[to] = (counts[to]||0) + 1;

    // Prune
    const holesLeft = 18 - holeNum;
    const minNeeded = goalsMissingToReach2(counts);
    if (minNeeded <= holesLeft){
      // If next hole is fixed green, ensure reachable with unused edge
      const nextHole = holeNum + 1;
      if (nextHole <= 18 && FIXED_GREEN_HOLES.has(nextHole)){
        const canToGreen = allowedNext(to).includes("green") && !usedEdges.has(`${to}>green`);
        if (canToGreen){
          if (backtrack(holeNum+1, to, counts, usedEdges, targets)) return true;
        }
      } else {
        if (backtrack(holeNum+1, to, counts, usedEdges, targets)) return true;
      }
    }

    // Undo
    counts[to]--;
    targets.pop();
    usedEdges.delete(edgeKey);
  }

  return false;
}

// ---------- Share link encode/decode ----------
function encodeCourse(targets){
  return targets.join(",");
}
function decodeCourse(s){
  const parts = (s||"").split(",").map(x=>x.trim()).filter(Boolean);
  if (parts.length !== 18) return null;

  for (const p of parts){
    if (!GOALS.includes(p)) return null;
  }

  // fixed greens
  if (parts[8] !== "green" || parts[17] !== "green") return null;

  // validate edges + rules + uniqueness
  const used = new Set();
  let from = START;
  for (let i=0; i<18; i++){
    const to = parts[i];
    if (!allowedNext(from).includes(to)) return null;
    const ek = `${from}>${to}`;
    if (used.has(ek)) return null;
    used.add(ek);
    from = to;
  }

  // min 2 per goal
  const counts = Object.fromEntries(GOALS.map(g=>[g,0]));
  for (const t of parts) counts[t]++;
  for (const g of GOALS) if (counts[g] < 2) return null;

  return parts;
}

function currentShareURL(){
  const url = new URL(window.location.href);
  url.searchParams.set("course", encodeCourse(courseTargets));
  url.hash = "";
  return url.toString();
}

// ---------- Rendering ----------
function buildScoreSelect(holeIndex, player){
  const sel = document.createElement("select");
  sel.className = "scoreSel score-even";

  // "-" option counts as 0 but visually indicates untouched
  const optDash = new Option("-", "", true, true);
  sel.add(optDash);

  // value options: -2..+3, and 0
  const values = [-2,-1,0,1,2,3];
  for (const v of values){
    const label = v > 0 ? `+${v}` : `${v}`;
    sel.add(new Option(label, String(v), false, false));
  }

  const current = (player === 1 ? p1Diffs[holeIndex] : p2Diffs[holeIndex]);
  sel.value = current;

  sel.addEventListener("change", (e) => {
    const v = sel.value; // "" or "-2".."3"
    if (player === 1) p1Diffs[holeIndex] = v;
    else p2Diffs[holeIndex] = v;

    updateHoleColor(holeIndex);
    updateTotalsAndProgress();

    // Keep "auto scroll when a new hole is selected" (including via input)
    setActiveHole(holeIndex, true);

    haptic();
  });

  return sel;
}

function renderCourse(){
  if (!courseTargets){
    mainBody.innerHTML = "";
    return;
  }

  syncPlayerHeaders();

  // compute pars
  const pars = [];
  let frontPar=0, backPar=0;

  for (let i=0; i<18; i++){
    const from = (i===0) ? START : courseTargets[i-1];
    const to = courseTargets[i];
    const p = holePar(from,to);
    pars.push(p);
    if (i<9) frontPar += p; else backPar += p;
  }
  const totalPar = frontPar + backPar;

  parFrontTop.textContent = frontPar;
  parBackTop.textContent  = backPar;
  parTotalTop.textContent = totalPar;
  parBackCell.textContent = backPar;
  parTotalCell.textContent= totalPar;

  mainBody.innerHTML = "";

  for (let i=0; i<18; i++){
    const holeNum = i+1;
    const from = (i===0) ? START : courseTargets[i-1];
    const to = courseTargets[i];

    const tr = document.createElement("tr");
    tr.className = "holeRow" + (i === activeHoleIndex ? " active" : "");
    tr.dataset.holeIndex = String(i);

    const tdNum = document.createElement("td");
    tdNum.textContent = String(holeNum);

    const tdThrow = document.createElement("td");
    tdThrow.innerHTML = `
      <div class="twoPip">
        <span class="${goalClass(from)}">${from}</span>
        <span class="arrow">→</span>
        <span class="${goalClass(to)}">${to}</span>
      </div>
    `;

    const tdPar = document.createElement("td");
    tdPar.textContent = String(pars[i]);

    const tdP1 = document.createElement("td");
    const tdP2 = document.createElement("td");

    tdP1.appendChild(buildScoreSelect(i,1));
    tdP2.appendChild(buildScoreSelect(i,2));

    tr.append(tdNum, tdThrow, tdPar, tdP1, tdP2);

    tr.addEventListener("click", (e) => {
      if (e.target && e.target.tagName === "SELECT") return;
      setActiveHole(i, true);
    });

    mainBody.appendChild(tr);

    // Insert Front 9 summary row immediately after hole 9
    if (holeNum === 9){
      const sum = document.createElement("tr");
      sum.className = "sumRow";
      sum.innerHTML = `
        <th colspan="2" class="left">Front 9</th>
        <td id="parFrontCell">${frontPar}</td>
        <td>
          <div class="sumCell">
            <span id="fd1" class="sumDiff">0</span>
            <span id="f1" class="sumThrows">0</span>
          </div>
        </td>
        <td>
          <div class="sumCell">
            <span id="fd2" class="sumDiff">0</span>
            <span id="f2" class="sumThrows">0</span>
          </div>
        </td>
      `;
      mainBody.appendChild(sum);
    }
  }

  updateAllHoleColors();
  updateTotalsAndProgress();
}

function setActiveHole(i, scroll){
  activeHoleIndex = clamp(i, 0, 17);

  document.querySelectorAll("tbody tr.holeRow").forEach(tr => {
    const idx = Number(tr.dataset.holeIndex);
    tr.classList.toggle("active", idx === activeHoleIndex);
  });

  updateProgress();

  if (scroll){
    const tr = document.querySelector(`tbody tr.holeRow[data-hole-index="${activeHoleIndex}"]`);
    if (tr) tr.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });
  }
}

function diffNum(v){
  // "" (dash) counts as 0
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function setSelClass(sel, diff){
  sel.classList.remove("score-under","score-even","score-over");
  if (diff < 0) sel.classList.add("score-under");
  else if (diff > 0) sel.classList.add("score-over");
  else sel.classList.add("score-even");
}

function updateHoleColor(holeIndex){
  const row = document.querySelector(`tbody tr.holeRow[data-hole-index="${holeIndex}"]`);
  if (!row) return;
  const s1 = row.querySelector("td:nth-child(4) select");
  const s2 = row.querySelector("td:nth-child(5) select");
  if (!s1 || !s2) return;

  setSelClass(s1, diffNum(p1Diffs[holeIndex]));
  setSelClass(s2, diffNum(p2Diffs[holeIndex]));
}

function updateAllHoleColors(){
  for (let i=0; i<18; i++) updateHoleColor(i);
}

function formatDiff(d){
  return d === 0 ? "0" : (d > 0 ? `+${d}` : `${d}`);
}

function setSum(diffId, strokesId, diff, strokes, colorize){
  const dEl = document.getElementById(diffId);
  const tEl = document.getElementById(strokesId);
  if (!dEl || !tEl) return;

  dEl.textContent = formatDiff(diff);
  tEl.textContent = String(strokes);

  if (colorize){
    dEl.style.background = diff < 0 ? "var(--underBg)" : diff > 0 ? "var(--overBg)" : "var(--evenBg)";
  } else {
    dEl.style.background = "transparent";
  }
}

function updateTotalsAndProgress(){
  if (!courseTargets) return;

  // pars
  const pars = [];
  let frontPar=0, backPar=0;
  for (let i=0; i<18; i++){
    const from = (i===0) ? START : courseTargets[i-1];
    const to = courseTargets[i];
    const p = holePar(from,to);
    pars.push(p);
    if (i<9) frontPar += p; else backPar += p;
  }
  const totalPar = frontPar + backPar;

  // sums
  let f1d=0,f2d=0,b1d=0,b2d=0;
  let f1s=0,f2s=0,b1s=0,b2s=0;

  for (let i=0; i<18; i++){
    const par = pars[i];
    const d1 = diffNum(p1Diffs[i]);
    const d2 = diffNum(p2Diffs[i]);
    const s1 = par + d1;
    const s2 = par + d2;

    if (i < 9){
      f1d += d1; f2d += d2;
      f1s += s1; f2s += s2;
    } else {
      b1d += d1; b2d += d2;
      b1s += s1; b2s += s2;
    }
  }

  // Front 9 row (in tbody)
  setSum("fd1","f1", f1d, f1s, false);
  setSum("fd2","f2", f2d, f2s, false);

  // Back row
  setSum("bd1","b1", b1d, b1s, false);
  setSum("bd2","b2", b2d, b2s, false);

  // Total row (colored)
  setSum("d1","t1", f1d+b1d, f1s+b1s, true);
  setSum("d2","t2", f2d+b2d, f2s+b2s, true);

  updateProgress();
}

function updateProgress(){
  const cur = activeHoleIndex + 1;
  progressFill.style.width = `${(cur/18)*100}%`;
  progressText.textContent = `${cur} / 18`;
}

// ---------- Buttons ----------
btnGen.addEventListener("click", () => {
  const targets = generateCourse(3000);
  if (!targets){
    toast("Could not generate (try again)");
    return;
  }

  courseTargets = targets;

  // Reset scores (default dash which counts as 0)
  p1Diffs = Array(18).fill("");
  p2Diffs = Array(18).fill("");

  // Reset active hole to 1, but DO NOT auto-scroll on generate
  activeHoleIndex = 0;

  renderCourse();
  localStorage.setItem("bp_last_course", encodeCourse(courseTargets));

  toast("New course generated");
  haptic();
});

btnClear.addEventListener("click", () => {
  p1Diffs = Array(18).fill("");
  p2Diffs = Array(18).fill("");
  renderCourse(); // re-render selects to reset to "-"
  toast("Scores cleared");
  haptic();
});

btnCopyLink.addEventListener("click", async () => {
  if (!courseTargets){
    toast("Generate a course first");
    return;
  }
  const link = currentShareURL();
  try{
    await navigator.clipboard.writeText(link);
    toast("Share link copied");
  }catch(_){
    const ta = document.createElement("textarea");
    ta.value = link;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("Share link copied");
  }
  haptic();
});

// ---------- Init ----------
(function init(){
  syncPlayerHeaders();

  const url = new URL(window.location.href);
  const param = url.searchParams.get("course");
  let decoded = param ? decodeCourse(param) : null;

  if (!decoded){
    const last = localStorage.getItem("bp_last_course");
    decoded = last ? decodeCourse(last) : null;
  }
  if (!decoded){
    decoded = generateCourse(3000);
  }

  courseTargets = decoded;
  renderCourse();
  setActiveHole(0, false);
})();
