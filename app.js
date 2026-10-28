'use strict';

const $ = id => document.getElementById(id);
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s:()·*ㆍ._-]/g, '');
const STORAGE_KEY = 'nikke-manufacturer-quiz-v1';
const defaults = () => ({ solved: [], revealed: [], elapsed: 0, company: 'all', variants: true });
let data;
let pool = [];
let state = defaults();
let lastTick = Date.now();
let composing = false;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, revision: data.revision })); } catch { /* Private mode can disable storage. */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.revision !== data.revision) return;
    const valid = new Set(data.characters.map(character => character.id));
    const solved = Array.isArray(saved.solved) ? [...new Set(saved.solved.filter(id => valid.has(id)))] : [];
    const revealed = Array.isArray(saved.revealed) ? [...new Set(saved.revealed.filter(id => valid.has(id) && !solved.includes(id)))] : [];
    state = {
      solved, revealed,
      elapsed: Number.isFinite(saved.elapsed) ? Math.max(0, Math.floor(saved.elapsed)) : 0,
      company: saved.company === 'all' || Object.hasOwn(data.companies, saved.company) ? saved.company : 'all',
      variants: typeof saved.variants === 'boolean' ? saved.variants : true,
    };
  } catch { /* Ignore unusable saved data. */ }
}

function selectedCharacters() {
  return data.characters.filter(character =>
    (state.company === 'all' || character.company === state.company) &&
    (state.variants || !character.isVariant));
}

function message(text) { $('feedback').textContent = text; }
function complete() { return pool.length > 0 && pool.every(character => state.solved.includes(character.id) || state.revealed.includes(character.id)); }
function clock() {
  $('timer').textContent = `${String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:${String(state.elapsed % 60).padStart(2, '0')}`;
}

function makeCard(character, index, companyName) {
  const solved = state.solved.includes(character.id);
  const revealed = state.revealed.includes(character.id);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card' + (solved ? ' solved' : revealed ? ' revealed' : '');
  card.setAttribute('aria-label', solved || revealed ? character.label : `${companyName} ${index + 1}번 정답 공개`);
  if (solved || revealed) {
    if (character.image) {
      const img = document.createElement('img');
      img.src = character.image;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove(), { once: true });
      card.append(img);
    }
    const caption = document.createElement('span');
    caption.className = 'name';
    caption.textContent = character.label;
    card.append(caption);
    if (revealed) {
      const tag = document.createElement('small');
      tag.textContent = '정답 공개';
      card.append(tag);
    }
  } else {
    const question = document.createElement('span');
    question.className = 'unknown';
    question.textContent = '?';
    const number = document.createElement('small');
    number.textContent = String(index + 1).padStart(2, '0');
    card.append(question, number);
  }
  card.addEventListener('click', () => {
    if (solved || revealed || !confirm('정답을 공개할까요? 공개한 니케는 점수에 포함되지 않습니다.')) return;
    state.revealed.push(character.id);
    save();
    render();
    if (!complete()) message(`${character.label} · 정답을 공개했습니다.`);
  });
  return card;
}

function render() {
  pool = selectedCharacters();
  $('board').replaceChildren();
  $('nav').replaceChildren();
  Object.entries(data.companies).forEach(([company, name], index) => {
    const characters = pool.filter(character => character.company === company);
    if (!characters.length) return;
    const link = document.createElement('a');
    link.href = '#company-' + company;
    link.textContent = name;
    $('nav').append(link);
    const section = document.createElement('section');
    section.className = 'company';
    section.id = 'company-' + company;
    const head = document.createElement('div');
    head.className = 'company-head';
    const icon = document.createElement('div');
    icon.className = 'company-icon';
    icon.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('h3');
    title.textContent = name;
    const count = document.createElement('span');
    const guessed = characters.filter(character => state.solved.includes(character.id)).length;
    count.textContent = `${guessed} / ${characters.length}종`;
    head.append(icon, title, count);
    const cards = document.createElement('div');
    cards.className = 'cards';
    characters.forEach((character, position) => cards.append(makeCard(character, position, name)));
    section.append(head, cards);
    $('board').append(section);
  });
  const solved = pool.filter(character => state.solved.includes(character.id)).length;
  const revealed = pool.filter(character => state.revealed.includes(character.id)).length;
  $('score').textContent = `${solved} / ${pool.length}`;
  const percent = pool.length ? (solved + revealed) / pool.length * 100 : 0;
  $('progress').style.width = `${percent}%`;
  document.querySelector('.track').setAttribute('aria-valuenow', Math.round(percent));
  clock();
  if (complete()) message(`도감 완성! 직접 맞힌 니케 ${solved}종 · 정답 공개 ${revealed}종`);
}

function resetGame() {
  state.solved = [];
  state.revealed = [];
  state.elapsed = 0;
  lastTick = Date.now();
  save();
  render();
  $('answer').value = '';
  message('새 도감이 준비됐어요. 이름을 입력하고 Enter를 눌러주세요.');
}

function changeSetting() {
  if (!data) return;
  if ((state.solved.length || state.revealed.length || state.elapsed) && !confirm('설정을 변경하면 현재 진행 기록이 초기화됩니다. 계속할까요?')) {
    $('company').value = state.company;
    $('variants').checked = state.variants;
    return;
  }
  state.company = $('company').value;
  state.variants = $('variants').checked;
  resetGame();
}

function findMatches(input) {
  return pool.filter(character => [character.name, character.label, character.english, ...character.aliases]
    .some(alias => normalize(alias) === input));
}

function submitAnswer(event) {
  event.preventDefault();
  if (!data || composing) return;
  const input = normalize($('answer').value);
  if (!input) return;
  const matches = findMatches(input);
  if (matches.length > 1) {
    message('같은 이름의 니케가 여럿입니다. 이름(제조사)로 입력하거나 제조사를 선택해 주세요.');
    return;
  }
  if (!matches.length) {
    message('해당하는 니케를 찾지 못했어요. 이름과 이격명, 제조사 설정을 확인해 주세요.');
    return;
  }
  const character = matches[0];
  if (state.solved.includes(character.id) || state.revealed.includes(character.id)) {
    message('이미 맞혔거나 정답을 공개한 니케입니다.');
    return;
  }
  state.solved.push(character.id);
  save();
  render();
  if (!complete()) message(`${character.label} · 정답입니다!`);
  $('answer').value = '';
  $('answer').focus();
}

function tick() {
  const now = Date.now();
  if (!document.hidden && !complete()) {
    state.elapsed += Math.max(0, Math.floor((now - lastTick) / 1000));
    clock();
    save();
  }
  lastTick = now;
}

$('company').addEventListener('change', changeSetting);
$('variants').addEventListener('change', changeSetting);
$('reset').addEventListener('click', () => { if (data && confirm('진행 기록을 지우고 다시 시작할까요?')) resetGame(); });
$('answer-form').addEventListener('submit', submitAnswer);
$('answer').addEventListener('compositionstart', () => { composing = true; });
$('answer').addEventListener('compositionend', () => { composing = false; });
document.addEventListener('visibilitychange', () => { lastTick = Date.now(); });

const ready = fetch('characters.json')
  .then(response => { if (!response.ok) throw new Error('Data request failed'); return response.json(); })
  .then(result => {
    if (!Array.isArray(result.characters) || !result.characters.length || !result.companies) throw new Error('Invalid roster');
    data = result;
    restore();
    Object.entries(data.companies).forEach(([company, name]) => {
      const option = document.createElement('option');
      option.value = company;
      option.textContent = name;
      $('company').append(option);
    });
    $('company').value = state.company;
    $('variants').checked = state.variants;
    ['answer', 'submit', 'reset'].forEach(id => { $(id).disabled = false; });
    const date = new Date(data.collectedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    $('data-info').textContent = `도감 수집: ${date} · ${data.characters.length}종 · ${Object.keys(data.companies).length}개 제조사 · 출처에 반영된 도감 기준`;
    message('이름을 입력하고 Enter를 눌러주세요. 예: 라피, 라피 : 레드 후드');
    render();
    lastTick = Date.now();
    setInterval(tick, 1000);
  })
  .catch(() => message('니케 데이터를 불러오지 못했습니다. 연결을 확인한 뒤 새로고침해 주세요.'));
