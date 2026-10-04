// ===== 설정 (여기만 고치면 됨) =====
const SHEET_URL = "https://script.google.com/macros/s/AKfycbxT5-lAhEZetpBkVQdGbriYU2ClTeGtx9-WRPFuG13NzObmqOP5IzRPpEX0-KajcGU2TA/exec";                                // 구글 앱스 스크립트 웹앱 주소 (비워 두면 전송 안 함)
const MINUTES = {
  basic: 60,
  adv: { 100: 25, 200: 50 }
};
const PASS = 80;                                         // 통과 점수(100점 만점)
const IMG = { pass: "img/pass.webp", fail: "img/fail.webp" };
Object.values(IMG).forEach(s => { new Image().src = s; });   // 결과 사진 미리 불러오기
const CHOICE_MIN = 5, CHOICE_MAX = 7;                  // 보기 개수 범위

// 불러오기 실패 때 쓰는 테스트용 샘플
const SAMPLE = { basic: [
  { id: "s1", text: "1. 핵심 정리\n구분\t내용\n갈래\t{{blank}}\n성격\t{{blank}}, 애상적, {{blank}}\n제재\t{{blank}}\n주제\t누이의 죽음으로 인한 슬픔과 {{blank}}의 소망", answers: ["향가", "추모적", "종교적", "누이의 죽음", "재회"] },
  { id: "s2", text: "2. 향가의 표기 방식인 향찰\n향찰(鄉札)은 중국 글자인 한자를 빌려서 우리말을 적은 {{blank}}(借字) 표기의 일종이다. 한자를 빌려 표기하는 방법은 두 가지로 나뉜다. 하나는 한자의 음을 빌려다 쓰는 {{blank}}(音借) 방식이고, 다른 하나는 그 뜻을 빌려 쓰는 {{blank}}(訓借) 방식이다.", answers: ["차자", "음차", "훈차"] }
] };

// ===== 상태 =====
let DATA = null, level = "basic", count = null;
let quiz = [], idx = 0, bi = 0, answers = [], startedAt = 0, timerId = null, deadline = 0, finished = false;
const $ = id => document.getElementById(id);

// ===== 유틸 =====
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = s => s.replace(/\s+/g, "");
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const show = id => ["start", "quiz", "result"].forEach(v => $(v).hidden = v !== id);
// 문단 글 → HTML: \t 있는 줄은 표의 한 행(첫 행은 머리글), 소제목 줄은 굵게. {{blank}} 자리는 그대로 둠
const isHead = l => l.length < 40 && !l.includes("{{blank}}") && /^(\d+\.|\(\d+\)|[①-⑳])\s/.test(l);
function layout(t) {
  const out = []; let rows = [];
  const flush = () => {
    if (!rows.length) return;
    out.push("<table>" + rows.map((r, i) => "<tr>" + r.split("\t").map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join("") + "</tr>").join("") + "</table>");
    rows = [];
  };
  for (const l of esc(t).split("\n")) {
    if (l.includes("\t")) rows.push(l);
    else { flush(); out.push(`<p${isHead(l) ? ' class="h"' : ""}>${l}</p>`); }
  }
  flush();
  return out.join("");
}
const p2 = n => String(n).padStart(2, "0");
const stamp = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;  // 시트가 날짜·시각으로 알아보는 형식
const fmt = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

// ===== 데이터 불러오기 =====
async function load() {
  if (window.QUESTIONS) { DATA = window.QUESTIONS; return retryPending(); }   // 더블클릭으로 열어도 동작
  try {
    const r = await fetch("questions.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
  } catch (e) {
    DATA = SAMPLE; failMsg = "문제 파일을 못 불러와 샘플로 실행 중입니다. ";
    refreshStart();
  }
  retryPending();
}

// ===== 시작 화면 =====
let failMsg = "";
function refreshStart() {
  const isAdv = level === "adv";
  $("countWrap").hidden = !isAdv;
  let note = "";
  if (!isAdv) {
    note = `기본형: 총 51문항(빈칸 201개) · 제한 ${MINUTES.basic}분`;
    $("go").disabled = !$("name").value.trim();
  } else {
    note = count ? `심화형: 빈칸 약 ${count}개 · 제한 ${MINUTES.adv[count]}분` : "문제 수를 선택해 주세요 (100개 / 200개)";
    $("go").disabled = !(count && $("name").value.trim());
  }
  $("info").textContent = failMsg + note;
}
function bindGroup(groupId, attr, setter) {
  $(groupId).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    [...$(groupId).children].forEach(x => x.classList.toggle("on", x === b));
    setter(b.dataset[attr]); refreshStart();
  });
}
bindGroup("levelGroup", "level", v => {
  level = v;
  if (level === "adv" && !count) {
    count = 100;
    const btns = $("countGroup").querySelectorAll("button");
    if (btns.length) {
      btns.forEach(x => x.classList.toggle("on", x.dataset.count === "100"));
    }
  }
});
bindGroup("countGroup", "count", v => count = +v);
$("name").addEventListener("input", refreshStart);
$("go").addEventListener("click", startQuiz);
$("again").addEventListener("click", () => { show("start"); });

// ===== 출제 =====
// 같은 단원 오답: 문항은 원본 순서대로라 앞뒤 NEAR문단의 정답을 오답 후보로 씀(모자라면 범위를 넓힘)
const NEAR = 10;
function nearPool(all, qi, used) {
  for (let r = NEAR; ; r *= 2) {
    const seen = new Set(), pool = [];
    for (const x of all.slice(Math.max(0, qi - r), qi + r + 1))
      for (const w of x.answers) if (!used.has(norm(w)) && !seen.has(norm(w))) { seen.add(norm(w)); pool.push(w); }
    if (pool.length >= CHOICE_MAX * 2 || r >= all.length) return pool;
  }
}
// 같은 범주 묶음: 정답이 여기 들어 있으면 같은 묶음의 다른 말을 먼저 오답으로 넣음(when이 있으면 문항 글에 그 말이 있을 때만)
const GROUPS = [
  { words: ["향가", "고려가요", "시조", "가사", "민요"] },
  { words: ["차자", "음차", "훈차"] },
  { words: ["4구체", "8구체", "10구체"] },
  { words: ["초장", "중장", "종장"] },
  { words: ["기", "서", "결"] },
  { words: ["기", "승", "전", "결"] },
  { words: ["자유시", "정형시", "산문시"] },
  { words: ["서정시", "서사시", "극시"] },
  { words: ["해학적", "풍자적"] },
  { words: ["운문체", "산문체"] },
  { words: ["평시조", "사설시조", "연시조"] },
  { words: ["비유", "상징"] },
  { words: ["소극적", "적극적"] },
  { words: ["통사적 합성어", "비통사적 합성어"] },
  { words: ["명사", "대명사", "수사", "동사", "형용사", "관형사", "부사", "조사", "감탄사"] },
  { words: ["체언", "용언", "수식언", "관계언", "독립언"] },
  { words: ["주어", "서술어", "목적어", "보어", "관형어", "부사어", "독립어"] },
  { words: ["주성분", "부속 성분", "독립 성분"] },
];
function groupMates(a, q) {
  const g = GROUPS.find(g => g.words.some(w => norm(w) === norm(a)) && (!g.when || g.when.test(q.text)));
  return g ? g.words.filter(w => norm(w) !== norm(a)) : [];
}
function makeChoices(q, all) {        // 빈칸마다 보기 세트 하나
  const used = new Set(q.answers.map(norm));
  const pool = nearPool(all, all.indexOf(q), used);
  return q.answers.map(a => {
    const n = CHOICE_MIN + Math.floor(Math.random() * (CHOICE_MAX - CHOICE_MIN + 1));   // 5~7개
    const mates = shuffle(groupMates(a, q)).slice(0, n - 1), have = new Set(mates.map(norm));
    const wrong = [...mates, ...shuffle(pool).filter(w => !have.has(norm(w))).slice(0, n - 1 - mates.length)];
    return shuffle([a, ...wrong]);
  });
}
function startQuiz() {
  const pool = (DATA && DATA[level]) || (level === "basic" ? SAMPLE.basic : SAMPLE.adv || SAMPLE.basic);
  quiz = [];
  let limit = MINUTES.basic;
  if (level === "basic") {
    for (const q of shuffle(pool)) { quiz.push({ q, choices: makeChoices(q, pool) }); }
    limit = MINUTES.basic;
  } else {
    let sum = 0;
    for (const q of shuffle(pool)) {
      if (sum >= count) break;
      quiz.push({ q, choices: makeChoices(q, pool) });
      sum += q.answers.length;
    }
    limit = (MINUTES.adv && MINUTES.adv[count]) || 25;
  }
  clearTimeout(autoId); idx = 0; bi = 0; answers = quiz.map(x => x.q.answers.map(() => null)); finished = false;
  startedAt = Date.now(); deadline = startedAt + limit * 60000;
  show("quiz"); renderQ();
  clearInterval(timerId); timerId = setInterval(tick, 500); tick();
}
function tick() {
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  $("timer").textContent = fmt(left);
  $("timer").classList.toggle("low", left <= 60);
  if (left <= 0) finish(true);
}
// 한 문단 그리기: 채운 빈칸은 고른 말, 지금 빈칸은 깜빡이는 칸, 빈 칸은 번호(①②…)
const NUM = "①②③④⑤⑥⑦⑧⑨⑩";
function renderQ() {
  const { q, choices } = quiz[idx], picks = answers[idx];
  $("progress").textContent = `${idx + 1} / ${quiz.length}`;
  $("bar").style.width = `${(idx / quiz.length) * 100}%`;
  let n = 0;
  $("hint").textContent = `${NUM[bi] || bi + 1} 빈칸에 들어갈 말`;
  $("sentence").innerHTML = layout(q.text).replace(/\{\{blank\}\}/g, () => {
    const i = n++, p = picks[i];
    return `<span class="blank${p !== null ? " done" : ""}${i === bi ? " now" : ""}" data-i="${i}">${p !== null ? esc(p) : NUM[i] || i + 1}</span>`;
  });
  const box = $("choices"); box.innerHTML = "";
  choices[bi].forEach(c => {
    const b = document.createElement("button"); b.textContent = c;
    if (c === picks[bi]) b.className = "sel";
    b.addEventListener("click", () => choose(c)); box.appendChild(b);
  });
  $("prev").disabled = idx === 0;
  const last = idx + 1 >= quiz.length;   // '다음'은 안 보임: 마지막 문단의 '제출', 또는 '이전'으로 돌아와 다 채워진 문단에서만 보임
  $("next").hidden = !last && picks.includes(null);
  $("next").disabled = picks.includes(null);
  $("next").textContent = idx + 1 >= quiz.length ? "제출" : "다음";
}
function choose(c) {                  // 같은 보기를 다시 누르면 취소
  if (finished) return;
  const picks = answers[idx];
  if (picks[bi] === c) picks[bi] = null;
  else {
    picks[bi] = c;
    const nx = picks.findIndex((p, i) => p === null && i > bi), any = picks.indexOf(null);
    bi = nx >= 0 ? nx : any >= 0 ? any : bi;   // 다음 빈 빈칸으로 이동
  }
  renderQ();
  clearTimeout(autoId);                 // 문단의 빈칸을 다 채우면 잠깐 보여 준 뒤 다음 문단으로(마지막 문단은 '제출'을 직접 누름)
  if (!picks.includes(null) && idx + 1 < quiz.length) { $("next").hidden = true; const at = idx; autoId = setTimeout(() => { if (idx === at && !finished) go(1); }, 400); }
}
let autoId = null;
function go(d) {                        // d=1 다음 문단, d=-1 이전 문단
  clearTimeout(autoId);
  idx += d; const e = answers[idx].indexOf(null); bi = e >= 0 ? e : 0;
  renderQ(); window.scrollTo(0, 0);
}
$("sentence").addEventListener("click", e => {   // 빈칸을 누르면 그 빈칸 선택, 채운 빈칸을 다시 누르면 취소
  const s = e.target.closest(".blank"); if (!s || finished) return;
  const i = +s.dataset.i;
  if (i === bi && answers[idx][i] !== null) answers[idx][i] = null; else bi = i;
  renderQ();
});
$("next").addEventListener("click", () => {
  if (idx + 1 >= quiz.length) return finish(false);
  go(1);
});
$("prev").addEventListener("click", () => { if (idx > 0 && !finished) go(-1); });

// ===== 결과 =====
function finish(timedOut) {
  if (finished) return; finished = true; clearInterval(timerId);
  // 점수는 빈칸 하나가 1점
  let right = 0, solved = 0, total = 0;
  const wrong = [];
  quiz.forEach(({ q }, i) => {
    const picks = answers[i];
    total += q.answers.length; solved += picks.filter(p => p !== null).length;
    const ok = q.answers.map((a, b) => picks[b] !== null && norm(picks[b]) === norm(a));
    right += ok.filter(Boolean).length;
    if (picks.some((p, b) => p !== null && !ok[b])) wrong.push({ q, ok, picks });
  });
  const sec = Math.round((Date.now() - startedAt) / 1000);
  const pct = total ? Math.round((right / total) * 100) : 0, passed = pct >= PASS;
  $("score").innerHTML = `<div>${pct}<small>점</small></div>`;
  $("ring").style.setProperty("--p", pct);
  $("resultImg").src = passed ? IMG.pass : IMG.fail;
  $("verdict").textContent = passed ? "통과! 🎉" : "아쉽다… 다시 도전!";
  $("verdict").className = passed ? "pass" : "fail";
  $("reveal").classList.toggle("is-fail", !passed);
  $("wrongTitle").hidden = !wrong.length;
  $("sub").textContent = `맞힌 빈칸 ${right} / ${total} · 통과 ${PASS}점 · ${fmt(sec)}` + (timedOut ? ` · 시간 종료 (미응시 ${total - solved})` : "");
  $("wrongList").innerHTML = wrong.length
    ? wrong.map(({ q, ok, picks }) => {
        let n = 0;
        const t = layout(q.text).replace(/\{\{blank\}\}/g, () => { const b = n++; return `<b class="${ok[b] ? "good" : "ans"}">${esc(q.answers[b])}</b>`; });
        return `<div class="card passage">${t}</div>`;
      }).join("")
    : '<p class="note">틀린 문제가 없습니다.</p>';
  show("result"); window.scrollTo(0, 0);
  $("suspense").hidden = false; $("reveal").hidden = true;           // 2초 두근두근 후 공개
  setTimeout(() => { $("suspense").hidden = true; $("reveal").hidden = false; }, 2000);
  const levelText = level === "basic" ? "기본형" : `심화형(${count}개)`;
  sendResult({
    time: stamp(new Date()), name: $("name").value.trim(), level: levelText,
    total, score: right, solved, wrong: wrong.map(w => w.q.id).join(","), seconds: sec, timedOut: timedOut ? "Y" : "N"
  });
}

// ===== 스프레드시트 전송 (실패하면 기기에 보관했다가 다음 접속 때 다시 보냄) =====
const post = r => fetch(SHEET_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(r) });
const pending = () => { try { return JSON.parse(localStorage.getItem("pending") || "[]"); } catch (e) { return []; } };
const savePending = a => { try { localStorage.setItem("pending", JSON.stringify(a)); } catch (e) {} };
async function sendResult(r) {
  if (!SHEET_URL) return;
  try { await post(r); } catch (e) { savePending([...pending(), r]); }
}
async function retryPending() {
  if (!SHEET_URL) return;
  const keep = [];
  for (const r of pending()) { try { await post(r); } catch (e) { keep.push(r); } }
  savePending(keep);
}

load();
