/**
 * 에듀리더스 블로그 자동 게시 도구 (Google Apps Script) v2
 * - GitHub 저장소(posts/<slug>/)에서 post.html, meta.json을 읽어 Blogger API로 게시합니다.
 * - 한글 제목 글의 주소가 blog-post.html로 정해지는 문제를 피하려고
 *   영문 제목(slugTitle)으로 먼저 게시한 뒤 한글 제목으로 바꿉니다.
 * - 웹앱 주소를 action 없이 열면 관리 화면(Admin.html)이 나옵니다.
 */
var CONFIG = {
  BLOG_ID: '5456356178361848681',
  GH_OWNER: 'keyword2030-eduleaders',
  GH_REPO: 'eduleaders-blog',
  GH_BRANCH: 'main'
};
var API = 'https://www.googleapis.com/blogger/v3/blogs/' + CONFIG.BLOG_ID;

/** 처음 한 번 실행: 비밀 키를 만들고 Blogger 연결을 확인합니다. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('SECRET');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SECRET', key);
  }
  var blog = api_('get', '', null);
  Logger.log('블로그: ' + blog.name + ' / 비밀 키: ' + key);
  return key;
}

/* ---------- 웹앱 진입점 ---------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) {
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('에듀리더스 블로그 게시 관리')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  try {
    return json_(run_(p.key, p.action, p));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** 관리 화면에서 google.script.run으로 부르는 함수 */
function adminCall(key, action, params) {
  try {
    return run_(key, action, params || {});
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function run_(key, action, p) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || key !== secret) return { ok: false, error: '인증 실패' };
  switch (action) {
    case 'ping':
      var b = api_('get', '', null);
      return { ok: true, blog: b.name, url: b.url, posts: b.posts && b.posts.totalItems };
    case 'list':    return listRepo_();
    case 'recent':  return recent_();
    case 'preview': return preview_(p.slug);
    case 'draft':   return publish_(p.slug, p.ref, true);
    case 'publish': return publish_(p.slug, p.ref, false);
    case 'update':  return update_(p.postId || (map_()[p.slug] || {}).id, p.slug, p.ref);
    case 'get':
      var post = api_('get', '/posts/' + p.postId + '?view=ADMIN', null);
      return { ok: true, id: post.id, title: post.title, url: post.url, status: post.status, labels: post.labels || [] };
    default:
      return { ok: false, error: '알 수 없는 작업: ' + action };
  }
}

/* ---------- 게시 기능 ---------- */

function publish_(slug, ref, asDraft) {
  checkSlug_(slug);
  var meta = JSON.parse(gh_(slug, 'meta.json', ref));
  var html = gh_(slug, 'post.html', ref);
  if (!meta.title || !meta.slugTitle) throw new Error('meta.json에 title, slugTitle이 필요합니다');
  var known = map_()[slug];

  if (known && known.status === 'LIVE') {
    throw new Error('이미 게시된 글입니다. 내용을 바꾸려면 "수정 반영"을 쓰세요. (글 번호 ' + known.id + ')');
  }

  var post;
  if (known && known.status === 'DRAFT') {
    // 초안이 있으면 최신 내용으로 바꾼 뒤 그 초안을 게시
    post = api_('patch', '/posts/' + known.id, { title: meta.slugTitle, content: html, labels: meta.labels || [] });
    if (asDraft) {
      remember_(slug, post.id, 'DRAFT');
      return { ok: true, id: post.id, status: 'DRAFT', title: post.title, note: '기존 초안을 최신 내용으로 바꿨습니다.' };
    }
    post = api_('post', '/posts/' + known.id + '/publish', null);
  } else {
    // 영문 제목으로 새로 만듦 → 게시할 때 주소가 영문으로 정해짐
    var body = { kind: 'blogger#post', title: meta.slugTitle, content: html, labels: meta.labels || [] };
    post = api_('post', '/posts/?isDraft=' + (asDraft ? 'true' : 'false'), body);
    if (asDraft) {
      remember_(slug, post.id, 'DRAFT');
      return { ok: true, id: post.id, status: 'DRAFT', title: post.title,
               note: '초안으로 저장했습니다. 주소가 영문으로 정해지도록 제목은 게시 전까지 영문으로 둡니다.' };
    }
  }

  // 주소가 정해진 뒤 한글 제목으로 변경 (주소는 유지)
  var slugUrl = post.url;
  var patched = api_('patch', '/posts/' + post.id, { title: meta.title });
  remember_(slug, post.id, 'LIVE', patched.url);
  return { ok: true, id: post.id, status: 'LIVE', title: patched.title, url: patched.url, slugUrl: slugUrl,
           searchDescription: meta.searchDescription || '' };
}

function update_(postId, slug, ref) {
  if (!postId) throw new Error('이 글의 글 번호를 모릅니다. postId를 함께 보내 주세요.');
  checkSlug_(slug);
  var meta = JSON.parse(gh_(slug, 'meta.json', ref));
  var html = gh_(slug, 'post.html', ref);
  var cur = api_('get', '/posts/' + postId + '?view=ADMIN', null);
  var title = cur.status === 'DRAFT' ? meta.slugTitle : meta.title;   // 초안은 영문 제목 유지
  var patched = api_('patch', '/posts/' + postId, { title: title, content: html, labels: meta.labels || [] });
  remember_(slug, postId, cur.status === 'DRAFT' ? 'DRAFT' : 'LIVE', patched.url);
  return { ok: true, id: patched.id, title: patched.title, url: patched.url, status: cur.status };
}

/* ---------- 관리 화면용 조회 ---------- */

function listRepo_() {
  var idx = [];
  try { idx = JSON.parse(ghRaw_('posts/index.json')); } catch (e) { idx = []; }
  var m = map_();
  idx.forEach(function (x) {
    var k = m[x.slug];
    x.postId = k ? k.id : '';
    x.status = k ? k.status : 'NEW';
    x.url = k ? (k.url || '') : '';
  });
  return { ok: true, posts: idx };
}

function recent_() {
  var res = api_('get', '/posts?view=ADMIN&status=LIVE&status=DRAFT&status=SCHEDULED&maxResults=15&fetchBodies=false&orderBy=UPDATED', null);
  var items = (res.items || []).map(function (p) {
    return { id: p.id, title: p.title, status: p.status, url: p.url || '', updated: p.updated, labels: p.labels || [] };
  });
  return { ok: true, items: items };
}

function preview_(slug) {
  checkSlug_(slug);
  return { ok: true, meta: JSON.parse(gh_(slug, 'meta.json')), html: gh_(slug, 'post.html') };
}

/* ---------- 내부 도우미 ---------- */

function checkSlug_(slug) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('slug가 올바르지 않습니다: ' + slug);
}

/** slug → {id, status, url} 기록 (스크립트 속성 POSTMAP) */
function map_() {
  var raw = PropertiesService.getScriptProperties().getProperty('POSTMAP');
  return raw ? JSON.parse(raw) : {};
}
function remember_(slug, id, status, url) {
  var m = map_();
  m[slug] = { id: String(id), status: status, url: url || (m[slug] && m[slug].url) || '' };
  PropertiesService.getScriptProperties().setProperty('POSTMAP', JSON.stringify(m));
}

function gh_(slug, file, ref) {
  return ghRaw_('posts/' + slug + '/' + file, ref);
}
function ghRaw_(path, ref) {
  var url = 'https://raw.githubusercontent.com/' + CONFIG.GH_OWNER + '/' + CONFIG.GH_REPO + '/' +
    (ref || CONFIG.GH_BRANCH) + '/' + path + '?t=' + Date.now();
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('GitHub 파일을 읽지 못했습니다: ' + path + ' (' + res.getResponseCode() + ')');
  return res.getContentText('UTF-8');
}

function api_(method, path, body) {
  var opt = {
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
    contentType: 'application/json'
  };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(API + path, opt);
  var code = res.getResponseCode();
  var text = res.getContentText('UTF-8');
  if (code >= 300) throw new Error('Blogger API ' + code + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
