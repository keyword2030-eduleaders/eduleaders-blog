/**
 * 에듀리더스 블로그 자동 게시 도구 (Google Apps Script)
 * - GitHub 저장소(posts/<slug>/)에서 post.html, meta.json을 읽어
 *   Blogger API로 게시합니다.
 * - 한글 제목 글의 주소가 blog-post.html로 정해지는 문제를 피하려고
 *   영문 제목(slugTitle)으로 먼저 게시한 뒤 한글 제목으로 바꿉니다.
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

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || p.key !== secret) return json_({ ok: false, error: '인증 실패' });
    var action = p.action || 'ping';
    if (action === 'ping') {
      var b = api_('get', '', null);
      return json_({ ok: true, blog: b.name, url: b.url, posts: b.posts && b.posts.totalItems });
    }
    if (action === 'publish') return json_(publish_(p.slug, p.ref, false));
    if (action === 'draft') return json_(publish_(p.slug, p.ref, true));
    if (action === 'update') return json_(update_(p.postId, p.slug, p.ref));
    if (action === 'get') {
      var post = api_('get', '/posts/' + p.postId + '?view=ADMIN', null);
      return json_({ ok: true, id: post.id, title: post.title, url: post.url, status: post.status, labels: post.labels || [] });
    }
    return json_({ ok: false, error: '알 수 없는 작업: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function publish_(slug, ref, asDraft) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('slug가 올바르지 않습니다');
  var meta = JSON.parse(gh_(slug, 'meta.json', ref));
  var html = gh_(slug, 'post.html', ref);
  if (!meta.title || !meta.slugTitle) throw new Error('meta.json에 title, slugTitle이 필요합니다');

  // 1) 영문 제목으로 게시(또는 초안) → 주소가 영문으로 정해짐
  var body = { kind: 'blogger#post', title: meta.slugTitle, content: html, labels: meta.labels || [] };
  var created = api_('post', '/posts/?isDraft=' + (asDraft ? 'true' : 'false'), body);

  var result = { ok: true, id: created.id, status: created.status, url: created.url, slugUrl: created.url };
  if (asDraft) {
    result.note = '초안으로 저장했습니다. 영문 주소는 게시할 때 정해집니다.';
    api_('patch', '/posts/' + created.id, { title: meta.title });
    result.title = meta.title;
    return result;
  }
  // 2) 한글 제목으로 변경 (주소는 유지)
  var patched = api_('patch', '/posts/' + created.id, { title: meta.title });
  result.title = patched.title;
  result.url = patched.url;
  return result;
}

function update_(postId, slug, ref) {
  if (!postId) throw new Error('postId가 필요합니다');
  var meta = JSON.parse(gh_(slug, 'meta.json', ref));
  var html = gh_(slug, 'post.html', ref);
  var patched = api_('patch', '/posts/' + postId, { title: meta.title, content: html, labels: meta.labels || [] });
  return { ok: true, id: patched.id, title: patched.title, url: patched.url };
}

function gh_(slug, file, ref) {
  var url = 'https://raw.githubusercontent.com/' + CONFIG.GH_OWNER + '/' + CONFIG.GH_REPO + '/' +
    (ref || CONFIG.GH_BRANCH) + '/posts/' + slug + '/' + file + '?t=' + Date.now();
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('GitHub 파일을 읽지 못했습니다: ' + file + ' (' + res.getResponseCode() + ')');
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
